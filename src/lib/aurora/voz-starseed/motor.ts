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
import { nivelPara, siguienteNivel, NIVELES, type NivelVoz, type PuertaEstudio } from "./niveles";
import { descubrir } from "./voicestudio";
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
import { perfilNeuronal } from "@/lib/voces/perfil-neuronal";
// (2026-09-06, Ola 264 · G2) Emoción e intensidad: etiquetas `[emocion]` del
// texto, capa `aplicarEmocion` sobre el perfil neuronal y catálogo `EmocionVoz`.
import {
    aplicarEmocion,
    emocionDesdeTexto,
    EMOCIONES,
    type EmocionVoz,
} from "@/lib/voces/emociones";
// (2026-09-06, Ola 264 · J1b) Normalización en español del texto hablado.
import { normalizarParaVoz } from "@/lib/voces/normalizar-es";
import { motorRecomendado, Plataforma } from "../catalogo-voces";
function detectarPlataforma(): Plataforma {
    if (typeof window === "undefined") return "web";
    const ua = navigator.userAgent;
    if (/Mac OS X/.test(ua)) return "macos";
    if (/Windows NT/.test(ua)) return "windows";
    if (/Linux/.test(ua) && !/Android/.test(ua)) return "linux";
    if (/Android/.test(ua)) return "android";
    if (/iPhone|iPad|iPod/.test(ua)) return "ios";
    return "web";
}

/** Identificador público del motor único, para registros y paneles. */
export const VOZ_STARSEED_ID = "starseed.voz-unica.v1";

/** Contexto en el que suena la voz (lo usa el agente de entonación aguas arriba). */
export type ContextoVoz = "rito" | "conversacion" | "aviso" | "lectura" | "imaginacion";

/** Clave donde se guarda el nivel elegido por el usuario; "auto" = decidir por hardware. */
const CLAVE_NIVEL = "starseed.voz.nivel";
export type PreferenciaNivel = NivelVoz | "auto";

const NIVELES_VALIDOS: PreferenciaNivel[] = ["auto", "estudio", "alta", "nube", "ligera", "minima"];

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

// ── (2026-09-06, Ola 264 · G2) EMOCIÓN E INTENSIDAD EN EL MOTOR ─────────────

/**
 * Mapa chato entre las emociones que ya existen en el CHAT (el estilo vivo
 * persistido en `starseed.aurora.voice.v1` y `voiceStyle.emotion` de cada
 * personalidad) y el catálogo `EmocionVoz` de la Forja. Lo que no está aquí
 * devuelve `undefined`: mejor caer al timbre neutro que adivinar una emoción
 * equivocada. Las claves guardan sinónimos sin tilde (se compara normalizado).
 */
const MAPA_EMOCION_CHAT: Record<string, EmocionVoz> = {
    alegre: "alegre", feliz: "alegre", entusiasta: "alegre",
    serena: "serena", calma: "serena", dulce: "serena", empatica: "serena",
    urgente: "urgente", prisa: "urgente", alerta: "urgente",
    triste: "triste", tristeza: "triste",
    solemne: "solemne", seria: "solemne",
    jugueton: "jugueton", juguetona: "jugueton",
    susurro: "susurro", misteriosa: "susurro",
    asombro: "asombro", sorpresa: "asombro",
    neutra: "neutra", neutral: "neutra",
};

