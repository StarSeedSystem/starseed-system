"use client";

/**
 * DIAGNÓSTICO DE VOZ (Ola 279 · V7 · 2026-09-07)
 * ─────────────────────────────────────────────────────────────────────────────
 * Ejecuta paso a paso todas las vías por las que la voz puede sonar y devuelve
 * el error EXACTO de cada una, con su tiempo. Es la respuesta a «la voz no
 * funciona y nadie ve por qué»: por API todo sintetiza, pero el navegador
 * integrado no reproduce audio (gesto de usuario, autoplay, pestaña muda…).
 *
 * Los pasos corren EN SERIE y avisan de cada resultado por `onPaso` en cuanto
 * termina, para que la interfaz los pinte en vivo. Nunca lanza: cada vía falla
 * y deja su `error` serializado (`String(e)`), jamás rompe el diagnóstico.
 */

import type { Timbre } from "@/lib/aurora/timbres";
import { hablarStarSeed } from "@/lib/aurora/voz-starseed/motor";
import type { NivelVoz } from "@/lib/aurora/voz-starseed/niveles";
import { saludDaemon } from "@/lib/aurora/voz-starseed/daemon";

/** Un paso del diagnóstico: qué se probó, cómo salió y cuánto tardó. */
export interface PasoDiagnostico {
    /** Clave estable del paso (para `data-testid` y para el informe). */
    clave: string;
    /** Nombre legible que ve el usuario («Salud del demonio»…). */
    etiqueta: string;
    /** Resultado: ok / fallo / omitido (no se pudo ni intentar). */
    estado: "ok" | "fallo" | "omitido";
    /** Milisegundos que tardó el paso. */
    ms: number;
    /** Qué se observó, en texto («demonio vivo, listo, con oído»). */
    detalle: string;
    /** Error exacto, solo cuando `estado === "fallo"`. */
    error?: string;
}

/** Consejo final que se deriva de los pasos ya resueltos. */
export interface ResumenDiagnostico {
    /** El nivel con el que la voz debería sonar en este navegador. */
    nivelRecomendado: string;
    /** Por qué se llega a esa recomendación, en una frase. */
    motivo: string;
}

/** Frases cortas de prueba, una por vía, para no empalagar. */
const FRASE_LOCAL = "Probando la voz local de StarSeed.";
const FRASE_NUBE = "Probando la voz en la nube de StarSeed.";
const FRASE_SISTEMA = "Probando la voz del sistema de este equipo.";

/** Mide una vía y empaqueta el resultado con su etiqueta y error. */
async function probarVoz(
    clave: string,
    etiqueta: string,
    nivel: NivelVoz,
    texto: string,
    timbre: Timbre,
): Promise<PasoDiagnostico> {
    const inicio = performance.now();
    let degradado: string | null = null;
    try {
        const sonaba = await hablarStarSeed(texto, {
            timbre,
            contexto: "conversacion",
            nivel,
            alDegradar: (desde, hasta) => {
                degradado = `${desde} → ${hasta}`;
            },
        });
        const ms = Math.round(performance.now() - inicio);
        if (degradado) {
            return { clave, etiqueta, estado: "fallo", ms, detalle: `El nivel ${nivel} degradó a ${degradado}.`, error: `No sonó el nivel ${nivel}: se degradó a ${degradado}.` };
        }
        return { clave, etiqueta, estado: sonaba ? "ok" : "fallo", ms, detalle: sonaba ? "Sonó correctamente." : "No llegó a sonar.", ...(sonaba ? {} : { error: "La vía devolvió silencio." }) };
    } catch (e) {
        return { clave, etiqueta, estado: "fallo", ms: Math.round(performance.now() - inicio), detalle: "Falló la vía.", error: String(e) };
    }
}

/** Paso 1 · Salud del demonio local de voz (`/health` en el bucle local). */
async function pasoSalud(): Promise<PasoDiagnostico> {
    const inicio = performance.now();
    const salud = await saludDaemon();
    const ms = Math.round(performance.now() - inicio);
    if (!salud.vivo) {
        return { clave: "salud", etiqueta: "Salud del demonio", estado: "fallo", ms, detalle: "El demonio no responde.", error: "El demonio local de voz está apagado o inalcanzable." };
    }
    if (salud.estado === "despertando") {
        return { clave: "salud", etiqueta: "Salud del demonio", estado: "fallo", ms, detalle: "El demonio está despertando (cargando el modelo).", error: "El demonio aún está despertando: el modelo tarda en cargar." };
    }
    return { clave: "salud", etiqueta: "Salud del demonio", estado: "ok", ms, detalle: `Demonio vivo (${salud.modelo ?? "modelo sin informar"}).` };
}

