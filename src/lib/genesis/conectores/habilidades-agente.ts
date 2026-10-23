/**
 * Genesis · Habilidades de la Biblioteca para los agentes (Ola 1019G, tarea W).
 * Elige las SkillCapability de src/ai/astraura/skills.ts útiles a un papel de
 * agente (por `routing`) o a un director del ámbito (por etiquetas), con el
 * tamaño por capa del modelo elegido (architecture/laya-y-habilidades.md §5):
 * tarjeta ≤ 60 palabras (Needle y BitNet), resumen ≤ 250 (Bonsai) o completa.
 * PURO: sin red, disco ni reloj; las capacidades llegan inyectadas y el ámbito
 * (cuenta, grupo o página) entra solo por `desactivadas`.
 */

import type { SkillCapability } from "@/ai/astraura/skills";
import type { Papel } from "./catalogo-opciones";
import type { Director } from "./asignaciones";

/** Rol que pide habilidades: un papel de agente o un director del ámbito. */
export type RolHabilidades = Papel | Director;

/** Tamaño de la habilidad según la capa del modelo elegido. */
export type CapaModelo = "tarjeta" | "resumen" | "completa";

/** Directores que pueden pedir habilidades (misma lista de asignaciones.ts). */
const DIRECTORES: readonly Director[] = ["chat", "optimizador", "diseno", "produccion", "nube", "medidores", "aprendizaje"];

export function esDirector(rol: RolHabilidades): boolean {
  return (DIRECTORES as readonly string[]).includes(rol);
}

/** Techo de palabras por capa, medido en laya-y-habilidades.md. */
const TECHO_PALABRAS: Record<Exclude<CapaModelo, "completa">, number> = {
  tarjeta: 60,
  resumen: 250,
};

/** Banderas de routing que cada papel aprovecha. Una habilidad sin routing
 *  (o con todos los flags apagados) es NEUTRA: sirve para cualquier papel.
 *  «voz» y «imagen» no aprovechan ninguna bandera concreta: hablan y dibujan
 *  con las habilidades neutras (voz ya la resuelve OmniVoice). */
const BANDERAS_POR_PAPEL: Record<Exclude<Papel, "chat">, string[]> = {
  escritor: ["planning", "web", "preferStrong"],
  revisor: ["preferStrong", "web"],
  visión: ["vision", "preferStrong"],
  voz: [],
  imagen: ["vision"],
  código: ["preferStrong", "planning", "web"],
};

/** Palabras clave que emparejan a un director con las etiquetas de la
 *  habilidad (comparadas sin acentos y en minúsculas). El director «chat»
 *  aprovecha TODAS las habilidades y no necesita claves. */
const CLAVES_POR_DIRECTOR: Record<Exclude<Director, "chat">, string[]> = {
  optimizador: ["enrutado", "proxy", "routellm", "9router", "litellm", "descubrimiento de modelos"],
  diseno: ["taste", "diseño", "design", "estética", "penpot", "pizarra", "clonador"],
  produccion: ["audiovisual", "video", "audio", "voz", "imagen", "edición"],
  nube: ["contenedor", "container", "paas", "self-host", "desplieg", "aislado", "sandbox", "nube", "sincroniz", "respaldo"],
  medidores: ["telemetría", "observabilidad", "presupuesto", "consumo", "medición", "medidor", "coste"],
  aprendizaje: ["memoria", "recordar", "recuerdo", "aprendizaje", "teach", "conocimiento", "rag", "investigación", "notas", "marcadores"],
};

/** Quita acentos y pasa a minúsculas para comparar etiquetas e id. */
export function normalizarEtiqueta(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Recorta el system prompt de una habilidad al tamaño de la capa elegida. */
export function recortarPorCapa(texto: string, capa: CapaModelo): string {
  if (capa === "completa") return texto;
  const techo = TECHO_PALABRAS[capa];
  const palabras = texto.trim().split(/\s+/).filter(Boolean);
  if (palabras.length <= techo) return texto;
  return palabras.slice(0, techo).join(" ") + "…";
}

/** ¿La habilidad sirve a un director? Por etiquetas de nombre e id; «chat»
 *  aprovecha todas. */
export function encajaConDirector(habilidad: SkillCapability, director: Director): boolean {
  if (director === "chat") return true;
  const claves = CLAVES_POR_DIRECTOR[director];
  const pistas = [habilidad.label, habilidad.id].map(normalizarEtiqueta);
  return claves.some((clave) =>
    pistas.some((pista) => pista.includes(normalizarEtiqueta(clave))),
  );
}

/** ¿La habilidad (por `routing` y etiquetas) sirve a este papel o director? */
export function aptaParaRol(habilidad: SkillCapability, rol: RolHabilidades): boolean {
  if (rol === "chat" || esDirector(rol)) {
    return encajaConDirector(habilidad, rol as Director);
  }
  const r = habilidad.routing;
  const sesgoActivo = !!(r && (r.preferStrong || r.web || r.vision || r.planning));
  if (!sesgoActivo) return true;
  const banderas = BANDERAS_POR_PAPEL[rol as Exclude<Papel, "chat">];
  if (!banderas) return true;
  return banderas.some((flag) => !!r?.[flag as keyof NonNullable<typeof r>]);
}

/**
 * Habilidades útiles para un rol en un ámbito. Devuelve una copia de cada
 * capacidad encajada, con su system prompt ya recortado a la capa del modelo
 * que la va a consumir.
 */
export function habilidadesPara(
  rol: RolHabilidades,
  ambito: string,
  opciones: { capacidades: SkillCapability[]; desactivadas: string[] },
  capa: CapaModelo = "completa",
): SkillCapability[] {
  const apagadas = new Set(opciones.desactivadas);
  const salida: SkillCapability[] = [];
  for (const habilidad of opciones.capacidades) {
    if (apagadas.has(habilidad.id)) continue;
    if (!aptaParaRol(habilidad, rol)) continue;
    salida.push({
      ...habilidad,
      systemPrompt: recortarPorCapa(habilidad.systemPrompt, capa),
    });
  }
  return salida;
}
