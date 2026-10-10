/*
 * formato-en-vivo (2026-10-10) — textos de la interfaz de las estaciones en vivo, a partir de lo
 * MEDIDO. Puro: lo comparten el panel y el minicontrol, y se prueba sin DOM.
 */

import type { EstadoReloj } from "@/lib/estaciones/reloj-comun";

const ms1 = (n: number) => n.toLocaleString("es", { maximumFractionDigits: 1 });

/** 75 000 → «1:15»; 3 723 000 → «1:02:03». */
export function formatearMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dd = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${dd(m)}:${dd(s)}` : `${m}:${dd(s)}`;
}

export function textoReloj(r: EstadoReloj): { principal: string; detalle: string | null; corto: string } {
  if (r.modo === "referencia") {
    return {
      principal: "Este aparato marca la hora común",
      detalle: "Los demás medios miden su desfase contra él.",
      corto: "referencia",
    };
  }
  if (r.modo === "sincronizado" && r.precisionMs !== null) {
    return {
      principal: `Sincronizado ± ${ms1(r.precisionMs)} ms`,
      detalle:
        `Cota máxima ± ${ms1(r.cotaMs ?? 0)} ms · ida y vuelta mínima ${ms1(r.retardoMinMs ?? 0)} ms · ${r.muestras} medidas` +
        (r.derivaPpm ? ` · deriva de este reloj ${ms1(r.derivaPpm)} ppm (compensada)` : ""),
      corto: `± ${ms1(r.precisionMs)} ms`,
    };
  }
  return {
    principal: "Midiendo la hora común…",
    detalle: "Hace falta que el anfitrión esté conectado; mientras tanto se usa la hora de este aparato.",
    corto: "sin medir",
  };
}