/** Minúsculas y sin tildes, para aceptar «Calma», «empática»… */
function normalizarClaveEmocion(s: string): string {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/**
 * Traduce una emoción del CHAT (estilo vivo, personalidad) al catálogo de la
 * Forja. Lo desconocido/vacío devuelve `undefined`. Pura.
 */
export function emocionChatAVoz(emocion: string | undefined | null): EmocionVoz | undefined {
    if (!emocion) return undefined;
    return MAPA_EMOCION_CHAT[normalizarClaveEmocion(emocion)];
}

/** Resultado de resolver la emoción efectiva de un turno de habla. */
export interface ResolucionEmocion {
    /** Emoción eficaz (nunca undefined: sin ninguna pista cae a "neutra"). */
    emocion: EmocionVoz;
    /** Cuánto se exagera (0–2; 1 = la de manual de la emoción). */
    intensidad: number;
    /** El texto YA sin la etiqueta `[emocion]`, listo para hablar. */
    texto: string;
}

/**
 * Resuelve la emoción EFECTIVA de un turno (2026-09-06, Ola 264 · G2).
 *
 * Precedencia fija, de más específica a más general:
 *
 *   1. La etiqueta `[emocion]` (con intensidad opcional) al inicio del texto:
 *      es lo que Astraura escribió para ESTE turno y manda sobre todo. Su
 *      intensidad, si la trae, también manda sobre la de las opciones.
 *   2. `opciones.emocion` / `opciones.intensidad` (si la emoción es válida).
 *   3. La emoción base del timbre (`emocionBase` / `intensidad` del timbre).
 *   4. Nada: "neutra" con intensidad 1.
 *
 * Si la etiqueta no era una emoción válida, el texto se queda intacto (no se
 * recorta nada por error). Pura.
 */
export function resolverEmocion(
    texto: string,
    opciones: { emocion?: string; intensidad?: number } = {},
    timbre?: Pick<Timbre, "emocionBase" | "intensidad">,
): ResolucionEmocion {
    const delTexto = emocionDesdeTexto(texto || "");
    const claveOpcion = opciones.emocion ? normalizarClaveEmocion(opciones.emocion) : "";
    const deOpciones = (EMOCIONES as Partial<Record<string, unknown>>)[claveOpcion] !== undefined
        ? (claveOpcion as EmocionVoz)
        : undefined;
    return {
        emocion: delTexto.emocion ?? deOpciones ?? timbre?.emocionBase ?? "neutra",
        intensidad: delTexto.intensidad ?? opciones.intensidad ?? timbre?.intensidad ?? 1,
        texto: delTexto.textoLimpio,
    };
}

/**
 * Timbre AJUSTADO por la emoción del turno (2026-09-06, Ola 264 · G2).
 *
 * La emoción es una CAPA sobre el perfil, no otra voz: mismo timbre, misma
 * voz neuronal y misma semilla (la identidad no se toca); solo se mueven
 * `speed`, `pitch`, `instruct` y `expr` por `aplicarEmocion`. La desviación ya
 * calculada sobre el perfil neuronal se traslada como FACTOR a los niveles
 * que no entienden instruct (Kokoro usa el `speed` resultante; la voz del
 * sistema recibe `sistema.rate` y `sistema.pitch` escalados).
 *
 * `neutra` (o intensidad ≤ 0) devuelve el timbre INTACTO: volver a «sin
 * marca» no debe reescribir el timbre base — p. ej. el `whisper` del instruct
 * de Eco es identidad forjada, no una emoción que haya que apagar.
 */
function timbreConEmocion(timbre: Timbre, emocion: EmocionVoz, intensidad: number): Timbre {
    if (emocion === "neutra" || intensidad <= 0) return timbre;
    const base = perfilNeuronal(timbre);
    const { perfil, expr } = aplicarEmocion(base, timbre.expr, emocion, intensidad);
    const factorSpeed = base.speed > 0 ? perfil.speed / base.speed : 1;
    const factorPitch = base.pitch > 0 ? perfil.pitch / base.pitch : 1;
    return {
        ...timbre,
        local: {
            ...timbre.local,
            speed: perfil.speed,
            instruct: perfil.instruct,
            seed: perfil.seed,
            pitch: perfil.pitch,
        },
        expr,
        sistema: {
            ...timbre.sistema,
            pitch: Math.min(2, Math.max(0.5, timbre.sistema.pitch * factorPitch)),
            rate: Math.min(2, Math.max(0.5, timbre.sistema.rate * factorSpeed)),
        },
    };
}

/** Último nivel que usó el motor, o `null` si aún no ha hablado en esta sesión. */
export function nivelActual(): NivelVoz | null {
    return nivelEnUso;
}

/**
 * Resuelve el nivel concreto a usar: el que pidió el usuario si es válido para
 * este equipo; si no, el mejor que el hardware pueda sostener en este momento.
 */
/**
 * Contexto de licencia de la voz (contrato `architecture/voz-voicestudio.md` §4). Los pesos
 * no libres no pueden sonar fuera de lo personal: un motor de clase «personal» (OmniVoice/
 * VoiceMorphic) solo habla en contexto personal; en grupo, comunidad, publicado o comercio
 * solo entran motores «libre», o «condicionada» si su condición se cumple. La clase vive ya
 * en `catalogo-voces.ts` (`MOTORES_VOZ.claseLicencia`); el elector completo llega con la
 * integración de licencia-voz y aquí la decisión es la MISMA regla.
 */
export type ContextoLicenciaVoz = "personal" | "grupo" | "comunidad" | "publico" | "comercial";

/**
 * «ESTUDIO» SOLO PARA LECTURA LARGA, DOBLAJE Y AUDIOLIBROS (Ola 1018V). En conversación,
 * avisos y rito el motor de calidad es demasiado: esas frases salen por «alta» o por el
 * motor instantáneo (`elegirPrimeraFrase`). Doblaje y audiolibros llaman al motor único
 * con `nivel: "estudio"` explícito desde su propio átomo, así que no necesitan contexto.
 * Pura.
 */
export function estudioAdmiteContexto(contexto: ContextoVoz): boolean {
    return CONTEXTO_ESTUDIO.has(contexto);
}

/** Contextos donde el nivel «estudio» cabe: lectura larga y las ventanas de Imaginación. */
const CONTEXTO_ESTUDIO: ReadonlySet<ContextoVoz> = new Set<ContextoVoz>(["lectura", "imaginacion"]);

/** Un motor candidato a los primeros sonidos de la conversación. */
export interface CandidatoPrimeraFrase {
    /** Id tal como se anota en las medidas («primer-sonido»). */
    motor: string;
    /** Nivel del motor único por el que suena este motor. */
    nivel: NivelVoz;
    /** Clase de licencia de sus pesos (catálogo: libre · condicionada · personal). */
    clase: "libre" | "condicionada" | "personal";
    /** true solo si este motor SABE sonar con la voz de esa persona. */
    tieneVoz?: boolean;
}

/** Una medida del almacén `medidas-voz.ts`; solo lo que decide la elección. */
export interface MedidaPrimeraFrase {
    motor: string;
    tipo: string;
    valor: number;
}

/**
 * ELEGIR MOTOR DE LA PRIMERA FRASE (Ola 1018V, regla instantánea). Entre los motores
 * PERMITIDOS en este contexto que pueden sonar la voz de ESA persona, gana el de MENOR
 * LATENCIA MEDIDA (media de «primer-sonido» en esta neurona, `medidas-voz.ts`). Un motor
 * sin medidas no compite: gana el primero del orden que llega (la preferencia declarada).
 * El mensaje NUNCA se parte entre dos motores: se elige UN motor para toda la frase.
 * Pura — las medidas llegan falsas en las pruebas, nunca se mide aquí dentro.
 */
export function elegirPrimeraFrase(
    candidatos: readonly CandidatoPrimeraFrase[],
    contexto: ContextoLicenciaVoz,
    medidas: readonly MedidaPrimeraFrase[] = [],
): NivelVoz | null {
    const permitidos = candidatos.filter(
        (c) => c.tieneVoz !== false && (c.clase !== "personal" || contexto === "personal"),
    );
    let elegido: CandidatoPrimeraFrase | null = permitidos[0] ?? null;
    let mejorMedida = Number.POSITIVE_INFINITY;
    for (const c of permitidos) {
        const valores = medidas
            .filter((m) => m.motor === c.motor && m.tipo === "primer-sonido" && Number.isFinite(m.valor))
            .map((m) => m.valor);
        if (!valores.length) continue; // sin medida no se promete rapidez: queda al final
        const media = valores.reduce((a, b) => a + b, 0) / valores.length;
        if (media < mejorMedida) { mejorMedida = media; elegido = c; }
    }
    return elegido ? elegido.nivel : null;
}

/** Caché de la puerta de VoiceStudio: «sí» dura 5 min, «no» solo 15 s —misma idea que
 * `capacidades.ts`, donde un «no» merece repetirse pronto y un «sí» puede durar. */
let puertaVS: { vivo: boolean; en: number } | null = null;

/** Sondea el descubrimiento de VoiceStudio en su puerta local. Nunca lanza. */
async function descubrirVoicestudio(): Promise<boolean> {
    try {
        return (await descubrir()).vivo === true;
    } catch {
        return false;
    }
}

/** Puerta del nivel «estudio» en ESTA neurona (Ola 1018V). Solo sondea VoiceStudio si el
 * hardware ya llegaría a estudio; abajo de eso un «no» no cambia nada. Que OTRA neurona
 * lo sirva por la malla llega con el relé `capacidad.*` (tarea K) y abre la puerta igual. */
async function puertaDeEstudio(caps: Capacidades): Promise<PuertaEstudio> {
    if (!caps.daemonLocal || (caps.memoriaGB ?? 0) < 8) {
        return { voicestudioVivo: false, servidaPorMalla: false };
    }
    const ahora = Date.now();
    if (puertaVS && ahora - puertaVS.en < (puertaVS.vivo ? 5 * 60_000 : 15_000)) {
        return { voicestudioVivo: puertaVS.vivo, servidaPorMalla: false };
    }
    const vivo = await descubrirVoicestudio();
    puertaVS = { vivo, en: ahora };
    return { voicestudioVivo: vivo, servidaPorMalla: false };
}

/** Resuelve el nivel concreto a usar: el que pidió el usuario si es válido para
 * este equipo; si no, el mejor que el hardware pueda sostener en este momento. */
async function resolverNivel(explicito?: NivelVoz): Promise<NivelVoz> {
    const caps: Capacidades = await detectarCapacidades();
    const auto = nivelPara(caps, await puertaDeEstudio(caps));
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
        // (Ola 263) El motor local aplica ahora el PERFIL COMPLETO del timbre: el
        // instruct se valida contra el vocabulario del demonio (nada de texto libre
        // que caiga al default) y la semilla + el tono viajan con él. `perfilNeuronal`
        // es el espejo del demonio y garantiza que «este timbre suena así» sea verdad.
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

export interface OpcionesHablar {
    /** Identidad de la voz: LA MISMA en todos los niveles. */
    timbre: Timbre;
    /** Dónde suena (rito, conversación…). Documental: no cambia el timbre. */
    contexto: ContextoVoz;
    /**
     * (Ola 1018V · 3/2) Contexto de licencia del turno: en grupo, comunidad,
     * publicación o comercio los pesos «personal» quedan fuera (regla de
     * Alex: nada no comercial como opción por defecto). Falta = "personal".
     */
    contextoLicencia?: ContextoLicenciaVoz;
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

/**
 * Habla por la vía del nivel de demonio local (estudio/alta): OmniVoice GGUF
 * por `motor-local.ts`. Devuelve true si la frase llegó a sonar.
 */
async function hablarPorLocal(texto: string, timbre: Timbre, alEmpezar?: () => void): Promise<boolean> {
    try {
        // (2026-09-07, Ola 279 · V6) Tope de 20 s para el demonio local: si no
        // responde en ese plazo se baja al nivel «nube», que suena bien por red,
        // en vez de quedarse esperando a un demonio dormido o cargando.
        const conTope = (async () => {
            const ml = await import("@/lib/aurora/motor-local");
            const est = await ml.estadoMotorLocal();
            if (!est.listo) {
                // (2026-09-05) El daemon existe pero duerme (auto-sleep) o está cargando el modelo
                // (~22 s): se le espera en vez de caer a la voz robótica del navegador, que es lo
                // que sonaba «mal» en las primeras ventanas de la bienvenida. `esperarListo` ya
                // distingue «no hay daemon» (no espera) de «respondió tarde» (espera hasta 30 s).
                if (!(await ml.esperarListo(30_000))) return false;
            }
            return await ml.hablarLocalPorFrases(texto, timbre, alEmpezar);
        })();
        return await Promise.race([conTope, new Promise<boolean>((res) => setTimeout(() => res(false), 20_000))]);
    } catch {
        return false;
    }
}

/**
 * Habla por el nivel «nube»: síntesis en el servidor del OS (`/api/voz/nube`),
 * que usa Gemini TTS y, si no hay clave, Pollinations. Reutiliza la MISMA
 * utilidad de reproducción que los niveles del demonio (`reproducirLocal`):
 * resuelve `true` cuando el audio EMPIEZA a sonar. Nunca lanza.
 */
async function hablarPorNube(texto: string, timbre: Timbre, alEmpezar?: () => void): Promise<boolean> {
    try {
        let resp: Response;
        try {
            resp = await fetch("/api/voz/nube", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    texto,
                    genero: timbre.genero,
                    velocidad: timbre.local.speed,
                }),
                signal: AbortSignal.timeout(25_000),
                cache: "no-store",
            });
        } catch {
            return false; // red caída o timeout: se baja de nivel
        }
        if (!resp.ok) return false;
        const blob = await resp.blob();
        if (!blob.size) return false;
        try { alEmpezar?.(); } catch { /* el aviso no puede romper */ }
        const ml = await import("@/lib/aurora/motor-local");
        return await ml.reproducirLocal(blob);
    } catch {
        return false;
    }
}

