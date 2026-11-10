/**
 * puerta/tabla — anuncio de calidad de las puertas y elección de la mejor (PTA1108A · 2026-11-08).
 * Puro. Cada neurona con salida anuncia `AnuncioPuerta` por TODOS sus enlaces; las vecinas lo reanuncian con un salto
 * más (hasta `MAX_SALTOS`), sin repetir neuronas (`via`), y cada una guarda la mejor ruta por puerta.
 */

import type { EstadoPropio } from "@/lib/malla/puerta/politica";
import { capaDeDestino, destinoNecesitaCapa, leerCapa, type CapaPuerta } from "@/lib/malla/puerta/capas"; // PTA1108C

export const CANAL_PUERTA = "puerta";
export const MAX_SALTOS = 3;
/** Un anuncio vale este tiempo sin renovarse. */
export const CADUCA_ANUNCIO_MS = 90_000;
export const REANUNCIO_MS = 30_000;
/** Latencia que se suma por cada salto intermedio al reanunciar (estimación). */
const LATENCIA_SALTO_MS = 60;

/** Qué hay al otro lado de la puerta. */
export type CapaSalida = "internet" | "lan" | "servidor-propio" | "router-publico" | "ia-neurona";

export interface AnuncioPuerta {
  v: 1;
  /** Neurona que tiene la salida. */
  id: string;
  /** Cuenta de esa neurona (para saber si es «de las mías»); puede faltar. */
  uid?: string;
  capas: CapaSalida[];
  /** PTA1108C · Detalle de las capas distintas de internet (hosts, rangos, puertos, calidad). */
  detalle?: CapaPuerta[];
  latenciaMs: number | null;
  anchoKbps: number | null;
  medida: boolean;
  bateria: number | null;
  cargando: boolean;
  /** Puerta pública de StarSeed o router declarado público. */
  publica?: boolean;
  /** PTA1110A · Capacidades de transporte que entiende esa neurona ("cap" = ventana por capacidad y reparto justo; "bin" = trozos binarios). Se confirman por túnel en `abrir`/`ok`. */
  f?: string[];
  /** 0 = anuncio directo de la dueña de la salida. */
  saltos: number;
  /** Neuronas por las que ya pasó el anuncio (la dueña primero): evita bucles. */
  via: string[];
  ts: number;
}

export interface EntradaTabla {
  anuncio: AnuncioPuerta;
  /** Vecina directa por la que se llega. */
  vecino: string;
  /** «Bluetooth directo», «Wi‑Fi directo»… (texto para la interfaz). */
  enlace: string;
  /** Tipo del enlace hacia el vecino (`ble`, `nativo`, `local`, `cuenta`…). */
  tipoEnlace: string;
  recibidoEn: number;
  fallos: number;
  vetoHasta: number;
}

export interface EstimacionEnlace {
  tipoEnlace: string;
  etiqueta: string;
  /** Latencia de ese primer salto, si se conoce. */
  latenciaMs?: number | null;
}

/** Crea el anuncio propio de esta neurona a partir de lo que detectó. */
export function crearAnuncioPropio(p: {
  id: string;
  uid?: string;
  capas: CapaSalida[];
  /** PTA1108C · Capas propias detalladas; sus tipos se suman a `capas`. */
  detalle?: CapaPuerta[];
  latenciaMs: number | null;
  anchoKbps?: number | null;
  estado: EstadoPropio;
  publica?: boolean;
  /** PTA1110A */
  f?: string[];
  ahora: number;
}): AnuncioPuerta | null {
  const capas: CapaSalida[] = [...new Set<CapaSalida>([...p.capas, ...(p.detalle ?? []).map((c) => c.tipo)])];
  if (!capas.length || !p.estado.conInternet && !capas.some((c) => c !== "internet")) return null;
  return {
    v: 1,
    id: p.id,
    uid: p.uid,
    capas,
    ...(p.detalle?.length ? { detalle: p.detalle.slice(0, 8) } : {}),
    latenciaMs: p.latenciaMs,
    anchoKbps: p.anchoKbps ?? null,
    medida: p.estado.medida,
    bateria: p.estado.bateria,
    cargando: p.estado.cargando,
    publica: p.publica,
    ...(p.f?.length ? { f: p.f.slice(0, 4) } : {}),
    saltos: 0,
    via: [p.id],
    ts: p.ahora,
  };
}

