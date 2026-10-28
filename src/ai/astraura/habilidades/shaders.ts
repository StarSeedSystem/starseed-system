import type { SkillCapability } from "@/ai/astraura/skills";
import { construirCatalogo, type ShaderCatalog } from "@/lib/appearance/catalogo-shaders";
import { FORMATO_SET, LICENCIA_SHADERS, validarSet, type SetFondo } from "@/lib/appearance/sets-fondo";

/**
 * Shaders · Habilidad de Astraura para crear un fondo describiéndolo (Ola 1018F · FSH1018Q)
 * ------------------------------------------------------------------------------------------
 * Del SKILL.md y components.md de vendor/habilidades/shaders (MIT): la TARJETA (≤ 60 palabras) va a
 * Needle y BitNet, el RESUMEN (≤ 120) al cerebro de Aurora. `presetDesdeRespuesta` extrae el JSON que
 * devuelve un modelo y lo valida con `sets-fondo.ts`: tipos fuera del catálogo, cámara y recursos de
 * shaders.com se rechazan. El fondo actual (motor base, Spline por defecto) sigue siendo el principal.
 *
 * Módulo PURO: sin red, disco, reloj real ni GPU. El catálogo vivo se inyecta desde `cargarCatalogo()`
 * en cliente; el de respaldo reproduce los nombres documentados del paquete instalado.
 */

export const MAX_PALABRAS_TARJETA = 60;
export const MAX_PALABRAS_RESUMEN = 120;
export const ATRIBUCION_SHADERS = "Habilidad Shaders de Shader Effects Inc. (github.com/shader-effects-inc/shaders), licencia MIT.";

export interface HabilidadShaders { id: string; nombre: string; cuando: string; tarjeta: string; resumen: string; rutaCompleta: string; licencia: "MIT"; autor: "Shader Effects Inc." }
export interface OpcionesPreset { catalogo?: ShaderCatalog; biblioteca?: readonly string[]; compartido?: boolean; permitirCamara?: boolean }
export interface PresetShader { components: unknown[]; structureVersion?: number }
export type ResultadoPreset = { ok: true; preset: PresetShader; set: SetFondo } | { ok: false; motivos: string[] };

export const HABILIDAD_SHADERS: HabilidadShaders = {
  id: "shaders", nombre: "Shaders · Fondos WebGPU",
  cuando: "Cuando la persona quiere un fondo animado o un efecto visual para su perfil, página, grupo o publicación y lo describe con palabras («aurora», «vidrio», «niebla», «degradado en movimiento»).",
  tarjeta: "Shaders añade fondos WebGPU como capas sobre el fondo actual, que sigue siendo la opción principal (Spline por defecto). Describe el efecto y Astraura compone el preset con componentes del paquete MIT, nunca de shaders.com. Sin WebGPU se ve la vista previa fija. Telemetría apagada; cámara solo con permiso y nunca en fondos compartidos. Guárdalo en la Biblioteca.",
  resumen: "Shaders (paquete npm `shaders` 4.0.4, MIT) añade fondos WebGPU como capas de la pila, sobre el motor base actual, que sigue siendo la opción principal: Spline por defecto. Describe el efecto que quieres y Astraura compone un preset JSON con componentes del catálogo instalado —degradados, ruido, vidrio, luz, distorsión, desenfoque, partículas—; nunca usa presets ni recursos de shaders.com. Solo WebGPU: sin ella, con ahorro de batería o «reducir movimiento», se muestra la vista previa fija del set. La telemetría va siempre apagada (`disableTelemetry: true`). WebcamTexture y ObjectTracker exigen permiso explícito y no valen en fondos compartidos. El preset se valida contra el catálogo antes de pintarse y se guarda en la Biblioteca como set `.starseed-fondo.json`.",
  rutaCompleta: "vendor/habilidades/shaders/SKILL.md", licencia: "MIT", autor: "Shader Effects Inc.",
};

/** Los 200 componentes documentados (components.md), por si quien llama no inyecta el registro vivo. */
const NOMBRES = `Aurora Beam Blob BlockNoise BlueNoise BrickPattern Checkerboard Chevron ColorWheel ConicGradient CurlNoise DiamondGradient DotGrid ErosionNoise FallingLines FloatingParticles FlowingGradient FractalNoise GaborNoise Godrays Grid HexGrid HTMLInCanvas ImageTexture IsometricCubes LinearGradient Marble MeshGradient MultiPointGradient PerlinNoise Plasma Prism RadialGradient Ripples Satin Scratches SimplexNoise SineWave SolidColor Spiral Strands Stripes StudioBackground SunBurst Swirl Text TriangularGrid Truchet VideoTexture Voronoi Waveform WaveletNoise Weave WebcamTexture WorleyNoise
Arc Circle Crescent Cross Ellipse Flower Heart Line Parallelogram Polygon Ring RoundedRect Star Teardrop Trapezoid Vesica BrushedMetal CarbonFiber Chrome Crystal Emboss Frost Glass Goo Heatmap Hologram Holographic Irradiance LightEdge LiquidMetal Nebula Neon Obsidian Particles Plastic SmokeFill ThinFilm Voxels Water AngularBlur Blur BokehBlur ChannelBlur DiffuseBlur LinearBlur ProgressiveBlur TiltShift ZoomBlur BarShift Bend Bulge ConcentricSpin CornerPin DisplacementMap Flip FlowField FlutedGlass Form3D GlassTiles Kaleidoscope Mirror Perspective PolarCoordinates RectangularCoordinates Repeater Spherize Stretch Surface3D Twirl WaveDistortion
BrightnessContrast Duotone Exposure FilmStock Grayscale HueShift Invert Posterize Saturation Sharpness Solarize Tint Tritone Vibrance Ascii Chalkboard ChromaticAberration CompressionArtifacts ContourLines CRTScreen DataMosh Dither DropShadow Engraving FilmGrain Glitch Glow GradientMap Halftone KeyFrames LensDistortion LensFlare LightLeak ObjectTracker Paper ParticleField Pixelate ReflectivePlane Sparkle Stone TimeTrail VHS Vignette Watercolor Wool
Boids ChromaFlow CursorRipples CursorTrail Fog GridDistortion InkFlow Liquify MagneticFilings ParticleFlow PixelSort PixelThrow ReactionDiffusion Shatter Smoke SmokeFlow BarnDoors BlockDissolve CheckerWipe DiamondWipe IrisWipe LinearWipe NoiseDissolve PagePeel RadialWipe RandomBars RippleWipe SliceWipe VenetianBlinds Group`.trim().split(/\s+/);
const PROPS_FUENTE = { url: { default: "https://shaders.com/sample.jpg" } }; // centinela: sin url propia, el paquete cargaría una muestra remota
const CATALOGO_DOCUMENTADO: ShaderCatalog = construirCatalogo(NOMBRES.map((name) => ({
  name, category: "Shaders", ...(name === "ImageTexture" || name === "VideoTexture" ? { propsMetadata: PROPS_FUENTE } : {}),
})));
const CAMARA = new Set(["WebcamTexture", "ObjectTracker"]);
const esObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Palabras de un texto: trozos separados por espacios (cuenta estricta, también símbolos). */
export function contarPalabras(texto: string): number {
  return texto.trim().split(/\s+/).filter(Boolean).length;
}

