/**
 * capacidades-nodo.ts — Capacidades de cada nodo en la red mesh.
 * Anuncio, deliberación con BitNet, reflejo con Needle y resumen de red.
 */

export type MedioNodo = "navegador" | "mac" | "linux" | "android" | "ios" | "nube";

export interface InfoNeedle {
  version: string;
  adaptador?: string | null;
}

export interface InfoBitnet {
  tokPorS: number;
  ctx: number;
  ocupado: boolean;
}

export interface CapacidadesNodo {
  nodoId: string;
  medio: MedioNodo;
  needle: InfoNeedle | null;
  bitnet: InfoBitnet | null;
  jev: boolean;
  ramLibreMb: number;
  cpu: number;
  t: number;
}

export interface MensajeCapacidades {
  tema: "astraura/capacidades";
  origen: string;
  payload: CapacidadesNodo;
  t: number;
}

export interface ResumenRed {
  nodos: number;
  conNeedle: number;
  conBitnet: number;
  conJev: number;
  adaptadorMasNuevo: string | null;
}

export function anunciar(cap: CapacidadesNodo): MensajeCapacidades {
  return {
    tema: "astraura/capacidades",
    origen: cap.nodoId,
    payload: cap,
    t: cap.t,
  };
}

export function elegirDeliberador(nodos: CapacidadesNodo[], ahora: number): CapacidadesNodo | null {
  const candidatos = nodos.filter((n) => {
    if (!n.bitnet || n.bitnet.ocupado) return false;
    const diffMs = ahora - n.t;
    return diffMs >= 0 && diffMs < 60000;
  });

  if (candidatos.length === 0) return null;

  candidatos.sort((a, b) => {
    const diffTok = b.bitnet!.tokPorS - a.bitnet!.tokPorS;
    if (diffTok !== 0) return diffTok;
    const diffCpu = a.cpu - b.cpu;
    if (diffCpu !== 0) return diffCpu;
    return b.ramLibreMb - a.ramLibreMb;
  });

  return candidatos[0];
}

export function elegirReflejo(nodos: CapacidadesNodo[], miNodoId?: string): CapacidadesNodo | null {
  if (miNodoId) {
    const propio = nodos.find((n) => n.nodoId === miNodoId && n.needle !== null);
    if (propio) return propio;
  }

  const conNeedle = nodos.filter((n) => n.needle !== null);
  if (conNeedle.length === 0) return null;

  conNeedle.sort((a, b) => {
    const aNube = a.medio === "nube" ? 1 : 0;
    const bNube = b.medio === "nube" ? 1 : 0;
    if (aNube !== bNube) return aNube - bNube;
    const diffT = b.t - a.t;
    if (diffT !== 0) return diffT;
    return b.ramLibreMb - a.ramLibreMb;
  });

  return conNeedle[0];
}

export {
  NODOS_INFERENCIA_LOCAL_STORAGE,
  nodoConBase,
  resumenDisponibles,
  elegirNodo,
  type NodoInferenciaLocal,
  type OpcionesElegirNodo,
  type OpcionesResumenInferencia,
  type ResumenNodosInferencia,
  type TransporteInferencia,
} from "./inferencia-local";

export function resumenRed(nodos: CapacidadesNodo[]): ResumenRed {
  const conNeedle = nodos.filter((n) => n.needle !== null);
  const conBitnet = nodos.filter((n) => n.bitnet !== null);
  const conJev = nodos.filter((n) => n.jev);

  const conAdaptador = conNeedle.filter(
    (n) => typeof n.needle?.adaptador === "string" && n.needle.adaptador.trim() !== ""
  );

  conAdaptador.sort((a, b) => {
    const vComp = (b.needle?.version || "").localeCompare(a.needle?.version || "", undefined, { numeric: true });
    return vComp !== 0 ? vComp : b.t - a.t;
  });

  return {
    nodos: nodos.length,
    conNeedle: conNeedle.length,
    conBitnet: conBitnet.length,
    conJev: conJev.length,
    adaptadorMasNuevo: conAdaptador.length > 0 ? conAdaptador[0].needle!.adaptador! : null,
  };
}
