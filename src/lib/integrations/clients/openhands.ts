// ════════════════════════════════════════════════════════════════
// Cliente del conector OpenHands — OHS1020Ab
// ----------------------------------------------------------------
// Conecta el cliente puro y verificado (src/lib/agentes/openhands-servidor.ts,
// OHS1020A) con el runner de integraciones SUSTITUYENDO el POST genérico de
// adivinanza de rutas (clients/generic-task.ts) para el conector «openhands»:
// aquí solo se usan rutas y campos del OpenAPI real 1.7.1. La clave del
// modelo la pasa quien llama (extra: modelo/apiKey) y el cliente la tapa
// en los errores. Sin `node:*` ni importación de procesos: cliente puro con
// `fetch` inyectable (por defecto el global, como el patrón de Trilium).
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import {
  crearConversacion,
  ErrorOpenHands,
  ejecutar,
  salud,
  type FetchLike,
  type OpcionesOpenHands,
} from "../../agentes/openhands-servidor";

function opciones(c: IntegrationConfig, f?: FetchLike): OpcionesOpenHands {
  const fReal: FetchLike = f ?? ((url, init) => fetch(url, init));
  return { baseUrl: c.endpoint ?? "", fetch: fReal };
}

/** run-task: crea la conversación con la tarea y la arranca (política AlwaysConfirm). */
export async function runTask(c: IntegrationConfig, input: unknown, f?: FetchLike): Promise<IntegrationResult> {
  const entrada = (input ?? {}) as Record<string, unknown>;
  const tarea = typeof input === "string" ? input : String(entrada.task ?? "");
  const modelo = String(entrada.modelo ?? c.extra?.modelo ?? "");
  const directorio = String(entrada.directorioTrabajo ?? c.extra?.directorioTrabajo ?? "");
  if (!tarea.trim()) return { ok: false, error: "Indica una tarea o instrucción a ejecutar." };
  if (!modelo) return { ok: false, error: "Indica el modelo del agente (en la entrada o en extra.modelo)." };
  if (!directorio) return { ok: false, error: "Indica el directorio de trabajo del sandbox (directorioTrabajo)." };
  const op = opciones(c, f);
  try {
    const conv = await crearConversacion({
      ...op,
      modelo,
      apiKey: c.apiKey,
      directorioTrabajo: directorio,
      mensajeInicial: tarea,
    });
    await ejecutar(conv.id, op);
    return { ok: true, data: { text: `Conversación creada y en marcha: ${conv.id}.`, raw: conv } };
  } catch (e) {
    return { ok: false, error: e instanceof ErrorOpenHands ? e.message : "No se pudo contactar el Agent Server de OpenHands." };
  }
}

/** Salud: GET /health del Agent Server. */
export async function health(c: IntegrationConfig, f?: FetchLike): Promise<IntegrationResult> {
  try {
    const r = await salud(opciones(c, f));
    return { ok: true, data: { text: r.estado, raw: r } };
  } catch (e) {
    return { ok: false, error: e instanceof ErrorOpenHands ? e.message : "No se pudo contactar el Agent Server de OpenHands." };
  }
}
