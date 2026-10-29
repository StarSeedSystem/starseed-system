import type { BackgroundLayer, ShaderPreset } from "@/lib/appearance/background-layers";
import type { ShaderCatalog } from "@/lib/appearance/catalogo-shaders";
import { exportarSet, validarSet, type DatosSet, type OpcionesSet, type ResultadoSet } from "@/lib/appearance/sets-fondo";
import type { SkillCapability } from "@/ai/astraura/skills";

/**
 * Shaders · Habilidad de Astraura para crear un FONDO describiéndolo (Ola 1018F · FSH1018Q).
 * A partir del SKILL.md y components.md del paquete MIT «shaders» (copia vendor/habilidades/shaders/),
 * tres tamaños como el resto de habilidades: la TARJETA (≤ 60 palabras) a Needle/BitNet, el RESUMEN
 * (≤ 120 palabras) al cerebro de Aurora y la ruta COMPLETA a las capas razón y nube.
 * `presetDesdeRespuesta` extrae el JSON de preset que devuelve un modelo y lo valida como set con
 * `sets-fondo.ts`: rechaza componentes desconocidos del catálogo y la cámara sin permiso explícito.
 * Contrato: architecture/fondos-shaders.md. Reglas fijas: nunca presets ni recursos de shaders.com,
 * `disableTelemetry: true` siempre, y el motor base actual sigue siendo la opción principal.
 *
 * Módulo PURO: solo datos y funciones sin red, disco ni reloj (sirve en cliente y servidor).
 */

export const MAX_PALABRAS_TARJETA = 60, MAX_PALABRAS_RESUMEN = 120;

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
  nombre: "Shaders · Fondos WebGPU describiéndolos",
  cuando: "Cuando la persona pide un fondo con movimiento o ambiente (aurora, gradiente vivo, vidrio, partículas, grano, neón) para su perfil, una página, grupo o publicación y quiere describirlo con palabras.",
  tarjeta:
    "Crea un fondo WebGPU con el paquete MIT «shaders» describiéndolo: genera un preset JSON de componentes (generadores y efectos en capas planas) que se valida como set «.starseed-fondo.json». Jamás presets de shaders.com y siempre disableTelemetry: true. WebcamTexture y ObjectTracker solo con permiso explícito, nunca en fondos compartidos. El fondo actual sigue siendo la opción principal.",
  resumen:
    "Shaders pone una piel visual WebGPU sobre la página: los efectos del paquete MIT «shaders» (degradados, ruido, vidrio, metal, distorsiones, partículas) se apilan como capas, generadores abajo y efectos como hermanos en pila plana, sin inventar props ni escribir WebGL. Cómo crear un fondo describiéndolo: se compone el preset JSON { components } y se valida como set «.starseed-fondo.json» — si un componente no está en el catálogo o la cámara no tiene permiso, se rechaza y se dice por qué. Fijas: nunca recursos de shaders.com, siempre disableTelemetry: true, WebcamTexture y ObjectTracker solo con permiso explícito y jamás en fondos compartidos. El fondo actual sigue siendo la opción principal: los shaders van encima y sin WebGPU queda la imagen fija.",
  rutaCompleta: "vendor/habilidades/shaders/SKILL.md",
  licencia: "MIT",
  autor: "Shaders (Shader Effects Inc.)",
};

/**
 * Saca el primer JSON bien formado de la respuesta de un modelo: prefiere los bloques cercados
 * ```json … ``` y, si no hay, el primer objeto {…} balanceado que parsee (respetando cadenas).
 */
export function extraerJsonPreset(texto: string): unknown {
  const trozo = (desde: number): string | undefined => {
    let prof = 0, ini = -1, enCadena = false, esc = false;
    for (let i = desde; i < texto.length; i++) {
      const c = texto[i];
      if (enCadena) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') enCadena = false; continue; }
      if (c === '"') { enCadena = true; continue; }
      if (c === "{") { if (prof === 0) ini = i; prof++; }
      else if (c === "}") { prof--; if (prof === 0 && ini >= 0) return texto.slice(ini, i + 1); if (prof < 0) return undefined; }
    }
    return undefined;
  };
  const candidatos: string[] = [];
  for (const m of texto.matchAll(/```[a-zA-Z]*\s*([\s\S]*?)```/g)) if (m[1].includes("{")) candidatos.push(m[1]);
  for (let i = texto.indexOf("{"); i >= 0 && i < texto.length; i = texto.indexOf("{", i + 1)) {
    const t = trozo(i);
    if (!t) break;
    candidatos.push(t);
    i += t.length;
  }
  for (const c of candidatos) { try { return JSON.parse(c); } catch { /* pasa al siguiente candidato */ } }
  return undefined;
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export interface OpcionesRespuestaPreset {
  /** El catálogo de la versión instalada (`cargarCatalogo`): fija los tipos de componente conocidos. */
  catalogo: ShaderCatalog;
  biblioteca?: OpcionesSet["biblioteca"];
  /** Grupo, página, publicación o Librería: sin cámara nunca, con o sin permiso. */
  compartido?: boolean;
  /** Permiso EXPLÍCITO de la persona para WebcamTexture y ObjectTracker. Por defecto se rechaza la cámara. */
  permisoCamara?: boolean;
  nombre?: string;
  id?: string;
  ahora?: () => Date;
  crearId?: () => string;
}

/** Extrae y valida el preset JSON de la respuesta del modelo como set «.starseed-fondo.json».
 *  Sin permiso de cámara (`permisoCamara`, y nunca en `compartido`), WebcamTexture y ObjectTracker
 *  hacen rechazar el set; igual quien no esté en el catálogo. Sanea el resto. */
export function presetDesdeRespuesta(texto: string, o: OpcionesRespuestaPreset): ResultadoSet {
  const j = extraerJsonPreset(texto);
  if (!esObjeto(j)) return { ok: false, motivos: ["la respuesta no trae un JSON de preset bien formado"] };
  if (j.formato === "starseed-fondo") // ya vino como set completo: se respeta y se valida igual
    return validarSet(j, { catalogo: o.catalogo, biblioteca: o.biblioteca, compartido: compartido(o) });
  if (!Array.isArray(j.components)) return { ok: false, motivos: ["el JSON no trae una lista «components»"] };
  const nombre = typeof j.nombre === "string" && j.nombre.trim() !== "" ? j.nombre.trim().slice(0, 120) : (o.nombre ?? "Fondo de Astraura (shaders)");
  const preset: ShaderPreset = {
    components: j.components,
    ...(typeof j.structureVersion === "number" ? { structureVersion: j.structureVersion } : {}),
  };
  const capa: BackgroundLayer = { id: "astraura", kind: "shader", visible: true, opacity: 1, blend: "normal", preset };
  const datos: DatosSet = { id: o.id, nombre, autor: "Astraura · habilidad Shaders", licencias: [], base: null, capas: [capa] };
  return exportarSet(datos, { catalogo: o.catalogo, biblioteca: o.biblioteca, compartido: compartido(o), ahora: o.ahora, crearId: o.crearId });
}

function compartido(o: OpcionesRespuestaPreset): boolean {
  return o.compartido === true || !o.permisoCamara; // sin permiso explícito, todo iba como compartido: cámara fuera
}

/** La habilidad como capacidad viva del registro, con el tamaño pedido. */
export function comoCapacidad(h: HabilidadShaders, tamano: "tarjeta" | "resumen"): SkillCapability {
  return { id: h.id, label: h.nombre, systemPrompt: `${h[tamano]} (${h.autor}, ${h.licencia})` };
}
