import type { PermisoDispositivo } from "@/lib/aurora/senses/request-permission";

export type EstadoPermiso = "concedido" | "denegado" | "preguntar" | "no-disponible";

export type PermisoOS = PermisoDispositivo | "pantalla" | "bluetooth" | "serie";

export interface ResultadoPermisoOS {
  id: PermisoOS;
  estado: EstadoPermiso;
  motivo?: string;
}

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
  // Mensaje específico de Firefox que NO indica denegación explícita del usuario
  const firefoxNoDenegado =
    "the request is not allowed by the user agent or the platform in the current context.";
  if (m === firefoxNoDenegado) return "preguntar";

  const denegadoPatterns = ["denied", "denegad", "bloquead", "not allowed", "permission dismissed"];
  if (denegadoPatterns.some((p) => m.includes(p))) return "denegado";

  return "preguntar";
}