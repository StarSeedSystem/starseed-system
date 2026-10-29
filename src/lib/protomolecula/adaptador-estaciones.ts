/**
 * Protomolécula · ADAPTADOR de estaciones (F3).
 * La entonación de una estación (Omnifrecuencias / Audiomorphic) se mueve con el mismo panel
 * de parámetros de la Protomolécula. Ida y vuelta sin perder lo que no se controla todavía.
 */
import type { EstadoValores, Parametro, ValorParametro } from "./tipos";
import { claveDe } from "./parametros";
import { ONDAS } from "@/lib/estaciones/transmision-parametrica";
import type {
  EntonacionParam, Onda, OsciladorParam, ParametrosSesion, ValorVisual,
} from "@/lib/estaciones/transmision-parametrica";

const ESTACION = "estacion";
const VISUAL = "visual";
const OPCIONES_ONDA: string[] = [...ONDAS];

export interface ParametrosAdaptados {
  parametros: Parametro[];
  valores: EstadoValores;
}

export function parametrosDeSesion(p: ParametrosSesion): ParametrosAdaptados {
  return p.tipo === "omnifrecuencias"
    ? deEntonacion(p.entonacion)
    : deVisual(p.visual);
}

export function sesionDesdeParametros(base: ParametrosSesion, valores: EstadoValores): ParametrosSesion {
  return base.tipo === "omnifrecuencias"
    ? { tipo: "omnifrecuencias", entonacion: aEntonacion(base.entonacion, valores) }
    : { tipo: "audiomorphic", visual: aVisual(base.visual, valores) };
}

const idDe = (atomoId: string, parametroId: string) => claveDe({ atomoId, parametroId });
const nombreLegible = (clave: string) => { const t = clave.replace(/[_-]+/g, " ").trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : clave; };
const leer = (valores: EstadoValores, atomoId: string, campo: string, defecto: ValorParametro): ValorParametro => valores[idDe(atomoId, campo)] ?? defecto;
const numero = (v: ValorParametro, defecto: number): number => typeof v === "number" && Number.isFinite(v) ? v : defecto;
const onda = (v: ValorParametro, defecto: Onda): Onda => typeof v === "string" && (ONDAS as readonly string[]).includes(v) ? v as Onda : defecto;

function numerico(id: string, nombre: string, defecto: number, min: number, max: number, paso: number, unidad?: Parametro["unidad"]): Parametro {
  return { id, nombre, tipo: "numero", min, max, paso, unidad, defecto };
}

function valoresDeOscilador(o: OsciladorParam): EstadoValores {
  const v: EstadoValores = {
    [idDe(o.id, "f")]: o.f, [idDe(o.id, "onda")]: o.onda, [idDe(o.id, "vol")]: o.vol,
    [idDe(o.id, "x")]: o.x, [idDe(o.id, "y")]: o.y, [idDe(o.id, "z")]: o.z,
  };
  if (o.onda2 !== undefined) v[idDe(o.id, "onda2")] = o.onda2;
  if (o.mezcla !== undefined) v[idDe(o.id, "mezcla")] = o.mezcla;
  if (o.pulso !== undefined) v[idDe(o.id, "pulso")] = o.pulso;
  return v;
}

function deEntonacion(e: EntonacionParam): ParametrosAdaptados {
  const volumenId = idDe(ESTACION, "volumen");
  const parametros: Parametro[] = [numerico(volumenId, "Volumen general", e.volumen, 0, 1, 0.01)];
  const valores: EstadoValores = { [volumenId]: e.volumen };
  e.osciladores.forEach((o, i) => {
    const nombre = o.nombre?.trim() || `Oscilador ${i + 1}`;
    const id = (campo: string) => idDe(o.id, campo);
    const defs: Parametro[] = [
      numerico(id("f"), `${nombre} · Frecuencia`, o.f, 20, 20000, 1, "Hz"),
      { id: id("onda"), nombre: `${nombre} · Onda`, tipo: "opcion", opciones: OPCIONES_ONDA, defecto: o.onda },
      numerico(id("vol"), `${nombre} · Volumen`, o.vol, 0, 1, 0.01),
      numerico(id("x"), `${nombre} · Posición X`, o.x, -1, 1, 0.01),
      numerico(id("y"), `${nombre} · Posición Y`, o.y, -1, 1, 0.01),
      numerico(id("z"), `${nombre} · Posición Z`, o.z, -1, 1, 0.01),
    ];
    if (o.onda2 !== undefined) defs.push({ id: id("onda2"), nombre: `${nombre} · Segunda onda`, tipo: "opcion", opciones: OPCIONES_ONDA, defecto: o.onda2 });
    if (o.mezcla !== undefined) defs.push(numerico(id("mezcla"), `${nombre} · Mezcla de ondas`, o.mezcla, 0, 1, 0.01));
    if (o.pulso !== undefined) defs.push(numerico(id("pulso"), `${nombre} · Pulsos`, o.pulso, 0, 20, 0.01, "Hz"));
    parametros.push(...defs);
    Object.assign(valores, valoresDeOscilador(o));
  });
  return { parametros, valores };
}

function deVisual(visual: Record<string, ValorVisual>): ParametrosAdaptados {
  const parametros: Parametro[] = [], valores: EstadoValores = {};
  for (const [clave, valor] of Object.entries(visual)) {
    const id = idDe(VISUAL, clave), nombre = nombreLegible(clave);
    parametros.push(typeof valor === "number"
      ? { id, nombre, tipo: "numero", defecto: valor }
      : typeof valor === "boolean"
        ? { id, nombre, tipo: "booleano", defecto: valor }
        : { id, nombre, tipo: "opcion", opciones: [valor], defecto: valor });
    valores[id] = valor;
  }
  return { parametros, valores };
}

function aEntonacion(e: EntonacionParam, valores: EstadoValores): EntonacionParam {
  const osciladores = e.osciladores.map((o): OsciladorParam => {
    const v = (campo: string, defecto: ValorParametro) => leer(valores, o.id, campo, defecto);
    return {
      ...o,
      f: numero(v("f", o.f), o.f), onda: onda(v("onda", o.onda), o.onda), vol: numero(v("vol", o.vol), o.vol),
      x: numero(v("x", o.x), o.x), y: numero(v("y", o.y), o.y), z: numero(v("z", o.z), o.z),
      ...(o.onda2 !== undefined ? { onda2: onda(v("onda2", o.onda2), o.onda2) } : {}),
      ...(o.mezcla !== undefined ? { mezcla: numero(v("mezcla", o.mezcla), o.mezcla) } : {}),
      ...(o.pulso !== undefined ? { pulso: numero(v("pulso", o.pulso), o.pulso) } : {}),
    };
  });
  return { osciladores, volumen: numero(leer(valores, ESTACION, "volumen", e.volumen), e.volumen) };
}

function aVisual(base: Record<string, ValorVisual>, valores: EstadoValores): Record<string, ValorVisual> {
  const visual: Record<string, ValorVisual> = {};
  for (const [clave, defecto] of Object.entries(base)) {
    const v = valores[idDe(VISUAL, clave)];
    visual[clave] = typeof v === typeof defecto ? v as ValorVisual : defecto;
  }
  return visual;
}
