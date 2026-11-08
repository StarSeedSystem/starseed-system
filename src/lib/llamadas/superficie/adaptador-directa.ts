/**
 * Adaptador PURO: la llamada directa por enlace local (`llamada-directa.ts`) → la vista de la superficie.
 * Solo traduce; lo que el motor directo no tiene (espera, cambio de cámara…) se queda sin acción y la
 * superficie lo muestra desactivado con su motivo.
 */
import type { EstadoLlamadaDirecta } from "@/lib/malla/llamada-directa";
import type { EstadoSuperficie, FinSuperficie, TipoSuperficie } from "./maquina";
import type { VistaLlamada } from "./vista";

export function estadoDeFase(fase: EstadoLlamadaDirecta["fase"]): EstadoSuperficie {
  switch (fase) {
    case "inactiva":
      return "inactiva";
    case "llamando":
      return "saliente";
    case "entrante":
      return "entrante";
    case "en-curso":
      return "conectada";
    case "terminada":
      return "terminada";
  }
}

export function tipoDeDirecta(e: Pick<EstadoLlamadaDirecta, "video" | "pantalla">): TipoSuperficie {
  return e.pantalla ? "pantalla" : e.video ? "video" : "voz";
}

export function finDeDirecta(f: EstadoLlamadaDirecta["fin"]): FinSuperficie | null {
  return f === null ? null : f;
}

export function vistaDeDirecta(e: EstadoLlamadaDirecta, extra?: { medio?: string | null }): VistaLlamada {
  const tieneCamara = !!e.local?.getVideoTracks().some((t) => t.enabled && t.readyState === "live") && e.video && !e.pantalla;
  return {
    estado: estadoDeFase(e.fase),
    tipo: tipoDeDirecta(e),
    nombre: e.nombre || "Neurona",
    yo: "yo",
    desde: e.desde,
    fin: finDeDirecta(e.fin),
    medioUsado: extra?.medio ?? (e.enlaceId ? "enlace local" : null),
    motivo: e.motivo,
    local: e.local,
    remoto: e.remoto,
    micro: e.micro,
    camara: tieneCamara,
    compartiendoPantalla: e.pantalla && !e.entrante,
  };
}
