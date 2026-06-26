import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Camera, Search, Edit2, UserMinus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@client/components/ui/Avatar";
import { DeptCard } from "@client/components/ui/DeptCard";
import { Combobox } from "@client/components/ui/Combobox";
import { DEPARTAMENTOS_LIST, DEPT_COLORS, PUESTOS_LIST, TURNOS, TIPOS_BAJA } from "@shared/constants";
import { colaboradorSchema } from "@shared/validators";
import type { ColaboradorInput } from "@shared/validators";
import { calcularAntiguedad, formatFecha, cn } from "@client/lib/utils";
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
  anios_en_planta: number | null;
}

const inputCls = "w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring h-10";

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium block mb-1.5">{label}</label>
      {children}
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}

export default function Colaboradores() {
  const { t } = useTranslation();
  const { allowedDepts } = useAuthStore();
  const deptCards = useMemo(() => {
    const allowed = allowedDepts("colaboradores");
    if (allowed === null) return [...DEPARTAMENTOS_LIST];
    return [...DEPARTAMENTOS_LIST].filter((d) => allowed.includes(d));
  }, [allowedDepts]);

  const [deptActual, setDeptActual]       = useState<string | null>(null);
  const [busqueda, setBusqueda]           = useState("");
  const [editando, setEditando]           = useState<Colaborador | null>(null);
  const [bajaTarget, setBajaTarget]       = useState<Colaborador | null>(null);
  const [eliminarTarget, setEliminarTarget] = useState<Colaborador | null>(null);
  const [eliminarError, setEliminarError]   = useState<string | null>(null);
  const [tipoBaja, setTipoBaja]           = useState("");
  const [fechaBaja, setFechaBaja]         = useState(new Date().toISOString().slice(0, 10));
  const [motivoBaja, setMotivoBaja]       = useState("");
  const [fotoPreview, setFotoPreview]     = useState<string | null>(null);
  const fotoInputRef                      = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ colaboradores: Colaborador[] }>({
    queryKey: ["colaboradores"],
    queryFn: () => fetch("/api/v1/colaboradores?activo=true", { credentials: "include" }).then((r) => r.json()),
  });
  const todos = data?.colaboradores ?? [];

  const countByDept = (dept: string) => todos.filter((c) => c.departamento === dept).length;

  const filas = useMemo(() => {
    let lista = deptActual ? todos.filter((c) => c.departamento === deptActual) : todos;
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      lista = lista.filter(
        (c) =>
          c.fullname.toLowerCase().includes(q) ||
          c.puesto?.toLowerCase().includes(q) ||
          c.numero_empleado?.toLowerCase().includes(q) ||
          c.departamento.toLowerCase().includes(q)
      );
    }
    return lista;
  }, [todos, deptActual, busqueda]);

  const editForm = useForm<ColaboradorInput>({
    resolver: zodResolver(colaboradorSchema),
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ColaboradorInput }) => {
      const r = await fetch(`/api/v1/colaboradores/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Error al guardar");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["colaboradores"] }); setEditando(null); setFotoPreview(null); },
  });

  const fotoMutation = useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const fd = new FormData();
      fd.append("foto", file);
      const r = await fetch(`/api/v1/colaboradores/${id}/foto`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!r.ok) throw new Error("Error al subir foto");
      return r.json() as Promise<{ foto_perfil: string }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
    },
  });

  const bajaMutation = useMutation({
    mutationFn: async ({ id, tipo_baja, fecha_baja, motivo_baja }: { id: number; tipo_baja: string; fecha_baja: string; motivo_baja?: string }) => {
      const r = await fetch(`/api/v1/colaboradores/${id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ activo: false, tipo_baja, fecha_baja, motivo_baja }),
      });
      if (!r.ok) throw new Error("Error al dar de baja");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
      qc.invalidateQueries({ queryKey: ["bajas"] });
      setBajaTarget(null);
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/v1/colaboradores/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (r.status === 409 || r.status === 500) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message ?? "Error al eliminar");
      }
      if (!r.ok && r.status !== 204) throw new Error("Error al eliminar");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
      setEliminarTarget(null);
      setEliminarError(null);
    },
    onError: (err: Error) => {
      const msg = err.message.includes("foreign key") || err.message.includes("violates")
        ? "No se puede eliminar porque tiene registros de asistencia o tiempo extra asociados."
        : err.message;
      setEliminarError(msg);
    },
  });

  const abrirEditar = (c: Colaborador) => {
    setEditando(c);
    setFotoPreview(null);
    editForm.reset({
      nombre:          c.nombre,
      apellido:        c.apellido,
      departamento:    c.departamento,
      puesto:          c.puesto ?? "",
      turno:           (c.turno as any) ?? undefined,
      numero_empleado: c.numero_empleado ?? "",
      fecha_ingreso:   c.fecha_ingreso ?? "",
    });
  };

  const confirmarBaja = () => {
    if (!bajaTarget || !tipoBaja) return;
    bajaMutation.mutate({ id: bajaTarget.id, tipo_baja: tipoBaja, fecha_baja: fechaBaja, motivo_baja: motivoBaja || undefined });
  };

  if (isLoading) return <div className="p-8 text-muted-foreground text-sm">{t("loading")}</div>;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {deptActual && (
            <button onClick={() => { setDeptActual(null); setBusqueda(""); }} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft size={15} />
            </button>
          )}
          <h2 className="text-xl font-semibold">{deptActual ?? t("colaboradores:title")}</h2>
          {deptActual && <span className="text-sm text-muted-foreground">({filas.length})</span>}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={deptActual ? t("colaboradores:searchDept") : t("colaboradores:searchAll")}
            className="pl-8 pr-3 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring w-48"
          />
        </div>
      </div>

      {!deptActual && !busqueda ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {deptCards.map((dept) => (
            <DeptCard
              key={dept}
              nombre={dept}
              color={DEPT_COLORS[dept] ?? "#888"}
              stats={{ total: countByDept(dept) }}
              onClick={() => setDeptActual(dept)}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filas.length === 0 ? (
            <p className="text-muted-foreground text-sm col-span-full">{t("colaboradores:noResults")}</p>
          ) : filas.map((c) => (
            <div key={c.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar nombre={c.nombre} apellido={c.apellido} fotoPerfil={c.foto_perfil} size="md" />
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{c.fullname}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.puesto ?? "—"}</p>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => abrirEditar(c)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => { setBajaTarget(c); setTipoBaja(""); setFechaBaja(new Date().toISOString().slice(0, 10)); setMotivoBaja(""); }} className="p-1.5 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive">
                    <UserMinus size={13} />
                  </button>
                  <button onClick={() => { setEliminarTarget(c); setEliminarError(null); }} className="p-1.5 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="text-xs space-y-0.5 text-muted-foreground">
                {c.numero_empleado && <p><span className="font-medium text-foreground">{t("colaboradores:payrollLabel")}</span>{c.numero_empleado}</p>}
                {c.turno && <p><span className="font-medium text-foreground">{t("colaboradores:shiftLabel")}</span>{c.turno}</p>}
                <p><span className="font-medium text-foreground">{t("colaboradores:seniorityLabel")}</span>{calcularAntiguedad(c.fecha_ingreso)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editando && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold">{t("colaboradores:editTitle")}</h3>
              <button onClick={() => setEditando(null)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
            </div>
            <form onSubmit={editForm.handleSubmit((d) => editMutation.mutate({ id: editando.id, data: d }))} className="p-5 space-y-4">

              {/* Foto de perfil */}
              <div className="flex flex-col items-center gap-1.5 pb-1">
                <div
                  className="relative group cursor-pointer"
                  onClick={() => fotoInputRef.current?.click()}
                  title="Cambiar foto de perfil"
                >
                  {fotoPreview ? (
                    <img src={fotoPreview} alt="preview" className="w-20 h-20 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <Avatar
                      nombre={editando.nombre}
                      apellido={editando.apellido}
                      fotoPerfil={editando.foto_perfil}
                      size="lg"
                      className="w-20 h-20 text-2xl"
                    />
                  )}
                  <div className="absolute inset-0 rounded-full bg-black/45 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {fotoMutation.isPending ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Camera size={20} className="text-white" />
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {fotoMutation.isPending ? "Subiendo..." : fotoMutation.isSuccess ? "Foto actualizada" : "Click para cambiar foto"}
                </p>
                {fotoMutation.isError && (
                  <p className="text-xs text-destructive">Error al subir la foto</p>
                )}
                <input
                  ref={fotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setFotoPreview(URL.createObjectURL(file));
                    fotoMutation.mutate({ id: editando.id, file });
                    e.target.value = "";
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t("nombre")} error={editForm.formState.errors.nombre?.message}>
                  <input {...editForm.register("nombre")} className={inputCls} />
                </Field>
                <Field label={t("apellido")} error={editForm.formState.errors.apellido?.message}>
                  <input {...editForm.register("apellido")} className={inputCls} />
                </Field>
              </div>
              <Field label={t("departamento")} error={editForm.formState.errors.departamento?.message}>
                <Combobox options={[...DEPARTAMENTOS_LIST]} value={editForm.watch("departamento") ?? ""} onChange={(v) => editForm.setValue("departamento", v, { shouldValidate: true })} placeholder={t("selectDept")} />
              </Field>
              <Field label={t("puesto")}>
                <Combobox options={[...PUESTOS_LIST]} value={editForm.watch("puesto") ?? ""} onChange={(v) => editForm.setValue("puesto", v)} placeholder={t("selectPuesto")} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("turno")}>
                  <select {...editForm.register("turno")} className={inputCls}>
                    <option value="">{t("selectTurno")}</option>
                    {TURNOS.map((t) => <option key={t} value={t}>{t}</option>)}
                    {/* Opción legacy: si el valor en DB no está en la lista estándar */}
                    {editando.turno && !TURNOS.includes(editando.turno as typeof TURNOS[number]) && (
                      <option value={editando.turno}>{editando.turno} (legacy)</option>
                    )}
                  </select>
                </Field>
                <Field label={t("noEmpleado")}>
                  <input {...editForm.register("numero_empleado")} className={inputCls} />
                </Field>
              </div>
              <Field label={t("fechaIngreso")}>
                <input type="date" {...editForm.register("fecha_ingreso")} className={inputCls} />
              </Field>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditando(null)} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors">{t("cancel")}</button>
                <button type="submit" disabled={editMutation.isPending} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {editMutation.isPending ? t("saving") : t("save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Eliminar modal */}
      {eliminarTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-sm">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-destructive">Eliminar colaborador</h3>
              <button onClick={() => { setEliminarTarget(null); setEliminarError(null); }} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm">¿Eliminar permanentemente a <span className="font-medium">{eliminarTarget.fullname}</span>?</p>
              <p className="text-xs text-muted-foreground">Esta acción no se puede deshacer.</p>
              {eliminarError && <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">{eliminarError}</p>}
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => { setEliminarTarget(null); setEliminarError(null); }} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors">Cancelar</button>
              <button onClick={() => eliminarMutation.mutate(eliminarTarget.id)} disabled={eliminarMutation.isPending} className="px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors">
                {eliminarMutation.isPending ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Baja modal */}
      {bajaTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-sm">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold">{t("colaboradores:terminateTitle")}</h3>
              <button onClick={() => setBajaTarget(null)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm"><span className="font-medium">{bajaTarget.fullname}</span> — {bajaTarget.departamento}</p>
              <Field label={t("colaboradores:terminationType")}>
                <select value={tipoBaja} onChange={(e) => setTipoBaja(e.target.value)} className={inputCls}>
                  <option value="">{t("colaboradores:selectOption")}</option>
                  {TIPOS_BAJA.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label={t("colaboradores:terminationDate")}>
                <input type="date" value={fechaBaja} onChange={(e) => setFechaBaja(e.target.value)} className={inputCls} />
              </Field>
              <Field label={t("colaboradores:terminationReason")}>
                <textarea value={motivoBaja} onChange={(e) => setMotivoBaja(e.target.value)} rows={2} className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
              </Field>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => setBajaTarget(null)} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors">{t("cancel")}</button>
              <button onClick={confirmarBaja} disabled={!tipoBaja || bajaMutation.isPending} className="px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors">
                {bajaMutation.isPending ? t("colaboradores:savingDots") : t("colaboradores:terminate")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
