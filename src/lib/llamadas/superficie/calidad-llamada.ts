/**
 * Indicador de calidad de la llamada (LLA1108C) — PURO. Reúne medio, latencia, caudal, pérdida, códec y
 * cifrado. Reutiliza el clasificador común de ruta (`clasificarPar`/`etiquetaRuta`, BLE1108B), la nota de
 * calidad de `calidad.ts` y la etiqueta de `cifradoDe()` (CIF1108A): no se inventa ninguna medida.
 */
import { etiquetaRuta, type ClaseRuta } from "@/lib/network/estadisticas-enlace";
import { calidadDesde } from "@/lib/llamadas/calidad";
import type { CalidadConexion } from "@/lib/llamadas/tipos";
import type { EtiquetaCifrado } from "@/lib/malla/sesion-cifrada";

export interface MedidasLlamada {
  ruta: ClaseRuta | null;
  rttMs: number | null;
  bitrateKbps: number | null;
  perdidaPct: number | null;
  jitterMs: number | null;
  codec: string | null;
  cifrado: EtiquetaCifrado | null;
}

export interface FilaCalidad {
  clave: "medio" | "latencia" | "caudal" | "perdida" | "codec" | "cifrado";
  etiqueta: string;
  valor: string;
  /** Para colorear sin depender solo del color (se añade siempre texto). */
  nivel: "ok" | "aviso" | "mal" | "neutro";
}

export interface ResumenCalidad {
  calidad: CalidadConexion;
  /** 0..4 barras. */
  barras: number;
  filas: FilaCalidad[];
  /** Frase corta para el lector de pantalla. */
  texto: string;
}

const NA = "sin medir";

/** Caudal en kbit/s a partir de dos lecturas acumuladas de bytes. null si no se puede. */
export function caudalKbps(prev: { bytes: number; en: number } | null, act: { bytes: number; en: number }): number | null {
  if (!prev || act.en <= prev.en || act.bytes < prev.bytes) return null;
  return Math.round(((act.bytes - prev.bytes) * 8) / (act.en - prev.en));
}

const NOMBRE_CIFRADO: Record<EtiquetaCifrado, { valor: string; nivel: FilaCalidad["nivel"] }> = {
  cifrado: { valor: "cifrado de extremo a extremo", nivel: "ok" },
  "sin-cifrar": { valor: "sin cifrar", nivel: "mal" },
  pendiente: { valor: "cifrado pendiente", nivel: "aviso" },
};

export function resumirCalidadLlamada(m: MedidasLlamada): ResumenCalidad {
  const calidad = calidadDesde({ rttMs: m.rttMs, perdidaPct: m.perdidaPct, jitterMs: m.jitterMs });
  const barras = { buena: 4, regular: 3, mala: 1, desconocida: 0 }[calidad];
  const nivelCal: FilaCalidad["nivel"] = calidad === "buena" ? "ok" : calidad === "regular" ? "aviso" : calidad === "mala" ? "mal" : "neutro";
  const cif = m.cifrado ? NOMBRE_CIFRADO[m.cifrado] : { valor: NA, nivel: "neutro" as const };
  const filas: FilaCalidad[] = [
    { clave: "medio", etiqueta: "Medio", valor: m.ruta ? etiquetaRuta(m.ruta) : NA, nivel: m.ruta === "reenviado-turn" ? "aviso" : m.ruta ? "ok" : "neutro" },
    { clave: "latencia", etiqueta: "Latencia", valor: m.rttMs === null ? NA : `${Math.round(m.rttMs)} ms`, nivel: m.rttMs === null ? "neutro" : m.rttMs < 150 ? "ok" : m.rttMs < 300 ? "aviso" : "mal" },
    { clave: "caudal", etiqueta: "Caudal", valor: m.bitrateKbps === null ? NA : `${m.bitrateKbps} kbit/s`, nivel: "neutro" },
    { clave: "perdida", etiqueta: "Pérdida", valor: m.perdidaPct === null ? NA : `${m.perdidaPct.toFixed(1)} %`, nivel: m.perdidaPct === null ? "neutro" : m.perdidaPct < 2 ? "ok" : m.perdidaPct < 8 ? "aviso" : "mal" },
    { clave: "codec", etiqueta: "Códec", valor: m.codec ?? NA, nivel: "neutro" },
    { clave: "cifrado", etiqueta: "Cifrado", valor: cif.valor, nivel: cif.nivel },
  ];
  const palabra = { buena: "buena", regular: "regular", mala: "mala", desconocida: "sin medir" }[calidad];
  return { calidad, barras, filas, texto: `Calidad ${palabra}${m.ruta ? `, por ${etiquetaRuta(m.ruta)}` : ""}${m.cifrado === "cifrado" ? ", cifrada" : ""}` };
}
