// ════════════════════════════════════════════════════════════════
// Integraciones · Adaptador de Aurora — tools que Aurora puede invocar
// ----------------------------------------------------------------
// Expone el subconjunto de integraciones como "tools" con nombre amable,
// para que Aurora (y los cerebros) las llamen por nombre. Cada tool mapea
// a (integrationId, actionId). `runAuroraTool(name, input)` resuelve el
// nombre, comprueba que esté configurada y la ejecuta vía runIntegration.
//
// El motor de Aurora (engine.ts/actions.ts) puede inyectar la sección de
// prompt `auroraToolsPromptSection()` para que el modelo sepa qué tools
// existen, y despachar con `runAuroraTool`. Todo defensivo: nada lanza.
//
// ADITIVO: además de las integraciones, aquí se registran las tools LOCALES
// (kind:"screen" ⇒ se ejecutan en el navegador, sin configuración ni endpoint):
//   • CONTROL DE PANTALLA (src/lib/aurora/screen-control/*) — la pantalla como
//     agente interactivo: ver_pantalla, pulsar_elemento, escribir_en,
//     resaltar_elemento, leer_pantalla, rellenar_formulario, seleccionar_opcion,
//     copiar_texto, ir_a_seccion, abrir_app, desplazar_pantalla, atras,
//     adelante, pantalla_completa.
//   • TAREAS EN SEGUNDO PLANO (src/lib/aurora/background/task-manager) — que
//     Aurora mantiene «en proceso» mientras sigue la voz: crear_tarea_fondo,
//     ver_tareas, completar_tarea.
//   • PERSONALIDAD (kind:"personality", src/lib/aurora/personalities) — cambiar
//     personalidad activa, ajustar rasgos por voz y describir la actual:
//     cambiar_personalidad, ajustar_rasgo_personalidad, describir_personalidad,
//     listar_personalidades. (Adenda 63 §11)
// Todas comparten el mismo contrato de despacho (getAuroraTool / runAuroraTool).
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "./types";
import { getIntegration, loadIntegrationConfig } from "./registry";
import { runIntegration } from "./run";
import { resolveProvider, modeForCategory, type ProviderCategory } from "../../ai/astraura/provider-resolution";

export interface AuroraIntegrationTool {
  /** Nombre que el modelo usa para invocar (snake_case, estable). */
  name: string;
  /** Descripción en español de qué hace y qué espera. */
  description: string;
  /** Integración destino. */
  integrationId: string;
  /** Acción destino dentro de la integración. */
  actionId: string;
  /**
   * Categoría del motor de resolución por función (`ai/astraura/provider-resolution.ts`),
   * SOLO para las tools que hoy usan un conector fijo pero representan una
   * función con default gratis/OSS + cuenta de marca opcional (búsqueda,
   * scrape…). Aditivo: sin `category`, la tool se comporta EXACTAMENTE igual
   * que antes de esta capa.
   */
  category?: ProviderCategory;
  /**
   * Si esta tool ES el servicio de MARCA (cuenta propia) de su `category`
   * (p.ej. `scrape_url` = Firecrawl para "web-fetch"), su id en el catálogo
   * de `CATEGORY_PROVIDERS[category].ownServices`. Ausente = esta tool es el
   * default gratis/OSS de su categoría.
   */
  ownServiceId?: string;
}

/** Subconjunto de tools que Aurora puede invocar. */
export const AURORA_INTEGRATION_TOOLS: AuroraIntegrationTool[] = [
  {
    name: "crawl_url",
    description: "Rastrea una URL y devuelve su contenido en Markdown (Crawl4AI). Entrada: { url } o { urls: [...] }.",
    integrationId: "crawl4ai",
    actionId: "crawl",
    category: "web-fetch", // default gratis/OSS de la función "rastrear/leer una web"
  },
  {
    name: "scrape_url",
    description: "Extrae una página web como Markdown vía Firecrawl. Entrada: { url }.",
    integrationId: "firecrawl",
    actionId: "scrape",
    category: "web-fetch",
    ownServiceId: "firecrawl", // esta tool ES la cuenta de marca de "web-fetch"
  },
  {
    name: "web_search",
    description: "Busca en la web con un metabuscador privado (SearXNG). Entrada: { q } o texto.",
    integrationId: "searxng",
    actionId: "search",
    category: "web-search", // default gratis/OSS (SearXNG propio; si no, buscar_web/DuckDuckGo)
  },
  // ── Agent-Reach — sentidos web GRATIS multi-backend (X/Reddit/YouTube/GitHub/RSS/web) ──
  {
    name: "agent_reach_web_search",
    description: "Busca en la web multi-backend gratis (Google/DuckDuckGo/Brave/Reddit/YouTube/Bilibili/XHS/GitHub/RSS). Entrada: { q } o { query }.",
    integrationId: "agent-reach",
    actionId: "web-search",
    category: "web-search", // default gratis/OSS (agent-reach CLI local + proxy)
  },
  {
    name: "agent_reach_read_web",
    description: "Lee una página web / X (Twitter) / Reddit / GitHub / RSS / genérico y devuelve Markdown. Entrada: { url }.",
    integrationId: "agent-reach",
    actionId: "read-web",
    category: "web-fetch", // default gratis/OSS (agent-reach CLI local + proxy)
  },
  {
    name: "agent_reach_youtube_transcript",
    description: "Extrae la transcripción de un vídeo de YouTube. Entrada: { url }.",
    integrationId: "agent-reach",
    actionId: "youtube-transcript",
    category: "web-fetch",
  },
  {
    name: "agent_reach_github_read",
    description: "Lee un archivo o repo de GitHub. Entrada: { url }.",
    integrationId: "agent-reach",
    actionId: "github-read",
    category: "web-fetch",
  },
  {
    name: "agent_reach_reddit_search",
    description: "Busca y lee posts/comentarios de Reddit. Entrada: { url } (o { q } para búsqueda).",
    integrationId: "agent-reach",
    actionId: "reddit-search",
    category: "web-search",
  },
  // ── OpenViking — memoria/contexto agente (L0/L1/L2, búsqueda semántica, extracción auto) ──
  {
    name: "viking_recall",
    description: "Recupera contexto relevante para query (inyectable en prompt Aurora/exocortex). Entrada: { query, scope?, limit? }.",
    integrationId: "openviking",
    actionId: "recall",
    category: "memory",
  },
  {
    name: "viking_search",
    description: "Búsqueda semántica context-aware en base viking:// (inyectable en prompt). Entrada: { query, limit?, uriScope?, mode? }.",
    integrationId: "openviking",
    actionId: "search",
    category: "memory",
  },
  {
    name: "viking_find",
    description: "Búsqueda semántica simple en base viking://. Entrada: { query, limit? }.",
    integrationId: "openviking",
    actionId: "find",
    category: "memory",
  },
  {
    name: "viking_read",
    description: "Lee contenido completo L2 de recurso viking://. Entrada: { uri }.",
    integrationId: "openviking",
    actionId: "read",
    category: "memory",
  },
  {
    name: "viking_abstract",
    description: "Lee abstracto L0 de recurso viking://. Entrada: { uri }.",
    integrationId: "openviking",
    actionId: "abstract",
    category: "memory",
  },
  {
    name: "viking_overview",
    description: "Lee overview L1 de recurso viking://. Entrada: { uri }.",
    integrationId: "openviking",
    actionId: "overview",
    category: "memory",
  },
  {
    name: "viking_ls",
    description: "Lista directorio viking:// (ej: viking://resources/, viking://user/memories/). Entrada: { uri? }.",
    integrationId: "openviking",
    actionId: "ls",
    category: "memory",
  },
  {
    name: "viking_ingest",
    description: "Ingiere URL externa al contexto del agente (viking://resources/) con tags. Entrada: { url, tags? }.",
    integrationId: "openviking",
    actionId: "ingest",
    category: "memory",
  },
  {
    name: "viking_persist_memory",
    description: "Persiste memoria de sesión actual al exocortex (commit + extracción 6 categorías). Entrada: { sessionId }.",
    integrationId: "openviking",
    actionId: "persist_memory",
    category: "memory",
  },
  {
    name: "pdf_merge",
    description: "Fusiona varios PDFs en uno (Stirling-PDF). Entrada: { files: [File|URL|base64, ...] }.",
    integrationId: "stirling-pdf",
    actionId: "merge",
  },
  {
    name: "pdf_extract",
    description: "Extrae el texto de un PDF (Stirling-PDF). Entrada: { file } o { url }.",
    integrationId: "stirling-pdf",
    actionId: "extract-text",
  },
  {
    name: "pdf_to_image",
    description: "Convierte un PDF en imágenes (Stirling-PDF). Entrada: { file, imageFormat? }.",
    integrationId: "stirling-pdf",
    actionId: "to-image",
  },
  {
    name: "run_flow",
    description: "Ejecuta un flujo agéntico Dify (chat). Entrada: { query }. Requiere clave de app.",
    integrationId: "dify",
    actionId: "chat",
  },
  {
    name: "run_langflow",
    description: "Ejecuta un flujo de Langflow por flowId. Entrada: { input_value } (flowId en config).",
    integrationId: "langflow",
    actionId: "run-flow",
  },
  {
    name: "run_flowise",
    description: "Pregunta a un chatflow de Flowise. Entrada: { question } (chatflowId en config).",
    integrationId: "flowise",
    actionId: "predict",
  },
  {
    name: "run_automation",
    description: "Dispara una automatización n8n vía webhook. Entrada: objeto de payload.",
    integrationId: "n8n",
    actionId: "trigger",
  },
  {
    name: "browser_task",
    description: "Lanza una tarea web a un agente de navegador (Browser Use, experimental). Entrada: { task }.",
    integrationId: "browser-use",
    actionId: "browser-task",
  },
  {
    name: "code_task",
    description: "Envía una tarea de programación a OpenHands (experimental). Entrada: { task }.",
    integrationId: "openhands",
    actionId: "run-task",
  },
  {
    name: "local_chat",
    description: "Completa un chat con un modelo local (Ollama, formato OpenAI). Entrada: { prompt } o { messages }.",
    integrationId: "ollama",
    actionId: "chat",
  },
  {
    name: "audio_library_list",
    description: "Lista tus bibliotecas de audio (Audiobookshelf: audiolibros/podcasts). Sin entrada.",
    integrationId: "audiobookshelf",
    actionId: "libraries",
  },
  {
    name: "audio_library_items",
    description: "Lista los audiolibros/episodios de una biblioteca de Audiobookshelf. Entrada: { libraryId }.",
    integrationId: "audiobookshelf",
    actionId: "items",
  },
  {
    name: "home_states",
    description: "Consulta el estado de tus dispositivos/entidades de Home Assistant (solo lectura). Entrada opcional: { domain } (p.ej. \"light\").",
    integrationId: "home-assistant",
    actionId: "states",
  },
  {
    name: "home_entity_state",
    description: "Consulta el estado de UNA entidad de Home Assistant por su entity_id (solo lectura). Entrada: { entity_id }.",
    integrationId: "home-assistant",
    actionId: "state",
  },
  {
    name: "immich_albums",
    description: "Lista tus álbumes de Immich (nombre y nº de elementos, solo lectura). Sin entrada.",
    integrationId: "immich",
    actionId: "albums",
  },
  {
    name: "immich_recent_assets",
    description: "Lista tus fotos/vídeos más recientes de Immich (solo lectura). Entrada opcional: { take } (por defecto 20).",
    integrationId: "immich",
    actionId: "assets",
  },
  {
    name: "ai_search",
    description: "Busca con IA y fuentes citadas vía Perplexica/Vane. Entrada: { query }. Requiere que el usuario haya configurado extra.providerId/chatModel/embeddingModel de su instancia (usa la acción «providers» para descubrirlos).",
    integrationId: "perplexica",
    actionId: "search",
  },
  {
    name: "rag_ask",
    description: "Pregunta a un workspace de AnythingLLM (RAG sobre sus documentos propios). Entrada: { message } (workspace en extra.workspaceSlug).",
    integrationId: "anything-llm",
    actionId: "chat",
  },
];

