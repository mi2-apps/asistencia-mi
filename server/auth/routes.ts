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
  max: 20,
  message: { success: false, code: "RATE_LIMIT", message: "Demasiados intentos. Intente en 10 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

// GET /auth/login
router.get("/login", loginLimiter, (req, res, next) => {
  if (SSO_READY) {
    return passport.authenticate("openidconnect")(req, res, next);
  }
  // Dev mode: serve a simple login form
  const error = req.query.error ? `<p style="color:#ef4444;margin-bottom:1rem">${req.query.error}</p>` : "";
  res.send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Iniciar sesión — asistencia-mi (DEV)</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
         background:#f0f4f8;min-height:100vh;display:flex;align-items:center;justify-content:center}
    .card{background:white;border-radius:14px;padding:2rem;width:100%;max-width:360px;
          box-shadow:0 4px 24px rgba(0,0,0,.08)}
    .logo{background:#0A1929;color:white;border-radius:8px;padding:.5rem 1rem;
          font-size:.7rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
          display:inline-block;margin-bottom:1.5rem}
    h1{font-size:1.25rem;margin-bottom:.4rem}
    p.sub{font-size:.8rem;color:#6b7280;margin-bottom:1.5rem}
    label{font-size:.85rem;font-weight:500;display:block;margin-bottom:.4rem}
    input{width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:.6rem .9rem;
          font-size:.95rem;margin-bottom:1rem;outline:none}
    input:focus{border-color:#0A1929;box-shadow:0 0 0 2px rgba(10,25,41,.15)}
    button{width:100%;background:#0A1929;color:white;border:none;border-radius:8px;
           padding:.7rem;font-size:.95rem;font-weight:600;cursor:pointer}
    button:hover{background:#1e3a5f}
    .dev-badge{font-size:.7rem;color:#f59e0b;background:#fffbeb;border:1px solid #fcd34d;
               border-radius:6px;padding:.2rem .6rem;margin-top:1rem;display:block;text-align:center}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">MI Technologies</div>
    <h1>Control de Asistencia</h1>
    <p class="sub">Inicia sesión con tu usuario del sistema</p>
    ${error}
    <form method="POST" action="/auth/dev-login">
      <label>Usuario</label>
      <input name="username" type="text" autocomplete="username" required autofocus/>
      <label>Contraseña</label>
      <input name="password" type="password" autocomplete="current-password" required/>
      <button type="submit">Entrar</button>
    </form>
    <span class="dev-badge">⚙️ Modo desarrollo — SSO Nextcloud no configurado</span>
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
      .select({ id: usuarios.id, username: usuarios.username, password_hash: usuarios.password_hash, role: usuarios.role })
      .from(usuarios)
      .where(eq(usuarios.username, username.trim().toLowerCase()));

    if (!user) return res.redirect("/auth/login?error=Usuario+o+contraseña+incorrectos");

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.redirect("/auth/login?error=Usuario+o+contraseña+incorrectos");

    req.login({ id: user.id, username: user.username, role: user.role }, (err) => {
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
    passport.authenticate("openidconnect", { failureRedirect: "/auth/login?error=Error+de+autenticación" })(req, res, next);
  },
  (_req, res) => res.redirect("/")
);

// GET /auth/logout
router.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => res.redirect("/auth/login"));
  });
});

export default router;
