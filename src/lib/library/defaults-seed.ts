"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — SIEMBRA DE DEFAULTS DE LA BIBLIOTECA (para TODOS, incl. cuentas
 * ya existentes)
 * ---------------------------------------------------------------------------
 * Objetivo (Comunismo de Abundancia · §3 CLAUDE.md): que cualquier persona —una
 * cuenta nueva o una que ya existía— tenga desde el primer arranque un conjunto
 * RECOMENDADO de paquetes/fuentes YA activos, sin tener que ir a la Biblioteca a
 * activarlos uno por uno. La inteligencia debe ser lo más gratuita posible desde
 * el minuto uno, y el OS debe verse "vivo" (materiales/animaciones) por defecto.
 *
 * HONESTIDAD RADICAL (misma regla que packages.ts):
 *   · Solo sembramos lo que tiene EFECTO SEGURO Y REAL sin descargar nada:
 *       - fuentes de IA gratis SIN descarga (Pollinations = instant, sin clave);
 *       - materiales/animaciones (solo activan clases CSS, cero red);
 *       - la skill real de Aurora (auto-actualización).
 *   · NUNCA sembramos modelos descargables (WebGPU: SmolLM3/SmolVLM2/WebLLM/Sipp/
 *     Chrome-AI): esos siguen siendo OPT-IN explícito (podrían bajar GBs). Ver
 *     DOWNLOADABLE_SOURCES en installed-models.ts.
 *   · NUNCA sembramos fuentes que requieren clave (Groq/Gemini/…): el usuario las
 *     conecta cuando quiera; aquí solo nos aseguramos de que NO estén deshabilitadas.
 *   · NUNCA sembramos superficies "abrir ruta" (app/page/board/…): instalar esas
 *     implica navegar; se dejan a decisión del usuario.
 *
 * NO DESTRUCTIVO / RESPETA AL USUARIO:
 *   · Idempotente: solo corre efectos si la versión sembrada < SEED_VERSION.
 *   · Solo AÑADE lo que falte; jamás elimina ni pisa una elección explícita.
 *     - Si el usuario YA instaló/desinstaló un paquete recomendado, se respeta
 *       su decisión (no lo re-instalamos ni lo quitamos).
 *     - Para no re-instalar algo que el usuario desinstaló a propósito, guardamos
 *       la lista de ids ya sembrados en cada SEED_VERSION (marca de "ya ofrecido");
 *       solo se auto-instala un id la PRIMERA vez que su versión lo introduce.
 *   · disabledSources: solo lo tocamos para GARANTIZAR que las fuentes gratis
 *     recomendadas no queden deshabilitadas; no deshabilita nada nunca.
 *
 * SINCRONIZACIÓN CON LA CUENTA (¡esto cubre a las cuentas existentes!):
 *   Las claves que escribimos aquí —`starseed.library.installed.v1`,
 *   `starseed.library.design.v1` (vía registro de diseño) y
 *   `starseed.library.functions.v1`— y la marca de estado
 *   `starseed.library.seed.v1` están dentro de SYNCED_KEYS (settings-sync.ts).
 *   Por tanto, al sembrar en UN dispositivo y pulsar "sincronizar", la cuenta
 *   soberana (Supabase) queda con estos defaults, y CUALQUIER dispositivo de esa
 *   misma cuenta (incluidas cuentas viejas) los recibe al hacer pull. No hace
 *   falta tocar cada dispositivo a mano.
 *
 * El ORQUESTADOR llamará `ensureDefaultsSeeded()` desde el provider (una vez, en
 * cliente). SSR-safe, defensivo, nunca lanza.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  allPackages,
  getInstalledMap,
  install,
  isInstalled,
  LIBRARY_EVENT,
  type LibraryPackage,
} from "./packages";
import { DOWNLOADABLE_SOURCES } from "@/ai/astraura/installed-models";

/** Marca de estado de la siembra (viaja con la cuenta vía SYNCED_KEYS). */
export const SEED_KEY = "starseed.library.seed.v1";

/**
 * Versión de la siembra. SÚBELA cuando quieras introducir nuevos defaults para
 * TODAS las cuentas (incluidas las existentes): al arrancar, si la versión
 * sembrada del dispositivo/cuenta es menor, se aplicará el delta de novedades.
 */
export const SEED_VERSION = 4;

