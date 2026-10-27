/**
 * adaptador-estaciones — la entonación de una estación se mueve con el mismo
 * panel de la Protomolécula (PM1010F3B, contrato `architecture/protomolecula.md` §5).
 *
 * Puente de ida y vuelta entre `ParametrosSesion` (estaciones, los tipos reales
 * de `estaciones/transmision-parametrica.ts`) y el esquema `Parametro` +
 * `EstadoValores` del núcleo (Protomolécula). Puro: sin red, sin disco.
 * Las transiciones (`trans`) de un oscilador no caben en un parámetro:
 * se dejan fuera del panel de forma honesta (el resto sí viaja y vuelve).
 */
import type { Parametro, EstadoValores, ValorParametro } from "./tipos";
import {
  type ParametrosSesion,
  type EntonacionParam,
  type OsciladorParam,
  type Onda,
  type ValorVisual,
  ONDAS,
} from "@/lib/estaciones/transmision-parametrica";

export interface PanelDeSesion {
  parametros: Parametro[];
  valores: EstadoValores;
}

const esOnda = (v: unknown): v is Onda => typeof v === "string" && (ONDAS as readonly string[]).includes(v);

/** ID común de cada oscilador dentro del panel: `osc<i>.<parametro>`. */
const baseOsc = (i: number): string => `osc${i}`;

function osciladoresAParams(osc: OsciladorParam[], valores: EstadoValores): Parametro[] {
  const out: Parametro[] = [];
  osc.forEach((o, i) => {
    const b = baseOsc(i);
    out.push({ id: `${b}.frecuencia`, nombre: `Frecuencia ${o.nombre ?? i + 1}`, tipo: "numero", min: 0.1, max: 24000, unidad: "Hz", defecto: o.f });
    out.push({ id: `${b}.volumen`, nombre: `Volumen ${o.nombre ?? i + 1}`, tipo: "numero", min: 0, max: 1, paso: 0.01, defecto: o.vol });
    for (const eje of ["x", "y", "z"] as const) {
      out.push({ id: `${b}.${eje}`, nombre: `Posición ${eje.toUpperCase()} del oscilador ${i + 1}`, tipo: "numero", min: -1, max: 1, paso: 0.01, defecto: o[eje] });
    }
    out.push({ id: `${b}.onda`, nombre: `Onda del oscilador ${i + 1}`, tipo: "opcion", opciones: [...ONDAS], defecto: o.onda });
    if (o.mezcla != null) out.push({ id: `${b}.mezcla`, nombre: `Mezcla del oscilador ${i + 1}`, tipo: "numero", min: 0, max: 1, paso: 0.01, defecto: o.mezcla });
    if (o.pulso != null) out.push({ id: `${b}.pulso`, nombre: `Pulsos del oscilador ${i + 1}`, tipo: "numero", min: 0, max: 24000, unidad: "Hz", defecto: o.pulso });
    valores[`${b}.frecuencia`] = o.f;
    valores[`${b}.volumen`] = o.vol;
    valores[`${b}.x`] = o.x;
    valores[`${b}.y`] = o.y;
    valores[`${b}.z`] = o.z;
    valores[`${b}.onda`] = o.onda;
    if (o.mezcla != null) valores[`${b}.mezcla`] = o.mezcla;
    if (o.pulso != null) valores[`${b}.pulso`] = o.pulso;
  });
  return out;
}

