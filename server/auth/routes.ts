import { Router } from "express";
import passport from "passport";
import bcrypt from "bcrypt";
import { rateLimit } from "express-rate-limit";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { usuarios } from "../../shared/schema.js";

const SSO_READY = !!(process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET);

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: { success: false, code: "RATE_LIMIT", message: "Demasiados intentos. Intente en 10 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

const BASE_STYLES = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
       background:#ffffff;min-height:100vh;display:flex}
  .panel-left{background:#0A1929;width:42%;display:flex;flex-direction:column;
              align-items:center;justify-content:center;padding:3rem;min-height:100vh}
  .panel-left img{width:160px;background:white;border-radius:16px;padding:14px;margin-bottom:2.5rem;display:block}
  .panel-left h1{color:white;font-size:1.4rem;font-weight:700;margin-bottom:.75rem;text-align:center}
  .panel-left p{color:rgba(255,255,255,.55);font-size:.85rem;text-align:center;line-height:1.6;max-width:240px}
  .panel-right{flex:1;display:flex;align-items:center;justify-content:center;padding:2rem;background:#f8f9fb}
  .card{background:white;border-radius:16px;padding:2.5rem 2rem;width:100%;max-width:360px;
        border:1px solid #e5e7eb}
  .card-title{font-size:1.1rem;font-weight:700;color:#0A1929;margin-bottom:.4rem}
  .card-sub{font-size:.85rem;color:#6b7280;margin-bottom:2rem;line-height:1.5}
  .btn{display:block;width:100%;background:#0A1929;color:white;text-decoration:none;border:none;
       border-radius:10px;padding:.85rem;font-size:.95rem;font-weight:600;cursor:pointer;
       text-align:center;transition:background .15s}
  .btn:hover{background:#1a3a5c}
  .btn-outline{background:white;color:#0A1929;border:1.5px solid #0A1929;margin-top:.75rem}
  .btn-outline:hover{background:#f0f4f8}
  .err{color:#ef4444;font-size:.85rem;background:#fff5f5;border:1px solid #fecaca;
       border-radius:8px;padding:.65rem .9rem;margin-bottom:1.25rem}
  @media(max-width:640px){.panel-left{display:none}.panel-right{background:white}}
`;

const ERROR_PAGE = (msg: string) => `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Error de autenticación — MI Technologies</title>
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div class="panel-left">
    <img src="/assets/mi_logo.png" alt="MI Technologies"/>
    <h1>Control de Asistencia</h1>
    <p>Sistema de gestión de asistencia del personal de MI Technologies, Inc.</p>
  </div>
  <div class="panel-right">
    <div class="card">
      <p class="card-title">Error de inicio de sesión</p>
      <p class="card-sub">No fue posible completar la autenticación.</p>
      <div class="err">${msg}</div>
      <a href="/auth/login" class="btn">Intentar de nuevo</a>
    </div>
  </div>
</body>
</html>`;

// GET /auth/login
router.get("/login", loginLimiter, (req, res, next) => {
  // Always show error page when ?error= is present — never loop back into OIDC.
  // Without this guard, a callback failure would redirect here, immediately start a
  // new OIDC flow on a session with stale/missing state, and produce a 500.
  if (req.query.error) {
    return res.status(401).send(ERROR_PAGE(String(req.query.error)));
  }

  if (SSO_READY) {
    return passport.authenticate("openidconnect")(req, res, next);
  }

  // Dev mode: serve a simple login form
  res.send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Iniciar sesión — MI Technologies</title>
  <style>
    ${BASE_STYLES}
    label{font-size:.85rem;font-weight:500;color:#374151;display:block;margin-bottom:.35rem}
    input{width:100%;border:1px solid #d1d5db;border-radius:8px;padding:.65rem .9rem;
          font-size:.95rem;margin-bottom:1rem;outline:none;color:#111}
    input:focus{border-color:#0A1929;box-shadow:0 0 0 2px rgba(10,25,41,.12)}
    .dev-badge{font-size:.72rem;color:#92400e;background:#fffbeb;border:1px solid #fcd34d;
               border-radius:6px;padding:.3rem .75rem;margin-top:1rem;display:block;text-align:center}
  </style>
</head>
<body>
  <div class="panel-left">
    <img src="/assets/mi_logo.png" alt="MI Technologies"/>
    <h1>Control de Asistencia</h1>
    <p>Sistema de gestión de asistencia del personal de MI Technologies, Inc.</p>
  </div>
  <div class="panel-right">
    <div class="card">
      <p class="card-title">Iniciar sesión</p>
      <p class="card-sub">Ingresa tus credenciales de acceso al sistema.</p>
      <form method="POST" action="/auth/dev-login">
        <label>Usuario</label>
        <input name="username" type="text" autocomplete="username" required autofocus/>
        <label>Contraseña</label>
        <input name="password" type="password" autocomplete="current-password" required/>
        <button type="submit" class="btn">Entrar</button>
      </form>
      <span class="dev-badge">⚙️ Modo desarrollo — SSO Nextcloud no configurado</span>
    </div>
  </div>
</body>
</html>`);
});

// POST /auth/dev-login — only active in dev when SSO is not configured
router.post("/dev-login", loginLimiter, async (req, res, next) => {
  if (SSO_READY) return res.status(404).send("Not found");
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) return res.redirect("/auth/login?error=Usuario+y+contraseña+requeridos");

    const [user] = await db
      .select({ id: usuarios.id, username: usuarios.username, password_hash: usuarios.password_hash, role: usuarios.role, permisos: usuarios.permisos })
      .from(usuarios)
      .where(eq(usuarios.username, username.trim().toLowerCase()));

    if (!user) return res.redirect("/auth/login?error=Usuario+o+contraseña+incorrectos");

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.redirect("/auth/login?error=Usuario+o+contraseña+incorrectos");

    req.login({ id: user.id, username: user.username, role: user.role, permisos: user.permisos ?? null }, (err) => {
      if (err) return next(err);
      res.redirect("/");
    });
  } catch (err) {
    next(err);
  }
});

// GET /auth/callback → OIDC callback (production only)
router.get(
  "/callback",
  (req, res, next) => {
    if (!SSO_READY) return res.redirect("/auth/login");
    passport.authenticate("openidconnect", { failureRedirect: "/auth/login?error=Error+de+autenticaci%C3%B3n" })(req, res, next);
  },
  (_req, res) => res.redirect("/")
);

// GET /auth/logout
router.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => res.redirect("/auth/logged-out"));
  });
});

// GET /auth/logged-out — página intermedia tras cerrar sesión
router.get("/logged-out", (_req, res) => {
  res.send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Sesión cerrada — MI Technologies</title>
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div class="panel-left">
    <img src="/assets/mi_logo.png" alt="MI Technologies"/>
    <h1>Control de Asistencia</h1>
    <p>Sistema de gestión de asistencia del personal de MI Technologies, Inc.</p>
  </div>
  <div class="panel-right">
    <div class="card">
      <p class="card-title">Sesión cerrada</p>
      <p class="card-sub">Tu sesión ha sido cerrada correctamente. Puedes volver a iniciar sesión cuando lo necesites.</p>
      <a href="/auth/login" class="btn">Iniciar sesión</a>
    </div>
  </div>
</body>
</html>`);
});

export default router;
