import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Clock, Download, History, Search, X, CheckCircle } from "lucide-react";
import { Avatar } from "@client/components/ui/Avatar";
import { DeptCard } from "@client/components/ui/DeptCard";
import { DEPARTAMENTOS_LIST, DEPT_COLORS } from "@shared/constants";
import { useAuthStore } from "@client/stores/authStore";
import { tiempoExtraSchema, type TiempoExtraInput } from "@shared/validators";
import { cn, toLocalISO } from "@client/lib/utils";
import { generarPDFTiempoExtra } from "@client/lib/pdfTiempoExtra";

interface ColabRow {
  id: number;
  nombre: string;
  apellido: string;
  fullname?: string;
  numero_empleado: string | null;
  puesto: string | null;
  departamento: string;
  foto_perfil: string | null;
}

interface RegistroRow {
  id: number;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  horas_totales: string;
  area: string;
  motivo: string;
  autorizado_por: string;
  registrado_por: string;
  colaborador_id: number;
  nombre: string;
  apellido: string;
  fullname: string;
  numero_empleado: string | null;
  departamento: string;
  puesto: string | null;
  foto_perfil: string | null;
}

interface SemanaItem {
  year: number;
  week: number;
  inicio: string;
  fin: string;
  total_registros: number;
  total_horas: string;
}

type Vista = "departamentos" | "opciones" | "registrar" | "historial-semanas" | "historial-detalle";

const inputCls = "w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring";
const labelCls = "text-sm font-medium block mb-1";

