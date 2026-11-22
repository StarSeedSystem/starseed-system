/**
 * orbe-params-telemetria — contrato puro del canal `orb_params` de la orbe.
 * ----------------------------------------------------------------------------
 * Vector expresivo que el motor 1.58b publica como telemetría visual. Aquí
 * viven las constantes, los tipos mínimos de Realtime y los lectores que
 * sanean cargas no fiables; el canal que los usa está en `canal-orbe-params.ts`.
 */
import { clampUnit, type QuantumOrbParams } from "./quantum-orb-theme";

export const TEMA_ORBE_PARAMS = "orb_params";
export const EVENTO_ORBE_PARAMS = "params";
export const CLAVES_VECTOR_ORBE = ["turbulence", "spikiness", "symmetry", "hueShift", "breath"] as const;

export interface AnuncioParamsOrbe {
  params: Partial<QuantumOrbParams>;
  at: number;
}
export type EstadoUnionOrbe = "sin-intentar" | "uniendo" | "unido" | "rechazado";
export interface EstadoCanalOrbe {
  union: EstadoUnionOrbe;
  motivo: string | null;
}

export interface CanalBroadcastMin {
  on(tipo: "broadcast", filtro: { event: string }, cb: (msg: { payload?: unknown }) => void): CanalBroadcastMin;
  subscribe(cb: (estado: string, err?: unknown) => void): unknown;
  send(msg: { type: "broadcast"; event: string; payload: unknown }): Promise<unknown>;
}
export interface ClienteRealtimeMin {
  channel(tema: string, opciones: { config: { broadcast: { self: boolean } } }): CanalBroadcastMin;
  removeChannel(canal: CanalBroadcastMin): unknown;
}
export interface CanalOrbeParams {
  estado(): EstadoCanalOrbe;
  suscribir(cb: (anuncio: AnuncioParamsOrbe) => void): () => void;
  publicar(params: Partial<QuantumOrbParams>): Promise<boolean>;
  cerrar(): void;
}
export interface DepsCanalOrbeParams {
  cliente: ClienteRealtimeMin | null;
  ahora?: () => number;
}

/** Solo las cinco claves conocidas, números finitos y acotados a 0..1. */
export function leerVectorOrbe(valor: unknown): Partial<QuantumOrbParams> | null {
  if (!valor || typeof valor !== "object") return null;
  const origen = valor as Record<string, unknown>;
  const vector: Partial<QuantumOrbParams> = {};
  for (const clave of CLAVES_VECTOR_ORBE) {
    const n = origen[clave];
    if (typeof n === "number" && Number.isFinite(n)) vector[clave] = clampUnit(n);
  }
  return Object.keys(vector).length > 0 ? vector : null;
}

/** Lee `{ params, at }` (o un vector plano) y sanea la marca de tiempo. */
export function leerAnuncioOrbe(valor: unknown): AnuncioParamsOrbe | null {
  if (!valor || typeof valor !== "object") return null;
  const origen = valor as Record<string, unknown>;
  const params = leerVectorOrbe(origen.params ?? origen);
  if (!params) return null;
  const at = typeof origen.at === "number" && Number.isFinite(origen.at) ? origen.at : Date.now();
  return { params, at };
}

/** Motivo legible y corto de una unión rechazada (sin secretos ni cargas). */
export function motivoDe(estado: string, err: unknown): string {
  const detalle = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return `el canal ${TEMA_ORBE_PARAMS} no se abrió (${estado})${detalle ? `: ${detalle.slice(0, 100)}` : ""}`;
}
