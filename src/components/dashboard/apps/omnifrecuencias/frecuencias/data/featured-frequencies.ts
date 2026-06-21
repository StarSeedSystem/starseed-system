// ════════════════════════════════════════════════════════════════
// Omni-Frecuencias — Selección destacada para el reproductor compacto
// ----------------------------------------------------------------
// El widget del dashboard no muestra las ~80 frecuencias completas: ofrece
// un set CURADO de las más usadas (Solfeggio, sinergias binaurales, ondas
// cerebrales, afinación 432, Schumann). Todas son entradas REALES de
// `frequencyData` (misma fuente de la app), referenciadas por id para no
// duplicar datos: si la biblioteca cambia, el reproductor se mantiene
// coherente. La app completa sigue usando `frequencyData` íntegro.
// ════════════════════════════════════════════════════════════════

import { frequencyData } from './frequencies';
import type { FrequencyItem } from '../types';

/** Ids destacados (orden = orden de aparición en el reproductor). */
export const FEATURED_IDS: readonly string[] = [
  'solf_528', // 528 Hz · Reparación / ADN
  'solf_396', // 396 Hz · Liberación
  'scale_a', // 432 Hz · Afinación natural
  'schumann_fund', // 7.83 Hz · Schumann
  'solf_639', // 639 Hz · Vínculos
  'solf_741', // 741 Hz · Expresión / Detox
  'syn_gaia_matrix', // 528 + 7.83 (sinergia)
  'syn_phi', // Binaural áureo (sinergia)
  'brain_alpha', // Alfa · relajación
  'brain_theta', // Theta · meditación
  'brain_delta', // Delta · sueño
  'solf_963', // 963 Hz · Corona
] as const;

/** Frecuencias destacadas resueltas desde la biblioteca real (en orden). */
export const FEATURED_FREQUENCIES: FrequencyItem[] = FEATURED_IDS.map((id) =>
  frequencyData.find((f) => f.id === id),
).filter((f): f is FrequencyItem => Boolean(f));
