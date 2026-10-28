/**
 * Protomolécula · Átomo «Fondo con Shaders» (Ola 1018F · FSH1018O). Contrato:
 * architecture/fondos-shaders.md §2–§3 y protomolecula.md §11.1. El plan es PURO: no importa
 * `shaders/js` ni `shaders/registry` (solo cliente y dinámico), no pide GPU ni red y no usa
 * presets de shaders.com. `base: null` conserva el motor actual (Spline), que sigue mandando.
 */
import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import type { ValorParametro } from "@/lib/protomolecula/tipos";
import type { BackgroundLayer, DifusionConfig } from "@/lib/appearance/background-layers";
import { FORMATO_SET, LICENCIA_SHADERS, type SetFondo } from "@/lib/appearance/sets-fondo";
interface EfectoFondo { type: string; nombre: string; props: Record<string, unknown> }
/** Efectos del catálogo `shaders` 4.0.4 con sus props por defecto (los del registro instalado). */
export const EFECTOS_FONDO = {
  aurora: { type: "Aurora", nombre: "Aurora", props: { colorA: "#a533f8", colorB: "#22ee88", colorC: "#1694e8", intensity: 80, speed: 5, curtainCount: 4, seed: 0 } },
  cristal: { type: "Crystal", nombre: "Cristal", props: { refraction: 0.5, dispersion: 0.5, facets: 5, brightness: 1.2, tintColor: "#e8e0ff" } },
  cromo: { type: "Chrome", nombre: "Cromo", props: { tint: "#ffffff", environment: 1, spectral: 0.9, speed: 0.5 } },
  "metal-cepillado": { type: "BrushedMetal", nombre: "Metal cepillado", props: { lightColor: "#e9ebef", darkColor: "#26282d", roughness: 0.5, brushAngle: 0 } },
  haz: { type: "Beam", nombre: "Haz de luz", props: { insideColor: "#ff0000", outsideColor: "#0000ff", startThickness: 0.2, endThickness: 0.2 } },
  bokeh: { type: "BokehBlur", nombre: "Bokeh", props: { radius: 50, highlightGain: 4, bladeShape: "blades" } },
  turbulencia: { type: "CurlNoise", nombre: "Turbulencia", props: { colorA: "#ffffff", colorB: "#000000", scale: 2, speed: 1, seed: 0 } },
  aberracion: { type: "ChromaticAberration", nombre: "Aberración", props: { strength: 0.2, angle: 0 } },
  gradiente: { type: "LinearGradient", nombre: "Degradado", props: { colorA: "#1aff00", colorB: "#0000ff", angle: 0 } },
} as const satisfies Record<string, EfectoFondo>;
export type EfectoFondoId = keyof typeof EFECTOS_FONDO;

/** Claves numéricas continuas que se pueden escalar (con su rango real); el resto no se toca. */
const ESCALABLES: Record<string, readonly [number, number]> = {
  intensity: [0, 100], speed: [-10, 10], strength: [0, 1], brightness: [0.5, 3], environment: [0, 2],
  roughness: [0, 1], radius: [0, 100], highlightGain: [0, 10], refraction: [0, 3], dispersion: [0, 2], scale: [-2, 5],
};
const HEX = /^#[0-9a-f]{3,8}$/i, COLOR = /color|tint|light|dark/i;
const acotar = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(v * 1000) / 1000));
export const FONDO_SHADER: DefinicionAtomo = {
  herramientaId: "shaders",
  nombre: "Fondo con Shaders",
  categoria: "imagen",
  integracion: "libreria-js",
  control: "total",
  parametros: [
    { id: "efecto", nombre: "Efecto", tipo: "opcion", opciones: Object.keys(EFECTOS_FONDO), defecto: "aurora", sinonimos: ["fondo", "shader", "efecto de fondo"] },
    { id: "props", nombre: "Props del catálogo", tipo: "numero", min: 0, max: 200, paso: 5, unidad: "%", defecto: 100, sinonimos: ["intensidad", "fuerza", "ajuste"] },
    { id: "capas", nombre: "Capas de shader", tipo: "entero", min: 1, max: 8, paso: 1, defecto: 2, sinonimos: ["número de capas", "capas"] },
    { id: "difusion", nombre: "Difusión", tipo: "opcion", opciones: ["ninguna", "transparente", "desenfoque", "blanco", "negro", "tono"], defecto: "ninguna", sinonimos: ["difuminado", "desenfoque"] },
    { id: "alcance", nombre: "Alcance", tipo: "opcion", opciones: ["perfil", "app", "pagina", "seccion"], defecto: "perfil", sinonimos: ["ámbito", "dónde se aplica"] },
  ],
  entradas: ["imagen", "datos"],
  salidas: ["starseed-fondo"],
  ficha: { web: "https://github.com/shader-effects-inc/shaders", repo: "shader-effects-inc/shaders", licencia: "MIT" },
};

