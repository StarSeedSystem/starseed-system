/**
 * StarSeed OS — RECOMENDADOR DE INTEGRACIONES (Adenda 110).
 * ============================================================================
 * Elige la MEJOR opción disponible por servicio del OS a partir del registro
 * curado, según preferencias (soberanía de licencia · local vs servidor). Por
 * defecto respeta el `top` de cada categoría, pero puede reordenar si se pide
 * priorizar licencias permisivas o ejecución local. Lógica pura. Nunca lanza.
 */

import {
  INTEGRATIONS,
  CATEGORIES,
  integrationsByCategory,
  topFor,
  isDirectlyIntegrable,
  categoriesForSystem,
  type Integration,
  type IntegrationCategoryMeta,
  type OsSystem,
} from "./integration-registry";

export interface IntegrationPrefs {
  /** Priorizar licencias directamente integrables (evita AGPL/no-comercial en el pick). */
  preferPermissive?: boolean;
  /** Priorizar ejecución local/en dispositivo sobre servicios de API. */
  preferLocal?: boolean;
}

export interface CategoryPick {
  category: IntegrationCategoryMeta;
  pick: Integration;
  alternatives: Integration[];
  note?: string;
}

const MATURITY_SCORE: Record<Integration["maturity"], number> = { large: 2, active: 1, niche: 0 };

function score(i: Integration, prefs: IntegrationPrefs): number {
  let s = 0;
  if (i.top) s += 3;
  if (i.usedInStarSeed) s += 1;
  s += MATURITY_SCORE[i.maturity];
  if (prefs.preferPermissive) {
    if (isDirectlyIntegrable(i)) s += 2;
    else if (i.licenseClass === "non-commercial") s -= 3;
    else if (i.licenseClass === "network-copyleft") s -= 1; // usable como servicio aparte
  }
  if (prefs.preferLocal) {
    if (i.access === "local" || i.access === "browser") s += 2;
    else if (i.access === "self-host" || i.access === "library") s += 1;
    else if (i.access === "free-api") s -= 1;
  }
  return s;
}

/** Elige la mejor opción de una categoría dada las preferencias. */
export function pickForCategory(categoryId: string, prefs: IntegrationPrefs = {}): CategoryPick | undefined {
  const category = CATEGORIES.find((c) => c.id === categoryId);
  if (!category) return undefined;
  const list = integrationsByCategory(categoryId);
  if (!list.length) return undefined;
  const ranked = [...list].sort((a, b) => score(b, prefs) - score(a, prefs));
  const pick = ranked[0];
  const defaultTop = topFor(categoryId);
  let note: string | undefined;
  if (defaultTop && pick.id !== defaultTop.id) {
    if (prefs.preferPermissive && !isDirectlyIntegrable(defaultTop)) {
      note = `Recomendación por defecto: ${defaultTop.name} (${defaultTop.license}); se prefiere ${pick.name} por licencia integrable.`;
    } else if (prefs.preferLocal) {
      note = `Recomendación por defecto: ${defaultTop.name}; se prefiere ${pick.name} por ejecución local.`;
    } else {
      note = `Recomendación por defecto: ${defaultTop.name}.`;
    }
  }
  if (!note && pick.caveat) note = pick.caveat;
  return { category, pick, alternatives: ranked.slice(1), note };
}

/** Recomendaciones de todas las categorías de un sistema del OS. */
export function recommendBySystem(system: OsSystem, prefs: IntegrationPrefs = {}): CategoryPick[] {
  return categoriesForSystem(system)
    .map((c) => pickForCategory(c.id, prefs))
    .filter((p): p is CategoryPick => !!p);
}

/** Recomendaciones de TODAS las categorías del OS. */
export function recommendAll(prefs: IntegrationPrefs = {}): CategoryPick[] {
  return CATEGORIES.map((c) => pickForCategory(c.id, prefs)).filter((p): p is CategoryPick => !!p);
}

export interface RegistrySummary {
  total: number;
  categories: number;
  systems: number;
  permissiveShare: number; // 0..1 de opciones directamente integrables
  usedInStarSeed: number;
}

export function summarizeRegistry(): RegistrySummary {
  const total = INTEGRATIONS.length;
  const permissive = INTEGRATIONS.filter(isDirectlyIntegrable).length;
  return {
    total,
    categories: CATEGORIES.length,
    systems: new Set(CATEGORIES.map((c) => c.system)).size,
    permissiveShare: total ? permissive / total : 0,
    usedInStarSeed: INTEGRATIONS.filter((i) => i.usedInStarSeed).length,
  };
}
