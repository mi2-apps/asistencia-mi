# backup-db.ps1
# Backup diario de PostgreSQL → Nextcloud
# Retiene los últimos 30 días y borra los más antiguos automáticamente.

$ErrorActionPreference = "Stop"

# ─── Configuración ────────────────────────────────────────────────────────────
$PG_DUMP     = "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe"
$DB_NAME     = "calidad_mitechnologies"
$DB_USER     = "postgres"
$DB_HOST     = "localhost"
$DB_PORT     = "5432"
$DB_PASS     = "dLp173Vb"

$NC_BASE     = "https://cloud.miglobal.com.mx/remote.php/dav/files/leonel.hernandez"
$NC_FOLDER   = "Backups/asistencia-mi"
$NC_URL      = "$NC_BASE/$NC_FOLDER"
$NC_USER     = "leonel.hernandez"
$NC_PASS     = "rxSvqyAPCpnqE1dKK7b4feK2jCieMgE0PWRIJaBL7Txw0ifVAHEyisLzRYfVcEAeIAc9ZRgW"

$RETAIN_DAYS = 30
# ──────────────────────────────────────────────────────────────────────────────

$TIMESTAMP  = Get-Date -Format "yyyy-MM-dd_HHmmss"
$FILENAME   = "backup_${DB_NAME}_${TIMESTAMP}.sql"
$LOCAL_FILE = "$env:TEMP\$FILENAME"

$authBytes  = [Text.Encoding]::ASCII.GetBytes("${NC_USER}:${NC_PASS}")
$authHeader = "Basic " + [Convert]::ToBase64String($authBytes)
$headers    = @{ Authorization = $authHeader }

function Write-Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$ts] $msg"
}

# ─── 1. Generar backup ────────────────────────────────────────────────────────
Write-Log "Generando backup de '$DB_NAME'..."
$env:PGPASSWORD = $DB_PASS
& $PG_DUMP -h $DB_HOST -p $DB_PORT -U $DB_USER -F p -f $LOCAL_FILE $DB_NAME
if ($LASTEXITCODE -ne 0) { throw "pg_dump falló con código $LASTEXITCODE" }
$sizeMB = [Math]::Round((Get-Item $LOCAL_FILE).Length / 1MB, 2)
Write-Log "Backup generado: $FILENAME ($sizeMB MB)"

# ─── 2. Crear carpeta remota si no existe ─────────────────────────────────────
Write-Log "Verificando carpeta remota en Nextcloud..."
try {
    Invoke-WebRequest -Uri $NC_URL -Method MKCOL -Headers $headers -UseBasicParsing | Out-Null
    Write-Log "Carpeta creada: $NC_FOLDER"
} catch {
    # 405 = ya existe, ignorar
    if ($_.Exception.Response.StatusCode.value__ -ne 405) {
        Write-Log "Advertencia al crear carpeta: $_"
    }
}

# ─── 3. Subir backup a Nextcloud ──────────────────────────────────────────────
Write-Log "Subiendo a Nextcloud..."
$fileBytes = [IO.File]::ReadAllBytes($Local_File)
$uploadHeaders = $headers + @{ "Content-Type" = "application/octet-stream" }
Invoke-WebRequest -Uri "$NC_URL/$FILENAME" -Method PUT -Headers $uploadHeaders -Body $fileBytes -UseBasicParsing | Out-Null
Write-Log "Subido correctamente: $FILENAME"

# ─── 4. Limpiar archivo local temporal ───────────────────────────────────────
Remove-Item $Local_File -Force
Write-Log "Archivo local eliminado."

# ─── 5. Borrar backups viejos (> 30 días) ────────────────────────────────────
Write-Log "Revisando backups antiguos (retención: $RETAIN_DAYS días)..."
$cutoff = (Get-Date).AddDays(-$RETAIN_DAYS)

$propfind = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>'
$listHeaders = $headers + @{ Depth = "1"; "Content-Type" = "application/xml" }

try {
    $response = Invoke-WebRequest -Uri $NC_URL -Method PROPFIND -Headers $listHeaders -Body $propfind -UseBasicParsing
    [xml]$xml = $response.Content

    foreach ($entry in $xml.multistatus.response) {
        $href = $entry.href
        $name = [IO.Path]::GetFileName([Uri]::UnescapeDataString($href.TrimEnd('/')))

        if ($name -match "^backup_${DB_NAME}_(\d{4}-\d{2}-\d{2})_") {
            $fileDate = [DateTime]::ParseExact($Matches[1], "yyyy-MM-dd", $null)
            if ($fileDate -lt $cutoff) {
                $deleteUrl = "https://cloud.miglobal.com.mx$href"
                Invoke-WebRequest -Uri $deleteUrl -Method DELETE -Headers $headers -UseBasicParsing | Out-Null
                Write-Log "Eliminado backup antiguo: $name"
            }
        }
    }
} catch {
    Write-Log "Advertencia al revisar backups antiguos: $_"
}

Write-Log "✓ Backup completado exitosamente: $FILENAME"
