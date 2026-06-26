import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search, X, Edit2 } from "lucide-react";
import { cn, formatFecha, toLocalISO } from "@client/lib/utils";
import { Avatar } from "@client/components/ui/Avatar";
import { TIPOS_INASISTENCIA, DEPARTAMENTOS_LIST } from "@shared/constants";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@client/stores/authStore";

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
  edit_count: number | null;
  registrado_por: string | null;
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
  const [colabModal, setColabModal] = useState<{
    info: { nombre: string; apellido: string; fullname: string; numero_empleado: string | null; puesto: string | null; departamento: string | null; turno?: string | null; foto_perfil: string | null };
    dias: Map<string, RegistroSemana>;
  } | null>(null);

  const { t } = useTranslation();
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const [editandoDia, setEditandoDia]   = useState<{ colaborador_id: number; fecha: string } | null>(null);
  const [editEstado, setEditEstado]     = useState<"Presente" | "Inasistencia">("Presente");
  const [editTipo, setEditTipo]         = useState("");
  const [editNotas, setEditNotas]       = useState("");

  const editarAsistenciaMutation = useMutation({
    mutationFn: async (vars: {
      colaborador_id: number;
      fecha: string;
      estado: "Presente" | "Inasistencia";
      tipo_inasistencia?: string;
      notas?: string;
    }) => {
      const r = await fetch("/api/v1/asistencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          persona_tipo: "colaborador",
          persona_id: vars.colaborador_id,
          estado: vars.estado,
          tipo_inasistencia: vars.tipo_inasistencia || undefined,
          notas: vars.notas || undefined,
          fecha: vars.fecha,
        }),
      });
      if (!r.ok) throw new Error("Error al guardar");
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["historial"] });
      setColabModal(prev => {
        if (!prev) return prev;
        const newDias = new Map(prev.dias);
        const existing = prev.dias.get(vars.fecha);
        newDias.set(vars.fecha, {
          ...(existing ?? {
            colaborador_id: vars.colaborador_id,
            nombre: prev.info.nombre,
            apellido: prev.info.apellido,
            fullname: prev.info.fullname,
            numero_empleado: prev.info.numero_empleado,
            puesto: prev.info.puesto,
            departamento: prev.info.departamento,
            turno: prev.info.turno ?? null,
            foto_perfil: prev.info.foto_perfil,
            hora: null,
          }),
          fecha: vars.fecha,
          estado: vars.estado,
          tipo_inasistencia: vars.tipo_inasistencia ?? null,
          notas: vars.notas ?? null,
          edit_count: (existing?.edit_count ?? 0) + 1,
          registrado_por: user?.username ?? null,
        } as RegistroSemana);
        return { ...prev, dias: newDias };
      });
      setEditandoDia(null);
    },
  });

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
    <div className="p-4 md:p-6">
      {/* Header móvil */}
      <div className="md:hidden mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("historial:title")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lunes.toLocaleDateString("es-MX", { month: "long", year: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setOffset((o) => o - 1)} className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
              <ChevronLeft size={15} />
            </button>
            <span className="text-xs font-medium px-1 whitespace-nowrap">
              {lunes.toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
              {" — "}
              {sabado.toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
            </span>
            <button onClick={() => setOffset((o) => o + 1)} disabled={offset >= 0} className={cn("p-1.5 rounded-lg border border-border hover:bg-muted transition-colors", offset >= 0 && "opacity-40 cursor-not-allowed")}>
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder={t("historial:searchPlaceholder")} className="w-full pl-8 pr-3 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="flex gap-2">
          <select value={filtroDept} onChange={(e) => setDept(e.target.value)} className="flex-1 py-1.5 px-2 text-xs border border-input rounded-md bg-background focus:outline-none">
            <option value="">{t("allDepts")}</option>
            {deptList.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={filtroTurno} onChange={(e) => setTurno(e.target.value)} className="flex-1 py-1.5 px-2 text-xs border border-input rounded-md bg-background focus:outline-none">
            <option value="">{t("allShifts")}</option>
            {turnos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Header desktop */}
      <div className="hidden md:flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">{t("historial:title")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {lunes.toLocaleDateString("es-MX", { month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder={t("historial:searchPlaceholder")} className="pl-8 pr-3 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring w-44" />
          </div>
          <select value={filtroDept} onChange={(e) => setDept(e.target.value)} className="py-1.5 px-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">{t("allDepts")}</option>
            {deptList.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={filtroTurno} onChange={(e) => setTurno(e.target.value)} className="py-1.5 px-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">{t("allShifts")}</option>
            {turnos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={() => setOffset((o) => o - 1)} className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"><ChevronLeft size={16} /></button>
          <span className="text-sm font-medium px-2 whitespace-nowrap">
            {lunes.toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
            {" — "}
            {sabado.toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
          </span>
          <button onClick={() => setOffset((o) => o + 1)} disabled={offset >= 0} className={cn("p-2 rounded-lg border border-border hover:bg-muted transition-colors", offset >= 0 && "opacity-40 cursor-not-allowed")}><ChevronRight size={16} /></button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 md:gap-3 mb-4 md:mb-5">
        {/* Colaboradores */}
        <div className="rounded-xl border border-border bg-card p-2.5 md:p-4">
          <p className="text-[9px] md:text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{t("historial:kpiEmployees")}</p>
          <div className="flex gap-2 md:gap-4">
            <div>
              <p className="text-[9px] text-muted-foreground uppercase">{t("historial:kpiActive")}</p>
              <p className="text-lg md:text-2xl font-bold text-blue-600">{kpis.activos}</p>
            </div>
            <div className="w-px bg-border" />
            <div>
              <p className="text-[9px] text-muted-foreground uppercase">{t("historial:kpiTerminated")}</p>
              <p className="text-lg md:text-2xl font-bold text-slate-500">{kpis.bajas}</p>
            </div>
          </div>
        </div>
        {/* Asistencia promedio */}
        <div className="rounded-xl border border-border bg-card p-2.5 md:p-4">
          <p className="text-[9px] md:text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{t("historial:kpiAvgAttendance")}</p>
          <p className="text-lg md:text-2xl font-bold text-green-600">{kpis.promedio}%</p>
          <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 leading-tight">{t("historial:kpiPresentOf", { present: kpis.presentes, total: kpis.totalRegistros })}</p>
        </div>
        {/* Inasistencias */}
        <div className="rounded-xl border border-border bg-card p-2.5 md:p-4">
          <p className="text-[9px] md:text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{t("historial:kpiAbsences")}</p>
          <p className="text-lg md:text-2xl font-bold text-red-600">{kpis.inasistencias}</p>
          <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 leading-tight">{t("historial:kpiAbsencesDesc")}</p>
        </div>
        {/* Desglose */}
        <div className="rounded-xl border border-border bg-card p-2.5 md:p-4">
          <p className="text-[9px] md:text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{t("historial:kpiBreakdown")}</p>
          <div className="flex gap-2 md:gap-3">
            <div>
              <p className="text-[9px] text-green-600 uppercase font-medium">{t("historial:kpiPresent")}</p>
              <p className="text-base md:text-lg font-bold text-green-600">{kpis.presentes}</p>
            </div>
            <div className="w-px bg-border" />
            <div>
              <p className="text-[9px] text-red-500 uppercase font-medium">{t("historial:kpiAbsent")}</p>
              <p className="text-base md:text-lg font-bold text-red-500">{kpis.inasistencias}</p>
            </div>
            <div className="w-px bg-border" />
            <div>
              <p className="text-[9px] text-amber-500 uppercase font-medium leading-tight">SIN<br/>REG.</p>
              <p className="text-base md:text-lg font-bold text-amber-500">{kpis.sinRegistrar}</p>
            </div>
          </div>
        </div>
        {/* Depto con más faltas — full width en móvil */}
        <div className="col-span-2 lg:col-span-1 rounded-xl border border-border bg-card p-2.5 md:p-4">
          <p className="text-[9px] md:text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{t("historial:kpiMostAbsences")}</p>
          <p className="text-base md:text-lg font-bold text-foreground truncate">{kpis.deptMasFaltas}</p>
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
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-2 md:px-4 py-3 font-medium text-muted-foreground w-[130px] md:w-48">{t("historial:employee")}</th>
                {dias.map((d) => (
                  <th key={d.toISOString()} className="text-center py-3 font-medium text-muted-foreground">
                    <span className="block text-[10px] md:text-xs uppercase">
                      {d.toLocaleDateString("es-MX", { weekday: "short" }).slice(0, 3)}
                    </span>
                    <span className="block text-[10px] md:text-sm">
                      {d.toLocaleDateString("es-MX", { day: "numeric" })}
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
                <tr
                  key={info.colaborador_id}
                  className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                  onClick={() => setColabModal({ info, dias: dm })}
                >
                  <td className="px-2 md:px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      <Avatar nombre={info.nombre} apellido={info.apellido} fotoPerfil={info.foto_perfil} size="sm" className="flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium leading-tight truncate text-[11px] md:text-sm">{info.fullname}</p>
                        <p className="text-[10px] md:text-xs text-muted-foreground truncate hidden md:block">{info.puesto}</p>
                      </div>
                    </div>
                  </td>
                  {dias.map((d) => {
                    const iso = toISO(d);
                    const reg = dm.get(iso);
                    return (
                      <td key={iso} className="text-center px-0.5 md:px-2 py-2">
                        {!reg ? (
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : reg.estado === "Presente" ? (
                          <span className="inline-block px-1 md:px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] md:text-xs font-medium">✓</span>
                        ) : (
                          <span className={cn("inline-block px-1 md:px-2 py-0.5 rounded-full text-[10px] md:text-xs font-medium", TIPO_COLORS[reg.tipo_inasistencia ?? "FI"] ?? "bg-gray-100 text-gray-600")}>
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
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-2 md:px-4 py-3 font-medium text-muted-foreground w-[130px] md:w-48">{t("historial:employee")}</th>
                {diasTE.map((d) => (
                  <th key={d.toISOString()} className="text-center py-3 font-medium text-muted-foreground">
                    <span className="block text-[10px] md:text-xs uppercase">
                      {d.toLocaleDateString("es-MX", { weekday: "short" }).slice(0, 3)}
                    </span>
                    <span className="block text-[10px] md:text-sm">
                      {d.toLocaleDateString("es-MX", { day: "numeric" })}
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
                <tr
                  key={info.colaborador_id}
                  className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                  onClick={() => {
                    const asist = byColaborador.find(c => c.info.colaborador_id === info.colaborador_id);
                    setColabModal(asist ?? { info: { ...info, turno: null }, dias: new Map() });
                  }}
                >
                  <td className="px-2 md:px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      <Avatar nombre={info.nombre} apellido={info.apellido} fotoPerfil={info.foto_perfil} size="sm" className="flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium leading-tight truncate text-[11px] md:text-sm">{info.fullname}</p>
                        <p className="text-[10px] md:text-xs text-muted-foreground truncate hidden md:block">{info.puesto}</p>
                      </div>
                    </div>
                  </td>
                  {diasTE.map((d) => {
                    const iso = toISO(d);
                    const regs = dm.get(iso);
                    if (!regs || regs.length === 0) {
                      return (
                        <td key={iso} className="text-center px-0.5 md:px-2 py-2">
                          <span className="text-muted-foreground text-xs">—</span>
                        </td>
                      );
                    }
                    const totalHoras = regs.reduce((acc, r) => acc + parseFloat(r.horas_totales ?? "0"), 0);
                    const horasStr  = Number.isInteger(totalHoras) ? `${totalHoras}h` : `${totalHoras.toFixed(1)}h`;
                    const horario   = regs.length === 1
                      ? `${regs[0].hora_inicio.slice(0, 5)}–${regs[0].hora_fin.slice(0, 5)}`
                      : `${regs.length} reg.`;
                    return (
                      <td key={iso} className="text-center px-0.5 md:px-2 py-2">
                        <span className="inline-flex flex-col items-center gap-0.5 px-1 md:px-2 py-1 rounded-lg bg-amber-50 border border-amber-200">
                          <span className="text-[10px] md:text-xs font-semibold text-amber-700">{horasStr}</span>
                          <span className="text-[9px] md:text-[10px] text-amber-600 whitespace-nowrap hidden md:block">{horario}</span>
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

      {/* Modal: resumen de colaborador */}
      {colabModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => { setColabModal(null); setEditandoDia(null); }}
        >
          <div
            className="bg-card rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-border">
              <div className="flex items-start gap-4">
                <Avatar
                  nombre={colabModal.info.nombre}
                  apellido={colabModal.info.apellido}
                  fotoPerfil={colabModal.info.foto_perfil}
                  size="lg"
                  className="flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg leading-tight">{colabModal.info.fullname}</h3>
                  {colabModal.info.puesto && (
                    <p className="text-sm text-muted-foreground mt-0.5">{colabModal.info.puesto}</p>
                  )}
                  {colabModal.info.departamento && (
                    <p className="text-sm text-muted-foreground">{colabModal.info.departamento}</p>
                  )}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {colabModal.info.numero_empleado && (
                      <span className="text-xs bg-muted px-2 py-0.5 rounded-full">#{colabModal.info.numero_empleado}</span>
                    )}
                    {colabModal.info.turno && (
                      <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{colabModal.info.turno}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => { setColabModal(null); setEditandoDia(null); }}
                  className="flex-shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Asistencia semana */}
            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Asistencia &middot; {lunes.toLocaleDateString("es-MX", { day: "numeric", month: "short" })} &ndash; {sabado.toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
              </p>
              <div>
                {dias.map(d => {
                  const iso = toISO(d);
                  const reg = colabModal.dias.get(iso);
                  const isEditing = editandoDia?.fecha === iso && editandoDia?.colaborador_id === colabModal.info.colaborador_id;
                  return (
                    <div key={iso} className="py-2.5 border-b border-border/40 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground w-28 shrink-0 capitalize">
                          {d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })}
                        </span>
                        {!isEditing && (
                          <>
                            <div className="flex-1 flex flex-col gap-0.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                {!reg ? (
                                  <span className="text-xs text-muted-foreground">Sin registro</span>
                                ) : reg.estado === "Presente" ? (
                                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">Presente ✓</span>
                                ) : (
                                  <>
                                    <span className={cn("inline-block px-2.5 py-0.5 rounded-full text-xs font-medium", TIPO_COLORS[reg.tipo_inasistencia ?? "FI"] ?? "bg-gray-100 text-gray-600")}>
                                      {TIPOS_INASISTENCIA.find(ti => ti.code === reg.tipo_inasistencia)?.label ?? reg.tipo_inasistencia ?? "Inasistencia"}
                                    </span>
                                    {reg.notas && <span className="text-xs text-muted-foreground truncate">{reg.notas}</span>}
                                  </>
                                )}
                              </div>
                              {reg?.registrado_por && (
                                <span className="text-[10px] text-muted-foreground/60">por {reg.registrado_por}</span>
                              )}
                            </div>
                            <button
                              onClick={() => {
                                setEditandoDia({ colaborador_id: colabModal.info.colaborador_id, fecha: iso });
                                setEditEstado((reg?.estado as "Presente" | "Inasistencia") ?? "Presente");
                                setEditTipo(reg?.tipo_inasistencia ?? "");
                                setEditNotas(reg?.notas ?? "");
                              }}
                              className="flex-shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Edit2 size={12} />
                            </button>
                          </>
                        )}
                      </div>
                      {isEditing && (
                        <div className="mt-2 space-y-2">
                          {/* Mensaje de límite de ediciones */}
                          {(() => {
                            const count = reg?.edit_count ?? 0;
                            if (count >= 2) return (
                              <div className="rounded-md px-3 py-2 bg-destructive/10 text-destructive text-xs">
                                Este registro ya fue editado 2 veces y no puede modificarse más.
                              </div>
                            );
                            if (count === 1) return (
                              <div className="rounded-md px-3 py-2 bg-amber-50 text-amber-700 text-xs">
                                ⚠ Última edición disponible — después de guardar no podrá modificarse.
                              </div>
                            );
                            return (
                              <div className="rounded-md px-3 py-2 bg-blue-50 text-blue-700 text-xs">
                                Edición 1 de 2 permitidas. Tendrás 1 más después de esta.
                              </div>
                            );
                          })()}
                          {(reg?.edit_count ?? 0) >= 2 ? (
                            <div className="flex justify-end">
                              <button onClick={() => setEditandoDia(null)} className="px-3 py-1 text-xs rounded-md border border-border hover:bg-muted transition-colors">
                                Cerrar
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setEditEstado("Presente")}
                                  className={cn("flex-1 py-1 text-xs rounded-md border transition-colors", editEstado === "Presente" ? "bg-green-500 text-white border-green-500" : "border-green-500 text-green-600 hover:bg-green-50")}
                                >
                                  Presente
                                </button>
                                <button
                                  onClick={() => setEditEstado("Inasistencia")}
                                  className={cn("flex-1 py-1 text-xs rounded-md border transition-colors", editEstado === "Inasistencia" ? "bg-red-500 text-white border-red-500" : "border-red-400 text-red-500 hover:bg-red-50")}
                                >
                                  Inasistencia
                                </button>
                              </div>
                              {editEstado === "Inasistencia" && (
                                <div className="grid grid-cols-3 gap-1">
                                  {TIPOS_INASISTENCIA.map((ti) => (
                                    <button
                                      key={ti.code}
                                      onClick={() => setEditTipo(ti.code)}
                                      className={cn("px-2 py-1 text-[10px] rounded-md border text-left transition-colors", editTipo === ti.code ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted")}
                                    >
                                      <span className="font-bold">{ti.code}</span>
                                      <span className="block opacity-70 truncate">{ti.label}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                              <textarea
                                value={editNotas}
                                onChange={(e) => setEditNotas(e.target.value)}
                                rows={1}
                                placeholder="Notas (opcional)"
                                className="w-full border border-input rounded-md px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                              />
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => setEditandoDia(null)} className="px-3 py-1 text-xs rounded-md border border-border hover:bg-muted transition-colors">
                                  Cancelar
                                </button>
                                <button
                                  onClick={() => editarAsistenciaMutation.mutate({
                                    colaborador_id: colabModal.info.colaborador_id,
                                    fecha: iso,
                                    estado: editEstado,
                                    tipo_inasistencia: editEstado === "Inasistencia" ? editTipo : undefined,
                                    notas: editNotas || undefined,
                                  })}
                                  disabled={(editEstado === "Inasistencia" && !editTipo) || editarAsistenciaMutation.isPending}
                                  className="px-3 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                                >
                                  {editarAsistenciaMutation.isPending ? "Guardando..." : "Guardar"}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Resumen */}
              {(() => {
                const presentes     = dias.filter(d => colabModal.dias.get(toISO(d))?.estado === "Presente").length;
                const inasistencias = dias.filter(d => { const r = colabModal.dias.get(toISO(d)); return r && r.estado !== "Presente"; }).length;
                const sinRegistro   = dias.filter(d => !colabModal.dias.get(toISO(d))).length;
                return (
                  <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-4">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-xs text-muted-foreground">{presentes} presente{presentes !== 1 ? "s" : ""}</span>
                    </div>
                    {inasistencias > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        <span className="text-xs text-muted-foreground">{inasistencias} inasistencia{inasistencias !== 1 ? "s" : ""}</span>
                      </div>
                    )}
                    {sinRegistro > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-gray-300" />
                        <span className="text-xs text-muted-foreground">{sinRegistro} sin registro</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
