"use client";

/**
 * LA VOZ DEL RITO — instantánea, sin red (Adenda 208 · 2026-09-01)
 * ─────────────────────────────────────────────────────────────────────────────
 * Alex, sobre la bienvenida: *«no funciona la voz desde el inicio… la versión
 * que funciona instantáneamente con la que desarrollamos»*.
 *
 * Por qué se perdió: el `speak()` general de Astraura prueba primero la cadena
 * de motores OSS (OpenVoice, Kokoro, Kitten…). Está bien para el OS —esas voces
 * son mejores— pero cada eslabón habla por RED, y con los Spaces de Hugging
 * Face caídos cada uno tarda segundos en rendirse antes de caer a la voz del
 * navegador. En el rito eso se nota como silencio.
 *
 * Aquí la prioridad es otra: en la bienvenida, Astraura tiene que responder AL
 * INSTANTE. Así que el rito habla directamente con el motor del navegador,
 * usando el MISMO timbre que el usuario eligió (`ajustesVozEfectivos` +
 * `elegirVozPorGenero`), sin tocar nada del motor general.
 *
 * Detalles que importan y ya nos costaron una regresión:
 *   · `cancel()` y `speak()` en el mismo tick encallan Chrome. Se cancela,
 *     se cede un tick y luego se habla.
 *   · Chrome corta el habla sola a los ~15 s: un `resume()` periódico lo evita.
 *   · Solo suena lo de la pantalla actual: hablar de nuevo sustituye, no encola.
 */

import { ajustesVozEfectivos, generoEfectivo, getModoVoz } from "@/lib/aurora/voz-inicial";
import { elegirVozPorGenero } from "@/lib/aurora/tts-oss/browser-voices";

let latido: ReturnType<typeof setInterval> | null = null;
let pendiente: ReturnType<typeof setTimeout> | null = null;

function pararLatido(): void {
    if (latido) { clearInterval(latido); latido = null; }
}

/** Corta la voz del rito ahora mismo. Nunca lanza. */
export function callarRito(): void {
    if (pendiente) { clearTimeout(pendiente); pendiente = null; }
    pararLatido();
    try { window.speechSynthesis?.cancel(); } catch { /* sin motor */ }
}

/** ¿Hay motor de voz utilizable en este navegador? */
export function ritoPuedeHablar(): boolean {
    try { return typeof window !== "undefined" && !!window.speechSynthesis; } catch { return false; }
}

/**
 * Habla `texto` al instante con el timbre elegido. Sustituye lo anterior.
 * Devuelve false si no hay motor (el llamador seguirá en texto, sin mentir).
 */
export function hablarRito(texto: string): boolean {
    const limpio = (texto || "").trim();
    if (!limpio || typeof window === "undefined") return false;

    const synth = window.speechSynthesis;
    if (!synth) return false;

    callarRito();

    // El tick de respiro tras `cancel()` es lo que evita el encalle de Chrome.
    pendiente = setTimeout(() => {
        pendiente = null;
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
        } catch { /* si el motor falla, la guía sigue en texto */ }
    }, 90);

    return true;
}
