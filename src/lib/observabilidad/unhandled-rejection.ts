/**
 * Guardia global para rechazos de promesas no capturados (unhandledrejection).
 * Clasifica, registra y evita fallos silenciosos en runtime.
 */

export type CategoriaRechazo =
  | "lock_silencioso"
  | "error_red"
  | "cancelacion"
  | "no_manejado";

export interface RegistroRechazo {
  id: string;
  timestamp: number;
  categoria: CategoriaRechazo;
  mensaje: string;
  stack?: string;
}

const MAX_HISTORIAL = 50;
let historialRechazos: RegistroRechazo[] = [];
let listenerInstalado = false;

export function clasificarRechazo(reason: unknown): CategoriaRechazo {
  if (!reason) return "no_manejado";
  const r = reason as { name?: string; message?: string; code?: string };
  const msg = String(r.message ?? r ?? "");
  const name = String(r.name ?? "");

  if (name === "AbortError" && msg.includes("Lock broken by another request")) {
    return "lock_silencioso";
  }
  if (name === "AbortError" || msg.includes("aborted") || msg.includes("canceled")) {
    return "cancelacion";
  }
  if (
    name === "TypeError" && (msg.includes("fetch") || msg.includes("NetworkError") || msg.includes("Failed to fetch"))
  ) {
    return "error_red";
  }
  return "no_manejado";
}

export function obtenerRegistroRechazos(): readonly RegistroRechazo[] {
  return historialRechazos;
}

export function limpiarRegistroRechazos(): void {
  historialRechazos = [];
}

function generarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function registrarRechazo(categoria: CategoriaRechazo, reason: unknown): void {
  const r = reason as { message?: string; stack?: string } | undefined;
  const entrada: RegistroRechazo = {
    id: generarId(),
    timestamp: Date.now(),
    categoria,
    mensaje: String(r?.message ?? reason ?? "rechazo sin razón"),
    stack: r?.stack,
  };
  historialRechazos.push(entrada);
  if (historialRechazos.length > MAX_HISTORIAL) {
    historialRechazos.shift();
  }
}

export function registrarUnhandledRejectionHandler(): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  if (listenerInstalado) {
    return () => {};
  }
  listenerInstalado = true;

  function handler(event: PromiseRejectionEvent): void {
    const categoria = clasificarRechazo(event.reason);
    registrarRechazo(categoria, event.reason);

    // Si es un lock silencioso, prevenir propagación (comportamiento de src/utils/supabase/client.ts)
    if (categoria === "lock_silencioso") {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  }

  window.addEventListener("unhandledrejection", handler, true);

  return () => {
    window.removeEventListener("unhandledrejection", handler, true);
    listenerInstalado = false;
  };
}