// ════════════════════════════════════════════════════════════════════════════
// CONTROL DE PANTALLA — la pantalla como agente interactivo (ejecución local)
// ----------------------------------------------------------------------------
// Tools que NO llaman a ninguna integración: operan sobre el DOM visible
// (src/lib/aurora/screen-control/*). Comparten el contrato de las tools de
// integración (mismo despacho por nombre desde actions.ts), pero se ejecutan
// en local, siempre disponibles en el navegador y sin configuración. La carga
// del módulo DOM es perezosa (import dinámico) para no acoplar el bundle ni
// romper SSR. Todo defensivo: nada lanza.
// ════════════════════════════════════════════════════════════════════════════

/** Pseudo-integración de las tools de pantalla (no existe en el registro). */
export const SCREEN_TOOL_INTEGRATION_ID = "pantalla";

export interface AuroraScreenTool extends AuroraIntegrationTool {
  /** Marca de tool local de pantalla (ejecuta DOM, no integraciones). */
  kind: "screen";
  /** Ejecutor local (solo navegador). */
  run: (input: Record<string, unknown>) => Promise<IntegrationResult>;
}

/** Type guard: ¿es una tool de control de pantalla? */
export function isAuroraScreenTool(
  t: AuroraIntegrationTool | undefined | null,
): t is AuroraScreenTool {
  return !!t && (t as AuroraScreenTool).kind === "screen" && typeof (t as AuroraScreenTool).run === "function";
}

/** Tipado del módulo de acciones de pantalla (import dinámico). */
type ScreenActionsModule = typeof import("../../lib/aurora/screen-control/screen-actions");
type ScreenOutcome = { ok: boolean; message: string; data?: Record<string, unknown> };

/** Primer valor no vacío entre varias claves del input (defensivo). */
function pickInput(input: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = input[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

/**
 * Ejecuta una acción de pantalla con import perezoso del módulo DOM y
 * adapta su resultado al contrato IntegrationResult (data.text = frase
 * decible en español; error = mensaje amable). NUNCA lanza.
 */
async function runScreenControl(
  exec: (mod: ScreenActionsModule) => ScreenOutcome | Promise<ScreenOutcome>,
): Promise<IntegrationResult> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { ok: false, error: "El control de pantalla solo funciona en el navegador." };
  }
  try {
    const mod = await import("../../lib/aurora/screen-control/screen-actions");
    const res = await exec(mod);
    if (!res || typeof res.ok !== "boolean") {
      return { ok: false, error: "El control de pantalla no respondió." };
    }
    return res.ok
      ? { ok: true, data: { text: res.message, ...(res.data ?? {}) } }
      : { ok: false, error: res.message };
  } catch {
    return { ok: false, error: "No pude ejecutar el control de pantalla en esta página." };
  }
}

// ── TAREAS EN SEGUNDO PLANO (ejecución local, mismo contrato) ────────────────
// Estas tools NO tocan el DOM: gestionan el registro de tareas de fondo de
// Aurora (src/lib/aurora/background/task-manager) — crear/listar/completar. Son
// también LOCALES (kind:"screen" ⇒ ejecución sin integración/endpoint) y su
// resultado se adapta al mismo contrato IntegrationResult (data.text decible).

type TaskManagerModule = typeof import("../../lib/aurora/background/task-manager");

/**
 * Ejecuta una acción sobre el gestor de tareas de fondo con import perezoso y
 * la adapta a IntegrationResult (data.text = frase decible). NUNCA lanza.
 */
async function runBackgroundControl(
  exec: (mod: TaskManagerModule) => ScreenOutcome | Promise<ScreenOutcome>,
): Promise<IntegrationResult> {
  if (typeof window === "undefined") {
    return { ok: false, error: "Las tareas en segundo plano solo funcionan en el navegador." };
  }
  try {
    const mod = await import("../../lib/aurora/background/task-manager");
    const res = await exec(mod);
    if (!res || typeof res.ok !== "boolean") {
      return { ok: false, error: "El gestor de tareas no respondió." };
    }
    return res.ok
      ? { ok: true, data: { text: res.message, ...(res.data ?? {}) } }
      : { ok: false, error: res.message };
  } catch {
    return { ok: false, error: "No pude gestionar las tareas en segundo plano." };
  }
}

/** Localiza una tarea de fondo por id exacto o por título (fuzzy, sin acentos). */
function findBgTaskId(mod: TaskManagerModule, target: unknown): string | null {
  const raw = String(target ?? "").trim();
  if (!raw) return null;
  const list = mod.listTasks();
  const byId = list.find((t) => t.id === raw);
  if (byId) return byId.id;
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const n = norm(raw);
  const exact = list.find((t) => norm(t.title) === n);
  if (exact) return exact.id;
  const partial = list.find((t) => norm(t.title).includes(n) || n.includes(norm(t.title)));
  return partial ? partial.id : null;
}

/** Tools de PANTALLA que Aurora puede invocar (siempre disponibles en navegador). */
export const AURORA_SCREEN_TOOLS: AuroraScreenTool[] = [
  {
    name: "ver_pantalla",
    description:
      "Muestra números sobre los botones y enlaces visibles para pulsarlos por voz. Entrada: {}. Responde con la lista corta («1 Publicar · 2 Perfil…»); léesela al usuario tal cual.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "ver_pantalla",
    kind: "screen",
    run: () => runScreenControl((m) => m.verPantalla()),
  },
  {
    name: "pulsar_elemento",
    description:
      "Pulsa un botón, enlace o pestaña visible por su número o su nombre. Entrada: { numero } o { nombre }. Si dudas de qué hay en pantalla, usa antes ver_pantalla.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "pulsar_elemento",
    kind: "screen",
    run: (input) =>
      runScreenControl((m) =>
        m.clickElement(
          pickInput(input, "numero", "número", "n", "id", "indice", "índice", "elemento", "nombre", "name", "etiqueta", "boton", "botón"),
        ),
      ),
  },
  {
    name: "escribir_en",
    description:
      "Escribe texto en un campo visible (búsqueda, input, área de texto). Entrada: { numero|nombre, texto }.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "escribir_en",
    kind: "screen",
    run: (input) =>
      runScreenControl((m) =>
        m.typeInto(
          pickInput(input, "numero", "número", "n", "id", "elemento", "nombre", "name", "campo", "etiqueta"),
          pickInput(input, "texto", "text", "valor", "value", "contenido", "mensaje"),
        ),
      ),
  },
  {
    name: "desplazar_pantalla",
    description:
      "Desplaza la pantalla o el panel central. Entrada: { direccion: arriba|abajo|izquierda|derecha|inicio|final, cantidad?: poco|pagina|mucho|píxeles }.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "desplazar_pantalla",
    kind: "screen",
    run: (input) =>
      runScreenControl((m) =>
        m.scrollPage(
          pickInput(input, "direccion", "dirección", "dir", "hacia", "sentido"),
          pickInput(input, "cantidad", "amount", "cuanto", "cuánto", "pixeles", "píxeles"),
        ),
      ),
  },
  {
    name: "atras",
    description: "Vuelve a la página anterior del historial de navegación. Entrada: {}.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "atras",
    kind: "screen",
    run: () => runScreenControl((m) => m.goBack()),
  },
  {
    name: "adelante",
    description: "Avanza a la página siguiente del historial de navegación. Entrada: {}.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "adelante",
    kind: "screen",
    run: () => runScreenControl((m) => m.goForward()),
  },
  {
    name: "pantalla_completa",
    description: "Activa o desactiva el modo pantalla completa del OS. Entrada: {}.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "pantalla_completa",
    kind: "screen",
    run: () => runScreenControl((m) => m.toggleFullscreen()),
  },
  {
    name: "resaltar_elemento",
    description:
      "Señala (resalta) un botón, enlace o campo visible SIN pulsarlo, por su número o nombre. Entrada: { numero } o { nombre }. Úsalo para «¿dónde está…?» antes de decidir.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "resaltar_elemento",
    kind: "screen",
    run: (input) =>
      runScreenControl((m) =>
        m.highlightElement(
          pickInput(input, "numero", "número", "n", "id", "indice", "índice", "elemento", "nombre", "name", "etiqueta", "boton", "botón"),
        ),
      ),
  },
  {
    name: "leer_pantalla",
    description:
      "Describe en voz lo que hay en pantalla: título, textos principales visibles y un recuento de botones, enlaces y campos. Entrada: {}. Léele el resumen al usuario.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "leer_pantalla",
    kind: "screen",
    run: () => runScreenControl((m) => m.readScreen()),
  },
  {
    name: "rellenar_formulario",
    description:
      "Rellena varios campos de un formulario de una vez por su etiqueta. Entrada: { campos: [{ campo, valor }, ...] } (campo = etiqueta, placeholder, nombre o número). Responde con lo rellenado y lo no encontrado.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "rellenar_formulario",
    kind: "screen",
    run: (input) =>
      runScreenControl((m) => m.fillForm(pickInput(input, "campos", "fields", "campo", "valores", "datos") ?? input)),
  },
  {
    name: "seleccionar_opcion",
    description:
      "Elige una opción de un desplegable (select) visible. Entrada: { numero|nombre (el selector), opcion }. Casa la opción por su texto o valor.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "seleccionar_opcion",
    kind: "screen",
    run: (input) =>
      runScreenControl((m) =>
        m.selectOption(
          pickInput(input, "selector", "numero", "número", "n", "id", "elemento", "nombre", "name", "campo", "etiqueta"),
          pickInput(input, "opcion", "opción", "option", "valor", "value", "eleccion", "elección"),
        ),
      ),
  },
  {
    name: "ir_a_seccion",
    description:
      "Navega a una sección/área del OS por su nombre (memorias, decisiones, pizarras, red, cerebro…). Entrada: { nombre } o { seccion }. Cambia de página de verdad.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "ir_a_seccion",
    kind: "screen",
    run: (input) =>
      runScreenControl((m) =>
        m.goToSection(pickInput(input, "nombre", "seccion", "sección", "area", "área", "ruta", "destino", "name")),
      ),
  },
  {
    name: "abrir_app",
    description:
      "Abre una app del OS por su nombre. Entrada: { nombre } o { app }. Pide abrir la app y, si el nombre casa con una sección, navega a ella como respaldo.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "abrir_app",
    kind: "screen",
    run: (input) =>
      runScreenControl((m) => m.openApp(pickInput(input, "nombre", "app", "aplicacion", "aplicación", "name", "id"))),
  },
  {
    name: "copiar_texto",
    description:
      "Copia al portapapeles el texto (o el valor) de un elemento visible, por su número o nombre. Entrada: { numero } o { nombre }.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "copiar_texto",
    kind: "screen",
    run: (input) =>
      runScreenControl((m) =>
        m.copyElementText(
          pickInput(input, "numero", "número", "n", "id", "elemento", "nombre", "name", "etiqueta"),
        ),
      ),
  },
  {
    name: "crear_tarea_fondo",
    description:
      "Crea una tarea que queda EN PROCESO en segundo plano mientras sigues hablando. Entrada: { titulo }. Úsala al empezar algo largo para que el usuario vea el progreso.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "crear_tarea_fondo",
    kind: "screen",
    run: (input) =>
      runBackgroundControl((m) => {
        const titulo = String(pickInput(input, "titulo", "título", "title", "nombre", "name", "tarea") ?? "").trim();
        if (!titulo) return { ok: false, message: "¿Qué título le pongo a la tarea?" };
        const t = m.createTask(titulo, { status: "running" });
        return { ok: true, message: `Anoté la tarea «${t.title}» y sigo contigo.`, data: { id: t.id, titulo: t.title } };
      }),
  },
  {
    name: "ver_tareas",
    description:
      "Lista el estado de las tareas en segundo plano (en curso, en espera, terminadas, con error). Entrada: {}. Léele el resumen al usuario.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "ver_tareas",
    kind: "screen",
    run: () =>
      runBackgroundControl((m) => {
        const list = m.listTasks();
        return {
          ok: true,
          message: m.summarizeTasks(list),
          data: { total: list.length, tareas: list.map((t) => ({ id: t.id, titulo: t.title, estado: t.status, progreso: t.progress })) },
        };
      }),
  },
  {
    name: "completar_tarea",
    description:
      "Marca como terminada una tarea en segundo plano, por su id o su título. Entrada: { id } o { titulo }.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "completar_tarea",
    kind: "screen",
    run: (input) =>
      runBackgroundControl((m) => {
        const target = pickInput(input, "id", "titulo", "título", "title", "nombre", "name", "tarea");
        const id = findBgTaskId(m, target);
        if (!id) return { ok: false, message: "No encuentro esa tarea. Dime «ver tareas» para escucharlas." };
        const t = m.completeTask(id);
        return t
          ? { ok: true, message: `Marqué «${t.title}» como terminada.`, data: { id: t.id, titulo: t.title } }
          : { ok: false, message: "No pude marcar esa tarea como terminada." };
      }),
  },
];

