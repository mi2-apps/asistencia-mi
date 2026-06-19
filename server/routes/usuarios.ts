import { Router } from "express";
import bcrypt from "bcrypt";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { db } from "../db.js";
import { usuarios } from "../../shared/schema.js";
import { usuarioCreateSchema, usuarioUpdateSchema } from "../../shared/validators.js";
import { requireAuth, requireAdmin, validateBody } from "../middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, "../../uploads");

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${req.params.username}${ext}`);
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

function generarUsername(nombre: string, apellido: string): string {
  const norm = (s: string) =>
    s.normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
  return `${norm(nombre.split(/\s+/)[0])}.${norm(apellido.split(/\s+/)[0])}`;
}

// GET /api/v1/usuarios
router.get("/", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id:              usuarios.id,
        username:        usuarios.username,
        fullname:        sql<string>`${usuarios.nombre} || ' ' || ${usuarios.apellido}`,
        nombre:          usuarios.nombre,
        apellido:        usuarios.apellido,
        role:            usuarios.role,
        departamento:    usuarios.departamento,
        turno:           usuarios.turno,
        puesto:          usuarios.puesto,
        numero_empleado: usuarios.numero_empleado,
        fecha_ingreso:   usuarios.fecha_ingreso,
        foto_perfil:     usuarios.foto_perfil,
        created_at:      usuarios.created_at,
        anios_en_planta: sql<number>`DATE_PART('year', AGE(CURRENT_DATE, ${usuarios.fecha_ingreso}))::int`,
      })
      .from(usuarios)
      .orderBy(usuarios.created_at);

    res.json({ success: true, usuarios: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/usuarios
router.post("/", requireAuth, requireAdmin, validateBody(usuarioCreateSchema), async (req, res, next) => {
  try {
    const data = usuarioCreateSchema.parse(req.body);

    let username = generarUsername(data.nombre, data.apellido);

    // Numeric suffix on duplicate username
    const [existing] = await db
      .select({ username: usuarios.username })
      .from(usuarios)
      .where(eq(usuarios.username, username));

    if (existing) {
      let sufijo = 2;
      while (true) {
        const candidato = `${username}${sufijo}`;
        const [check] = await db
          .select({ username: usuarios.username })
          .from(usuarios)
          .where(eq(usuarios.username, candidato));
        if (!check) { username = candidato; break; }
        sufijo++;
      }
    }

    const password_hash = await bcrypt.hash(data.password, 10);

    const [row] = await db
      .insert(usuarios)
      .values({
        username,
        password_hash,
        nombre:          data.nombre,
        apellido:        data.apellido,
        role:            data.role ?? "usuario",
        departamento:    data.departamento,
        turno:           data.turno,
        puesto:          data.puesto,
        numero_empleado: data.numero_empleado,
        fecha_ingreso:   data.fecha_ingreso,
      })
      .returning({
        id:              usuarios.id,
        username:        usuarios.username,
        nombre:          usuarios.nombre,
        apellido:        usuarios.apellido,
        role:            usuarios.role,
        departamento:    usuarios.departamento,
        turno:           usuarios.turno,
        puesto:          usuarios.puesto,
        numero_empleado: usuarios.numero_empleado,
        fecha_ingreso:   usuarios.fecha_ingreso,
        created_at:      usuarios.created_at,
      });

    res.status(201).json({ success: true, usuario: row });
  } catch (err: any) {
    if (err?.code === "23505") {
      return res.status(409).json({ success: false, code: "DUPLICATE", message: "El número de empleado ya está registrado" });
    }
    next(err);
  }
});

// PUT /api/v1/usuarios/:username
router.put("/:username", requireAuth, requireAdmin, validateBody(usuarioUpdateSchema), async (req, res, next) => {
  try {
    const { username } = req.params;
    const data = usuarioUpdateSchema.parse(req.body);

    const updateData: Partial<typeof usuarios.$inferInsert> = {
      nombre:          data.nombre,
      apellido:        data.apellido,
      role:            data.role ?? "usuario",
      departamento:    data.departamento,
      turno:           data.turno,
      puesto:          data.puesto,
      numero_empleado: data.numero_empleado,
      fecha_ingreso:   data.fecha_ingreso,
      updated_at:      new Date(),
    };

    if (data.password) {
      updateData.password_hash = await bcrypt.hash(data.password, 10);
    }

    const [row] = await db
      .update(usuarios)
      .set(updateData)
      .where(eq(usuarios.username, username))
      .returning({
        id:              usuarios.id,
        username:        usuarios.username,
        nombre:          usuarios.nombre,
        apellido:        usuarios.apellido,
        role:            usuarios.role,
        departamento:    usuarios.departamento,
        turno:           usuarios.turno,
        puesto:          usuarios.puesto,
        numero_empleado: usuarios.numero_empleado,
        fecha_ingreso:   usuarios.fecha_ingreso,
        created_at:      usuarios.created_at,
      });

    if (!row) {
      return res.status(404).json({ success: false, code: "NOT_FOUND", message: "Usuario no encontrado" });
    }
    res.json({ success: true, usuario: row });
  } catch (err: any) {
    if (err?.code === "23505") {
      return res.status(409).json({ success: false, code: "DUPLICATE", message: "El número de empleado ya está registrado" });
    }
    next(err);
  }
});

// POST /api/v1/usuarios/:username/foto
router.post("/:username/foto", requireAuth, upload.single("foto"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No se recibió ninguna imagen" });
    }
    const { username } = req.params;
    await db
      .update(usuarios)
      .set({ foto_perfil: req.file.filename })
      .where(eq(usuarios.username, username));

    res.json({ success: true, foto_perfil: req.file.filename });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/usuarios/:username
router.delete("/:username", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { username } = req.params;
    if (username === "admin") {
      return res.status(400).json({ success: false, code: "PROTECTED", message: "No se puede eliminar el administrador" });
    }
    const [row] = await db
      .delete(usuarios)
      .where(eq(usuarios.username, username))
      .returning({ id: usuarios.id });

    if (!row) {
      return res.status(404).json({ success: false, code: "NOT_FOUND", message: "Usuario no encontrado" });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