/** Valida un anuncio recibido. Null si no sirve. */
export function leerAnuncio(x: unknown): AnuncioPuerta | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (o.v !== 1 || typeof o.id !== "string" || !o.id || o.id.length > 80) return null;
  const capas = Array.isArray(o.capas) ? o.capas.filter((c): c is CapaSalida => c === "internet" || c === "lan" || c === "servidor-propio" || c === "router-publico" || c === "ia-neurona") : [];
  if (!capas.length) return null;
  const via = Array.isArray(o.via) ? o.via.filter((s): s is string => typeof s === "string" && s.length <= 80).slice(0, MAX_SALTOS + 2) : [];
  const saltos = typeof o.saltos === "number" && Number.isInteger(o.saltos) && o.saltos >= 0 && o.saltos <= MAX_SALTOS ? o.saltos : -1;
  if (saltos < 0 || !via.length || via[0] !== o.id) return null;
  const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  const detalle = Array.isArray(o.detalle) ? o.detalle.slice(0, 8).map(leerCapa).filter((c): c is CapaPuerta => c !== null) : [];
  return {
    v: 1,
    id: o.id,
    uid: typeof o.uid === "string" ? o.uid.slice(0, 80) : undefined,
    capas,
    ...(detalle.length ? { detalle } : {}),
    latenciaMs: n(o.latenciaMs),
    anchoKbps: n(o.anchoKbps),
    medida: o.medida === true,
    bateria: typeof o.bateria === "number" && o.bateria >= 0 && o.bateria <= 1 ? o.bateria : null,
    cargando: o.cargando === true,
    publica: o.publica === true ? true : undefined,
    ...(Array.isArray(o.f) ? { f: o.f.filter((x): x is string => typeof x === "string" && /^[a-z]{1,8}$/.test(x)).slice(0, 4) } : {}),
    saltos,
    via,
    ts: typeof o.ts === "number" ? o.ts : 0,
  };
}

/** El anuncio que esta neurona repite a sus vecinas, un salto más lejos. Null si no debe repetirse. */
export function reanunciar(a: AnuncioPuerta, yo: string, ahora: number): AnuncioPuerta | null {
  if (a.saltos + 1 > MAX_SALTOS) return null;
  if (a.via.includes(yo)) return null; // bucle
  return {
    ...a,
    saltos: a.saltos + 1,
    via: [...a.via, yo],
    latenciaMs: a.latenciaMs === null ? null : a.latenciaMs + LATENCIA_SALTO_MS,
    ts: ahora,
  };
}

/** Puntuación 0..100 (más es mejor) de llegar a una puerta por esa entrada. */
export function puntuarPuerta(e: EntradaTabla): number {
  const a = e.anuncio;
  let p = 100;
  p -= a.saltos * 22;
  const lat = (a.latenciaMs ?? 300) + (e.tipoEnlace === "ble" ? 80 : 0);
  p -= Math.min(30, lat / 20);
  if (a.anchoKbps !== null) p += Math.min(15, Math.log2(1 + a.anchoKbps / 100) * 3);
  if (a.medida) p -= 25;
  if (!a.cargando && a.bateria !== null && a.bateria < 0.3) p -= 20;
  if (e.tipoEnlace === "ble") p -= 12;
  if (a.publica) p -= 3; // a igualdad, mejor una neurona propia
  p -= e.fallos * 15;
  return Math.max(0, Math.min(100, p));
}

export interface OpcionesElegir {
  /** Puertas ya probadas en esta petición. */
  excluir?: ReadonlySet<string>;
  /** Solo puertas con esta capa. */
  capa?: CapaSalida;
  /** Descartar las de red medida. */
  evitarMedida?: boolean;
  /** PTA1108C · Destino que se quiere alcanzar: elige solo puertas que tengan la capa necesaria (internet o una capa privada). */
  host?: string;
  puerto?: number;
  /** PTA1110A · Filtro propio (carriles permitidos por el usuario). */
  filtro?: (e: EntradaTabla) => boolean;
}

