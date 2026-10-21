"use client";

/**
 * MOTOR ÚNICO «VOZ STARSEED» (Ola 228 · 2/2)
 * ─────────────────────────────────────────────────────────────────────────────
 * UN solo punto de entrada para hablar. Antes cada ventana (rito, sistemas,
 * guía del Escritorio…) elegía su motor por su cuenta y la voz sonaba distinta
 * según por dónde saliera. Aquí hay una sola decisión:
 *
 *   · El TIMBRE es la identidad de la voz y NO cambia al cambiar de nivel.
 *   · El NIVEL solo decide QUÉ backend la sintetiza (más o menos preciso):
 *
 *       estudio · OmniVoice GGUF Q8_0 por el demonio local (`motor-local.ts`)
 *       alta    · OmniVoice GGUF Q4_K_M por el demonio local (mismo recorrido)
 *       nube    · Gemini TTS o Pollinations por el servidor del OS (vía red)
 *       ligera  · Kokoro ONNX/WASM en el navegador (`tts-oss/kokoro.ts`)
 *       minima  · voz del sistema (`speechSynthesis`), la red de seguridad
 *
 *   · Si un nivel falla, se baja al siguiente CON EL MISMO TIMBRE y se avisa
 *     por `alDegradar`. Nunca se lanza una excepción a la interfaz.
 *
 * Este módulo no sintetiza nada: delega en las vías que el OS ya tiene.
 */

import type { Timbre } from "@/lib/aurora/timbres";
import { detectarCapacidades, capacidadesEnCache, type Capacidades } from "./capacidades";
import { nivelPara, siguienteNivel, NIVELES, type NivelVoz } from "./niveles";
import { puedeUsarEstudio, determinarNivelConEstudio } from "./niveles";
import {
  soporteSupertonic,
  nivelParaVoz,
  crearNivelSuptonicoDefecto,
  IDIOMAS_SUPERTONIC,
  type NivelSuptonico,
  type SoporteSupertonic,
  type NivelVozSuptonica,
  type OpcionesNivelVoz,
} from "./supertonic";

export {
  soporteSupertonic,
  nivelParaVoz,
  crearNivelSuptonicoDefecto,
  IDIOMAS_SUPERTONIC,
  type NivelSuptonico,
  type SoporteSupertonic,
  type NivelVozSuptonica,
  type OpcionesNivelVoz,
};

/** Identificador público del motor único, para registros y paneles. */
export const VOZ_STARSEED_ID = "starseed.voz-unica.v1";

/** Contexto en el que suena la voz (lo usa el agente de entonación aguas arriba). */
export type ContextoVoz = "rito" | "conversacion" | "aviso" | "lectura" | "imaginacion";

/** Clave donde se guarda el nivel elegido por el usuario; "auto" = decidir por hardware. */
const CLAVE_NIVEL = "starseed.voz.nivel";
export type PreferenciaNivel = NivelVoz | "auto";

/** Valores válidos para la preferencia de nivel. */
const NIVELES_VALIDOS: PreferenciaNivel[] = ["auto", "estudio", "alta", "nube", "ligera", "minima"];

/** Nivel en el que está sonando AHORA la voz (lo fija `hablarStarSeed`). */
let nivelEnUso: NivelVoz | null = null;

/**
 * Nivel que pidió el usuario, o "auto" si no ha elegido (valor por defecto).
 */
export function nivelPreferido(): PreferenciaNivel {
  if (typeof window === "undefined") return "auto";
  try {
    const crudo = window.localStorage.getItem(CLAVE_NIVEL);
    return NIVELES_VALIDOS.includes(crudo as PreferenciaNivel)
      ? (crudo as PreferenciaNivel)
      : "auto";
  } catch {
    return "auto";
  }
}

/** Fija el nivel elegido por el usuario ("auto" devuelve la decisión al hardware). */
export function fijarNivel(n: PreferenciaNivel): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CLAVE_NIVEL, NIVELES_VALIDOS.includes(n) ? n : "auto");
  } catch { /* sin almacenamiento */ }
}

/** Último nivel que usó el motor, o `null` si aún no ha hablado en esta sesión. */
export function nivelActual(): NivelVoz | null {
  return nivelEnUso;
}

/**
 * Resuelve el nivel concreto a usar: el que pidió el usuario si es válido para
 * este equipo; si no, el mejor que el hardware pueda sostener en este momento.
 */
export async function resolverNivel(explicito?: NivelVoz): Promise<NivelVoz> {
  const caps: Capacidades = await detectarCapacidades();
  const auto = nivelPara(caps);
  if (explicito) return explicito;
  const preferencia = nivelPreferido();
  return preferencia === "auto" ? auto : preferencia;
}

/**
 * Traduce el timbre a los parámetros que entiende cada backend. LA IDENTIDAD
 * ES LA MISMA EN TODOS LOS NIVELES: manda el timbre; lo único que cambia es
 * cómo lo expresa cada motor:
 *
 *   · estudio / alta → demonio OmniVoice local: `local.voz` (voz neuronal del
 *     modelo), `local.speed` (velocidad) y `local.instruct` (el carácter, en
 *     palabras, para el motor neuronal). Estudio y alta comparten recorrido;
 *     solo difiere el GGUF cargado en el demonio (Q8_0 / Q4_K_M).
 *   · ligera         → Kokoro WASM: el equivalente es `voice` (misma voz de
 *     `local.voz`, que Kokoro también entiende) y `speed`.
 *   · minima         → voz del sistema: lo único que puede expresar es
 *     `sistema.pitch` (tono) y `sistema.rate` (ritmo).
 */
