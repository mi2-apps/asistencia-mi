CREATE TABLE IF NOT EXISTS "asistencia" (
	"id" serial PRIMARY KEY NOT NULL,
	"fecha" date NOT NULL,
	"estado" varchar(30) DEFAULT 'Presente' NOT NULL,
	"tipo_inasistencia" varchar(30),
	"notas" text,
	"usuario_id" integer,
	"colaborador_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "colaboradores" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(100) NOT NULL,
	"apellido" varchar(100) NOT NULL,
	"departamento" varchar(100) NOT NULL,
	"puesto" varchar(100),
	"turno" varchar(20),
	"numero_empleado" varchar(20),
	"fecha_ingreso" date,
	"foto_perfil" text,
	"activo" boolean DEFAULT true NOT NULL,
	"fecha_baja" date,
	"tipo_baja" varchar(60),
	"motivo_baja" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" text NOT NULL,
	"expire" timestamp (6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(60) NOT NULL,
	"password_hash" text NOT NULL,
	"nombre" varchar(100) NOT NULL,
	"apellido" varchar(100) NOT NULL,
	"role" varchar(20) DEFAULT 'usuario' NOT NULL,
	"turno" varchar(20),
	"departamento" varchar(100),
	"puesto" varchar(100),
	"numero_empleado" varchar(20),
	"fecha_ingreso" date,
	"foto_perfil" text,
	"nextcloud_sub" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_username_unique" UNIQUE("username"),
	CONSTRAINT "usuarios_nextcloud_sub_unique" UNIQUE("nextcloud_sub")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asistencia" ADD CONSTRAINT "asistencia_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asistencia" ADD CONSTRAINT "asistencia_colaborador_id_colaboradores_id_fk" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asistencia_fecha_idx" ON "asistencia" USING btree ("fecha");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "colaboradores_numero_empleado_unique_idx" ON "colaboradores" USING btree ("numero_empleado") WHERE "colaboradores"."numero_empleado" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "asistencia" ADD CONSTRAINT "asistencia_xor_persona" CHECK (
  ("usuario_id" IS NOT NULL)::int + ("colaborador_id" IS NOT NULL)::int = 1
);