/** PTA1108C · ¿Esta puerta alcanza `host:puerto`? Un destino privado exige una capa anunciada que lo cubra; uno público, la capa «internet». */
export function puertaAlcanza(a: Pick<AnuncioPuerta, "capas" | "detalle">, host: string, puerto: number): boolean {
  if (!destinoNecesitaCapa(host)) return a.capas.includes("internet");
  return capaDeDestino(a.detalle ?? [], host, puerto) !== null;
}

export class TablaPuertas {
  private entradas = new Map<string, EntradaTabla>();
  constructor(private ahora: () => number = () => Date.now(), private yo = "") {}

  /** Anota un anuncio llegado por `vecino`. Devuelve true si cambió la mejor ruta a esa puerta. */
  anotar(a: AnuncioPuerta, vecino: string, enlace: EstimacionEnlace): boolean {
    if (a.id === this.yo || a.via.includes(this.yo)) return false;
    const nueva: EntradaTabla = {
      anuncio: a,
      vecino,
      enlace: enlace.etiqueta,
      tipoEnlace: enlace.tipoEnlace,
      recibidoEn: this.ahora(),
      fallos: 0,
      vetoHasta: 0,
    };
    const previa = this.entradas.get(a.id);
    if (previa && this.vigente(previa)) {
      const mismoVecino = previa.vecino === vecino;
      if (!mismoVecino && puntuarPuerta(previa) >= puntuarPuerta(nueva)) return false;
      if (mismoVecino) {
        nueva.fallos = previa.fallos;
        nueva.vetoHasta = previa.vetoHasta;
      }
    }
    this.entradas.set(a.id, nueva);
    return true;
  }

  private vigente(e: EntradaTabla): boolean {
    return this.ahora() - e.recibidoEn <= CADUCA_ANUNCIO_MS;
  }

  barrer(): void {
    for (const [k, e] of this.entradas) if (!this.vigente(e)) this.entradas.delete(k);
  }

  quitarVecino(vecino: string): void {
    for (const [k, e] of this.entradas) if (e.vecino === vecino) this.entradas.delete(k);
  }

  quitar(id: string): void {
    this.entradas.delete(id);
  }

  /** Candidatas ordenadas de mejor a peor. */
  candidatas(o: OpcionesElegir = {}): EntradaTabla[] {
    const t = this.ahora();
    return [...this.entradas.values()]
      .filter((e) => this.vigente(e) && e.vetoHasta <= t && !o.excluir?.has(e.anuncio.id))
      .filter((e) => (o.capa ? e.anuncio.capas.includes(o.capa) : true))
      .filter((e) => (o.evitarMedida ? !e.anuncio.medida : true))
      .filter((e) => (o.host ? puertaAlcanza(e.anuncio, o.host, o.puerto ?? 443) : true))
      .filter((e) => (o.filtro ? o.filtro(e) : true))
      .sort((x, y) => puntuarPuerta(y) - puntuarPuerta(x) || x.anuncio.id.localeCompare(y.anuncio.id));
  }

  elegir(o: OpcionesElegir = {}): EntradaTabla | null {
    return this.candidatas(o)[0] ?? null;
  }

  /** Una puerta falló: se le baja la puntuación y se aparta un rato (crece con cada fallo, máximo 5 min). */
  marcarFallo(id: string): void {
    const e = this.entradas.get(id);
    if (!e) return;
    e.fallos += 1;
    e.vetoHasta = this.ahora() + Math.min(5 * 60_000, 5_000 * 2 ** (e.fallos - 1));
  }

  marcarAcierto(id: string): void {
    const e = this.entradas.get(id);
    if (e) {
      e.fallos = 0;
      e.vetoHasta = 0;
    }
  }

  /** PTA1108C · Capa (de cualquier puerta viva) que cubre ese destino, con la puerta que la ofrece. Null si ninguna. */
  capaParaDestino(host: string, puerto: number): { capa: CapaPuerta; puerta: string } | null {
    for (const e of this.candidatas({ host, puerto })) {
      const capa = capaDeDestino(e.anuncio.detalle ?? [], host, puerto);
      if (capa) return { capa, puerta: e.anuncio.id };
    }
    return null;
  }

  tamano(): number {
    return this.entradas.size;
  }
}
