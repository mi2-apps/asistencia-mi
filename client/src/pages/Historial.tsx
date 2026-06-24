import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn, formatFecha, toLocalISO } from "@client/lib/utils";
import { Avatar } from "@client/components/ui/Avatar";
import { TIPOS_INASISTENCIA, DEPARTAMENTOS_LIST } from "@shared/constants";
import { useTranslation } from "react-i18next";

interface RegistroSemana {
  colaborador_id: number;
  nombre: string;
  apellido: string;
  fullname: string;
  numero_empleado: string | null;
  puesto: string | null;
  departamento: string | null;
  turno: string | null;
  foto_perfil: string | null;
  fecha: string | null;
  estado: string | null;
  tipo_inasistencia: string | null;
  notas: string | null;
}

interface RegistroTE {
  id: number;
  colaborador_id: number;
  nombre: string;
  apellido: string;
  fullname: string;
  numero_empleado: string | null;
  puesto: string | null;
  departamento: string | null;
  foto_perfil: string | null;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  horas_totales: string;
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
  return toLocalISO(d);
}

export default function Historial() {
  const deptList = [...DEPARTAMENTOS_LIST];

  const [offset, setOffset]         = useState(0);
  const [busqueda, setBusqueda]     = useState("");
  const [filtroDept, setDept]       = useState("");
  const [filtroTurno, setTurno]     = useState("");
  const [tabActiva, setTabActiva]   = useState<"asistencia" | "tiempo-extra">("asistencia");

  const { t } = useTranslation();

  const lunes   = getMondayOfWeek(offset);
  const sabado  = new Date(lunes); sabado.setDate(lunes.getDate() + 5);
  const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
  const inicio  = toISO(lunes);
  const fin     = toISO(sabado);
  const finTE   = toISO(domingo);

  const dias = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(lunes); d.setDate(lunes.getDate() + i); return d;
  });

  const diasTE = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunes); d.setDate(lunes.getDate() + i); return d;
  });

  const { data, isLoading } = useQuery<{ registros: RegistroSemana[], bajas_count: number }>({
    queryKey: ["historial", inicio, fin],
    queryFn: () => fetch(`/api/v1/asistencia/semana?inicio=${inicio}&fin=${fin}`, { credentials: "include" }).then((r) => r.json()),
  });

  const { data: teData, isLoading: teLoading } = useQuery<{ success: boolean; registros: RegistroTE[] }>({
    queryKey: ["historial-te", inicio, finTE],
    queryFn: () => fetch(`/api/v1/tiempo-extra?inicio=${inicio}&fin=${finTE}`, { credentials: "include" }).then((r) => r.json()),
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

  const turnos = useMemo(() => {
    const set = new Set<string>();
    for (const { info } of byColaborador) {
      if (info.turno) set.add(info.turno);
    }
    return Array.from(set).sort();
  }, [byColaborador]);

  const colaboradoresFiltrados = useMemo(() => {
    let lista = byColaborador;
    if (filtroDept)  lista = lista.filter(({ info }) => info.departamento === filtroDept);
    if (filtroTurno) lista = lista.filter(({ info }) => info.turno === filtroTurno);
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      lista = lista.filter(({ info }) =>
        info.fullname.toLowerCase().includes(q) ||
        info.numero_empleado?.toLowerCase().includes(q) ||
        info.puesto?.toLowerCase().includes(q)
      );
    }
    return lista;
  }, [byColaborador, busqueda, filtroDept, filtroTurno]);

  const byColaboradorTE = useMemo(() => {
    const map = new Map<number, { info: RegistroTE; dias: Map<string, RegistroTE[]> }>();
    for (const r of teData?.registros ?? []) {
      if (!map.has(r.colaborador_id))
        map.set(r.colaborador_id, { info: r, dias: new Map() });
      const entry = map.get(r.colaborador_id)!;
      if (!entry.dias.has(r.fecha)) entry.dias.set(r.fecha, []);
      entry.dias.get(r.fecha)!.push(r);
    }
    return Array.from(map.values());
  }, [teData]);

  const colaboradoresFiltradosTE = useMemo(() => {
    let lista = byColaboradorTE;
    if (filtroDept)  lista = lista.filter(({ info }) => info.departamento === filtroDept);
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      lista = lista.filter(({ info }) =>
        info.fullname.toLowerCase().includes(q) ||
        info.numero_empleado?.toLowerCase().includes(q) ||
        info.puesto?.toLowerCase().includes(q)
      );
    }
    return lista;
  }, [byColaboradorTE, busqueda, filtroDept]);

  const kpis = useMemo(() => {
    let presentes = 0, inasistencias = 0;
    const faltasPorDept = new Map<string, number>();
    for (const { info, dias: dm } of colaboradoresFiltrados) {
      for (const r of dm.values()) {
        if (r.estado === "Presente") presentes++;
        else if (r.estado === "Inasistencia") {
          inasistencias++;
          const dept = info.departamento ?? "Sin dept";
          faltasPorDept.set(dept, (faltasPorDept.get(dept) ?? 0) + 1);
        }
      }
    }
    const totalRegistros = presentes + inasistencias;
    const promedio = totalRegistros === 0 ? 0 : Math.round((presentes / totalRegistros) * 100);
    const sinRegistrar = colaboradoresFiltrados.filter(({ dias: dm }) => dm.size === 0).length;
    let deptMasFaltas = "—";
    let maxFaltas = 0;
    for (const [dept, count] of faltasPorDept) {
      if (count > maxFaltas) { maxFaltas = count; deptMasFaltas = dept; }
    }
    return { activos: byColaborador.length, bajas: data?.bajas_count ?? 0, presentes, inasistencias, sinRegistrar, promedio, totalRegistros, deptMasFaltas };
  }, [colaboradoresFiltrados, byColaborador, data]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">{t("historial:title")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {lunes.toLocaleDateString("es-MX", { month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={t("historial:searchPlaceholder")}
              className="pl-8 pr-3 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring w-44"
            />
          </div>
          <select
            value={filtroDept}
            onChange={(e) => setDept(e.target.value)}
            className="py-1.5 px-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{t("allDepts")}</option>
            {deptList.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select
            value={filtroTurno}
            onChange={(e) => setTurno(e.target.value)}
            className="py-1.5 px-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{t("allShifts")}</option>
            {turnos.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        {/* Colaboradores */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{t("historial:kpiEmployees")}</p>
          <div className="flex gap-4">
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase">{t("historial:kpiActive")}</p>
              <p className="text-2xl font-bold text-blue-600">{kpis.activos}</p>
            </div>
            <div className="w-px bg-border" />
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase">{t("historial:kpiTerminated")}</p>
              <p className="text-2xl font-bold text-slate-500">{kpis.bajas}</p>
            </div>
          </div>
        </div>
        {/* Asistencia promedio */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{t("historial:kpiAvgAttendance")}</p>
          <p className="text-2xl font-bold text-green-600">{kpis.promedio}%</p>
          <p className="text-xs text-muted-foreground mt-1">{t("historial:kpiPresentOf", { present: kpis.presentes, total: kpis.totalRegistros })}</p>
        </div>
        {/* Inasistencias */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{t("historial:kpiAbsences")}</p>
          <p className="text-2xl font-bold text-red-600">{kpis.inasistencias}</p>
          <p className="text-xs text-muted-foreground mt-1">{t("historial:kpiAbsencesDesc")}</p>
        </div>
        {/* Desglose */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{t("historial:kpiBreakdown")}</p>
          <div className="flex gap-3">
            <div className="text-center">
              <p className="text-[10px] text-green-600 uppercase font-medium">{t("historial:kpiPresent")}</p>
              <p className="text-lg font-bold text-green-600">{kpis.presentes}</p>
            </div>
            <div className="w-px bg-border" />
            <div className="text-center">
              <p className="text-[10px] text-red-500 uppercase font-medium">{t("historial:kpiAbsent")}</p>
              <p className="text-lg font-bold text-red-500">{kpis.inasistencias}</p>
            </div>
            <div className="w-px bg-border" />
            <div className="text-center">
              <p className="text-[10px] text-amber-500 uppercase font-medium">{t("historial:kpiNoRecord")}</p>
              <p className="text-lg font-bold text-amber-500">{kpis.sinRegistrar}</p>
            </div>
          </div>
        </div>
        {/* Depto con más faltas */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{t("historial:kpiMostAbsences")}</p>
          <p className="text-lg font-bold text-foreground truncate">{kpis.deptMasFaltas}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-border">
        <button
          onClick={() => setTabActiva("asistencia")}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
            tabActiva === "asistencia"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {t("historial:tabAttendance")}
        </button>
        <button
          onClick={() => setTabActiva("tiempo-extra")}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
            tabActiva === "tiempo-extra"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {t("historial:tabOvertime")}
          {byColaboradorTE.length > 0 && (
            <span className="ml-1.5 inline-block bg-amber-100 text-amber-700 text-[10px] font-semibold rounded-full px-1.5 py-0.5">
              {byColaboradorTE.length}
            </span>
          )}
        </button>
      </div>

      {/* Table: Asistencia */}
      {tabActiva === "asistencia" && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground w-48">{t("historial:employee")}</th>
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
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">{t("historial:loading")}</td></tr>
              ) : byColaborador.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">{t("historial:noRecords")}</td></tr>
              ) : colaboradoresFiltrados.map(({ info, dias: dm }) => (
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
      )}

      {/* Table: Tiempo Extra */}
      {tabActiva === "tiempo-extra" && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground w-48">{t("historial:employee")}</th>
                {diasTE.map((d) => (
                  <th key={d.toISOString()} className="text-center px-2 py-3 font-medium text-muted-foreground min-w-[110px]">
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
              {teLoading ? (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">{t("historial:loading")}</td></tr>
              ) : colaboradoresFiltradosTE.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">{t("historial:noOvertimeRecords")}</td></tr>
              ) : colaboradoresFiltradosTE.map(({ info, dias: dm }) => (
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
                  {diasTE.map((d) => {
                    const iso = toISO(d);
                    const regs = dm.get(iso);
                    if (!regs || regs.length === 0) {
                      return (
                        <td key={iso} className="text-center px-2 py-2">
                          <span className="text-muted-foreground">—</span>
                        </td>
                      );
                    }
                    const totalHoras = regs.reduce((acc, r) => acc + parseFloat(r.horas_totales ?? "0"), 0);
                    const horasStr  = Number.isInteger(totalHoras) ? `${totalHoras}h` : `${totalHoras.toFixed(1)}h`;
                    const horario   = regs.length === 1
                      ? `${regs[0].hora_inicio.slice(0, 5)}–${regs[0].hora_fin.slice(0, 5)}`
                      : `${regs.length} registros`;
                    return (
                      <td key={iso} className="text-center px-2 py-2">
                        <span className="inline-flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg bg-amber-50 border border-amber-200">
                          <span className="text-xs font-semibold text-amber-700">{horasStr}</span>
                          <span className="text-[10px] text-amber-600 whitespace-nowrap">{horario}</span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
