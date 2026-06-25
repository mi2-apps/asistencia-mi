import { useState } from "react";
import { BookOpen } from "lucide-react";
import { cn } from "@client/lib/utils";

const SECTIONS = [
  {
    id: "asistencia",
    title: "Módulo de Asistencia",
    content: [
      { heading: "¿Qué hace?", text: "Registra la asistencia diaria de todos los colaboradores activos. Puede registrarse como Presente o con uno de los 10 tipos de inasistencia." },
      { heading: "Cómo registrar asistencia", text: "1. Selecciona el departamento en la vista principal.\n2. En la tabla, haz clic en «Presente» o «Inasistencia» frente al nombre del colaborador.\n3. Para inasistencias, selecciona el tipo (FI, FJ, PSG, etc.) y agrega notas opcionales.\n4. Una vez registrado, el colaborador desaparece de la vista del día y reaparece al día siguiente." },
      { heading: "Tipos de inasistencia", text: "FI = Falta Injustificada · FJ = Falta Justificada · PSG = Permiso Sin Goce · PCG = Permiso Con Goce · Suspension · Vacaciones · IT = Incapacidad por Trabajo · RET = Retardo · CUM = Cumpleaños · FES = Festivo" },
      { heading: "Limpiar día (solo Admin)", text: "El botón «Limpiar día» elimina todos los registros de asistencia de hoy. Úsalo solo en casos excepcionales." },
    ],
  },
  {
    id: "historial",
    title: "Módulo de Historial",
    content: [
      { heading: "¿Qué hace?", text: "Muestra la asistencia semanal (Lunes a Sábado) y el tiempo extra de todos los colaboradores activos. Al cargar siempre muestra la semana actual." },
      { heading: "Navegar semanas", text: "Usa los botones «<» y «>» para navegar entre semanas. El botón «>» se desactiva en la semana actual para evitar registros futuros." },
      { heading: "Filtros", text: "Puedes combinar tres filtros independientes:\n• Buscador de texto — filtra por nombre, nómina o puesto.\n• Departamento — muestra solo colaboradores de ese departamento.\n• Turno — muestra solo los turnos que tienen registros en la semana visualizada." },
      { heading: "Tabs: Asistencia / Tiempo Extra", text: "Debajo de las tarjetas KPI hay dos pestañas:\n• Asistencia Semanal — tabla Lunes–Sábado con el estado diario de cada colaborador.\n• Tiempo Extra — tabla con las horas extra registradas por día. Solo aparecen colaboradores con registros en esa semana. La pestaña muestra un contador con el total de colaboradores con tiempo extra." },
      { heading: "Interpretar la tabla de asistencia", text: "✓ verde = Presente. Un código (FI, FJ, etc.) en color = inasistencia del tipo indicado. Guión (—) = sin registro ese día." },
      { heading: "Resumen de colaborador", text: "Haz clic en cualquier fila (en cualquiera de las dos pestañas) para abrir un panel con:\n• Datos del colaborador: foto, nombre, puesto, departamento, número de nómina y turno.\n• Asistencia día a día de la semana visualizada con el estado completo y notas.\n• Resumen: total de presentes, inasistencias y días sin registro." },
    ],
  },
  {
    id: "colaboradores",
    title: "Módulo de Colaboradores",
    content: [
      { heading: "¿Qué hace?", text: "Gestiona el catálogo de colaboradores activos, organizados por departamento." },
      { heading: "Buscar colaboradores", text: "El buscador en la parte superior filtra en todos los departamentos simultáneamente. Al estar dentro de un departamento, filtra solo ese departamento." },
      { heading: "Editar un colaborador", text: "Haz clic en el ícono de lápiz (✏) en la tarjeta del colaborador. Modifica los campos deseados y haz clic en «Guardar».\n\nPara cambiar la foto de perfil: dentro del modal de edición, pasa el cursor sobre el avatar y haz clic en el ícono de cámara que aparece. Selecciona una imagen desde tu equipo — la foto se sube de inmediato (sin necesidad de guardar el formulario)." },
      { heading: "Dar de baja", text: "Haz clic en el ícono de baja (👤-) en la tarjeta. Se requiere seleccionar el Tipo de baja (obligatorio), la Fecha de baja y opcionalmente un Motivo. El colaborador pasa al módulo de Bajas." },
    ],
  },
  {
    id: "agregar",
    title: "Agregar Colaborador",
    content: [
      { heading: "¿Qué hace?", text: "Permite registrar un nuevo colaborador en el sistema con todos sus datos." },
      { heading: "Campos requeridos", text: "Nombre, Apellido y Departamento son obligatorios. El resto de campos (Puesto, Turno, Número de Empleado, Fecha de Ingreso, Foto de Perfil) son opcionales." },
      { heading: "Departamento y Puesto", text: "Ambos campos son combobox buscables — empieza a escribir para filtrar las opciones disponibles." },
      { heading: "Número de empleado único", text: "Si capturas un número de empleado, el sistema verifica que no esté duplicado antes de guardar." },
    ],
  },
  {
    id: "bajas",
    title: "Módulo de Bajas",
    content: [
      { heading: "¿Qué hace?", text: "Muestra los colaboradores que han sido dados de baja, organizados por departamento. Los contadores incluyen departamentos con 0 bajas." },
      { heading: "Reactivar un colaborador", text: "Dentro del departamento, haz clic en «Reactivar» en la tarjeta del colaborador. Esto limpia la fecha de baja, tipo de baja y motivo, y lo mueve de vuelta a Colaboradores activos." },
    ],
  },
  {
    id: "tiempo-extra",
    title: "Módulo de Tiempo Extra",
    content: [
      { heading: "¿Qué hace?", text: "Registra y consulta el tiempo extra trabajado por los colaboradores, organizado por departamento." },
      { heading: "Registrar tiempo extra", text: "1. Selecciona el departamento.\n2. Elige «Registrar Tiempo Extra».\n3. Busca al colaborador por nombre o nómina.\n4. Captura la fecha, hora de inicio, hora de fin (las horas totales se calculan automáticamente), área donde trabajó, motivo y quién autorizó.\n5. Haz clic en «Registrar Tiempo Extra»." },
      { heading: "Historial de Tiempo Extra", text: "Dentro de cada departamento, elige «Historial de Tiempo Extra» para ver los registros agrupados por semana. Haz clic en una semana para ver el detalle de cada colaborador con todos sus datos." },
      { heading: "Buscador en el detalle", text: "Dentro del detalle de una semana, puedes filtrar por nombre o número de nómina para encontrar rápidamente un registro específico." },
      { heading: "Descargar PDF", text: "En el detalle de una semana (cuando hay registros), aparece el botón «Descargar PDF» en la esquina superior derecha. Genera un reporte oficial en formato PDF con logo MI Technologies, datos del área, tabla de colaboradores con horas por día y líneas de firma para autorización." },
    ],
  },
  {
    id: "usuarios",
    title: "Módulo de Usuarios",
    content: [
      { heading: "¿Qué hace?", text: "Gestiona los usuarios del sistema (administradores y usuarios estándar). Solo visible para administradores." },
      { heading: "Crear usuario", text: "Haz clic en «Nuevo». El username se genera automáticamente como nombre.apellido (sin acentos). Si ya existe, se añade un sufijo numérico (p. ej. juan.garcia2)." },
      { heading: "Roles", text: "«Admin» tiene acceso a todos los módulos. «Usuario» solo puede ver Asistencia e Historial." },
      { heading: "Protección del administrador", text: "El usuario «admin» no puede ser eliminado del sistema." },
      { heading: "Inicio de sesión", text: "Una vez desplegada la app en producción, el acceso se realiza con las credenciales de cuenta MI Global (mismo usuario y contraseña que usas en Nextcloud y correo)." },
    ],
  },
];

export default function UserManual() {
  const [activeSection, setActiveSection] = useState(SECTIONS[0]!.id);
  const section = SECTIONS.find((s) => s.id === activeSection)!;

  return (
    <div className="p-6 flex gap-6 max-w-4xl">
      {/* TOC */}
      <aside className="w-44 flex-shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen size={15} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Módulos</span>
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
              {s.title.replace("Módulo de ", "")}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h2 className="text-xl font-semibold mb-5">{section.title}</h2>
        <div className="space-y-5">
          {section.content.map((item) => (
            <div key={item.heading}>
              <h3 className="text-sm font-semibold mb-1.5">{item.heading}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
