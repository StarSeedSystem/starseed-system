/**
 * Genesis · conectores abiertos — Tarea W de Ola 1019G
 * Habilidades de la Biblioteca para los agentes de Genesis y PoliGenesis.
 *
 * `habilidadesPara` es PURO: elige las capacidades del manifiesto
 * (src/ai/astraura/skills.ts) que sirven a un PAPEL o DIRECTOR del ámbito
 * (genesis-conectores-abiertos.md §6), por el `routing` de la capacidad y por
 * ETIQUETAS de su nombre, y entrega cada una en el tamaño de la capa del
 * modelo elegido (architecture/laya-y-habilidades.md §5): tarjeta ≤ 60
 * palabras para los reflejos (Needle · BitNet), resumen ≤ 250 para el medio
 * (Bonsai 1,7–4B) y completa tal cual para razón, profunda y nube.
 * Sin red, sin reloj, sin almacenamiento: solo entrada → salida.
 */

import type { SkillCapability } from "@/ai/astraura/skills";

export type CapaModelo = "tarjeta" | "resumen" | "completa";

/** Papeles (escritor…código) y directores (optimizador…aprendizaje) del ámbito. */
export type PapelODirector =
  | "escritor" | "revisor" | "chat" | "visión" | "voz" | "imagen" | "código"
  | "optimizador" | "diseno" | "produccion" | "nube" | "medidores" | "aprendizaje";

/** Banderas de `routing` de SkillCapability, en orden de lectura. */
const BANDERAS_ROUTING = ["preferStrong", "web", "vision", "planning"] as const;

/** Qué banderas de `routing` son útiles para cada papel o director. */
const ROUTING_POR_ROL: Record<string, readonly string[]> = {
  escritor: ["preferStrong", "planning"],
  revisor: ["preferStrong", "vision"],
  chat: ["preferStrong", "web"],
  "visión": ["preferStrong", "vision"],
  voz: [],
  imagen: ["preferStrong"],
  "código": ["preferStrong", "planning"],
  optimizador: ["planning"],
  diseno: ["preferStrong"],
  produccion: [],
  nube: [],
  medidores: [],
  aprendizaje: ["preferStrong", "planning"],
};

/** Etiquetas del nombre de la capacidad (sin acentos) que la señalan para el rol. */
const ETIQUETAS_POR_ROL: Record<string, readonly string[]> = {
  escritor: ["handoff", "recetas", "constructor", "prototipo", "planificador"],
  revisor: ["grill", "auditoria", "seguridad"],
  chat: ["consejo", "deliberacion", "politica"],
  "visión": ["vision", "imagen", "foto"],
  voz: ["voz", "audio", "pipecat"],
  imagen: ["imagen", "generacion", "video", "taste"],
  "código": ["codigo", "contenedor", "ejecucion", "agentes de desarrollo", "apps"],
  optimizador: ["enrutado", "proxy", "presupuesto", "compresion"],
  diseno: ["diseno", "estetica", "pizarra", "penpot", "interfaz"],
  produccion: ["audiovisual", "video", "publicar", "redes"],
  nube: ["contenedor", "paas", "desplegar", "respaldo", "autoalojado"],
  medidores: ["enrutado", "proxy", "telemetria"],
  aprendizaje: ["ensenar", "teach", "investigacion", "memoria"],
};

/** Quita acentos y pasa a minúsculas para comparar papeles y etiquetas. */
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Recorta el texto de la capacidad al tamaño que pide la capa del modelo. */
function recortarTexto(texto: string, capa: CapaModelo): string {
  const limite = capa === "tarjeta" ? 60 : capa === "resumen" ? 250 : 0;
  if (limite === 0) return texto;
  const palabras = texto.split(/\s+/).filter(Boolean);
  if (palabras.length <= limite) return texto;
  return palabras.slice(0, limite).join(" ") + "...";
}

/** ¿La capacidad sirve al rol? General (sin routing) sirve a todos; con routing,
 *  vale la etiqueta del nombre o una bandera que encaje. */
function encaja(capacidad: SkillCapability, rol: string): boolean {
  const encendidas = BANDERAS_ROUTING.filter((b) => (capacidad.routing ?? {})[b]);
  if (encendidas.length === 0) return true;
  const nombre = normalizar(capacidad.label);
  if ((ETIQUETAS_POR_ROL[rol] ?? []).some((etiqueta) => nombre.includes(etiqueta))) {
    return true;
  }
  const utiles = ROUTING_POR_ROL[rol] ?? [];
  return encendidas.some((bandera) => utiles.includes(bandera));
}

export function habilidadesPara(
  papel: string,
  ambito: string,
  opciones: {
    /** Capacidades posibles (SKILL_CAPABILITIES de src/ai/astraura/skills.ts). */
    capacidades: SkillCapability[];
    /** Ids de capacidades que el ámbito o la persona apagaron. */
    desactivadas: string[];
  },
  capa: CapaModelo = "completa"
): SkillCapability[] {
  // El ámbito llega por §6: la selección no depende aún de él, queda reservado.
  void ambito;
  const rol = normalizar(papel);
  const apagadas = new Set(opciones.desactivadas);
  return opciones.capacidades
    .filter((capacidad) => !apagadas.has(capacidad.id) && encaja(capacidad, rol))
    .map((capacidad) => ({
      ...capacidad,
      systemPrompt: recortarTexto(capacidad.systemPrompt, capa),
    }));
}