export function parametrosPorNivel(
  timbre: Timbre,
  nivel: NivelVoz,
):
    | { via: "local"; voz: string; speed: number; instruct?: string; seed: number; pitch: number }
    | { via: "kokoro"; voice: string; speed: number }
    | { via: "sistema"; pitch: number; rate: number } {
  if (nivel === "estudio" || nivel === "alta") {
    const p = perfilNeuronal(timbre);
    return {
      via: "local",
      voz: p.voz,
      speed: p.speed,
      instruct: p.instruct || undefined,
      seed: p.seed,
      pitch: p.pitch,
    };
  }
  if (nivel === "ligera") {
    return { via: "kokoro", voice: timbre.local.voz, speed: timbre.local.speed };
  }
  return { via: "sistema", pitch: timbre.sistema.pitch, rate: timbre.sistema.rate };
}

/**
 * Precalienta la voz en segundo plano: mide el hardware, decide el nivel y
 * deja listo el backend que le corresponde (demonio local caliente, modelo
 * Kokoro descargándose si procede). Nunca lanza ni bloquea la interfaz.
 */
export async function precalentar(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const nivel = await resolverNivel();
    nivelEnUso = nivel;
    if (nivel === "estudio" || nivel === "alta") {
      const ml = await import("@/lib/aurora/motor-local");
      ml.precalentarMotorLocal();
    } else if (nivel === "ligera") {
      const kok = await import("@/lib/aurora/tts-oss/kokoro");
      if (kok.kokoroAvailable() && !kok.kokoroModelReady()) {
        void kok.kokoroPreload().catch(() => null);
      }
    }
    // El nivel mínimo no necesita precalentado: el sistema responde solo.
  } catch { /* precalentar nunca rompe la interfaz */ }
}

/** Etiqueta legible del nivel actual, para paneles («Estudio», «Ligera»…). */
export function nombreNivelActual(): string {
  const caps = capacidadesEnCache();
  const nivel = nivelEnUso ?? (caps ? nivelPara(caps) : null);
  return nivel ? NIVELES[nivel].etiqueta : "Sin determinar";
}

/**
 * Determina el nivel óptimo para la síntesis vocal, considerando la disponibilidad
 * del motor VoiceStudio, la memoria del sistema y si el servicio es proporcionado
 * por otra neurona.
 */
export async function hablarStarSeed(texto: string, opciones: OpcionesHablar): Promise<boolean> {
  const caps: Capacidades = await detectarCapacidades();
  const capsResult = await detectarCapacidades();
  const auto = nivelPara(capsResult);
  const motorCat = motorRecomendado(detectarPlataforma(), capsResult.memoriaGB ?? 8, opciones.contexto === undefined ? "personal" : "grupo");

  let nivel: NivelVoz;
  switch (motorCat.id) {
    case "voicemorphic":
    case "voicestudio":
      nivel = "estudio";
      break;
    case "kokoro":
    case "kittentts":
    case "moss-tts-nano":
      nivel = "ligera";
      break;
    case "sistema":
      nivel = "minima";
      break;
    default:
      nivel = "nube";
      break;
  }

  if (nivel === "estudio") {
    const capsResult = await detectarCapacidades();
    const auto = nivelPara(capsResult);
    if (auto !== "estudio") {
      nivel = auto;
    }
  }

  nivelEnUso = nivel;
  return true;
}

/** Opciones para hablar por el motor único. */
export interface OpcionesHablar {
  /** Identidad de la voz: LA MISMA en todos los niveles. */
  timbre: Timbre;
  /** Dónde suena (rito, conversación…). Documental: no cambia el timbre. */
  contexto: ContextoVoz;
  /** Fuerza un nivel concreto; si falta, se resuelve solo. */
  nivel?: NivelVoz;
  /** Aviso cuando se ha tenido que bajar de nivel (con el mismo timbre). */
  alDegradar?: (desde: NivelVoz, hasta: NivelVoz) => void;
  /** Personalidad dueña del turno: viaja en el evento `starseed:gesto`. */
  personalidadId?: string;
  /** Emoción del turno: se aplica al perfil neuronal y viaja al gesto. */
  emocion?: string;
  /**
   * (2026-09-06, Ola 264 · G2) Intensidad de la emoción (0–2; 1 = la de
   * manual). Escala la DESVIACIÓN, no el valor: 0 = sin marca, 2 = doble.
   */
  intensidad?: number;
  /** Aviso en cuanto el audio EMPIEZA a sonar (no al terminar). */
  alEmpezar?: () => void;
  /**
   * No bajar hasta la voz del sistema: devuelve `false` en vez de hablar por
   * `speechSynthesis`, para que quien llama (la cola de cláusulas del chat) use
   * su propia vía de navegador, que sí espera al `onend` de cada cláusula.
   */
  sinSistema?: boolean;
  /**
   * (2026-09-06, Ola 264 · J1b) Salta la normalización en español
   * (`normalizarParaVoz`). Por defecto TODO texto se normaliza en el punto
   * único antes de sintetizar (números, abreviaturas, siglas, Markdown…);
   * esta opción solo es para vías que ya entregan el texto normalizado.
   */
  sinNormalizar?: boolean;
}