/** De las `ParametrosSesion` de la estación al panel común (parámetros + valores). */
export function parametrosDeSesion(p: ParametrosSesion): PanelDeSesion {
  if (p.tipo === "omnifrecuencias") {
    const valores: EstadoValores = {};
    const parametros = osciladoresAParams(p.entonacion.osciladores, valores);
    parametros.push({ id: "volumen", nombre: "Volumen general", tipo: "numero", min: 0, max: 1, paso: 0.01, defecto: p.entonacion.volumen });
    valores.volumen = p.entonacion.volumen;
    return { parametros, valores };
  }
  // audiomorphic: visual es un registro abierto; cada valor finito es un parámetro numérico.
  const parametros: Parametro[] = [];
  const valores: EstadoValores = {};
  for (const [clave, v] of Object.entries(p.visual)) {
    if (typeof v === "number" && Number.isFinite(v)) {
      const id = `vis.${clave}`;
      let max = 1;
      let min = -1;
      if (v > 1) max = Math.ceil(v * 2);
      if (v < -1) min = Math.floor(v * 2);
      if (v >= 0 && v <= 1) min = 0;
      parametros.push({ id, nombre: clave, tipo: "numero", min, max, defecto: v });
      valores[id] = v;
    } else if (typeof v === "boolean" || typeof v === "string") {
      const id = `vis.${clave}`;
      if (typeof v === "boolean") {
        parametros.push({ id, nombre: clave, tipo: "booleano", defecto: v });
      } else {
        parametros.push({ id, nombre: clave, tipo: "opcion", opciones: [v], defecto: v });
      }
      valores[id] = v as ValorParametro;
    }
  }
  return { parametros, valores };
}

/** Busca los parámetros cuyo valor está en `valores` (o su defecto si falta). */
function valorDe(valores: EstadoValores, p: Parametro, def: ValorParametro): ValorParametro {
  const v = valores[p.id] ?? p.defecto ?? def;
  return v;
}

const numDe = (v: ValorParametro, def: number): number => (typeof v === "number" && Number.isFinite(v) ? v : def);
const ondaDe = (v: ValorParametro): Onda => (esOnda(v) ? v : "sine");

/**
 * El inverso: del panel común a las `ParametrosSesion` de la estación.
 * Devuelve null si no hay nada del adaptador entre los parámetros dados.
 * Las transiciones (`trans`) quedan sin rival: una entonación vuelta del panel
 * no lleva transiciones que el panel no declara (se anulan).
 */
export function sesionDeParametros(parametros: Parametro[], valores: EstadoValores): ParametrosSesion | null {
  const porId = new Map(parametros.map((p) => [p.id, p]));
  const indicesOsc = new Map<number, string>();
  for (const id of porId.keys()) {
    const m = id.match(/^(osc(\d+))\./);
    if (m) indicesOsc.set(Number(m[2]), m[1]);
  }
  const imagenes = [...indicesOsc.entries()].sort((a, b) => a[0] - b[0]);
  if (!imagenes.length) {
    // audiomorphic: parámetros `vis.*` → el registro visual.
    const visual: Record<string, ValorVisual> = {};
    for (const p of parametros) {
      if (!p.id.startsWith("vis.")) continue;
      const v = valorDe(valores, p, "");
      if (typeof v === "number") visual[p.id.slice(4)] = v;
      else if (typeof v === "boolean") visual[p.id.slice(4)] = v;
      else if (typeof v === "string" && v) visual[p.id.slice(4)] = v;
    }
    if (!Object.keys(visual).length) return null;
    return { tipo: "audiomorphic", visual };
  }
  let volumen = 0.5;
  const volGen = porId.get("volumen");
  if (volGen) volumen = numDe(valorDe(valores, volGen, 0.5), 0.5);
  const osciladores: OsciladorParam[] = imagenes.map(([i]) => {
    const p = (suf: string): ValorParametro => {
      const q = porId.get(`${baseOsc(i)}.${suf}`);
      return q ? valorDe(valores, q, suf === "volumen" ? 0.5 : suf === "x" || suf === "y" || suf === "z" ? 0 : 0.1) : suf === "frecuencia" ? 432 : suf === "onda" ? "sine" : 0.5;
    };
    const vol = numDe(p("volumen"), 0.5);
    return {
      id: `o${i}`,
      f: numDe(p("frecuencia"), 432),
      onda: ondaDe(p("onda")),
      vol,
      x: numDe(p("x"), 0),
      y: numDe(p("y"), 0),
      z: numDe(p("z"), 0),
      mezcla: porId.has(`${baseOsc(i)}.mezcla`) ? numDe(p("mezcla"), 0.5) : undefined,
      pulso: porId.has(`${baseOsc(i)}.pulso`) ? Math.round(numDe(p("pulso"), 0) * 10) / 10 : undefined,
    };
  });
  const entonacion: EntonacionParam = { osciladores, volumen };
  return { tipo: "omnifrecuencias", entonacion };
}
