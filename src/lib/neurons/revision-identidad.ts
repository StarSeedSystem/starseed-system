/*
 * revision-identidad — Revisión de identidad al arrancar una versión nueva (NEU1126E · parte 1).
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * Cuando arranca la versión nueva, comprueba si la neurona de este aparato tiene dos o más
 * APARATOS VIVOS con huella distinta (datos en `capabilities.aparatos` de la fila de la
 * neurona). Si los hay, en CADA aparato aparece la ventana «comparte neurona» de NEU1125B:
 * «Este aparato comparte la neurona «X» con «Y». Recomendado: una neurona por aparato».
 *
 * Reglas:
 *  · Nunca elige por la persona: solo propone y avisa.
 *  · Nunca borra nada: la entrada que se deja lleva lápida, nunca se elimina la fila.
 *  · Por defecto se propone que cree la suya el aparato que se unió DESPUÉS (entrada más
 *    reciente) y que conserve la neurona y su nombre el que estaba PRIMERO.
 *
 * Puro: sin red, sin DOM, sin almacenamiento. Nunca lanza.
 */

import { estaVinculado, leerMapaAparatos, nombreAparatoPorDefecto, type EntradaAparato, type MapaAparatos } from "./aparatos-de-neurona";
import { normalizarEquipo } from "./aparato-registro";

/** Ventana en que un aparato cuenta como «vivo»: visto hace menos de 12 min (la misma que
 *  la presencia online de `neurons.ts`). */
export const VENTANA_APARATO_VIVO_MS = 12 * 60_000;

export interface AparatoVivo {
  id: string;
  nombre: string;
  idUnico?: string | null;
  huella: string | null;
  equipo: string | null;
  so: string | null;
  ts: number;
}

export interface RevisionIdentidad {
  idNeurona: string;
  nombreNeurona: string;
  yo: AparatoVivo;
  otros: AparatoVivo[];
  /** true si este aparato es el que se unió después: le toca crear su propia neurona. */
  yoSeUnioDespues: boolean;
  /** Nombre propuesto para la neurona nueva: el nombre de este aparato. */
  nombrePropuesto: string;
  /** Nombres de los otros, para el texto «comparte la neurona «X» con «Y»». */
  otrosNombres: string[];
}

/** Clave de almacenamiento para «ya se mostró esta revisión» (una vez por versión × neurona). */
export function claveRevisionVista(version: string | null | undefined, idNeurona: string): string {
  const v = (version ?? "desconocida").replace(/[^a-z0-9._-]/gi, "_");
  return `starseed.neuron.revision-identidad.vista.${v}.${idNeurona}`;
}

/** Clave de almacenamiento para «se pospuso la revisión» (una vez por versión × neurona). */
export function claveRevisionPospuesto(version: string | null | undefined, idNeurona: string): string {
  const v = (version ?? "desconocida").replace(/[^a-z0-9._-]/gi, "_");
  return `starseed.neuron.revision-identidad.pospuesto.${v}.${idNeurona}`;
}

function crudoDe(e: EntradaAparato): Record<string, unknown> {
  return e as unknown as Record<string, unknown>;
}

/** Señal que distingue este aparato de otro: la huella si se conoce, si no el equipo y el
 *  sistema (todo lo que `capabilities.aparatos` guarda por entrada). Pura. */
function claveDeAparatoVivo(v: AparatoVivo): string {
  if (v.huella) return `h:${v.huella}`;
  const equipo = normalizarEquipo(v.equipo);
  if (equipo) return `e:${equipo}|${v.so ?? ""}`;
  if (v.idUnico) return `u:${v.idUnico}|${v.so ?? ""}`;
  return `s:${v.so ?? ""}`;
}

function aparatosVivos(map: MapaAparatos, ahora: number): AparatoVivo[] {
  const out: AparatoVivo[] = [];
  for (const [id, e] of Object.entries(map)) {
    if (!estaVinculado(e)) continue;
    const ts = typeof e.ts === "number" && Number.isFinite(e.ts) ? e.ts : 0;
    if (ahora - ts >= VENTANA_APARATO_VIVO_MS) continue;
    const c = crudoDe(e);
    out.push({
      id,
      nombre: typeof e.n === "string" && e.n.trim() ? e.n.trim() : nombreAparatoPorDefecto(e),
      idUnico: typeof e.idUnico === "string" ? e.idUnico : null,
      huella: typeof c.huella === "string" ? c.huella : null,
      equipo: typeof e.equipo === "string" ? e.equipo : null,
      so: typeof e.so === "string" ? e.so : null,
      ts,
    });
  }
  return out;
}

/**
 * Decide si este aparato debe ver la ventana «comparte neurona» en este arranque.
 * Devuelve `null` cuando no hay que mostrar nada (un solo aparato, o todos son el mismo
 * aparato visto desde dos medios). Pura. Nunca lanza.
 */
export function revisarIdentidadCompartida(e: {
  idNeurona: string;
  nombreNeurona: string;
  /** `capabilities` de la fila de la neurona (contiene `aparatos`). */
  capabilities: unknown;
  yoId: string;
  ahora: number;
}): RevisionIdentidad | null {
  const mapa = leerMapaAparatos(e.capabilities);
  const vivos = aparatosVivos(mapa, e.ahora);
  if (vivos.length < 2) return null;

  const claves = new Set(vivos.map((v) => claveDeAparatoVivo(v)));
  if (claves.size < 2) return null; // todos son el mismo aparato (dos medios, una neurona)

  const yo = vivos.find((v) => v.id === e.yoId);
  if (!yo) return null;
  const claveYo = claveDeAparatoVivo(yo);
  const otros = vivos.filter((v) => v.id !== e.yoId && claveDeAparatoVivo(v) !== claveYo);
  if (otros.length === 0) return null;

  const primero = vivos.reduce((a, b) => (b.ts < a.ts ? b : a));
  const clavePrimero = claveDeAparatoVivo(primero);
  const yoSeUnioDespues = yo.id !== primero.id && yo.ts > primero.ts && claveYo !== clavePrimero;

  return {
    idNeurona: e.idNeurona,
    nombreNeurona: e.nombreNeurona,
    yo,
    otros,
    yoSeUnioDespues,
    nombrePropuesto: yo.nombre,
    otrosNombres: otros.map((o) => o.nombre),
  };
}
