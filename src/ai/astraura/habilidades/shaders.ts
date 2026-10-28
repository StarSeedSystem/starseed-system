import type { ShaderPreset } from "@/lib/appearance/background-layers";
import type { ShaderCatalog } from "@/lib/appearance/catalogo-shaders";
import { FORMATO_SET, validarSet } from "@/lib/appearance/sets-fondo";

/**
 * Shaders · Habilidad para crear fondos describiéndolos (Ola 1018F · FSH1018Q), a partir de
 * vendor/habilidades/shaders (MIT, Shader Effects Inc.), con la forma de las tarjetas de LYS1018I.
 * `presetDesdeRespuesta` extrae el JSON del modelo y lo valida con `sets-fondo.ts`: solo tipos del
 * catálogo, sin cámara ni recursos ajenos. El fondo actual (Spline por defecto) sigue siendo el
 * principal; telemetría siempre apagada. Módulo PURO: sin red, disco, reloj ni GPU.
 */

export const MAX_PALABRAS_TARJETA = 60;
export const MAX_PALABRAS_RESUMEN = 120;

export const ATRIBUCION_SHADERS =
  "Habilidad de Shaders de Shader Effects Inc. (github.com/shader-effects-inc/shaders), licencia MIT.";

export interface HabilidadShaders {
  /** Igual al `name` del SKILL.md original. */
  id: string;
  nombre: string;
  /** Cuándo aplica, en una frase. */
  cuando: string;
  /** ≤ 60 palabras (Needle y BitNet) y ≤ 120 (cerebro de Aurora). */
  tarjeta: string;
  resumen: string;
  /** Ruta del SKILL.md original, relativa a la raíz del repositorio. */
  rutaCompleta: string;
  licencia: "MIT";
  autor: "Shader Effects Inc.";
}

export const HABILIDAD_SHADERS: HabilidadShaders = {
  id: "shaders",
  nombre: "Shaders · Fondos WebGPU describiéndolos",
  cuando: "Cuando la persona pide crear, cambiar o imaginar un fondo animado (degradado, aurora, ruido, vidrio, luz, distorsión o partículas) y quiere describirlo en vez de ajustarlo a mano.",
  tarjeta:
    "Convierte una descripción en un preset de fondo de Shaders: JSON con componentes apilados en orden, del fondo al frente. Usa solo componentes del catálogo instalado y props reales; el motor base (Spline) sigue debajo. Sin presets ni recursos de shaders.com, sin telemetría y sin cámara salvo permiso explícito y nunca en un fondo compartido.",
  resumen:
    "Shaders pinta fondos WebGPU como capas que se mezclan en la GPU. Para crear uno describiéndolo, devuelve solo un preset JSON: components con type, id, props y children, en orden del fondo al frente, más structureVersion si hace falta. Usa exclusivamente componentes y propiedades del catálogo de la versión instalada, con colores hex y tamaños en uv o px. El fondo actual (motor base, Spline por defecto) sigue siendo la opción principal y la capa de abajo. Nunca inventes props ni uses presets, recursos o muestras de shaders.com: los presets son nuestros. La telemetría va siempre apagada. La cámara (WebcamTexture, ObjectTracker) solo con permiso explícito y nunca en un fondo compartido.",
  rutaCompleta: "vendor/habilidades/shaders/SKILL.md",
  licencia: "MIT",
  autor: "Shader Effects Inc.",
};

export interface OpcionesPreset {
  catalogo: ShaderCatalog;
  /** Prefijos de la propia Biblioteca, para las texturas que traiga el preset. */
  biblioteca?: readonly string[];
}
export type ResultadoPreset = { ok: true; preset: ShaderPreset } | { ok: false; motivos: string[] };
export function contarPalabras(texto: string): number {
  return texto.trim().split(/\s+/).filter(Boolean).length;
}

type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const CÁMARA = ["WebcamTexture", "ObjectTracker"];
const FECHA = "2026-10-18T00:00:00.000Z"; // fija: el preset no depende del reloj

/** Objetos y listas JSON válidos de un trozo de texto, con llaves equilibradas y respetando cadenas. */
function jsonsDe(t: string): unknown[] {
  const salida: unknown[] = [];
  const pila: string[] = [];
  let inicio = -1, cadena = false, escape = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (cadena) { if (escape) escape = false; else if (c === "\\") escape = true; else if (c === '"') cadena = false; }
    else if (c === '"') cadena = true;
    else if (c === "{" || c === "[") { if (!pila.length) inicio = i; pila.push(c === "{" ? "}" : "]"); }
    else if (c === "}" || c === "]") {
      if (!pila.length || pila[pila.length - 1] !== c) { pila.length = 0; inicio = -1; continue; }
      pila.pop();
      if (!pila.length && inicio >= 0) {
        try { salida.push(JSON.parse(t.slice(inicio, i + 1))); } catch { /* no era JSON: se sigue buscando */ }
        inicio = -1;
      }
    }
  }
  return salida;
}

/** Trozos donde puede venir el preset: primero los bloques de código y luego el texto entero. */
function candidatos(texto: string): unknown[] {
  const trozos = [...texto.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  return [...trozos, texto].flatMap(jsonsDe);
}

/** `WebcamTexture` y `ObjectTracker` no entran nunca en un preset generado: la cámara no es cosa de un modelo. */
function usaCamara(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(usaCamara);
  if (!esObj(v)) return false;
  if (typeof v.type === "string" && CÁMARA.includes(v.type)) return true;
  return Array.isArray(v.children) && v.children.some(usaCamara);
}

function revisar(valor: unknown, o: OpcionesPreset): ResultadoPreset {
  const preset: unknown = Array.isArray(valor) ? { components: valor } : esObj(valor) && Array.isArray(valor.components) ? valor : null;
  if (!preset) return { ok: false, motivos: ["el JSON no trae una lista «components»"] };
  if (usaCamara(preset)) return { ok: false, motivos: ["la cámara no puede entrar en un preset de Astraura"] };
  // La capa shader se valida con las mismas reglas que un set: tipos del catálogo, URLs y tamaño.
  const envoltorio = { formato: FORMATO_SET, version: 1, id: "preset-astraura", nombre: "Preset de Astraura", autor: "Astraura",
    licencias: [], base: null, capas: [{ id: "preset", kind: "shader", preset }], creado: FECHA };
  const r = validarSet(envoltorio, { catalogo: o.catalogo, ...(o.biblioteca ? { biblioteca: o.biblioteca } : {}), compartido: true });
  if (!r.ok) return { ok: false, motivos: r.motivos };
  const limpio = r.set.capas[0]?.preset;
  return limpio && limpio.components.length ? { ok: true, preset: limpio } : { ok: false, motivos: ["el preset no trae componentes"] };
}

export function presetDesdeRespuesta(texto: string, opciones: OpcionesPreset): ResultadoPreset {
  if (typeof texto !== "string" || texto.trim() === "") return { ok: false, motivos: ["la respuesta está vacía"] };
  const motivos: string[] = [];
  for (const valor of candidatos(texto)) {
    const r = revisar(valor, opciones);
    if (r.ok) return r;
    motivos.push(...r.motivos);
  }
  return { ok: false, motivos: [...new Set(motivos.length ? motivos : ["no hay ningún JSON de preset en la respuesta"])].slice(0, 6) };
}
