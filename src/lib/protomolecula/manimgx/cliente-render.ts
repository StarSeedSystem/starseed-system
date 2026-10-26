// ManimGX · Cliente que habla con el Worker por mensajes.
// Sin WebGPU se devuelve error honesto; import dinámico por CDN.

import type { EscenaManim, ResultadoRender } from "./worker-render";

export interface ConfigCliente {
  urlWorker?: string | URL;
  topeTiempoMs?: number;
  urlCdnManimgx?: string;
}

/** Error honesto cuando el medio no tiene WebGPU. */
export class ErrorSinWebGpu extends Error {
  constructor() {
    super("este medio no tiene WebGPU");
    this.name = "ErrorSinWebGpu";
  }
}

export function comprobarWebGpu(): boolean {
  try {
    return typeof (globalThis as unknown as Record<string, unknown>)["navigator"] === "object" &&
      typeof (globalThis.navigator as { gpu?: unknown }).gpu !== "undefined";
  } catch {
    return false;
  }
}

export async function renderizarEscena(
  escena: EscenaManim,
  config?: ConfigCliente,
  abort?: AbortSignal,
): Promise<ResultadoRender> {
  if (!comprobarWebGpu()) {
    return {
      escena: escena.nombre,
      bytes: null,
      cancelado: false,
      error: "este medio no tiene WebGPU",
    };
  }
  return {
    escena: escena.nombre,
    bytes: null,
    cancelado: abort?.aborted ?? false,
    error: "no implementado: el paquete npm manimgx permite render en Worker (runtime.worker), pero esta función aún no conecta el protocolo ToDirector/FromDirector",
  };
}
