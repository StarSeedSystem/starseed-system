// Medidas por neurona de las capas de Astraura (architecture/colibri-multicapas.md §3,
// CLB1027G). PURO: sin red, sin disco ni `node:*`; lo importa el navegador. Lo medido en
// una neurona reordena los candidatos de su capa; sin medida se conserva el catálogo.

import type { Capa } from "./catalogo";

/** Media móvil: medidas que se conservan por neurona, modelo y capa. */
export const VENTANA_MEDIDAS = 20;

/** Lo que deja una respuesta al terminar. `acierto` va de 0 a 1. */
export interface MedidaCapas {
  neurona: string; modelo: string; capa: Capa;
  latenciaMs: number; tokPorS?: number; acierto?: number;
}

/** Almacén inmutable: `registrarMedida` devuelve uno nuevo. */
export type AlmacenMedidas = readonly MedidaCapas[];

/** Media de las últimas medidas de una neurona, modelo y capa. */
export interface MediaMedida {
  neurona: string; modelo: string; capa: Capa; muestras: number;
  latenciaMs: number; tokPorS?: number; acierto?: number;
}

/** Candidato mínimo: su id de modelo y, si la tiene, su capa. */
export interface CandidatoMedido {
  modelo: string;
  capa?: Capa | { capa: Capa };
}

const clave = (m: MedidaCapas): string => `${m.neurona}\u0000${m.capa}\u0000${m.modelo}`;
const esNumero = (v: number | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const promedio = (valores: readonly number[]): number => valores.reduce((s, v) => s + v, 0) / valores.length;

function valida(m: MedidaCapas): boolean {
  return m.neurona.length > 0 && m.modelo.length > 0 && esNumero(m.latenciaMs) && m.latenciaMs >= 0 &&
    (m.tokPorS === undefined || (esNumero(m.tokPorS) && m.tokPorS >= 0)) &&
    (m.acierto === undefined || (esNumero(m.acierto) && m.acierto >= 0 && m.acierto <= 1));
}

/** Almacén vacío, listo para `registrarMedida`. */
export function crearAlmacenMedidas(): MedidaCapas[] { return []; }

/** Añade una medida y conserva solo las últimas `VENTANA_MEDIDAS` de esa terna. */
export function registrarMedida(almacen: AlmacenMedidas, medida: MedidaCapas): MedidaCapas[] {
  if (!valida(medida)) return [...almacen];
  const misma = clave(medida);
  const previas = almacen.filter((m) => clave(m) === misma);
  const otras = almacen.filter((m) => clave(m) !== misma);
  return [...otras, ...[...previas, medida].slice(-VENTANA_MEDIDAS)];
}

/** Media móvil de las últimas `VENTANA_MEDIDAS` medidas de cada terna. */
export function promediarMedidas(almacen: AlmacenMedidas, neurona?: string): MediaMedida[] {
  const grupos = new Map<string, MedidaCapas[]>();
  for (const m of almacen) {
    if (!valida(m) || (neurona !== undefined && m.neurona !== neurona)) continue;
    grupos.set(clave(m), [...(grupos.get(clave(m)) ?? []), m]);
  }
  const medias: MediaMedida[] = [];
  for (const lista of grupos.values()) {
    const recientes = lista.slice(-VENTANA_MEDIDAS);
    const [primera] = recientes;
    const tok = recientes.flatMap((m) => (m.tokPorS === undefined ? [] : [m.tokPorS]));
    const acierto = recientes.flatMap((m) => (m.acierto === undefined ? [] : [m.acierto]));
    medias.push({
      neurona: primera.neurona, modelo: primera.modelo, capa: primera.capa,
      muestras: recientes.length, latenciaMs: promedio(recientes.map((m) => m.latenciaMs)),
      ...(tok.length > 0 ? { tokPorS: promedio(tok) } : {}),
      ...(acierto.length > 0 ? { acierto: promedio(acierto) } : {}),
    });
  }
  return medias;
}

/** Media de un modelo concreto, opcionalmente de una capa concreta. */
export function mediaDe(almacen: AlmacenMedidas, neurona: string, modelo: string, capa?: Capa): MediaMedida | undefined {
  return promediarMedidas(almacen, neurona).find((m) => m.modelo === modelo && (capa === undefined || m.capa === capa));
}

/** Velocidad medida: tok/s si existe; si no, latencia (mayor es mejor). */
function velocidad(m: MediaMedida): number {
  return m.tokPorS ?? (m.latenciaMs > 0 ? 1000 / m.latenciaMs : Number.MAX_VALUE);
}

/** Más acertado primero y, a igual acierto, más rápido; sin acierto cuenta 0. */
export function compararMedidas(a: MediaMedida, b: MediaMedida): number {
  const acierto = (b.acierto ?? 0) - (a.acierto ?? 0);
  return acierto !== 0 ? acierto : velocidad(b) - velocidad(a);
}

const capaDe = (c: CandidatoMedido): Capa | undefined => (typeof c.capa === "string" ? c.capa : c.capa?.capa);

type Ordenable = string | CandidatoMedido;
/** Reordena por lo medido en la neurona; los sin medida van después, en orden de catálogo. */
export function ordenarPorMedidas(candidatos: readonly string[], medidas: AlmacenMedidas, neurona?: string): string[];
export function ordenarPorMedidas<T extends CandidatoMedido>(candidatos: readonly T[], medidas: AlmacenMedidas, neurona?: string): T[];
export function ordenarPorMedidas(candidatos: readonly Ordenable[], medidas: AlmacenMedidas, neurona?: string): Ordenable[] {
  if (candidatos.length < 2 || medidas.length === 0) return [...candidatos];
  const porModelo = new Map<string, MediaMedida[]>();
  for (const m of promediarMedidas(medidas, neurona)) porModelo.set(m.modelo, [...(porModelo.get(m.modelo) ?? []), m]);
  const medidos: Array<{ candidato: Ordenable; media: MediaMedida; posicion: number }> = [];
  const sinMedida: Ordenable[] = [];
  candidatos.forEach((candidato, posicion) => {
    const modelo = typeof candidato === "string" ? candidato : candidato.modelo;
    const capa = typeof candidato === "string" ? undefined : capaDe(candidato);
    const lista = porModelo.get(modelo) ?? [];
    const media = capa === undefined ? lista[0] : lista.find((m) => m.capa === capa);
    if (media) medidos.push({ candidato, media, posicion });
    else sinMedida.push(candidato);
  });
  medidos.sort((a, b) => compararMedidas(a.media, b.media) || a.posicion - b.posicion);
  return [...medidos.map((x) => x.candidato), ...sinMedida];
}
