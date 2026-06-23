import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { tiempoExtra } from "../../shared/schema.js";
import { tiempoExtraSchema } from "../../shared/validators.js";
import { requireAuth, validateBody } from "../middleware/auth.js";

const router = Router();

// GET /api/v1/tiempo-extra/stats — conteo por departamento para tarjetas
router.get("/stats", requireAuth, async (_req, res, next) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        c.departamento,
        COUNT(te.id)::int AS total
      FROM colaboradores c
      LEFT JOIN tiempo_extra te ON te.colaborador_id = c.id
      WHERE c.activo = TRUE
      GROUP BY c.departamento
    `);
    const stats: Record<string, number> = {};
    for (const r of rows.rows as { departamento: string; total: number }[]) {
      stats[r.departamento] = r.total;
    }
    res.json({ success: true, stats });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/tiempo-extra/semanas?departamento=X — agrupado por semana ISO
router.get("/semanas", requireAuth, async (req, res, next) => {
  try {
    const dept = req.query.departamento as string | undefined;
    const rows = await db.execute(sql`
      SELECT
        EXTRACT(YEAR FROM te.fecha)::int                         AS year,
        EXTRACT(WEEK FROM te.fecha)::int                         AS week,
        DATE_TRUNC('week', te.fecha)::date                       AS inicio,
        (DATE_TRUNC('week', te.fecha) + INTERVAL '6 days')::date AS fin,
        COUNT(te.id)::int                                        AS total_registros,
        SUM(te.horas_totales)::numeric(6,2)                      AS total_horas
      FROM tiempo_extra te
      JOIN colaboradores c ON c.id = te.colaborador_id
      ${dept ? sql`WHERE c.departamento = ${dept}` : sql``}
      GROUP BY year, week, inicio, fin
      ORDER BY year DESC, week DESC
    `);
    res.json({ success: true, semanas: rows.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/tiempo-extra?departamento=X&inicio=YYYY-MM-DD&fin=YYYY-MM-DD
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const dept   = req.query.departamento as string | undefined;
    const inicio = req.query.inicio as string | undefined;
    const fin    = req.query.fin    as string | undefined;

    const rows = await db.execute(sql`
      SELECT
        te.id,
        te.fecha,
        te.hora_inicio,
        te.hora_fin,
        te.horas_totales,
        te.area,
        te.motivo,
        te.autorizado_por,
        te.registrado_por,
        te.created_at,
        c.id            AS colaborador_id,
        c.nombre,
        c.apellido,
        c.nombre || ' ' || c.apellido AS fullname,
        c.numero_empleado,
        c.departamento,
        c.puesto,
        c.foto_perfil
      FROM tiempo_extra te
      JOIN colaboradores c ON c.id = te.colaborador_id
      WHERE TRUE
        ${dept   ? sql`AND c.departamento = ${dept}`    : sql``}
        ${inicio ? sql`AND te.fecha >= ${inicio}::date` : sql``}
        ${fin    ? sql`AND te.fecha <= ${fin}::date`    : sql``}
      ORDER BY te.fecha DESC, te.created_at DESC
    `);
    res.json({ success: true, registros: rows.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tiempo-extra — crear registro
router.post("/", requireAuth, validateBody(tiempoExtraSchema), async (req, res, next) => {
  try {
    const data     = tiempoExtraSchema.parse(req.body);
    const username = (req.user as { username: string }).username;

    const [row] = await db
      .insert(tiempoExtra)
      .values({
        colaborador_id: data.colaborador_id,
        fecha:          data.fecha,
        hora_inicio:    data.hora_inicio,
        hora_fin:       data.hora_fin,
        horas_totales:  String(data.horas_totales),
        area:           data.area,
        motivo:         data.motivo,
        autorizado_por: data.autorizado_por,
        registrado_por: username,
      })
      .returning();

    res.status(201).json({ success: true, registro: row });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/tiempo-extra/:id — eliminar (admin only)
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "ID inválido" });

    const rows = await db.execute(sql`DELETE FROM tiempo_extra WHERE id = ${id} RETURNING id`);
    if ((rows.rows as { id: number }[]).length === 0) {
      return res.status(404).json({ success: false, message: "Registro no encontrado" });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
