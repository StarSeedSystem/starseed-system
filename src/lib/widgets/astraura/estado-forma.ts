import { type IdForma, PALETAS, FIBONACCI } from "@/lib/protomolecula/orbe4d/coreografia";

export type EstadoAsistente = "calma" | "escuchando" | "pensando" | "hablando" | "error";

export function formaDeEstado(e: EstadoAsistente): IdForma {
  switch (e) {
    case "calma":
      return "icosaedro";
    case "escuchando":
      return "merkaba";
    case "pensando":
      return "teseracto";
    case "hablando":
      return "jitterbug";
    case "error":
      return "semilla";
  }
}

export function paletaDeEstado(e: EstadoAsistente): keyof typeof PALETAS {
  return e === "error" ? "trinity" : "astraura";
}

export function ritmoDeEstado(e: EstadoAsistente): { giroS: number; respiraS: number } {
  switch (e) {
    case "calma":
      return { giroS: 55, respiraS: 13 };
    case "escuchando":
      return { giroS: 21, respiraS: 8 };
    case "pensando":
      return { giroS: 13, respiraS: 5 };
    case "hablando":
      return { giroS: 21, respiraS: 3 };
    case "error":
      return { giroS: 0, respiraS: 21 };
  }
}

export interface PuenteEstado {
  speaking?: boolean;
  listening?: boolean;
  actionStatus?: string;
  error?: boolean;
}

export function derivarEstado(
  s: PuenteEstado | null,
  ultimaMs: number | null,
  ahoraMs: number
): EstadoAsistente {
  if (s?.error) return "error";
  if (s?.speaking) return "hablando";
  if (s?.listening) return "escuchando";
  if (s?.actionStatus && /error|fall(o|ó)|fail/i.test(s.actionStatus)) return "error";
  if (s?.actionStatus && /pens|procesa|think/i.test(s.actionStatus)) return "pensando";
  if (ultimaMs !== null && ahoraMs - ultimaMs < 60_000) return "hablando";
  return "calma";
}

export function textoDeEstado(e: EstadoAsistente): string {
  switch (e) {
    case "calma":
      return "En calma";
    case "escuchando":
      return "Escuchando…";
    case "pensando":
      return "Pensando…";
    case "hablando":
      return "Hablando";
    case "error":
      return "Algo falló";
  }
}

export function frasePantallaLectora(e: EstadoAsistente): string {
  switch (e) {
    case "calma":
      return "Astraura está en calma";
    case "escuchando":
      return "Astraura te está escuchando";
    case "pensando":
      return "Astraura está pensando";
    case "hablando":
      return "Astraura está hablando";
    case "error":
      return "Astraura tuvo un problema; puedes abrir el chat para verlo";
  }
}