// ════════════════════════════════════════════════════════════════════════════
// GENERAR Y USAR CONTENIDO — Aurora crea/coloca contenido libremente (local)
// ----------------------------------------------------------------------------
// Tools LOCALES (kind:"screen" ⇒ ejecución en navegador, sin config ni endpoint)
// que permiten a Aurora GENERAR contenido (notas, documentos, archivos) y USARLO
// en cualquier contexto del OS: guardarlo en la Biblioteca, publicarlo, ponerlo
// en una pizarra, añadir un widget, buscar en la web (navegador interno) o en la
// Biblioteca. Delegan en src/lib/aurora/generate/content-actions (import perezoso
// para no acoplar el bundle ni romper SSR). Cada acción devuelve
// { ok, message, data? } y aquí se adapta a IntegrationResult (data.text =
// message decible). NUNCA lanza; degrada con un mensaje hablado útil.
// ════════════════════════════════════════════════════════════════════════════

/** Tipado del módulo de generación de contenido (import dinámico). */
type ContentActionsModule = typeof import("../../lib/aurora/generate/content-actions");

/**
 * Ejecuta una acción de generación de contenido con import perezoso del módulo
 * y adapta su resultado (ContentOutcome) al contrato IntegrationResult
 * (data.text = frase decible). NUNCA lanza.
 */
async function runContentAction(
  exec: (mod: ContentActionsModule) => ScreenOutcome | Promise<ScreenOutcome>,
): Promise<IntegrationResult> {
  if (typeof window === "undefined") {
    return { ok: false, error: "Generar y usar contenido solo funciona en el navegador." };
  }
  try {
    const mod = await import("../../lib/aurora/generate/content-actions");
    const res = await exec(mod);
    if (!res || typeof res.ok !== "boolean") {
      return { ok: false, error: "La generación de contenido no respondió." };
    }
    return res.ok
      ? { ok: true, data: { text: res.message, ...(res.data ?? {}) } }
      : { ok: false, error: res.message };
  } catch {
    return { ok: false, error: "No pude generar o usar ese contenido en esta página." };
  }
}

// ── GENERAR CON SERVICIOS por función (red defensiva, mismo contrato) ────────
// A diferencia de las tools de content-actions (100% local), estas ENRUTAN la
// generación a los SERVICIOS open-source que el usuario configuró por función en
// /servicios (resolveServiceFor): imagen (Fooocus-API / AUTOMATIC1111), workflow
// (n8n), sitios web (servicio o plantilla local) y vídeo. Delegan en
// src/lib/aurora/generate/service-generation (import perezoso). Cada acción
// devuelve { ok, message, data? } y se adapta al mismo contrato IntegrationResult.
// NUNCA lanza; si no hay servicio, degrada con un mensaje honesto → /servicios.

/** Tipado del módulo de generación con servicios (import dinámico). */
type ServiceGenerationModule = typeof import("../../lib/aurora/generate/service-generation");

/**
 * Ejecuta una acción de generación-con-servicios con import perezoso del módulo
 * y adapta su resultado (ContentOutcome) al contrato IntegrationResult
 * (data.text = frase decible). NUNCA lanza.
 */
async function runServiceGeneration(
  exec: (mod: ServiceGenerationModule) => ScreenOutcome | Promise<ScreenOutcome>,
): Promise<IntegrationResult> {
  if (typeof window === "undefined") {
    return { ok: false, error: "Generar con servicios solo funciona en el navegador." };
  }
  try {
    const mod = await import("../../lib/aurora/generate/service-generation");
    const res = await exec(mod);
    if (!res || typeof res.ok !== "boolean") {
      return { ok: false, error: "La generación con servicios no respondió." };
    }
    return res.ok
      ? { ok: true, data: { text: res.message, ...(res.data ?? {}) } }
      : { ok: false, error: res.message };
  } catch {
    return { ok: false, error: "No pude generar con el servicio configurado en esta página." };
  }
}

/** Tools de GENERAR/USAR CONTENIDO que Aurora puede invocar (navegador). */
export const AURORA_GENERATE_TOOLS: AuroraScreenTool[] = [
  {
    name: "crear_nota",
    description:
      "Crea una nota breve en markdown y la guarda en la Biblioteca del usuario. Entrada: { titulo, texto }. Úsala cuando el usuario diga «anota…», «crea una nota…», «apunta esto…». Al terminar puedes ofrecer «abre la biblioteca».",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "crear_nota",
    kind: "screen",
    run: (input) =>
      runContentAction((m) =>
        m.crearNota(
          pickInput(input, "titulo", "título", "title", "nombre", "name", "asunto"),
          pickInput(input, "texto", "text", "contenido", "content", "cuerpo", "body", "nota"),
        ),
      ),
  },
  {
    name: "crear_documento",
    description:
      "Redacta un documento markdown (más extenso que una nota) y lo guarda en la Biblioteca. Entrada: { titulo, texto }. Úsala para «escribe un documento…», «redacta…», «prepara un texto largo…».",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "crear_documento",
    kind: "screen",
    run: (input) =>
      runContentAction((m) =>
        m.crearDocumento(
          pickInput(input, "titulo", "título", "title", "nombre", "name", "asunto"),
          pickInput(input, "texto", "text", "contenido", "content", "cuerpo", "body"),
        ),
      ),
  },
  {
    name: "crear_archivo",
    description:
      "Genera un archivo de cualquier formato (por su contenido de texto o una data URL) y lo guarda en la Biblioteca. Entrada: { nombre, contenido, tipo? } (tipo = mime como application/json o extensión como json, csv, svg, html…). Úsala para «crea un archivo…», «guárdame este JSON/CSV/SVG…».",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "crear_archivo",
    kind: "screen",
    run: (input) =>
      runContentAction((m) =>
        m.crearArchivo(
          pickInput(input, "nombre", "name", "titulo", "título", "archivo", "filename"),
          pickInput(input, "contenido", "content", "texto", "text", "datos", "data", "cuerpo"),
          pickInput(input, "tipo", "type", "mime", "formato", "extension", "extensión"),
        ),
      ),
  },
  {
    name: "crear_publicacion",
    description:
      "Abre el Composer de Publicar con el texto ya prellenado para publicar en la red. Entrada: { texto, area?, tipo? } (area: politica|educacion|cultura|general). Úsala cuando el usuario diga «publícalo», «compártelo en la red», «haz una publicación con esto…».",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "crear_publicacion",
    kind: "screen",
    run: (input) =>
      runContentAction((m) =>
        m.crearPublicacion(
          pickInput(input, "texto", "text", "contenido", "content", "mensaje", "cuerpo", "body"),
          pickInput(input, "area", "área", "seccion", "sección"),
          pickInput(input, "tipo", "type", "formato"),
        ),
      ),
  },
  {
    name: "abrir_pizarra",
    description:
      "Abre las pizarras (lienzos). Sin datos abre el hub de Pizarras; con { id } abre ese lienzo; con { titulo } abre el lienzo para una pizarra nueva. Entrada: { id?, titulo? }. Úsala para «abre una pizarra», «llévame a mis lienzos».",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "abrir_pizarra",
    kind: "screen",
    run: (input) =>
      runContentAction((m) =>
        m.abrirPizarra(
          pickInput(input, "id", "canvas", "pizarra", "lienzo"),
          pickInput(input, "titulo", "título", "title", "nombre", "name"),
        ),
      ),
  },
  {
    name: "crear_en_pizarra",
    description:
      "Coloca un bloque de texto en una pizarra/lienzo y la abre. Entrada: { texto, titulo? }. Úsala para «pon esto en la pizarra», «añade una tarjeta al lienzo con…».",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "crear_en_pizarra",
    kind: "screen",
    run: (input) =>
      runContentAction((m) =>
        m.crearEnPizarra(
          pickInput(input, "texto", "text", "contenido", "content", "cuerpo", "body", "nota"),
          pickInput(input, "titulo", "título", "title", "nombre", "name"),
        ),
      ),
  },
  {
    name: "crear_widget",
    description:
      "Añade un widget al tablero activo del usuario. Entrada: { tipo? } (nombre: clima, memorias, música, calculadora, mapa, mensajes, astraura… o un TIPO en mayúsculas del registro). Úsala para «pon el clima en mi tablero», «añade un widget de…».",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "crear_widget",
    kind: "screen",
    run: (input) =>
      runContentAction((m) => m.crearWidget(pickInput(input, "tipo", "type", "widget", "nombre", "name"))),
  },
  {
    name: "buscar_web",
    description:
      "Busca en la web (DuckDuckGo) dentro del Navegador interno del OS, sin salir de Aurora. Entrada: { consulta }. Úsala para «busca en internet…», «busca en la web…».",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "buscar_web",
    kind: "screen",
    run: (input) =>
      runContentAction((m) =>
        m.buscarWeb(pickInput(input, "consulta", "query", "q", "texto", "text", "busqueda", "búsqueda", "termino", "término")),
      ),
  },
  {
    name: "abrir_enlace",
    description:
      "Abre una URL en el Navegador interno del OS (o navega si es una ruta interna). Entrada: { url }. Úsala para «abre esta web…», «ve a este enlace…».",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "abrir_enlace",
    kind: "screen",
    run: (input) =>
      runContentAction((m) => m.abrirEnlace(pickInput(input, "url", "enlace", "link", "href", "direccion", "dirección"))),
  },
  {
    name: "buscar_en_libreria",
    description:
      "Abre la Biblioteca del usuario con una consulta para encontrar recursos guardados. Entrada: { consulta }. Úsala para «búscalo en la librería», «busca en mi biblioteca…».",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "buscar_en_libreria",
    kind: "screen",
    run: (input) =>
      runContentAction((m) =>
        m.buscarEnBiblioteca(pickInput(input, "consulta", "query", "q", "texto", "text", "busqueda", "búsqueda", "termino", "término")),
      ),
  },
  {
    name: "buscar_en_biblioteca",
    description:
      "Alias de buscar_en_libreria: abre la Biblioteca con una consulta. Entrada: { consulta }. Úsala para «búscalo en la biblioteca».",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "buscar_en_biblioteca",
    kind: "screen",
    run: (input) =>
      runContentAction((m) =>
        m.buscarEnBiblioteca(pickInput(input, "consulta", "query", "q", "texto", "text", "busqueda", "búsqueda", "termino", "término")),
      ),
  },
  // ── GENERAR CON SERVICIOS por función (usa lo que el usuario conectó en /servicios) ──
  {
    name: "generar_imagen",
    description:
      "Genera una IMAGEN a partir de un prompt usando el servicio de imagen que el usuario conectó en /servicios (Fooocus-API o Stable Diffusion / AUTOMATIC1111) y la guarda en la Biblioteca. Entrada: { prompt }. Úsala para «genera una imagen de…», «créame una ilustración de…», «dibuja…». Si no hay servicio conectado, avisa para configurarlo en /servicios (no inventa la imagen).",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "generar_imagen",
    kind: "screen",
    run: (input) =>
      runServiceGeneration((m) =>
        m.generarImagen(
          pickInput(input, "prompt", "descripcion", "descripción", "texto", "text", "idea", "imagen"),
        ),
      ),
  },
  {
    name: "lanzar_workflow",
    description:
      "Lanza un WORKFLOW de automatización (n8n) por su webhook, usando la instancia conectada en /servicios. Entrada: { nombre | path, datos? } (nombre/path = lo que va tras /webhook/ o la URL completa; datos = objeto JSON opcional para el flujo). Úsala para «lanza el workflow…», «dispara la automatización…», «ejecuta el flujo…». Si no hay n8n conectado, avisa para configurarlo en /servicios.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "lanzar_workflow",
    kind: "screen",
    run: (input) =>
      runServiceGeneration((m) =>
        m.lanzarWorkflow(
          pickInput(input, "nombre", "name", "path", "ruta", "webhook", "flujo", "workflow"),
          pickInput(input, "datos", "data", "payload", "cuerpo", "body", "parametros", "parámetros"),
        ),
      ),
  },
  {
    name: "generar_sitio_web",
    description:
      "Crea un SITIO WEB a partir de una descripción usando el servicio de sitios conectado en /servicios; si no hay ninguno, genera una página HTML de plantilla y la guarda en la Biblioteca (fallback útil). Entrada: { descripcion }. Úsala para «crea un sitio web de…», «hazme una landing para…», «genera una página sobre…».",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "generar_sitio_web",
    kind: "screen",
    run: (input) =>
      runServiceGeneration((m) =>
        m.generarSitioWeb(
          pickInput(input, "descripcion", "descripción", "prompt", "texto", "text", "idea", "sitio", "web"),
        ),
      ),
  },
  {
    name: "generar_video",
    description:
      "Genera un VÍDEO a partir de un prompt usando el servicio de vídeo que el usuario conectó en /servicios, y lo guarda en la Biblioteca. Entrada: { prompt }. Úsala para «genera un vídeo de…», «créame un clip de…». Si no hay servicio de vídeo conectado, avisa para configurarlo en /servicios (no inventa el vídeo).",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "generar_video",
    kind: "screen",
    run: (input) =>
      runServiceGeneration((m) =>
        m.generarVideo(
          pickInput(input, "prompt", "descripcion", "descripción", "texto", "text", "idea", "video", "vídeo"),
        ),
      ),
  },
];

