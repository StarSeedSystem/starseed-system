/**
 * Radar remoto — almacén puro en memoria para resúmenes de otras neuronas.
 * Sin red; usable desde el motor y desde React (useSyncExternalStore).
 * Un resumen por neurona, máx. 16; el más nuevo gana; caducan a los 5 min.
 */
import { useSyncExternalStore } from "react";
import type { ResumenRadar } from "./radar-por-malla";
import { RADAR_RESUMEN_TTL_MS } from "./radar-por-malla";

const MAX_NEURONAS = 16;
const TTL_MS = RADAR_RESUMEN_TTL_MS;

export type ViaRadar = "p2p" | "federacion";

interface Entrada {
  resumen: ResumenRadar;
  via: ViaRadar;
}

const almacen: Map<string, Entrada> = new Map();
let local: ResumenRadar | null = null;
const suscriptores: Set<() => void> = new Set();
let instantanea: ResumenRadar[] = [];

function notificar(): void {
  for (const cb of suscriptores) cb();
}

function purgar(ahora: number): boolean {
  let cambio = false;
  for (const [nid, entrada] of almacen) {
    const edad = ahora - entrada.resumen.at;
    if (edad < 0 || edad > TTL_MS) {
      almacen.delete(nid);
      cambio = true;
    }
  }
  return cambio;
}

/** Guarda el resumen de una neurona; el más nuevo gana y hay tope de neuronas. */
export function recibirResumen(r: ResumenRadar, via: ViaRadar): void {
  const existente = almacen.get(r.neuronId);
  if (existente && existente.resumen.at > r.at) return;
  if (almacen.size >= MAX_NEURONAS && !existente) {
    let masViejo = "";
    let edadMasVieja = -Infinity;
    for (const [nid, entrada] of almacen) {
      const edad = r.at - entrada.resumen.at;
      if (edad > edadMasVieja) {
        edadMasVieja = edad;
        masViejo = nid;
      }
    }
    if (masViejo) almacen.delete(masViejo);
  }
  almacen.set(r.neuronId, { resumen: r, via });
  notificar();
}

/** Resúmenes vigentes (< 5 min), ordenados por nombre. */
export function resumenesRemotos(ahora: number = Date.now()): ResumenRadar[] {
  purgar(ahora);
  return Array.from(almacen.values())
    .map((e) => e.resumen)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Vía por la que llegó el último resumen de esa neurona. */
export function viaDe(neuronId: string): ViaRadar | null {
  return almacen.get(neuronId)?.via ?? null;
}

/** Último resumen de ESTA neurona (lo usará la federación). */
export function setResumenLocal(r: ResumenRadar): void {
  local = r;
  notificar();
}

export function getResumenLocal(): ResumenRadar | null {
  return local;
}

/** Suscripción al cambio del almacén; devuelve el desuscriptor. */
export function suscribirRadarRemoto(cb: () => void): () => void {
  suscriptores.add(cb);
  return () => {
    suscriptores.delete(cb);
  };
}

function instantaneaRemota(): ResumenRadar[] {
  // Instantánea estable: solo se recalcula si el contenido vigente cambió.
  purgar(Date.now());
  const actuales = Array.from(almacen.values()).map((e) => e.resumen);
  const mismaLista =
    actuales.length === instantanea.length &&
    actuales.every((r, i) => r === instantanea[i]);
  if (!mismaLista) {
    instantanea = actuales.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }
  return instantanea;
}

/** Hook React: resúmenes remotos vigentes, con referencia estable. */
export function useRadarRemoto(): ResumenRadar[] {
  return useSyncExternalStore(suscribirRadarRemoto, instantaneaRemota, instantaneaRemota);
}

/** Vacía el almacén (para pruebas). */
export function limpiarRadarRemoto(): void {
  almacen.clear();
  local = null;
  instantanea = [];
  notificar();
}
