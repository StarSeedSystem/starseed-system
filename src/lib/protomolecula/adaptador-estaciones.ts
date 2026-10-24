/**
 * adaptador-estaciones — la entonación de una estación se mueve con el MISMO panel (F3 · PM1010F3B).
 * Contrato: `architecture/protomolecula.md` §5 «Estaciones y canales» (adaptador
 * ParametrosSesion → Parametro[]). Puente: el modelo REAL de estaciones en vivo
 * (`estaciones/transmision-parametrica.ts`) se muestra como la superficie de control
 * universal del núcleo (`protomolecula/tipos.ts`) y la vuelta lo responde.
 * IDA (`parametrosDeSesion`): declara los parámetros y sus valores de fábrica.
 * VUELTA (`sesionDesdeParametros`): parte de la base SANEADA y de los valores del panel,
 * y reconstruye la estación; lo que el panel no tocó queda igual que en la base.
 * PURO: sin audio, sin red, sin DOM.
 */
import type { ParametrosSesion, OsciladorParam, Onda, ValorVisual } from "@/lib/estaciones/transmision-parametrica";
import type { Parametro, EstadoValores, ValorParametro } from "../tipos";

export const PREFIJO_OSC = "osc-";
export const ATOMO_SALA = "sala";
export const ATOMO_VISUAL = "visual";

/** El átomo es cada oscilador: el dictado desambigua con su nombre. Opciones en claro. */
const ONDAS_TEXTO: Record<Onda, string> = { sine: "senoidal", square: "cuadrada", triangle: "triangular", sawtooth: "sierra" };

export interface SesionParametrizada { parametros: Parametro[]; valores: EstadoValores }

const numeroDe = (v: ValorParametro | undefined, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : d;

function parametrosDeOscilador(o: OsciladorParam, parametros: Parametro[], valores: EstadoValores): void {
  const a = `${PREFIJO_OSC}${o.id}`;
  const defs: Parametro[] = [
    { id: "frecuencia", nombre: "Frecuencia", tipo: "numero", min: 0.1, max: 24000, paso: 1, unidad: "Hz", defecto: o.f },
    { id: "volumen", nombre: "Volumen", tipo: "numero", min: 0, max: 1, paso: 0.01, defecto: o.vol },
    { id: "x", nombre: "Pan horizontal", tipo: "numero", min: -1, max: 1, paso: 0.05, defecto: o.x },
    { id: "y", nombre: "Pan vertical", tipo: "numero", min: -1, max: 1, paso: 0.05, defecto: o.y },
    { id: "z", nombre: "Profundidad", tipo: "numero", min: -1, max: 1, paso: 0.05, defecto: o.z },
    { id: "forma", nombre: "Forma de onda", tipo: "opcion", opciones: Object.values(ONDAS_TEXTO), defecto: ONDAS_TEXTO[o.onda] },
  ];
  if (o.pulso !== undefined) defs.push({ id: "pulsos", nombre: "Pulsos", tipo: "numero", min: 0, max: 40, paso: 0.5, unidad: "Hz", defecto: o.pulso });
  if (o.mezcla !== undefined) defs.push({ id: "mezcla", nombre: "Mezcla de ondas", tipo: "numero", min: 0, max: 1, paso: 0.01, defecto: o.mezcla });
  for (const d of defs) {
    parametros.push(d);
    valores[`${a}::${d.id}`] = d.defecto as ValorParametro;
  }
}

export function parametrosDeSesion(p: ParametrosSesion): SesionParametrizada {
  const parametros: Parametro[] = [];
  const valores: EstadoValores = {};
  if (p.tipo === "omnifrecuencias") {
    parametros.push({ id: "volumen", nombre: "Volumen general", tipo: "numero", min: 0, max: 1, paso: 0.01, defecto: p.entonacion.volumen });
    valores[`${ATOMO_SALA}::volumen`] = p.entonacion.volumen;
    for (const o of p.entonacion.osciladores) parametrosDeOscilador(o, parametros, valores);
    return { parametros, valores };
  }
  let n = 0;
  for (const [k, v] of Object.entries(p.visual)) {
    if (n >= 64) break;
    const def = typeof v === "number" ? { tipo: "numero" as const }
      : typeof v === "boolean" ? { tipo: "booleano" as const }
      : { tipo: "opcion" as const, opciones: [v] };
    parametros.push({ id: k, nombre: k, ...def, defecto: v });
    valores[`${ATOMO_VISUAL}::${k}`] = v;
    n++;
  }
  return { parametros, valores };
}

function osciladorDeValores(o: OsciladorParam, valores: EstadoValores): OsciladorParam {
  const v = (id: string): ValorParametro | undefined => valores[`${PREFIJO_OSC}${o.id}::${id}`];
  const textoOnda = v("forma");
  const ondaDe = (Object.entries(ONDAS_TEXTO) as Array<[Onda, string]>).find(([, t]) => t === textoOnda)?.[0];
  const fuera: OsciladorParam = { ...o, onda: ondaDe ?? o.onda };
  fuera.f = numeroDe(v("frecuencia"), o.f);
  fuera.vol = numeroDe(v("volumen"), o.vol);
  fuera.x = numeroDe(v("x"), o.x);
  fuera.y = numeroDe(v("y"), o.y);
  fuera.z = numeroDe(v("z"), o.z);
  if (o.pulso !== undefined) fuera.pulso = numeroDe(v("pulsos"), o.pulso);
  if (o.mezcla !== undefined) fuera.mezcla = numeroDe(v("mezcla"), o.mezcla);
  return fuera;
}

export function sesionDesdeParametros(base: ParametrosSesion, valores: EstadoValores): ParametrosSesion {
  if (base.tipo === "omnifrecuencias") {
    return {
      tipo: "omnifrecuencias",
      entonacion: {
        osciladores: base.entonacion.osciladores.map((o) => osciladorDeValores(o, valores)),
        volumen: Math.min(1, Math.max(0, numeroDe(valores[`${ATOMO_SALA}::volumen`], base.entonacion.volumen))),
      },
    };
  }
  const visual: Record<string, ValorVisual> = {};
  for (const [k, v] of Object.entries(base.visual)) {
    const r = valores[`${ATOMO_VISUAL}::${k}`];
    if (typeof v === "string") visual[k] = typeof r === "string" ? r : v;
    else if (typeof v === "boolean") visual[k] = typeof r === "boolean" ? r : v;
    else visual[k] = numeroDe(r, v);
  }
  return { tipo: "audiomorphic", visual };
}