// ════════════════════════════════════════════════════════════════════════════
// CONTEXTO TOTAL DEL USUARIO Y LA RED — Aurora consulta tu ámbito propio y
// ----------------------------------------------------------------------------
// contenido PÚBLICO a demanda (src/ai/astraura/user-context.ts). El contexto
// 'breve' ya se inyecta automáticamente en cada turno (ver router.ts), pero
// estas tools dejan que Aurora pida el contexto COMPLETO, busque publicaciones
// públicas de la red o consulte una página/grupo concreto cuando lo necesite.
// Tools LOCALES (kind:"screen" ⇒ ejecución en navegador, sin integración ni
// config): mismo contrato que control de pantalla/generación. Privacidad: solo
// ámbito propio + público; nunca exponen claves ni el cuerpo de mensajes.
// ════════════════════════════════════════════════════════════════════════════

/** Tipado del módulo de contexto de usuario (import dinámico). */
type UserContextModule = typeof import("../../ai/astraura/user-context");

/**
 * Ejecuta una consulta de contexto de usuario/red con import perezoso del
 * módulo y adapta su resultado (string ya listo para hablar/leer) al contrato
 * IntegrationResult (data.text). NUNCA lanza.
 */
async function runUserContextQuery(
  exec: (mod: UserContextModule) => Promise<string>,
): Promise<IntegrationResult> {
  if (typeof window === "undefined") {
    return { ok: false, error: "El contexto del usuario solo está disponible en el navegador." };
  }
  try {
    const mod = await import("../../ai/astraura/user-context");
    const text = (await exec(mod)).trim();
    return { ok: true, data: { text: text || "No encontré nada relevante ahora mismo." } };
  } catch {
    return { ok: false, error: "No pude consultar el contexto del usuario." };
  }
}

/** Tools de CONTEXTO que Aurora puede invocar (siempre disponibles en navegador con sesión). */
export const AURORA_CONTEXT_TOOLS: AuroraScreenTool[] = [
  {
    name: "get_user_context",
    description:
      "Devuelve un resumen de TU propio ámbito (perfiles, grupos/páginas, archivos, publicaciones, mensajes —solo hilos y títulos, nunca su contenido—, notificaciones, recordatorios, escritorios y espacios). Entrada: { nivel? } ('breve'|'completo', por defecto 'completo' al invocarla tú misma). Úsala cuando el resumen breve del system prompt no baste.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "get_user_context",
    kind: "screen",
    run: (input) =>
      runUserContextQuery((m) =>
        m.buildUserContext(
          pickInput(input, "nivel", "level", "detalle") === "breve" ? "breve" : "completo",
        ),
      ),
  },
  {
    name: "search_network_posts",
    description:
      "Busca publicaciones PÚBLICAS en la red de StarSeed por texto. Entrada: { consulta }. Devuelve hasta 8 resultados con autor, área/entidad y un fragmento. Nunca inventes resultados que no aparezcan aquí.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "search_network_posts",
    kind: "screen",
    run: (input) =>
      runUserContextQuery(async (m) => {
        const q = String(pickInput(input, "consulta", "query", "q", "texto", "busqueda", "búsqueda") ?? "").trim();
        if (!q) return "Dime qué quieres buscar en la red.";
        const hits = await m.searchNetworkPosts(q);
        if (!hits.length) return `Sin resultados públicos para "${q}".`;
        return hits
          .map((h) => `- [${h.entityType ?? "red"}${h.entitySlug ? "/" + h.entitySlug : ""}] ${h.authorName ?? "Alguien"}: "${h.snippet}"`)
          .join("\n");
      }),
  },
  {
    name: "get_entity_context",
    description:
      "Info PÚBLICA de una página o grupo del OS: nombre, nº de miembros y publicaciones recientes. Entrada: { tipo: 'pagina'|'grupo', slug }. Úsala antes de hablar de una página/grupo concreto para no inventar datos.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "get_entity_context",
    kind: "screen",
    run: (input) =>
      runUserContextQuery(async (m) => {
        const tipo = pickInput(input, "tipo", "kind", "clase") === "grupo" ? "grupo" : "pagina";
        const slug = String(pickInput(input, "slug", "id", "nombre", "name") ?? "").trim();
        if (!slug) return "¿De qué página o grupo (slug) quieres que consulte?";
        const ctx = await m.getEntityContext(tipo, slug);
        return ctx.found ? ctx.summary : `No encontré ${tipo === "grupo" ? "el grupo" : "la página"} "${slug}".`;
      }),
  },
];

// ════════════════════════════════════════════════════════════════════════════
// PERSONALIDAD (kind:"personality") — Aurora cambia/ajusta su propia forma de
// ----------------------------------------------------------------------------
// ser POR VOZ (Adenda 63 §11): "ponte en modo mentora", "sé más dulce",
// "¿qué personalidad tienes ahora?". Tools LOCALES (ejecución en navegador,
// sin integración ni endpoint) que delegan en src/lib/aurora/personalities
// (import perezoso). Al cambiar/ajustar se emite `starseed:aurora-voice-style`
// para que el sistema de voz module tono/ritmo/energía. NUNCA lanza.
// ════════════════════════════════════════════════════════════════════════════

export interface AuroraPersonalityTool extends AuroraIntegrationTool {
  /** Marca de tool local de personalidad (ejecuta en navegador, sin config). */
  kind: "personality";
  /** Ejecutor local (solo navegador). */
  run: (input: Record<string, unknown>) => Promise<IntegrationResult>;
}

/** Type guard: ¿es una tool de personalidad? */
export function isAuroraPersonalityTool(
  t: AuroraIntegrationTool | undefined | null,
): t is AuroraPersonalityTool {
  return !!t && (t as AuroraPersonalityTool).kind === "personality" && typeof (t as AuroraPersonalityTool).run === "function";
}

/** ¿Es una tool LOCAL (pantalla, personalidad o voz): navegador ⇒ disponible, sin config? */
function isAuroraLocalTool(t: AuroraIntegrationTool | undefined | null): boolean {
  return isAuroraScreenTool(t) || isAuroraPersonalityTool(t) || isAuroraVoiceTool(t);
}

/** Tipado del módulo de personalidades (import dinámico). */
type PersonalitiesModule = typeof import("../../lib/aurora/personalities");

/**
 * Ejecuta una acción de personalidad con import perezoso del módulo y adapta
 * su resultado al contrato IntegrationResult (data.text = frase decible en
 * español). NUNCA lanza.
 */
async function runPersonalityControl(
  exec: (mod: PersonalitiesModule) => ScreenOutcome | Promise<ScreenOutcome>,
): Promise<IntegrationResult> {
  if (typeof window === "undefined") {
    return { ok: false, error: "Las personalidades solo funcionan en el navegador." };
  }
  try {
    const mod = await import("../../lib/aurora/personalities");
    const res = await exec(mod);
    if (!res || typeof res.ok !== "boolean") {
      return { ok: false, error: "El sistema de personalidades no respondió." };
    }
    return res.ok
      ? { ok: true, data: { text: res.message, ...(res.data ?? {}) } }
      : { ok: false, error: res.message };
  } catch {
    return { ok: false, error: "No pude gestionar la personalidad." };
  }
}

