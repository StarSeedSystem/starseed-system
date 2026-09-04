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

/** Identificador público del motor único, para registros y paneles. */
export const VOZ_STARSEED_ID = "starseed.voz-unica.v1";

/** Contexto en el que suena la voz (lo usa el agente de entonación aguas arriba). */
export type ContextoVoz = "rito" | "conversacion" | "aviso" | "lectura" | "imaginacion";

/** Clave donde se guarda el nivel elegido por el usuario; "auto" = decidir por hardware. */
const CLAVE_NIVEL = "starseed.voz.nivel";
export type PreferenciaNivel = NivelVoz | "auto";

const NIVELES_VALIDOS: PreferenciaNivel[] = ["auto", "estudio", "alta", "ligera", "minima"];

/** Nivel que pidió el usuario, o "auto" si no ha elegido (valor por defecto). */
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

/** Nivel en el que está sonando AHORA la voz (lo fija `hablarStarSeed`). */
let nivelEnUso: NivelVoz | null = null;

/** Último nivel que usó el motor, o `null` si aún no ha hablado en esta sesión. */
export function nivelActual(): NivelVoz | null {
    return nivelEnUso;
}

/**
 * Resuelve el nivel concreto a usar: el que pidió el usuario si es válido para
 * este equipo; si no, el mejor que el hardware pueda sostener en este momento.
 */
async function resolverNivel(explicito?: NivelVoz): Promise<NivelVoz> {
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
    | { via: "local"; voz: string; speed: number; instruct?: string }
    | { via: "kokoro"; voice: string; speed: number }
    | { via: "sistema"; pitch: number; rate: number } {
    if (nivel === "estudio" || nivel === "alta") {
        return {
            via: "local",
            voz: timbre.local.voz,
            speed: timbre.local.speed,
            instruct: timbre.local.instruct,
        };
    }
    if (nivel === "ligera") {
        return { via: "kokoro", voice: timbre.local.voz, speed: timbre.local.speed };
    }
    return { via: "sistema", pitch: timbre.sistema.pitch, rate: timbre.sistema.rate };
}

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
    /** Emoción del turno: se incorpora al gesto derivado para el avatar. */
    emocion?: string;
}

/**
 * Habla por la vía del nivel de demonio local (estudio/alta): OmniVoice GGUF
 * por `motor-local.ts`. Devuelve true si la frase llegó a sonar.
 */
async function hablarPorLocal(texto: string, timbre: Timbre): Promise<boolean> {
    try {
        const ml = await import("@/lib/aurora/motor-local");
        const est = await ml.estadoMotorLocal();
        if (!est.listo) return false;
        return await ml.hablarLocalPorFrases(texto, timbre);
    } catch {
        return false;
    }
}

/** Habla por el nivel ligero: Kokoro WASM en el navegador (`tts-oss/kokoro.ts`). */
async function hablarPorKokoro(texto: string, timbre: Timbre): Promise<boolean> {
    try {
        const kok = await import("@/lib/aurora/tts-oss/kokoro");
        if (!kok.kokoroAvailable() || !kok.kokoroModelReady()) return false;
        const p = parametrosPorNivel(timbre, "ligera");
        const audio = await kok.kokoroSpeak(texto, {
            voice: p.via === "kokoro" ? p.voice : timbre.local.voz,
            speed: p.via === "kokoro" ? p.speed : timbre.local.speed,
        });
        return !!audio;
    } catch {
        return false;
    }
}

/** Habla por el nivel mínimo: la voz del sistema (`speechSynthesis`). */
async function hablarPorSistema(texto: string, timbre: Timbre): Promise<boolean> {
    if (typeof window === "undefined") return false;
    try {
        const synth = window.speechSynthesis;
        if (!synth) return false;
        const p = parametrosPorNivel(timbre, "minima");
        const u = new SpeechSynthesisUtterance(texto);
        u.pitch = p.via === "sistema" ? p.pitch : timbre.sistema.pitch;
        u.rate = p.via === "sistema" ? p.rate : timbre.sistema.rate;
        u.lang = "es-ES";
        synth.cancel();
        synth.speak(u);
        return true;
    } catch {
        return false;
    }
}

/** Sintetiza por la vía existente en el OS para ese nivel. Nunca lanza. */
async function sintetizar(nivel: NivelVoz, texto: string, timbre: Timbre): Promise<boolean> {
    if (nivel === "estudio" || nivel === "alta") return hablarPorLocal(texto, timbre);
    if (nivel === "ligera") return hablarPorKokoro(texto, timbre);
    return hablarPorSistema(texto, timbre);
}

/**
 * HABLA — entrada única del OS.
 *
 * Resuelve el nivel, delega en la vía del OS para ese backend y, si esa vía
 * falla, baja al `siguienteNivel` SIN cambiar el timbre (la identidad de la
 * voz es intocable; solo cambia la precisión del motor). Devuelve `false` solo
 * si ni el nivel mínimo pudo sonar. Nunca lanza.
 */
export async function hablarStarSeed(texto: string, opciones: OpcionesHablar): Promise<boolean> {
    const limpio = (texto || "").trim();
    if (!limpio || typeof window === "undefined") return false;

    let nivel: NivelVoz;
    try {
        nivel = await resolverNivel(opciones.nivel);
    } catch {
        nivel = "minima"; // red de seguridad absoluta
    }

    // ── (Ola 232 · M5) GESTO EN EL MISMO INSTANTE ───────────────────────────
    // Al empezar a hablar se deriva el gesto del texto y se emite `starseed:gesto`
    // por `window.dispatchEvent`, SIN importar el motor de movimiento: el puente
    // se carga en dinámico y todo va envuelto, de modo que si el módulo de
    // movimiento no está disponible (o falla), la voz sigue sonando IGUAL.
    try {
        const { gestoDesdeTexto, emitirGestoVoz, estimarDuracionAudioMs } =
            await import("@/lib/avatares/movimiento/sincronia-voz");
        const gesto = gestoDesdeTexto(limpio, {
            emocion: opciones.emocion,
            personalidadId: opciones.personalidadId,
        });
        emitirGestoVoz({
            personalidadId: opciones.personalidadId,
            gesto,
            duracionMs: estimarDuracionAudioMs(limpio),
            texto: limpio,
        });
    } catch { /* sin gesto la voz no se detiene */ }

    // Cadena de degradación: mismo timbre, niveles cada vez más ligeros.
    let actual: NivelVoz | null = nivel;
    while (actual) {
        try {
            if (await sintetizar(actual, limpio, opciones.timbre)) {
                nivelEnUso = actual;
                return true;
            }
        } catch { /* esta vía falló: se baja de nivel */ }
        const siguiente: NivelVoz | null = siguienteNivel(actual);
        if (!siguiente) break;
        try { opciones.alDegradar?.(actual, siguiente); } catch { /* el aviso no puede romper */ }
        actual = siguiente;
    }
    return false;
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
