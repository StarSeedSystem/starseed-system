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
// Todas comparten el mismo contrato de despacho (getAuroraTool / runAuroraTool).
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "./types";
import { getIntegration, loadIntegrationConfig } from "./registry";
import { runIntegration } from "./run";

export interface AuroraIntegrationTool {
  /** Nombre que el modelo usa para invocar (snake_case, estable). */
  name: string;
  /** Descripción en español de qué hace y qué espera. */
  description: string;
  /** Integración destino. */
  integrationId: string;
  /** Acción destino dentro de la integración. */
  actionId: string;
}

/** Subconjunto de tools que Aurora puede invocar. */
export const AURORA_INTEGRATION_TOOLS: AuroraIntegrationTool[] = [
  {
    name: "crawl_url",
    description: "Rastrea una URL y devuelve su contenido en Markdown (Crawl4AI). Entrada: { url } o { urls: [...] }.",
    integrationId: "crawl4ai",
    actionId: "crawl",
  },
  {
    name: "scrape_url",
    description: "Extrae una página web como Markdown vía Firecrawl. Entrada: { url }.",
    integrationId: "firecrawl",
    actionId: "scrape",
  },
  {
    name: "web_search",
    description: "Busca en la web con un metabuscador privado (SearXNG). Entrada: { q } o texto.",
    integrationId: "searxng",
    actionId: "search",
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
type ScreenActionsModule = typeof import("@/lib/aurora/screen-control/screen-actions");
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
    const mod = await import("@/lib/aurora/screen-control/screen-actions");
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

type TaskManagerModule = typeof import("@/lib/aurora/background/task-manager");

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
    const mod = await import("@/lib/aurora/background/task-manager");
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

// Índice por nombre para O(1) — integraciones + control de pantalla.
const TOOL_INDEX: Record<string, AuroraIntegrationTool> = Object.fromEntries(
  [...AURORA_INTEGRATION_TOOLS, ...AURORA_SCREEN_TOOLS].map((t) => [t.name, t]),
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
  // Las tools de PANTALLA no dependen de configuración: navegador ⇒ disponibles.
  if (isAuroraScreenTool(t)) return typeof window !== "undefined";
  const cfg = loadIntegrationConfig(t.integrationId, brainId);
  const desc = getIntegration(t.integrationId);
  const endpoint = (cfg.endpoint && cfg.endpoint.trim()) || desc?.defaultEndpoint || "";
  return cfg.enabled !== false && !!endpoint;
}

/** Lista las tools disponibles ahora mismo (por config). */
export function listAvailableAuroraTools(brainId?: string): AuroraIntegrationTool[] {
  return [...AURORA_INTEGRATION_TOOLS, ...AURORA_SCREEN_TOOLS].filter((t) =>
    isAuroraToolAvailable(t.name, brainId),
  );
}

/**
 * Ejecuta una tool de Aurora por nombre. Carga la config (global o por
 * cerebro). NUNCA lanza: devuelve IntegrationResult honesto.
 */
export async function runAuroraTool(
  name: string,
  input: any,
  opts?: { brainId?: string; cfg?: IntegrationConfig },
): Promise<IntegrationResult> {
  const t = getAuroraTool(name);
  if (!t) return { ok: false, error: `No existe la herramienta "${name}".` };
  // Tools de PANTALLA: ejecución local (DOM), sin config ni endpoint.
  if (isAuroraScreenTool(t)) {
    try {
      return await t.run(input && typeof input === "object" ? (input as Record<string, unknown>) : {});
    } catch {
      return { ok: false, error: `No pude completar "${name}".` };
    }
  }
  const cfg = opts?.cfg ?? loadIntegrationConfig(t.integrationId, opts?.brainId);
  return runIntegration(t.integrationId, t.actionId, input, cfg);
}

/** Fragmento para el system prompt: tools de integración + control de pantalla. */
export function auroraToolsPromptSection(brainId?: string): string {
  const tools = listAvailableAuroraTools(brainId);
  if (tools.length === 0) return "";
  const integraciones = tools.filter((t) => !isAuroraScreenTool(t));
  const pantalla = tools.filter((t) => isAuroraScreenTool(t));
  const parts: string[] = [];
  if (integraciones.length > 0) {
    parts.push(
      "HERRAMIENTAS EXTERNAS (integraciones configuradas): puedes invocar estas tools de servicios self-host del usuario.",
      ...integraciones.map((t) => `- ${t.name}: ${t.description}`),
    );
  }
  if (pantalla.length > 0) {
    parts.push(
      "CONTROL DE PANTALLA Y TAREAS EN SEGUNDO PLANO (la pantalla como agente interactivo + trabajo en curso): puedes ver y manejar la interfaz visible del usuario — enumerarla, pulsar, escribir, resaltar, leer, rellenar formularios, elegir opciones, copiar texto, ir a secciones y abrir apps — y registrar/consultar tareas que quedan en proceso mientras sigues hablando.",
      ...pantalla.map((t) => `- ${t.name}: ${t.description}`),
    );
  }
  return parts.join("\n");
}
