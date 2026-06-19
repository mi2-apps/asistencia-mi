import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, formatFecha } from "@client/lib/utils";
import { Avatar } from "@client/components/ui/Avatar";
import { TIPOS_INASISTENCIA } from "@shared/constants";

interface RegistroSemana {
  colaborador_id: number;
  nombre: string;
  apellido: string;
  fullname: string;
  numero_empleado: string | null;
  puesto: string | null;
  foto_perfil: string | null;
  fecha: string | null;
  estado: string | null;
  tipo_inasistencia: string | null;
  notas: string | null;
}

const TIPO_COLORS: Record<string, string> = {
  FI: "bg-red-100 text-red-700",
  FJ: "bg-orange-100 text-orange-700",
  PSG: "bg-yellow-100 text-yellow-700",
  PCG: "bg-yellow-100 text-yellow-700",
  Suspension: "bg-purple-100 text-purple-700",
  Vacaciones: "bg-blue-100 text-blue-700",
  IT: "bg-pink-100 text-pink-700",
  RET: "bg-amber-100 text-amber-700",
  CUM: "bg-teal-100 text-teal-700",
  FES: "bg-indigo-100 text-indigo-700",
};

function getMondayOfWeek(offset: number): Date {
  const hoy = new Date();
  const dia  = hoy.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() + diff + offset * 7);
  lunes.setHours(0, 0, 0, 0);
  return lunes;
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function Historial() {
  const [offset, setOffset] = useState(-1);

  const lunes   = getMondayOfWeek(offset);
  const sabado  = new Date(lunes); sabado.setDate(lunes.getDate() + 5);
  const inicio  = toISO(lunes);
  const fin     = toISO(sabado);

  const dias = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(lunes); d.setDate(lunes.getDate() + i); return d;
  });

  const { data, isLoading } = useQuery<{ registros: RegistroSemana[] }>({
    queryKey: ["historial", inicio, fin],
    queryFn: () => fetch(`/api/v1/asistencia/semana?inicio=${inicio}&fin=${fin}`, { credentials: "include" }).then((r) => r.json()),
  });

  const byColaborador = useMemo(() => {
    const map = new Map<number, { info: RegistroSemana; dias: Map<string, RegistroSemana> }>();
    for (const r of data?.registros ?? []) {
      if (!map.has(r.colaborador_id)) {
        map.set(r.colaborador_id, { info: r, dias: new Map() });
      }
      if (r.fecha) map.get(r.colaborador_id)!.dias.set(r.fecha, r);
    }
    return Array.from(map.values());
  }, [data]);

  const totales = useMemo(() => {
    let presentes = 0, inasistencias = 0;
    for (const { dias: dm } of byColaborador) {
      for (const r of dm.values()) {
        if (r.estado === "Presente") presentes++;
        else if (r.estado === "Inasistencia") inasistencias++;
      }
    }
    return { presentes, inasistencias };
  }, [byColaborador]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Historial de Asistencia</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {lunes.toLocaleDateString("es-MX", { month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOffset((o) => o - 1)}
            className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-medium px-2 whitespace-nowrap">
            {lunes.toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
            {" — "}
            {sabado.toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
          </span>
          <button
            onClick={() => setOffset((o) => o + 1)}
            disabled={offset >= 0}
            className={cn(
              "p-2 rounded-lg border border-border hover:bg-muted transition-colors",
              offset >= 0 && "opacity-40 cursor-not-allowed"
            )}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Summary pills */}
      <div className="flex gap-3 mb-4">
        <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
          ✓ {totales.presentes} presentes
        </span>
        <span className="px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-medium">
          ✗ {totales.inasistencias} inasistencias
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-48">Colaborador</th>
              {dias.map((d) => (
                <th key={d.toISOString()} className="text-center px-2 py-3 font-medium text-muted-foreground min-w-[90px]">
                  <span className="block text-xs uppercase">
                    {d.toLocaleDateString("es-MX", { weekday: "short" })}
                  </span>
                  <span className="block text-sm">
                    {d.toLocaleDateString("es-MX", { day: "numeric", month: "numeric" })}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Cargando...</td></tr>
            ) : byColaborador.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Sin registros</td></tr>
            ) : byColaborador.map(({ info, dias: dm }) => (
              <tr key={info.colaborador_id} className="border-b border-border/50 hover:bg-muted/20">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar nombre={info.nombre} apellido={info.apellido} fotoPerfil={info.foto_perfil} size="sm" />
                    <div>
                      <p className="font-medium leading-tight">{info.fullname}</p>
                      <p className="text-xs text-muted-foreground">{info.puesto}</p>
                    </div>
                  </div>
                </td>
                {dias.map((d) => {
                  const iso = toISO(d);
                  const reg = dm.get(iso);
                  return (
                    <td key={iso} className="text-center px-2 py-2">
                      {!reg ? (
                        <span className="text-muted-foreground">—</span>
                      ) : reg.estado === "Presente" ? (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">✓</span>
                      ) : (
                        <span className={cn("inline-block px-2 py-0.5 rounded-full text-xs font-medium", TIPO_COLORS[reg.tipo_inasistencia ?? "FI"] ?? "bg-gray-100 text-gray-600")}>
                          {reg.tipo_inasistencia ?? "?"}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
