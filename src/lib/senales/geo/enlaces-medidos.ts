/**
 * enlaces-medidos — los enlaces directos CON medida real entre este aparato y otra neurona de la cuenta (MAP1114D).
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * Salen de los enlaces abiertos que ya lista el transporte (`enlacesDisponibles()`): su ida y vuelta (`rttMs`) y su
 * capacidad (`capacidadKbps`, la de «l2cap-kbps» para Bluetooth). Un enlace sin ninguna de las dos medidas no se
 * dibuja: no hay nada que enseñar. La hora es la de la lectura de esa medida por este aparato.
 * Puro: sin React, sin red, sin `node:*`.
 */

import { qualityFromRtt } from "@/ai/astraura/mesh/signals";

export type MedioEnlace = "ble" | "wifi";

export interface EnlaceMedido {
  id: string;
  medio: MedioEnlace;
  /** La OTRA neurona del enlace (el extremo de este aparato es la neurona propia). */
  neurona: string;
  rttMs: number | null;
  kbps: number | null;
  /** Hora de la lectura (epoch ms). */
  t: number;
}

/** Lo mínimo de un `EnlaceDisponible` del transporte. */
export interface EnlaceCrudo {
  id: string;
  tipo: string;
  abierto: boolean;
  ruta?: string | null;
  rttMs?: number | null;
  capacidadKbps?: number | null;
  alcanza?: { neuronDeviceId?: string };
}

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : null);

/** Bluetooth = enlace `ble`; Wi-Fi = red local nativa (incluye Wi-Fi Directo) o par WebRTC en la misma red local. */
export function medioDeEnlace(e: EnlaceCrudo): MedioEnlace | null {
  if (e.tipo === "ble") return "ble";
  if (e.tipo === "nativo") return "wifi";
  if ((e.tipo === "local" || e.tipo === "par" || e.tipo === "cuenta") && e.ruta === "misma-red-local") return "wifi";
  return null;
}

export function enlacesMedidosDe(lista: readonly EnlaceCrudo[], ahora: number): EnlaceMedido[] {
  const out: EnlaceMedido[] = [];
  for (const e of lista) {
    if (!e.abierto) continue;
    const medio = medioDeEnlace(e);
    const neurona = e.alcanza?.neuronDeviceId;
    if (!medio || !neurona) continue;
    const rttMs = num(e.rttMs);
    const kbps = num(e.capacidadKbps);
    if (rttMs === null && kbps === null) continue;
    out.push({ id: e.id, medio, neurona, rttMs, kbps, t: ahora });
  }
  return out;
}

/** Calidad 0..1 de un enlace: por su ida y vuelta si la hay; si no, por su capacidad (misma escala que Internet: 20 Mb/s = 1). */
export function calidadDeEnlace(e: Pick<EnlaceMedido, "rttMs" | "kbps">): number | null {
  if (e.rttMs !== null) return qualityFromRtt(e.rttMs);
  if (e.kbps !== null) return Math.max(0, Math.min(1, e.kbps / 20_000));
  return null;
}

export function textoEnlace(e: Pick<EnlaceMedido, "rttMs" | "kbps">): string {
  const p: string[] = [];
  if (e.rttMs !== null) p.push(`${Math.round(e.rttMs)} ms de ida y vuelta`);
  if (e.kbps !== null) p.push(e.kbps >= 1000 ? `${(e.kbps / 1000).toFixed(1)} Mb/s` : `${Math.round(e.kbps)} kbit/s`);
  return p.join(" · ");
}

/** Dos lecturas del mismo conjunto de enlaces, ¿iguales en lo que se dibuja? Evita repintar sin cambios. */
export function mismosEnlaces(a: readonly EnlaceMedido[], b: readonly EnlaceMedido[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x.id === b[i].id && x.rttMs === b[i].rttMs && x.kbps === b[i].kbps);
}