/* ─────────────────────── Conjunto RECOMENDADO ───────────────────────
 * Ids REALES definidos en packages.ts (repos builtin starseed-core/labs).
 * Se listan explícitos para que sea trivial auditar QUÉ se activa por defecto.
 * Efecto de instalar cada uno (recordatorio de packages.ts):
 *   · ai-*    → quita su fuente de `disabledSources` en Astraura (la activa).
 *   · design-*→ añade su clase de material al registro de diseño.
 *   · anim-*  → añade su clase de animación al registro de diseño.
 *   · fn-*    → registra su skill en el registro de funciones de Aurora.
 * TODOS los de abajo tienen efecto local y NO requieren descarga ni clave. */

/**
 * Paquetes recomendados que se auto-instalan por defecto. Excluye a propósito:
 * apps/pages/boards con `route` (implican navegar), modelos WebGPU descargables,
 * fuentes con clave, y cualquier `comingSoon`.
 */
export const RECOMMENDED_PACKAGE_IDS: string[] = [
  // ── Fuente de IA gratis SIN descarga ni clave: la red de seguridad para que
  //    TODO usuario tenga inteligencia desde el minuto uno (instant · sin clave).
  "ai-pollinations-text",
  // ── Materiales del OS: que se vea "vivo" y cristalino por defecto (solo CSS).
  "design-cristal-zenith",
  // ── Animaciones sutiles por defecto (solo CSS · 150-300 ms como el design system).
  "anim-flotacion-3d",
  "anim-micro-tilt",
  // ── La ÚNICA skill de Aurora con efecto real hoy: mantener cerebros al día.
  "fn-auto-update",
  // ── Herramientas IA & Agentes (SEED_VERSION 2): recomendados SIN descarga
  //    pesada ni servicios de pago. Efecto seguro y local:
  //    · free-llm-api-resources → guarda el enlace de la lista viva de APIs
  //      gratis que alimenta la auto-selección de Astraura (solo enlace).
  //    · OpenLLM → activa la fuente local «local-openllm» (opt-in de uso: solo
  //      la usará si el usuario tiene el servidor corriendo; no descarga nada).
  //    · taste-skill / Agent-Reach → registran skills reales de Aurora
  //      (calidad de UI en Horizon · sentidos web gratis). Solo registro.
  "iatool-free-llm-api-resources",
  "iatool-openllm",
  "iatool-taste-skill",
  "iatool-agent-reach",
  // ── (SEED_VERSION 3) Paridad de Capacidades con Nexus/Café: Aurora trae
  //    Taste · PM · Sentidos web · Investigación activas por defecto. Ambas son
  //    registro/enlace local (sin descarga pesada ni pago).
  //    · pm-skills    → registra la skill `aurora-pm` (capacidad "pm").
  //    · open-notebook→ activa la capacidad "research" (guarda su enlace/REST).
  "iatool-pm-skills",
  "iatool-open-notebook",
  // ── (SEED_VERSION 4) Agentes recomendados (P5): agentes Aurora+Astraura de
  //    fábrica listos para usar/atar a cerebros. Instalar = registrar su
  //    definición en el store de agentes (src/lib/agents/store.ts). Efecto
  //    100% local (sin descarga ni clave): son configuración (persona +
  //    capacidades que ya existen). Ids del repo builtin «starseed-agents».
  "agent-pkg-agent-aurora-guide",
  "agent-pkg-agent-logic-steward",
];

/**
 * Fuentes gratuitas del catálogo Astraura que garantizamos NO deshabilitadas.
 * Ids REALES de free-catalog.ts. Solo fuentes gratis-primero SIN descarga/clave
 * (pollinations = instant sin clave; ollama = local, "listo" solo si el equipo
 * lo tiene, pero nunca debe estar en `disabledSources` para que Aurora lo elija
 * si aparece). NO se tocan más allá de asegurarse de que están habilitadas.
 */
export const RECOMMENDED_FREE_SOURCES: string[] = [
  "pollinations-text", // instant · sin clave · siempre disponible
  "ollama-local",      // local · sin límites si el usuario tiene Ollama corriendo
  "local-openllm",     // local · API OpenAI (OpenLLM) si el usuario tiene el servidor corriendo
];

/* ─────────────────────── Estado de la siembra ─────────────────────── */

interface SeedState {
  /** Última versión de siembra aplicada en este dispositivo/cuenta. */
  version: number;
  /** Timestamp de la última aplicación. */
  at: number;
  /** Ids de paquete ya OFRECIDOS por la siembra (para no re-instalar lo que el
   *  usuario desinstaló a propósito). Acumulativo entre versiones. */
  seededIds?: string[];
}

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readSeedState(): SeedState {
  if (!isClient()) return { version: 0, at: 0, seededIds: [] };
  try {
    const raw = window.localStorage.getItem(SEED_KEY);
    const p = raw ? JSON.parse(raw) : null;
    if (!p || typeof p !== "object") return { version: 0, at: 0, seededIds: [] };
    return {
      version: typeof p.version === "number" ? p.version : 0,
      at: typeof p.at === "number" ? p.at : 0,
      seededIds: Array.isArray(p.seededIds) ? p.seededIds.filter((x: unknown): x is string => typeof x === "string") : [],
    };
  } catch {
    return { version: 0, at: 0, seededIds: [] };
  }
}

