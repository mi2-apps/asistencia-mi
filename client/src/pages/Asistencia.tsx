import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Search, Trash2 } from "lucide-react";
import { Avatar } from "@client/components/ui/Avatar";
import { DeptCard } from "@client/components/ui/DeptCard";
import { DEPARTAMENTOS_LIST, DEPT_COLORS, TIPOS_INASISTENCIA } from "@shared/constants";
import { useAuthStore } from "@client/stores/authStore";
import { cn, toLocalISO } from "@client/lib/utils";

interface ReporteRow {
  colaborador_id: number;
  nombre: string;
  apellido: string;
  fullname: string;
  departamento: string;
  puesto: string | null;
  turno: string | null;
  numero_empleado: string | null;
  foto_perfil: string | null;
  estado: string | null;
  tipo_inasistencia: string | null;
  notas: string | null;
}

async function fetchReporte(): Promise<{ reporte: ReporteRow[] }> {
  const r = await fetch("/api/v1/asistencia/reporte", { credentials: "include" });
  return r.json();
}

export default function Asistencia() {
  const { t } = useTranslation();
  const [deptActual, setDeptActual]       = useState<string | null>(null);
  const [busqueda, setBusqueda]           = useState("");
  const [inasistenciaModal, setModal]     = useState<ReporteRow | null>(null);
  const [tipoSel, setTipoSel]             = useState("");
  const [notas, setNotas]                 = useState("");
  const { user, allowedDepts }            = useAuthStore();
  const deptCards = useMemo(() => {
    const allowed = allowedDepts("asistencia");
    if (allowed === null) return [...DEPARTAMENTOS_LIST];
    return [...DEPARTAMENTOS_LIST].filter((d) => allowed.includes(d));
  }, [allowedDepts]);
  const qc                                = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["asistencia"], queryFn: fetchReporte, refetchInterval: 60_000 });
  const reporte = data?.reporte ?? [];

  const deptStats = useMemo(() => {
    const m = new Map<string, { presentes: number; inasistencias: number; sinRegistro: number }>();
    for (const dept of deptCards) m.set(dept, { presentes: 0, inasistencias: 0, sinRegistro: 0 });
    for (const r of reporte) {
      const s = m.get(r.departamento);
      if (!s) continue;
      if (!r.estado) s.sinRegistro++;
      else if (r.estado === "Presente") s.presentes++;
      else s.inasistencias++;
    }
    return m;
  }, [reporte]);

  const filas = useMemo(() => {
    let lista = deptActual ? reporte.filter((r) => r.departamento === deptActual) : reporte;
    if (deptActual) lista = lista.filter((r) => !r.estado);
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      lista = lista.filter(
        (r) =>
          r.fullname.toLowerCase().includes(q) ||
          r.puesto?.toLowerCase().includes(q) ||
          r.numero_empleado?.toLowerCase().includes(q) ||
          r.turno?.toLowerCase().includes(q)
      );
    }
    return lista;
  }, [reporte, deptActual, busqueda]);

  const totalDept = deptActual ? reporte.filter((r) => r.departamento === deptActual).length : 0;
  const todosRegistrados = deptActual && filas.length === 0 && totalDept > 0;

  const registrarMutation = useMutation({
    mutationFn: async ({ persona_id, estado, tipo_inasistencia, notas }: {
      persona_id: number;
      estado: string;
      tipo_inasistencia?: string;
      notas?: string;
    }) => {
      const r = await fetch("/api/v1/asistencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          persona_tipo: "colaborador",
          persona_id,
          estado,
          tipo_inasistencia,
          notas,
          fecha: toLocalISO(),
        }),
      });
      if (!r.ok) throw new Error("Error al registrar");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asistencia"] }),
  });

  const limpiarDiaMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/v1/asistencia/hoy", { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asistencia"] }),
  });

  const abrirModal = (row: ReporteRow) => {
    setModal(row);
    setTipoSel(row.tipo_inasistencia ?? "");
    setNotas(row.notas ?? "");
  };

  const confirmarInasistencia = () => {
    if (!inasistenciaModal || !tipoSel) return;
    registrarMutation.mutate({
      persona_id: inasistenciaModal.colaborador_id,
      estado: "Inasistencia",
      tipo_inasistencia: tipoSel,
      notas,
    });
    setModal(null);
  };

  if (isLoading) return <div className="p-8 text-muted-foreground text-sm">{t("loading")}</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {deptActual && (
            <button
              onClick={() => { setDeptActual(null); setBusqueda(""); }}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft size={15} />
            </button>
          )}
          <h2 className="text-xl font-semibold">{deptActual ?? t("asistencia:title")}</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={t("asistencia:searchPlaceholder")}
              className="pl-8 pr-3 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring w-44"
            />
          </div>
          {user?.role === "admin" && (
            <button
              onClick={() => { if (confirm(t("asistencia:clearDayConfirm"))) limpiarDiaMutation.mutate(); }}
              className="flex items-center gap-1.5 text-xs text-destructive hover:bg-destructive/10 px-3 py-1.5 rounded-md border border-destructive/30 transition-colors"
            >
              <Trash2 size={13} /> {t("asistencia:clearDay")}
            </button>
          )}
        </div>
      </div>

      {!deptActual ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {deptCards.map((dept) => {
            const s = deptStats.get(dept)!;
            return (
              <DeptCard
                key={dept}
                nombre={dept}
                color={DEPT_COLORS[dept] ?? "#888"}
                stats={{ presentes: s.presentes, inasistencias: s.inasistencias, sinRegistro: s.sinRegistro }}
                onClick={() => setDeptActual(dept)}
              />
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">{t("asistencia:employee")}</th>
                <th className="px-3 py-3 font-medium text-muted-foreground">{t("asistencia:payroll")}</th>
                <th className="px-3 py-3 font-medium text-muted-foreground">{t("asistencia:position")}</th>
                <th className="px-3 py-3 font-medium text-muted-foreground">{t("asistencia:status")}</th>
                <th className="px-3 py-3 font-medium text-muted-foreground">{t("asistencia:actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-muted-foreground">
                    {todosRegistrados ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-2xl">✓</span>
                        <span className="font-medium text-green-600">{t("asistencia:allRegistered")}</span>
                        <span className="text-xs">{t("asistencia:allRegisteredDesc")}</span>
                      </div>
                    ) : t("asistencia:noEmployees")}
                  </td>
                </tr>
              ) : filas.map((r) => (
                <tr key={r.colaborador_id} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar nombre={r.nombre} apellido={r.apellido} fotoPerfil={r.foto_perfil} size="sm" />
                      <span className="font-medium">{r.fullname}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.numero_empleado ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.puesto ?? "—"}</td>
                  <td className="px-3 py-2">
                    {!r.estado ? (
                      <span className="text-muted-foreground">{t("asistencia:noRecord")}</span>
                    ) : r.estado === "Presente" ? (
                      <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">{t("asistencia:present")}</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                        {r.tipo_inasistencia ?? t("asistencia:absence")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => registrarMutation.mutate({ persona_id: r.colaborador_id, estado: "Presente" })}
                        className={cn(
                          "px-2.5 py-1 text-xs rounded-md border transition-colors",
                          r.estado === "Presente"
                            ? "bg-green-500 text-white border-green-500"
                            : "border-green-500 text-green-600 hover:bg-green-50"
                        )}
                      >
                        {t("asistencia:present")}
                      </button>
                      <button
                        onClick={() => abrirModal(r)}
                        className={cn(
                          "px-2.5 py-1 text-xs rounded-md border transition-colors",
                          r.estado === "Inasistencia"
                            ? "bg-red-500 text-white border-red-500"
                            : "border-red-400 text-red-500 hover:bg-red-50"
                        )}
                      >
                        {t("asistencia:absence")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Inasistencia modal */}
      {inasistenciaModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-sm">
            <div className="p-5 border-b border-border">
              <h3 className="font-semibold">{t("asistencia:registerAbsence")}</h3>
              <p className="text-sm text-muted-foreground mt-0.5">{inasistenciaModal.fullname}</p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1.5">{t("asistencia:absenceType")}</label>
                <div className="grid grid-cols-2 gap-2">
                  {TIPOS_INASISTENCIA.map((t) => (
                    <button
                      key={t.code}
                      onClick={() => setTipoSel(t.code)}
                      className={cn(
                        "px-3 py-2 text-xs rounded-md border text-left transition-colors",
                        tipoSel === t.code
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border hover:bg-muted"
                      )}
                    >
                      <span className="font-bold">{t.code}</span>
                      <span className="block text-[10px] opacity-70 truncate">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">{t("asistencia:notes")}</label>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  rows={2}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors">
                {t("cancel")}
              </button>
              <button
                onClick={confirmarInasistencia}
                disabled={!tipoSel || registrarMutation.isPending}
                className="px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
              >
                {t("asistencia:register")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
