import type { PreguntaChoice } from "@/lib/jev/decisiones";
import type { SkillCapability } from "@/ai/astraura/skills";
import type { ShaderCatalog, ShaderCatalogEntry } from "@/lib/appearance/catalogo-shaders";
import type { BackgroundLayer } from "@/lib/appearance/background-layers";
import { validarSet, type OpcionesSet, type SetFondo } from "@/lib/appearance/sets-fondo";

/**
 * Shaders · Habilidad de fondos con Shaders para Astraura.
 * Genera presets JSON para el paquete npm `shaders` (MIT) que se apilan como capas WebGPU.
 * La TARJETA (≤ 60 palabras) va a Needle y BitNet, el RESUMEN (≤ 120 palabras) a Bonsai pequeño
 * y la guía completa (rutaCompleta) a las capas Razón, Profunda y Nube.
 * Módulo PURO: solo datos y funciones sin red, disco ni reloj (sirve en cliente y servidor).
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
  autor: "Shader Effects Inc.";
}

export interface TipoShader {
  id: string;
  nombre: string;
  frase: string;
  categoria: string;
}

export const HABILIDAD_SHADERS: HabilidadShaders = {
  id: "shaders",
  nombre: "Shaders · Fondos WebGPU por capas",
  cuando:
    "Cuando la petición pide crear, combinar o ajustar un fondo animado con efectos WebGPU (gradientes, ruido, vidrio, metal, luz, distorsiones, partículas, desenfoques) que se apilan como capas sobre el motor base.",
  tarjeta:
    "Convierte una descripción en un preset JSON válido para el paquete `shaders` (MIT): capas `shader` y `difusion` con posición, máscara, opacidad y mezcla. Usa solo componentes del catálogo instalado; rechaza cámara en sets compartidos. El motor base (Spline por defecto) sigue siendo la opción principal.",
  resumen:
    "Shaders genera fondos por capas WebGPU usando el paquete npm `shaders` (MIT, 200+ componentes). Cada preset define capas `shader` (efectos: MeshGradient, SimplexNoise, CursorTrail, Glass…) y `difusion` (transparente, desenfoque, blanco, negro, tono con texturas). Las capas llevan transformación (posición, escala, rotación), máscara (radial/lineal), opacidad y modo de mezcla. El catálogo vivo (`shaders/registry`) da los tipos disponibles por versión. Valida con `sets-fondo.ts`: rechaza componentes desconocidos, URLs fuera de la Biblioteca, cámara en sets compartidos y muestras remotas por defecto. El fondo actual (Spline) sigue siendo la base; los presets se guardan como `.starseed-fondo.json` en la Biblioteca.",
  rutaCompleta: "vendor/habilidades/shaders/SKILL.md",
  licencia: "MIT",
  autor: "Shader Effects Inc.",
};

export const TIPOS_SHADER_CATEGORIAS: Record<string, TipoShader[]> = {
  texturas: [
    { id: "MeshGradient", nombre: "MeshGradient", frase: "Gradiente de malla fluido con bandas de color que derivan suavemente.", categoria: "Texturas" },
    { id: "SimplexNoise", nombre: "SimplexNoise", frase: "Ruido orgánico con movimiento animado y evolución natural.", categoria: "Texturas" },
    { id: "PerlinNoise", nombre: "PerlinNoise", frase: "Ruido de gradiente suave que evoluciona en el tiempo.", categoria: "Texturas" },
    { id: "FractalNoise", nombre: "FractalNoise", frase: "Ruido fractal multi-octava con evolución real y continua.", categoria: "Texturas" },
    { id: "FlowingGradient", nombre: "FlowingGradient", frase: "Gradiente de seda líquida con bandas de color orgánicas.", categoria: "Texturas" },
    { id: "LinearGradient", nombre: "LinearGradient", frase: "Gradiente lineal suave entre dos colores definidos.", categoria: "Texturas" },
    { id: "RadialGradient", nombre: "RadialGradient", frase: "Gradiente radial que emana desde un punto central.", categoria: "Texturas" },
    { id: "ConicGradient", nombre: "ConicGradient", frase: "Colores que barren en círculo completo alrededor de un centro.", categoria: "Texturas" },
    { id: "MultiPointGradient", nombre: "MultiPointGradient", frase: "Cinco puntos de color colocados individualmente y mezclados por proximidad.", categoria: "Texturas" },
    { id: "Aurora", nombre: "Aurora", frase: "Aurora boreal con cortinas en capas, rayos verticales y luz fluida.", categoria: "Texturas" },
    { id: "Plasma", nombre: "Plasma", frase: "Efecto animado de plasma brilloso con movimiento fluido.", categoria: "Texturas" },
    { id: "Godrays", nombre: "Godrays", frase: "Rayos de luz volumétricos que emanan de un punto.", categoria: "Texturas" },
    { id: "CursorTrail", nombre: "CursorTrail", frase: "Estela animada que sigue el movimiento del cursor.", categoria: "Texturas" },
  ],
  formas: [
    { id: "Circle", nombre: "Círculo", frase: "Círculo con tamaño y suavidad ajustables a voluntad.", categoria: "Formas" },
    { id: "Ellipse", nombre: "Elipse", frase: "Elipse con radios horizontal y vertical independientes.", categoria: "Formas" },
    { id: "Polygon", nombre: "Polígono", frase: "Polígono regular con lados y redondeo de esquinas ajustables.", categoria: "Formas" },
    { id: "Star", nombre: "Estrella", frase: "Estrella clásica con lados rectos y puntas afiladas.", categoria: "Formas" },
    { id: "Heart", nombre: "Corazón", frase: "Forma de corazón con tamaño ajustable a voluntad.", categoria: "Formas" },
  ],
  efectosForma: [
    { id: "Glass", nombre: "Vidrio", frase: "Lente de vidrio ópticamente realista en forma personalizada.", categoria: "Efectos de forma" },
    { id: "Frost", nombre: "Escarcha", frase: "Hielo fotorrealista con dispersión subsuperficial según el grosor.", categoria: "Efectos de forma" },
    { id: "Chrome", nombre: "Cromo", frase: "Cromo espejo de estudio con bisel pulido controlable.", categoria: "Efectos de forma" },
    { id: "LiquidMetal", nombre: "Metal líquido", frase: "Cromo fundido reflectante que envuelve la forma.", categoria: "Efectos de forma" },
    { id: "Neon", nombre: "Neón", frase: "Tubo de neón fotorrealista o efecto de tubo 3D.", categoria: "Efectos de forma" },
  ],
  desenfoques: [
    { id: "Blur", nombre: "Desenfoque", frase: "Desenfoque gaussiano simple para suavizar capas visuales.", categoria: "Desenfoques" },
    { id: "BokehBlur", nombre: "Desenfoque bokeh", frase: "Desenfoque de lente fotográfico donde luces brillantes florecen en discos.", categoria: "Desenfoques" },
    { id: "TiltShift", nombre: "Tilt-shift", frase: "Desenfoque de enfoque selectivo imitando fotografía tilt-shift.", categoria: "Desenfoques" },
  ],
  distorsiones: [
    { id: "Twirl", nombre: "Giro", frase: "Rota y retuerce el contenido alrededor de un punto central.", categoria: "Distorsiones" },
    { id: "WaveDistortion", nombre: "Distorsión de onda", frase: "Distorsión basada en onda con múltiples tipos de forma de onda.", categoria: "Distorsiones" },
    { id: "DisplacementMap", nombre: "Mapa de desplazamiento", frase: "Deforma el contenido hijo usando los píxeles de otra capa como mapa.", categoria: "Distorsiones" },
  ],
  ajustes: [
    { id: "BrightnessContrast", nombre: "Brillo/Contraste", frase: "Ajusta brillo y contraste de la imagen de forma precisa.", categoria: "Ajustes" },
    { id: "HueShift", nombre: "Desplazamiento de tono", frase: "Rota el tono alrededor de la rueda de color completa.", categoria: "Ajustes" },
    { id: "Saturation", nombre: "Saturación", frase: "Ajusta la intensidad de la saturación de color.", categoria: "Ajustes" },
    { id: "Vibrance", nombre: "Vibrancia", frase: "Ajuste selectivo de saturación protegiendo tonos de piel.", categoria: "Ajustes" },
  ],
  estilizar: [
    { id: "Glow", nombre: "Resplandor", frase: "Resplandor suave con intensidad ajustable para brillos.", categoria: "Estilizar" },
    { id: "FilmGrain", nombre: "Grano de película", frase: "Textura de grano de película analógica pesada hacia áreas oscuras.", categoria: "Estilizar" },
    { id: "Vignette", nombre: "Vignette", frase: "Oscurece o tinta los bordes del encuadre atrayendo la atención al centro.", categoria: "Estilizar" },
    { id: "Glitch", nombre: "Glitch", frase: "Fallos digitales que derriten píxeles y distorsionan colores.", categoria: "Estilizar" },
    { id: "ChromaticAberration", nombre: "Aberración cromática", frase: "Separa canales RGB para efecto de distorsión prismática.", categoria: "Estilizar" },
  ],
  interactivas: [
    { id: "CursorRipples", nombre: "Ondas de cursor", frase: "Distorsión fluida tipo onda que sigue el cursor.", categoria: "Interactivas" },
    { id: "ChromaFlow", nombre: "Flujo cromático", frase: "Efecto de flujo líquido interactivo que sigue el cursor.", categoria: "Interactivas" },
    { id: "ParticleFlow", nombre: "Flujo de partículas", frase: "Miles de partículas de polvo derivadas por un campo fluido real que el cursor remueve.", categoria: "Interactivas" },
  ],
  transiciones: [
    { id: "LinearWipe", nombre: "Barrido lineal", frase: "Barrido del contenido a lo largo de un borde recto con transición suave.", categoria: "Transiciones" },
    { id: "RadialWipe", nombre: "Barrido radial", frase: "Barrido del contenido en arco de manecilla de reloj alrededor de un punto central.", categoria: "Transiciones" },
    { id: "NoiseDissolve", nombre: "Disolución por ruido", frase: "Disuelve el contenido a través de un patrón de ruido orgánico.", categoria: "Transiciones" },
  ],
};

export function todosLosTiposShader(): TipoShader[] {
  return Object.values(TIPOS_SHADER_CATEGORIAS).flat();
}

/** Palabras de un texto: trozos separados por espacios (cuenta estricta, también símbolos). */
export function contarPalabras(texto: string): number {
  return texto.trim().split(/\s+/).filter(Boolean).length;
}