function writeSeedState(s: SeedState): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(SEED_KEY, JSON.stringify(s));
  } catch { /* cuota / modo privado: degradamos en silencio */ }
}

/** ¿Está esta versión ya sembrada en este dispositivo/cuenta? */
export function isSeeded(): boolean {
  return readSeedState().version >= SEED_VERSION;
}

/** Ids descartados de la siembra por ser descargables (defensa en profundidad). */
function isDownloadablePackage(pkg: LibraryPackage): boolean {
  const sourceId = typeof pkg.payload?.catalogSourceId === "string" ? pkg.payload.catalogSourceId : "";
  return !!sourceId && (DOWNLOADABLE_SOURCES as readonly string[]).includes(sourceId);
}

/* ─────────────────────── Siembra idempotente ─────────────────────── */

/**
 * Siembra los defaults recomendados de forma idempotente y NO destructiva.
 * — Solo hace algo si la versión sembrada < SEED_VERSION.
 * — Solo AÑADE lo que falte; nunca elimina ni pisa elecciones del usuario.
 * — Nunca instala modelos descargables ni fuentes con clave.
 * — Sube SEED_VERSION y emite `starseed:library` al terminar.
 *
 * El orquestador la invoca desde el provider (cliente). Segura de llamar
 * múltiples veces: los reintentos son no-ops una vez sembrada la versión.
 */
export async function ensureDefaultsSeeded(): Promise<{ seeded: boolean; installed: string[] }> {
  if (!isClient()) return { seeded: false, installed: [] };

  const state = readSeedState();
  if (state.version >= SEED_VERSION) return { seeded: false, installed: [] };

  const alreadyOffered = new Set(state.seededIds ?? []);
  const catalog = allPackages();
  const byId = new Map(catalog.map((p) => [p.id, p] as const));
  const installedNow = getInstalledMap();
  const justInstalled: string[] = [];

  // ── 1) Auto-instalar los paquetes recomendados que:
  //       · existan en el catálogo,
  //       · NO estén ya instalados (respeta lo que el usuario tenga),
  //       · NO se hayan ofrecido antes (respeta desinstalaciones deliberadas),
  //       · NO sean descargables ni comingSoon (defensa extra).
  for (const id of RECOMMENDED_PACKAGE_IDS) {
    if (alreadyOffered.has(id)) continue;      // ya se ofreció en una versión previa
    const pkg = byId.get(id);
    if (!pkg) continue;                         // el catálogo cambió: no rompemos
    if (pkg.comingSoon) continue;
    if (isDownloadablePackage(pkg)) continue;   // opt-in siempre
    if (id in installedNow || isInstalled(id)) continue; // ya instalado por el usuario

    try {
      const res = await install(pkg);           // aplica su efecto real y lo registra
      if (res.ok) justInstalled.push(id);
    } catch { /* defensivo: un paquete no debe frenar la siembra */ }
  }

  // ── 2) Garantizar que las fuentes gratis recomendadas NO estén deshabilitadas.
  //       Import dinámico defensivo del router (toca localStorage/providers).
  //       Solo QUITA de disabledSources; nunca deshabilita nada.
  try {
    const router = await import("@/ai/astraura/router");
    const prefs = router.getIntelligenceSettings();
    const disabled = Array.isArray(prefs.disabledSources) ? prefs.disabledSources : [];
    const nextDisabled = disabled.filter((sid) => !RECOMMENDED_FREE_SOURCES.includes(sid));
    if (nextDisabled.length !== disabled.length) {
      router.saveIntelligenceSettings({ disabledSources: nextDisabled });
    }
  } catch { /* la activación por defecto ya la cubre instalar ai-pollinations-text */ }

  // ── 3) Persistir el nuevo estado de siembra (marca de versión + ofrecidos).
  const seededIds = Array.from(new Set([...alreadyOffered, ...RECOMMENDED_PACKAGE_IDS]));
  writeSeedState({ version: SEED_VERSION, at: Date.now(), seededIds });

  // ── 4) Notificar a toda la Biblioteca (mismo evento que usa el resto del OS).
  try { window.dispatchEvent(new Event(LIBRARY_EVENT)); } catch { /* noop */ }

  return { seeded: true, installed: justInstalled };
}