/** Paso 2 · Permiso de audio del navegador: un `AudioContext` en «suspended» delata el autoplay bloqueado. */
async function pasoPermisoAudio(): Promise<PasoDiagnostico> {
    const inicio = performance.now();
    try {
        if (typeof AudioContext === "undefined") {
            return { clave: "permisoAudio", etiqueta: "Permiso de audio", estado: "omitido", ms: 0, detalle: "Este entorno no expone AudioContext." };
        }
        const ctx = new AudioContext();
        const ms = Math.round(performance.now() - inicio);
        if (ctx.state === "suspended") {
            return { clave: "permisoAudio", etiqueta: "Permiso de audio", estado: "fallo", ms, detalle: "El audio está suspendido (autoplay bloqueado).", error: "El navegador exige un toque del usuario antes de reproducir audio (autoplay)." };
        }
        return { clave: "permisoAudio", etiqueta: "Permiso de audio", estado: "ok", ms, detalle: `AudioContext en «${ctx.state}».` };
    } catch (e) {
        return { clave: "permisoAudio", etiqueta: "Permiso de audio", estado: "fallo", ms: Math.round(performance.now() - inicio), detalle: "Falló la comprobación.", error: String(e) };
    }
}

/** Paso 5 · Voz del sistema: red de seguridad vía `speechSynthesis` del navegador. */
async function pasoSistema(timbre: Timbre): Promise<PasoDiagnostico> {
    const inicio = performance.now();
    try {
        const hablaSistema = typeof window !== "undefined" && "speechSynthesis" in window;
        if (!hablaSistema) {
            return { clave: "sistema", etiqueta: "Voz del sistema", estado: "omitido", ms: 0, detalle: "Este navegador no expone speechSynthesis.", error: "La voz del sistema (speechSynthesis) no está disponible." };
        }
        const vozSistema = new SpeechSynthesisUtterance(FRASE_SISTEMA);
        vozSistema.pitch = timbre?.sistema?.pitch ?? 1;
        vozSistema.rate = timbre?.sistema?.rate ?? 1;
        window.speechSynthesis.speak(vozSistema);
        const ms = Math.round(performance.now() - inicio);
        return { clave: "sistema", etiqueta: "Voz del sistema", estado: "ok", ms, detalle: "Orden de habla del sistema enviada." };
    } catch (e) {
        return { clave: "sistema", etiqueta: "Voz del sistema", estado: "fallo", ms: Math.round(performance.now() - inicio), detalle: "Falló la vía.", error: String(e) };
    }
}

/**
 * Ejecuta el diagnóstico completo en serie, avisando de cada paso por
 * `onPaso` en cuanto termina. Devuelve la lista de pasos para el resumen.
 * Nunca lanza: un paso que no se pueda ni intentar queda como «omitido».
 */
export async function diagnosticarVoz(
    timbre: Timbre,
    onPaso: (paso: PasoDiagnostico) => void,
): Promise<PasoDiagnostico[]> {
    const pasos: PasoDiagnostico[] = [];
    const emitir = (p: PasoDiagnostico) => {
        pasos.push(p);
        onPaso(p);
    };

    // 1 · Salud del demonio local (vivo, estado y, si llega, ready/oído).
    await emitir(await pasoSalud());

    // 2 · Permiso de audio del navegador: un AudioContext en «suspended»
    //     delata que el navegador exige un toque para sonar (autoplay).
    await emitir(await pasoPermisoAudio());

    // 3 · Síntesis local (demonio OmniVoice por el nivel «alta»).
    await emitir(await probarVoz("local", "Síntesis local (OmniVoice)", "alta", FRASE_LOCAL, timbre));

    // 4 · Síntesis por la nube (Gemini TTS / Pollinations por el servidor).
    await emitir(await probarVoz("nube", "Nivel nube (servidor del OS)", "nube", FRASE_NUBE, timbre));

    // 5 · Voz del sistema (red de seguridad que siempre debería sonar).
    await emitir(await pasoSistema(timbre));

    return pasos;
}