/** Arma la pregunta «choice» para elegir el tipo de shader principal por la petición. */
export function preguntaTipoShader(tipos?: string[]): PreguntaChoice {
  const todos = todosLosTiposShader();
  const elegidos = tipos?.length ? todos.filter((t) => tipos.includes(t.id)) : todos;
  const criteria: Record<string, string> = {};
  for (const t of elegidos) criteria[t.id] = `${t.nombre}: ${t.frase}`;
  return { type: "choice", instructions: "¿Qué componente shader encaja mejor como base del fondo?", criteria };
}

/** Adapta la habilidad a la forma del registro (`SkillCapability`) con el tamaño pedido. */
export function comoCapacidad(h: HabilidadShaders, tamano: "tarjeta" | "resumen"): SkillCapability {
  return { id: h.id, label: h.nombre, systemPrompt: `${h[tamano]} (${h.autor}, ${h.licencia})` };
}

/**
 * Extrae y valida el JSON de preset que devuelva un modelo.
 * Usa `validarSet` de `sets-fondo.ts` con el catálogo de la versión instalada.
 * Rechaza tipos que no existan en el catálogo y componentes de cámara en sets compartidos.
 */
export async function presetDesdeRespuesta(
  texto: string,
  opciones: OpcionesSet
): Promise<{ ok: true; set: SetFondo; json: string } | { ok: false; motivos: string[] }> {
  let jsonStr: string;
  try {
    const inicio = texto.indexOf("{");
    const fin = texto.lastIndexOf("}");
    if (inicio === -1 || fin === -1 || fin <= inicio) {
      return { ok: false, motivos: ["no se encontró un objeto JSON en la respuesta"] };
    }
    jsonStr = texto.slice(inicio, fin + 1);
    const parsed = JSON.parse(jsonStr);
    const resultado = validarSet(parsed, opciones);
    if (!resultado.ok) return resultado;
    return { ok: true, set: resultado.set, json: JSON.stringify(resultado.set) };
  } catch {
    return { ok: false, motivos: ["el texto no contiene JSON válido"] };
  }
}

/**
 * Versión síncrona para tests: valida un preset ya parseado.
 */
export function validarPresetShaders(
  preset: unknown,
  catalogo: ShaderCatalog,
  compartido = false
): { ok: true; set: SetFondo } | { ok: false; motivos: string[] } {
  return validarSet(preset, { catalogo, compartido });
}