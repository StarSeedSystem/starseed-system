import {
  HABILIDADES_INGENIERIA_A,
  type HabilidadIngenieria,
} from "./habilidades/ingenieria-a";
import { HABILIDADES_INGENIERIA_B } from "./habilidades/ingenieria-b";

/**
 * Catálogo de habilidades de ingeniería (Matt Pocock) que el vigía mantiene al día
 * --------------------------------------------------------------------------------
 * Consolidación de las dos manos del contrato architecture/laya-y-habilidades.md §5:
 * junta `HABILIDADES_INGENIERIA_A` (TDD, diagnóstico, diseño, dominio, revisión) y
 * `HABILIDADES_INGENIERIA_B` (especificar y trocear: to-spec, to-tickets, triage,
 * prototipo, investigación, arquitectura e implementación). Config/vigia-areas.json
 * nombra este archivo como `catalogo` del área «habilidades»: es aquí donde el vigía
 * propone las tarjetas nuevas o actualizadas de `mattpocock/skills`.
 *
 * Módulo PURO: solo datos y funciones sin red, disco ni reloj (sirve en cliente y servidor).
 */

export type { HabilidadIngenieria };

/** Las 12 habilidades de ingeniería, A primero (contrato architecture/laya-y-habilidades.md §5). */
export const HABILIDADES_INGENIERIA: HabilidadIngenieria[] = [
  ...HABILIDADES_INGENIERIA_A,
  ...HABILIDADES_INGENIERIA_B,
];
