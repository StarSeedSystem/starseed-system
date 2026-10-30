/**
 * adaptador-estaciones — la entonación de una estación en vivo en el MISMO panel (2026-10-30).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/protomolecula.md` §5 (estaciones y canales) y
 * `architecture/estaciones-en-vivo-parametricas.md`. Solo tipos que YA existen: `ParametrosSesion`
 * de `estaciones/transmision-parametrica.ts` (Omnifrecuencias y Audiomorphic) y `Parametro`/
 * `EstadoValores` del núcleo de la Protomolécula. Módulo PURO: entrada → salida, sin red ni reloj.
 * Los objetivos de latencia del §6.3 son METAS A MEDIR: nadie promete cifras aquí.
 */
import {
  ONDAS,
  type EntonacionParam,
  type Onda,
  type OsciladorParam,
  type ParametrosSesion,
  type ValorVisual,
} from "@/lib/estaciones/transmision-parametrica";
import type { EstadoValores, Parametro, Unidad } from "./tipos";

/** Los mismos topes que el saneo de la estación (no se reabren ventanas de tamaño). */
export const MAX_OSCILADORES = 16;
export const MAX_VISUAL = 120;

export interface AdaptacionSesion {
  parametros: Parametro[];
  valores: EstadoValores;
}

const RE_CLAVE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

function acotar(v: unknown, lo: number, hi: number, defecto: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : defecto;
}

function pNumerico(id: string, nombre: string, min: number, max: number, paso: number, unidad: Unidad | undefined, defecto: number): Parametro {
  const p: Parametro = { id, nombre, tipo: "numero", min, max, paso, defecto };
  if (unidad) p.unidad = unidad;
  return p;
}

/** Campos numéricos de un oscilador: [campo, nombre, min, max, paso, unidad]. */
const CAMPOS_OSCILADOR: Array<[string, string, number, number, number, Unidad | undefined]> = [
  ["f", "Frecuencia", 0.1, 24000, 1, "Hz"],
  ["vol", "Volumen", 0, 1, 0.01, undefined],
  ["x", "Izquierda–derecha", -1, 1, 0.01, undefined],
  ["y", "Abajo–arriba", -1, 1, 0.01, undefined],
  ["z", "Detrás–delante", -1, 1, 0.01, undefined],
];

/* ── Ida: la estación ocupa su sitio en el panel ── */

export function parametrosDeSesion(p: ParametrosSesion): AdaptacionSesion {
  if (p.tipo === "audiomorphic") return adaptarVisual(p.visual);
  return adaptarEntonacion(p.entonacion);
}

function adaptarEntonacion(e: EntonacionParam): AdaptacionSesion {
  const parametros: Parametro[] = [pNumerico("volumen", "Volumen general", 0, 1, 0.01, undefined, e.volumen)];
  const valores: EstadoValores = { volumen: e.volumen };
  for (const o of e.osciladores.slice(0, MAX_OSCILADORES)) {
    const datos = o as unknown as Record<string, unknown>;
    for (const [campo, nombre, min, max, paso, unidad] of CAMPOS_OSCILADOR) {
      const crudo = datos[campo];
      if (typeof crudo !== "number" || !Number.isFinite(crudo)) continue;
      parametros.push(pNumerico(`${o.id}.${campo}`, nombre, min, max, paso, unidad, acotar(crudo, min, max, min)));
      valores[`${o.id}.${campo}`] = crudo;
    }
    parametros.push({ id: `${o.id}.onda`, nombre: "Onda", tipo: "opcion", opciones: [...ONDAS], defecto: o.onda });
    valores[`${o.id}.onda`] = o.onda;
    // Solo se declara lo que la fuente declara: nada de control que no exista.
    if (o.onda2) {
      parametros.push(pNumerico(`${o.id}.mezcla`, "Mezcla de la segunda onda", 0, 1, 0.01, undefined, o.mezcla ?? 0));
      valores[`${o.id}.mezcla`] = o.mezcla ?? 0;
    }
    if (typeof o.pulso === "number" && o.pulso > 0) {
      parametros.push(pNumerico(`${o.id}.pulso`, "Pulsos isocrónicos", 0.5, 40, 0.5, "Hz", o.pulso));
      valores[`${o.id}.pulso`] = o.pulso;
    }
  }
  return { parametros, valores };
}

function adaptarVisual(visual: Record<string, ValorVisual>): AdaptacionSesion {
  const parametros: Parametro[] = [];
  const valores: EstadoValores = {};
  let n = 0;
  for (const [k, v] of Object.entries(visual)) {
    if (n >= MAX_VISUAL) break;
    if (!RE_CLAVE.test(k)) continue;
    const tipo: Parametro["tipo"] =
      typeof v === "boolean" ? "booleano" : typeof v === "string" ? "opcion" : "numero";
    const p: Parametro = { id: `visual.${k}`, nombre: k, tipo, defecto: v };
    if (tipo === "opcion") p.opciones = [String(v)];
    parametros.push(p);
    valores[p.id] = v;
    n += 1;
  }
  return { parametros, valores };
}

/* ── Vuelta: lo movido en el panel vuelve a ser la entonación de la estación ── */

export function sesionDeParametros(base: ParametrosSesion, valores: EstadoValores): ParametrosSesion | null {
  if (base.tipo === "audiomorphic") return { tipo: "audiomorphic", visual: visualDe(base.visual, valores) };
  return entonacionDe(base.entonacion, valores);
}

function entonacionDe(base: EntonacionParam, valores: EstadoValores): ParametrosSesion | null {
  const osciladores: OsciladorParam[] = [];
  for (const o of base.osciladores.slice(0, MAX_OSCILADORES)) {
    const osc: OsciladorParam = { ...o };
    const datos = osc as unknown as Record<string, unknown>;
    for (const [campo, , min, max] of CAMPOS_OSCILADOR) {
      const v = valores[`${o.id}.${campo}`];
      if (typeof v !== "number") continue;
      const actual = datos[campo];
      datos[campo] = acotar(v, min, max, typeof actual === "number" ? actual : min);
    }
    const onda = valores[`${o.id}.onda`];
    if (typeof onda === "string" && (ONDAS as readonly string[]).includes(onda)) osc.onda = onda as Onda;
    const mezcla = valores[`${o.id}.mezcla`];
    if (osc.onda2 && typeof mezcla === "number") osc.mezcla = acotar(mezcla, 0, 1, osc.mezcla ?? 0);
    if (!osc.onda2) delete osc.mezcla;
    const pulso = valores[`${o.id}.pulso`];
    if (typeof pulso === "number" && pulso > 0) osc.pulso = acotar(pulso, 0.5, 40, osc.pulso ?? 0.5);
    else if (typeof pulso === "number") delete osc.pulso;
    osciladores.push(osc);
  }
  if (!osciladores.length) return null;
  return { tipo: "omnifrecuencias", entonacion: { osciladores, volumen: acotar(valores["volumen"], 0, 1, base.volumen) } };
}

function visualDe(base: Record<string, ValorVisual>, valores: EstadoValores): Record<string, ValorVisual> {
  const out: Record<string, ValorVisual> = {};
  let n = 0;
  for (const [k, defecto] of Object.entries(base)) {
    if (n >= MAX_VISUAL) break;
    if (!RE_CLAVE.test(k)) continue;
    const v = valores[`visual.${k}`];
    out[k] = v === undefined ? defecto : v;
    n += 1;
  }
  return out;
}
