import { z } from "zod";
import { TIPOS_INASISTENCIA, TIPOS_BAJA, TURNOS } from "./constants.js";

const tipoCodes = TIPOS_INASISTENCIA.map((t) => t.code) as [string, ...string[]];
const tiposBaja = TIPOS_BAJA as unknown as [string, ...string[]];
const turnos = TURNOS as unknown as [string, ...string[]];

export const loginSchema = z.object({
  username: z.string().min(1, "El usuario es requerido"),
  password: z.string().min(1, "La contraseña es requerida"),
});

export const usuarioCreateSchema = z.object({
  nombre:          z.string().min(1).max(100),
  apellido:        z.string().min(1).max(100),
  password:        z.string().min(6, "Mínimo 6 caracteres"),
  role:            z.enum(["admin", "usuario"]).default("usuario"),
  turno:           z.enum(turnos).optional(),
  departamento:    z.string().max(100).optional(),
  puesto:          z.string().max(100).optional(),
  numero_empleado: z.string().max(20).optional(),
  fecha_ingreso:   z.string().optional(),
});

export const usuarioUpdateSchema = usuarioCreateSchema
  .omit({ password: true })
  .extend({ password: z.string().min(6).optional() });

export const colaboradorSchema = z.object({
  nombre:          z.string().min(1).max(100),
  apellido:        z.string().min(1).max(100),
  departamento:    z.string().min(1).max(100),
  puesto:          z.string().max(100).optional(),
  turno:           z.string().max(20).optional(),
  numero_empleado: z.string().max(20).optional(),
  fecha_ingreso:   z.string().optional(),
});

export const asistenciaSchema = z.object({
  fecha:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  estado:            z.string().default("Presente"),
  tipo_inasistencia: z.enum(tipoCodes).optional(),
  notas:             z.string().max(500).optional(),
  persona_tipo:      z.enum(["usuario", "colaborador"]),
  persona_id:        z.number().int().positive(),
});

export const bajaSchema = z.object({
  activo:      z.literal(false),
  tipo_baja:   z.enum(tiposBaja),
  fecha_baja:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  motivo_baja: z.string().max(500).optional(),
});

export const reactivarSchema = z.object({
  activo: z.literal(true),
});

export const tiempoExtraSchema = z.object({
  colaborador_id: z.number().int().positive(),
  fecha:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  hora_inicio:    z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:MM requerido"),
  hora_fin:       z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:MM requerido"),
  horas_totales:  z.number().positive("Las horas deben ser positivas"),
  area:           z.string().min(1).max(100),
  motivo:         z.string().min(1, "El motivo es requerido"),
  autorizado_por: z.string().min(1, "El autorizador es requerido").max(100),
});

export type TiempoExtraInput = z.infer<typeof tiempoExtraSchema>;

export const tiempoExtraUpdateSchema = tiempoExtraSchema.omit({ colaborador_id: true });
export type TiempoExtraUpdateInput = z.infer<typeof tiempoExtraUpdateSchema>;

export type LoginInput          = z.infer<typeof loginSchema>;
export type UsuarioCreateInput  = z.infer<typeof usuarioCreateSchema>;
export type UsuarioUpdateInput  = z.infer<typeof usuarioUpdateSchema>;
export type ColaboradorInput    = z.infer<typeof colaboradorSchema>;
export type AsistenciaInput     = z.infer<typeof asistenciaSchema>;
export type BajaInput           = z.infer<typeof bajaSchema>;
