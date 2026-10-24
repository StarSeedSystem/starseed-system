"use client";

import type { SkillCapability } from '@/ai/astraura/skills';
import type { BackgroundLayer } from '@/lib/appearance/background-layers';
import type { ShaderCatalog, ShaderCatalogEntry } from '@/lib/appearance/catalogo-shaders';
import type { OpcionesSet } from '@/lib/appearance/sets-fondo';
import { validarSet } from '@/lib/appearance/sets-fondo';
import { formatearComponents, probarPreset } from './components';

/**
 * Habilidades de Shaders: crear un fondo describiéndolo · Ola 1018F · Tarea FSH1018Q
 * -----------------------------------------------------------------------------------------------------------
 * Habilidad para Astraura que compone presets de fondos con el motor WebGPU `shaders`
 * (paquete MIT, 4.0.4, componentes como capas en React, Vue, Svelte, Solid o JS vanilla).
 * El usuario describe un fondo (p. ej. "transparente con glóbulos rojos al estilo aurora, difuminado suave, rotar lento"),
 * la habilidad extrae JSON con preset desde la respuesta, valida con sets-fondo.ts (catálogo de la versión instalada),
 * rechaza componentes desconocidos y actualiza capa shader/difusión con posición, máscara y opacidad
 * del fondo actual (motor base Spline, capa de abajo).
 *
 * Exporta: SHADERS_SKILL (capacidad) para la Biblioteca. Fichas: tarjeta (≤60) y resumen (≤120).
 * Contrato: architecture/fondos-shaders.md §6, rule-set desde components.md, formato de preset desde shaders/js.
 * Reglas: sin `any`; texto con acentos; cursor-pointer en lo clicable; módulos PUROS; telemetría apagada.
 */

export const MAX_PALABRAS_TARJETA = 60;
export const MAX_PALABRAS_RESUMEN = 120;

export interface HabilidadShader {
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

export const SHADERS_HABILIDAD: HabilidadShader = {
  id: "shaders",
  nombre: "Fondos con Shaders: crear un fondo describiéndolo",
  cuando: "Cuando un usuario pide un fondo animado, efecto WebGPU, degradado, aurora, blur, glass, distorsión, partículas, glow, transición o cualquier efecto GPU-renderizado para una página, perfil, app o sección, o menciona el motor Shaders (MIT) o la librería `shaders/js`.",
  tarjeta: "Extrae y valida un preset JSON con capas shader (WebGPU) o difusión desde una descripción del usuario. Revisa componentes del catálogo de la versión instalada, rechaza componentes desconocidos o prohibidos, mantiene el motor base Spline como opción principal, y expone un editor visual para capa shader/difusión con posición, máscara y opacidad.",
  resumen: "Componer un fondo WebGPU describiéndolo: extraer un preset JSON válido de un motor (WebGPU) desde el paquete `shaders` MIT 4.0.4, validando componentes contra el catálogo de la versión instalada (shaders/registry). Todo el preset es JSON plano con componentes como capas que se mezclan en la GPU; las reglas son texto plano con acentos, sin red, sin DOM y sin GPU en tests. El motor base Spline por defecto sigue siendo la opción principal. El preview fijo sirve para dispositivos sin WebGPU, telemetría apagada (`disableTelemetry: true`), sin presets de shaders.com, sin cámara en sets compartidos, y migraciones persistidas obligatorias para cuentas existentes.",
  rutaCompleta: "vendor/habilidades/shaders/SKILL.md",
  licencia: "MIT",
  autor: "Shader Effects Inc.",
};

export function contarPalabras(texto: string): number {
  return texto.trim().split(/\s+/).filter(Boolean).length;
}

/** Extrae un objeto JSON plano (type, id, props, children) desde un texto plano. */
export function extraerJsonDesdeTexto(texto: string): unknown {
  const limpio = texto
    .trim()
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\n\s*\n/g, "\n");

  const primeraCurly = limpio.indexOf("{");
  const ultimaCurly = limpio.lastIndexOf("}");

  if (primeraCurly === -1 || ultimaCurly === -1 || primeraCurly >= ultimaCurly) {
    return null;
  }

  const posibleJson = limpio.substring(primeraCurly, ultimaCurly + 1);

  try {
    return JSON.parse(posibleJson);
  } catch (e) {
    return null;
  }
}

