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
export const SEED_VERSION = 15;

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
  // ── (SEED_VERSION 5) Acceso a internet (web) gratis/local: Crawl4AI, scraper
  //    Python LOCAL/OSS para agentes. Registra la skill `aurora-web-access`
  //    (capacidad "web-access") — solo registro/enlace, sin descarga pesada ni
  //    clave. Aurora auto-selecciona la mejor herramienta web gratis por tarea;
  //    hasta que el usuario configure un endpoint, pedirá la URL/el contenido.
  "iatool-crawl4ai",
  // ── (SEED_VERSION 6) THE HUGGING BAY: descubrimiento inteligente de modelos
  //    reales (licencia + confianza + comando de instalación local). Registra
  //    la skill `model-discovery` (capacidad "model-discovery") — efecto 100%
  //    local (guarda el enlace + activa la skill), CERO descarga automática:
  //    el descubrimiento vive en Biblioteca → Hugging Bay y solo actúa cuando
  //    el usuario copia un comando o pulsa "Usar en Astraura" a propósito.
  "iatool-hugging-bay-registry",
  // ── (SEED_VERSION 7) Stack OSS "reemplaza tu stack de $200/mes" — los 10
  //    repos de architecture/astraura-inteligencia.md §15. TODOS son paquetes
  //    `function` con `skillId`: instalar = solo registro de skill/capacidad +
  //    enlace de referencia guardado (cero descarga, cero clave, cero servicio
  //    lanzado por el OS). Cada uno activa su capacidad viva en skills.ts para
  //    que Aurora la use en todos los contextos (chats/Biblioteca/agentes).
  "iatool-dyad",
  "iatool-goose",
  "iatool-deerflow",
  "iatool-daytona",
  "iatool-parallel-code",
  "iatool-scrapling",
  "iatool-9router",
  "iatool-website-cloner",
  "iatool-ragflow",
  "iatool-pipecat",
  // ── (SEED_VERSION 7) Barrido del resto del catálogo: paquetes gratis/OSS que
  //    ya existían pero se quedaron fuera de RECOMMENDED por versiones previas
  //    y cumplen el mismo criterio (efecto 100% local y seguro, sin clave ni
  //    servidor propio como precondición, no mutuamente excluyentes con lo ya
  //    recomendado). Ver architecture/astraura-inteligencia.md §15.6:
  //    · anim-respiracion-neon → animación CSS pura, aditiva (no excluyente
  //      como los temas de material, de los que solo uno entra por defecto).
  //    · iatool-deepcrawl / iatool-webharvest / iatool-universal-scraper →
  //      mismo patrón que iatool-crawl4ai (ya recomendado desde SEED_VERSION 5):
  //      registran la MISMA skill `aurora-web-access` (capacidad "web-access"),
  //      sumando motores a la auto-selección de Astraura sin coste ni riesgo.
  "anim-respiracion-neon",
  "iatool-deepcrawl",
  "iatool-webharvest",
  "iatool-universal-scraper",
  // ── (SEED_VERSION 8) Infraestructura soberana y flujos visuales — los 8
  //    repos de architecture/astraura-inteligencia.md §16. Mismo criterio que
  //    SEED_VERSION 7: TODOS son paquetes `function` con `skillId`: instalar =
  //    solo registro de skill/capacidad + enlace de referencia guardado (cero
  //    descarga, cero clave, cero servicio lanzado por el OS). Los servicios
  //    self-hosted que documentan (Coolify/Open WebUI/Stirling-PDF/Dify/
  //    Langflow) NO se auto-conectan a ningún endpoint: quedan como
  //    capacidad+patrón+enlace, con el endpoint configurable y apagado por
  //    defecto donde aplica (ver §16.7).
  "iatool-coolify",
  "iatool-openhands",
  "iatool-maxun",
  "iatool-open-webui",
  "iatool-browser-use",
  "iatool-langflow",
  "iatool-stirling-pdf",
  "iatool-dify",
  // ── (SEED_VERSION 9) Cámara + Galería — EXCEPCIÓN DELIBERADA a la regla de
  //    "apps/pages con route quedan fuera de RECOMMENDED" (§ arriba): estas dos
  //    NO son contenido de terceros que implique navegar a explorar algo nuevo,
  //    son módulos DE SISTEMA del propio OS (como Escritorio/Dashboard) — el
  //    equivalente a la cámara/fotos de un teléfono. `install()` para kind:"app"
  //    solo REGISTRA el paquete como instalado (registerInstalled); no navega
  //    por sí solo, así que sembrarlas aquí es seguro (cero navegación
  //    inesperada al iniciar sesión).
  "app-camara",
  "app-galeria",
  // ── (SEED_VERSION 10) Siete repos más — Marcadores, conocimiento, IoT y
  //    ciencia (architecture/astraura-inteligencia.md §19). Mismo criterio que
  //    §15-16: TODOS son paquetes `function` con `skillId`: instalar = solo
  //    registro de skill/capacidad + enlace de referencia (cero descarga, cero
  //    clave). Los dos conectores reales que suman (Audiobookshelf, Home
  //    Assistant) quedan APAGADOS por defecto (`enabled` ausente/false y sin
  //    endpoint): sembrar el paquete NUNCA activa el conector, solo dispone la
  //    capacidad/enlace; el usuario pega su propio endpoint cuando quiera.
  "iatool-karakeep",
  "iatool-anytype",
  "iatool-audiobookshelf",
  "iatool-home-assistant",
  "iatool-syncthing",
  "iatool-open-llm-vtuber",
  "iatool-altair",
  // ── (SEED_VERSION 11) tldraw — DISTINTO al resto de esta lista: no es un
  //    enlace externo, es una dependencia npm REAL ya instalada en el propio
  //    OS (`tldraw` en package.json) que añade el motor "tldraw (profesional)"
  //    como OPCIÓN dentro de /pizarra, junto al "Lienzo StarSeed" (intacto,
  //    sigue siendo el motor por defecto de cada pizarra). Instalar solo
  //    registra la skill «Pizarra profesional» (capacidad "whiteboard-pro"):
  //    efecto 100% local, sin descarga adicional ni clave — el motor YA
  //    funciona hoy en /pizarra tenga o no este paquete instalado.
  "iatool-tldraw",
  // ── (SEED_VERSION 12) Galería (Immich) + IA/Agentes — Perplexica/Vane,
  //    Flowise, AnythingLLM, Reor (architecture/astraura-inteligencia.md §21).
  //    Mismo criterio que §15-16/19: TODOS son paquetes `function` con
  //    `skillId`: instalar = solo registro de skill/capacidad + enlace de
  //    referencia (cero descarga, cero clave). Los tres conectores reales que
  //    suman (Immich, Perplexica, AnythingLLM) quedan APAGADOS por defecto
  //    (`enabled` ausente/false y sin endpoint): sembrar el paquete NUNCA
  //    activa el conector, solo dispone la capacidad/enlace; el usuario pega
  //    su propio endpoint (y clave, si aplica) cuando quiera. Flowise ya
  //    tenía conector real (ola previa); Reor queda sin conector a propósito
  //    (sin API pública hoy).
  "iatool-immich",
  "iatool-perplexica",
  "iatool-flowise",
  "iatool-anything-llm",
  "iatool-reor",
  // ── (SEED_VERSION 13 · Adenda 66) EL CATÁLOGO OSS COMPLETO por defecto en
  //    TODA cuenta/dispositivo/cerebro/neurona. El visionario pidió que NINGÚN
  //    repo recomendado quede fuera de la semilla. Todo lo de abajo es paquete
  //    gratis-primero cuyo install() SOLO registra skill/enlace o activa una
  //    fuente local (nunca descarga, nunca clave, nunca abre pestaña durante la
  //    siembra: ensureDefaultsSeeded ignora action/href). Los servidores/voces
  //    (CasaOS/Bark/GPT-SoVITS/OmniVoice) se conectan por endpoint más tarde —
  //    sembrarlos solo deja la capacidad y el enlace listos, sin lanzar nada.
  //    ÚNICA exclusión deliberada: `iatool-firecrawl` (free:false · requiere
  //    CLAVE de pago) — sembrarlo violaría el principio gratis-primero.
  //
  //    · Servidores caseros + voz neural (antes «disponibles», ahora por defecto):
  "iatool-casaos",
  "iatool-bark",
  "iatool-gpt-sovits",
  "iatool-omnivoice",
  //    · OmniRoute — fuente ai-source local (proxy multi-proveedor con failover).
  //      Activarla solo la saca de `disabledSources`; Aurora la usa si el proxy
  //      corre en el equipo. Su id de fuente NO es descargable (defensa: la
  //      guarda isDownloadablePackage), así que la siembra la aplica sin riesgo.
  "ai-omniroute-local",
  //    · Memoria agéntica · organizador · seguridad · mapas (nuevos en Adenda 66):
  "iatool-raven",
  "iatool-skales",
  "iatool-mouzi",
  "iatool-strix",
  "iatool-organicmaps",
  //    · Resto de referencias OSS del catálogo que quedaban fuera (repos/patrones
  //      de referencia; instalar guarda su enlace en la Biblioteca, sin ejecutar
  //      nada): enrutadores, agentes de código y aislamiento local.
  "iatool-routellm",
  "iatool-litellm",
  "iatool-agentos",
  "iatool-opencode",
  "iatool-openclaw",
  "iatool-apple-container",
  // ── (SEED_VERSION 14 · Adenda 67 · P2) LOS DOS MOTORES DE VOZ NUEVOS.
  //    · VoxCPM   → el motor de voz PRINCIPAL (el más realista que tenemos).
  //    · Voicebox → estudio de voz local con perfiles clonados.
  //    Mismo contrato honesto que el resto: instalar SOLO registra la skill
  //    `voice-engines` (Aurora sabe explicarlos y guiar su configuración) y
  //    guarda el enlace al repo. NO descarga modelos, NO lanza servidores y NO
  //    cambia la voz de nadie: hasta que el usuario pegue un endpoint, Aurora
  //    sigue hablando exactamente igual (voz del navegador). Cuando lo pegue,
  //    la selección automática los usará sola (engine-registry.ts).
  "iatool-voxcpm",
  "iatool-voicebox",
  // ── (SEED_VERSION 15 · Adenda 67 · P4) LOS NUEVE REPOS DE CAPACIDADES.
  //    Mismo contrato honesto de siempre: instalar SOLO registra la skill
  //    (capacidad viva en skills.ts) + guarda el enlace del repo. Cero descarga,
  //    cero clave, cero servidor lanzado por el OS, cero pestaña abierta durante
  //    la siembra (ensureDefaultsSeeded ignora action/href).
  //
  //    Qué cambia DE VERDAD al sembrarlos (y qué NO):
  //    · iatool-llm-council → la ÚNICA que ya funciona sola: el Consejo de Aurora
  //      corre con el router gratis-primero (sin servidor ni clave). Sembrarla
  //      hace que Aurora sepa convocarlo desde cualquier chat.
  //    · typesense · tencentdb-memory · databasement · postiz · openmanus →
  //      CONECTORES: sembrarlos deja la capacidad y el enlace listos, pero NO
  //      configuran ningún endpoint ni activan ningún conector. Sin URL pegada a
  //      mano por el usuario, no se llama a nada. En particular POSTIZ queda
  //      inerte: sin clave no aparece el panel de crosspost y NADA sale a redes.
  //    · penpot · opencut · mempalace → sin API usable: la capacidad solo hace que
  //      Aurora sepa guiarte y enlazarte (y habilita los bloques de publicación
  //      «Diseño Penpot» y «Vídeo», que sí son reales y locales).
  "iatool-llm-council",
  "iatool-typesense",
  "iatool-tencentdb-memory",
  "iatool-mempalace",
  "iatool-databasement",
  "iatool-postiz",
  "iatool-openmanus",
  "iatool-penpot",
  "iatool-opencut",
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
