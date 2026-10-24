import type { SkillCapability } from "@/ai/astraura/skills";
import {
  FORMATO_SET,
  LICENCIA_SHADERS,
  validarSet,
  type OpcionesSet,
  type ResultadoSet,
} from "@/lib/appearance/sets-fondo";
/**
 * Shaders · Habilidad Shaders para Astraura en tres tamaños.
 * Crea un fondo WebGPU describiéndolo: la TARJETA (≤ 60 palabras) va a Needle y
 * BitNet, el RESUMEN (≤ 120 palabras) a Bonsai pequeño y la guía completa
 * (`rutaCompleta`) a las capas razón, profunda y nube (contrato:
 * architecture/fondos-shaders.md §1 y §6-Q). `presetDesdeRespuesta` extrae el
 * JSON de fondo que devuelve el modelo y lo valida con `sets-fondo.ts` (catálogo
 * de la versión instalada; la cámara solo con permiso explícito y nunca en
 * fondos compartidos). SOLO el paquete MIT: nunca presets ni recursos de
 * shaders.com. Módulo PURO: solo datos y funciones sin red, disco ni reloj
 * (sirve en cliente y servidor).
 */

export const MAX_PALABRAS_TARJETA = 60, MAX_PALABRAS_RESUMEN = 120;

export const ATRIBUCION_SHADERS =
  "Habilidad Shaders de Shader Effects Inc. (paquete npm «shaders»), licencia MIT.";

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
  autor: "Shader Effects Inc.";
}

export const HABILIDAD_SHADERS: HabilidadShaders = {
  id: "shaders",
  nombre: "Shaders · Fondos WebGPU describiéndolos",
  cuando: "Cuando alguien quiere un fondo animado o estático —degradado, aurora, ruido, vidrio, luz, partículas o desenfoque— para su perfil, una página o una sección, o pide que Astraura le diseñe uno describiéndolo.",
  tarjeta: "Crea un fondo WebGPU con el paquete npm «shaders» describiéndolo: compón capas planas de generadores baratos —malla, degradados, ruido— y efectos como hermanos que aplican a lo dibujado antes. Devuelve un preset JSON validado; nunca recursos de shaders.com, y la cámara solo con permiso explícito.",
  resumen: "Shaders compone efectos WebGPU como capas que se dibujan en orden: el primer hijo abajo, el último arriba. Los generadores —degradados, malla, ruido, plasma— cuestan casi nada; un efecto (desenfoque, vidrio, viñeta) aplica a todo lo dibujado antes de él, así que lo normal es una pila plana de hermanos y solo se anida para limitar el efecto a unas capas concretas. Oculta con visible, no con opacidad cero; anima propiedades en vez de recompilar. Todo componente admite opacidad, modo de mezcla, máscara y caja. Telemetría siempre apagada; nada de shaders.com ni de sus presets Pro; WebcamTexture y ObjectTracker solo con permiso explícito y nunca en un fondo compartido. Sin WebGPU queda una imagen fija.",
  rutaCompleta: "vendor/habilidades/shaders/SKILL.md",
  licencia: "MIT",
  autor: "Shader Effects Inc.",
};

/** Palabras de un texto: trozos separados por espacios (cuenta estricta, también símbolos). */
export function contarPalabras(texto: string): number {
  return texto.trim().split(/\s+/).filter(Boolean).length;
}

/** Adapta la habilidad a la forma del registro (`SkillCapability`) con el tamaño pedido. */
export function comoCapacidad(h: HabilidadShaders, tamano: "tarjeta" | "resumen"): SkillCapability {
  return { id: h.id, label: h.nombre, systemPrompt: `${h[tamano]} (${h.autor}, ${h.licencia})` };
}

const esObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Recorta el primer objeto JSON balanceado del texto (valla o párrafo), sin prosa mezclada. */
function extraerJson(texto: string): string | null {
  const ini = texto.indexOf("{");
  if (ini < 0) return null;
  let prof = 0, enCadena = false, esc = false;
  for (let i = ini; i < texto.length; i++) {
    const c = texto[i];
    if (esc) { esc = false; continue; }
    if (enCadena) { if (c === "\\") esc = true; else if (c === '"') enCadena = false; continue; }
    if (c === '"') enCadena = true;
    else if (c === "{") prof++;
    else if (c === "}") { prof--; if (prof === 0) return texto.slice(ini, i + 1); }
  }
  return null;
}

const CAMARA = new Set(["WebcamTexture", "ObjectTracker"]);
/** ¿Está la cámara en cualquier nivel del árbol de componentes? */
const hayCamara = (v: unknown): boolean =>
  Array.isArray(v) ? v.some(hayCamara) : esObj(v) && ((typeof v.type === "string" && CAMARA.has(v.type)) || Object.values(v).some(hayCamara));

export interface OpcionesRespuesta extends OpcionesSet {
  /** Fecha «creado» y fabricante de ids, inyectables en pruebas. */
  ahora?: () => Date;
  crearId?: () => string;
}

/** Extrae y valida —con `sets-fondo.ts`— el JSON de fondo que devuelve un modelo.
 *  Acepta un set completo (`.starseed-fondo.json`) o un preset suelto
 *  `{ components, structureVersion? }`, que envuelve en una capa shader de
 *  Astraura sobre el motor que la persona ya tiene (`base: null`); nunca un
 *  preset de shaders.com. Rechaza con motivo los tipos que no existan en el
 *  catálogo y —por defecto, `compartido: true`— la cámara: `compartido: false`
 *  solo tras permiso explícito de la persona, jamás en un fondo compartido. */
export function presetDesdeRespuesta(texto: string, o: OpcionesRespuesta): ResultadoSet {
  const recorte = extraerJson(texto);
  if (!recorte) return { ok: false, motivos: ["la respuesta no contiene un objeto JSON"] };
  let j: unknown;
  try { j = JSON.parse(recorte); } catch { return { ok: false, motivos: ["la respuesta no contiene JSON válido"] }; }
  if (!esObj(j)) return { ok: false, motivos: ["la respuesta no es un objeto JSON"] };
  if (j.formato === FORMATO_SET) return validarSet(j, o);
  if (!Array.isArray(j.components)) return { ok: false, motivos: ["el JSON no es un preset ni un set de fondos"] };
  const opciones: OpcionesSet = { catalogo: o.catalogo, biblioteca: o.biblioteca, compartido: o.compartido ?? true };
  if (opciones.compartido && hayCamara(j.components))
    return { ok: false, motivos: ["preset: usa la cámara y un fondo de Astraura nunca la lleva"] };
  return validarSet({
    formato: FORMATO_SET, version: 1,
    id: o.crearId?.() ?? globalThis.crypto?.randomUUID?.() ?? "astraura-fondo",
    nombre: typeof j.nombre === "string" && j.nombre.trim() !== "" ? j.nombre.trim().slice(0, 120) : "Fondo de Astraura",
    autor: "Astraura", licencias: [LICENCIA_SHADERS], base: null,
    capas: [{ id: "astraura-fondo", kind: "shader", visible: true, opacity: 1,
      preset: { components: j.components, ...(typeof j.structureVersion === "number" ? { structureVersion: j.structureVersion } : {}) } }],
    creado: (o.ahora?.() ?? new Date()).toISOString(),
  }, opciones);
}
