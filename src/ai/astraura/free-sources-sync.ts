"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA · DESCUBRIMIENTO DE FUENTES GRATIS (cheahjs/free-llm-api-resources)
 * ---------------------------------------------------------------------------
 * Amplía el descubrimiento comunitario de `free-llm-sync.ts` (que solo cuenta
 * proveedores de `open-free-llm-api/awesome-freellm-apis` para telemetría) con
 * una SEGUNDA lista, esta vez PARSEADA de verdad: `cheahjs/free-llm-api-resources`
 * — la lista canónica y más citada de proveedores de LLM con tier gratuito.
 *
 * INVESTIGACIÓN (2026-07-20, ver informe de la tarea):
 *   · Estructura real del repo: el README (`src/pull_available_models.py` lo
 *     regenera) NO tiene JSON/YAML publicado — es Markdown con dos secciones
 *     `## Free Providers` y `## Providers with trial credits`, cada proveedor
 *     como `### [Nombre](url)`, seguido de texto libre + `**Limits:**` /
 *     `**Credits:**` / `**Requirements:**` / `**Models:**` y una lista de
 *     modelos en viñetas `- modelo` (a veces una `<table>` HTML en su lugar).
 *     Vía más robusta y ligera: descargar el README RAW y parsear con regex de
 *     secciones (nada de HTML parser ni dependencias nuevas) — confirmado con
 *     el README real durante la investigación (usado como fixture del test).
 *   · El README declara EXPLÍCITAMENTE que excluye servicios ilegítimos, pero
 *     TODOS sus proveedores exigen registro/clave (es una lista de "dónde
 *     conseguir una clave gratis", no de APIs anónimas) → aquí SIEMPRE
 *     `requiresKey: true`. Ninguno de sus proveedores es candidato a
 *     `CatalogSource` sin clave (ese rol ya lo cubren OVHcloud/LLM7/Pollinations
 *     en `free-catalog.ts`, verificados aparte).
 *   · ~13 proveedores en "Free Providers" y ~13 en "Providers with trial
 *     credits" (el nº exacto fluctúa; el parser cuenta lo que haya). La mayoría
 *     de "Free Providers" YA está curada a mano en `FREE_CATALOG`
 *     (OpenRouter, Google AI Studio→gemini-free, NVIDIA NIM, Mistral, Hugging
 *     Face, Cerebras, Groq, Cohere, GitHub Models, Cloudflare Workers AI) —
 *     `matchExistingCatalogSource()` lo detecta por nombre para no duplicar.
 *     Los genuinamente NUEVOS (p.ej. Vercel AI Gateway, OpenCode Zen) son los
 *     que se registran como candidatos.
 *   · "Providers with trial credits" son CRÉDITOS DE PRUEBA que se agotan, NO
 *     un tier gratis permanente → nunca se registran como candidatos de
 *     Aurora (solo aparecen en `getFreeSourceSuggestions({includeTrialCredits:true})`
 *     para que la UI, si quiere, los liste aparte con esa etiqueta honesta).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * huggingbay.xyz — ¿aporta una TERCERA fuente de "APIs de LLM gratis"?  NO.
 * Investigado con WebFetch (2026-07-20): es una plataforma de METADATOS de
 * artefactos IA open-source ("publishes open AI catalog metadata, source
 * provenance, license records, neutral hosted-file inventory…") — un
 * CATÁLOGO/BUSCADOR de modelos (rankings, recomendador, kits de instalación
 * local), NO un proveedor de inferencia con endpoint `/chat/completions`. No
 * sirve chat, así que no encaja como `CatalogSource` (que exige un endpoint
 * OpenAI-compatible real) ni como "fuente gratis con clave para IA" de este
 * módulo. YA estaba integrado ANTES de esta tarea — con su propio cliente
 * tipado (`./huggingbay.ts`), proxy servidor (`src/app/api/huggingbay/`) y UI
 * (`components/library/huggingbay-browser.tsx`) — para su propósito real:
 * descubrimiento de modelos, no de "fuentes de API gratis". Por eso este
 * módulo NO lo toca ni lo duplica: forzarlo aquí sería deshonesto (mezclaría
 * "catálogo de metadatos" con "proveedor de inferencia gratis"). Lo que SÍ
 * reutilizamos de "Hugging Bay" es el REGISTRO de candidatos
 * (`registerHuggingBayCandidate` en `./installed-models.ts`), que — como ya
 * demuestra `voice-oss-panel.tsx` registrando Spaces de OpenVoice — es en
 * realidad una libreta genérica de "candidatos que Aurora debería considerar",
 * no algo exclusivo del sitio huggingbay.xyz. Se reutiliza aquí con ese mismo
 * espíritu para anotar los proveedores gratis recién descubiertos.
 *
 * REGLAS DURAS (iguales al resto de Astraura): nunca lanza; SSR-safe (sin red
 * en el servidor); caché en localStorage con TTL de 7 días; el catálogo
 * curado (`FREE_CATALOG`) es SIEMPRE la fuente de verdad para el router — este
 * módulo solo SUGIERE y anota candidatos, nunca activa nada solo.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { findSource, type CatalogSource } from "./free-catalog";

/* ───────────────────────────── Constantes ───────────────────────────── */

/** README RAW de la lista canónica (generado por src/pull_available_models.py). */
export const CHEAHJS_README_URL =
  "https://raw.githubusercontent.com/cheahjs/free-llm-api-resources/main/README.md";

const STORAGE_KEY = "starseed.astraura.freellm-sources.v1";
const FREE_SOURCES_EVENT = "starseed:freellm-sources";
const CACHE_SCHEMA_VERSION = 1;
/** TTL del caché: la lista cambia poco a poco, 7 días es razonable y ligero. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;
/** Máximo de candidatos nuevos que se registran en una sola pasada (anti-ruido). */
const MAX_CANDIDATES_PER_REFRESH = 12;

/* ───────────────────────────── Tipos ───────────────────────────── */

export type FreeLlmSection = "free" | "trial-credits";

/** Fila normalizada de un proveedor extraído del README (parser puro). */
export interface ParsedFreeLlmProvider {
  name: string;
  /** Slug estable kebab-case derivado del nombre (para ids `freellm-<slug>`). */
  slug: string;
  section: FreeLlmSection;
  /** URL del proveedor (de la cabecera `[Nombre](url)`) — sirve de "conseguir clave". */
  websiteUrl: string;
  /** Texto de límites (rate limits) tal como aparece, decodificado a texto plano. */
  limitsText: string;
  /** Texto de créditos de prueba (solo sección "trial-credits"). */
  creditsText: string;
  /** Requisitos/avisos (verificación de teléfono, opt-in de datos…), si constan. */
  requirementsText: string;
  /** Modelos listados (viñetas `- modelo` o filas de tabla), sin garantía de ser el id exacto de API. */
  models: string[];
}

/** Sugerencia lista para que una UI de Ajustes → Inteligencia la muestre. */
export interface FreeSourceSuggestion {
  /** Id estable: `freellm-<slug>`. */
  id: string;
  name: string;
  section: FreeLlmSection;
  /** Enlace para conseguir la clave gratuita (o probar el tier). */
  getKeyUrl: string;
  /** Resumen de límites (o créditos, si es "trial-credits") en texto legible. */
  limits: string;
  /** De dónde sale `limits`: límite de tasa real, crédito de prueba, o no consta. */
  limitsKind: "rate-limit" | "trial-credit" | "unknown";
  /**
   * SIEMPRE true: esta lista, por diseño (cheahjs excluye servicios que fingen
   * no requerir cuenta), solo contiene proveedores con registro/clave. Nunca
   * se activan solos — el diseño `requiresKey`/`getKeyUrl` del catálogo decide.
   */
  requiresKey: true;
  /** ¿Ya está curado a mano en FREE_CATALOG? (evita sugerir duplicados). */
  alreadyInCatalog: boolean;
  /** Id en FREE_CATALOG si `alreadyInCatalog` es true. */
  catalogSourceId?: string;
  /** baseUrl YA VERIFICADO del catálogo curado, si hay match (nunca inventado). */
  baseUrl?: string;
  modelCount: number;
  sampleModels: string[];
  /** Procedencia, para transparencia total en la UI. */
  sourceListUrl: string;
}

interface FreeSourcesCache {
  v: number;
  fetchedAt: number;
  providers: ParsedFreeLlmProvider[];
}

/* ───────────────────────────── Utilidades SSR-safe ───────────────────────────── */

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readCache(): FreeSourcesCache | null {
  if (!isClient()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<FreeSourcesCache> | null;
    if (!p || p.v !== CACHE_SCHEMA_VERSION || !Array.isArray(p.providers) || typeof p.fetchedAt !== "number") {
      return null;
    }
    return { v: CACHE_SCHEMA_VERSION, fetchedAt: p.fetchedAt, providers: p.providers as ParsedFreeLlmProvider[] };
  } catch {
    return null;
  }
}

function writeCache(next: FreeSourcesCache): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(FREE_SOURCES_EVENT, { detail: next.providers.length }));
  } catch {
    /* cuota / modo privado: degradamos en silencio */
  }
}

