/**
 * adaptador-estaciones — la entonación de una estación en vivo se mueve con el MISMO panel de la
 * Protomolécula (contrato §5, «Estaciones y canales»; §1, tabla de Estaciones).
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * Traduce `ParametrosSesion` (`estaciones/transmision-parametrica.ts`, el tipo REAL de Omnifrecuencias
 * y Audiomorphic) al esquema universal `Parametro` (`tipos.ts`) que mueven la mano, la IA, el dictado
 * y los mandos por la misma puerta, y su INVERSA devuelve una sesión de estación saneada desde los
 * valores del panel. Solo lo que el tipo real tiene: nada inventado.
 *
 * Módulo PURO: sin red, sin audio, sin DOM.
 *
 * Honesto (esbozo F3B): por oscilador se exponen 6 controles (frecuencia, volumen, onda y tres
 * posiciones). El pulso isocrónico, la segunda onda y las transiciones animadas también viven en el
 * tipo, pero aún no se exponen — no se finge control que no hay. La inversa reconstruye esos campos
 * a su valor base: mover el resto de las palancas no restaura una transición que antes había.
 */
import type { EstadoValores, Parametro, ValorParametro } from "./tipos";
import type { EntonacionParam, ParametrosSesion, OsciladorParam, ValorVisual } from "@/lib/estaciones/transmision-parametrica";
import { ONDAS, sanearEntonacion, sanearVisual } from "@/lib/estaciones/transmision-parametrica";

/** Átomo del volumen general de la entonación. */
export const ATOMO_ESTACION = "estacion";
/** Átomo de cada oscilador: `osc:<id>` para que jamás colisione con el átomo de la estación. */
const PREFIJO_OSC = "osc:";
/** Átomo de los parámetros visuales de Audiomorphic. */
export const ATOMO_VISUAL = "visual";

export interface ContenidoPanel {
  parametros: Parametro[];
  valores: EstadoValores;
}

const clave = (atomoId: string, parametroId: string): string => `${atomoId}::${parametroId}`;

/** Las 6 palancas de UN oscilador; el átomo va en las claves, no dentro del `Parametro`. */
const paramsOscilador = (o: OsciladorParam): Parametro[] => [
  { id: "frecuencia", nombre: "Frecuencia", tipo: "numero", min: 0.1, max: 24000, unidad: "Hz", defecto: o.f },
  { id: "volumen", nombre: "Volumen", tipo: "numero", min: 0, max: 1, defecto: o.vol },
  { id: "onda", nombre: "Onda", tipo: "opcion", opciones: [...ONDAS], defecto: o.onda },
  { id: "x", nombre: "Pan horizontal", tipo: "numero", min: -1, max: 1, defecto: o.x },
  { id: "y", nombre: "Altura", tipo: "numero", min: -1, max: 1, defecto: o.y },
  { id: "z", nombre: "Profundidad", tipo: "numero", min: -1, max: 1, defecto: o.z },
];

const esTexto = (v: ValorParametro): v is string => typeof v === "string";

/** La entonación (o la espiral) de una estación, para el panel universal, con sus valores vivos. */
export function parametrosDeSesion(p: ParametrosSesion): ContenidoPanel {
  if (p.tipo === "audiomorphic") {
    const parametros: Parametro[] = [];
    const valores: EstadoValores = {};
    for (const [k, v] of Object.entries(p.visual)) {
      if (esTexto(v)) {
        parametros.push({ id: k, nombre: k, tipo: "opcion", opciones: [v] });
      } else {
        parametros.push({ id: k, nombre: k, tipo: typeof v === "boolean" ? "booleano" : "numero" });
      }
      valores[clave(ATOMO_VISUAL, k)] = v;
    }
    return { parametros, valores };
  }
  const parametros: Parametro[] = [
    { id: "volumen", nombre: "Volumen general", tipo: "numero", min: 0, max: 1, defecto: p.entonacion.volumen },
  ];
  const valores: EstadoValores = { [clave(ATOMO_ESTACION, "volumen")]: p.entonacion.volumen };
  for (const o of p.entonacion.osciladores) {
    const atomo = `${PREFIJO_OSC}${o.id}`;
    parametros.push(...paramsOscilador(o));
    valores[clave(atomo, "frecuencia")] = o.f;
    valores[clave(atomo, "volumen")] = o.vol;
    valores[clave(atomo, "onda")] = o.onda;
    valores[clave(atomo, "x")] = o.x;
    valores[clave(atomo, "y")] = o.y;
    valores[clave(atomo, "z")] = o.z;
  }
  return { parametros, valores };
}

/** La inversa: de los valores del panel a una sesión de estación saneada. Null si no hay nada reconocible. */
export function sesionDeValores(valores: EstadoValores): ParametrosSesion | null {
  const visual: Record<string, ValorVisual> = {};
  const osciladores = new Map<string, OsciladorParam>();
  let volumenGeneral: number | null = null;
  for (const [c, v] of Object.entries(valores)) {
    const corte = c.indexOf("::");
    if (corte < 0) continue;
    const atomo = c.slice(0, corte);
    const param = c.slice(corte + 2);
    if (atomo === ATOMO_ESTACION) {
      if (param === "volumen" && typeof v === "number") volumenGeneral = v;
    } else if (atomo === ATOMO_VISUAL) {
      if (typeof v === "number" || typeof v === "boolean" || esTexto(v)) visual[param] = v;
    } else if (atomo.startsWith(PREFIJO_OSC) && atomo.slice(PREFIJO_OSC.length)) {
      const id = atomo.slice(PREFIJO_OSC.length);
      if (!osciladores.has(id)) osciladores.set(id, { id, f: NaN, onda: "sine", vol: 0.5, x: 0, y: 0, z: 0 });
      const o = osciladores.get(id) as OsciladorParam;
      if (param === "frecuencia" || param === "volumen" || param === "x" || param === "y" || param === "z") {
        if (typeof v === "number") {
          const campo = param === "frecuencia" ? "f" : param === "volumen" ? "vol" : (param as "x" | "y" | "z");
          o[campo] = v;
        }
      } else if (param === "onda" && esTexto(v)) {
        if ((ONDAS as readonly string[]).includes(v)) o.onda = v as OsciladorParam["onda"];
      }
    }
  }
  if (Object.keys(visual).length > 0) {
    const saneado = sanearVisual(visual);
    return saneado ? { tipo: "audiomorphic", visual: saneado } : null;
  }
  const lista = [...osciladores.values()].filter((o) => Number.isFinite(o.f));
  if (!lista.length) return null;
  const entonacion: EntonacionParam | null = sanearEntonacion({ osciladores: lista, volumen: volumenGeneral ?? 0.7 });
  return entonacion ? { tipo: "omnifrecuencias", entonacion } : null;
}