/** Tools de PERSONALIDAD que Aurora puede invocar (siempre disponibles en navegador). */
export const AURORA_PERSONALITY_TOOLS: AuroraPersonalityTool[] = [
  {
    name: "cambiar_personalidad",
    description:
      "Cambia tu personalidad activa por su nombre. Entrada: { nombre, ambito?: 'global'|'seccion'|'chat'|'cerebro', ref? } (ambito por defecto: global; ref = sección politica|educacion|cultura, id de chat o id de cerebro). Úsala cuando el usuario diga «ponte en modo mentora», «cambia a la personalidad analista», «vuelve a ser Aurora».",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "cambiar_personalidad",
    kind: "personality",
    run: (input) =>
      runPersonalityControl((m) => {
        const nombre = String(pickInput(input, "nombre", "name", "personalidad", "modo", "id") ?? "").trim();
        if (!nombre) {
          const nombres = m.listPersonalityProfiles().map((p) => p.name).slice(0, 8).join(", ");
          return { ok: false, message: `¿A qué personalidad cambio? Tengo: ${nombres}.` };
        }
        const ambitoRaw = String(pickInput(input, "ambito", "ámbito", "scope", "contexto") ?? "").trim().toLowerCase();
        const ambito = (["global", "seccion", "chat", "cerebro"].includes(ambitoRaw) ? ambitoRaw : undefined) as
          | "global" | "seccion" | "chat" | "cerebro" | undefined;
        const ref = String(pickInput(input, "ref", "seccion", "sección", "chat", "cerebro", "destino") ?? "").trim() || undefined;
        const r = m.setActivePersonalityByName(nombre, ambito, ref);
        return { ok: r.ok, message: r.message, data: r.profile ? { id: r.profile.id, nombre: r.profile.name } : undefined };
      }),
  },
  {
    name: "ajustar_rasgo_personalidad",
    description:
      "Ajusta UN rasgo de tu personalidad activa (±20 sobre 100, con tope). Entrada: { rasgo, direccion?: 'mas'|'menos', cantidad? } (rasgo en natural: dulce, energética, formal, paciente, humor, brevedad…). Úsala cuando el usuario diga «sé más dulce», «menos formal», «ponte más energética». El cambio también modula tu voz.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "ajustar_rasgo_personalidad",
    kind: "personality",
    run: (input) =>
      runPersonalityControl((m) => {
        const rasgo = String(pickInput(input, "rasgo", "trait", "aspecto", "cualidad", "nombre") ?? "").trim();
        const dirRaw = String(pickInput(input, "direccion", "dirección", "dir", "sentido") ?? "mas").trim().toLowerCase();
        const direccion = dirRaw === "menos" || dirRaw === "-" || dirRaw === "bajar" ? "menos" : "mas";
        const cantidad = Number(pickInput(input, "cantidad", "delta", "cuanto", "cuánto") ?? 20);
        const r = m.adjustActivePersonalityTrait(rasgo, direccion, Number.isFinite(cantidad) && cantidad > 0 ? Math.min(50, cantidad) : 20);
        return { ok: r.ok, message: r.message };
      }),
  },
  {
    name: "describir_personalidad",
    description:
      "Describe tu personalidad activa actual (nombre, esencia, rasgos más marcados, idioma y voz). Entrada: {}. Úsala cuando el usuario pregunte «¿qué personalidad tienes?», «¿cómo estás configurada?», «¿quién eres ahora?». Léele el resumen tal cual.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "describir_personalidad",
    kind: "personality",
    run: () =>
      runPersonalityControl((m) => ({ ok: true, message: m.describeActivePersonality() })),
  },
  {
    name: "listar_personalidades",
    description:
      "Lista las personalidades disponibles (nombre y descripción corta) para poder elegir una. Entrada: {}. Úsala si el usuario pregunta «¿qué personalidades tienes?» o antes de cambiar cuando dudes del nombre.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "listar_personalidades",
    kind: "personality",
    run: () =>
      runPersonalityControl((m) => {
        const list = m.listPersonalityProfiles();
        if (!list.length) return { ok: true, message: "No hay personalidades guardadas todavía." };
        const activa = m.resolvePersonalityForContext({});
        const lines = list.slice(0, 12).map((p) => `${p.name}${activa?.id === p.id ? " (activa)" : ""}`);
        return {
          ok: true,
          message: `Tengo ${list.length} personalidades: ${lines.join(" · ")}. Dime «ponte en modo…» y el nombre.`,
          data: { total: list.length, personalidades: list.map((p) => ({ id: p.id, nombre: p.name })) },
        };
      }),
  },
];

// ════════════════════════════════════════════════════════════════════════════
// VOZ DE AURORA (kind:"voice") — Aurora ajusta SU PROPIA VOZ en vivo
// ----------------------------------------------------------------------------
// (Adenda 63 §10): «habla más dulce», «voz más seria», «usa bark», «más
// despacio». Tools LOCALES (mismo contrato de despacho que kind:"screen":
// ejecución en navegador, sin integración ni endpoint) que delegan en
// src/lib/aurora/tts-oss (import perezoso). Los cambios PERSISTEN en la config
// unificada `starseed.aurora.voice.v1` (viaja con la cuenta) y disparan el
// evento vivo 'starseed:aurora-voice-style' — la SIGUIENTE frase ya sale
// modulada en cualquier motor (navegador/Kokoro/Bark/GPT-SoVITS/OmniVoice).
// NUNCA lanzan; degradan con un mensaje hablado útil.
// ════════════════════════════════════════════════════════════════════════════

/** Pseudo-integración de las tools de voz (no existe en el registro). */
export const VOICE_TOOL_INTEGRATION_ID = "voz";

export interface AuroraVoiceTool extends AuroraIntegrationTool {
  /** Marca de tool local de voz (ajusta la voz de Aurora, sin integraciones). */
  kind: "voice";
  /** Ejecutor local (solo navegador). */
  run: (input: Record<string, unknown>) => Promise<IntegrationResult>;
}

/** Type guard: ¿es una tool de voz de Aurora? */
export function isAuroraVoiceTool(
  t: AuroraIntegrationTool | undefined | null,
): t is AuroraVoiceTool {
  return !!t && (t as AuroraVoiceTool).kind === "voice" && typeof (t as AuroraVoiceTool).run === "function";
}

/** Tipado del barrel de voz (import dinámico). */
type VoiceModule = typeof import("../../lib/aurora/tts-oss/index");

/**
 * Ejecuta una acción de voz con import perezoso del barrel tts-oss y adapta su
 * resultado al contrato IntegrationResult (data.text = frase decible en
 * español). NUNCA lanza.
 */
async function runVoiceControl(
  exec: (mod: VoiceModule) => ScreenOutcome | Promise<ScreenOutcome>,
): Promise<IntegrationResult> {
  if (typeof window === "undefined") {
    return { ok: false, error: "Los ajustes de voz solo funcionan en el navegador." };
  }
  try {
    const mod = await import("../../lib/aurora/tts-oss/index");
    const res = await exec(mod);
    if (!res || typeof res.ok !== "boolean") {
      return { ok: false, error: "El sistema de voz no respondió." };
    }
    return res.ok
      ? { ok: true, data: { text: res.message, ...(res.data ?? {}) } }
      : { ok: false, error: res.message };
  } catch {
    return { ok: false, error: "No pude ajustar la voz ahora mismo." };
  }
}

/** Motor de voz desde un alias hablado ("navegador", "openvoice", "bark"…). */
function normalizeEngineAlias(v: unknown):
  | "browser" | "kokoro" | "kitten" | "bark" | "gpt-sovits" | "omnivoice" | "openvoice2" | undefined {
  const n = String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
  if (!n) return undefined;
  if (["navegador", "browser", "nativa", "sistema"].includes(n)) return "browser";
  if (n.includes("openvoice") || n.includes("open voice")) return "openvoice2";
  if (n.includes("kokoro")) return "kokoro";
  if (n.includes("kitten")) return "kitten";
  if (n.includes("bark")) return "bark";
  if (n.includes("sovits") || n.includes("clonacion") || n.includes("clon")) return "gpt-sovits";
  if (n.includes("omni")) return "omnivoice";
  return undefined;
}

/**
 * Interpreta un nivel: número absoluto (se clampa a [min,max]) o palabra
 * relativa ("más/rápido/sube" = +paso · "menos/lento/baja" = −paso) sobre
 * `current`. undefined si no se entiende. Nunca lanza.
 */
function parseVoiceLevel(
  v: unknown,
  current: number,
  min: number,
  max: number,
  step: number,
): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const asNum = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  if (Number.isFinite(asNum)) return Math.max(min, Math.min(max, asNum));
  const n = String(v).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/(mas|rapid|sube|alto|alta|arriba|agud)/.test(n)) {
    return Math.max(min, Math.min(max, current + step));
  }
  if (/(menos|lent|baja|bajo|abajo|despacio|grave|suave)/.test(n)) {
    return Math.max(min, Math.min(max, current - step));
  }
  return undefined;
}

// ── Nombres PÚBLICOS de los motores de voz (rebrand OmniVoice/OpenVoice, jul-2026) ──
// Concepto (petición de Alex): "OmniVoice" es el SISTEMA de voz completo de
// Astraura — engloba CUALQUIER motor, configuración y tipo de voz, en
// cualquier personalidad (daemon local, OpenVoice, Kokoro, VoxCPM, navegador…
// y toda la config de voz por personalidad). "OpenVoice" es el motor POR
// DEFECTO de las personalidades incluidas. Los ids internos `openvoice2`
// (web, cero-config) y `omnivoice` (híbrido daemon-local ↔ nube k2-fsa) son
// AMBOS esa misma capa automática de cero-configuración (ver la cabecera de
// voice-config.ts/omnivoice-hybrid.ts: "el motor predeterminado real del
// sistema es OpenVoice/OmniVoice"), así que de cara al usuario/LLM se
// presentan como "OpenVoice"; el resto de motores se nombran con honestidad
// (son respaldos DENTRO de OmniVoice). Esto SOLO renombra para el reporte:
// la lógica real (activo/chain/data) sigue intacta y veraz.
const VOICE_ENGINE_DISPLAY_NAMES: Record<string, string> = {
  openvoice2: "OpenVoice",
  omnivoice: "OpenVoice",
  kokoro: "Kokoro",
  voxcpm: "VoxCPM",
  voicebox: "Voicebox",
  bark: "Bark",
  "gpt-sovits": "GPT-SoVITS",
  kitten: "Kitten",
  browser: "voz del navegador",
};

/** ¿Este id de motor cae dentro del default automático "OpenVoice" (openvoice2/omnivoice)? */
function isDefaultVoiceEngine(id: string): boolean {
  return id === "openvoice2" || id === "omnivoice";
}

/** Nombre público de un motor para hablar/reportar (fallback: el id tal cual). */
function voiceEngineDisplayName(id: string): string {
  return VOICE_ENGINE_DISPLAY_NAMES[id] ?? id;
}

/**
 * Cadena de voz lista para hablar/leer: nombres públicos, colapsando
 * repeticiones consecutivas (p.ej. `openvoice2 → omnivoice` son ambos
 * "OpenVoice" de cara al usuario, así que se listan una sola vez) y
 * terminando siempre en `tail` (el suelo garantizado). Nunca lanza.
 */
function formatVoiceChain(links: readonly string[], tail: string): string {
  const out: string[] = [];
  for (const id of links) {
    const label = voiceEngineDisplayName(id);
    if (out[out.length - 1] !== label) out.push(label);
  }
  if (out[out.length - 1] !== tail) out.push(tail);
  return out.join(" → ");
}

