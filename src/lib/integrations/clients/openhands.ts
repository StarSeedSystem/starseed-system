// ════════════════════════════════════════════════════════════════
// Cliente del conector OpenHands — usa el cliente puro OHS1020A
// ----------------------------------------------------------------
// Sustituye al cliente genérico de «tarea» para OpenHands: en lugar de
// adivinar rutas con `extra.path`, llama solo a las rutas VERIFICADAS
// del Agent Server 1.7.1 (docs/referencias/
// openhands-agent-server-1.7.1-openapi.json) a través de
// `src/lib/agentes/openhands-servidor.ts`.
//
// Módulo puro: `fetch` inyectado, sin `node:*`, sin `any`, nunca lanza
// (devuelve IntegrationResult). La clave del modelo la pasa quien
// llama y el cliente puro ya la tapa en los errores.
// ════════════════════════════════════════════════════════════════

import {
  crearConversacion,
  ejecutar,
  ErrorOpenHands,
  salud,
  type FetchLike,
} from "@/lib/agentes/openhands-servidor";
import type { IntegrationConfig, IntegrationResult } from "../types";

interface EntradaTarea {
  task?: unknown;
  tarea?: unknown;
  model?: unknown;
  modelo?: unknown;
  model_id?: unknown;
  working_dir?: unknown;
  directorio?: unknown;
  workspace?: unknown;
}

/** Primer campo de texto presente en la entrada, o "". */
function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Envuelve las acciones del cliente puro en un resultado honesto. */
async function envolver<T>(accion: () => Promise<T>): Promise<IntegrationResult<T>> {
  try {
    return { ok: true, data: await accion() };
  } catch (e: unknown) {
    const mensaje = e instanceof ErrorOpenHands
      ? e.message
      : "No se pudo contactar con el Agent Server de OpenHands.";
    return { ok: false, error: mensaje };
  }
}

/** Ping al Agent Server: GET /health vía el cliente verificado. */
export async function health(
  cfg: IntegrationConfig,
  f: FetchLike = (url, init) => fetch(url, init),
): Promise<IntegrationResult<{ sano: boolean; estado: string }>> {
  if (!cfg.endpoint?.trim()) return { ok: false, error: "no configurado" };
  return await envolver(() => salud({ baseUrl: cfg.endpoint!, fetch: f }));
}

/** Acción «run-task»: crea la conversación, manda la tarea y la arranca. */
export async function runTask(
  cfg: IntegrationConfig,
  input: unknown,
  f: FetchLike = (url, init) => fetch(url, init),
): Promise<IntegrationResult<{ id: string; texto: string }>> {
  if (!cfg.endpoint?.trim()) return { ok: false, error: "no configurado" };
  const e: EntradaTarea = (input && typeof input === "object" ? input : {}) as EntradaTarea;
  const tarea = texto(e.task) || texto(e.tarea) || (typeof input === "string" ? input : "");
  if (!tarea.trim()) return { ok: false, error: "Indica la tarea a ejecutar." };
  const modelo = texto(e.model) || texto(e.modelo) || texto(e.model_id) || texto(cfg.extra?.modelo);
  if (!modelo.trim()) {
    return { ok: false, error: "Falta el modelo del agente (campo «modelo» de la entrada o de extra)." };
  }
  const directorio = texto(e.working_dir) || texto(e.directorio) || texto(e.workspace)
    || texto(cfg.extra?.directorioTrabajo) || "/workspace";
  const opciones = { baseUrl: cfg.endpoint!, fetch: f };
  return await envolver(async () => {
    const conv = await crearConversacion({
      ...opciones,
      modelo,
      apiKey: cfg.apiKey,
      directorioTrabajo: directorio,
      // Por defecto el agente NO actúa sin aprobación humana.
      politica: "AlwaysConfirm",
      mensajeInicial: tarea,
    });
    await ejecutar(conv.id, opciones);
    return {
      id: conv.id,
      texto: `Conversación ${conv.id} creada y en marcha; el agente pedirá confirmación antes de cada acción.`,
    };
  });
}
