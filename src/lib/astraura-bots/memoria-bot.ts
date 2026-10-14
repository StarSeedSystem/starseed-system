// Memoria propia de cada bot (BOT1011Q, 2026-10-12 · astra-ura-bots.md §10).
//
// Cada bot guarda sus recuerdos con cuota autorregulada según el medio donde vive
// (web pequeño, PWA mediana, nativa mayor), olvida por relevancia × recencia sin
// tocar jamás lo fijado, y planifica la transferencia de recuerdos entre neuronas
// respetando el alcance: lo personal nunca sale de la cuenta, lo de grupo solo va
// a su grupo y lo público viaja libre.
//
// Módulo PURO: sin red, sin disco, sin reloj propio (todo entra por parámetro).

import type { FragmentoMemoria } from "@/lib/nucleo/alcance-memoria";
import type { Medio } from "./tipos";

/** Recuerdo de un bot: fragmento de memoria con peso, uso y fijación. */
export interface RecuerdoBot extends FragmentoMemoria {
  botId: string;
  /** Tamaño que ocupa, en bytes (se descuenta de la cuota del medio). */
  bytes: number;
  /** Cuántas veces se ha recuperado: alimenta la relevancia. */
  usos: number;
  /** Fijado por la persona o el propio bot: la regulación nunca lo olvida. */
  fijado?: boolean;
  /** Grupo al que pertenece el recuerdo cuando su alcance es `grupo`. */
  grupoId?: string;
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Cuota base de memoria por medio, en bytes. Editable con `cuotaPara(medio, factor)`. */
export const CUOTA_POR_MEDIO: Record<Medio, number> = {
  web: 5 * MB,
  pwa: 50 * MB,
  nativo: 500 * MB,
  servidor: 2 * GB,
  xr: 20 * MB,
};

/** Cuota efectiva de un medio amplificada (o reducida) por un factor editable. */
export function cuotaPara(medio: Medio, factor = 1): number {
  return Math.max(0, Math.round(CUOTA_POR_MEDIO[medio] * factor));
}

const DIA_MS = 24 * 60 * 60 * 1000;
/** Vida media de un recuerdo: a los 30 días su recencia vale la mitad. */
export const VIDA_MEDIA_MS = 30 * DIA_MS;

/**
 * Relevancia × recencia: más usos pesan más, y el tiempo decae con vida media
 * de 30 días. Un recuerdo del futuro cercano (reloj adelantado) cuenta como nuevo.
 */
export function puntuar(r: RecuerdoBot, ahora: number): number {
  const edad = Math.max(0, ahora - r.at);
  const recencia = Math.pow(0.5, edad / VIDA_MEDIA_MS);
  return (1 + r.usos) * recencia;
}

export interface ResultadoRegulacion {
  conservar: RecuerdoBot[];
  olvidar: RecuerdoBot[];
}

/**
 * Hace caber los recuerdos en la cuota olvidando los de menor puntuación.
 * Los fijados se conservan siempre; si ellos solos ya exceden la cuota, se
 * quedan todos y la lista de olvidados es el resto completo. Determinista:
 * a igual puntuación se olvida primero el de id menor.
 */
export function regular(
  recuerdos: RecuerdoBot[],
  cuotaBytes: number,
  ahora: number,
): ResultadoRegulacion {
  const fijados = recuerdos.filter((r) => r.fijado === true);
  const sueltos = recuerdos
    .filter((r) => r.fijado !== true)
    .map((r, i) => ({ r, i, puntos: puntuar(r, ahora) }))
    .sort((a, b) => a.puntos - b.puntos || a.r.id.localeCompare(b.r.id) || a.i - b.i);
  const total = recuerdos.reduce((suma, r) => suma + r.bytes, 0);
  let exceso = total - Math.max(0, cuotaBytes);
  const olvidar: RecuerdoBot[] = [];
  const muertos = new Set<string>();
  for (const { r } of sueltos) {
    if (exceso <= 0) break;
    olvidar.push(r);
    muertos.add(r.id);
    exceso -= r.bytes;
  }
  return { conservar: recuerdos.filter((r) => !muertos.has(r.id)), olvidar };
}

/** Neurona origen o destino de una transferencia de recuerdos. */
export interface Neurona {
  neurona: string;
  cuentaId: string;
}

export interface DestinoTransferencia extends Neurona {
  tipo: "propia" | "grupo" | "servidor-grupo";
  grupoId?: string;
}

export interface TramoTransferencia {
  destino: DestinoTransferencia;
  ids: string[];
}

/** Reglas de alcance para transferir un recuerdo a un destino concreto. */
function puedeIrA(r: RecuerdoBot, origen: Neurona, destino: DestinoTransferencia): boolean {
  if (destino.neurona === origen.neurona && destino.cuentaId === origen.cuentaId) return false;
  switch (r.alcance) {
    case "personal":
    case "perfil":
      // Lo personal y lo del perfil solo viajan a neuronas propias de la MISMA cuenta.
      return destino.tipo === "propia" && destino.cuentaId === origen.cuentaId;
    case "grupo":
      // Lo del grupo solo va a las neuronas de ese grupo.
      return (
        destino.tipo !== "propia" &&
        typeof r.grupoId === "string" &&
        destino.grupoId === r.grupoId
      );
    case "publica":
      return true;
  }
}

/**
 * Plan puro de transferencia entre neuronas: qué recuerdos van a cada destino.
 * Nada se duplica dos veces al mismo destino, y el resultado es determinista:
 * recuerdos y destinos se recorren en su orden de entrada. Sin destinos o sin
 * recuerdos compatibles, el plan es vacío.
 */
export function planTransferencia(
  recuerdos: RecuerdoBot[],
  origen: Neurona,
  destinos: DestinoTransferencia[],
): TramoTransferencia[] {
  const porDestino = new Map<DestinoTransferencia, string[]>();
  const enviados = new Set<string>();
  for (const r of recuerdos) {
    for (const d of destinos) {
      const clave = `${d.cuentaId}|${d.neurona}|${d.grupoId ?? ""}|${r.id}`;
      if (enviados.has(clave) || !puedeIrA(r, origen, d)) continue;
      enviados.add(clave);
      const ids = porDestino.get(d) ?? [];
      ids.push(r.id);
      porDestino.set(d, ids);
    }
  }
  return destinos.flatMap((d) => {
    const ids = porDestino.get(d) ?? [];
    return ids.length > 0 ? [{ destino: d, ids }] : [];
  });
}
