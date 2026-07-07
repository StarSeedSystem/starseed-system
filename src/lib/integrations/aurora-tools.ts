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
type ContentActionsModule = typeof import("@/lib/aurora/generate/content-actions");

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
    const mod = await import("@/lib/aurora/generate/content-actions");
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
type ServiceGenerationModule = typeof import("@/lib/aurora/generate/service-generation");

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
    const mod = await import("@/lib/aurora/generate/service-generation");
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
type UserContextModule = typeof import("@/ai/astraura/user-context");

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
    const mod = await import("@/ai/astraura/user-context");
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

// Índice por nombre para O(1) — integraciones + control de pantalla + generación + contexto.
const TOOL_INDEX: Record<string, AuroraIntegrationTool> = Object.fromEntries(
  [...AURORA_INTEGRATION_TOOLS, ...AURORA_SCREEN_TOOLS, ...AURORA_GENERATE_TOOLS, ...AURORA_CONTEXT_TOOLS].map((t) => [t.name, t]),
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
  return [...AURORA_INTEGRATION_TOOLS, ...AURORA_SCREEN_TOOLS, ...AURORA_GENERATE_TOOLS, ...AURORA_CONTEXT_TOOLS].filter((t) =>
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
  web_search: ["scrape_url", "buscar_web"],
  scrape_url: ["crawl_url", "buscar_web"],
  crawl_url: ["scrape_url", "buscar_web"],
};

/** Adapta el input de una tool a la forma que espera una alternativa distinta. */
function adaptInputForAlternate(altName: string, input: unknown): Record<string, unknown> {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const term = pickInput(raw, "q", "consulta", "query", "texto", "text", "url", "urls");
  if (altName === "buscar_web") return { consulta: term ?? raw };
  if (altName === "crawl_url" || altName === "scrape_url") return { url: term ?? raw };
  if (altName === "web_search") return { q: term ?? raw };
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
  // Tools de PANTALLA: ejecución local (DOM), sin config ni endpoint.
  if (isAuroraScreenTool(t)) {
    try {
      return await t.run(input && typeof input === "object" ? (input as Record<string, unknown>) : {});
    } catch {
      return { ok: false, error: `No pude completar "${name}".` };
    }
  }
  const cfg = opts?.cfg ?? loadIntegrationConfig(t.integrationId, opts?.brainId);
  const res = await runIntegration(t.integrationId, t.actionId, input, cfg);
  if (res.ok) return res;

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

/** Fragmento para el system prompt: tools de integración + control de pantalla + generación + contexto. */
export function auroraToolsPromptSection(brainId?: string): string {
  const tools = listAvailableAuroraTools(brainId);
  if (tools.length === 0) return "";
  const integraciones = tools.filter((t) => !isAuroraScreenTool(t));
  // Las tools locales (kind:"screen") se separan en TRES familias: control de
  // pantalla/tareas · generar/usar contenido · contexto del usuario/red, cada
  // una con su propia cabecera.
  const contenido = tools.filter((t) => isAuroraScreenTool(t) && isGenerateTool(t));
  const contexto = tools.filter((t) => isAuroraScreenTool(t) && isContextTool(t));
  const pantalla = tools.filter((t) => isAuroraScreenTool(t) && !isGenerateTool(t) && !isContextTool(t));
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
  return parts.join("\n");
}
