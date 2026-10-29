/**
 * Protomolécula · ADAPTADOR DE ESTACIONES (F3B, contrato §5 y §6.3).
 * La entonación de una estación se mueve con el MISMO panel de parámetros: `ParametrosSesion`
 * (solo lo que los tipos reales de `estaciones/` ya tienen) se aplana a `Parametro[]` + valores y
 * se reconstruye sin perder lo que el panel no toca. Módulo PURO: sin red, sin disco, sin `node:*`.
 */
import type { EstadoValores, Parametro, ParametroRef, ValorParametro } from "./tipos";
import { claveDe } from "./parametros";
import {
  ONDAS, type EntonacionParam, type OsciladorParam, type ParametrosSesion, type ValorVisual,
} from "@/lib/estaciones/transmision-parametrica";

export const ATOMO_ESTACION = "estacion";
const ref = (parametroId: string): ParametroRef => ({ atomoId: ATOMO_ESTACION, parametroId });
const campo = (id: string, c: string): string => `oscilador.${id}.${c}`;
const unidadHz: Parametro["unidad"] = "Hz";

function numero(id: string, nombre: string, min: number, max: number, paso: number, unidad?: Parametro["unidad"]): Parametro {
  return { id, nombre, tipo: "numero", min, max, paso, ...(unidad ? { unidad } : {}) };
}
function opcion(id: string, nombre: string, opciones: string[], defecto?: string): Parametro {
  return { id, nombre, tipo: "opcion", opciones, ...(defecto ? { defecto } : {}) };
}

export function parametrosDeSesion(p: ParametrosSesion): { parametros: Parametro[]; valores: EstadoValores } {
  const parametros: Parametro[] = [], valores: EstadoValores = {};
  const poner = (pr: Parametro, v: ValorParametro): void => {
    parametros.push(pr); valores[claveDe(ref(pr.id))] = v;
  };
  if (p.tipo === "audiomorphic") {
    for (const [k, v] of Object.entries(p.visual)) {
      const tipo: Parametro["tipo"] = typeof v === "boolean" ? "booleano" : typeof v === "string" ? "opcion" : "numero";
      poner({ id: `visual.${k}`, nombre: k, tipo, ...(tipo === "opcion" ? { opciones: [String(v)] } : {}) }, v);
    }
    return { parametros, valores };
  }
  poner(numero("volumen", "Volumen", 0, 1, 0.01), p.entonacion.volumen);
  for (const o of p.entonacion.osciladores) {
    const n = o.nombre?.trim() || o.id;
    poner(numero(campo(o.id, "f"), `${n} · Frecuencia`, 0, 20000, 1, unidadHz), o.f);
    poner(opcion(campo(o.id, "onda"), `${n} · Onda`, [...ONDAS], o.onda), o.onda);
    poner(numero(campo(o.id, "vol"), `${n} · Volumen`, 0, 1, 0.01), o.vol);
    poner(numero(campo(o.id, "x"), `${n} · Posición X`, -1, 1, 0.01), o.x);
    poner(numero(campo(o.id, "y"), `${n} · Posición Y`, -1, 1, 0.01), o.y);
    poner(numero(campo(o.id, "z"), `${n} · Posición Z`, -1, 1, 0.01), o.z);
    if (o.pulso !== undefined) poner(numero(campo(o.id, "pulso"), `${n} · Pulsos`, 0, 20, 0.1, unidadHz), o.pulso);
    if (o.mezcla !== undefined) poner(numero(campo(o.id, "mezcla"), `${n} · Mezcla`, 0, 1, 0.01), o.mezcla);
    if (o.onda2 !== undefined) poner(opcion(campo(o.id, "onda2"), `${n} · Segunda onda`, [...ONDAS], o.onda2), o.onda2);
  }
  return { parametros, valores };
}

export function parametrosDesdeValores(
  fuente: ParametrosSesion["tipo"],
  parametros: Parametro[],
  valores: EstadoValores,
  base?: ParametrosSesion | null,
): ParametrosSesion {
  if (fuente === "audiomorphic") {
    const visual: Record<string, ValorVisual> = base?.tipo === "audiomorphic" ? { ...base.visual } : {};
    for (const pr of parametros) {
      const v = valores[claveDe(ref(pr.id))];
      if (pr.id.startsWith("visual.") && v !== undefined) visual[pr.id.slice(7)] = v;
    }
    return { tipo: "audiomorphic", visual };
  }
  const entonBase: EntonacionParam | null = base?.tipo === "omnifrecuencias" ? base.entonacion : null;
  const porId = new Map<string, OsciladorParam>();
  for (const o of entonBase?.osciladores ?? []) porId.set(o.id, { ...o });
  for (const pr of parametros) {
    const partes = pr.id.split(".");
    if (partes.length !== 3 || partes[0] !== "oscilador") continue;
    const [, oid, c] = partes;
    const actual = porId.get(oid) ?? { id: oid, f: 440, onda: "sine", vol: 0.7, x: 0, y: 0, z: 0 };
    aplicarCampo(actual, c, valores[claveDe(ref(pr.id))]);
    porId.set(oid, actual);
  }
  const volumen = valores[claveDe(ref("volumen"))];
  return {
    tipo: "omnifrecuencias",
    entonacion: { osciladores: [...porId.values()], volumen: typeof volumen === "number" ? volumen : entonBase?.volumen ?? 0.7 },
  };
}

function aplicarCampo(o: OsciladorParam, c: string, v: ValorParametro | undefined): void {
  if (v === undefined) return;
  const esOnda = typeof v === "string" && (ONDAS as readonly string[]).includes(v);
  switch (c) {
    case "f": if (typeof v === "number") o.f = v; return;
    case "onda": if (esOnda) o.onda = v as OsciladorParam["onda"]; return;
    case "onda2": if (esOnda) o.onda2 = v as OsciladorParam["onda"]; return;
    case "vol": if (typeof v === "number") o.vol = v; return;
    case "x": if (typeof v === "number") o.x = v; return;
    case "y": if (typeof v === "number") o.y = v; return;
    case "z": if (typeof v === "number") o.z = v; return;
    case "pulso": if (typeof v === "number") o.pulso = v; return;
    case "mezcla": if (typeof v === "number") o.mezcla = v; return;
  }
}
