import type { Request, Response, NextFunction } from "express";

export interface AuthUser {
  id: number;
  username: string;
  role: string;
}

declare global {
  namespace Express {
    interface User extends AuthUser {}
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ success: false, code: "NO_AUTH", message: "Autenticación requerida" });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = req.user as AuthUser | undefined;
  if (!user || user.role !== "admin") {
    return res.status(403).json({ success: false, code: "FORBIDDEN", message: "Se requieren permisos de administrador" });
  }
  next();
}

export function validateBody(schema: { safeParse: (data: unknown) => { success: boolean; error?: { issues: Array<{ message: string }> } } }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error?.issues[0]?.message ?? "Datos inválidos";
      return res.status(400).json({ success: false, code: "VALIDATION", message });
    }
    next();
  };
}
