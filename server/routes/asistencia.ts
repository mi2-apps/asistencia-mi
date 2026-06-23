import { Router } from "express";
import { sql, eq, and, gte, lte } from "drizzle-orm";
import { db, pool } from "../db.js";
import { asistencia, colaboradores } from "../../shared/schema.js";
import { asistenciaSchema } from "../../shared/validators.js";
import { requireAuth, validateBody } from "../middleware/auth.js";

const router = Router();

// GET /api/v1/asistencia/reporte — all active colaboradores with today's attendance
router.get("/reporte", requireAuth, async (_req, res, next) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        c.id            AS colaborador_id,
        'colaborador'   AS persona_tipo,
        c.numero_empleado,
        c.nombre,
        c.apellido,
        c.nombre || ' ' || c.apellido AS fullname,
        c.puesto,
        c.departamento,
        c.turno,
        c.foto_perfil,
        INITCAP(a.estado) AS estado,
        a.tipo_inasistencia,
        a.notas,
        a.created_at    AS hora
      FROM colaboradores c
      LEFT JOIN asistencia a
             ON a.colaborador_id = c.id AND a.fecha = (NOW() AT TIME ZONE 'America/Mexico_City')::date
      WHERE c.activo = TRUE
      ORDER BY c.numero_empleado
    `);
    res.json({ success: true, reporte: rows.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/asistencia/semana?inicio=YYYY-MM-DD&fin=YYYY-MM-DD
router.get("/semana", requireAuth, async (req, res, next) => {
  try {
    const { inicio, fin } = req.query;
    if (!inicio || !fin) {
      return res.status(400).json({ success: false, message: "Se requieren inicio y fin (YYYY-MM-DD)" });
    }
    const rows = await db.execute(sql`
      SELECT
        c.id            AS colaborador_id,
        'colaborador'   AS persona_tipo,
        c.numero_empleado,
        c.nombre,
        c.apellido,
        c.nombre || ' ' || c.apellido AS fullname,
        c.puesto,
        c.departamento,
        c.turno,
        c.foto_perfil,
        a.fecha,
        INITCAP(a.estado) AS estado,
        a.tipo_inasistencia,
        a.notas,
        a.created_at    AS hora
      FROM colaboradores c
      LEFT JOIN asistencia a
             ON a.colaborador_id = c.id
            AND a.fecha >= ${inicio}::date
            AND a.fecha <= ${fin}::date
      WHERE c.activo = TRUE
      ORDER BY c.numero_empleado, a.fecha
    `);
    res.json({ success: true, registros: rows.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/asistencia — idempotent: UPDATE if exists, INSERT if not (FOR UPDATE)
router.post("/", requireAuth, validateBody(asistenciaSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const data      = asistenciaSchema.parse(req.body);
    const col       = data.persona_tipo === "usuario" ? "usuario_id" : "colaborador_id";
    const estadoDB  = data.estado.toLowerCase();
    const username  = (req.user as { username: string }).username;

    await client.query("BEGIN");

    const existe = await client.query(
      `SELECT id FROM asistencia WHERE ${col} = $1 AND fecha = $2 FOR UPDATE`,
      [data.persona_id, data.fecha]
    );

    let row;
    if (existe.rows.length > 0) {
      const r = await client.query(
        `UPDATE asistencia
            SET estado=$1, tipo_inasistencia=$2, notas=$3, registrado_por=$4
          WHERE id=$5
         RETURNING *`,
        [estadoDB, data.tipo_inasistencia ?? null, data.notas ?? null, username, existe.rows[0].id]
      );
      row = r.rows[0];
    } else {
      const r = await client.query(
        `INSERT INTO asistencia (${col}, fecha, estado, tipo_inasistencia, notas, registrado_por)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [data.persona_id, data.fecha, estadoDB, data.tipo_inasistencia ?? null, data.notas ?? null, username]
      );
      row = r.rows[0];
    }

    await client.query("COMMIT");
    res.status(existe.rows.length > 0 ? 200 : 201).json({ success: true, asistencia: row });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

// DELETE /api/v1/asistencia/hoy — clear today's attendance (admin only)
router.delete("/hoy", requireAuth, async (_req, res, next) => {
  try {
    await db.execute(sql`DELETE FROM asistencia WHERE fecha = (NOW() AT TIME ZONE 'America/Mexico_City')::date`);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