/** Valida un JSON con preset usando el catálogo y las opciones dadas; rechaza desconocidos. */
export function presetDesdeRespuesta(texto: string, catalogo: ShaderCatalog, opciones: OpcionesSet): unknown {
  const json = extraerJsonDesdeTexto(texto);
  if (!json) {
    throw new Error("No se pudo extraer un preset JSON válido de la respuesta");
  }

  if (!esObj(json) || typeof json.components !== "undefined") {
    throw new Error("El JSON extraído no es un preset válido de Shaders");
  }

  const x: Ctx = {
    o: opciones,
    m: [],
    tipos: new Map(Object.values(catalogo).flat().map((e) => [e.name, e] as const)),
    nodos: 0,
  };

  const componentes = Array.isArray(json.components) ? json.components : [];
  const sanitizados = sanitizarComponentes(componentes, x);

  if (x.m.length) {
    throw new Error(x.m.join(" "));
  }

  return {
    components: sanitizados,
    structureVersion: typeof json.structureVersion === "number" ? json.structureVersion : 1,
  };
}

interface Ctx {
  o: OpcionesSet;
  m: string[];
  tipos: Map<string, ShaderCatalogEntry>;
  nodos: number;
}

type Obj = Record<string, unknown>;

function esObj(v: unknown): v is Obj {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function sanitizarComponentes(lista: unknown, x: Ctx): Obj[] {
  if (!Array.isArray(lista)) return [];

  const out: Obj[] = [];
  for (const c of lista) {
    if (++x.nodos > 200) {
      x.m.push("preset demasiado grande");
      break;
    }

    if (!esObj(c) || typeof c.type !== "string") {
      x.m.push("componente sin tipo");
      continue;
    }

    const entrada = x.tipos.get(c.type);
    if (!entrada) {
      x.m.push(`componente desconocido: ${c.type}`);
      continue;
    }

    const props = esObj(c.props) ? c.props : {};
    revisarUrls(props, "", 1, x);

    const hijos = Array.isArray(c.children) ? { children: sanitizarComponentes(c.children, x) } : {};
    out.push({
      type: c.type,
      ...(typeof c.id === "string" ? { id: c.id.slice(0, 64) } : {}),
      props,
      ...hijos,
    });
  }

  return out;
}

function revisarUrls(v: unknown, clave: string, prof: number, x: Ctx): void {
  if (prof > 12) x.m.push("datos demasiado anidados");
  else if (Array.isArray(v)) v.forEach((e) => revisarUrls(e, clave, prof + 1, x));
  else if (esObj(v)) for (const [k, e] of Object.entries(v)) revisarUrls(e, k, prof + 1, x);
  else if (
    (typeof v === "string" && /^(url|src|href)$/i.test(clave)) ||
    /^\s*(\/\/|[a-z][a-z0-9+.-]*:\/\/|(data|blob):)/i.test(v)
  ) {
    if (!/^(data:(image|video)\/[a-z0-9.+-]+[;,]|(starseed:\/\/library\/)|local-archivos-malla:\/\/)/i.test(v)) {
      x.m.push(`URL fuera de la Biblioteca: ${v.slice(0, 60)}`);
    }
  }
}

/** Prepara un set de fondos a partir de un preset con capas shader. */
export function crearSetDesdePreset(preset: unknown, base: string | null, capas: BackgroundLayer[], autor: string, nombre: string, licencias: string[] = []): unknown {
  const generarId = (): string => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = 'f';
    for (let i = 0; i < 12; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  };

  return {
    formato: "starseed-fondo",
    version: 1,
    id: generarId(),
    nombre,
    autor,
    licencias: [...new Set([...licencias, "MIT · paquete npm «shaders» (Shader Effects Inc.)"])],
    base,
    capas: [...capas, { id: generarId(), kind: "shader", name: nombre, visible: true, opacity: 1, blend: "normal", mascara: "ninguna", transform: { x: 0, y: 0, escala: 1, rotacion: 0, ancho: 1, alto: 1 }, preset: { components: Array.isArray(preset) ? preset : [] } }],
    creado: new Date().toISOString(),
  };
}

/** Conecta la habilidad a la forma del registro para la Biblioteca. */
export function comoCapacidad(h: HabilidadShader): SkillCapability {
  return {
    id: h.id,
    label: h.nombre,
    systemPrompt: `${h.tarjeta} (${h.autor}, ${h.licencia})`,
  };
}