"use client";

/**
 * LA VOZ DEL RITO — instantánea Y verificada (Adenda 211 · 2026-09-01)
 * ─────────────────────────────────────────────────────────────────────────────
 * DIAGNÓSTICO que costó varias vueltas encontrar, medido en vivo:
 *
 *   · `AudioContext` → "running", 44.1 kHz. El navegador SÍ tiene salida de
 *     audio.
 *   · `speechSynthesis.getVoices()` → 180 voces. La lista existe.
 *   · Pero NINGUNA locución dispara `onstart`. Ni una desnuda, sin voz elegida,
 *     sin pitch ni rate tocados, con activación de usuario real. El estado se
 *     queda en `speaking: true` para siempre y no sale un sonido.
 *
 * Es decir: el motor de síntesis del navegador puede estar MUERTO aunque
 * enumere voces y aunque el audio normal funcione. Pasa en navegadores
 * embebidos y en Chrome cuando su servicio de voz se cuelga. Y como
 * `speak()` no falla —simplemente no suena— el código creía haber hablado.
 *
 * De ahí la regla de este módulo: **no basta con pedir que hable; hay que
 * comprobar que ha hablado.**
 *
 *   1. Voz del navegador, al instante (es la que responde en milisegundos).
 *   2. Si en RELEVO_MS no ha llegado `onstart`, esa vía está muerta: se corta
 *      y se entrega el turno al motor OSS/OmniVoice, que reproduce por un
 *      elemento <audio> — un camino de audio COMPLETAMENTE distinto, que
 *      funciona allí donde funciona cualquier otro sonido.
 *   3. Si tampoco, se avisa con honestidad por evento para que la ventana lo
 *      diga en pantalla en vez de dejar al usuario mirando en silencio.
 *
 * Detalles que ya nos costaron regresiones y aquí se respetan:
 *   · `cancel()` y `speak()` en el mismo tick encallan Chrome → tick de respiro.
 *   · Chrome corta el habla sola a los ~15 s → `resume()` periódico.
 *   · Solo suena lo de la pantalla actual: hablar sustituye, nunca encola.
 */

import { ajustesVozEfectivos, generoEfectivo, getModoVoz } from "@/lib/aurora/voz-inicial";
import { elegirVozPorGenero } from "@/lib/aurora/tts-oss/browser-voices";

/** Margen para que la voz del navegador demuestre que suena de verdad. */
const RELEVO_MS = 1200;

/** Evento con el resultado real del intento de hablar. */
export const VOZ_RITO_EVENT = "starseed:voz-rito";
export type EstadoVozRito =
    /** Suena por la voz del sistema (la vía instantánea). */
    | "navegador"
    /** Suena por el motor propio de Astraura (audio, otra vía). */
    | "motor"
    /** Ninguna vía suena, pero la voz propia PUEDE instalarse en este equipo. */
    | "instalable"
    /** Ninguna vía suena y no hay nada más que intentar. */
    | "muda";

let latido: ReturnType<typeof setInterval> | null = null;
let pendiente: ReturnType<typeof setTimeout> | null = null;
let relevo: ReturnType<typeof setTimeout> | null = null;
/** Turno actual: invalida callbacks de locuciones ya superadas. */
let turno = 0;

function pararLatido(): void {
    if (latido) { clearInterval(latido); latido = null; }
}

function avisar(estado: EstadoVozRito): void {
    try {
        window.dispatchEvent(new CustomEvent<EstadoVozRito>(VOZ_RITO_EVENT, { detail: estado }));
    } catch { /* SSR */ }
}

/** Corta la voz del rito ahora mismo, venga de donde venga. Nunca lanza. */
export function callarRito(): void {
    turno += 1;
    if (pendiente) { clearTimeout(pendiente); pendiente = null; }
    if (relevo) { clearTimeout(relevo); relevo = null; }
    pararLatido();
    try { window.speechSynthesis?.cancel(); } catch { /* sin motor */ }
    void import("@/lib/aurora/tts-oss/speak-router")
        .then((m) => m.stopConfiguredEngine())
        .catch(() => null);
    void import("@/lib/aurora/tts-oss/kokoro")
        .then((m) => m.stopKokoro())
        .catch(() => null);
}

/** ¿Hay algún motor de voz utilizable en este navegador? */
export function ritoPuedeHablar(): boolean {
    try { return typeof window !== "undefined" && !!window.speechSynthesis; } catch { return false; }
}

/**
 * Entrega el turno a las vías que NO dependen del motor de voz del navegador.
 *
 * Orden, y el porqué de cada paso:
 *  1. La cadena que el usuario tenga configurada (OmniVoice, OpenVoice…). Si su
 *     motor primario es «browser» —lo habitual— esta cadena DECLINA al instante,
 *     porque su suelo es justamente la voz que acabamos de descartar.
 *  2. Kokoro: motor local por WebAssembly que sintetiza en el propio equipo y
 *     suena por un <audio>. No usa red ni el TTS del sistema, así que funciona
 *     donde funciona cualquier otro sonido. Solo se usa si su modelo YA está
 *     descargado: son ~80 MB y no se disparan por sorpresa.
 *  3. Si el modelo no está pero el equipo lo admite, se avisa «instalable» para
 *     que la ventana lo OFREZCA — decisión del usuario, no descarga a hurtadillas.
 */
