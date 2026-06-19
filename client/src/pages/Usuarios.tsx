import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Search, Edit2, Trash2, UserPlus } from "lucide-react";
import { Avatar } from "@client/components/ui/Avatar";
import { Combobox } from "@client/components/ui/Combobox";
import { DEPARTAMENTOS_LIST, PUESTOS_LIST, TURNOS } from "@shared/constants";
import { usuarioCreateSchema, usuarioUpdateSchema } from "@shared/validators";
import type { UsuarioCreateInput, UsuarioUpdateInput } from "@shared/validators";
import { calcularAntiguedad, generarUsername } from "@client/lib/utils";

interface Usuario {
  id: number;
  username: string;
  fullname: string;
  nombre: string;
  apellido: string;
  role: string;
  departamento: string | null;
  turno: string | null;
  puesto: string | null;
  numero_empleado: string | null;
  fecha_ingreso: string | null;
  foto_perfil: string | null;
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

type Mode = "list" | "crear" | "editar";

export default function Usuarios() {
  const [mode, setMode]       = useState<Mode>("list");
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ usuarios: Usuario[] }>({
    queryKey: ["usuarios"],
    queryFn: () => fetch("/api/v1/usuarios", { credentials: "include" }).then((r) => r.json()),
  });
  const usuarios = data?.usuarios ?? [];

  const filtrados = useMemo(() => {
    if (!busqueda.trim()) return usuarios;
    const q = busqueda.toLowerCase();
    return usuarios.filter(
      (u) => u.fullname.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || u.departamento?.toLowerCase().includes(q)
    );
  }, [usuarios, busqueda]);

  const crearForm = useForm<UsuarioCreateInput>({ resolver: zodResolver(usuarioCreateSchema) });
  const editForm  = useForm<UsuarioUpdateInput>({ resolver: zodResolver(usuarioUpdateSchema) });

  const nombreWatch  = crearForm.watch("nombre") ?? "";
  const apellidoWatch = crearForm.watch("apellido") ?? "";
  const usernamePreview = nombreWatch && apellidoWatch ? generarUsername(nombreWatch, apellidoWatch) : "—";

