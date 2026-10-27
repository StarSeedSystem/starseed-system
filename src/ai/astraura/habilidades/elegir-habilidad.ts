import type { PreguntaChoice } from "@/lib/jev/decisiones";
import type { RespuestaLaya } from "../router-laya";
import type { HabilidadIngenieria } from "./ingenieria-a";
import { HABILIDADES_INGENIERIA } from "../skills-ingenieria";
import { puntoDecision, UMBRAL_POR_DEFECTO } from "@/lib/astraura/laya/puntos-decision";

/**
 * Elegir habilidad por Laya y tamaño por capa (Ola 1018L · contrato
 * architecture/laya-y-habilidades.md §4-§5)
 * ---------------------------------------------------------------------------
 * Laya decide QUÉ habilidad de ingeniería aplica a la tarea (punto de decisión
 * «habilidad.elegir»: una pregunta `choice` con el `cuando` de cada una más la
 * opción «ninguna») y la CAPA que va a responder decide el TAMAÑO inyectado:
 * la tarjeta (≤ 60 palabras) para reflejo y memoria (Needle y BitNet), el
 * resumen (≤ 120) para palabra y razón (Bonsai), y la referencia al SKILL.md
 * completo para profunda y nube. Decidir usa solo la confianza CALIBRADA
 * `answer_confidence`, nunca `confidence`.
 *
 * Módulo PURO: sin red, disco ni reloj; la respuesta de Laya ya trae el que
 * llama, nunca se espera aquí (en CPU tarda segundos y no bloquea la primera
 * palabra). Atribución del contenido: Matt Pocock, MIT.
 */

/** La opción que siempre está en la pregunta: responder sin aplicar ninguna. */
export const NINGUNA_HABILIDAD = {
  id: "ninguna",
  texto: "Ninguna habilidad: responder sin aplicar ninguna",
} as const;

/** Lo mínimo que una habilidad debe decir para entrar en la pregunta de Laya. */
export interface HabilidadElegible {
  readonly id: string;
  readonly cuando: string;
}

/** La pregunta `choice` del punto «habilidad.elegir»: criterio = `cuando` de cada habilidad + «ninguna». */
export function preguntaHabilidad(habilidades: readonly HabilidadElegible[]): PreguntaChoice {
  const criteria: Record<string, string> = {};
  for (const h of habilidades) criteria[h.id] = h.cuando;
  criteria[NINGUNA_HABILIDAD.id] = NINGUNA_HABILIDAD.texto;
  return {
    type: "choice",
    instructions: "¿Qué habilidad conviene aplicar a esta tarea?",
    criteria,
  };
}

/** Qué tamaño inyecta cada capa: reflejo y memoria leen la tarjeta, palabra y
 *  razón (Bonsai) el resumen, y profunda y nube la guía completa («nube» no es
 *  capa del catálogo: es la fuente remota, que siempre recibe la referencia). */
export type TamanioHabilidad = "tarjeta" | "resumen" | "completa";
export type CapaRespuesta =
  | "reflejo" | "memoria" | "palabra" | "razon" | "profunda" | "voz" | "adaptador" | "nube";
export const TAMANIO_POR_CAPA: Readonly<Record<CapaRespuesta, TamanioHabilidad>> = {
  reflejo: "tarjeta", memoria: "tarjeta",
  palabra: "resumen", razon: "resumen", voz: "resumen", adaptador: "resumen",
  profunda: "completa", nube: "completa",
};

/** Lo que `bloqueHabilidad` necesita de cada habilidad (la cumple `HabilidadIngenieria`). */
export interface HabilidadBloque extends HabilidadElegible {
  readonly nombre: string;
  readonly tarjeta: string;
  readonly resumen: string;
  readonly rutaCompleta: string;
  readonly licencia: string;
  readonly autor: string;
}

/** Umbral del punto «habilidad.elegir» del catálogo (sobre `answer_confidence`). */
export const UMBRAL_HABILIDAD =
  puntoDecision("habilidad.elegir")?.umbral ?? UMBRAL_POR_DEFECTO;

/** La opción elegida: la cadena `choice` o, por tolerancia, la mayor de `probabilities`. */
function opcionDe(r: RespuestaLaya): string | null {
  if (typeof r.choice === "string" && r.choice) return r.choice;
  const probs = r.probabilities;
  if (probs && typeof probs === "object" && !Array.isArray(probs)) {
    const pares = Object.entries(probs).filter(([, v]) => typeof v === "number");
    const mayor = pares.sort((a, b) => (b[1] as number) - (a[1] as number))[0];
    if (mayor && mayor[0]) return mayor[0];
  }
  return null;
}

/**
 * El texto a INYECTAR al modelo que va a responder, y "" si nada aplica:
 *  · sin respuesta, respuesta de forma rara, capa desconocida o `choice`
 *    «ninguna» o desconocida → "" (responder sin habilidad: el respaldo del punto).
 *  · `answer_confidence` (la calibrada) por debajo del umbral, o ausente → "".
 *    `confidence` de OpenRouter NO decide nunca.
 *  · la capa da el tamaño: tarjeta en reflejo/memoria, resumen en palabra y
 *    razón, y la referencia al SKILL.md completo en profunda y nube.
 * Nunca lanza: una respuesta de forma rara se ignora.
 */
export function bloqueHabilidad(
  respuesta: RespuestaLaya | null | undefined,
  capa: string,
  umbral: number = UMBRAL_HABILIDAD,
  habilidades: readonly HabilidadIngenieria[] = HABILIDADES_INGENIERIA,
): string {
  try {
    if (!respuesta || typeof respuesta !== "object") return "";
    const tipo = TAMANIO_POR_CAPA[capa as CapaRespuesta];
    if (!tipo) return "";
    const confianza = respuesta.answer_confidence;
    if (typeof confianza !== "number" || !Number.isFinite(confianza) || confianza < umbral) return "";
    const id = opcionDe(respuesta);
    if (!id || id === NINGUNA_HABILIDAD.id) return "";
    const h = habilidades.find((x) => x.id === id);
    if (!h) return "";
    if (tipo === "completa") {
      return `${h.nombre}. Aplica su guía completa: ${h.rutaCompleta} (texto original, ${h.autor}, ${h.licencia}).`;
    }
    return `${h.nombre}. ${h[tipo]}`;
  } catch {
    return "";
  }
}
