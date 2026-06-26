import { useState } from "react";
import { FileCode } from "lucide-react";
import { cn } from "@client/lib/utils";

const SECTIONS = [
  {
    id: "overview",
    title: "Resumen de la App",
    content: `**asistencia-mi** — Control de Asistencia MI Technologies

Stack: React 18 + TypeScript + Vite 5 + Tailwind 3 + shadcn/ui (frontend) · Express + Drizzle ORM + pg (backend) · PostgreSQL 16 · Coolify.

Versión: 1.2.0
Base de datos: calidad_mitechnologies
Puerto por defecto: 3000 (Express sirve tanto la API como el SPA compilado)

Autenticación: Passport.js con estrategia OIDC (Nextcloud como IdP). En modo dev (OIDC_CLIENT_ID vacío) se habilita un formulario de login local contra la tabla usuarios con bcrypt.`,
  },
  {
    id: "env",
    title: "Variables de Entorno",
    content: `DATABASE_URL
  Cadena de conexión PostgreSQL.
  Ej: postgresql://postgres:password@localhost:5432/calidad_mitechnologies

SESSION_SECRET
  Secreto para firmar la cookie de sesión. Mínimo 32 caracteres en producción.

OIDC_ISSUER_URL
  URL base del proveedor OIDC. Ej: https://cloud.miglobal.com.mx

OIDC_CLIENT_ID
  Client ID asignado por IT. Dejar vacío activa el modo dev con login local.

OIDC_CLIENT_SECRET
  Client secret asignado por IT.

OIDC_REDIRECT_URI
  URL completa del callback. Ej: https://asistencia.mi2.com.mx/auth/callback

PORT
  Puerto en que escucha Express. Default: 3000.

NODE_ENV
  "development" o "production". En producción activa cookies secure y deshabilita CORS amplio.`,
  },
  {
    id: "schema-usuarios",
    title: "Tabla: usuarios",
    content: `Almacena las cuentas de acceso al sistema.

Columnas:
  id               SERIAL PK
  username         VARCHAR(60) UNIQUE NOT NULL  — generado como nombre.apellido
  password         TEXT NOT NULL                — hash bcrypt (solo usado en dev mode)
  nombre           VARCHAR(100) NOT NULL
  apellido         VARCHAR(100) NOT NULL
  role             VARCHAR(20) DEFAULT 'usuario' — valores: 'admin' | 'usuario'
  turno            VARCHAR(20)
  departamento     VARCHAR(100)
  puesto           VARCHAR(100)
  numero_empleado  VARCHAR(20)
  fecha_ingreso    DATE
  foto_perfil      TEXT                         — ruta relativa bajo /uploads/
  nextcloud_sub    VARCHAR(255) UNIQUE           — sub claim del OIDC, vincula cuenta Nextcloud
  created_at       TIMESTAMP DEFAULT NOW()
  updated_at       TIMESTAMP DEFAULT NOW()

Reglas de negocio:
  • El usuario con username='admin' no puede ser eliminado (protección en el endpoint DELETE).
  • En producción, nextcloud_sub se rellena en el callback OIDC y es el identificador real.
  • En dev mode, la autenticación usa bcrypt contra la columna password.`,
  },
  {
    id: "schema-colaboradores",
    title: "Tabla: colaboradores",
    content: `Catálogo de empleados de la empresa. No confundir con usuarios (cuentas del sistema).

Columnas:
  id               SERIAL PK
  nombre           VARCHAR(100) NOT NULL
  apellido         VARCHAR(100) NOT NULL
  departamento     VARCHAR(100) NOT NULL
  puesto           VARCHAR(100)
  turno            VARCHAR(20)
  numero_empleado  VARCHAR(20)               — UNIQUE cuando no es NULL (índice parcial)
  fecha_ingreso    DATE
  foto_perfil      TEXT
  activo           BOOLEAN NOT NULL DEFAULT TRUE
  fecha_baja       DATE
  tipo_baja        VARCHAR(60)               — ver enums en shared/constants.ts
  motivo_baja      TEXT
  created_at       TIMESTAMP DEFAULT NOW()
  updated_at       TIMESTAMP DEFAULT NOW()

Índice parcial:
  colaboradores_numero_empleado_unique_idx ON numero_empleado WHERE numero_empleado IS NOT NULL

Soft-delete:
  Los colaboradores nunca se borran. La baja se registra con activo=false + fecha_baja + tipo_baja.
  La reactivación limpia esos tres campos y pone activo=true.`,
  },
  {
    id: "schema-asistencia",
    title: "Tabla: asistencia",
    content: `Registro diario de asistencia. Una fila por persona por día.

Columnas:
  id                 SERIAL PK
  fecha              DATE NOT NULL
  estado             VARCHAR(30) NOT NULL DEFAULT 'Presente'
                     — valores en DB: 'presente' | 'inasistencia' (minúsculas)
                     — al leer se usa INITCAP() para devolver 'Presente' | 'Inasistencia'
  tipo_inasistencia  VARCHAR(30)           — FI | FJ | PSG | PCG | Suspension | Vacaciones | IT | RET | CUM | FES
  notas              TEXT
  usuario_id         INTEGER → usuarios(id) ON DELETE CASCADE   (nullable)
  colaborador_id     INTEGER → colaboradores(id) ON DELETE CASCADE (nullable)
  registrado_por     VARCHAR(60) NOT NULL  — username de quien hizo el registro
  created_at         TIMESTAMP DEFAULT NOW()

Constraint XOR:
  CHECK ((usuario_id IS NOT NULL)::int + (colaborador_id IS NOT NULL)::int = 1)
  Exactamente uno de los dos debe estar presente.

Índice: asistencia_fecha_idx ON fecha

Comportamiento del POST (idempotente):
  Si ya existe fila para (colaborador_id, fecha) → UPDATE.
  Si no existe → INSERT.
  Usa SELECT ... FOR UPDATE dentro de una transacción para evitar race conditions.

Timezone:
  PostgreSQL corre en GMT. Las fechas del día actual se calculan con:
  (NOW() AT TIME ZONE 'America/Mexico_City')::date
  El cliente usa toLocalISO() (lib/utils.ts) para enviar la fecha local, no UTC.`,
  },
  {
    id: "schema-tiempo-extra",
    title: "Tabla: tiempo_extra",
    content: `Registro de horas extra por colaborador.

Columnas:
  id               SERIAL PK
  colaborador_id   INTEGER NOT NULL → colaboradores(id) ON DELETE CASCADE
  fecha            DATE NOT NULL
  hora_inicio      VARCHAR(5) NOT NULL   — formato HH:MM
  hora_fin         VARCHAR(5) NOT NULL   — formato HH:MM
  horas_totales    NUMERIC(4,2) NOT NULL — calculado en el cliente: (fin - inicio) en horas decimales
  area             VARCHAR(100) NOT NULL
  motivo           TEXT NOT NULL
  autorizado_por   VARCHAR(100) NOT NULL
  registrado_por   VARCHAR(60) NOT NULL  — username de quien registró
  created_at       TIMESTAMP DEFAULT NOW()

Índices:
  idx_tiempo_extra_colaborador ON colaborador_id
  idx_tiempo_extra_fecha       ON fecha

Agrupación por semana (endpoint /semanas):
  Usa EXTRACT(WEEK FROM fecha) y EXTRACT(YEAR FROM fecha) para ISO weeks.
  DATE_TRUNC('week', fecha) devuelve el lunes de la semana.`,
  },
  {
    id: "schema-session",
    title: "Tabla: session",
    content: `Tabla de sesiones gestionada automáticamente por connect-pg-simple.

Columnas:
  sid     VARCHAR PK
  sess    TEXT NOT NULL    — JSON de la sesión serializado
  expire  TIMESTAMP(6) NOT NULL

Creación automática:
  Se crea automáticamente al arrancar el servidor si no existe
  (createTableIfMissing: true en la configuración de connect-pg-simple).

No se gestiona manualmente. Las sesiones expiran en 8 horas (maxAge: 8h).`,
  },
  {
    id: "api",
    title: "Endpoints API",
    content: `Todos los endpoints requieren sesión activa (requireAuth).
Los marcados con [admin] requieren role='admin' (requireAdmin).

AUTH
  GET  /auth/login          — formulario dev (solo si OIDC no configurado)
  POST /auth/dev-login      — login local con username/password
  GET  /auth/callback       — callback OIDC (solo si OIDC configurado)
  GET  /auth/logout         — destruye sesión, redirige a /auth/login
  GET  /api/v1/auth/me      — devuelve usuario autenticado actual

USUARIOS [admin]
  GET    /api/v1/usuarios
  POST   /api/v1/usuarios
  PUT    /api/v1/usuarios/:id
  DELETE /api/v1/usuarios/:id

COLABORADORES
  GET    /api/v1/colaboradores               — [módulo:colaboradores] activos | [módulo:bajas] con ?activo=false
  POST   /api/v1/colaboradores              [módulo:agregar_colaborador]
  PUT    /api/v1/colaboradores/:id          [requireAuth]
  PATCH  /api/v1/colaboradores/:id/estado   [módulo:bajas] — body: { activo: false, tipo_baja, fecha_baja } | { activo: true }
  DELETE /api/v1/colaboradores/:id          [admin]
  POST   /api/v1/colaboradores/:id/foto     [requireAuth] — multipart/form-data, campo "foto"

ASISTENCIA
  GET  /api/v1/asistencia/reporte      — [módulo:asistencia] colaboradores activos con asistencia de hoy
  GET  /api/v1/asistencia/semana       — [módulo:historial] ?inicio=YYYY-MM-DD&fin=YYYY-MM-DD
  POST /api/v1/asistencia              — registrar (idempotente)
  DELETE /api/v1/asistencia/hoy        [admin] — limpiar registros de hoy

TIEMPO EXTRA
  GET  /api/v1/tiempo-extra/stats      — conteo por departamento
  GET  /api/v1/tiempo-extra/semanas    — ?departamento=X — agrupado por semana ISO
  GET  /api/v1/tiempo-extra            — ?departamento=X&inicio=YYYY-MM-DD&fin=YYYY-MM-DD
  POST /api/v1/tiempo-extra            — crear registro
  DELETE /api/v1/tiempo-extra/:id      [admin]`,
  },
  {
    id: "permisos",
    title: "Sistema de Permisos",
    content: `Los permisos se almacenan en la columna permisos (JSONB) de la tabla usuarios
como Record<string, string[]>. Los admins omiten toda verificación de módulo.

MÓDULOS DISPONIBLES (clave → comportamiento)
  asistencia          — con selección de departamentos
  historial           — on/off (sin selección de depts)
  colaboradores       — con selección de departamentos
  agregar_colaborador — on/off (sin selección de depts)
  bajas               — con selección de departamentos
  tiempo_extra        — con selección de departamentos

VALORES DE LA LISTA DE DEPARTAMENTOS
  ["*"]              → acceso a todos los departamentos
  ["Sorting","FFT"]  → acceso solo a esos departamentos
  ausente / []       → sin acceso al módulo

MIDDLEWARE (server/middleware/auth.ts)
  requireModulo(modulo)
    — Devuelve 403 si el usuario no es admin y no tiene la clave en permisos.

  getAllowedDepts(user, modulo): string[] | null
    — null    → todos los departamentos (admin o permisos["*"])
    — []      → sin acceso (módulo no asignado o lista vacía)
    — [...] → solo esos departamentos

FRONTEND (client/src/stores/authStore.ts)
  canAccess(modulo)    → boolean
  allowedDepts(modulo) → string[] | null

ROUTE GUARDS (client/src/main.tsx)
  <PermGuard modulo="historial">   — redirige a /asistencia si no tiene acceso
  <PermGuard modulo="bajas">
  <PermGuard modulo="agregar_colaborador">
  etc.`,
  },
  {
    id: "migrations",
    title: "Migraciones",
    content: `Las migraciones están en drizzle/ y se ejecutan con Drizzle Kit.

Archivos:
  drizzle/0000_initial.sql     — tablas base (usuarios, colaboradores, asistencia)
  drizzle/0001_tiempo_extra.sql — tabla tiempo_extra e índices

Comandos:
  npx drizzle-kit generate   — genera SQL desde el schema
  npx drizzle-kit migrate    — aplica migraciones pendientes

El schema fuente está en shared/schema.ts.
Los validadores Zod están en shared/validators.ts.
Las constantes (departamentos, puestos, tipos de inasistencia) están en shared/constants.ts.

Regla: cualquier cambio de schema requiere una nueva migración en drizzle/ y
actualizar esta documentación en el mismo commit.`,
  },
  {
    id: "backup",
    title: "Backup",
    content: `Backup automático diario a Nextcloud via WebDAV.

Script: scripts/backup-db.ps1
Tarea: "Backup BD asistencia-mi" en Windows Task Scheduler (9:00 AM diario)

Proceso:
  1. pg_dump de calidad_mitechnologies → archivo .sql.gz con timestamp
  2. Upload via WebDAV a cloud.miglobal.com.mx/remote.php/dav/files/leonel/Backups/asistencia-mi/
  3. Limpieza automática de backups con más de 30 días

Credenciales: App Password de Nextcloud almacenada en el script.
Al migrar a Coolify, mover el script al servidor para cobertura 24/7.`,
  },
];

export default function DeveloperManual() {
  const [activeSection, setActiveSection] = useState(SECTIONS[0]!.id);
  const section = SECTIONS.find((s) => s.id === activeSection)!;

  return (
    <div className="p-6 flex gap-6 max-w-5xl">
      {/* TOC */}
      <aside className="w-52 flex-shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <FileCode size={15} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Secciones</span>
        </div>
        <nav className="space-y-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={cn(
                "w-full text-left text-sm px-3 py-2 rounded-md transition-colors",
                activeSection === s.id
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {s.title}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded font-mono">
            asistencia-mi v1.2.0
          </span>
        </div>
        <h2 className="text-xl font-semibold mb-5">{section.title}</h2>
        <pre className="text-sm text-foreground leading-relaxed whitespace-pre-wrap font-mono bg-muted/40 rounded-lg p-5 border border-border overflow-x-auto">
          {section.content}
        </pre>
      </div>
    </div>
  );
}
