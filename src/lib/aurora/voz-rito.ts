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

import { generoEfectivo, getModoVoz, modulacionAutonoma } from "@/lib/aurora/voz-inicial";
import { timbreActual, vozDelTimbre, buscarTimbre, TIMBRE_AUTONOMO_BASE, type Timbre } from "@/lib/aurora/timbres";
import { decidirEntonacion } from "@/lib/aurora/agente-entonacion";
import { hablarStarSeed, nivelActual } from "@/lib/aurora/voz-starseed/motor";
import type { NivelVoz } from "@/lib/aurora/voz-starseed/niveles";

/** Margen para que la voz del navegador demuestre que suena de verdad. */
const RELEVO_MS = 1200;

/** Evento con el resultado real del intento de hablar. */
export const VOZ_RITO_EVENT = "starseed:voz-rito";
export type EstadoVozRito =
    /** El motor local está sintetizando esta frase (se muestra la semilla). */
    | "preparando"
    /** Suena por la voz del sistema (la vía instantánea). */
    | "navegador"
    /** Suena por el motor propio de Astraura (audio, otra vía). */
    | "motor"
    /** Ninguna vía suena, pero la voz propia PUEDE instalarse en este equipo. */
    | "instalable"
    /** Ninguna vía suena y no hay nada más que intentar. */
    | "muda";

/**
 * (Adenda 215) Parte el texto en cláusulas para entonar cada una. Se corta por
 * puntuación fuerte y por comas, que es donde una persona respira. Las piezas
 * muy cortas se pegan a la anterior: trocear de más suena entrecortado.
 */
function partirEnClausulas(texto: string): string[] {
    const bruto = texto
        .split(/(?<=[.!?…])\s+|(?<=[,;:])\s+/)
        .map((x) => x.trim())
        .filter(Boolean);
    if (bruto.length <= 1) return [texto];

    const out: string[] = [];
    for (const pieza of bruto) {
        if (out.length && (pieza.length < 14 || out[out.length - 1].length < 14)) {
            out[out.length - 1] = `${out[out.length - 1]} ${pieza}`;
        } else {
            out.push(pieza);
        }
    }
    return out.slice(0, 12); // techo sano: nadie entona 30 trozos
}

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
    void import("@/lib/aurora/motor-local").then((m) => m.pararLocal()).catch(() => null);
    void import("@/lib/aurora/tts-oss/speak-router")
        .then((m) => m.stopConfiguredEngine())
        .catch(() => null);
    void import("@/lib/aurora/tts-oss/kokoro")
        .then((m) => m.stopKokoro())
        .catch(() => null);
}

/**
 * Timbre que corresponde AHORA: el elegido, o —en modo autónomo— la base
 * neutra con la modulación viva de la personalidad encima (Adenda 213: Alex
 * pidió expresamente que la autónoma parta de la neutra).
 */
