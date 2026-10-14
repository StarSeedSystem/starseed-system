export interface NeuronaCandidata {
  id: string;
  online: boolean;
  usoReciente: number;
  elegida?: boolean;
}

export function elegirCanaria(ns: readonly NeuronaCandidata[]): string | null {
  // Paso 1: buscar una candidata marcada como elegida y que esté online
  const elegidaYOnline = ns.find(n => n.elegida === true && n.online === true);
  if (elegidaYOnline) {
    return elegidaYOnline.id;
  }

  // Paso 2: filtrar solo las que están online
  const online = ns.filter(n => n.online === true);
  if (online.length === 0) {
    return null;
  }

  // Paso 3: encontrar la que tiene el mayor usoReciente
  let maxUso = -1;
  const candidatos: NeuronaCandidata[] = [];
  for (const n of online) {
    if (n.usoReciente > maxUso) {
      maxUso = n.usoReciente;
      candidatos.length = 0; // reset
      candidatos.push(n);
    } else if (n.usoReciente === maxUso) {
      candidatos.push(n);
    }
  }

  // Paso 4: en caso de empate, elegir la que tenga el id menor (lexicográfico)
  candidatos.sort((a, b) => a.id.localeCompare(b.id));
  return candidatos[0].id;
}

export interface ResultadoHumo {
  paginaCarga: boolean;
  servicios: Record<string, boolean>;
}

export function evaluarHumo(r: ResultadoHumo): { ok: boolean; fallos: string[] } {
  const fallos: string[] = [];
  if (!r.paginaCarga) {
    fallos.push("paginaCarga");
  }
  for (const [servicio, estado] of Object.entries(r.servicios)) {
    if (!estado) {
      fallos.push(servicio);
    }
  }
  return {
    ok: fallos.length === 0,
    fallos,
  };
}

export type EstadoDespliegue =
  | "pendiente"
  | "canaria"
  | "propagando"
  | "hecho"
  | "revirtiendo"
  | "revertido";

export type EventoDespliegue =
  | { tipo: "aplicada-en-canaria" }
  | { tipo: "humo"; ok: boolean }
  | { tipo: "propagada" }
  | { tipo: "revertida" };

export function siguienteEstado(e: EstadoDespliegue, ev: EventoDespliegue): EstadoDespliegue {
  switch (e) {
    case "pendiente":
      if (ev.tipo === "aplicada-en-canaria") {
        return "canaria";
      }
      break;
    case "canaria":
      if (ev.tipo === "humo") {
        if (ev.ok) {
          return "propagando";
        } else {
          return "revirtiendo";
        }
      }
      break;
    case "propagando":
      if (ev.tipo === "propagada") {
        return "hecho";
      }
      break;
    case "revirtiendo":
      if (ev.tipo === "revertida") {
        return "revertido";
      }
      break;
    default:
      // For states "hecho" and "revertido", no transitions defined, so return same state.
      // Also for any other unhandled event in the above states, we return the same state.
      break;
  }
  // If no transition matched, return the same state.
  return e;
}