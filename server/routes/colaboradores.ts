import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { db } from "../db.js";
import { colaboradores } from "../../shared/schema.js";
import { colaboradorSchema, bajaSchema, reactivarSchema } from "../../shared/validators.js";
import { requireAuth, validateBody } from "../middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, "../../uploads");

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `colab_${req.params.id}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith("image/"));
  },
});

const router = Router();

// GET /api/v1/colaboradores?activo=true|false
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const soloActivos = req.query.activo !== "false";
    const rows = await db
      .select({
        id:              colaboradores.id,
        nombre:          colaboradores.nombre,
        apellido:        colaboradores.apellido,
        fullname:        sql<string>`${colaboradores.nombre} || ' ' || ${colaboradores.apellido}`,
        departamento:    colaboradores.departamento,
        turno:           colaboradores.turno,
        puesto:          colaboradores.puesto,
        numero_empleado: colaboradores.numero_empleado,
        fecha_ingreso:   colaboradores.fecha_ingreso,
        foto_perfil:     colaboradores.foto_perfil,
        activo:          colaboradores.activo,
        fecha_baja:      colaboradores.fecha_baja,
        tipo_baja:       colaboradores.tipo_baja,
        motivo_baja:     colaboradores.motivo_baja,
        created_at:      colaboradores.created_at,
        anios_en_planta: sql<number>`DATE_PART('year', AGE(CURRENT_DATE, ${colaboradores.fecha_ingreso}))::int`,
      })
      .from(colaboradores)
      .where(eq(colaboradores.activo, soloActivos))
      .orderBy(colaboradores.created_at);

    res.json({ success: true, colaboradores: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/colaboradores
router.post("/", requireAuth, validateBody(colaboradorSchema), async (req, res, next) => {
  try {
    const data = colaboradorSchema.parse(req.body);
    const [row] = await db
      .insert(colaboradores)
      .values({
        nombre:          data.nombre,
        apellido:        data.apellido,
        departamento:    data.departamento,
        turno:           data.turno,
        puesto:          data.puesto,
        numero_empleado: data.numero_empleado,
        fecha_ingreso:   data.fecha_ingreso,
      })
      .returning();

    res.status(201).json({ success: true, colaborador: row });
  } catch (err: any) {
    if (err?.code === "23505") {
      return res.status(409).json({ success: false, code: "DUPLICATE", message: "El número de empleado ya está registrado" });
    }
    next(err);
  }
});

// PUT /api/v1/colaboradores/:id
router.put("/:id", requireAuth, validateBody(colaboradorSchema), async (req, res, next) => {
  try {
    const id   = parseInt(req.params.id, 10);
    const data = colaboradorSchema.parse(req.body);

    const [row] = await db
      .update(colaboradores)
      .set({
        nombre:          data.nombre,
        apellido:        data.apellido,
        departamento:    data.departamento,
        turno:           data.turno,
        puesto:          data.puesto,
        numero_empleado: data.numero_empleado,
        fecha_ingreso:   data.fecha_ingreso,
        updated_at:      new Date(),
      })
      .where(eq(colaboradores.id, id))
      .returning();

    if (!row) {
      return res.status(404).json({ success: false, code: "NOT_FOUND", message: "Colaborador no encontrado" });
    }
    res.json({ success: true, colaborador: row });
  } catch (err: any) {
    if (err?.code === "23505") {
      return res.status(409).json({ success: false, code: "DUPLICATE", message: "El número de empleado ya está registrado" });
    }
    next(err);
  }
});

// PATCH /api/v1/colaboradores/:id/estado — dar de baja / reactivar
router.patch("/:id/estado", requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (req.body.activo === true) {
      const parseResult = reactivarSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ success: false, code: "VALIDATION", message: "Datos inválidos" });
      }
      const [row] = await db
        .update(colaboradores)
        .set({ activo: true, fecha_baja: null, tipo_baja: null, motivo_baja: null, updated_at: new Date() })
        .where(eq(colaboradores.id, id))
        .returning({ id: colaboradores.id, activo: colaboradores.activo, fecha_baja: colaboradores.fecha_baja, tipo_baja: colaboradores.tipo_baja, motivo_baja: colaboradores.motivo_baja });

      if (!row) {
        return res.status(404).json({ success: false, code: "NOT_FOUND", message: "Colaborador no encontrado" });
      }
      return res.json({ success: true, colaborador: row });
    }

    const parseResult = bajaSchema.safeParse(req.body);
    if (!parseResult.success) {
      const message = parseResult.error.issues[0]?.message ?? "El tipo de baja es requerido";
      return res.status(400).json({ success: false, code: "VALIDATION", message });
    }
    const { tipo_baja, fecha_baja, motivo_baja } = parseResult.data;

    const [row] = await db
      .update(colaboradores)
      .set({ activo: false, fecha_baja, tipo_baja, motivo_baja: motivo_baja ?? null, updated_at: new Date() })
      .where(eq(colaboradores.id, id))
      .returning({ id: colaboradores.id, activo: colaboradores.activo, fecha_baja: colaboradores.fecha_baja, tipo_baja: colaboradores.tipo_baja, motivo_baja: colaboradores.motivo_baja });

    if (!row) {
      return res.status(404).json({ success: false, code: "NOT_FOUND", message: "Colaborador no encontrado" });
    }
    res.json({ success: true, colaborador: row });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/colaboradores/:id
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [row] = await db
      .delete(colaboradores)
      .where(eq(colaboradores.id, id))
      .returning({ id: colaboradores.id });

    if (!row) {
      return res.status(404).json({ success: false, code: "NOT_FOUND", message: "Colaborador no encontrado" });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/colaboradores/:id/foto
router.post("/:id/foto", requireAuth, upload.single("foto"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No se recibió ninguna imagen" });
    }
    const id = parseInt(req.params.id, 10);
    await db
      .update(colaboradores)
      .set({ foto_perfil: req.file.filename })
      .where(eq(colaboradores.id, id));

    res.json({ success: true, foto_perfil: req.file.filename });
  } catch (err) {
    next(err);
  }
});

export default router;
