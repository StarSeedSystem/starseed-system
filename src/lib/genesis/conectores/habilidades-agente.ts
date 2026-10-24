"use client";

import { SkillCapability } from "@/ai/astraura/skills";

export type CapaModelo = "tarjeta" | "resumen" | "completa";

type SenalRouting = "preferStrong" | "web" | "vision" | "planning";

/** Señales de routing que necesita cada papel o director (contrato §6). */
const SENALES_POR_ROL: Record<string, SenalRouting[]> = {
  escritor: ["preferStrong", "web", "planning"],
  revisor: ["preferStrong", "vision"],
  chat: ["preferStrong", "web", "vision", "planning"],
  "visión": ["vision", "preferStrong", "web"],
  voz: [],
  imagen: ["preferStrong"],
  código: ["preferStrong", "web", "planning"],
  // Directores del ámbito (genesis-conectores-abiertos.md §6).
  director: ["preferStrong", "planning"],
  optimizador: ["preferStrong", "planning"],
  diseño: ["preferStrong", "vision", "planning"],
  producción: ["preferStrong", "planning"],
  nube: ["preferStrong", "web"],
  medidores: ["preferStrong", "planning"],
  aprendizaje: ["preferStrong", "planning"],
};

/** La voz y la imagen dependen del medio, no de las señales: pasan siempre. */
const ROLES_SIN_FILTRO = new Set<string>(["voz"]);

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Realza por etiquetas: el papel (o el ámbito) aparece en la etiqueta o en el id. */
function coincideConEtiqueta(habilidad: SkillCapability, texto: string): boolean {
  const buscado = normalizar(texto).trim();
  if (buscado.length < 3) return false;
  const etiqueta = normalizar(`${habilidad.label} ${habilidad.id}`);
  return buscado.split(/\s+/).some((palabra) => palabra.length >= 3 && etiqueta.includes(palabra));
}

/** TARJETA (≤ 60 palabras, Needle y BitNet) · RESUMEN (≤ 250, Bonsai) · COMPLETA. */
function recortarTexto(texto: string, capa: CapaModelo): string {
  if (capa === "completa") return texto;
  const tope = capa === "tarjeta" ? 60 : 250;
  const palabras = texto.split(/\s+/).filter(Boolean);
  if (palabras.length <= tope) return texto;
  return palabras.slice(0, tope).join(" ") + "…";
}

export function habilidadesPara(
  papel: string,
  ambito: string,
  opciones: {
    capacidades: SkillCapability[];
    desactivadas: string[];
  },
  capa: CapaModelo = "completa"
): SkillCapability[] {
  const { capacidades, desactivadas } = opciones;
  return capacidades
    .filter((h) => !desactivadas.includes(h.id))
    .filter((h) => evaluarHabilidadParaPapel(h, papel, ambito))
    .map((h) => ({ ...h, systemPrompt: recortarTexto(h.systemPrompt, capa) }));
}

/** Elige por etiquetas primero (papel o ámbito mencionado en la habilidad) y, si
 *  la habilidad declara routing, por las señales que pide su papel o director. */
export function evaluarHabilidadParaPapel(
  habilidad: SkillCapability,
  papel: string,
  ambito: string
): boolean {
  if (coincideConEtiqueta(habilidad, papel) || coincideConEtiqueta(habilidad, ambito)) return true;
  const routing = habilidad.routing;
  if (!routing) return true;
  if (!(routing.preferStrong || routing.web || routing.vision || routing.planning)) return true;
  if (ROLES_SIN_FILTRO.has(papel)) return true;
  const senales = SENALES_POR_ROL[papel];
  if (!senales) return !!routing.preferStrong;
  return senales.some((senal) => !!routing[senal]);
}
