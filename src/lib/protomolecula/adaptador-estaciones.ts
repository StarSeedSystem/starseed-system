/**
 * Adaptador de estaciones: la entonación de una estación se mueve con el mismo panel de la
 * Protomolécula (`Parametro` + `EstadoValores`) y vuelve a `ParametrosSesion` sin pérdida.
 * Módulo PURO: solo tipos de `estaciones/transmision-parametrica`.
 */
import type { EstadoValores, Parametro, ValorParametro } from "./tipos";
import { claveDe } from "./parametros";
import type { Onda, OsciladorParam, ParametrosSesion } from "@/lib/estaciones/transmision-parametrica";

export const ATOMO_ESTACION = "estacion";
const ONDAS: readonly Onda[] = ["sine", "square", "triangle", "sawtooth"];
export interface LienzoSesion { parametros: Parametro[]; valores: EstadoValores }

const clave = (parametroId: string): string => claveDe({ atomoId: ATOMO_ESTACION, parametroId });
const numero = (id: string, nombre: string, min: number, max: number, paso: number, unidad: Parametro["unidad"], defecto: number): Parametro =>
  ({ id, nombre, tipo: "numero", min, max, paso, unidad, defecto });
const opcion = (id: string, nombre: string, opciones: readonly string[], defecto: string): Parametro =>
  ({ id, nombre, tipo: "opcion", opciones: [...opciones], defecto });

/** Convierte la entonación o la espiral de una estación en controles y valores de la Protomolécula. */
export function parametrosDeSesion(p: ParametrosSesion): LienzoSesion {
  const parametros: Parametro[] = [];
  const valores: EstadoValores = {};
  const poner = (parametro: Parametro, valor: ValorParametro): void => {
    parametros.push(parametro);
    valores[clave(parametro.id)] = valor;
  };
  if (p.tipo === "audiomorphic") {
    for (const [id, v] of Object.entries(p.visual)) {
      if (typeof v === "number") poner(numero(id, id, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 0.01, undefined, v), v);
      else if (typeof v === "boolean") poner({ id, nombre: id, tipo: "booleano", defecto: v }, v);
      else poner(opcion(id, id, [v], v), v);
    }
    return { parametros, valores };
  }
  const e = p.entonacion;
  poner(numero("volumen", "Volumen general", 0, 1, 0.01, "", e.volumen), e.volumen);
  for (const o of e.osciladores) {
    const base = `oscilador:${o.id}`, nombre = o.nombre ?? o.id;
    poner(numero(`${base}:f`, `Frecuencia ${nombre}`, 0.1, 24000, 0.1, "Hz", o.f), o.f);
    poner(opcion(`${base}:onda`, `Onda ${nombre}`, ONDAS, o.onda), o.onda);
    poner(numero(`${base}:vol`, `Volumen ${nombre}`, 0, 1, 0.01, "", o.vol), o.vol);
    poner(numero(`${base}:x`, `Posición X ${nombre}`, -1, 1, 0.01, "", o.x), o.x);
    poner(numero(`${base}:y`, `Posición Y ${nombre}`, -1, 1, 0.01, "", o.y), o.y);
    poner(numero(`${base}:z`, `Posición Z ${nombre}`, -1, 1, 0.01, "", o.z), o.z);
    if (o.onda2 !== undefined) poner(opcion(`${base}:onda2`, `Segunda onda ${nombre}`, ONDAS, o.onda2), o.onda2);
    if (o.mezcla !== undefined) poner(numero(`${base}:mezcla`, `Mezcla de ondas ${nombre}`, 0, 1, 0.01, "", o.mezcla), o.mezcla);
    if (o.pulso !== undefined) poner(numero(`${base}:pulso`, `Pulsos por segundo ${nombre}`, 0, 100, 0.1, "Hz", o.pulso), o.pulso);
  }
  return { parametros, valores };
}

type CampoOscilador = (o: OsciladorParam, v: ValorParametro) => void;
const CAMPOS: Record<string, CampoOscilador> = {
  f: (o, v) => { if (typeof v === "number") o.f = v; },
  onda: (o, v) => { if (typeof v === "string" && (ONDAS as readonly string[]).includes(v)) o.onda = v as Onda; },
  vol: (o, v) => { if (typeof v === "number") o.vol = v; },
  x: (o, v) => { if (typeof v === "number") o.x = v; },
  y: (o, v) => { if (typeof v === "number") o.y = v; },
  z: (o, v) => { if (typeof v === "number") o.z = v; },
  onda2: (o, v) => { if (typeof v === "string" && (ONDAS as readonly string[]).includes(v)) o.onda2 = v as Onda; },
  mezcla: (o, v) => { if (typeof v === "number") o.mezcla = v; },
  pulso: (o, v) => { if (typeof v === "number") o.pulso = v; },
};

/** El inverso: reconstruye la sesión de la estación desde los controles y sus valores. */
export function sesionDeParametros({ parametros, valores }: LienzoSesion): ParametrosSesion | null {
  const valor = (id: string): ValorParametro | undefined => valores[clave(id)];
  if (parametros.some((p) => p.id === "volumen" || p.id.startsWith("oscilador:"))) {
    const osciladores = new Map<string, OsciladorParam>();
    for (const p of parametros) {
      const [pref, ...resto] = p.id.split(":");
      const campo = resto.pop();
      if (pref !== "oscilador" || !campo || !resto.length) continue;
      const v = valor(p.id);
      if (v === undefined) continue;
      const id = resto.join(":");
      const osc = osciladores.get(id) ?? { id, f: 432, onda: "sine" as Onda, vol: 0.5, x: 0, y: 0, z: 0 };
      osciladores.set(id, osc);
      CAMPOS[campo]?.(osc, v);
    }
    const volumen = valor("volumen");
    return { tipo: "omnifrecuencias", entonacion: { volumen: typeof volumen === "number" ? volumen : 0.7, osciladores: Array.from(osciladores.values()) } };
  }
  const visual: Record<string, ValorParametro> = {};
  for (const p of parametros) {
    const v = valor(p.id);
    if (v !== undefined) visual[p.id] = v;
  }
  return parametros.length ? { tipo: "audiomorphic", visual } : null;
}
