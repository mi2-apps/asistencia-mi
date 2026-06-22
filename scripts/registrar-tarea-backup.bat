@echo off
powershell -ExecutionPolicy Bypass -Command "$arg = '-NonInteractive -ExecutionPolicy Bypass -File \"C:\Proyectos Claude\asistencia-mi\scripts\backup-db.ps1\"'; $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg; $trigger = New-ScheduledTaskTrigger -Daily -At '09:00'; $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable; Register-ScheduledTask -TaskName 'Backup BD asistencia-mi' -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force"
if %errorlevel% equ 0 (
    echo.
    echo Tarea registrada correctamente. El backup correra cada dia a las 9:00 AM.
) else (
    echo.
    echo Error al registrar la tarea.
)
pause
