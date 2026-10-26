import type { SkillCapability } from "@/ai/astraura/skills";

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

export function presetDesdeRespuesta(texto: string): ResultadoPreset {
  if (!texto || typeof texto !== "string") return { ok: false, motivos: ["texto vacío"] };
  
  const bloqueJsonCode = texto.match(/```json\s*([\s\S]*?)```/);
  const bloqueJson = bloqueJsonCode?.[1];
  
  if (bloqueJson) {
    return validarPreset(bloqueJson);
  }
  
  const primerJson = extraerPrimerJson(texto);
  if (!primerJson) return { ok: false, motivos: ["no se encontró JSON"] };
  
  return validarPreset(primerJson);
}

function extraerPrimerJson(texto: string): string | null {
  const candidatos: string[] = [];
  
  let profundidad = 0;
  let inicio = -1;
  
  for (let i = 0; i < texto.length; i++) {
    const char = texto[i];
    if (char === '{' || char === '[') {
      if (profundidad === 0) inicio = i;
      profundidad++;
    } else if (char === '}' || char === ']') {
      profundidad--;
      if (profundidad === 0 && inicio !== -1) {
        const fin = i + 1;
        candidatos.push(texto.slice(inicio, fin));
        inicio = -1;
      }
    }
  }
  
  for (const candidato of candidatos) {
    try {
      JSON.parse(candidato);
      return candidato;
    } catch {
      continue;
    }
  }
  
  return null;
}

function validarPreset(bloque: string): ResultadoPreset {
  let json: unknown;
  try {
    json = JSON.parse(bloque);
  } catch {
    return { ok: false, motivos: ["JSON inválido"] };
  }
  
  const motivos: string[] = [];
  validarNodo(json, "root", motivos);
  
  if (motivos.length) return { ok: false, motivos };
  return { ok: true, preset: json };
}

function validarNodo(nodo: unknown, ruta: string, motivos: string[]): void {
  if (!nodo || typeof nodo !== "object") return;
  
  if (Array.isArray(nodo)) {
    nodo.forEach((item, i) => validarNodo(item, `${ruta}[${i}]`, motivos));
    return;
  }
  
  const obj = nodo as Record<string, unknown>;
  
  if (typeof obj.type === "string") {
    if (CAMARA.has(obj.type)) {
      motivos.push(`${ruta}: ${obj.type} usa cámara y no está permitido`);
    }
  }
  
  if (Array.isArray(obj.children)) {
    obj.children.forEach((c, i) => validarNodo(c, `${ruta}.children[${i}]`, motivos));
  }
  
  if (Array.isArray(obj.components)) {
    obj.components.forEach((c, i) => validarNodo(c, `${ruta}.components[${i}]`, motivos));
  }
  
  for (const [key, value] of Object.entries(obj)) {
    if (key !== "type" && key !== "children" && key !== "components" && key !== "id" && key !== "props") {
      if (typeof value === "object" && value !== null) {
        validarNodo(value, `${ruta}.${key}`, motivos);
      }
    }
  }
}