/** Cualquier renderizador de este átomo va en cliente y con la telemetría apagada (§1). */
export const OPCIONES_RENDER_SHADER = { disableTelemetry: true, observeElement: false } as const;
const param = (id: string) => FONDO_SHADER.parametros.find((p) => p.id === id);
function opcionDe(valores: Record<string, ValorParametro | undefined> | undefined, id: string): string {
  const p = param(id), v = String(valores?.[id] ?? "");
  return p?.opciones?.includes(v) ? v : String(p?.defecto ?? "");
}
function numeroDe(valores: Record<string, ValorParametro | undefined> | undefined, id: string): number {
  const p = param(id), v = valores?.[id];
  const n = typeof v === "number" && Number.isFinite(v) ? v : Number(p?.defecto ?? 0);
  return p?.min !== undefined && p.max !== undefined ? acotar(n, p.min, p.max) : n;
}
/** Props del efecto: solo claves que el catálogo declara, con escala y overrides seguros. */
export function propsDeEfecto(efecto: EfectoFondoId, escala: number, override?: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(EFECTOS_FONDO[efecto].props)) {
    const rango = ESCALABLES[clave];
    let v: unknown = typeof valor === "number" && rango && escala !== 1 ? acotar(valor * escala, rango[0], rango[1]) : valor;
    const o = override?.[clave];
    if (typeof o === "number" && rango && Number.isFinite(o)) v = acotar(o, rango[0], rango[1]);
    else if (typeof o === "string" && typeof valor === "string" && HEX.test(o) && COLOR.test(clave)) v = o;
    salida[clave] = v;
  }
  return salida;
}

const TRANSFORM = { x: 0, y: 0, escala: 1, rotacion: 0, ancho: 1, alto: 1 } as const;
function capaShader(efecto: EfectoFondoId, props: Record<string, unknown>, i: number): BackgroundLayer {
  const def = EFECTOS_FONDO[efecto], p = { ...props };
  if (typeof p.seed === "number" && i > 0) p.seed = (p.seed + i * 17) % 100;
  return { id: `shader-${i + 1}`, kind: "shader", name: i === 0 ? def.nombre : `${def.nombre} ${i + 1}`,
    visible: true, opacity: i === 0 ? 1 : 0.35, blend: i === 0 ? "normal" : "screen",
    preset: { components: [{ type: def.type, id: `efecto-${i + 1}`, props: p }] }, transform: { ...TRANSFORM }, mascara: "ninguna" };
}
function capaDifusion(modo: DifusionConfig["modo"], tono: string): BackgroundLayer {
  return { id: "difusion", kind: "difusion", name: "Difusión", visible: true, opacity: 1, blend: "normal",
    difusion: { modo, desenfoquePx: modo === "desenfoque" ? 24 : 0, opacidad: 1, textura: "ninguna", ...(modo === "tono" ? { tono } : {}) },
    transform: { ...TRANSFORM }, mascara: "ninguna" };
}
export interface EntradaFondo {
  id: string; autor: string; creado: string; nombre?: string;
  valores?: Record<string, ValorParametro | undefined>;
  /** Props exactas del catálogo; solo se aceptan claves declaradas y valores seguros. */
  props?: Record<string, unknown>;
}

const ID = /^[\w-]{1,64}$/;
const FECHA = (s: string): string => (Number.isNaN(Date.parse(s)) ? "1970-01-01T00:00:00.000Z" : new Date(s).toISOString());

/** El plan PURO: mismos valores, mismo set. El alcance se resuelve aparte con `alcanceDe`. */
export function planFondo(e: EntradaFondo): SetFondo {
  const efecto = opcionDe(e.valores, "efecto") as EfectoFondoId, def = EFECTOS_FONDO[efecto];
  const props = propsDeEfecto(efecto, numeroDe(e.valores, "props") / 100, e.props);
  const capas = Array.from({ length: Math.round(numeroDe(e.valores, "capas")) }, (_, i) => capaShader(efecto, props, i));
  const difusion = opcionDe(e.valores, "difusion");
  if (difusion !== "ninguna") {
    const color = Object.entries(props).find(([k, v]) => typeof v === "string" && HEX.test(v) && COLOR.test(k))?.[1];
    capas.push(capaDifusion(difusion as DifusionConfig["modo"], typeof color === "string" ? color : "#ffffff"));
  }
  return { formato: FORMATO_SET, version: 1, id: ID.test(e.id) ? e.id : "fondo-shaders", nombre: e.nombre?.trim() || def.nombre,
    autor: e.autor, licencias: [LICENCIA_SHADERS], base: null, capas, creado: FECHA(e.creado) };
}

export const ALCANCES_FONDO = ["perfil", "app", "pagina", "seccion"] as const;
export type AlcanceFondo = (typeof ALCANCES_FONDO)[number];
/** Dónde se aplica el set (perfil › app › página › sección): lo más concreto gana. */
export function alcanceDe(valores?: Record<string, ValorParametro | undefined>): AlcanceFondo {
  const v = String(valores?.alcance ?? "");
  return (ALCANCES_FONDO as readonly string[]).includes(v) ? (v as AlcanceFondo) : "perfil";
}
