"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HERMAYONE BRIDGE — @deprecated · RE-EXPORT del puente canónico (Adenda 71-ter)
 * ---------------------------------------------------------------------------
 * "Hermayone" y "Hermione" eran DOS módulos gemelos con el MISMO
 * `PERSONALITY_ID` (c9fe7030-…) y el MISMO `NEURON_ID` (c0ffee01-…): dos
 * implementaciones para una única entidad → riesgo de DOBLE PROCESAMIENTO
 * (el mismo mensaje reenviado dos veces a la neurona). Se fusionan en un solo
 * módulo parametrizado: `hermione-bridge.ts` es el CANÓNICO y este archivo
 * queda como un re-export DEPRECATED que mapea los nombres "Hermayone" a la
 * implementación de Hermione. Así hay UNA sola fuente de verdad y desaparece
 * el doble procesamiento, sin romper a los pocos consumidores que aún importan
 * los símbolos "Hermayone".
 *
 * No añadas lógica nueva aquí: usa `@/lib/aurora/hermione-bridge`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export {
  HERMIONE_PERSONALITY_ID as HERMAYONE_PERSONALITY_ID,
  HERMIONE_PERSONALITY_NAME as HERMAYONE_PERSONALITY_NAME,
  HERMIONE_NEURON_ID as HERMAYONE_NEURON_ID,
  getHermioneNeuron as getHermayoneNeuron,
  isHermioneActive as isHermayoneActive,
  forwardToHermioneNeuron as forwardToHermayoneNeuron,
  watchHermioneThread as watchHermayoneThread,
  writeHermioneReply as writeHermayoneReply,
  HERMIONE_LIBRARY_MANIFEST as HERMAYONE_LIBRARY_MANIFEST,
} from "@/lib/aurora/hermione-bridge";

export type { HermioneBridgeInfo as HermayoneBridgeInfo } from "@/lib/aurora/hermione-bridge";
