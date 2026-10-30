import type { SkillCapability } from "@/ai/astraura/skills";
import { createLayer, type ShaderPreset } from "@/lib/appearance/background-layers";
import { exportarSet, validarSet, type DatosSet, type OpcionesSet, type SetFondo } from "@/lib/appearance/sets-fondo";

/**
 * Shaders · habilidad para Astraura: crear un fondo describiéndolo (Ola 1018F · tarea Q,
 * architecture/fondos-shaders.md §6). Asienta en la skill MIT copiada en
 * `vendor/habilidades/shaders/` (SKILL.md y components.md del paquete npm `shaders`):
 * la TARJETA (≤ 60 palabras) va a Needle y BitNet, el RESUMEN (≤ 120) a Bonsai pequeño
 * y la ruta COMPLETA a las capas razón, profunda y nube. `presetDesdeRespuesta` extrae
 * y valida con `sets-fondo.ts` el JSON que devuelve un modelo —set completo o preset
 * `{ components, structureVersion }`— y lo envuelve en un `.starseed-fondo.json` listo
 * para la Biblioteca. Módulo PURO: solo datos y funciones sin red, disco ni reloj.
 */

export const MAX_PALABRAS_TARJETA = 60, MAX_PALABRAS_RESUMEN = 120;

export const ATRIBUCION_SHADERS =
  "Skill Shaders de Shader Effects Inc. (github.com/shader-effects-inc/shaders), licencia MIT.";

export interface HabilidadShaders {
  /** Igual al `name` del SKILL.md original. */
  id: string;
  nombre: string;
  /** Cuándo aplica, en una frase. */
  cuando: string;
  /** ≤ 60 palabras, para Needle y BitNet. */
  tarjeta: string;
  /** ≤ 120 palabras, para Bonsai pequeño. */
  resumen: string;
  /** Ruta del SKILL.md original, relativa a la raíz del repositorio. */
  rutaCompleta: string;
  licencia: "MIT";
  autor: "Shaders";
}

export const HABILIDAD_SHADERS: HabilidadShaders = {
  id: "shaders",
  nombre: "Shaders · Fondos WebGPU descritos",
  cuando: "Cuando la persona pide un fondo nuevo —animado, degradado, aurora, vidrio, ruido, partículas o luz— y lo describe con palabras.",
  tarjeta: "Crea el fondo que la persona describe con el paquete MIT «shaders»: generadores (degradado, malla, ruido a media pinta) y efectos hermanos en un preset JSON de components.md; nada de presets Pro de shaders.com ni inventar props. Sobre el motor base actual, sin cámara y con la URL de la muestra en la Biblioteca, y telemetría apagada.",
  resumen: "La composición: primero generadores (LinearGradient, MeshGradient, Aurora, ruido a baja opacidad) y encima efectos hermanos (Blur, Vignette, CursorTrail) que transforman lo dibujado antes. Props universales en cada capa: blendMode, opacity, maskSource con capa oculta, boundingBox en uv o px, y props dinámicos (auto-animate, mouse-position, map). El catálogo son las componentes de components.md: no se inventan nombres ni props; si el efecto no cabe, WGSL propio con defineShader. Solo WebGPU: sin GPU ni «reducir movimiento», vista previa fija. Nunca presets Pro de shaders.com, ni WebcamTexture u ObjectTracker sin permiso explícito, ni URLs fuera de la Biblioteca; telemetría siempre apagada. Devuelve el preset JSON y Astraura lo valida con sets-fondo y lo envuelve en un .starseed-fondo.json, respetando el motor base actual.",
  rutaCompleta: "vendor/habilidades/shaders/SKILL.md",
  licencia: "MIT",
  autor: "Shaders",
};

const esObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Candidatos JSON de una respuesta: cada valla ```json``` y el primer objeto de la prosa. */
export function candidatosJson(texto: string): string[] {
  const out: string[] = [];
  for (const m of texto.matchAll(/```(?:json|shaders|fondo)?\s*\n?([\s\S]*?)```/g)) out.push(m[1]);
  const i = texto.indexOf("{");
  if (i >= 0) { const j = texto.lastIndexOf("}"); if (j > i) out.push(texto.slice(i, j + 1)); }
  out.push(texto.trim());
  return out;
}

/** Primera objeto JSON útil de la respuesta del modelo, o undefined si no lleva ninguno. */
export function extraerJson(texto: string): Record<string, unknown> | undefined {
  for (const c of candidatosJson(texto)) {
    try {
      const j: unknown = JSON.parse(c);
      if (esObj(j)) return j;
    } catch { /* candidato siguiente */ }
  }
  return undefined;
}

export interface OpcionesPreset extends OpcionesSet {
  /** Nombre y autoría del set que envuelve el preset si la respuesta no los trae. */
  nombre?: string;
  autor?: string;
  /** Reloj e id: solo en pruebas. */
  ahora?: () => Date;
  crearId?: () => string;
}

export type RespuestaPreset = { ok: true; set: SetFondo; json: string; archivo: string } | { ok: false; motivos: string[] };

/** Extrae y valida con `sets-fondo.ts` el JSON que devuelve un modelo (set completo, con
 *  `formato`/`capas`, o preset `components`). Por defecto `compartido: true`: el modelo no
 *  puede pedir cámara solo porque sí, y quien llama la permite a mano (compartido: false)
 *  tras el permiso explícito de la persona. El motor base NUNCA lo cambia el preset
 *  (base null = el fondo actual de la persona), porque sigue siendo la opción principal. */
export function presetDesdeRespuesta(texto: string, o: OpcionesPreset): RespuestaPreset {
  const op: OpcionesPreset = { compartido: true, ...o };
  const j = extraerJson(texto);
  if (!j) return { ok: false, motivos: ["la respuesta no lleva JSON de preset ni de fondo"] };
  const esPreset = Array.isArray(j.components) && !("formato" in j) && !("capas" in j);
  let datos: DatosSet;
  if (esPreset) {
    const preset = (typeof j.structureVersion === "number"
      ? { components: j.components, structureVersion: j.structureVersion }
      : { components: j.components }) as ShaderPreset; // la forma exacta que ya declara la capa
    const textoO = (v: unknown, fb: string): string => typeof v === "string" && v.trim() !== "" ? v.slice(0, 120) : fb;
    datos = { nombre: textoO(j.nombre, o.nombre ?? "Fondo descrito con Shaders"), autor: textoO(j.autor, o.autor ?? "Astraura · Shaders"),
      base: null, capas: [{ ...createLayer("shader"), id: "preset", preset }], licencias: [],
      ...(typeof j.vistaPrevia === "string" && j.vistaPrevia.trim() !== "" ? { vistaPrevia: j.vistaPrevia } : {}) };
  } else {
    const v = validarSet(j, op); // set completo: los mismos motivos del archivo real
    if (!v.ok) return { ok: false, motivos: v.motivos };
    datos = { nombre: v.set.nombre, autor: v.set.autor, base: v.set.base, capas: v.set.capas, licencias: v.set.licencias,
      ...(v.set.vistaPrevia ? { vistaPrevia: v.set.vistaPrevia } : {}), id: v.set.id };
  }
  return exportarSet(datos, op);
}

/** Palabras de un texto: trozos separados por espacios. */
export function contarPalabras(texto: string): number {
  return texto.trim().split(/\s+/).filter(Boolean).length;
}

/** Adapta la habilidad a la forma del registro (`SkillCapability`) con el tamaño pedido. */
export function comoCapacidad(h: HabilidadShaders, tamano: "tarjeta" | "resumen"): SkillCapability {
  return { id: h.id, label: h.nombre, systemPrompt: `${h[tamano]} (${h.autor}, ${h.licencia})` };
}
