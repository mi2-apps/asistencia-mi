import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import helmet from "helmet";
import morgan from "morgan";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import authRouter from "./routes/auth.js";
import usuariosRouter from "./routes/usuarios.js";
import colaboradoresRouter from "./routes/colaboradores.js";
import asistenciaRouter from "./routes/asistencia.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT ?? 3000);

// ── Security & logging ────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

if (process.env.NODE_ENV !== "production") {
  app.use(cors({ origin: "http://localhost:5173", credentials: true }));
}

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10kb" }));

// ── Rate limiting on auth endpoints ──────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: { success: false, code: "RATE_LIMIT", message: "Demasiados intentos. Intente en 10 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/auth/callback", loginLimiter);
app.use("/api/v1/auth", loginLimiter);

// ── Static uploads ────────────────────────────────────────────────────────────
app.use("/uploads", express.static(path.resolve(__dirname, "../uploads")));

// ── API routes ────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) =>
  res.json({ success: true, status: "ok", app: "asistencia-mi" })
);
app.use("/api/v1/auth",          authRouter);
app.use("/api/v1/usuarios",      usuariosRouter);
app.use("/api/v1/colaboradores", colaboradoresRouter);
app.use("/api/v1/asistencia",    asistenciaRouter);

// ── SPA fallback ──────────────────────────────────────────────────────────────
const clientDir = path.resolve(__dirname, "../client");
app.use(express.static(clientDir));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDir, "index.html"));
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.status ?? 500;
  console.error("[error]", err.message);
  res.status(status).json({ success: false, message: err.message ?? "Error interno del servidor" });
});

app.listen(PORT, () => {
  console.log(`[asistencia-mi] listening on :${PORT}`);
});