/** Adapta la habilidad a la forma del registro (`SkillCapability`) con el tamaño pedido. */
export function comoCapacidad(h: HabilidadShaders = HABILIDAD_SHADERS, tamano: "tarjeta" | "resumen" = "resumen"): SkillCapability {
  return { id: h.id, label: h.nombre, systemPrompt: `${h[tamano]} (${h.autor}, ${h.licencia})` };
}

/** Primer objeto JSON completo del texto, contando llaves y respetando cadenas y escapes. */
function primerObjeto(texto: string): string | null {
  const inicio = texto.indexOf("{");
  if (inicio < 0) return null;
  let profundidad = 0, enCadena = false, escape = false;
  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];
    if (enCadena) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') enCadena = false;
    } else if (c === '"') enCadena = true;
    else if (c === "{") profundidad++;
    else if (c === "}" && --profundidad === 0) return texto.slice(inicio, i + 1);
  }
  return null;
}

/** Busca el JSON en bloques cercados o en el texto suelto; el primero que parsee, gana. */
function extraerJson(texto: string): unknown {
  const bloques = [...texto.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  for (const trozo of [...bloques, texto]) {
    const crudo = primerObjeto(trozo);
    if (!crudo) continue;
    try { return JSON.parse(crudo) as unknown; } catch { /* se prueba el siguiente */ }
  }
  return undefined;
}

/** Acepta el preset suelto, envuelto en `preset` o dentro de un set completo con capa shader. */
function comoPreset(j: unknown): Record<string, unknown> | null {
  if (!esObj(j)) return null;
  if (Array.isArray(j.components)) return j;
  if (esObj(j.preset) && Array.isArray(j.preset.components)) return j.preset;
  if (Array.isArray(j.capas)) {
    const capa = j.capas.find((c) => esObj(c) && c.kind === "shader" && esObj(c.preset) && Array.isArray(c.preset.components));
    return esObj(capa) && esObj(capa.preset) ? capa.preset : null;
  }
  return null;
}

function usaCamara(components: unknown[]): boolean {
  return components.some((c) => esObj(c) && (CAMARA.has(String(c.type)) ||
    (Array.isArray(c.children) && usaCamara(c.children))));
}

/** Extrae el preset JSON de una respuesta de modelo y lo valida con `sets-fondo.ts`. */
export function presetDesdeRespuesta(texto: string, opciones: OpcionesPreset = {}): ResultadoPreset {
  const j = comoPreset(extraerJson(texto));
  if (!j || !Array.isArray(j.components)) return { ok: false, motivos: ["no hay un preset JSON con «components» en la respuesta"] };
  const components: unknown[] = j.components;
  const compartido = opciones.compartido ?? true;
  if (usaCamara(components) && !(opciones.permitirCamara && !compartido))
    return { ok: false, motivos: ["WebcamTexture y ObjectTracker solo con permiso explícito y nunca en un fondo compartido"] };
  const preset: PresetShader = { components, ...(typeof j.structureVersion === "number" ? { structureVersion: j.structureVersion } : {}) };
  const set = { formato: FORMATO_SET, version: 1, id: "preset-astraura", nombre: "Preset de Astraura", autor: "Astraura",
    licencias: [LICENCIA_SHADERS], base: null, creado: "2026-10-28T00:00:00.000Z",
    capas: [{ id: "shader-1", kind: "shader", name: "Shaders", visible: true, opacity: 1, blend: "normal", preset }] };
  const r = validarSet(set, { catalogo: opciones.catalogo ?? CATALOGO_DOCUMENTADO, biblioteca: opciones.biblioteca ?? [], compartido });
  if (!r.ok) return r;
  const validado = r.set.capas[0]?.preset;
  if (!validado) return { ok: false, motivos: ["el preset no quedó validado"] };
  return { ok: true, preset: { components: validado.components, ...(typeof validado.structureVersion === "number" ? { structureVersion: validado.structureVersion } : {}) }, set: r.set };
}
