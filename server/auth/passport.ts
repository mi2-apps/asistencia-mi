import passport from "passport";
import { Strategy as OIDCStrategy } from "passport-openidconnect";
import type { VerifyCallback, Profile } from "passport-openidconnect";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { usuarios } from "../../shared/schema.js";
import type { AuthUser } from "../middleware/auth.js";

const ISSUER_URL     = process.env.OIDC_ISSUER_URL     ?? "https://cloud.miglobal.com.mx";
const CLIENT_ID      = process.env.OIDC_CLIENT_ID      ?? "";
const CLIENT_SECRET  = process.env.OIDC_CLIENT_SECRET  ?? "";
const REDIRECT_URI   = process.env.OIDC_REDIRECT_URI   ?? "http://localhost:3000/auth/callback";

// Domain aliases: both are the same organisation
const MI_DOMAINS = ["miglobal.com.mx", "mitechnologiesinc.com"];

function canonicalizeEmail(email: string): string {
  const [local, domain] = email.toLowerCase().split("@");
  const canonical = MI_DOMAINS.includes(domain) ? "miglobal.com.mx" : domain;
  return `${local}@${canonical}`;
}

export function configurePassport() {
  // Always register serialize/deserialize regardless of SSO availability
  passport.serializeUser((user, done) => {
    done(null, (user as AuthUser).id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const [user] = await db
        .select({ id: usuarios.id, username: usuarios.username, role: usuarios.role, permisos: usuarios.permisos })
        .from(usuarios)
        .where(eq(usuarios.id, id));

      done(null, user ?? false);
    } catch (err) {
      done(err);
    }
  });

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.warn("[auth] OIDC_CLIENT_ID / OIDC_CLIENT_SECRET not set — SSO will be unavailable in this environment");
    return;
  }

  passport.use(
    new OIDCStrategy(
      {
        issuer:              ISSUER_URL,
        authorizationURL:    `${ISSUER_URL}/index.php/apps/oidc/authorize`,
        tokenURL:            `${ISSUER_URL}/index.php/apps/oidc/token`,
        userInfoURL:         `${ISSUER_URL}/index.php/apps/oidc/userinfo`,
        clientID:            CLIENT_ID,
        clientSecret:        CLIENT_SECRET,
        callbackURL:         REDIRECT_URI,
        scope:               "openid email profile",
      },
      async (_issuer: string, profile: Profile, done: VerifyCallback) => {
        try {
          const sub   = profile.id;
          const email = canonicalizeEmail(
            ((profile.emails?.[0]?.value ?? profile.id) as string).toLowerCase()
          );

          // 1) Look up by nextcloud_sub
          const [existingSub] = await db
            .select()
            .from(usuarios)
            .where(eq(usuarios.nextcloud_sub, sub));

          if (existingSub) {
            return done(null, { id: existingSub.id, username: existingSub.username, role: existingSub.role, permisos: existingSub.permisos ?? null });
          }

          // 2) Try matching by username derived from email local part
          const localPart = email.split("@")[0].replace(/\./g, ".");
          const [existingEmail] = await db
            .select()
            .from(usuarios)
            .where(eq(usuarios.username, localPart));

          if (existingEmail) {
            // Bind nextcloud_sub for future logins
            await db
              .update(usuarios)
              .set({ nextcloud_sub: sub })
              .where(eq(usuarios.id, existingEmail.id));
            return done(null, { id: existingEmail.id, username: existingEmail.username, role: existingEmail.role, permisos: existingEmail.permisos ?? null });
          }

          // 3) Auto-provision — new user with role 'usuario'
          const displayName = ((profile.displayName ?? email) as string).split(" ");
          const nombre  = displayName[0]  ?? "Nuevo";
          const apellido = displayName.slice(1).join(" ") || "Usuario";
          const username = localPart;

          const [newUser] = await db
            .insert(usuarios)
            .values({
              username,
              password_hash: "sso-only",
              nombre,
              apellido,
              role: "usuario",
              nextcloud_sub: sub,
            })
            .returning();

          return done(null, { id: newUser.id, username: newUser.username, role: newUser.role, permisos: null });
        } catch (err) {
          return done(err as Error);
        }
      }
    )
  );
}