/** Suscripción simple para una futura UI (Ajustes → Inteligencia). */
export function subscribeFreeSources(cb: () => void): () => void {
  if (!isClient()) return () => {};
  window.addEventListener(FREE_SOURCES_EVENT, cb);
  return () => window.removeEventListener(FREE_SOURCES_EVENT, cb);
}

/** Marca de tiempo (ms) del último refresco con éxito, o null. */
export function lastFreeSourcesFetchedAt(): number | null {
  return readCache()?.fetchedAt ?? null;
}

/* ───────────────────────────── Parser puro (testeado con fixtures) ───────────────────────────── */

/** Quita marcado (enlaces, `<br>`, negrita, tags sueltos) y deja texto plano legible. */
export function stripMd(text: string): string {
  if (!text) return "";
  let s = String(text);
  s = s.replace(/<br\s*\/?>/gi, " · ");
  s = s.replace(/\[([^\]]*)\]\(([^)]*)\)/g, "$1"); // [label](url) → label
  s = s.replace(/\*\*/g, "");
  s = s.replace(/<\/?[a-z][^>]*>/gi, ""); // tags sueltos (p.ej. </tbody></table> huérfano)
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** Slug kebab-case estable a partir de un nombre de proveedor. */
export function slugify(name: string): string {
  const base = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // acentos (marcas combinantes tras NFD), por si acaso
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "fuente";
}

