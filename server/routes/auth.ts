import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import type { AuthUser } from "../middleware/auth.js";

const router = Router();

// GET /api/v1/auth/me — return current session user
router.get("/me", requireAuth, (req, res) => {
  const user = req.user as AuthUser;
  res.json({
    success: true,
    user: { id: user.id, username: user.username, role: user.role, permisos: user.permisos ?? null },
  });
});

// GET /auth/login — redirect to Nextcloud OIDC (wired up in auth/passport.ts)
// GET /auth/callback — OIDC callback (wired up in auth/passport.ts)
// GET /auth/logout — destroy session
router.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect("/");
  });
});

export default router;