/** Tools de VOZ que Aurora puede invocar (siempre disponibles en navegador). */
export const AURORA_VOICE_TOOLS: AuroraVoiceTool[] = [
  {
    name: "ajustar_voz",
    description:
      "Ajusta EN VIVO tu propia voz. Entrada: { velocidad?, tono?, energia?, emocion?, motor?, voz? } — velocidad/tono = número 0.5–2 (1 normal) o \"más\"/\"menos\"; energia = 0–100; emocion = alegre|serena|dulce|seria|entusiasta|empatica|misteriosa|juguetona; motor = navegador|kokoro|bark|gpt-sovits|omnivoice; voz = nombre o preset. Úsala cuando el usuario diga «habla más dulce» (emocion:\"dulce\"), «más despacio» (velocidad:\"menos\"), «voz más seria» (emocion:\"seria\"), «usa bark» (motor:\"bark\"). Se guarda y viaja con la cuenta.",
    integrationId: VOICE_TOOL_INTEGRATION_ID,
    actionId: "ajustar_voz",
    kind: "voice",
    run: (input) =>
      runVoiceControl(async (m) => {
        const changes: string[] = [];
        const style = m.getVoiceStyle();
        const stylePatch: Partial<import("../../lib/aurora/tts-oss/index").AuroraVoiceStyle> = {};

        const emotion = m.normalizeEmotion(
          pickInput(input, "emocion", "emoción", "emotion", "estilo", "animo", "ánimo", "humor"),
        );
        if (emotion) {
          stylePatch.emotion = emotion;
          changes.push(`emoción «${emotion}»`);
        }
        const rate = parseVoiceLevel(
          pickInput(input, "velocidad", "rate", "speed", "ritmo"),
          style.rate ?? 1, 0.5, 2, 0.15,
        );
        if (rate !== undefined) {
          stylePatch.rate = rate;
          changes.push(`velocidad ${rate.toFixed(2)}`);
        }
        const pitch = parseVoiceLevel(
          pickInput(input, "tono", "pitch"),
          style.pitch ?? 1, 0.5, 2, 0.15,
        );
        if (pitch !== undefined) {
          stylePatch.pitch = pitch;
          changes.push(`tono ${pitch.toFixed(2)}`);
        }
        const energy = parseVoiceLevel(
          pickInput(input, "energia", "energía", "energy", "volumen"),
          style.energy ?? 50, 0, 100, 15,
        );
        if (energy !== undefined) {
          stylePatch.energy = energy;
          changes.push(`energía ${Math.round(energy)}`);
        }
        if (Object.keys(stylePatch).length > 0) {
          // Persiste en la MISMA clave sincronizada y dispara el evento vivo.
          m.emitVoiceStyle(stylePatch);
        }

        // Motor y voz (opcionales en la misma llamada).
        const engine = normalizeEngineAlias(pickInput(input, "motor", "engine"));
        let engineNote = "";
        if (engine) {
          m.setVoiceEngine(engine);
          changes.push(`motor «${engine}»`);
          if (m.isNeuralEngine(engine) && !m.neuralEngineConfigured(engine)) {
            engineNote =
              " Ese motor aún no tiene endpoint: mientras tanto hablaré con Kokoro o la voz del navegador (configúralo en Ajustes → Voz).";
          }
        }
        const voice = pickInput(input, "voz", "voice", "preset");
        if (voice !== undefined && voice !== null && String(voice).trim()) {
          const vs = String(voice).trim();
          const target = engine ?? m.getVoiceEngine();
          if (m.isNeuralEngine(target)) m.setEngineSettings(target, { voice: vs });
          else m.setVoiceName(vs);
          changes.push(`voz «${vs}»`);
        }

        if (changes.length === 0) {
          return {
            ok: false,
            message:
              "Dime qué ajusto de mi voz: velocidad, tono, energía, emoción (p.ej. dulce), motor o voz.",
          };
        }
        return {
          ok: true,
          message: `Listo: ajusté ${changes.join(", ")}.${engineNote} Me oirás así desde la próxima frase.`,
          data: { cambios: changes },
        };
      }),
  },
  {
    name: "cambiar_motor_voz",
    description:
      "Cambia el MOTOR con el que hablas. Entrada: { motor } (navegador | kokoro | bark | gpt-sovits | omnivoice). Si el motor por endpoint no está configurado, avisa y sigue hablando por la cadena de respaldo (Kokoro → navegador): nunca te quedas muda. Úsala para «usa bark», «vuelve a la voz del navegador», «habla con kokoro».",
    integrationId: VOICE_TOOL_INTEGRATION_ID,
    actionId: "cambiar_motor_voz",
    kind: "voice",
    run: (input) =>
      runVoiceControl(async (m) => {
        const engine = normalizeEngineAlias(pickInput(input, "motor", "engine", "voz", "nombre"));
        if (!engine) {
          return {
            ok: false,
            message: "¿Qué motor quieres? navegador, kokoro, bark, gpt-sovits u omnivoice.",
          };
        }
        m.setVoiceEngine(engine);
        if (m.isNeuralEngine(engine) && !m.neuralEngineConfigured(engine)) {
          return {
            ok: true,
            message: `Cambié el motor a ${engine}, pero aún no tiene endpoint configurado: hablaré con Kokoro o la voz del navegador hasta que lo añadas en Ajustes → Voz (se instala en tu neurona o CasaOS).`,
            data: { motor: engine, endpoint: false },
          };
        }
        return { ok: true, message: `Hecho: ahora hablo con ${engine}.`, data: { motor: engine, endpoint: true } };
      }),
  },
  {
    name: "estado_voz",
    description:
      "Cuenta cómo está tu voz ahora: motor activo, endpoints configurados y su disponibilidad, y el estilo (velocidad/tono/energía/emoción). Entrada: {}. Léele el resumen al usuario.",
    integrationId: VOICE_TOOL_INTEGRATION_ID,
    actionId: "estado_voz",
    kind: "voice",
    run: () =>
      runVoiceControl(async (m) => {
        // ESTADO REAL (Adenda 84; reencuadrado OmniVoice/OpenVoice jul-2026):
        // la voz es AUTOMÁTICA por defecto — el sistema completo es OmniVoice
        // y su motor por defecto es OpenVoice (web gratis primero, híbrido
        // daemon-local/nube detrás), con Kokoro instalable y el navegador como
        // suelo. Este reporte cuenta la CADENA VIVA, no los endpoints manuales
        // (esos son opcionales y solo se listan si el usuario los configuró).
        await m.refreshPersonalityVoicePin().catch(() => null);
        // Sondea la ruta REAL del híbrido (¿daemon local vivo?) antes de contar.
        await m.refreshOmniRoute().catch(() => null);
        const cfg = m.getVoiceConfig();
        const chain = m.buildVoiceChain(cfg);
        const activo = m.resolveActiveVoiceEngine(cfg);
        const motorLabel = voiceEngineDisplayName(activo);
        const parts: string[] = [
          "Sistema de voz: OmniVoice — el sistema de voz de Astraura, que engloba todos los motores y configuraciones de cualquier personalidad. Funciona AUTOMÁTICAMENTE, sin configurar nada.",
          `Motor activo ahora: ${motorLabel}${
            isDefaultVoiceEngine(activo)
              ? " (el motor por defecto de mis personalidades)"
              : " (respaldo dentro de OmniVoice)"
          }.`,
          `Cadena de voz (si un motor no responde, sigue el siguiente): ${
            formatVoiceChain(chain, "voz del navegador (respaldo, suelo garantizado)")
          }.`,
        ];
        // Estados vivos de los motores automáticos.
        try {
          const ov = m.getOpenVoice2State();
          parts.push(
            `OpenVoice (motor por defecto): ${
              ov === "listo"
                ? "✅ lista (endpoint gratuito de Hugging Face verificado)"
                : ov === "fuera"
                  ? "⏳ sus endpoints gratuitos están descansando; vuelven solos (mientras, habla el siguiente motor)"
                  : "🌥 en la nube gratis, despierta al primer uso"
            }.`,
          );
        } catch { /* */ }
        try {
          const ruta = m.getOmniVoiceRouteState();
          parts.push(
            `Ruta de OpenVoice (local/nube): ${
              ruta === "local"
                ? "⚡ motor LOCAL instalado y activo en este equipo (privado y rápido)"
                : "🌥 nube gratis automática (instala el motor local desde el editor de voz para privacidad total)"
            }.`,
          );
        } catch { /* */ }
        try {
          parts.push(
            m.kokoroModelReady()
              ? "Kokoro (respaldo dentro de OmniVoice): ✅ instalada en este dispositivo (funciona sin internet)."
              : "Kokoro (respaldo dentro de OmniVoice): instalable con un toque (~80 MB, sin terminal — también en Android/iOS).",
          );
        } catch { /* */ }
        // Estilo actual.
        const style = m.getVoiceStyle();
        const styleBits: string[] = [];
        if (style.emotion) styleBits.push(`emoción ${style.emotion}`);
        if (style.rate !== undefined) styleBits.push(`velocidad ${style.rate.toFixed(2)}`);
        if (style.pitch !== undefined) styleBits.push(`tono ${style.pitch.toFixed(2)}`);
        if (style.energy !== undefined) styleBits.push(`energía ${Math.round(style.energy)}`);
        if (styleBits.length) parts.push(`Estilo: ${styleBits.join(", ")}.`);
        // Endpoints MANUALES (opcionales): solo se mencionan los configurados.
        const manuales: string[] = [];
        for (const id of m.NEURAL_VOICE_ENGINES) {
          if (id === "openvoice2" || id === "omnivoice") continue; // automáticos
          const s = m.getEngineSettings(id);
          if (!s.endpoint) continue;
          const ping = await m.pingNeuralEngine(id).catch(() => "unreachable" as const);
          manuales.push(`${id} (${ping === "ok" ? "disponible" : "configurado, no responde"})`);
        }
        if (manuales.length) parts.push(`Otros motores opcionales dentro de OmniVoice (endpoints manuales): ${manuales.join(" · ")}.`);
        if (cfg.symbiotic) parts.push("Modo simbiótico Bark+SoVITS activado.");
        return { ok: true, message: parts.join(" "), data: { motor: activo, cadena: chain } };
      }),
  },
];

// ----------------------------------------------------------------------------
// ESTADO REAL DE LA VOZ PARA EL PROMPT (Adenda 87 · anti-alucinación de voz)
// ----------------------------------------------------------------------------
// Diagnóstico: el LLM casi nunca invoca la tool `estado_voz` de arriba, así que
// cuando el usuario pregunta "¿qué motor de voz usas?" el modelo ALUCINA
// motores que no existen en este sistema (p.ej. "uso VoxCPM con Bark/Kokoro").
// `describeVoiceStateForPrompt` extrae la MISMA lógica de lectura que
// `estado_voz` (refreshPersonalityVoicePin → refreshOmniRoute → getVoiceConfig
// → buildVoiceChain → resolveActiveVoiceEngine → getOpenVoice2State →
// getOmniVoiceRouteState) a una función pura que devuelve UNA línea corta.
// router.ts la inyecta en `brainExtra` en CADA turno (ver astrauraChat), así
// el modelo SIEMPRE tiene la verdad delante y no necesita adivinar.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Estado real de la voz de Aurora, comprimido a UNA línea para el contexto
 * del LLM. Misma fuente de verdad que la tool `estado_voz` (arriba), pero sin
 * la redacción hablada larga.
 *
 * Totalmente defensiva y SSR-safe: NUNCA lanza; si algo falla o tarda,
 * devuelve "" y el prompt queda igual que si esta función no existiera.
 * Timeout de seguridad corto (1800 ms) para que nunca bloquee la respuesta de
 * Aurora aunque la sonda de red de OmniVoice (daemon local) esté colgada.
 */
export async function describeVoiceStateForPrompt(): Promise<string> {
  if (typeof window === "undefined") return "";
  try {
    return await Promise.race([
      describeVoiceStateForPromptInner(),
      new Promise<string>((resolve) => setTimeout(() => resolve(""), 1800)),
    ]);
  } catch {
    return "";
  }
}

