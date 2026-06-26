import jsPDF from "jspdf";

export interface ColaboradorBajaPDF {
  nombre: string;
  apellido: string;
  fullname: string;
  departamento: string;
  puesto: string | null;
  turno: string | null;
  numero_empleado: string | null;
  fecha_ingreso: string | null;
  fecha_baja: string | null;
  tipo_baja: string | null;
  motivo_baja: string | null;
  dado_de_baja_por: string | null;
}

const NAVY  = [27,  58,  107] as [number, number, number];
const GRAY  = [107, 114, 128] as [number, number, number];
const LIGHT = [249, 250, 251] as [number, number, number];

const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MESES[m - 1]} ${y}`;
}

function antiguedad(ingreso: string | null, baja: string | null): string {
  if (!ingreso) return "—";
  const ini = new Date(ingreso.slice(0, 10) + "T12:00:00");
  const fin = baja ? new Date(baja.slice(0, 10) + "T12:00:00") : new Date();
  let meses = (fin.getFullYear() - ini.getFullYear()) * 12 + (fin.getMonth() - ini.getMonth());
  if (fin.getDate() < ini.getDate()) meses--;
  if (meses < 0) return "—";
  const y = Math.floor(meses / 12);
  const m = meses % 12;
  const parts: string[] = [];
  if (y > 0) parts.push(`${y} año${y > 1 ? "s" : ""}`);
  if (m > 0) parts.push(`${m} mes${m > 1 ? "es" : ""}`);
  return parts.length ? parts.join(" ") : "Menos de 1 mes";
}

function iniciales(nombre: string, apellido: string): string {
  return (nombre[0] ?? "").toUpperCase() + (apellido[0] ?? "").toUpperCase();
}

function logo64(url: string): Promise<string> {
  return fetch(url)
    .then(r => r.blob())
    .then(blob => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }));
}

export async function generarPDFBaja(c: ColaboradorBajaPDF) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();   // 210
  const H = doc.internal.pageSize.getHeight();  // 297
  const L = 18;
  const R = W - L;

  // ── Logo ──────────────────────────────────────────────────────────────────
  const logoW = 36;
  const logoH = Math.round(logoW / 2.97);
  try {
    const data = await logo64("/assets/logo.png");
    doc.addImage(data, "PNG", L, 10, logoW, logoH);
  } catch {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text("MI Technologies", L, 17);
  }

  // ── Fecha de elaboración ──────────────────────────────────────────────────
  const hoy = new Date();
  const fechaElab = `${String(hoy.getDate()).padStart(2,"0")}/${String(hoy.getMonth()+1).padStart(2,"0")}/${hoy.getFullYear()}`;
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text("FECHA DE ELABORACIÓN", R, 13, { align: "right" });
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text(fechaElab, R, 21, { align: "right" });

  // ── Línea divisora ────────────────────────────────────────────────────────
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.6);
  doc.line(L, 28, R, 28);

  // ── Título ────────────────────────────────────────────────────────────────
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text("AVISO DE BAJA", W / 2, 39, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text("Control de Asistencia — MI Technologies", W / 2, 46, { align: "center" });

  // ── Avatar circular ───────────────────────────────────────────────────────
  const cx = W / 2;
  const cy = 68;
  const cr = 15;
  doc.setFillColor(...NAVY);
  doc.circle(cx, cy, cr, "F");
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(iniciales(c.nombre, c.apellido), cx, cy + 1.5, { align: "center", baseline: "middle" });

  // ── Nombre y puesto ───────────────────────────────────────────────────────
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 20, 20);
  doc.text(c.fullname, W / 2, cy + cr + 8, { align: "center" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text(c.puesto ?? "—", W / 2, cy + cr + 15, { align: "center" });

  // ── Separador fino ────────────────────────────────────────────────────────
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(L + 18, cy + cr + 20, R - 18, cy + cr + 20);

  // ── Datos generales (2 columnas) ──────────────────────────────────────────
  let y = cy + cr + 30;
  const colW = (R - L) / 2;
  const campos = [
    { label: "DEPARTAMENTO",   value: c.departamento },
    { label: "TURNO",          value: c.turno ?? "—" },
    { label: "NÚM. NÓMINA",   value: c.numero_empleado ?? "—" },
    { label: "FECHA DE INGRESO", value: fmt(c.fecha_ingreso) },
  ];
  campos.forEach((campo, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = L + col * colW;
    const yy = y + row * 16;
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(campo.label, x, yy);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(25, 25, 25);
    doc.text(campo.value, x, yy + 7);
  });

  y += Math.ceil(campos.length / 2) * 16 + 6;

  // ── Caja de baja (fondo navy) ─────────────────────────────────────────────
  const boxH = 52;
  doc.setFillColor(...NAVY);
  doc.roundedRect(L, y, R - L, boxH, 3, 3, "F");

  const mid = L + (R - L) / 2 + 4;

  // Fila 1: Tipo de baja | Fecha de baja
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(160, 190, 230);
  doc.text("TIPO DE BAJA", L + 10, y + 9);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(c.tipo_baja ?? "—", L + 10, y + 18);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(160, 190, 230);
  doc.text("FECHA DE BAJA", mid, y + 9);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(fmt(c.fecha_baja), mid, y + 18);

  // Fila 2: Antigüedad | Registrado por
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(160, 190, 230);
  doc.text("ANTIGÜEDAD", L + 10, y + 30);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(antiguedad(c.fecha_ingreso, c.fecha_baja), L + 10, y + 38);

  if (c.dado_de_baja_por) {
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(160, 190, 230);
    doc.text("REGISTRADO POR", mid, y + 30);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(c.dado_de_baja_por, mid, y + 38);
  }

  // Línea divisora interna
  doc.setDrawColor(255, 255, 255, 0.2);
  doc.setLineWidth(0.2);
  doc.line(L + 6, y + 24, R - 6, y + 24);

  y += boxH + 10;

  // ── Motivo ────────────────────────────────────────────────────────────────
  if (c.motivo_baja) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GRAY);
    doc.text("OBSERVACIONES / MOTIVO", L, y);
    y += 5;
    const lines = doc.splitTextToSize(c.motivo_baja, R - L - 10);
    const mH = lines.length * 5.5 + 10;
    doc.setFillColor(...LIGHT);
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.roundedRect(L, y, R - L, mH, 2, 2, "FD");
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    doc.text(lines, L + 6, y + 7);
    y += mH;
  }

  // ── Firmas ────────────────────────────────────────────────────────────────
  const sigY = H - 46;
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.3);
  doc.line(L, sigY - 4, R, sigY - 4);

  const sigs = ["CAPITAL HUMANO", "JEFE / SUPERVISOR", "EL COLABORADOR"];
  const sigW = (R - L) / 3;
  sigs.forEach((label, i) => {
    const x1 = L + i * sigW + 6;
    const x2 = L + (i + 1) * sigW - 6;
    const ly  = sigY + 22;
    doc.setDrawColor(170, 170, 170);
    doc.setLineWidth(0.3);
    doc.line(x1, ly, x2, ly);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(label, (x1 + x2) / 2, ly + 5, { align: "center" });
  });

  // ── Pie de página ─────────────────────────────────────────────────────────
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(190, 190, 190);
  doc.text(
    "Documento generado automáticamente por QualityHub • MI Technologies",
    W / 2, H - 8, { align: "center" },
  );

  doc.save(`Baja_${c.nombre}_${c.apellido}_${c.fecha_baja ?? "sin-fecha"}.pdf`);
}
