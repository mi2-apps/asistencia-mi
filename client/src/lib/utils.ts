import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizarTexto(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function generarUsername(nombre: string, apellido: string): string {
  const primer = (s: string) => normalizarTexto(s.split(/\s+/)[0]);
  return `${primer(nombre)}.${primer(apellido)}`;
}

export function calcularAntiguedad(fechaIngreso: string | null | undefined): string {
  if (!fechaIngreso) return "—";
  const inicio = new Date(fechaIngreso);
  const hoy    = new Date();
  let anios = hoy.getFullYear() - inicio.getFullYear();
  let meses = hoy.getMonth() - inicio.getMonth();
  let dias  = hoy.getDate() - inicio.getDate();

  if (dias < 0) { meses--; dias += new Date(hoy.getFullYear(), hoy.getMonth(), 0).getDate(); }
  if (meses < 0) { anios--; meses += 12; }

  const parts: string[] = [];
  if (anios > 0) parts.push(`${anios}a`);
  if (meses > 0) parts.push(`${meses}m`);
  if (dias > 0 && anios === 0) parts.push(`${dias}d`);
  return parts.length ? parts.join(" ") : "< 1d";
}

export function formatFecha(date: string | Date | null | undefined, locale = "es-MX"): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString(locale, {
    year: "numeric", month: "short", day: "numeric",
  });
}

export function iniciales(nombre: string, apellido?: string): string {
  const n = nombre.trim().split(/\s+/)[0][0]?.toUpperCase() ?? "";
  const a = apellido
    ? apellido.trim().split(/\s+/)[0][0]?.toUpperCase() ?? ""
    : nombre.trim().split(/\s+/)[1]?.[0]?.toUpperCase() ?? "";
  return `${n}${a}`;
}
