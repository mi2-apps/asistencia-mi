import {
  pgTable,
  serial,
  varchar,
  text,
  boolean,
  date,
  timestamp,
  integer,
  numeric,
  uniqueIndex,
  index,
  check,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql, relations } from "drizzle-orm";

// ─── usuarios ────────────────────────────────────────────────────────────────

export const usuarios = pgTable("usuarios", {
  id:              serial("id").primaryKey(),
  username:        varchar("username", { length: 60 }).notNull().unique(),
  password_hash:   text("password").notNull(),
  nombre:          varchar("nombre", { length: 100 }).notNull(),
  apellido:        varchar("apellido", { length: 100 }).notNull(),
  role:            varchar("role", { length: 20 }).notNull().default("usuario"),
  turno:           varchar("turno", { length: 20 }),
  departamento:    varchar("departamento", { length: 100 }),
  puesto:          varchar("puesto", { length: 100 }),
  numero_empleado: varchar("numero_empleado", { length: 20 }),
  fecha_ingreso:   date("fecha_ingreso"),
  foto_perfil:     text("foto_perfil"),
  nextcloud_sub:   varchar("nextcloud_sub", { length: 255 }).unique(),
  permisos:        jsonb("permisos").$type<Record<string, string[]>>(),
  created_at:      timestamp("created_at").defaultNow().notNull(),
  updated_at:      timestamp("updated_at").defaultNow().notNull(),
});

// ─── colaboradores ────────────────────────────────────────────────────────────

export const colaboradores = pgTable(
  "colaboradores",
  {
    id:              serial("id").primaryKey(),
    nombre:          varchar("nombre", { length: 100 }).notNull(),
    apellido:        varchar("apellido", { length: 100 }).notNull(),
    departamento:    varchar("departamento", { length: 100 }).notNull(),
    puesto:          varchar("puesto", { length: 100 }),
    turno:           varchar("turno", { length: 20 }),
    numero_empleado: varchar("numero_empleado", { length: 20 }),
    fecha_ingreso:   date("fecha_ingreso"),
    foto_perfil:     text("foto_perfil"),
    activo:          boolean("activo").notNull().default(true),
    fecha_baja:      date("fecha_baja"),
    tipo_baja:       varchar("tipo_baja", { length: 60 }),
    motivo_baja:     text("motivo_baja"),
    created_at:      timestamp("created_at").defaultNow().notNull(),
    updated_at:      timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    // UNIQUE on numero_empleado only when it is NOT NULL
    numEmpUniqueIdx: uniqueIndex("colaboradores_numero_empleado_unique_idx")
      .on(table.numero_empleado)
      .where(sql`${table.numero_empleado} IS NOT NULL`),
  })
);

// ─── asistencia ───────────────────────────────────────────────────────────────

export const asistencia = pgTable(
  "asistencia",
  {
    id:                serial("id").primaryKey(),
    fecha:             date("fecha").notNull(),
    estado:            varchar("estado", { length: 30 }).notNull().default("Presente"),
    tipo_inasistencia: varchar("tipo_inasistencia", { length: 30 }),
    notas:             text("notas"),
    registrado_por:    varchar("registrado_por", { length: 60 }),
    usuario_id:        integer("usuario_id").references(() => usuarios.id, { onDelete: "cascade" }),
    colaborador_id:    integer("colaborador_id").references(() => colaboradores.id, { onDelete: "cascade" }),
    created_at:        timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    // XOR: exactly one of usuario_id or colaborador_id must be set
    xorPersona: check(
      "asistencia_xor_persona",
      sql`(${table.usuario_id} IS NOT NULL)::int + (${table.colaborador_id} IS NOT NULL)::int = 1`
    ),
    fechaIdx: index("asistencia_fecha_idx").on(table.fecha),
  })
);

// ─── tiempo_extra ─────────────────────────────────────────────────────────────

export const tiempoExtra = pgTable("tiempo_extra", {
  id:             serial("id").primaryKey(),
  colaborador_id: integer("colaborador_id").notNull().references(() => colaboradores.id, { onDelete: "cascade" }),
  fecha:          date("fecha").notNull(),
  hora_inicio:    varchar("hora_inicio", { length: 5 }).notNull(),
  hora_fin:       varchar("hora_fin",    { length: 5 }).notNull(),
  horas_totales:  numeric("horas_totales", { precision: 4, scale: 2 }).notNull(),
  area:           varchar("area",         { length: 100 }).notNull(),
  motivo:         text("motivo").notNull(),
  autorizado_por: varchar("autorizado_por", { length: 100 }).notNull(),
  registrado_por: varchar("registrado_por", { length: 60 }).notNull(),
  created_at:     timestamp("created_at").defaultNow(),
});

// ─── session (connect-pg-simple) ─────────────────────────────────────────────

export const sessions = pgTable("session", {
  sid:    varchar("sid").primaryKey(),
  sess:   text("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
});

// ─── relations ────────────────────────────────────────────────────────────────

export const usuariosRelations = relations(usuarios, ({ many }) => ({
  asistencia: many(asistencia),
}));

export const colaboradoresRelations = relations(colaboradores, ({ many }) => ({
  asistencia: many(asistencia),
}));

export const asistenciaRelations = relations(asistencia, ({ one }) => ({
  usuario:     one(usuarios,      { fields: [asistencia.usuario_id],     references: [usuarios.id] }),
  colaborador: one(colaboradores, { fields: [asistencia.colaborador_id], references: [colaboradores.id] }),
}));

// ─── inferred types ───────────────────────────────────────────────────────────

export type Usuario          = typeof usuarios.$inferSelect;
export type NuevoUsuario     = typeof usuarios.$inferInsert;
export type Colaborador      = typeof colaboradores.$inferSelect;
export type NuevoColaborador = typeof colaboradores.$inferInsert;
export type Asistencia       = typeof asistencia.$inferSelect;
export type NuevaAsistencia  = typeof asistencia.$inferInsert;
