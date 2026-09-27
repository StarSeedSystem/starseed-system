/**
 * Radar remoto — almacén puro en memoria para resúmenes de otras neuronas.
 * Sin red; usable desde el motor y desde React.
 * Un resumen por neurona, máx. 16; el más nuevo gana; caducan a los 5 min.
 */
import type { ResumenRadar } from "./radar-por-malla";
import { RADAR_RESUMEN_TTL_MS } from "./radar-por-malla";

const MAX_NEURONAS = 16;
const TTL_MS = RADAR_RESUMEN_TTL_MS;

interface Entrada {
  resumen: ResumenRadar;
  via: "p2p" | "federacion";
}

const almacen: Map<string, Entrada> = new Map();
let local: ResumenRadar | null = null;
const suscriptores: Set<() => void> = new Set();

function notify() {
  for (const cb of suscriptores) cb();
}

export function recibirResumen(r: ResumenRadar, via: "p2p" | "federacion"): void {
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
  notify();
}

export function resumenesRemotos(ahora: number = Date.now()): ResumenRadar[] {
  const vigentes: ResumenRadar[] = [];
  for (const [nid, entrada] of almacen) {
    const edad = ahora - entrada.resumen.at;
    if (edad < 0 || edad > TTL_MS) {
      almacen.delete(nid);
    } else {
      vigentes.push(entrada.resumen);
    }
  }
  return vigentes.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export function viaDe(neuronId: string): "p2p" | "federacion" | null {
  return almacen.get(neuronId)?.via ?? null;
}

export function setResumenLocal(r: ResumenRadar): void {
  local = r;
  notify();
}

export function getResumenLocal(): ResumenRadar | null {
  return local;
}

export function subscribeRadarRemoto(cb: () => void): () => void {
  suscriptores.add(cb);
  return () => suscriptores.delete(cb);
}

export function useRadarRemoto(): ResumenRadar[] {
  return resumenesRemotos();
}

export function limpiarRadarRemoto(): void {
  almacen.clear();
  local = null;
  notify();
}