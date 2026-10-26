import type { SkillCapability } from "@/ai/astraura/skills";

/**
 * Shaders · Habilidad para crear fondos con WebGPU a partir de descripción.
 * Tarjeta ≤60 palabras, resumen ≤120 palabras. Módulo puro: sin red, disco ni reloj.
 * Contrato: architecture/fondos-shaders.md, vendor/habilidades/shaders/SKILL.md y components.md (MIT).
 */

export const MAX_PALABRAS_TARJETA = 60;
export const MAX_PALABRAS_RESUMEN = 120;

export const ATRIBUCION_SHADERS =
  "Habilidad Shaders de Shader Effects Inc. (github.com/shader-effects-inc/shaders), licencia MIT.";

export interface HabilidadShaders {
  id: string;
  nombre: string;
  cuando: string;
  tarjeta: string;
  resumen: string;
  rutaCompleta: string;
  licencia: "MIT";
  autor: string;
}

export const HABILIDAD_SHADERS: HabilidadShaders = {
  id: "shaders",
  nombre: "Shaders · Fondos con WebGPU",
  cuando: "Cuando la petición pide un fondo animado, degradado, ruido, vidrio, partículas o cualquier efecto de WebGPU describiéndolo en palabras.",
  tarjeta:
    "Crea fondos con Shaders WebGPU a partir de una descripción en palabras. Compone capas de generadores y efectos, evita WebcamTexture y ObjectTracker en públicos, y devuelve un preset JSON válido con estructuraVersion y componentes conocidos. Nada de shaders.com, solo el paquete MIT con telemetría desactivada.",
  resumen:
    "Shaders es una librería WebGPU MIT con más de 200 componentes que se componen como capas. La habilidad convierte una descripción en un preset JSON {components: [{type,id,props,children}]} con estructuraVersion, valida tipos contra el catálogo instalado y rechaza cámara en fondos compartidos. Siempre disableTelemetry:true, sin presets de shaders.com, y el fondo actual sigue siendo la opción principal. El preset se guarda como set .starseed-fondo.json en la Biblioteca y se edita describiendo cambios.",
  rutaCompleta: "vendor/habilidades/shaders/SKILL.md",
  licencia: "MIT",
  autor: "Shader Effects Inc.",
};

export function contarPalabras(texto: string): number {
  return texto.trim().split(/\s+/).filter(Boolean).length;
}

export function comoCapacidad(h: HabilidadShaders, tamano: "tarjeta" | "resumen"): SkillCapability {
  return { id: h.id, label: h.nombre, systemPrompt: `${h[tamano]} (${h.autor}, ${h.licencia})` };
}

type ResultadoPreset = { ok: true; preset: unknown } | { ok: false; motivos: string[] };

const CAMARA = new Set(["WebcamTexture", "ObjectTracker"]);

/** Extrae el primer bloque JSON del texto y valida tipos y cámara. Puro. */
export function presetDesdeRespuesta(texto: string): ResultadoPreset {
  if (!texto || typeof texto !== "string") return { ok: false, motivos: ["texto vacío"] };
  const bloque = texto.match(/```json\s*([\s\S]*?)```/)?.[1] ?? texto.match(/\{[\s\S]*\}/)?.[0];
  if (!bloque) return { ok: false, motivos: ["no se encontró JSON"] };
  let json: unknown;
  try {
    json = JSON.parse(bloque);
  } catch {
    return { ok: false, motivos: ["JSON inválido"] };
  }
  const motivos: string[] = [];
  function validarNodo(n: unknown, ruta = "root"): void {
    if (!n || typeof n !== "object") return;
    const obj = n as Record<string, unknown>;
    if (typeof obj.type === "string") {
      if (CAMARA.has(obj.type)) motivos.push(`${ruta}: ${obj.type} usa cámara y no está permitido`);
    }
    if (Array.isArray(obj.children)) {
      obj.children.forEach((c, i) => validarNodo(c, `${ruta}.children[${i}]`));
    }
    if (Array.isArray(obj.components)) {
      obj.components.forEach((c, i) => validarNodo(c, `${ruta}.components[${i}]`));
    }
  }
  validarNodo(json);
  if (motivos.length) return { ok: false, motivos };
  return { ok: true, preset: json };
}
