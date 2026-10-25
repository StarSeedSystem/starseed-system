/**
 * adaptador-estaciones — la entonación de una estación en vivo se mueve con el MISMO panel de
 * parámetros de la Protomolécula (contrato §5, fila «Estaciones y canales»; PM1010F3B).
 * Solo usa los tipos reales de `estaciones/transmision-parametrica.ts`: `ParametrosSesion` con
 * omnifrecuencias (volumen + osciladores) o audiomorphic (mapa visual). Módulo PURO: sin red.
 *
 * Ida:   parametrosDeSesion(p) → {parametros, valores} del panel (por `atomoId::parametroId`).
 * Vuelta: sesionDeValores(p, valores) → la misma sesión con los valores del panel aplicados y
 *         re-saneada (nunca devolvemos nada que `sanearEntonacion`/`sanearVisual` rechacen).
 */
import type { Parametro, EstadoValores, ValorParametro } from "./tipos";
import type {
  ParametrosSesion,
  EntonacionParam,
  OsciladorParam,
  ValorVisual,
} from "@/lib/estaciones/transmision-parametrica";
import { sanearEntonacion, sanearVisual } from "@/lib/estaciones/transmision-parametrica";

export interface AdaptacionEstacion {
  parametros: Parametro[];
  valores: EstadoValores;
}

const clave = (atomo: string, parametro: string) => `${atomo}::${parametro}`;
const num = (v: ValorParametro | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Parámetros y valores de TODA una sesión paramétrica (la entonación bajo el panel común). */
export function parametrosDeSesion(p: ParametrosSesion): AdaptacionEstacion {
  if (p.tipo === "audiomorphic") {
    const parametros: Parametro[] = [];
    const valores: EstadoValores = {};
    for (const [k, v] of Object.entries(p.visual)) {
      const esOp = typeof v === "string";
      parametros.push({
        id: k, nombre: k, tipo: esOp ? "opcion" : typeof v === "boolean" ? "booleano" : "numero",
        opciones: esOp ? [v as string] : undefined, defecto: v,
      });
      valores[clave("visual", k)] = v;
    }
    return { parametros, valores };
  }
  const parametros: Parametro[] = [
    { id: "volumen", nombre: "Volumen", tipo: "numero", min: 0, max: 1, paso: 0.01, defecto: p.entonacion.volumen },
  ];
  const valores: EstadoValores = { [clave("estacion", "volumen")]: p.entonacion.volumen };
  p.entonacion.osciladores.forEach((o, i) => {
    const atomo = `osc:${i}`;
    const titulo = o.nombre ? `«${o.nombre}»` : `Oscilador ${i + 1}`;
    const conPulso = o.pulso !== undefined;
    parametros.push(
      { id: "f", nombre: `${titulo} · frecuencia`, tipo: "numero", min: 0.1, max: 24_000, paso: 0.01, unidad: "Hz", defecto: o.f },
      { id: "vol", nombre: `${titulo} · volumen`, tipo: "numero", min: 0, max: 1, paso: 0.01, defecto: o.vol },
      { id: "x", nombre: `${titulo} · izquierda/derecha`, tipo: "numero", min: -1, max: 1, paso: 0.01, defecto: o.x },
      { id: "y", nombre: `${titulo} · abajo/arriba`, tipo: "numero", min: -1, max: 1, paso: 0.01, defecto: o.y },
      { id: "z", nombre: `${titulo} · detrás/delante`, tipo: "numero", min: -1, max: 1, paso: 0.01, defecto: o.z },
    );
    if (conPulso) parametros.push({ id: "pulso", nombre: `${titulo} · pulsos`, tipo: "numero", min: 0, max: 40, paso: 0.5, unidad: "Hz", defecto: o.pulso });
    Object.assign(valores, {
      [clave(atomo, "f")]: o.f, [clave(atomo, "vol")]: o.vol,
      [clave(atomo, "x")]: o.x, [clave(atomo, "y")]: o.y, [clave(atomo, "z")]: o.z,
    });
    if (conPulso) valores[clave(atomo, "pulso")] = o.pulso as number;
  });
  return { parametros, valores };
}

/* ═══ Vuelta ═══ */

/** Aplica los valores del panel a la sesión y la re-sanea; null si lo que sale no es aceptable. */
export function sesionConValores(p: ParametrosSesion, valores: EstadoValores): ParametrosSesion | null {
  if (p.tipo === "audiomorphic") {
    const nuevo: Record<string, ValorVisual> = {};
    for (const [k, v] of Object.entries(p.visual)) {
      const del = valores[clave("visual", k)];
      nuevo[k] = del !== undefined && (typeof del === typeof v) ? (del as ValorVisual) : v;
    }
    const visual = sanearVisual(nuevo);
    return visual ? { tipo: "audiomorphic", visual } : null;
  }
  const e: EntonacionParam = p.entonacion;
  const volumen = num(valores[clave("estacion", "volumen")]);
  const osciladores: OsciladorParam[] = e.osciladores.map((o, i) => {
    const atomo = `osc:${i}`;
    const f = num(valores[clave(atomo, "f")]);
    const out: OsciladorParam = {
      ...o,
      f: f ?? o.f,
      vol: num(valores[clave(atomo, "vol")]) ?? o.vol,
      x: num(valores[clave(atomo, "x")]) ?? o.x,
      y: num(valores[clave(atomo, "y")]) ?? o.y,
      z: num(valores[clave(atomo, "z")]) ?? o.z,
    };
    const pulso = num(valores[clave(atomo, "pulso")]);
    if (pulso !== null) out.pulso = pulso;
    return out;
  });
  const entonacion = sanearEntonacion({ osciladores, volumen: volumen ?? e.volumen });
  return entonacion ? { tipo: "omnifrecuencias", entonacion } : null;
}

