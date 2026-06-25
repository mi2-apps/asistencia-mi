import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface RegistroPDF {
  id: number;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  horas_totales: string;
  area: string;
  motivo: string;
  autorizado_por: string;
  colaborador_id: number;
  fullname: string;
  numero_empleado: string | null;
  departamento: string;
  puesto: string | null;
}

export interface SemanaPDF {
  year: number;
  week: number;
  inicio: string;
  fin: string;
}

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES_LARGOS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

const NAVY = [27, 58, 107] as [number, number, number];
const BLUE = [37, 99, 235] as [number, number, number];
const GRAY = [107, 114, 128] as [number, number, number];

function agregarDias(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function ddmm(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

function cargarImagenBase64(url: string): Promise<string> {
  return fetch(url)
    .then(r => r.blob())
    .then(blob => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }));
}

export async function generarPDFTiempoExtra(
  registros: RegistroPDF[],
  semana: SemanaPDF,
  departamento: string,
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const L = 14;

  // ── Logo MI Technologies ──
  // Dimensiones reales de logo.png ≈ 550×185 px → ratio 2.97:1
  const logoW = 42;
  const logoH = Math.round(logoW / 2.97);  // ≈ 14 mm
  try {
    const logoData = await cargarImagenBase64("/assets/logo.png");
    doc.addImage(logoData, "PNG", L, 8, logoW, logoH);
  } catch {
    // Fallback: texto plano si la imagen no carga
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text("MI Technologies, Inc.", L, 16);
  }

  const titleX = L + logoW + 4;

  // ── Título ──
  doc.setTextColor(...NAVY);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("REPORTE DE TIEMPO EXTRA", titleX, 14);

  const [sy, sm, sd] = semana.inicio.split("-").map(Number);
  const [, em, ed] = semana.fin.split("-").map(Number);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text(
    `Semana ${semana.week}: ${sd} ${MESES_LARGOS[sm - 1]} ${sy} - ${ed} ${MESES_LARGOS[em - 1]} ${sy}`,
    titleX, 21,
  );

  // ── Fecha de elaboración ──
  const hoy = new Date();
  const fechaElab = `${String(hoy.getDate()).padStart(2, "0")}/${String(hoy.getMonth() + 1).padStart(2, "0")}/${hoy.getFullYear()}`;
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text("FECHA DE ELABORACIÓN:", W - L, 11, { align: "right" });
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text(fechaElab, W - L, 21, { align: "right" });

  // ── Línea separadora ──
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.5);
  doc.line(L, 26, W - L, 26);

  // ── Info card ──
  const cardY = 30;
  const cardH = 18;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.roundedRect(L, cardY, W - 2 * L, cardH, 2, 2, "S");

  const autorizado = registros.find(r => r.autorizado_por)?.autorizado_por ?? "—";
  const cantPersonal = new Set(registros.map(r => r.colaborador_id)).size;
  const cardCols = [
    { label: "ÁREA",            value: departamento },
    { label: "TURNO",           value: "—" },
    { label: "CANT. PERSONAL",  value: String(cantPersonal) },
    { label: "AUTORIZADO POR",  value: autorizado },
  ];
  const colW = (W - 2 * L) / cardCols.length;
  cardCols.forEach((col, i) => {
    const x = L + i * colW + 8;
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(col.label, x, cardY + 6);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text(col.value, x, cardY + 13);
  });

  // ── Tabla ──
  const tableY = cardY + cardH + 6;

  // Días de la semana (lun–dom)
  const dias: string[] = Array.from({ length: 7 }, (_, i) => agregarDias(semana.inicio, i));

  // Agrupar registros por colaborador
  type Entry = {
    numero_empleado: string;
    departamento: string;
    fullname: string;
    motivo: string;
    horasPorDia: Map<string, number>;
    total: number;
  };

  const byColab = new Map<number, Entry>();
  for (const r of registros) {
    if (!byColab.has(r.colaborador_id)) {
      byColab.set(r.colaborador_id, {
        numero_empleado: r.numero_empleado ?? "—",
        departamento: r.departamento,
        fullname: r.fullname,
        motivo: r.motivo,
        horasPorDia: new Map(),
        total: 0,
      });
    }
    const entry = byColab.get(r.colaborador_id)!;
    const h = parseFloat(r.horas_totales ?? "0");
    entry.horasPorDia.set(r.fecha, (entry.horasPorDia.get(r.fecha) ?? 0) + h);
    entry.total += h;
  }

  const sumaTotal = Array.from(byColab.values()).reduce((a, e) => a + e.total, 0);

  // Cabeceras de días
  const dayHeads = dias.map((d, i) => ({
    content: `${DIAS[i]}\n${ddmm(d)}`,
    styles: {
      halign: "center" as const,
      fillColor: BLUE,
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: "bold" as const,
      fontSize: 7.5,
    },
  }));

  const head = [
    [
      { content: "INFORMACIÓN DEL COLABORADOR", colSpan: 4, styles: { halign: "center" as const, fillColor: NAVY, textColor: [255,255,255] as [number,number,number], fontStyle: "bold" as const, fontSize: 9 } },
      { content: "CANTIDAD DE HORAS POR DÍA",   colSpan: 7, styles: { halign: "center" as const, fillColor: NAVY, textColor: [255,255,255] as [number,number,number], fontStyle: "bold" as const, fontSize: 9 } },
      { content: "TOTAL",                        colSpan: 1, styles: { halign: "center" as const, fillColor: NAVY, textColor: [255,255,255] as [number,number,number], fontStyle: "bold" as const, fontSize: 9 } },
    ],
    [
      { content: "No. Emp",        styles: { halign: "center" as const, fillColor: BLUE, textColor: [255,255,255] as [number,number,number], fontStyle: "bold" as const, fontSize: 8 } },
      { content: "Depto",          styles: { halign: "center" as const, fillColor: BLUE, textColor: [255,255,255] as [number,number,number], fontStyle: "bold" as const, fontSize: 8 } },
      { content: "Nombre Completo",styles: { halign: "left"   as const, fillColor: BLUE, textColor: [255,255,255] as [number,number,number], fontStyle: "bold" as const, fontSize: 8 } },
      { content: "Motivo",         styles: { halign: "left"   as const, fillColor: BLUE, textColor: [255,255,255] as [number,number,number], fontStyle: "bold" as const, fontSize: 8 } },
      ...dayHeads,
      { content: "Horas",          styles: { halign: "center" as const, fillColor: BLUE, textColor: [255,255,255] as [number,number,number], fontStyle: "bold" as const, fontSize: 8 } },
    ],
  ];

  const body = Array.from(byColab.values()).map(e => [
    e.numero_empleado,
    e.departamento,
    e.fullname,
    e.motivo,
    ...dias.map(d => {
      const h = e.horasPorDia.get(d);
      return h !== undefined ? h.toFixed(2) : "-";
    }),
    { content: e.total.toFixed(2), styles: { fontStyle: "bold" as const, textColor: NAVY } },
  ]);

  const foot = [[
    {
      content: "SUMA TOTAL:",
      colSpan: 11,
      styles: { halign: "right" as const, fontStyle: "bold" as const, fontSize: 9, fillColor: [249, 250, 251] as [number,number,number] },
    },
    {
      content: sumaTotal.toFixed(2),
      styles: { halign: "center" as const, fontStyle: "bold" as const, fontSize: 10, textColor: NAVY, fillColor: [249, 250, 251] as [number,number,number] },
    },
  ]];

  autoTable(doc, {
    startY: tableY,
    head,
    body,
    foot,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 3, lineColor: [220, 220, 220] as [number,number,number], lineWidth: 0.3, textColor: [30, 30, 30] as [number,number,number] },
    columnStyles: {
      0:  { halign: "center", cellWidth: 18 },
      1:  { halign: "center", cellWidth: 22 },
      2:  { cellWidth: 42 },
      3:  { cellWidth: 45 },
      4:  { halign: "center", cellWidth: 14 },
      5:  { halign: "center", cellWidth: 14 },
      6:  { halign: "center", cellWidth: 14 },
      7:  { halign: "center", cellWidth: 14 },
      8:  { halign: "center", cellWidth: 14 },
      9:  { halign: "center", cellWidth: 14 },
      10: { halign: "center", cellWidth: 14 },
      11: { halign: "center", cellWidth: 18 },
    },
    margin: { left: L, right: L },
    alternateRowStyles: { fillColor: [249, 250, 251] as [number,number,number] },
  });

  // Posición después de la tabla
  const afterTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

  // ── Firmas ──
  const sigLabels = ["RESPONSABLE DE ÁREA", "AUTORIZA EL PAGO", "CAPITAL HUMANO"];
  const sigW = (W - 2 * L) / 3;
  sigLabels.forEach((label, i) => {
    const x = L + i * sigW + 4;
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(label, x, afterTable);
    doc.setDrawColor(170, 170, 170);
    doc.setLineWidth(0.3);
    doc.line(x, afterTable + 14, x + sigW - 10, afterTable + 14);
  });

  // ── Pie de página ──
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 180, 180);
  doc.text(
    "Documento generado automáticamente por QualityHub • MI Technologies",
    W / 2, H - 8, { align: "center" },
  );

  // ── Guardar ──
  doc.save(`TiempoExtra_${departamento}_${semana.inicio}_${semana.fin}.pdf`);
}