  const crearMutation = useMutation({
    mutationFn: async (data: UsuarioCreateInput) => {
      const r = await fetch("/api/v1/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["usuarios"] }); setMode("list"); crearForm.reset(); },
  });

  const editMutation = useMutation({
    mutationFn: async ({ username, data }: { username: string; data: UsuarioUpdateInput }) => {
      const r = await fetch(`/api/v1/usuarios/${username}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["usuarios"] }); setMode("list"); setEditando(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (username: string) => {
      await fetch(`/api/v1/usuarios/${username}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["usuarios"] }),
  });

  const abrirEditar = (u: Usuario) => {
    setEditando(u);
    editForm.reset({
      nombre:          u.nombre,
      apellido:        u.apellido,
      role:            u.role as any,
      departamento:    u.departamento ?? "",
      turno:           (u.turno as any) ?? undefined,
      puesto:          u.puesto ?? "",
      numero_empleado: u.numero_empleado ?? "",
      fecha_ingreso:   u.fecha_ingreso ?? "",
      password:        undefined,
    });
    setMode("editar");
  };

  if (isLoading) return <div className="p-8 text-muted-foreground text-sm">Cargando...</div>;

  if (mode === "crear") {
    return (
      <div className="p-6 max-w-xl">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => setMode("list")} className="text-sm text-muted-foreground hover:text-foreground">← Volver</button>
          <h2 className="text-xl font-semibold">Nuevo Usuario</h2>
        </div>
        <form onSubmit={crearForm.handleSubmit((d) => crearMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nombre *" error={crearForm.formState.errors.nombre?.message}><input {...crearForm.register("nombre")} className={inputCls} /></Field>
            <Field label="Apellido *" error={crearForm.formState.errors.apellido?.message}><input {...crearForm.register("apellido")} className={inputCls} /></Field>
          </div>
          <div className="bg-muted/40 rounded-md px-3 py-2 text-xs text-muted-foreground">
            Username generado: <span className="font-mono font-medium text-foreground">{usernamePreview}</span>
          </div>
          <Field label="Contraseña *" error={crearForm.formState.errors.password?.message}><input type="password" {...crearForm.register("password")} className={inputCls} /></Field>
          <Field label="Rol *" error={crearForm.formState.errors.role?.message}>
            <select {...crearForm.register("role")} className={inputCls}>
              <option value="usuario">Usuario</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <Field label="Departamento"><Combobox options={[...DEPARTAMENTOS_LIST]} value={crearForm.watch("departamento") ?? ""} onChange={(v) => crearForm.setValue("departamento" as any, v)} /></Field>
          <Field label="Puesto"><Combobox options={[...PUESTOS_LIST]} value={crearForm.watch("puesto") ?? ""} onChange={(v) => crearForm.setValue("puesto" as any, v)} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Turno">
              <select {...crearForm.register("turno")} className={inputCls}>
                <option value="">— Turno —</option>
                {TURNOS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="N° Empleado"><input {...crearForm.register("numero_empleado")} className={inputCls} /></Field>
          </div>
          <Field label="Fecha de ingreso"><input type="date" {...crearForm.register("fecha_ingreso")} className={inputCls} /></Field>
          {crearMutation.error && <p className="text-sm text-destructive">{(crearMutation.error as Error).message}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setMode("list")} className="px-5 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors">Cancelar</button>
            <button type="submit" disabled={crearMutation.isPending} className="px-5 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">{crearMutation.isPending ? "Guardando..." : "Crear Usuario"}</button>
          </div>
        </form>
      </div>
    );
  }

  if (mode === "editar" && editando) {
    return (
      <div className="p-6 max-w-xl">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => setMode("list")} className="text-sm text-muted-foreground hover:text-foreground">← Volver</button>
          <h2 className="text-xl font-semibold">Editar Usuario — <span className="font-mono text-base">{editando.username}</span></h2>
        </div>
        <form onSubmit={editForm.handleSubmit((d) => editMutation.mutate({ username: editando.username, data: d }))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nombre *" error={editForm.formState.errors.nombre?.message}><input {...editForm.register("nombre")} className={inputCls} /></Field>
            <Field label="Apellido *" error={editForm.formState.errors.apellido?.message}><input {...editForm.register("apellido")} className={inputCls} /></Field>
          </div>
          <Field label="Nueva contraseña (dejar vacío para no cambiar)" error={editForm.formState.errors.password?.message}><input type="password" {...editForm.register("password")} className={inputCls} /></Field>
          <Field label="Rol *">
            <select {...editForm.register("role")} className={inputCls}>
              <option value="usuario">Usuario</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <Field label="Departamento"><Combobox options={[...DEPARTAMENTOS_LIST]} value={editForm.watch("departamento") ?? ""} onChange={(v) => editForm.setValue("departamento" as any, v)} /></Field>
          <Field label="Puesto"><Combobox options={[...PUESTOS_LIST]} value={editForm.watch("puesto") ?? ""} onChange={(v) => editForm.setValue("puesto" as any, v)} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Turno">
              <select {...editForm.register("turno")} className={inputCls}>
                <option value="">— Turno —</option>
                {TURNOS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="N° Empleado"><input {...editForm.register("numero_empleado")} className={inputCls} /></Field>
          </div>
          <Field label="Fecha de ingreso"><input type="date" {...editForm.register("fecha_ingreso")} className={inputCls} /></Field>
          {editMutation.error && <p className="text-sm text-destructive">{(editMutation.error as Error).message}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setMode("list")} className="px-5 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors">Cancelar</button>
            <button type="submit" disabled={editMutation.isPending} className="px-5 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">{editMutation.isPending ? "Guardando..." : "Guardar Cambios"}</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-semibold">Usuarios ({filtrados.length})</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar..." className="pl-8 pr-3 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring w-44" />
          </div>
          <button onClick={() => setMode("crear")} className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors">
            <UserPlus size={14} /> Nuevo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtrados.map((u) => (
          <div key={u.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar nombre={u.nombre} apellido={u.apellido} fotoPerfil={u.foto_perfil} size="md" />
                <div className="min-w-0">
                  <p className="font-semibold truncate">{u.fullname}</p>
                  <p className="text-xs font-mono text-muted-foreground">{u.username}</p>
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => abrirEditar(u)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"><Edit2 size={13} /></button>
                {u.username !== "admin" && (
                  <button onClick={() => { if (confirm(`¿Eliminar a ${u.fullname}?`)) deleteMutation.mutate(u.username); }} className="p-1.5 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"><Trash2 size={13} /></button>
                )}
              </div>
            </div>
            <div className="text-xs space-y-0.5 text-muted-foreground">
              <p><span className="font-medium text-foreground">Rol: </span><span className="capitalize">{u.role}</span></p>
              {u.departamento && <p><span className="font-medium text-foreground">Depto: </span>{u.departamento}</p>}
              <p><span className="font-medium text-foreground">Antigüedad: </span>{calcularAntiguedad(u.fecha_ingreso)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
