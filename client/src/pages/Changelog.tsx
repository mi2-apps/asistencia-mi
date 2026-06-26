import { useState, useEffect } from "react";
import { Sparkles, X } from "lucide-react";
import { cn } from "@client/lib/utils";

interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: string[];
  highlight?: boolean;
}

const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.2.0",
    date: "2026-06-25",
    title: "Permisos granulares, diseño móvil y mejoras en Tiempo Extra",
    highlight: true,
    items: [
      "Permisos: 6 módulos individuales independientes — Asistencia, Historial, Colaboradores, Agregar Colaborador, Bajas y Tiempo Extra, cada uno con su propio acceso y selección de departamentos",
      "Diseño responsive completo — sidebar con menú hamburguesa en móvil, vistas de tarjetas y tablas adaptadas para pantallas pequeñas",
      "Asistencia: colaboradores agrupados por turno (Matutino / Vespertino / Nocturno / Mixto) en la vista de departamento",
      "Tiempo Extra: historial agrupado por día de la semana (Lunes → Domingo) con sección colapsable por día para reducir scroll",
      "Tiempo Extra: tarjetas de registro rediseñadas en móvil — información más compacta y legible sin scroll horizontal",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-06-24",
    title: "Mejoras en Historial, Colaboradores y Tiempo Extra",
    items: [
      "Historial: tabs Asistencia / Tiempo Extra — ambas vistas en una sola pantalla, misma semana y filtros",
      "Historial: modal de resumen al hacer clic en cualquier colaborador — datos generales + asistencia diaria de la semana",
      "Colaboradores: edición de foto de perfil directamente desde el modal de edición",
      "Tiempo Extra: botón «Descargar PDF» en el detalle semanal — genera reporte oficial con logo MI Technologies",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-06-19",
    title: "Lanzamiento inicial en MI Apps Stack",
    items: [
      "Migración completa al stack oficial MI Apps (React 18 + TypeScript + Vite + Tailwind + Drizzle ORM)",
      "Autenticación SSO via Nextcloud — sin contraseñas locales",
      "Módulo de Asistencia: 31 departamentos, 10 tipos de inasistencia, registro idempotente",
      "Módulo de Historial: navegación semanal con colores por tipo de inasistencia",
      "Módulo de Colaboradores: gestión completa con soft-delete y modal Dar de Baja",
      "Módulo de Bajas: vista por departamento con reactivación",
      "Módulo de Usuarios: CRUD con username autogenerado y protección de admin",
      "Soporte trilingüe: Español (MX), English, 中文",
      "Diseño mobile-first con Tailwind CSS",
      "Deploy automático via Coolify (git push → webhook → build → live)",
    ],
  },
];

export default function Changelog() {
  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Sparkles className="text-brand-yellow" size={22} />
        <h2 className="text-xl font-semibold">Historial de Cambios</h2>
      </div>

      <div className="space-y-6">
        {CHANGELOG.map((entry) => (
          <div
            key={entry.version}
            className={cn(
              "rounded-xl border p-5",
              entry.highlight ? "border-brand-yellow/50 bg-yellow-50/40" : "border-border bg-card"
            )}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="font-mono text-sm font-bold bg-primary text-primary-foreground px-2 py-0.5 rounded">
                v{entry.version}
              </span>
              <span className="text-sm text-muted-foreground">{entry.date}</span>
              {entry.highlight && (
                <span className="text-xs bg-brand-yellow/20 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
                  Actual
                </span>
              )}
            </div>
            <h3 className="font-semibold mb-2">{entry.title}</h3>
            <ul className="space-y-1.5">
              {entry.items.map((item, i) => (
                <li key={i} className="text-sm text-muted-foreground flex gap-2">
                  <span className="text-brand-green mt-0.5 flex-shrink-0">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// "What's New" modal shown on first login after deploy
export function WhatsNewModal() {
  const STORAGE_KEY = "whats-new-seen-v1.2.0";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setOpen(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  };

  if (!open) return null;

  const latest = CHANGELOG[0]!;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-md border border-brand-yellow/30">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="text-brand-yellow" size={18} />
            <h3 className="font-semibold">¡Novedades en v{latest.version}!</h3>
          </div>
          <button onClick={dismiss} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">
          <p className="text-sm font-medium mb-3">{latest.title}</p>
          <ul className="space-y-1.5">
            {latest.items.slice(0, 5).map((item, i) => (
              <li key={i} className="text-sm text-muted-foreground flex gap-2">
                <span className="text-brand-green flex-shrink-0">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="p-4 border-t border-border flex justify-end">
          <button
            onClick={dismiss}
            className="px-5 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            ¡Entendido!
          </button>
        </div>
      </div>
    </div>
  );
}
