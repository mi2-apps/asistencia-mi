import { Router } from "express";
import passport from "passport";
import { rateLimit } from "express-rate-limit";

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: { success: false, code: "RATE_LIMIT", message: "Demasiados intentos. Intente en 10 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

// GET /auth/login → redirect to Nextcloud OIDC
router.get("/login", loginLimiter, passport.authenticate("openidconnect"));

// GET /auth/callback → OIDC provider redirects here
router.get(
  "/callback",
  passport.authenticate("openidconnect", { failureRedirect: "/auth/login?error=1" }),
  (_req, res) => {
    res.redirect("/");
  }
);

// GET /auth/logout → destroy session + redirect
router.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => res.redirect("/"));
  });
});

export default router;
