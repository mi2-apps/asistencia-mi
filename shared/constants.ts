export const DEPARTAMENTOS_LIST = [
  "Incoming", "Sorting", "FFT", "Paletizado", "Almacen", "Calidad",
  "Shipping", "Open Cell", "Auditoria", "HR", "Finance", "Traffic",
  "Maintenance", "B2B (Shipping)", "B2C (Shipping)", "ADMINISTRACION",
  "COMPRAS", "DESARROLLO DE SOFTWARE", "DISEÑO", "SISTEMAS",
  "OPERACIONES", "TRANSPORTE", "SHIPPING", "SEGURIDAD E HIGIENE",
  "SEGURIDAD PATRIMONIAL", "IMPORT EXPORT", "ENFERMERIA",
  "LOGISTICA", "MARKETING", "PATIO", "RMA",
] as const;

export const PUESTOS_LIST = [
  "Inspector de Calidad", "Lider de Calidad", "Tecnico de Calidad",
  "Supervisor de Calidad", "Gerente de Calidad", "Auditor de Calidad",
  "Coordinador de Calidad", "Analista de Calidad", "Inspector de Incoming",
  "Lider de Incoming", "Supervisor de Incoming", "Inspector de Sorting",
  "Lider de Sorting", "Supervisor de Sorting", "Operador de Paletizado",
  "Lider de Paletizado", "Supervisor de Paletizado", "Almacenista",
  "Lider de Almacen", "Supervisor de Almacen", "Auxiliar de Almacen",
  "Operador de Shipping", "Lider de Shipping", "Supervisor de Shipping",
  "Coordinador de Shipping", "Tecnico de Open Cell", "Lider de Open Cell",
  "Supervisor de Open Cell", "Auditor Interno", "Lider de Auditoria",
  "Supervisor de Auditoria", "Especialista en RH", "Coordinador de RH",
  "Gerente de RH", "Auxiliar de RH", "Analista de RH",
  "Analista de Finanzas", "Coordinador de Finanzas", "Gerente de Finanzas",
  "Contador", "Auxiliar Contable", "Coordinador de Trafico",
  "Operador de Trafico", "Supervisor de Trafico",
  "Tecnico de Mantenimiento", "Lider de Mantenimiento",
  "Supervisor de Mantenimiento", "Ingeniero de Mantenimiento",
  "Coordinador Administrativo", "Auxiliar Administrativo",
  "Gerente Administrativo", "Analista de Compras", "Coordinador de Compras",
  "Gerente de Compras", "Desarrollador de Software", "Analista de Sistemas",
  "Coordinador de TI", "Gerente de TI", "Soporte Tecnico",
  "Diseñador Grafico", "Diseñador UX/UI", "Coordinador de Diseño",
  "Coordinador de Operaciones", "Supervisor de Operaciones",
  "Gerente de Operaciones", "Chofer", "Coordinador de Transporte",
  "Supervisor de Transporte", "Tecnico de Seguridad e Higiene",
  "Coordinador de Seguridad", "Supervisor de Seguridad",
  "Guardia de Seguridad Patrimonial", "Coordinador de Importaciones",
  "Analista de Comercio Exterior", "Enfermero/a", "Coordinador de Enfermeria",
  "Coordinador de Logistica", "Analista de Logistica",
  "Supervisor de Logistica", "Coordinador de Marketing",
  "Analista de Marketing", "Auxiliar de Patio", "Coordinador de Patio",
  "Tecnico de RMA", "Lider de RMA", "Supervisor de RMA",
] as const;

export const DEPT_COLORS: Record<string, string> = {
  "Incoming":               "#3B82F6",
  "Sorting":                "#8B5CF6",
  "FFT":                    "#06B6D4",
  "Paletizado":             "#F59E0B",
  "Almacen":                "#10B981",
  "Calidad":                "#EF4444",
  "Shipping":               "#F97316",
  "Open Cell":              "#EC4899",
  "Auditoria":              "#6366F1",
  "HR":                     "#14B8A6",
  "Finance":                "#84CC16",
  "Traffic":                "#A855F7",
  "Maintenance":            "#0EA5E9",
  "B2B (Shipping)":         "#FB923C",
  "B2C (Shipping)":         "#F472B6",
  "ADMINISTRACION":         "#6B7280",
  "COMPRAS":                "#D97706",
  "DESARROLLO DE SOFTWARE": "#2563EB",
  "DISEÑO":                 "#DB2777",
  "SISTEMAS":               "#0284C7",
  "OPERACIONES":            "#16A34A",
  "TRANSPORTE":             "#B45309",
  "SHIPPING":               "#EA580C",
  "SEGURIDAD E HIGIENE":    "#DC2626",
  "SEGURIDAD PATRIMONIAL":  "#7C3AED",
  "IMPORT EXPORT":          "#0D9488",
  "ENFERMERIA":             "#BE185D",
  "LOGISTICA":              "#1D4ED8",
  "MARKETING":              "#C026D3",
  "PATIO":                  "#78716C",
  "RMA":                    "#0F766E",
};

export const TIPOS_INASISTENCIA = [
  { code: "FI",          label: "Falta Injustificada" },
  { code: "FJ",          label: "Falta Justificada" },
  { code: "PSG",         label: "Permiso Sin Goce" },
  { code: "PCG",         label: "Permiso Con Goce" },
  { code: "Suspension",  label: "Suspension" },
  { code: "Vacaciones",  label: "Vacaciones" },
  { code: "IT",          label: "Incapacidad por Trabajo" },
  { code: "RET",         label: "Retardo" },
  { code: "CUM",         label: "Cumpleaños" },
  { code: "FES",         label: "Festivo" },
] as const;

export const TIPOS_BAJA = [
  "Renuncia voluntaria",
  "Rescisión con causa (Art. 47 LFT)",
  "Rescisión sin causa",
  "Término de contrato",
  "Jubilación",
  "Defunción",
  "Incapacidad permanente",
] as const;

export const TURNOS = ["Matutino", "Vespertino", "Nocturno"] as const;

export type Departamento = typeof DEPARTAMENTOS_LIST[number];
export type Puesto = typeof PUESTOS_LIST[number];
export type TipoInasistencia = typeof TIPOS_INASISTENCIA[number]["code"];
export type TipoBaja = typeof TIPOS_BAJA[number];
export type Turno = typeof TURNOS[number];
