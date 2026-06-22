import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import helmet from "helmet";
import morgan from "morgan";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import session from "express-session";
import passport from "passport";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db.js";
import { configurePassport } from "./auth/passport.js";
import ssoRouter from "./auth/routes.js";
import authRouter from "./routes/auth.js";
import usuariosRouter from "./routes/usuarios.js";
import colaboradoresRouter from "./routes/colaboradores.js";
import asistenciaRouter from "./routes/asistencia.js";
import tiempoExtraRouter from "./routes/tiempoExtra.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT ?? 3000);

// ── Trust proxy (required behind Nginx/Caddy/Traefik in production) ──────────
// Without this, express-session won't send the Secure cookie and OIDC state
// stored in the session is lost between the authorize redirect and the callback.
app.set("trust proxy", 1);

// ── Security & logging ────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

if (process.env.NODE_ENV !== "production") {
  app.use(cors({ origin: "http://localhost:5173", credentials: true }));
}

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false }));

// ── Sessions ──────────────────────────────────────────────────────────────────
const PgSession = connectPgSimple(session);
app.use(
  session({
    store: new PgSession({ pool, tableName: "session", createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET ?? "dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    },
  })
);

// ── Passport SSO ──────────────────────────────────────────────────────────────
configurePassport();
app.use(passport.initialize());
app.use(passport.session());

// ── Static uploads ────────────────────────────────────────────────────────────
app.use("/uploads", express.static(path.resolve(__dirname, "../uploads")));

// ── SSO routes ────────────────────────────────────────────────────────────────
app.use("/auth", ssoRouter);

// ── API routes ────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) =>
  res.json({ success: true, status: "ok", app: "asistencia-mi" })
);
app.use("/api/v1/auth",          authRouter);
app.use("/api/v1/usuarios",      usuariosRouter);
app.use("/api/v1/colaboradores", colaboradoresRouter);
app.use("/api/v1/asistencia",    asistenciaRouter);
app.use("/api/v1/tiempo-extra",  tiempoExtraRouter);

// ── SPA fallback ──────────────────────────────────────────────────────────────
const clientDir = path.resolve(__dirname, "../client");
app.use(express.static(clientDir));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDir, "index.html"));
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.status ?? 500;
  console.error("[error]", err.name, err.message, err.stack);
  res.status(status).json({ success: false, message: err.message || "Error interno del servidor" });
});

app.listen(PORT, () => {
  console.log(`[asistencia-mi] listening on :${PORT}`);
});
