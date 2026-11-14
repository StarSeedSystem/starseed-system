/**
 * ACT1113F · ¿toca cambiar a la build publicada? Decisión pura (sin red, sin DOM).
 * Una sola salida; quien llama aplica «aplicar» o espera según el motivo.
 */

export type DecisionBuild =
  | "al-dia" // la que corre es la publicada (o no se sabe una de las dos: no se adivina)
  | "aplicar"
  | "esperar-llamada" // hay una llamada activa: nunca se cambia durante una llamada
  | "esperar-escritura" // texto sin guardar o un campo con foco
  | "esperar-red" // sin red no se puede traer la nueva: se sigue con lo que hay
  | "tope"; // ya se recargó el máximo de veces esta sesión: no se insiste

export interface EntradaDecisionBuild {
  corriendo: string | null;
  publicada: string | null;
  enLlamada: boolean;
  escribiendo: boolean;
  enLinea: boolean;
  recargasEstaSesion: number;
  topeRecargas: number;
}

export const TOPE_RECARGAS_SESION = 2;

export function decidirCambioBuild(e: EntradaDecisionBuild): DecisionBuild {
  if (!e.corriendo || !e.publicada || e.corriendo === e.publicada) return "al-dia";
  if (!e.enLinea) return "esperar-red";
  if (e.recargasEstaSesion >= e.topeRecargas) return "tope";
  if (e.enLlamada) return "esperar-llamada";
  if (e.escribiendo) return "esperar-escritura";
  return "aplicar";
}

/** Cada cuánto se mira /version.json con la pestaña abierta, y cada cuánto se reintenta si hay que esperar. */
export const MIRAR_CADA_MS = 5 * 60 * 1000;
export const REINTENTO_ESPERA_MS = 20 * 1000;
