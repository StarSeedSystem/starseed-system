// Titanio (Ti⁴⁺) en la retícula amorfa de sílice: routers mesh como titanio (§1 de malla-cristalina-sio2.md)
// Módulo puro: sin node:*, Supabase, ni window.

import type { NeuronaReticula, Tesela, Medio, SenalMedida } from "./tipos";

export const COORDINACION_TITANIO = 6;
export const MARGEN_TITANIO = 0.30;

/**
 * Coordinación del titanio en la retícula (§8.1 «titanio portátil»): 6 con
 * corriente, batería desconocida o ≥ 50 %; 4 entre 20 y 50 %; 3 por debajo
 * del 20 %. Mismas reglas que el titanio portátil de la red, sin depender
 * del módulo de red (el cristal no depende de la red).
 */
export function coordinacionTitanio(n: NeuronaReticula): number {
  if (n.capacidad.cargando || n.capacidad.bateriaPct === null) return COORDINACION_TITANIO;
  if (n.capacidad.bateriaPct >= 50) return COORDINACION_TITANIO;
  if (n.capacidad.bateriaPct >= 20) return 4;
  return 3;
}

export function esTitanio(n: NeuronaReticula): boolean {
  return n.esRouter === true;
}

/** Amortigua la temperatura por la presencia de routers titanio en los vecinos. */
export function temperaturaAmortiguada(
  t: number,
  vecinosTi: number,
  vecinos: number
): number {
  const factor = 1 - 0.6 * vecinosTi / Math.max(1, vecinos);
  let amort = t * factor;
  // Un titanio mismo tiene como mucho 0.2 (fija la red, temperatura baja/vítrea)
  return Math.min(0.2, amort);
}

/** Un puente con al menos un extremo titanio lleva el margen máximo. */
export function margenDePuente(
  margenBase: number,
  aEsTi: boolean,
  bEsTi: boolean
): number {
  if (aEsTi || bEsTi) return MARGEN_TITANIO;
  return margenBase;
}

/** Entre dos Ti por 'wifi-mesh' resta 0.15 al coste; si no, 0. */
export function bonusTroncal(
  medio: Medio,
  aEsTi: boolean,
  bEsTi: boolean
): number {
  if (medio === "wifi-mesh" && aEsTi && bEsTi) return -0.15;
  return 0;
}

export interface TroncalesRouter {
  routerId: string;
  cuenta: string;
  adoptadoPor: string;
  troncales: Array<{
    a: string;
    b: string;
    rssiDbm?: number;
    anchoBandaKbps?: number;
    frecuenciaMhz?: number;
    anchoCanalMhz?: number;
  }>;
  reloj: number;
  ahora: number;
}

/** Crea la tesela de un router (titanio) adoptado, sin firma (la firma la pone la neurona adoptante). */
export function teselaDeRouter(e: TroncalesRouter): Tesela {
  const neurona: NeuronaReticula = {
    id: e.routerId,
    cuenta: e.cuenta,
    esRouter: true,
    capacidad: {
      ramGb: 0.25,
      bateriaPct: null,
      cargando: true,
    },
    medios: ["wifi-mesh"],
  };
  const senales: SenalMedida[] = [];
  for (const troncal of e.troncales) {
    if (troncal.a === e.routerId || troncal.b === e.routerId) {
      const otro = troncal.a === e.routerId ? troncal.b : troncal.a;
      const senal: SenalMedida = {
        de: e.routerId,
        a: otro,
        medio: "wifi-mesh",
        vistaEn: e.ahora,
        ...(typeof troncal.rssiDbm === "number" ? { rssiDbm: troncal.rssiDbm } : {}),
        ...(typeof troncal.anchoBandaKbps === "number" ? { anchoBandaKbps: troncal.anchoBandaKbps } : {}),
        ...(typeof troncal.frecuenciaMhz === "number" ? { frecuenciaMhz: troncal.frecuenciaMhz } : {}),
        ...(typeof troncal.anchoCanalMhz === "number" ? { anchoCanalMhz: troncal.anchoCanalMhz } : {}),
      };
      senales.push(senal);
    }
  }
  return {
    origen: e.adoptadoPor,
    reloj: e.reloj,
    neurona,
    senales,
  };
}