function calcularHoras(inicio: string, fin: string): number | null {
  if (!inicio || !fin) return null;
  const [ih, im] = inicio.split(":").map(Number);
  const [fh, fm] = fin.split(":").map(Number);
  const mins = (fh * 60 + fm) - (ih * 60 + im);
  if (mins <= 0) return null;
  return Math.round((mins / 60) * 100) / 100;
}

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function formatFecha(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1]} ${y}`;
}

export default function TiempoExtra() {
  const { allowedDepts } = useAuthStore();
  const deptCards = useMemo(() => {
    const allowed = allowedDepts("tiempo_extra");
    if (allowed === null) return [...DEPARTAMENTOS_LIST];
    return [...DEPARTAMENTOS_LIST].filter((d) => allowed.includes(d));
  }, [allowedDepts]);

  const [vista, setVista]             = useState<Vista>("departamentos");
  const [deptActual, setDept]         = useState<string | null>(null);
  const [busqueda, setBusqueda]       = useState("");
  const [colabSel, setColabSel]       = useState<ColabRow | null>(null);
  const [dropdownOpen, setDropdown]   = useState(false);
  const [exito, setExito]             = useState(false);
  const [semanaActual, setSemana]     = useState<SemanaItem | null>(null);
  const [busqDetalle, setBusqDetalle] = useState("");
  const qc = useQueryClient();

  // Stats para las tarjetas de departamentos
  const { data: statsData } = useQuery<{ stats: Record<string, number> }>({
    queryKey: ["tiempo-extra-stats"],
    queryFn: () => fetch("/api/v1/tiempo-extra/stats", { credentials: "include" }).then(r => r.json()),
  });

  // Colaboradores activos (para búsqueda en registro)
  const { data: colabsData } = useQuery<{ colaboradores: ColabRow[] }>({
    queryKey: ["colaboradores-activos"],
    queryFn: () => fetch("/api/v1/colaboradores?activo=true", { credentials: "include" }).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  // Semanas del departamento seleccionado
  const { data: semanasData, isLoading: semanasLoading } = useQuery<{ semanas: SemanaItem[] }>({
    queryKey: ["tiempo-extra-semanas", deptActual],
    queryFn: () => fetch(
      `/api/v1/tiempo-extra/semanas${deptActual ? `?departamento=${encodeURIComponent(deptActual)}` : ""}`,
      { credentials: "include" }
    ).then(r => r.json()),
    enabled: vista === "historial-semanas",
  });

  // Detalle de la semana seleccionada
  const { data: detalleData, isLoading: detalleLoading } = useQuery<{ registros: RegistroRow[] }>({
    queryKey: ["tiempo-extra-detalle", deptActual, semanaActual?.inicio],
    queryFn: () => {
      const params = new URLSearchParams();
      if (deptActual) params.set("departamento", deptActual);
      if (semanaActual) {
        params.set("inicio", semanaActual.inicio);
        params.set("fin", semanaActual.fin);
      }
      return fetch(`/api/v1/tiempo-extra?${params.toString()}`, { credentials: "include" }).then(r => r.json());
    },
    enabled: vista === "historial-detalle" && semanaActual !== null,
  });

  const form = useForm<TiempoExtraInput>({
    resolver: zodResolver(tiempoExtraSchema),
    defaultValues: {
      colaborador_id: 0,
      fecha: toLocalISO(),
      hora_inicio: "",
      hora_fin: "",
      horas_totales: 0,
      area: "",
      motivo: "",
      autorizado_por: "",
    },
  });

  const horaInicio = form.watch("hora_inicio");
  const horaFin    = form.watch("hora_fin");

  useEffect(() => {
    const h = calcularHoras(horaInicio, horaFin);
    if (h !== null) form.setValue("horas_totales", h);
  }, [horaInicio, horaFin, form]);

  const mutation = useMutation({
    mutationFn: async (data: TiempoExtraInput) => {
      const r = await fetch("/api/v1/tiempo-extra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.message ?? "Error al guardar");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tiempo-extra-stats"] });
      setExito(true);
      setColabSel(null);
      setBusqueda("");
      form.reset({ colaborador_id: 0, fecha: toLocalISO(), hora_inicio: "", hora_fin: "", horas_totales: 0, area: "", motivo: "", autorizado_por: "" });
      setTimeout(() => setExito(false), 3000);
    },
  });

  const colabsFiltrados = useMemo(() => {
    if (!busqueda.trim() || !deptActual) return [];
    const q = busqueda.toLowerCase();
    return (colabsData?.colaboradores ?? [])
      .filter(c => c.departamento === deptActual)
      .filter(c =>
        (c.fullname ?? `${c.nombre} ${c.apellido}`).toLowerCase().includes(q) ||
        c.numero_empleado?.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [busqueda, colabsData, deptActual]);

  const registrosFiltrados = useMemo(() => {
    const lista = detalleData?.registros ?? [];
    if (!busqDetalle.trim()) return lista;
    const q = busqDetalle.toLowerCase();
    return lista.filter(r =>
      r.fullname.toLowerCase().includes(q) ||
      r.numero_empleado?.toLowerCase().includes(q)
    );
  }, [detalleData, busqDetalle]);

  const seleccionarColab = (c: ColabRow) => {
    setColabSel(c);
    setBusqueda("");
    setDropdown(false);
    form.setValue("colaborador_id", c.id);
  };

  const onSubmit = (data: TiempoExtraInput) => {
    const horas = calcularHoras(data.hora_inicio, data.hora_fin);
    if (!horas || horas <= 0) {
      form.setError("hora_fin", { message: "La hora fin debe ser mayor que la hora inicio" });
      return;
    }
    mutation.mutate({ ...data, horas_totales: horas });
  };

  const irAtras = () => {
    if (vista === "registrar") {
      setVista("opciones"); setColabSel(null); setBusqueda(""); form.reset();
    } else if (vista === "opciones") {
      setVista("departamentos"); setDept(null);
    } else if (vista === "historial-semanas") {
      setVista("opciones");
    } else if (vista === "historial-detalle") {
      setVista("historial-semanas"); setSemana(null); setBusqDetalle("");
    }
  };

  const titulo = (() => {
    if (vista === "departamentos")     return "Tiempo Extra";
    if (vista === "opciones")          return deptActual!;
    if (vista === "registrar")         return `Registrar — ${deptActual}`;
    if (vista === "historial-semanas") return `Historial — ${deptActual}`;
    if (vista === "historial-detalle" && semanaActual)
      return `Semana ${semanaActual.week} · ${formatFecha(semanaActual.inicio)} – ${formatFecha(semanaActual.fin)}`;
    return "Detalle";
  })();

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {vista !== "departamentos" && (
          <button onClick={irAtras} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={18} />
          </button>
        )}
        <h2 className="text-xl font-semibold">{titulo}</h2>
        {vista === "historial-detalle" && semanaActual && (detalleData?.registros?.length ?? 0) > 0 && (
          <button
            onClick={() => void generarPDFTiempoExtra(detalleData!.registros, semanaActual, deptActual!)}
            className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium transition-colors"
          >
            <Download size={15} />
            Descargar PDF
          </button>
        )}
      </div>

      {/* ── Vista: Departamentos ── */}
      {vista === "departamentos" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {deptCards.map((dept) => (
            <DeptCard
              key={dept}
              nombre={dept}
              color={DEPT_COLORS[dept] ?? "#888"}
              stats={{ total: statsData?.stats?.[dept] ?? 0 }}
              onClick={() => { setDept(dept); setVista("opciones"); }}
            />
          ))}
        </div>
      )}

      {/* ── Vista: Opciones ── */}
      {vista === "opciones" && (
        <div className="flex gap-4 max-w-xl">
          <button
            onClick={() => setVista("registrar")}
            className="flex-1 flex flex-col items-center gap-3 p-8 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all group"
          >
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Clock size={28} className="text-primary" />
            </div>
            <span className="font-semibold text-sm">Registrar Tiempo Extra</span>
          </button>

          <button
            onClick={() => setVista("historial-semanas")}
            className="flex-1 flex flex-col items-center gap-3 p-8 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all group"
          >
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <History size={28} className="text-primary" />
            </div>
            <span className="font-semibold text-sm">Historial de Tiempo Extra</span>
          </button>
        </div>
      )}

      {/* ── Vista: Registrar ── */}
      {vista === "registrar" && (
        <div className="max-w-lg space-y-5">

          {exito && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
              <CheckCircle size={16} />
              Tiempo extra registrado correctamente
            </div>
          )}

          <div>
            <label className={labelCls}>Colaborador *</label>
            {colabSel ? (
              <div className="flex items-center gap-3 px-3 py-2 border border-input rounded-md bg-muted/30">
                <Avatar nombre={colabSel.nombre} apellido={colabSel.apellido} fotoPerfil={colabSel.foto_perfil} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{colabSel.fullname ?? `${colabSel.nombre} ${colabSel.apellido}`}</p>
                  <p className="text-xs text-muted-foreground">{colabSel.puesto ?? "—"} · {colabSel.numero_empleado ?? "Sin nómina"}</p>
                </div>
                <button onClick={() => { setColabSel(null); form.setValue("colaborador_id", 0); }} className="text-muted-foreground hover:text-foreground">
                  <X size={15} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  value={busqueda}
                  onChange={(e) => { setBusqueda(e.target.value); setDropdown(true); }}
                  onFocus={() => setDropdown(true)}
                  placeholder="Buscar por nombre o nómina..."
                  className={cn(inputCls, "pl-8")}
                  autoComplete="off"
                />
                {dropdownOpen && colabsFiltrados.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                    {colabsFiltrados.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => seleccionarColab(c)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted text-left transition-colors"
                      >
                        <Avatar nombre={c.nombre} apellido={c.apellido} fotoPerfil={c.foto_perfil} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{c.fullname ?? `${c.nombre} ${c.apellido}`}</p>
                          <p className="text-xs text-muted-foreground">{c.puesto ?? "—"} · {c.numero_empleado ?? "Sin nómina"}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {dropdownOpen && busqueda.trim() && colabsFiltrados.length === 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-lg shadow-lg px-4 py-3 text-sm text-muted-foreground">
                    Sin resultados
                  </div>
                )}
              </div>
            )}
            {form.formState.errors.colaborador_id && (
              <p className="text-xs text-destructive mt-1">Selecciona un colaborador</p>
            )}
          </div>

          {colabSel && (
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className={labelCls}>Fecha *</label>
                <input type="date" {...form.register("fecha")} className={inputCls} />
                {form.formState.errors.fecha && <p className="text-xs text-destructive mt-1">{form.formState.errors.fecha.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Hora Inicio *</label>
                  <input type="time" {...form.register("hora_inicio")} className={inputCls} />
                  {form.formState.errors.hora_inicio && <p className="text-xs text-destructive mt-1">{form.formState.errors.hora_inicio.message}</p>}
                </div>
                <div>
                  <label className={labelCls}>Hora Fin *</label>
                  <input type="time" {...form.register("hora_fin")} className={inputCls} />
                  {form.formState.errors.hora_fin && <p className="text-xs text-destructive mt-1">{form.formState.errors.hora_fin.message}</p>}
                </div>
              </div>

              <div>
                <label className={labelCls}>Horas Totales</label>
                <input
                  type="text"
                  readOnly
                  value={
                    horaInicio && horaFin
                      ? calcularHoras(horaInicio, horaFin) !== null
                        ? `${calcularHoras(horaInicio, horaFin)} hrs`
                        : "Hora fin debe ser mayor"
                      : "—"
                  }
                  className={cn(inputCls, "bg-muted text-muted-foreground cursor-default")}
                />
              </div>

              <div>
                <label className={labelCls}>Área donde trabajó *</label>
                <input type="text" {...form.register("area")} placeholder="Ej. Almacén, Línea 3..." className={inputCls} />
                {form.formState.errors.area && <p className="text-xs text-destructive mt-1">{form.formState.errors.area.message}</p>}
              </div>

              <div>
                <label className={labelCls}>Motivo *</label>
                <textarea {...form.register("motivo")} rows={3} placeholder="Describe el motivo del tiempo extra..." className={cn(inputCls, "resize-none")} />
                {form.formState.errors.motivo && <p className="text-xs text-destructive mt-1">{form.formState.errors.motivo.message}</p>}
              </div>

              <div>
                <label className={labelCls}>Autorizado por *</label>
                <input type="text" {...form.register("autorizado_por")} placeholder="Nombre del supervisor o gerente" className={inputCls} />
                {form.formState.errors.autorizado_por && <p className="text-xs text-destructive mt-1">{form.formState.errors.autorizado_por.message}</p>}
              </div>

              {mutation.isError && (
                <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>
              )}

              <button
                type="submit"
                disabled={mutation.isPending}
                className="w-full bg-primary text-primary-foreground rounded-md py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {mutation.isPending ? "Guardando..." : "Registrar Tiempo Extra"}
              </button>
            </form>
          )}
        </div>
      )}

      {/* ── Vista: Historial — lista de semanas ── */}
      {vista === "historial-semanas" && (
        <div className="max-w-2xl space-y-3">
          {semanasLoading && (
            <p className="text-sm text-muted-foreground">Cargando semanas...</p>
          )}
          {!semanasLoading && (semanasData?.semanas ?? []).length === 0 && (
            <div className="py-12 text-center text-muted-foreground text-sm">
              Sin registros en este departamento.
            </div>
          )}
          {(semanasData?.semanas ?? []).map((s) => (
            <button
              key={`${s.year}-${s.week}`}
              onClick={() => { setSemana(s); setVista("historial-detalle"); }}
              className="w-full flex items-center justify-between px-5 py-4 rounded-xl border border-border bg-card hover:border-primary hover:bg-primary/5 transition-all group text-left"
            >
              <div>
                <p className="font-semibold text-sm">Semana {s.week}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatFecha(s.inicio)} — {formatFecha(s.fin)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs bg-muted px-2.5 py-1 rounded-full font-medium">
                  {s.total_registros} {s.total_registros === 1 ? "registro" : "registros"}
                </span>
                <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-semibold">
                  {s.total_horas} hrs
                </span>
                <ArrowRight size={15} className="text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Vista: Historial — detalle de semana ── */}
      {vista === "historial-detalle" && (
        <div className="max-w-3xl space-y-4">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              value={busqDetalle}
              onChange={(e) => setBusqDetalle(e.target.value)}
              placeholder="Buscar por nombre o nómina..."
              className={cn(inputCls, "pl-8 max-w-sm")}
            />
          </div>

          {detalleLoading && (
            <p className="text-sm text-muted-foreground">Cargando registros...</p>
          )}
          {!detalleLoading && registrosFiltrados.length === 0 && (
            <div className="py-12 text-center text-muted-foreground text-sm">
              Sin registros para esta semana.
            </div>
          )}

          {registrosFiltrados.map((r) => (
            <div key={r.id} className="flex gap-4 p-4 rounded-xl border border-border bg-card">
              <div className="flex items-start gap-3 w-52 shrink-0">
                <Avatar nombre={r.nombre} apellido={r.apellido} fotoPerfil={r.foto_perfil} size="md" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight truncate">{r.fullname}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{r.puesto ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{r.numero_empleado ?? "Sin nómina"}</p>
                </div>
              </div>

              <div className="w-px bg-border shrink-0" />

              <div className="flex-1 min-w-0 space-y-1.5 text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{formatFecha(r.fecha)}</span>
                  <span className="text-muted-foreground">·</span>
                  <span>{r.hora_inicio} → {r.hora_fin}</span>
                  <span className="bg-primary/10 text-primary text-xs font-semibold px-2 py-0.5 rounded-full">
                    {r.horas_totales} hrs
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Área:</span> {r.area}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Motivo:</span> {r.motivo}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Autorizado por:</span> {r.autorizado_por}
                </p>
                <p className="text-xs text-muted-foreground/60">
                  Registrado por: {r.registrado_por}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
