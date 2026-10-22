// Imaginación · tipos y resumen puros para Genesis (sin red, sin disco, reloj por parámetro).
// Contrato: architecture/imaginacion-autodesarrollo.md §3, §4 y §6. Espejo de autodesarrollo_logica.py.
export type FuentePropuesta = "diaria" | "profunda" | "astraura" | "directores";
export type ImportanciaPropuesta = "baja" | "media" | "alta" | "crítica";
export type EstadoPropuesta =
  | "nueva" | "autodesarrollo" | "esperando-aprobacion" | "pregunta"
  | "descartada" | "aprobada" | "rechazada" | "pospuesta" | "hecha";

export interface PropuestaImaginacion {
  id: string; fuente: FuentePropuesta; titulo: string; cuerpo: string; archivos: string[];
  utilidad: number; importancia: ImportanciaPropuesta; estado: EstadoPropuesta;
  motivo: string; tarea?: string; t: string; // t: instante ISO 8601
}
export interface FranjaHoraria { dias: number[]; desde: string; hasta: string }
export interface AjustesAutodesarrollo {
  automatico: boolean; rango: { min: number; max: number };
  fuentes: Record<FuentePropuesta, boolean>;
  horario: { modo: "inteligente" | "franjas"; franjas: FranjaHoraria[]; repartir: boolean };
  profunda: { cada_dias: number };
}
export const NOMBRE_FUENTE: Record<FuentePropuesta, string> = {
  diaria: "Imaginación diaria", profunda: "Imaginación profunda",
  astraura: "Procesos imaginativos de Astraura", directores: "Directores",
};
export const AJUSTES_POR_DEFECTO: AjustesAutodesarrollo = {
  automatico: true, rango: { min: 0, max: 10 },
  fuentes: { diaria: true, profunda: true, astraura: true, directores: true },
  horario: { modo: "inteligente", franjas: [{ dias: [0, 1, 2, 3, 4, 5, 6], desde: "02:00", hasta: "06:00" }], repartir: true },
  profunda: { cada_dias: 7 },
};
const FUENTES = Object.keys(AJUSTES_POR_DEFECTO.fuentes) as FuentePropuesta[];
const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
const esObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const entero = (v: unknown, def: number, lo: number, hi: number) =>
  typeof v === "number" && Number.isInteger(v) ? Math.max(lo, Math.min(hi, v)) : def;

function franja(f: unknown): FranjaHoraria | null {
  if (!esObj(f) || !Array.isArray(f.dias)) return null;
  const dias = [...new Set(f.dias.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  const { desde, hasta } = f;
  if (!dias.length || typeof desde !== "string" || typeof hasta !== "string") return null;
  if (!HORA.test(desde) || !HORA.test(hasta) || desde === hasta) return null;
  return { dias, desde, hasta };
}

/** Ajustes completos y válidos; lo inválido vuelve al defecto (igual que Python). */
export function validarAjustes(d: unknown): AjustesAutodesarrollo {
  const r: AjustesAutodesarrollo = structuredClone(AJUSTES_POR_DEFECTO);
  if (!esObj(d)) return r;
  if (typeof d.automatico === "boolean") r.automatico = d.automatico;
  const rg = esObj(d.rango) ? d.rango : {};
  const mx = entero(rg.max, r.rango.max, 0, 10);
  r.rango = { min: Math.min(entero(rg.min, r.rango.min, 0, 10), mx), max: mx };
  const fu = esObj(d.fuentes) ? d.fuentes : {};
  for (const k of FUENTES) if (typeof fu[k] === "boolean") r.fuentes[k] = fu[k] as boolean;
  const h = esObj(d.horario) ? d.horario : {};
  if (h.modo === "inteligente" || h.modo === "franjas") r.horario.modo = h.modo;
  if (typeof h.repartir === "boolean") r.horario.repartir = h.repartir;
  if (Array.isArray(h.franjas)) {
    const validas = h.franjas.map(franja).filter((x): x is FranjaHoraria => x !== null);
    if (validas.length || h.franjas.length === 0) r.horario.franjas = validas;
  }
  r.profunda.cada_dias = entero(esObj(d.profunda) ? d.profunda.cada_dias : undefined, 7, 0, 365);
  return r;
}

const ESPERAN: EstadoPropuesta[] = ["esperando-aprobacion", "pregunta"];
const PESO_IMPORTANCIA: Record<ImportanciaPropuesta, number> = { crítica: 3, alta: 2, media: 1, baja: 0 };
const mismoDia = (iso: string, hoy: Date) => {
  const f = new Date(iso);
  return !Number.isNaN(f.getTime()) && f.toDateString() === hoy.toDateString();
};

export interface ResumenPastilla { texto: string; tono: "ok" | "atencion" | "aviso"; porAprobar: number; autodesarrolladasHoy: number }
/** «N por aprobar · M autodesarrolladas hoy (rango a–b)». Tono: aviso si espera algo alto o crítico. */
export function resumenPastilla(propuestas: PropuestaImaginacion[], ajustes: AjustesAutodesarrollo, hoy: Date): ResumenPastilla {
  const espera = propuestas.filter((p) => ESPERAN.includes(p.estado));
  const hechas = propuestas.filter((p) => p.estado === "autodesarrollo" && mismoDia(p.t, hoy)).length;
  const { min, max } = ajustes.rango;
  const tono = espera.some((p) => PESO_IMPORTANCIA[p.importancia] >= 2) ? "aviso" : espera.length ? "atencion" : "ok";
  return { texto: `${espera.length} por aprobar · ${hechas} autodesarrolladas hoy (rango ${min}–${max})`, tono, porAprobar: espera.length, autodesarrolladasHoy: hechas };
}

export type AccionPropuesta = "aprobar" | "rechazar" | "posponer" | "ver-origen";
export interface FilaMedidor { id: string; titulo: string; fuente: string; utilidad: number; importancia: ImportanciaPropuesta; estado: EstadoPropuesta; tarea?: string; esperaAlex: boolean; acciones: AccionPropuesta[] }
/** Filas: primero lo que espera a Alex, luego por importancia y utilidad. Solo se decide lo que está esperando o pospuesto. */
export function filasMedidor(propuestas: PropuestaImaginacion[]): FilaMedidor[] {
  return propuestas.map((p) => {
    const esperaAlex = ESPERAN.includes(p.estado);
    const acciones: AccionPropuesta[] = esperaAlex || p.estado === "pospuesta" ? ["aprobar", "rechazar", "posponer", "ver-origen"] : ["ver-origen"];
    return { id: p.id, titulo: p.titulo, fuente: NOMBRE_FUENTE[p.fuente], utilidad: p.utilidad, importancia: p.importancia, estado: p.estado, tarea: p.tarea, esperaAlex, acciones };
  }).sort((a, b) => Number(b.esperaAlex) - Number(a.esperaAlex) || PESO_IMPORTANCIA[b.importancia] - PESO_IMPORTANCIA[a.importancia] || b.utilidad - a.utilidad || a.id.localeCompare(b.id));
}