export function timbreEfectivo(texto?: string, ctx: "rito" | "conversacion" | "aviso" | "lectura" | "imaginacion" = "rito"): Timbre {
    const modo = getModoVoz();
    if (modo === "autonoma") {
        // (Adenda 218) En modo autónomo decide el AGENTE DE ENTONACIÓN: lee el
        // texto, la hora, la personalidad y su memoria de tono, y elige timbre
        // e instrucción con coherencia. Instantáneo (heurística local); la
        // política la afina en segundo plano el router económico.
        if (texto) {
            try {
                const d = decidirEntonacion(texto, ctx);
                const elegido = buscarTimbre(d.timbreId) ?? buscarTimbre(TIMBRE_AUTONOMO_BASE) ?? timbreActual("neutra");
                return {
                    ...elegido,
                    id: `${elegido.id}-autonomo`,
                    nombre: "Autónoma",
                    local: { ...elegido.local, speed: +(elegido.local.speed * d.speed).toFixed(3), instruct: d.instruct },
                    sistema: { ...elegido.sistema, pitch: +(elegido.sistema.pitch * d.pitch).toFixed(3), rate: +(elegido.sistema.rate * d.speed).toFixed(3) },
                };
            } catch { /* si el agente falla, sigue la modulación clásica */ }
        }
        const base = buscarTimbre(TIMBRE_AUTONOMO_BASE) ?? timbreActual("neutra");
        const traits = (window as unknown as { STARSEED_personality_traits?: Record<string, number> })
            .STARSEED_personality_traits;
        const m = modulacionAutonoma(traits);
        return {
            ...base,
            id: `${base.id}-autonomo`,
            nombre: "Autónoma",
            // La autónoma modula la BASE NEUTRA: velocidad en el motor local
            // y tono/ritmo en el respaldo del sistema.
            local: {
                ...base.local,
                speed: Math.max(0.7, Math.min(1.4, base.local.speed * m.rate)),
            },
            sistema: {
                ...base.sistema,
                pitch: Math.max(0.6, Math.min(1.4, base.sistema.pitch * m.pitch)),
                rate: Math.max(0.7, Math.min(1.35, base.sistema.rate * m.rate)),
            },
        };
    }
    return timbreActual(generoEfectivo(modo));
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

            // El motor local ya se intentó ANTES que nada (ver `hablarRito`).
            // Si estamos aquí es que no está instalado: se ofrece traerlo, que
            // es la solución de fondo — funciona en cualquier dispositivo.
            const kok = await import("@/lib/aurora/tts-oss/kokoro");
            if (miTurno !== turno) return;
            avisar(kok.kokoroAvailable() ? "instalable" : "muda");
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
        const t = timbreEfectivo();
        const audio = await kok.kokoroSpeak(texto, {
            voice: t.local.voz,
            speed: t.local.speed,
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

    // Hablar sustituye, nunca encola: se corta lo anterior y toma el turno.
    callarRito();
    const miTurno = turno;

    // ── (Ola 228) EL MOTOR ÚNICO «VOZ STARSEED» ─────────────────────────────
    // El rito ya no elige motor por su cuenta: habla por `hablarStarSeed`,
    // con la MISMA voz (mismo timbre) que el resto de ventanas. El nivel
    // (estudio/alta/ligera/minima) lo decide el motor según el hardware y, si
    // una vía falla, degrada SIN cambiar el timbre. La voz del navegador ha
    // quedado como el nivel «minima», el suelo de la cadena.
    avisar("preparando");
    void (async () => {
        let sono = false;
        try {
            sono = await hablarStarSeed(limpio, {
                timbre: timbreEfectivo(limpio, "rito"),
                contexto: "rito",
                alDegradar: (_desde: NivelVoz, hasta: NivelVoz) => {
                    if (miTurno !== turno) return;
                    if (hasta === "minima") avisar("navegador");
                },
            });
        } catch { sono = false; }
        if (miTurno !== turno) return;
        if (sono) {
            avisar(nivelActual() === "minima" ? "navegador" : "motor");
            return;
        }
        // El motor único agotó sus niveles: un último intento por la vía
        // verificada del rito (la más tolerant con navegadores caprichosos) y,
        // si tampoco, se dice en pantalla.
        avisar("muda");
        porElSistema(limpio, miTurno);
    })();

    return true;
}

/**
 * RESPALDO mientras el motor local no esté instalado: la voz del sistema.
 * Es instantánea, pero depende del navegador y suena distinta en cada equipo,
 * así que solo cubre el hueco — y si tampoco arranca, se ofrece traer el motor
 * local, que es lo que de verdad resuelve el problema para siempre.
 */
function porElSistema(limpio: string, miTurno: number): void {
    const synth = window.speechSynthesis;
    if (!synth) {
        porElMotor(limpio, miTurno);
        return;
    }

    // El tick de respiro tras `cancel()` evita el encalle conocido de Chrome.
    pendiente = setTimeout(() => {
        pendiente = null;
        if (miTurno !== turno) return;
        let arranco = false;
        try {
            // (Adenda 213) El timbre es una RECETA FIJA —voz base + tono +
            // ritmo—, no un ranking que se recalcula en cada pulsación. Por eso
            // cada botón suena siempre igual y coincide con su etiqueta.
            const t = timbreEfectivo(limpio, "rito");
            const voz = vozDelTimbre(t);

            // ── (Adenda 215) ENTREGA EXPRESIVA ───────────────────────────────
            // Un TTS plano suena a robot porque dice TODA la frase con el mismo
            // tono y la misma prisa. Aquí el texto se parte en cláusulas y cada
            // una lleva su propio tono y velocidad:
            //   · el tono CAE del principio al final (declinación entonativa,
            //     la señal más fuerte de habla natural),
            //   · sube al final si la cláusula es una pregunta,
            //   · la apertura se abre según la «calidez» del timbre,
            //   · la velocidad varía según su «vivacidad».
            // Las cláusulas se ENCOLAN (speak sin cancel entre medias), que es
            // como la Web Speech API encadena de forma nativa; los signos de
            // puntuación aportan las pausas.
            const clausulas = partirEnClausulas(limpio);
            const n = clausulas.length;

            clausulas.forEach((frase, i) => {
                const u = new SpeechSynthesisUtterance(frase);
                const pos = n > 1 ? i / (n - 1) : 0;          // 0 = inicio, 1 = final
                const pregunta = /[?¿]\s*$/.test(frase);

                // Declinación: empieza por encima y termina por debajo.
                let pitch = t.sistema.pitch * (1 + t.expr.arco * (0.5 - pos));
                if (i === 0) pitch *= 1 + t.expr.calidez;      // apertura cálida
                if (pregunta) pitch *= 1 + t.expr.arco * 0.9;  // final ascendente

                // Ritmo: algo más ágil en medio, más pausado al cerrar.
                const rate = t.sistema.rate * (1 + t.expr.vivacidad * (0.35 - Math.abs(pos - 0.45)));

                u.pitch = Math.max(0.4, Math.min(1.8, pitch));
                u.rate = Math.max(0.6, Math.min(1.6, rate));
                u.lang = "es-ES";
                if (voz) { u.voice = voz; u.lang = voz.lang || u.lang; }

                if (i === 0) {
                    u.onstart = () => {
                        if (miTurno !== turno) return;
                        arranco = true;
                        if (relevo) { clearTimeout(relevo); relevo = null; }
                        avisar("navegador");
                    };
                }
                if (i === n - 1) {
                    u.onend = pararLatido;
                    u.onerror = pararLatido;
                }

                if (i === 0) { try { synth.resume(); } catch { /* no estaba en pausa */ } }
                synth.speak(u);
            });

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
}


/**
 * (Adenda 217) Anticipa frases en el motor local para que, cuando toquen,
 * suenen al instante. No espera, no lanza: si el daemon no está, no hace nada.
 */
export function anticiparRito(textos: string[]): void {
    if (typeof window === "undefined") return;
    void import("@/lib/aurora/motor-local")
        .then(async (m) => {
            const est = await m.estadoMotorLocal();
            if (!est.listo) return;
            m.precalentarMotorLocal();
            m.anticiparLocal(textos, timbreEfectivo());
        })
        .catch(() => null);
}