/** Habla por el nivel ligero: Kokoro WASM en el navegador (`tts-oss/kokoro.ts`). */
async function hablarPorKokoro(texto: string, timbre: Timbre, alEmpezar?: () => void): Promise<boolean> {
    try {
        const kok = await import("@/lib/aurora/tts-oss/kokoro");
        if (!kok.kokoroAvailable() || !kok.kokoroModelReady()) return false;
        const p = parametrosPorNivel(timbre, "ligera");
        try { alEmpezar?.(); } catch { /* */ }
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
async function hablarPorSistema(texto: string, timbre: Timbre, alEmpezar?: () => void): Promise<boolean> {
    if (typeof window === "undefined") return false;
    try {
        const synth = window.speechSynthesis;
        if (!synth) return false;
        const p = parametrosPorNivel(timbre, "minima");
        const u = new SpeechSynthesisUtterance(texto);
        u.pitch = p.via === "sistema" ? p.pitch : timbre.sistema.pitch;
        u.rate = p.via === "sistema" ? p.rate : timbre.sistema.rate;
        u.lang = "es-ES";
        if (alEmpezar) u.onstart = () => { try { alEmpezar(); } catch { /* */ } };
        synth.cancel();
        synth.speak(u);
        return true;
    } catch {
        return false;
    }
}

/** Sintetiza por la vía existente en el OS para ese nivel. Nunca lanza. */
async function sintetizar(nivel: NivelVoz, texto: string, timbre: Timbre, opciones: OpcionesHablar): Promise<boolean> {
    if (nivel === "estudio" || nivel === "alta") return hablarPorLocal(texto, timbre, opciones.alEmpezar);
    if (nivel === "nube") return hablarPorNube(texto, timbre, opciones.alEmpezar);
    if (nivel === "ligera") return hablarPorKokoro(texto, timbre, opciones.alEmpezar);
    if (opciones.sinSistema) return false;
    return hablarPorSistema(texto, timbre, opciones.alEmpezar);
}

/** Candidatos a la primera frase de la conversación (Ola 1018V). Son las vías del motor
 * único que SABEN sonar la voz de esa persona (el timbre viaja como receta, con las voces
 * compartidas `ef_dora · em_alex · em_santa` de demonio y navegador). El «estudio» NO se
 * pone: para conversación el techo es el instantáneo (lectura, doblaje y audiolibros lo
 * usan aparte). Delante el preferido declarado; detrás, lo ya medido manda. */
function candidatosConversacion(caps: Capacidades): CandidatoPrimeraFrase[] {
    const lista: CandidatoPrimeraFrase[] = [
        { motor: "omnivoice", nivel: "alta", clase: "personal" },
        { motor: "kokoro", nivel: "ligera", clase: "libre" },
    ];
    if (caps.supertonic) lista.push({ motor: "supertonic", nivel: "ligera", clase: "condicionada" });
    lista.push({ motor: "sistema", nivel: "minima", clase: "libre" });
    return lista;
}

/** Nivel instantáneo de conversación: las medidas de ESTA neurona (`medidas-voz.ts`)
 * entran a la regla pura y elige el motor PERMITIDO de menor latencia con la voz de
 * esa persona. Sin medidas o sin almacenamiento, la cadena de niveles queda igual. */
async function nivelInstantaneoConversacion(
    caps: Capacidades,
    fallback: NivelVoz,
    contexto: ContextoLicenciaVoz,
): Promise<NivelVoz> {
    try {
        const mv = await import("@/lib/aurora/medidas-voz");
        return elegirPrimeraFrase(candidatosConversacion(caps), contexto, mv.leerMedidas()) ?? fallback;
    } catch {
        return fallback;
    }
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
    // (2026-09-06, Ola 264 · G2) La etiqueta `[emocion]` al inicio del texto
    // manda sobre las opciones y suena SIN ella — nadie oye «alegre, hola».
    const resuelta = resolverEmocion(texto, opciones, opciones.timbre);
    // (2026-09-06, Ola 264 · J1b) Normalización en español aplicada UNA vez en
    // el punto único por el que pasa todo texto antes de sintetizar: así los
    // cuatro niveles (estudio/alta/ligera/mínima) escuchan lo mismo.
    const limpio = (
        opciones.sinNormalizar ? resuelta.texto : normalizarParaVoz(resuelta.texto)
    ).trim();
    if (!limpio || typeof window === "undefined") return false;

    // La emoción es una capa sobre el PERFIL del timbre (no otra voz): aquí se
    // aplica UNA vez y el timbre ajustado recorre todos los niveles, de modo
    // que la degradación de nivel no cambia ni el carácter ni la emoción.
    const timbre = timbreConEmocion(opciones.timbre, resuelta.emocion, resuelta.intensidad);

    const plataforma = detectarPlataforma();
    const caps = await detectarCapacidades();
    const { memoriaGB } = caps;
    const ramGB = memoriaGB ?? 8;
    const motorCat = motorRecomendado(plataforma, ramGB, opciones.contexto === undefined ? "personal" : "grupo");
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
            // openvoice2, chatterbox, voxcpm, cosyvoice3, qwen3-tts, dots-tts
            nivel = "nube";
            break;
    }
    // (Ola 1018V · 1/2) «Estudio» SOLO para lectura larga, doblaje y audiolibros: en
    // conversación, avisos y rito el techo de estos motores es «alta» — el `motorCat`
    // ya no puede meter al estudio donde no cabe.
    if (nivel === "estudio" && !estudioAdmiteContexto(opciones.contexto)) nivel = "alta";
    // (Ola 1018V · 2/2) Regla instantánea: en conversación, la primera frase (y las
    // siguientes del mismo turno) sale del motor PERMITIDO con MENOR latencia medida
    // en esta neurona que tenga la voz de esa persona. El mensaje NUNCA se parte
    // entre dos motores: la elección es única y toda la frase suena ahí.
    if (opciones.contexto === "conversacion") {
        nivel = await nivelInstantaneoConversacion(caps, nivel, opciones.contextoLicencia ?? "personal");
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
            emocion: resuelta.emocion,
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
            if (await sintetizar(actual, limpio, timbre, opciones)) {
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
