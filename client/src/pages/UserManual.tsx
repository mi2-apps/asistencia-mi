import { useState } from "react";
import { BookOpen } from "lucide-react";
import { cn } from "@client/lib/utils";

const SECTIONS = [
  {
    id: "asistencia",
    title: "Módulo de Asistencia",
    content: [
      { heading: "¿Qué hace?", text: "Registra la asistencia diaria de todos los colaboradores activos. Puede registrarse como Presente o con uno de los 10 tipos de inasistencia." },
      { heading: "Cómo registrar asistencia", text: "1. Selecciona el departamento en la vista principal.\n2. En la tabla, haz clic en «Presente» o «Inasistencia» frente al nombre del colaborador.\n3. Para inasistencias, selecciona el tipo (FI, FJ, PSG, etc.) y agrega notas opcionales." },
      { heading: "Tipos de inasistencia", text: "FI = Falta Injustificada · FJ = Falta Justificada · PSG = Permiso Sin Goce · PCG = Permiso Con Goce · Suspension · Vacaciones · IT = Incapacidad por Trabajo · RET = Retardo · CUM = Cumpleaños · FES = Festivo" },
      { heading: "Limpiar día (solo Admin)", text: "El botón «Limpiar día» elimina todos los registros de asistencia de hoy. Úsalo solo en casos excepcionales." },
    ],
  },
  {
    id: "historial",
    title: "Módulo de Historial",
    content: [
      { heading: "¿Qué hace?", text: "Muestra la asistencia semanal (Lunes a Sábado) de todos los colaboradores activos." },
      { heading: "Navegar semanas", text: "Usa los botones «<» y «>» para navegar entre semanas. El botón «>» se desactiva en la semana actual para evitar registros futuros." },
      { heading: "Interpretar la tabla", text: "✓ verde = Presente. Un código (FI, FJ, etc.) en color = inasistencia del tipo indicado. Guión (—) = sin registro ese día." },
    ],
  },
  {
    id: "colaboradores",
    title: "Módulo de Colaboradores",
    content: [
      { heading: "¿Qué hace?", text: "Gestiona el catálogo de colaboradores activos, organizados por departamento." },
      { heading: "Buscar colaboradores", text: "El buscador en la parte superior filtra en todos los departamentos simultáneamente. Al estar dentro de un departamento, filtra solo ese departamento." },
      { heading: "Editar un colaborador", text: "Haz clic en el ícono de lápiz (✏) en la tarjeta del colaborador. Modifica los campos deseados y haz clic en «Guardar»." },
      { heading: "Dar de baja", text: "Haz clic en el ícono de baja (👤-) en la tarjeta. Se requiere seleccionar el Tipo de baja (obligatorio), la Fecha de baja y opcionalmente un Motivo. El colaborador pasa al módulo de Bajas." },
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
    id: "usuarios",
    title: "Módulo de Usuarios",
    content: [
      { heading: "¿Qué hace?", text: "Gestiona los usuarios del sistema (administradores y usuarios estándar)." },
      { heading: "Crear usuario", text: "Haz clic en «Nuevo». El username se genera automáticamente como nombre.apellido (sin acentos). Si ya existe, se añade un sufijo numérico (p. ej. juan.garcia2)." },
      { heading: "Roles", text: "«Admin» tiene acceso a todos los módulos. «Usuario» solo puede ver Asistencia e Historial." },
      { heading: "Protección del administrador", text: "El usuario «admin» no puede ser eliminado del sistema." },
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
