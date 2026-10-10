/*
 * avisos — comprobaciones de honestidad ANTES de que un dueño apruebe un borrador (2026-10-10).
 * Cruzan el borrador con el directorio: no sustituyen la lectura de quien aprueba, la ayudan.
 * Puro: sin red ni React (el panel las pinta; scripts/sociales/metageminis.py repite las mismas reglas).
 */

import { DIRECTORIO, type SitioDirectorio } from "./directorio";
import { puedeEnviarElAgente, puedeRedactar, sitioPorId } from "./consulta";
import type { Borrador } from "./tipos";

export interface AvisoBorrador {
  /** «alto» = no debería enviarse tal cual; «medio» = revisar antes. */
  nivel: "alto" | "medio";
  texto: string;
}

/** ¿El texto dice que lo escribe un agente de IA? (obligatorio en todo lo que sale con nombre de StarSeed). */
const DICE_QUE_ES_IA = /\b(agente\s+de\s+ia|agente\s+de\s+inteligencia\s+artificial|inteligencia\s+artificial|ia\s+de\s+starseed|ai\s+agent|automated\s+agent|artificial\s+intelligence)\b/i;

export function diceQueEsIA(texto: string): boolean {
  return DICE_QUE_ES_IA.test(texto);
}

export function avisosBorrador(
  b: Pick<Borrador, "sitio_id" | "canal" | "cuerpo" | "asunto">,
  hoy: Date = new Date(),
  base: readonly SitioDirectorio[] = DIRECTORIO,
): AvisoBorrador[] {
  const avisos: AvisoBorrador[] = [];
  let sitio: SitioDirectorio | undefined;
  if (b.sitio_id) {
    sitio = sitioPorId(b.sitio_id, base);
    if (!sitio) avisos.push({ nivel: "medio", texto: "Ese sitio no está en el directorio: nadie ha leído sus normas." });
  }
  if (sitio) {
    if (sitio.ia_en_texto === "no-aceptada") {
      avisos.push({ nivel: "alto", texto: "Este sitio no acepta texto escrito por IA. Solo vale una ficha de datos que la persona reescriba con sus palabras." });
    }
    if (sitio.agentes === "prohibido") {
      avisos.push({ nivel: "alto", texto: "Las normas del sitio prohíben que un agente escriba allí." });
    } else if (sitio.agentes === "solo-lectura") {
      avisos.push({ nivel: "alto", texto: "Con este sitio el agente solo lee y vigila: no debe escribir." });
    } else if (sitio.agentes === "sin-verificar") {
      avisos.push({ nivel: "medio", texto: "Las normas de este sitio sobre agentes no se han leído todavía." });
    }
    if (sitio.estado === "cerrado" || sitio.estado === "no-encaja") {
      avisos.push({ nivel: "alto", texto: sitio.estado === "cerrado" ? "Este sitio está cerrado." : "Este sitio no encaja con StarSeed." });
    }
    if (sitio.vence) {
      const [a, m, d] = sitio.vence.split("-").map(Number);
      const limite = Date.UTC(a, m - 1, d);
      const ahora = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
      if (limite < ahora) avisos.push({ nivel: "alto", texto: `El plazo de este sitio venció el ${sitio.vence}.` });
    }
    if (b.canal === "api_oficial" && !puedeEnviarElAgente(sitio) && puedeRedactar(sitio)) {
      avisos.push({ nivel: "medio", texto: "El directorio no da al agente una vía oficial en este sitio: mejor que lo envíe una persona." });
    }
  }
  if (b.canal !== "manual_alex" && !diceQueEsIA(`${b.asunto ?? ""}\n${b.cuerpo}`)) {
    avisos.push({ nivel: "medio", texto: "El texto no dice que lo escribe un agente de IA de StarSeed." });
  }
  return avisos;
}

/** El peor nivel entre los avisos (para ordenar y colorear). */
export function nivelMasAlto(avisos: readonly AvisoBorrador[]): "alto" | "medio" | null {
  if (avisos.some((a) => a.nivel === "alto")) return "alto";
  return avisos.length ? "medio" : null;
}