/** Divide el markdown en secciones `## Título` → { heading, body }. */
function splitBySections(md: string): { heading: string; body: string }[] {
  const re = /^##[ \t]+(?!#)(.+?)[ \t]*$/gm;
  const marks: { heading: string; index: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    marks.push({ heading: m[1].trim(), index: m.index, end: m.index + m[0].length });
  }
  const out: { heading: string; body: string }[] = [];
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].end;
    const stop = i + 1 < marks.length ? marks[i + 1].index : md.length;
    out.push({ heading: marks[i].heading, body: md.slice(start, stop) });
  }
  return out;
}

/** Divide el cuerpo de una sección en bloques `### Proveedor` → { heading, body }. */
function splitByProvider(body: string): { heading: string; body: string }[] {
  const re = /^###[ \t]+(?!#)(.+?)[ \t]*$/gm;
  const marks: { heading: string; index: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    marks.push({ heading: m[1].trim(), index: m.index, end: m.index + m[0].length });
  }
  const out: { heading: string; body: string }[] = [];
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].end;
    const stop = i + 1 < marks.length ? marks[i + 1].index : body.length;
    out.push({ heading: marks[i].heading, body: body.slice(start, stop) });
  }
  return out;
}

/** Extrae el valor tras un marcador `**Label:**` (misma línea o el siguiente párrafo, nunca una viñeta). */
function extractMarkerValue(body: string, label: string): string {
  const markerRe = new RegExp(`\\*\\*${label}(?:\\s*\\([^)]*\\))?:\\*\\*[ \\t]*([^\\n]*)\\n?`, "i");
  const m = markerRe.exec(body);
  if (!m) return "";
  const sameLine = (m[1] || "").trim();
  if (sameLine) return stripMd(sameLine);
  const after = body.slice(m.index + m[0].length);
  const nextLine = /^[ \t]*\n*[ \t]*([^\n]+)/.exec(after);
  if (nextLine) {
    const line = nextLine[1].trim();
    if (line && !/^[-*][ \t]/.test(line)) return stripMd(line);
  }
  return "";
}

function collectBullets(body: string, marker: "-" | "*"): string[] {
  const withoutTables = body.replace(/<table[\s\S]*?<\/table>/gi, "");
  const escaped = marker === "-" ? "-" : "\\*";
  const re = new RegExp(`^${escaped}[ \\t]+(.+)$`, "gm");
  const items: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(withoutTables))) {
    const label = stripMd(m[1]).trim();
    if (label) items.push(label);
  }
  return items;
}

/** Filas `<tr><td>modelo</td><td>límites</td></tr>` de una tabla HTML (si la hay). */
function parseTableRows(body: string): { model: string; limits: string }[] {
  const tableMatch = /<table[\s\S]*?<\/table>/i.exec(body);
  if (!tableMatch) return [];
  const rows: { model: string; limits: string }[] = [];
  const rowRe = /<tr>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(tableMatch[0]))) {
    const model = stripMd(m[1]);
    const limits = stripMd(m[2]);
    if (model) rows.push({ model, limits });
  }
  return rows;
}

