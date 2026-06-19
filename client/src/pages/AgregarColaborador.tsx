import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Combobox } from "@client/components/ui/Combobox";
import { DEPARTAMENTOS_LIST, PUESTOS_LIST, TURNOS } from "@shared/constants";
import { colaboradorSchema } from "@shared/validators";
import type { ColaboradorInput } from "@shared/validators";

export default function AgregarColaborador() {
  const [, navigate] = useLocation();
  const [foto, setFoto]     = useState<File | null>(null);
  const qc = useQueryClient();

  const form = useForm<ColaboradorInput>({
    resolver: zodResolver(colaboradorSchema),
    defaultValues: { nombre: "", apellido: "", departamento: "", puesto: "", turno: undefined },
  });

  const mutation = useMutation({
    mutationFn: async (data: ColaboradorInput) => {
      const r = await fetch("/api/v1/colaboradores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.message ?? "Error al crear colaborador");
      }
      return r.json() as Promise<{ colaborador: { id: number } }>;
    },
    onSuccess: async ({ colaborador }) => {
      if (foto) {
        const fd = new FormData();
        fd.append("foto", foto);
        fetch(`/api/v1/colaboradores/${colaborador.id}/foto`, {
          method: "POST",
          credentials: "include",
          body: fd,
        }).catch(() => {});
      }
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
      navigate("/colaboradores");
    },
  });

  return (
    <div className="p-6 max-w-xl">
      <h2 className="text-xl font-semibold mb-5">Agregar Colaborador</h2>

      <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre *" error={form.formState.errors.nombre?.message}>
            <input {...form.register("nombre")} className={inputCls} />
          </Field>
          <Field label="Apellido *" error={form.formState.errors.apellido?.message}>
            <input {...form.register("apellido")} className={inputCls} />
          </Field>
        </div>

        <Field label="Departamento *" error={form.formState.errors.departamento?.message}>
          <Combobox
            options={[...DEPARTAMENTOS_LIST]}
            value={form.watch("departamento") ?? ""}
            onChange={(v) => form.setValue("departamento", v, { shouldValidate: true })}
            placeholder="Seleccionar departamento..."
          />
        </Field>

        <Field label="Puesto" error={form.formState.errors.puesto?.message}>
          <Combobox
            options={[...PUESTOS_LIST]}
            value={form.watch("puesto") ?? ""}
            onChange={(v) => form.setValue("puesto", v)}
            placeholder="Seleccionar puesto..."
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Turno" error={form.formState.errors.turno?.message}>
            <select {...form.register("turno")} className={inputCls}>
              <option value="">— Turno —</option>
              {TURNOS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="N° Empleado" error={form.formState.errors.numero_empleado?.message}>
            <input {...form.register("numero_empleado")} className={inputCls} />
          </Field>
        </div>

        <Field label="Fecha de ingreso" error={form.formState.errors.fecha_ingreso?.message}>
          <input type="date" {...form.register("fecha_ingreso")} className={inputCls} />
        </Field>

        <Field label="Foto de perfil">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
            className="text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
          />
        </Field>

        {mutation.error && (
          <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate("/colaboradores")}
            className="px-5 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="px-5 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? "Guardando..." : "Guardar Colaborador"}
          </button>
        </div>
      </form>
    </div>
  );
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