/** Cuerpo de {@link describeVoiceStateForPrompt}, separado para poder acotarlo con timeout. Nunca lanza. */
async function describeVoiceStateForPromptInner(): Promise<string> {
  try {
    const m = await import("../../lib/aurora/tts-oss/index");
    await m.refreshPersonalityVoicePin().catch(() => null);
    // Sonda de red OPCIONAL (¿daemon local de OmniVoice vivo?): timeout propio
    // y corto — si no responde a tiempo seguimos con el último estado ya
    // cacheado (getOmniVoiceRouteState), tan válido como el que usa `estado_voz`.
    await Promise.race([
      m.refreshOmniRoute().catch(() => null),
      new Promise<void>((resolve) => setTimeout(() => resolve(), 900)),
    ]);
    const cfg = m.getVoiceConfig();
    const chain = m.buildVoiceChain(cfg);
    const activo = m.resolveActiveVoiceEngine(cfg);
    const motorLabel = voiceEngineDisplayName(activo);
    const cadena = formatVoiceChain(chain, "voz del navegador");
    let ruta = "desconocida";
    try {
      const r = m.getOmniVoiceRouteState();
      ruta = r === "local" ? "local" : r === "cloud" ? "nube" : "off";
    } catch { /* defensivo */ }
    let openvoice = "desconocido";
    try {
      const ov = m.getOpenVoice2State();
      openvoice = ov === "listo"
        ? "lista"
        : ov === "fuera"
          ? "descansando (pasa el turno al siguiente motor)"
          : "nube, despierta al primer uso";
    } catch { /* defensivo */ }
    return (
      "VOZ (estado real del sistema — es la verdad; si te preguntan por tu voz, repórtala y NO inventes otros motores): " +
      "sistema de voz = OmniVoice (engloba todos los motores y configuraciones de cualquier personalidad); " +
      `motor activo ahora = ${motorLabel}${
        isDefaultVoiceEngine(activo)
          ? " (por defecto de las personalidades es OpenVoice)"
          : " (respaldo dentro de OmniVoice)"
      }; ` +
      `ruta local/nube del motor por defecto = ${ruta}; estado de OpenVoice = ${openvoice}; ` +
      `cadena de respaldo = ${cadena}.`
    );
  } catch {
    return "";
  }
}

/** Conjunto de nombres de las tools de GENERAR/USAR CONTENIDO (para la sección de prompt). */
const GENERATE_TOOL_NAMES: ReadonlySet<string> = new Set(AURORA_GENERATE_TOOLS.map((t) => t.name));

/** ¿Es una tool de generación/uso de contenido? */
function isGenerateTool(t: AuroraIntegrationTool): boolean {
  return GENERATE_TOOL_NAMES.has(t.name);
}

/** Conjunto de nombres de las tools de CONTEXTO del usuario/red (para la sección de prompt). */
const CONTEXT_TOOL_NAMES: ReadonlySet<string> = new Set(AURORA_CONTEXT_TOOLS.map((t) => t.name));

/** ¿Es una tool de contexto del usuario/red? */
function isContextTool(t: AuroraIntegrationTool): boolean {
  return CONTEXT_TOOL_NAMES.has(t.name);
}

// Índice por nombre para O(1) — integraciones + control de pantalla + generación + contexto + personalidad + voz.
const TOOL_INDEX: Record<string, AuroraIntegrationTool> = Object.fromEntries(
  [...AURORA_INTEGRATION_TOOLS, ...AURORA_SCREEN_TOOLS, ...AURORA_GENERATE_TOOLS, ...AURORA_CONTEXT_TOOLS, ...AURORA_PERSONALITY_TOOLS, ...AURORA_VOICE_TOOLS].map((t) => [t.name, t]),
);

/** Busca una tool de Aurora por nombre. */
export function getAuroraTool(name: string): AuroraIntegrationTool | undefined {
  return TOOL_INDEX[name];
}

/**
 * Indica si una tool está disponible (su integración está habilitada y
 * con endpoint). Útil para que Aurora solo ofrezca lo que de verdad puede.
 */
export function isAuroraToolAvailable(name: string, brainId?: string): boolean {
  const t = getAuroraTool(name);
  if (!t) return false;
  // Las tools LOCALES (pantalla/personalidad) no dependen de configuración:
  // navegador ⇒ disponibles.
  if (isAuroraLocalTool(t)) return typeof window !== "undefined";
  // Modo "solo gratis" (categoría de provider-resolution.ts): oculta la tool
  // que representa el servicio de MARCA de su categoría (ownServiceId) — Aurora
  // nunca la ofrece ni la intenta en ese modo. Aditivo: en cualquier otro modo,
  // sin categoría, o si algo falla, no cambia nada de lo que ya había.
  if (t.category && t.ownServiceId) {
    try {
      if (modeForCategory(t.category) === "only-free") return false;
    } catch { /* defensivo: no oculta nada si algo falla */ }
  }
  const cfg = loadIntegrationConfig(t.integrationId, brainId);
  const desc = getIntegration(t.integrationId);
  const endpoint = (cfg.endpoint && cfg.endpoint.trim()) || desc?.defaultEndpoint || "";
  return cfg.enabled !== false && !!endpoint;
}

