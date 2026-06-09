/**
 * shared/email-alias.ts — Domain aliasing for OIDC auth.
 *
 * MI Technologies employees have historically been provisioned with
 * @mitechnologiesinc.com addresses, but the Nextcloud OIDC IdP now
 * emits @miglobal.com.mx for many of them after a 2026-06 primary-
 * email migration. Both addresses refer to the same person.
 *
 * Rather than duplicate every allowed_users row, we map aliased
 * domains to a canonical form at auth-check time. allowed_users
 * stays the single source of truth (keyed on whatever email was
 * originally added); the alias logic lets lookups find rows under
 * either address.
 *
 * Design constraints:
 *  - DETERMINISTIC: canonicalizeEmail(canonicalizeEmail(x)) === canonicalizeEmail(x)
 *  - IDEMPOTENT: same property — multiple applications converge to the same value
 *  - STATIC: no env vars — future domain additions are code changes
 */

/** Maps ALIAS_DOMAIN → CANONICAL_DOMAIN (one-entry per alias). */
export const DOMAIN_ALIASES: Record<string, string> = {
  "miglobal.com.mx": "mitechnologiesinc.com",
};

/**
 * Returns the canonical form of an email: lowercased, with aliased domain
 * replaced by the canonical domain.
 *
 * Examples:
 *   "Jesus.Hernandez@MIGLOBAL.COM.MX"   → "jesus.hernandez@mitechnologiesinc.com"
 *   "jesus.hernandez@mitechnologiesinc.com" → "jesus.hernandez@mitechnologiesinc.com" (unchanged)
 *   "foo@unknown.com"                    → "foo@unknown.com" (no alias defined)
 *   ""                                   → "" (no crash)
 *   "bad-no-at"                          → "bad-no-at" (no @ → returned as-is)
 */
export function canonicalizeEmail(email: string): string {
  const lower = (email || "").trim().toLowerCase();
  const at = lower.indexOf("@");
  if (at < 0) return lower;
  const local = lower.slice(0, at);
  const domain = lower.slice(at + 1);
  const canonical = DOMAIN_ALIASES[domain] ?? domain;
  return `${local}@${canonical}`;
}

/**
 * Returns ALL email variants for a given OIDC email:
 *   - the lowercase original
 *   - the canonical form (aliased domain → canonical domain)
 *   - every reverse-alias for the canonical domain
 *
 * Used by allowed_users lookups: `WHERE email IN (variants)` matches rows
 * that were added under any of the equivalent domain spellings.
 *
 * Examples:
 *   "jesus.hernandez@miglobal.com.mx"     → ["jesus.hernandez@miglobal.com.mx",
 *                                             "jesus.hernandez@mitechnologiesinc.com"]
 *   "jesus.hernandez@mitechnologiesinc.com" → ["jesus.hernandez@mitechnologiesinc.com",
 *                                               "jesus.hernandez@miglobal.com.mx"]
 *   "foo@otra.com"                         → ["foo@otra.com"]  (single element)
 */
export function allDomainVariants(email: string): string[] {
  const lower = (email || "").trim().toLowerCase();
  const at = lower.indexOf("@");
  if (at < 0) return [lower];
  const local = lower.slice(0, at);
  const variants = new Set<string>([lower]);
  // Add the canonical form.
  const canonical = canonicalizeEmail(email);
  variants.add(canonical);
  // Add every alias whose canonical target matches the canonical domain.
  const canonicalDomain = canonical.slice(canonical.indexOf("@") + 1);
  for (const [alias, target] of Object.entries(DOMAIN_ALIASES)) {
    if (target === canonicalDomain) variants.add(`${local}@${alias}`);
  }
  return Array.from(variants);
}