function porElMotor(texto: string, miTurno: number): void {
    void (async () => {
        try {
            const router = await import("@/lib/aurora/tts-oss/speak-router");
            if (miTurno !== turno) return;
            const sono = await router.speakWithConfiguredEngine(texto, {
                onStart: () => { if (miTurno === turno) avisar("motor"); },
            });
            if (miTurno !== turno) return;
            if (sono) return;

            const kok = await import("@/lib/aurora/tts-oss/kokoro");
            if (miTurno !== turno) return;
            if (!kok.kokoroAvailable()) { avisar("muda"); return; }

            if (kok.kokoroModelReady()) {
                const audio = await kok.kokoroSpeak(texto, {
                    onStart: () => { if (miTurno === turno) avisar("motor"); },
                });
                if (miTurno !== turno) return;
                if (!audio) avisar("muda");
                return;
            }
            avisar("instalable");
        } catch {
            if (miTurno === turno) avisar("muda");
        }
    })();
}

/**
 * Descarga la voz propia de Astraura (Kokoro) y habla con ella. Solo se llama
 * desde un botón: la descarga es de ~80 MB y la decide el usuario.
 */
export async function instalarVozPropia(
    texto: string,
    onProgress?: (pct: number) => void,
): Promise<boolean> {
    try {
        const kok = await import("@/lib/aurora/tts-oss/kokoro");
        const listo = await kok.kokoroPreload((p) => {
            const pct = typeof (p as { progress?: number })?.progress === "number"
                ? Math.round(((p as { progress: number }).progress) * 100)
                : 0;
            try { onProgress?.(pct); } catch { /* */ }
        });
        if (!listo) { avisar("muda"); return false; }
        const miTurno = turno;
        const audio = await kok.kokoroSpeak(texto, {
            onStart: () => { if (miTurno === turno) avisar("motor"); },
        });
        if (!audio) { avisar("muda"); return false; }
        return true;
    } catch {
        avisar("muda");
        return false;
    }
}

/**
 * Habla `texto` al instante y COMPRUEBA que ha sonado. Sustituye lo anterior.
 * Devuelve false solo si no hay ningún motor con el que intentarlo.
 */
export function hablarRito(texto: string): boolean {
    const limpio = (texto || "").trim();
    if (!limpio || typeof window === "undefined") return false;

    callarRito();
    const miTurno = turno;

    const synth = window.speechSynthesis;
    if (!synth) {
        // Sin Web Speech: directo al motor por <audio>.
        porElMotor(limpio, miTurno);
        return true;
    }

    // El tick de respiro tras `cancel()` evita el encalle conocido de Chrome.
    pendiente = setTimeout(() => {
        pendiente = null;
        if (miTurno !== turno) return;
        let arranco = false;
        try {
            const u = new SpeechSynthesisUtterance(limpio);
            const traits = (window as unknown as { STARSEED_personality_traits?: Record<string, number> })
                .STARSEED_personality_traits;
            const { pitch, rate } = ajustesVozEfectivos(traits);
            u.pitch = pitch;
            u.rate = rate;
            u.lang = "es-ES";
            const voz = elegirVozPorGenero(generoEfectivo(getModoVoz()));
            if (voz) { u.voice = voz; u.lang = voz.lang || u.lang; }

            u.onstart = () => {
                if (miTurno !== turno) return;
                arranco = true;
                if (relevo) { clearTimeout(relevo); relevo = null; }
                avisar("navegador");
            };
            u.onend = pararLatido;
            u.onerror = pararLatido;

            try { synth.resume(); } catch { /* no estaba en pausa */ }
            synth.speak(u);

            // Chrome corta solo a los ~15 s; este pulso lo mantiene vivo.
            pararLatido();
            latido = setInterval(() => {
                try {
                    if (synth.speaking) synth.resume();
                    else pararLatido();
                } catch { pararLatido(); }
            }, 9000);

            // ── LA COMPROBACIÓN QUE FALTABA ──────────────────────────────────
            // `speak()` no falla cuando el motor está muerto: simplemente no
            // suena. Si en RELEVO_MS no ha llegado `onstart`, esta vía no
            // funciona en este navegador y el turno pasa al motor por <audio>.
            relevo = setTimeout(() => {
                relevo = null;
                if (arranco || miTurno !== turno) return;
                pararLatido();
                try { synth.cancel(); } catch { /* */ }
                porElMotor(limpio, miTurno);
            }, RELEVO_MS);
        } catch {
            porElMotor(limpio, miTurno);
        }
    }, 90);

    return true;
}