/** Parsea un bloque `### [Nombre](url)` + cuerpo en un `ParsedFreeLlmProvider`. */
function parseProviderBlock(headingRaw: string, body: string, section: FreeLlmSection): ParsedFreeLlmProvider {
  const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)/.exec(headingRaw.trim());
  const name = (linkMatch ? linkMatch[1] : headingRaw).trim();
  const websiteUrl = linkMatch ? linkMatch[2].trim() : "";

  const tableRows = parseTableRows(body);
  let limitsText = extractMarkerValue(body, "Limits");
  const creditsText = extractMarkerValue(body, "Credits");
  let requirementsText = extractMarkerValue(body, "Requirements");
  const modelsInline = extractMarkerValue(body, "Models");

  // Notas en viñetas "*" (avisos: verificación de teléfono, opt-in de datos…).
  const notes = collectBullets(body, "*");
  if (notes.length) {
    requirementsText = requirementsText ? `${requirementsText} · ${notes.join(" · ")}` : notes.join(" · ");
  }

  const modelSet = new Set<string>();
  if (modelsInline) modelSet.add(modelsInline);
  for (const b of collectBullets(body, "-")) modelSet.add(b);
  for (const r of tableRows) if (r.model) modelSet.add(r.model);

  if (!limitsText && tableRows.length) {
    const withLimit = tableRows.find((r) => r.limits);
    limitsText = withLimit
      ? `Límites por modelo (tabla, ${tableRows.length} modelos) · ej. ${withLimit.model}: ${withLimit.limits}`
      : `Límites por modelo (ver tabla, ${tableRows.length} modelos)`;
  }

  return {
    name,
    slug: slugify(name),
    section,
    websiteUrl,
    limitsText,
    creditsText,
    requirementsText,
    models: Array.from(modelSet).slice(0, 60),
  };
}

/**
 * Parser puro y defensivo del README de `cheahjs/free-llm-api-resources`.
 * Nunca lanza: entradas inesperadas simplemente no producen filas. Ignora
 * cualquier sección `##` que no sea "Free Providers" ni "Providers with trial
 * credits" (robusto ante cambios de formato futuros).
 */
export function parseCheahjsReadme(markdown: string): ParsedFreeLlmProvider[] {
  if (!markdown || typeof markdown !== "string") return [];
  try {
    const out: ParsedFreeLlmProvider[] = [];
    for (const sec of splitBySections(markdown)) {
      let section: FreeLlmSection | null = null;
      if (/free\s+provider/i.test(sec.heading)) section = "free";
      else if (/trial\s+credit/i.test(sec.heading)) section = "trial-credits";
      if (!section) continue;
      for (const prov of splitByProvider(sec.body)) {
        const parsed = parseProviderBlock(prov.heading, prov.body, section);
        if (parsed.name) out.push(parsed);
      }
    }
    return out;
  } catch {
    return [];
  }
}

/* ───────────────────────────── Cruce con el catálogo curado ───────────────────────────── */

/** Nombre del proveedor cheahjs (bare, minúsculas, sin paréntesis-como-caracteres) → id de FREE_CATALOG. */
const KNOWN_ALIASES: Record<string, string> = {
  openrouter: "openrouter-free",
  "google ai studio": "gemini-free",
  "nvidia nim": "nvidia-nim-free",
  "mistral la plateforme": "mistral-free",
  "mistral codestral": "mistral-free",
  "huggingface inference providers": "huggingface-router",
  cerebras: "cerebras-free",
  groq: "groq-free",
  cohere: "cohere-free",
  "github models": "github-models-free",
  "cloudflare workers ai": "cloudflare-workers-ai",
  "sambanova cloud": "sambanova-free",
  "scaleway generative apis": "scaleway-free",
};

function bareName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[()]/g, " ") // conserva el contenido entre paréntesis, solo quita los símbolos
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * ¿Este proveedor cheahjs ya está curado a mano en FREE_CATALOG? Solo usa un
 * alias EXPLÍCITO (nunca fuzzy-match): más vale un falso negativo (se sugiere
 * de más) que un falso positivo (se oculta una fuente real por error).
 */
export function matchExistingCatalogSource(providerName: string): CatalogSource | undefined {
  const id = KNOWN_ALIASES[bareName(providerName)];
  return id ? findSource(id) : undefined;
}

