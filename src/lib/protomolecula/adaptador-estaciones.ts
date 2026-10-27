/**
 * adaptador-estaciones — el panel de la Protomolécula mueve la entonación de una estación.
 * Contrato: `architecture/protomolecula.md` §5. PURO: sin red ni DOM. Los tipos son los reales
 * de `estaciones/transmision-parametrica.ts` (`ParametrosSesion`), y los valores se guardan con
 * la misma clave `atomoId::parametroId` que usa el núcleo.
 */
import type { EstadoValores, Parametro } from "./tipos";
import type { EntonacionParam, OsciladorParam, Onda, ParametrosSesion, ValorVisual } from "@/lib/estaciones/transmision-parametrica";
import { ONDAS } from "@/lib/estaciones/transmision-parametrica";

/** Átomo virtual de la estación: todos sus parámetros cuelgan de él. */
export const ATOMO_ESTACION = "estacion";

export interface ParametrosAdaptados {
  parametros: Parametro[];
  valores: EstadoValores;
}

const clave = (parametroId: string): string => `${ATOMO_ESTACION}::${parametroId}`;
const esOnda = (v: unknown): v is Onda => ONDAS.includes(v as Onda);
const numero = (v: unknown, porDefecto: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : porDefecto;

const ondaParam = (id: string, nombre: string, onda: Onda): Parametro => ({
  id, nombre, tipo: "opcion", opciones: [...ONDAS], defecto: onda,
});

function deOscilador(o: OsciladorParam, i: number): ParametrosAdaptados {
  const id = `osc:${o.id || i}`;
  const nombre = o.nombre?.trim() || `Oscilador ${i + 1}`;
  const parametros: Parametro[] = [
    { id: `${id}:f`, nombre: `${nombre} · frecuencia`, tipo: "numero", min: 20, max: 20000, paso: 1, unidad: "Hz", defecto: o.f },
    { id: `${id}:vol`, nombre: `${nombre} · volumen`, tipo: "numero", min: 0, max: 1, paso: 0.01, defecto: o.vol },
    { id: `${id}:x`, nombre: `${nombre} · panorámica`, tipo: "numero", min: -1, max: 1, paso: 0.01, defecto: o.x },
    { id: `${id}:y`, nombre: `${nombre} · altura`, tipo: "numero", min: -1, max: 1, paso: 0.01, defecto: o.y },
    { id: `${id}:z`, nombre: `${nombre} · profundidad`, tipo: "numero", min: -1, max: 1, paso: 0.01, defecto: o.z },
    ondaParam(`${id}:onda`, `${nombre} · onda`, o.onda),
  ];
  const valores: EstadoValores = {
    [clave(`${id}:f`)]: o.f, [clave(`${id}:vol`)]: o.vol, [clave(`${id}:x`)]: o.x,
    [clave(`${id}:y`)]: o.y, [clave(`${id}:z`)]: o.z, [clave(`${id}:onda`)]: o.onda,
  };
  if (o.onda2 !== undefined) {
    parametros.push(ondaParam(`${id}:onda2`, `${nombre} · segunda onda`, o.onda2));
    valores[clave(`${id}:onda2`)] = o.onda2;
  }
  if (o.mezcla !== undefined) {
    parametros.push({ id: `${id}:mezcla`, nombre: `${nombre} · mezcla`, tipo: "numero", min: 0, max: 1, paso: 0.01, defecto: o.mezcla });
    valores[clave(`${id}:mezcla`)] = o.mezcla;
  }
  if (o.pulso !== undefined) {
    parametros.push({ id: `${id}:pulso`, nombre: `${nombre} · pulsos`, tipo: "numero", min: 0, paso: 0.1, unidad: "Hz", defecto: o.pulso });
    valores[clave(`${id}:pulso`)] = o.pulso;
  }
  return { parametros, valores };
}

function deVisual(visual: Record<string, ValorVisual>): ParametrosAdaptados {
  const parametros: Parametro[] = [], valores: EstadoValores = {};
  for (const [k, v] of Object.entries(visual)) {
    const id = `visual:${k}`;
    if (typeof v === "number") parametros.push({ id, nombre: k, tipo: "numero", defecto: v });
    else if (typeof v === "boolean") parametros.push({ id, nombre: k, tipo: "booleano", defecto: v });
    else parametros.push({ id, nombre: k, tipo: "opcion", opciones: [v], defecto: v });
    valores[clave(id)] = v;
  }
  return { parametros, valores };
}

export function parametrosDeSesion(p: ParametrosSesion): ParametrosAdaptados {
  if (p.tipo === "audiomorphic") return deVisual(p.visual);
  const partes = p.entonacion.osciladores.map(deOscilador);
  const parametros: Parametro[] = [
    { id: "volumen", nombre: "Volumen general", tipo: "numero", min: 0, max: 1, paso: 0.01, defecto: p.entonacion.volumen },
    ...partes.flatMap((x) => x.parametros),
  ];
  const valores: EstadoValores = { [clave("volumen")]: p.entonacion.volumen };
  for (const parte of partes) Object.assign(valores, parte.valores);
  return { parametros, valores };
}

export function sesionDeParametros(p: ParametrosSesion, valores: EstadoValores): ParametrosSesion {
  if (p.tipo === "audiomorphic") {
    const visual: Record<string, ValorVisual> = {};
    for (const [k, previo] of Object.entries(p.visual)) {
      const v = valores[clave(`visual:${k}`)];
      visual[k] = typeof previo === "number" ? numero(v, previo)
        : typeof previo === "boolean" ? (typeof v === "boolean" ? v : previo)
        : (typeof v === "string" ? v : previo);
    }
    return { tipo: "audiomorphic", visual };
  }
  const osciladores = p.entonacion.osciladores.map((o, i) => {
    const id = `osc:${o.id || i}`;
    const v: OsciladorParam = {
      ...o,
      f: numero(valores[clave(`${id}:f`)], o.f), vol: numero(valores[clave(`${id}:vol`)], o.vol),
      x: numero(valores[clave(`${id}:x`)], o.x), y: numero(valores[clave(`${id}:y`)], o.y),
      z: numero(valores[clave(`${id}:z`)], o.z),
      onda: esOnda(valores[clave(`${id}:onda`)]) ? (valores[clave(`${id}:onda`)] as Onda) : o.onda,
    };
    if (o.onda2 !== undefined) v.onda2 = esOnda(valores[clave(`${id}:onda2`)]) ? (valores[clave(`${id}:onda2`)] as Onda) : o.onda2;
    if (o.mezcla !== undefined) v.mezcla = numero(valores[clave(`${id}:mezcla`)], o.mezcla);
    if (o.pulso !== undefined) v.pulso = numero(valores[clave(`${id}:pulso`)], o.pulso);
    return v;
  });
  const entonacion: EntonacionParam = { osciladores, volumen: numero(valores[clave("volumen")], p.entonacion.volumen) };
  return { tipo: "omnifrecuencias", entonacion };
}
