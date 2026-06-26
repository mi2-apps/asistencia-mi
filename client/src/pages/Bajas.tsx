import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RotateCcw, FileDown } from "lucide-react";
import { generarPDFBaja } from "@client/lib/pdfBaja";
import { useTranslation } from "react-i18next";
import { Avatar } from "@client/components/ui/Avatar";
import { DeptCard } from "@client/components/ui/DeptCard";
import { DEPARTAMENTOS_LIST, DEPT_COLORS } from "@shared/constants";
import { calcularAntiguedad, formatFecha } from "@client/lib/utils";
import { useAuthStore } from "@client/stores/authStore";

interface Colaborador {
  id: number;
  nombre: string;
  apellido: string;
  fullname: string;
  departamento: string;
  puesto: string | null;
  turno: string | null;
  numero_empleado: string | null;
  fecha_ingreso: string | null;
  foto_perfil: string | null;
  activo: boolean;
  fecha_baja: string | null;
  tipo_baja: string | null;
  motivo_baja: string | null;
  dado_de_baja_por: string | null;
}

async function fetchBajas(): Promise<{ colaboradores: Colaborador[] }> {
  const r = await fetch("/api/v1/colaboradores?activo=false", { credentials: "include" });
  return r.json();
}

export default function Bajas() {
  const { t } = useTranslation();
  const { allowedDepts } = useAuthStore();
  const deptCards = useMemo(() => {
    const allowed = allowedDepts("colaboradores");
    if (allowed === null) return [...DEPARTAMENTOS_LIST];
    return [...DEPARTAMENTOS_LIST].filter((d) => allowed.includes(d));
  }, [allowedDepts]);

  const [deptActual, setDeptActual] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["bajas"], queryFn: fetchBajas });

  const bajas = data?.colaboradores ?? [];

  const countByDept = (dept: string) => bajas.filter((c) => c.departamento === dept).length;

  const reactivarMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/v1/colaboradores/${id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ activo: true }),
      });
      if (!r.ok) throw new Error("Error al reactivar");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bajas"] });
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
    },
  });

  const listaActual = deptActual
    ? bajas.filter((c) => c.departamento === deptActual)
    : [];

  if (isLoading) {
    return <div className="p-8 text-muted-foreground text-sm">{t("bajas:loading")}</div>;
  }

  if (deptActual) {
    return (
      <div className="p-6">
        <button
          onClick={() => setDeptActual(null)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors"
        >
          <ArrowLeft size={15} /> {t("bajas:backToDepts")}
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: DEPT_COLORS[deptActual] ?? "#888" }} />
          <h2 className="text-lg font-semibold">{deptActual}</h2>
          <span className="text-sm text-muted-foreground">{"(" + listaActual.length + " " + t("bajas:terminations") + ")"}</span>
        </div>

        {listaActual.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("bajas:noEmployees")}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {listaActual.map((c) => (
              <div key={c.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar nombre={c.nombre} apellido={c.apellido} fotoPerfil={c.foto_perfil} size="md" />
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{c.fullname}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.puesto ?? "—"}</p>
                  </div>
                </div>

                <div className="text-xs space-y-1 text-muted-foreground">
                  <div className="flex gap-2"><span className="font-medium text-foreground">{t("bajas:typeLabel")}</span>{c.tipo_baja ?? "—"}</div>
                  <div className="flex gap-2"><span className="font-medium text-foreground">{t("bajas:dateLabel")}</span>{formatFecha(c.fecha_baja)}</div>
                  <div className="flex gap-2"><span className="font-medium text-foreground">{t("bajas:seniorityLabel")}</span>{calcularAntiguedad(c.fecha_ingreso)}</div>
                  {c.numero_empleado && <div className="flex gap-2"><span className="font-medium text-foreground">{t("bajas:payrollLabel")}</span>{c.numero_empleado}</div>}
                  {c.dado_de_baja_por && <div className="flex gap-2"><span className="font-medium text-foreground">Registrado por:</span>{c.dado_de_baja_por}</div>}
                </div>

                {c.motivo_baja && (
                  <p className="text-xs bg-muted rounded p-2 text-muted-foreground">{c.motivo_baja}</p>
                )}

                <div className="flex items-center justify-between">
                  <button
                    onClick={() => reactivarMutation.mutate(c.id)}
                    disabled={reactivarMutation.isPending}
                    className="flex items-center gap-1.5 text-xs text-brand-green hover:underline disabled:opacity-50"
                  >
                    <RotateCcw size={12} /> {t("bajas:reactivate")}
                  </button>
                  <button
                    onClick={() => generarPDFBaja(c)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    title="Generar PDF de baja"
                  >
                    <FileDown size={12} /> PDF
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-1">{t("bajas:title")}</h2>
      <p className="text-sm text-muted-foreground mb-5">{t("bajas:subtitle_other", { count: bajas.length })}</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {deptCards.map((dept) => (
          <DeptCard
            key={dept}
            nombre={dept}
            color={DEPT_COLORS[dept] ?? "#888"}
            stats={{ bajas: countByDept(dept) }}
            onClick={() => setDeptActual(dept)}
          />
        ))}
      </div>
    </div>
  );
}
