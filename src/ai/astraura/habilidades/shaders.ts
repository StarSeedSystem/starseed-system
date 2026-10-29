import type { SkillCapability } from "@/ai/astraura/skills";
import { FORMATO_SET, LICENCIA_SHADERS, validarSet, type SetFondo } from "@/lib/appearance/sets-fondo";
import type { OpcionesSet } from "@/lib/appearance/sets-fondo";
import { camaraEnSet } from "@/lib/appearance/sync-fondos";
import type { BackgroundLayer, ShaderPreset } from "@/lib/appearance/background-layers";
import { contarPalabras, MAX_PALABRAS_RESUMEN, MAX_PALABRAS_TARJETA } from "./diagramas";

/**
 * Shaders · Habilidad de fondos WebGPU para Astraura (Ola 1018F · FSH1018Q ·
 * architecture/fondos-shaders.md §6): crea un fondo describiéndolo, a partir de la
 * habilidad copiada de la repo MIT de Shader Effects Inc. (`vendor/habilidades/shaders/`).
 * La TARJETA (≤ 60 palabras) va a Needle y BitNet y el RESUMEN (≤ 120 palabras) al
 * cerebro de Aurora. El modelo contesta con el JSON del preset y `presetDesdeRespuesta`
 * lo extrae, lo valida contra el catálogo de la versión instalada (`sets-fondo.ts`)
 * y lo entrega como capa lista para la pila. Módulo PURO: sin red, disco, GPU ni DOM.
 */

export { contarPalabras, MAX_PALABRAS_RESUMEN, MAX_PALABRAS_TARJETA };

export const ATRIBUCION_SHADERS =
  "Habilidad Shaders de Shader Effects Inc. (github.com/shader-effects-inc/shaders), licencia MIT.";

export interface HabilidadShaders {
  /** Igual al `name` del SKILL.md original. */
  id: string;
  nombre: string;
  /** Cuándo aplica, en una frase. */
  cuando: string;
  /** ≤ 60 palabras, para Needle y BitNet. */
  tarjeta: string;
  /** ≤ 120 palabras, para el cerebro de Aurora. */
  resumen: string;
  /** Ruta del SKILL.md original, relativa a la raíz del repositorio. */
  rutaCompleta: string;
  licencia: "MIT";
  autor: string;
}

export const HABILIDAD_SHADERS: HabilidadShaders = {
  id: "shaders",
  nombre: "Shaders · Fondos WebGPU",
  cuando: "Cuando la persona pide un fondo para su perfil, una app o una página describiendo el efecto: aurora, degradado, ruido, vidrio, partículas o luz.",
  tarjeta:
    "Compone un fondo WebGPU describiéndolo y devuelve SOLO el JSON del preset: { components } con tipos del paquete shaders (MIT). Capas planas, generadores baratos, visible a false en mezclas. Sin WebGPU cabe la vista previa fija; el fondo actual sigue siendo el principal. Jamás presets de shaders.com ni telemetría: siempre disableTelemetry.",
  resumen:
    "Shaders (paquete npm «shaders», MIT) pinta efectos WebGPU por capas en la GPU: degradados, ruido, vidrio, metal, luz y partículas. Cuando la persona describa el fondo, compón el árbol así: generadores en pila plana, efectos tras lo que transforman y capas ocultas con visible a false. Contesta SOLO con el JSON del preset: el OS lo valida con el catálogo de la versión instalada (rechaza tipos desconocidos, cámara sin permiso y URLs fuera de la Biblioteca). Solo WebGPU: sin él, vista previa fija. El motor actual sigue siendo la opción principal: es la capa de abajo. Nada de presets «Pro» de shaders.com. Telemetría siempre desactivada (disableTelemetry: true), y WebcamTexture y ObjectTracker solo si la persona lo pidió.",
  rutaCompleta: "vendor/habilidades/shaders/SKILL.md",
  licencia: "MIT",
  autor: "Shader Effects Inc.",
};

/** Adapta la habilidad a la forma del registro (`SkillCapability`) con el tamaño pedido. */
export function comoCapacidad(h: HabilidadShaders, tamano: "tarjeta" | "resumen"): SkillCapability {
  return { id: h.id, label: h.nombre, systemPrompt: `${h[tamano]} (${h.autor}, ${h.licencia})` };
}

export interface OpcionesPreset extends OpcionesSet {
  /** Solo con la palabra explícita de la persona: WebcamTexture y ObjectTracker usan la cámara. */
  permisoCamara?: boolean;
  /** Reloj inyectado (puro por fuera); sin él, la fecha de creación es la del momento. */
  ahora?: () => Date;
}

export type RespuestaPreset =
  | { ok: true; capa: BackgroundLayer; set: SetFondo }
  | { ok: false; motivos: string[] };

/** Saca el primer JSON válido de la respuesta del modelo: bloque cercado o el objeto completo. */
export function extraerJson(texto: string): unknown {
  const intenta = (s: string): unknown => {
    try {
      return JSON.parse(s.trim()) as unknown;
    } catch {
      return undefined;
    }
  };
  const cercado = /```(?:json)?[^\n]*\n([\s\S]*?)```/.exec(texto)?.[1] ?? "";
  const suelto = texto.slice(Math.max(texto.indexOf("{"), 0), texto.lastIndexOf("}") + 1);
  for (const candidato of cercado ? [cercado, texto, suelto] : [texto, suelto]) {
    const v = intenta(candidato);
    if (v !== undefined) return v;
  }
  return undefined;
}

const NOMBRE = "Fondo descrito por Astraura", ID_CAPA = "astraura";
const nuevoId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `fa${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Convierte la respuesta del modelo en una capa `shader` validada, o dice por qué se rechaza. */
export function presetDesdeRespuesta(texto: string, o: OpcionesPreset): RespuestaPreset {
  const json = extraerJson(texto);
  if (typeof json !== "object" || json === null || Array.isArray(json))
    return { ok: false, motivos: ["el modelo no devolvió un objeto JSON legible"] };
  const j = json as Record<string, unknown>;
  const esSet = j.formato === FORMATO_SET;
  const crudo = (typeof j.preset === "object" && j.preset !== null ? j.preset : j) as Record<string, unknown>;
  if (!esSet && (!Array.isArray(crudo.components) || crudo.components.length === 0))
    return { ok: false, motivos: ["el preset no trae componentes: falta «components» o está vacío"] };
  const estructuraVersion = typeof crudo.structureVersion === "number" ? crudo.structureVersion : undefined;
  const capa = {
    id: ID_CAPA, kind: "shader" as const, name: NOMBRE, visible: true, opacity: 1, blend: "normal" as const,
    ...(estructuraVersion === undefined
      ? { preset: { components: crudo.components } as ShaderPreset }
      : { preset: { components: crudo.components, structureVersion: estructuraVersion } as ShaderPreset }),
  };
  const borrador: unknown = esSet
    ? json
    : { formato: FORMATO_SET, version: 1, id: nuevoId(), nombre: NOMBRE, autor: "Astraura",
        licencias: [LICENCIA_SHADERS], base: null, capas: [capa], creado: (o.ahora?.() ?? new Date()).toISOString() };
  const r = validarSet(borrador, o);
  if (!r.ok) return r;
  if (r.set.capas.length === 0) return { ok: false, motivos: ["el set no trae capas"] };
  if (camaraEnSet(r.set) && !o.permisoCamara)
    return { ok: false, motivos: ["el preset usa la cámara (WebcamTexture u ObjectTracker) y faltó el permiso explícito"] };
  return { ok: true, set: r.set, capa: r.set.capas.find((c) => c.kind === "shader") ?? r.set.capas[0] };
}
