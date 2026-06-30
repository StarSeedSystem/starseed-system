"use client";

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Skills por defecto de cada cerebro
// ----------------------------------------------------------------
// Registro ADITIVO y mínimo de las skills que un cerebro nuevo incluye por
// defecto. Hoy contiene la skill "Auto-actualización + Recomendaciones"
// (`starseed-auto-update`), activada por defecto en cada cerebro pero
// totalmente configurable y removible.
//
// No existía un registro de skills por defecto en otro sitio (búsqueda
// realizada), así que este archivo lo crea de forma additiva. Si en el futuro
// aparece un registro canónico en otro módulo, fusiona esta lista allí en
// lugar de duplicarla.
// ════════════════════════════════════════════════════════════════

import {
  AUTO_UPDATE_SKILL_ID,
  AUTO_UPDATE_SKILL_META,
} from "./auto-update-agent";

/** Descriptor mínimo de una skill por defecto de un cerebro. */
export interface DefaultBrainSkill {
  /** Id estable de la skill. */
  id: string;
  /** Nombre legible. */
  name: string;
  /** Emoji/símbolo para la UI. */
  emoji: string;
  /** Descripción corta. */
  blurb: string;
  /** ¿Activada por defecto al crear un cerebro? */
  defaultEnabled: boolean;
}

/**
 * Lista de skills incluidas por defecto en CADA cerebro nuevo. La skill de
 * auto-actualización es la primera y va activada por defecto.
 */
export const DEFAULT_BRAIN_SKILLS: DefaultBrainSkill[] = [
  {
    id: AUTO_UPDATE_SKILL_ID,
    name: AUTO_UPDATE_SKILL_META.name,
    emoji: AUTO_UPDATE_SKILL_META.emoji,
    blurb: AUTO_UPDATE_SKILL_META.blurb,
    defaultEnabled: AUTO_UPDATE_SKILL_META.defaultEnabled,
  },
];

/** Sólo los ids de las skills por defecto (útil para inicializar cerebros). */
export const DEFAULT_BRAIN_SKILL_IDS: string[] = DEFAULT_BRAIN_SKILLS.map((s) => s.id);

/**
 * Devuelve la lista de ids de skills que un cerebro nuevo debería incluir,
 * combinando los `existing` que ya traiga con los defaults (sin duplicar).
 * Helper aditivo: el creador de cerebros puede llamarlo para "sembrar" las
 * skills por defecto sin perder lo que el usuario ya tuviera.
 */
export function withDefaultBrainSkills(existing: string[] = []): string[] {
  const set = new Set<string>(Array.isArray(existing) ? existing.filter((x) => typeof x === "string") : []);
  for (const id of DEFAULT_BRAIN_SKILL_IDS) set.add(id);
  return Array.from(set);
}

/** ¿Está incluida la skill por defecto `id` en la lista dada? */
export function isDefaultBrainSkill(id: string): boolean {
  return DEFAULT_BRAIN_SKILL_IDS.includes(id);
}
