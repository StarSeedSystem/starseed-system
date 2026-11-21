"use client";

export type EstadoPermiso = "concedido" | "denegado" | "preguntar" | "no-disponible";

export type PermisoDispositivo =
  | "microfono"
  | "camara"
  | "ubicacion"
  | "notificaciones"
  | "almacenamiento"
  | "movimiento"
  | "archivos";

export type PermisoOS = PermisoDispositivo | "pantalla" | "bluetooth" | "serie";

export interface ResultadoPermisoOS {
  id: PermisoOS;
  estado: EstadoPermiso;
  motivo?: string;
}

export interface ResultadoPermiso {
  permiso: PermisoDispositivo;
  soportado: boolean;
  concedido: boolean;
  motivo?: string;
  nombreError?: string;
}

export const EVENTO_PERMISO = "starseed:permiso";

export interface EntornoPermisos {
  visor: string | null;
  origenSeguro: boolean;
  navegador: "chrome" | "edge" | "safari" | "firefox" | "otro";
  so: "macos" | "windows" | "linux" | "android" | "ios" | "otro";
}

export type EstadoPermisoDispositivo = "granted" | "denied" | "prompt" | "unsupported";

export function normalizarEstado(viejo: unknown): EstadoPermiso {
  if (typeof viejo !== "string") return "no-disponible";
  switch (viejo) {
    case "granted":
      return "concedido";
    case "denied":
      return "denegado";
    case "prompt":
    case "default":
      return "preguntar";
    case "unsupported":
    case "error":
      return "no-disponible";
    case "concedido":
    case "denegado":
    case "preguntar":
    case "no-disponible":
      return viejo;
    default:
      return "no-disponible";
  }
}

export function estadoDeResultado(r: {
  soportado: boolean;
  concedido: boolean;
  motivo?: string;
  nombreError?: string;
}): EstadoPermiso {
  if (!r.soportado) return "no-disponible";
  if (r.concedido) return "concedido";

  const errorNames = ["NotAllowedError", "SecurityError", "PermissionDeniedError"];
  if (r.nombreError && errorNames.includes(r.nombreError)) return "denegado";

  const m = (r.motivo ?? "").toLowerCase();
  const firefoxNoDenegado =
    "the request is not allowed by the user agent or the platform in the current context.";
  if (m === firefoxNoDenegado) return "preguntar";

  const denegadoPatterns = ["denied", "denegad", "bloquead", "not allowed", "permission dismissed"];
  if (denegadoPatterns.some((p) => m.includes(p))) return "denegado";

  return "preguntar";
}