/** Convierte un proveedor parseado en la sugerencia lista para UI. */
export function toSuggestion(p: ParsedFreeLlmProvider): FreeSourceSuggestion {
  const match = matchExistingCatalogSource(p.name);
  const isTrial = p.section === "trial-credits";
  const limitsOrCredits = isTrial ? p.creditsText || p.limitsText : p.limitsText || p.creditsText;
  const limitsKind: FreeSourceSuggestion["limitsKind"] = isTrial && (p.creditsText || !p.limitsText)
    ? "trial-credit"
    : p.limitsText
      ? "rate-limit"
      : "unknown";

  return {
    id: `freellm-${p.slug}`,
    name: p.name,
    section: p.section,
    getKeyUrl: p.websiteUrl,
    limits: limitsOrCredits || "Límites no especificados en la fuente.",
    limitsKind,
    requiresKey: true,
    alreadyInCatalog: !!match,
    catalogSourceId: match?.id,
    baseUrl: match?.baseUrl,
    modelCount: p.models.length,
    sampleModels: p.models.slice(0, 5),
    sourceListUrl: CHEAHJS_README_URL,
  };
}

/* ───────────────────────────── Refresco (red best-effort) ───────────────────────────── */

/**
 * Descarga (con caché de 7 días) y parsea la lista `cheahjs/free-llm-api-resources`,
 * y registra los MEJORES candidatos nuevos como `HuggingBayCandidate`
 * (`registerHuggingBayCandidate`, idempotente por id `freellm-<slug>`).
 * "Mejores" = proveedores de la sección "Free Providers" (tier gratis REAL, no
 * créditos de prueba) que AÚN NO estén curados en FREE_CATALOG — evita
 * duplicar candidatos con fuentes que Aurora ya usa de verdad.
 * SSR-safe y defensivo: nunca lanza; sin red en el servidor; si algo falla,
 * degrada a la caché existente o a un resultado vacío.
 */
export async function refreshFreeSourcesFromLists(
  opts: { force?: boolean } = {},
): Promise<{ providers: number; registered: number; from: "network" | "cache" | "static" }> {
  if (!isClient()) return { providers: 0, registered: 0, from: "static" };
  try {
    const cached = readCache();
    if (cached && !opts.force && Date.now() - cached.fetchedAt < TTL_MS) {
      return { providers: cached.providers.length, registered: 0, from: "cache" };
    }

    let markdown = "";
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(CHEAHJS_README_URL, { signal: ctrl.signal, cache: "no-store" });
        if (res.ok) markdown = await res.text();
      } finally {
        clearTimeout(t);
      }
    } catch {
      markdown = "";
    }

    if (!markdown) {
      if (cached) return { providers: cached.providers.length, registered: 0, from: "cache" };
      return { providers: 0, registered: 0, from: "static" };
    }

    const providers = parseCheahjsReadme(markdown);
    if (!providers.length) {
      if (cached) return { providers: cached.providers.length, registered: 0, from: "cache" };
      return { providers: 0, registered: 0, from: "static" };
    }

    writeCache({ v: CACHE_SCHEMA_VERSION, fetchedAt: Date.now(), providers });

    let registered = 0;
    try {
      const { registerHuggingBayCandidate } = await import("./installed-models");
      const newFree = providers
        .filter((p) => p.section === "free" && !matchExistingCatalogSource(p.name))
        .slice(0, MAX_CANDIDATES_PER_REFRESH);
      for (const p of newFree) {
        registerHuggingBayCandidate({
          id: `freellm-${p.slug}`,
          name: `${p.name} (API gratis, requiere clave)`,
          repo: p.slug,
          tool: "api-key",
          command: p.websiteUrl || CHEAHJS_README_URL,
        });
        registered++;
      }
    } catch {
      /* noop: el descubrimiento no debe romper si installed-models no está disponible */
    }

    return { providers: providers.length, registered, from: "network" };
  } catch {
    return { providers: 0, registered: 0, from: "static" };
  }
}

/**
 * Sugerencias de "fuentes gratis disponibles con enlace para clave" para que
 * Ajustes → Inteligencia las liste (solo datos; no activa nada). Lee del
 * caché — sin red aquí. Por defecto solo la sección "Free Providers" (tier
 * gratis REAL); pasa `includeTrialCredits: true` para incluir también los
 * proveedores de créditos de prueba (marcados con `limitsKind: "trial-credit"`).
 */
export function getFreeSourceSuggestions(
  opts: { includeTrialCredits?: boolean } = {},
): FreeSourceSuggestion[] {
  const cached = readCache();
  if (!cached || !cached.providers.length) return [];
  const includeTrialCredits = !!opts.includeTrialCredits;
  return cached.providers
    .filter((p) => includeTrialCredits || p.section === "free")
    .map(toSuggestion)
    .sort((a, b) => {
      if (a.alreadyInCatalog !== b.alreadyInCatalog) return a.alreadyInCatalog ? 1 : -1;
      return b.modelCount - a.modelCount;
    });
}