/** Lista las tools disponibles ahora mismo (por config). */
export function listAvailableAuroraTools(brainId?: string): AuroraIntegrationTool[] {
  return [...AURORA_INTEGRATION_TOOLS, ...AURORA_SCREEN_TOOLS, ...AURORA_GENERATE_TOOLS, ...AURORA_CONTEXT_TOOLS, ...AURORA_PERSONALITY_TOOLS, ...AURORA_VOICE_TOOLS].filter((t) =>
    isAuroraToolAvailable(t.name, brainId),
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SUSTITUCIÓN AUTOMÁTICA DE HERRAMIENTAS (Adenda "Aurora siempre responde")
// ----------------------------------------------------------------------------
// Si una tool de la MISMA familia funcional falla en tiempo de ejecución (el
// servicio/conexión/sync no respondió), Aurora prueba SOLA una alternativa
// disponible en vez de rendirse, y lo REGISTRA con transparencia (nunca oculta
// la sustitución). Con guarda anti-ciclo: cada tool se prueba como mucho una
// vez por invocación, así que la cadena siempre termina.
// Ver architecture/astraura-inteligencia.md §17.2.
// ════════════════════════════════════════════════════════════════════════════

/** Alternativas por tool, en orden de preferencia (misma tarea, otro motor). */
const TOOL_ALTERNATES: Record<string, string[]> = {
  web_search: ["scrape_url", "buscar_web", "agent_reach_web_search"],
  scrape_url: ["crawl_url", "buscar_web", "agent_reach_read_web"],
  crawl_url: ["scrape_url", "buscar_web", "agent_reach_read_web"],
  agent_reach_web_search: ["web_search", "scrape_url", "buscar_web"],
  agent_reach_read_web: ["scrape_url", "crawl_url", "buscar_web"],
  agent_reach_youtube_transcript: ["agent_reach_read_web"],
  agent_reach_github_read: ["agent_reach_read_web"],
  agent_reach_reddit_search: ["agent_reach_web_search", "web_search"],
  // OpenViking (memory)
  viking_recall: ["viking_search", "viking_find", "web_search", "agent_reach_web_search"],
  viking_search: ["viking_recall", "viking_find", "web_search"],
  viking_find: ["viking_search", "viking_recall", "web_search"],
  viking_read: ["viking_overview", "viking_abstract", "agent_reach_read_web"],
  viking_abstract: ["viking_read", "viking_overview"],
  viking_overview: ["viking_abstract", "viking_read"],
  viking_ls: [],
  viking_ingest: ["agent_reach_read_web", "scrape_url", "crawl_url"],
  viking_persist_memory: [],
};

/** Adapta el input de una tool a la forma que espera una alternativa distinta. */
function adaptInputForAlternate(altName: string, input: unknown): Record<string, unknown> {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const term = pickInput(raw, "q", "consulta", "query", "texto", "text", "url", "urls");
  if (altName === "buscar_web") return { consulta: term ?? raw };
  if (altName === "crawl_url" || altName === "scrape_url" || altName === "agent_reach_read_web") return { url: term ?? raw };
  if (altName === "web_search" || altName === "agent_reach_web_search") return { q: term ?? raw };
  if (altName === "agent_reach_youtube_transcript") return { url: term ?? raw };
  if (altName === "agent_reach_github_read") return { url: term ?? raw };
  if (altName === "agent_reach_reddit_search") return { q: term ?? raw };
  // OpenViking
  if (altName === "viking_recall") return { query: term ?? raw };
  if (altName === "viking_search") return { query: term ?? raw };
  if (altName === "viking_find") return { query: term ?? raw };
  if (altName === "viking_read") return { uri: term ?? raw };
  if (altName === "viking_abstract") return { uri: term ?? raw };
  if (altName === "viking_overview") return { uri: term ?? raw };
  if (altName === "viking_ingest") return { url: term ?? raw };
  return raw;
}

/**
 * Primera alternativa de `name` que esté DISPONIBLE ahora mismo (configurada o
 * local sin config, como las tools de pantalla/contenido). Para que
 * `actions.ts::tryRunIntegrationTool` pueda sustituir incluso cuando la tool
 * pedida NI SIQUIERA está configurada (no solo cuando falla en tiempo real).
 */
export function findAvailableAlternate(name: string, brainId?: string): string | undefined {
  const alts = TOOL_ALTERNATES[name];
  if (!alts?.length) return undefined;
  return alts.find((a) => isAuroraToolAvailable(a, brainId));
}

/**
 * Añade una atribución honesta y breve de qué proveedor sirvió el resultado
 * (gratis/OSS por defecto, o la cuenta de MARCA del propio usuario), cuando la
 * tool declara una `category` del motor de resolución
 * (`ai/astraura/provider-resolution.ts`). Se basa en `ownServiceId` de la
 * propia tool (qué REALMENTE se ejecutó), no en una re-resolución, para nunca
 * atribuir un proveedor distinto del que de verdad respondió. Nunca lanza; sin
 * `category`, o si el texto no es una cadena, devuelve el resultado tal cual.
 */
function annotateWithActiveProvider(t: AuroraIntegrationTool, res: IntegrationResult): IntegrationResult {
  if (!t.category || typeof res.data?.text !== "string") return res;
  try {
    const desc = getIntegration(t.integrationId);
    const nombre = desc?.label ?? t.integrationId;
    const tag = t.ownServiceId ? `tu cuenta (${nombre})` : `gratis/OSS (${nombre})`;
    return { ...res, data: { ...res.data, text: `${res.data.text}\n\n[proveedor: ${tag}]` } };
  } catch {
    return res;
  }
}

/**
 * Pista corta (ES) de qué proveedor está ACTIVO ahora mismo para la
 * `category` de esta tool (provider-resolution.ts) — se añade al final de su
 * descripción en el prompt para que Aurora prefiera invocar la tool que
 * realmente está activa (p.ej. no ofrecer `scrape_url` como primera opción si
 * el modo "solo gratis" tiene activo el default gratis/OSS). "" sin
 * `category`, o si algo falla.
 */
function categoryHintFor(t: AuroraIntegrationTool): string {
  if (!t.category) return "";
  try {
    const resolved = resolveProvider(t.category);
    return ` [proveedor activo ahora para esta función: ${resolved.label}]`;
  } catch {
    return "";
  }
}

/**
 * Ejecuta una tool de Aurora por nombre. Carga la config (global o por
 * cerebro). NUNCA lanza: devuelve IntegrationResult honesto. Si la tool
 * FALLA en tiempo de ejecución (servicio/conexión/sync caído), prueba sola
 * una alternativa de la misma familia (`TOOL_ALTERNATES`) y REGISTRA la
 * sustitución en el propio texto de la respuesta — nunca en silencio.
 */
export async function runAuroraTool(
  name: string,
  input: any,
  opts?: { brainId?: string; cfg?: IntegrationConfig },
): Promise<IntegrationResult> {
  return runAuroraToolTried(name, input, opts, new Set());
}

async function runAuroraToolTried(
  name: string,
  input: any,
  opts: { brainId?: string; cfg?: IntegrationConfig } | undefined,
  tried: Set<string>,
): Promise<IntegrationResult> {
  tried.add(name);
  const t = getAuroraTool(name);
  if (!t) return { ok: false, error: `No existe la herramienta "${name}".` };
  // Tools LOCALES (pantalla/personalidad/voz): ejecución en navegador, sin config ni endpoint.
  if (isAuroraScreenTool(t) || isAuroraPersonalityTool(t) || isAuroraVoiceTool(t)) {
    try {
      return await t.run(input && typeof input === "object" ? (input as Record<string, unknown>) : {});
    } catch {
      return { ok: false, error: `No pude completar "${name}".` };
    }
  }
  const cfg = opts?.cfg ?? loadIntegrationConfig(t.integrationId, opts?.brainId);
  const res = await runIntegration(t.integrationId, t.actionId, input, cfg);
  if (res.ok) return annotateWithActiveProvider(t, res);

  // ── Sustitución automática: prueba alternativas AÚN no intentadas en esta
  // cadena, y solo las que estén disponibles de verdad. ──
  const alts = (TOOL_ALTERNATES[name] || []).filter((a) => !tried.has(a));
  for (const altName of alts) {
    if (!isAuroraToolAvailable(altName, opts?.brainId)) continue;
    const altInput = adaptInputForAlternate(altName, input);
    const altRes = await runAuroraToolTried(altName, altInput, opts, tried);
    if (altRes.ok) {
      const altText = typeof altRes.data?.text === "string" ? altRes.data.text : "";
      return {
        ok: true,
        data: {
          ...(altRes.data ?? {}),
          text: `[Sustitución automática: «${name}» falló, usé «${altName}» en su lugar] ${altText}`.trim(),
          substitutedFrom: name,
          substitutedTo: altName,
        },
      };
    }
  }
  return res; // ninguna alternativa disponible/funcionó: el fallo original, honesto.
}

/**
 * Fragmento SOLO de las tools de GENERAR/USAR CONTENIDO disponibles ahora.
 * EXPORTADO para que el motor lo una a las demás secciones si lo desea. Aun sin
 * wiring extra, estas tools YA aparecen en el prompt: `auroraToolsPromptSection`
 * las incluye bajo su propia cabecera, y `actions.ts` las lista vía
 * `listAvailableAuroraTools`. La sintaxis de invocación es la MISMA directiva
 * `[[ACCION: nombre {json}]]` (el puente de actions.ts despacha a runAuroraTool).
 * Nunca lanza. Cadena vacía ⇒ no hay tools de generación disponibles.
 */
export function auroraGeneratePromptSection(brainId?: string): string {
  const tools = listAvailableAuroraTools(brainId).filter((t) => isGenerateTool(t));
  if (tools.length === 0) return "";
  return [
    "GENERAR Y USAR CONTENIDO — puedes CREAR contenido y COLOCARLO libremente donde el usuario pida, en cualquier momento de la conversación. No te limites a describir: hazlo tú.",
    "Puedes: escribir notas y documentos (markdown) y GUARDARLOS en la Biblioteca; generar archivos de cualquier formato (JSON, CSV, SVG, HTML, texto…) y guardarlos; PUBLICAR un texto (abre el Composer prellenado); abrir/crear PIZARRAS y poner bloques en el lienzo; añadir WIDGETS al tablero; BUSCAR en la web (navegador interno) o en la Biblioteca; y abrir cualquier ENLACE dentro del OS.",
    "GENERAR CON SERVICIOS CONECTADOS: también puedes generar IMÁGENES (generar_imagen), lanzar WORKFLOWS de automatización (lanzar_workflow), crear SITIOS WEB (generar_sitio_web) y VÍDEOS (generar_video). Estas usan los SERVICIOS open-source que el usuario haya conectado POR FUNCIÓN en /servicios (p.ej. Fooocus-API o Stable Diffusion para imagen, n8n para workflows). Lo generado se guarda en la Biblioteca. IMPORTANTE: no inventes resultados — si no hay un servicio conectado para esa función, la tool te lo dirá y debes GUIAR al usuario a configurarlo en /servicios (para sitios web, sí generas una página de plantilla local útil como respaldo).",
    "Invoca cada tool con la MISMA sintaxis de directiva, con el nombre como acción y su entrada como JSON:",
    '  [[ACCION: nombre {"clave":"valor"}]]',
    "Herramientas de contenido disponibles ahora mismo:",
    ...tools.map((t) => `- ${t.name}: ${t.description}`),
    "Ejemplos:",
    '· «Anota que mañana reunión a las 10» → [[ACCION: crear_nota {"titulo":"Reunión","texto":"Mañana a las 10"}]] Anotado en tu Biblioteca.',
    '· «Escribe un documento sobre el plan» → [[ACCION: crear_documento {"titulo":"Plan","texto":"…"}]] Redactado y guardado.',
    '· «Publícalo en cultura» → [[ACCION: crear_publicacion {"texto":"…","area":"cultura"}]] Abrí el Composer con tu texto.',
    '· «Abre una pizarra» → [[ACCION: abrir_pizarra {}]] Aquí están tus pizarras.',
    '· «Pon el clima en mi tablero» → [[ACCION: crear_widget {"tipo":"clima"}]] Añadí el widget.',
    '· «Busca en la web café de especialidad» → [[ACCION: buscar_web {"consulta":"café de especialidad"}]] Buscando en tu navegador.',
    '· «Búscalo en la librería» → [[ACCION: buscar_en_libreria {"consulta":"…"}]] Abrí tu Biblioteca.',
    '· «Genera una imagen de un bosque de cristal al amanecer» → [[ACCION: generar_imagen {"prompt":"un bosque de cristal al amanecer, luz volumétrica"}]] La generé con tu servicio de imagen y la guardé en tu Biblioteca.',
    '· «Lanza el workflow de bienvenida» → [[ACCION: lanzar_workflow {"nombre":"bienvenida","datos":{"usuario":"Alex"}}]] Disparé el flujo en n8n.',
    '· «Crea un sitio web para mi cafetería» → [[ACCION: generar_sitio_web {"descripcion":"Cafetería de especialidad con menú y reservas"}]] Generé la página y la guardé en tu Biblioteca.',
  ].join("\n");
}

/** Fragmento para el system prompt: tools de integración + control de pantalla + generación + contexto + personalidad. */
export function auroraToolsPromptSection(brainId?: string): string {
  const tools = listAvailableAuroraTools(brainId);
  if (tools.length === 0) return "";
  const integraciones = tools.filter((t) => !isAuroraLocalTool(t));
  // Las tools locales se separan en CINCO familias: control de pantalla/tareas
  // · generar/usar contenido · contexto del usuario/red · personalidad · voz,
  // cada una con su propia cabecera.
  const personalidad = tools.filter((t) => isAuroraPersonalityTool(t));
  const voz = tools.filter((t) => isAuroraVoiceTool(t));
  const contenido = tools.filter((t) => isAuroraScreenTool(t) && isGenerateTool(t));
  const contexto = tools.filter((t) => isAuroraScreenTool(t) && isContextTool(t));
  const pantalla = tools.filter((t) => isAuroraScreenTool(t) && !isGenerateTool(t) && !isContextTool(t));
  const parts: string[] = [];
  if (integraciones.length > 0) {
    parts.push(
      "HERRAMIENTAS EXTERNAS (integraciones configuradas): puedes invocar estas tools de servicios self-host del usuario.",
      ...integraciones.map((t) => `- ${t.name}: ${t.description}${categoryHintFor(t)}`),
    );
  }
  if (pantalla.length > 0) {
    parts.push(
      "CONTROL DE PANTALLA Y TAREAS EN SEGUNDO PLANO (la pantalla como agente interactivo + trabajo en curso): puedes ver y manejar la interfaz visible del usuario — enumerarla, pulsar, escribir, resaltar, leer, rellenar formularios, elegir opciones, copiar texto, ir a secciones y abrir apps — y registrar/consultar tareas que quedan en proceso mientras sigues hablando.",
      ...pantalla.map((t) => `- ${t.name}: ${t.description}`),
    );
  }
  if (contenido.length > 0) {
    parts.push(
      "GENERAR Y USAR CONTENIDO: puedes CREAR contenido (notas, documentos, archivos) y COLOCARLO libremente — guardarlo en la Biblioteca, publicarlo, ponerlo en una pizarra, añadir widgets, buscar en la web o en la Biblioteca y abrir enlaces — a petición del usuario y en cualquier momento. Además puedes GENERAR CON LOS SERVICIOS que el usuario haya conectado por función en /servicios: imágenes (generar_imagen), workflows (lanzar_workflow), sitios web (generar_sitio_web) y vídeos (generar_video), guardando el resultado en la Biblioteca. No solo lo describas: hazlo — y si falta un servicio para esa función, guía a configurarlo en /servicios en vez de inventar el resultado.",
      ...contenido.map((t) => `- ${t.name}: ${t.description}`),
    );
  }
  if (contexto.length > 0) {
    parts.push(
      "CONTEXTO DEL USUARIO Y LA RED: ya tienes un resumen breve de tu ámbito propio arriba (si el usuario lo activó); estas tools te dejan pedir MÁS — el contexto COMPLETO, buscar publicaciones PÚBLICAS de la red, o consultar una página/grupo por su slug. Respeta la privacidad: solo ámbito propio + público, nunca reveles claves/secretos, y en mensajes nunca compartas el contenido de un hilo (solo su existencia/título).",
      ...contexto.map((t) => `- ${t.name}: ${t.description}`),
    );
  }
  if (personalidad.length > 0) {
    parts.push(
      "PERSONALIDAD: el usuario puede pedirte EN NATURAL que cambies tu forma de ser («ponte en modo mentora», «sé más dulce», «menos formal», «¿qué personalidad tienes?»). Hazlo TÚ con estas tools — nunca digas que no puedes cambiar tu personalidad. Los cambios también modulan tu voz.",
      ...personalidad.map((t) => `- ${t.name}: ${t.description}`),
      "Ejemplos:",
      '· «Ponte en modo mentora» → [[ACCION: cambiar_personalidad {"nombre":"mentora"}]] Listo, ahora soy Mentora Sabia.',
      '· «Sé más dulce» → [[ACCION: ajustar_rasgo_personalidad {"rasgo":"dulce","direccion":"mas"}]] Subí mi ternura.',
      '· «¿Qué personalidad tienes?» → [[ACCION: describir_personalidad {}]] y le lees el resumen.',
    );
  }
  if (voz.length > 0) {
    parts.push(
      "TU VOZ: el usuario puede pedirte EN NATURAL que cambies cómo suenas («habla más dulce», «más despacio», «voz más seria», «usa bark», «¿cómo está tu voz?»). Hazlo TÚ con estas tools — nunca digas que no puedes cambiar tu voz. Motores: navegador (siempre), kokoro (local, mejor español), bark / gpt-sovits / omnivoice (neuronales por endpoint). Si un motor no responde, la cadena de respaldo te mantiene hablando SIEMPRE (Kokoro → mejor voz del navegador).",
      ...voz.map((t) => `- ${t.name}: ${t.description}`),
      "Ejemplos:",
      '· «Habla más dulce» → [[ACCION: ajustar_voz {"emocion":"dulce"}]] Claro, así, más dulce.',
      '· «Más despacio, por favor» → [[ACCION: ajustar_voz {"velocidad":"menos"}]] Voy más despacio.',
      '· «Usa bark» → [[ACCION: cambiar_motor_voz {"motor":"bark"}]] Cambiando a Bark.',
      '· «¿Cómo está tu voz?» → [[ACCION: estado_voz {}]] y le lees el resumen.',
    );
  }
  return parts.join("\n");
}
