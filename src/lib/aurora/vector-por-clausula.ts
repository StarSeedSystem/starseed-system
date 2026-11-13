"use client";
/**
 * StarSeed OS · VECTOR VISUAL DE LA ORBE POR CLÁUSULA (idea del Dream 2026-11-13).
 * ----------------------------------------------------------------------------
 * Cuando Astraura habla cláusula a cláusula (`streaming-voice.ts`), la orbe
 * cuántica solo cambia por audio (level/frequencies) y por la expresión del
 * bot (BOT1011D2). Aquí se añade lo que faltaba: cada cláusula SPOKEN publica
 * SU vector expresivo (`turbulence`, `spikiness`, `symmetry`, `hueShift`,
 * `breath`) en el canal `params` del bus de la orbe
 * (`quantum-orb-bus.ts`), el mismo canal que ya consume `aurora-orb.tsx`.
 *
 * El mapeo es una HEURÍSTICA provisional de puntuación y longitud, en 0..1:
 *   · pregunta (`¿?`)   → más agitación (`turbulence`), menos simetría
 *   · exclamación (`¡!`) → más filo (`spikiness`), menos simetría, matiz cálido
 *   · palabras           → la respiración (`breath`) crece con la cláusula
 * El backend 1.58b podrá publicar su propio vector por el MISMO canal en
 * cualquier momento: el payload es `Partial<QuantumOrbParams>` y quien
 * consume no sabe quién publicó.
 *
 * Puro y sin `any`: solo quema la puntuación del texto recibido.
 */
import { emitQuantumOrbParams } from "@/lib/aurora/quantum-orb-bus";
import type { QuantumOrbParams } from "@/lib/aurora/quantum-orb-theme";

const acotar = (n: number): number => Math.min(1, Math.max(0, n));
const r3 = (x: number): number => Math.round(x * 1000) / 1000;
/** Tope de palabras por cláusula del troceador (`streaming-voice.ts`). */
const TOPE_PALABRAS = 14;

/** Lo que hay que reconocer en una cláusula para expresarla. */
interface SenalesClausula {
  palabras: number;
  pregunta: boolean;
  exclama: boolean;
}

function senalesDe(texto: string): SenalesClausula | null {
  if (!texto || !texto.trim()) return null;
  const palabras = (texto.match(/\S+/g) ?? []).length;
  if (palabras === 0) return null;
  return { palabras, pregunta: /[?¿]/.test(texto), exclama: /[!¡]/.test(texto) };
}

/** Cláusula → vector expresivo de la orbe (todas las claves en 0..1). Pura y determinista. */
export function vectorDeClausula(texto: string): Partial<QuantumOrbParams> {
  const s = senalesDe(texto);
  if (!s) return {};
  const progreso = Math.min(s.palabras / TOPE_PALABRAS, 1);
  return {
    breath: r3(acotar(0.25 + 0.5 * progreso)),
    turbulence: r3(s.pregunta || s.exclama ? 0.7 : 0.35),
    spikiness: r3(s.exclama ? 0.75 : s.pregunta ? 0.45 : 0.25),
    symmetry: r3(s.exclama ? 0.35 : s.pregunta ? 0.5 : 0.7),
    hueShift: r3(s.exclama ? 0.65 : s.pregunta ? 0.4 : 0.5),
  };
}

/**
 * Publica el vector de UNA cláusula en el canal `params`. Solo con texto
 * pronunciable (alguna letra o dígito, igual que la higiene de la voz) y
 * NUNCA lanza: la publicación no puede romper el turno de la voz.
 */
export function emitirVectorPorClausula(texto: string): void {
  try {
    if (!/[\p{L}\p{N}]/u.test(texto)) return;
    emitQuantumOrbParams(vectorDeClausula(texto));
  } catch {
    /* defensivo: el bus nunca lanza, pero la regla del repo manda */
  }
}
