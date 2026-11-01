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
// (Ola 1018V · VST1018F 2/3) Licencia por contexto en la puerta del motor único.
import { motoresPermitidos, type ContextoLicenciaVoz, type ClaseLicenciaVoz } from "./licencia-voz";
import type { CapasPrefs } from "@/lib/modelos/preferencias-capas";
// (Ola 1018V) Medidas de latencia MEDIDAS en esta neurona (inyectables en pruebas).
import type { MedidaVoz } from "@/lib/aurora/medidas-voz";
// (Ola 1018F · niveles.ts) «estudio» solo compite en lectura/doblaje/audiolibro.
import { estudioSegunUso, type UsoVoz } from "./niveles";
// (Ola 1018F · VST1018F 2/3) La elección se alimenta de las medidas de ESTA neurona.
import { leerMedidas } from "@/lib/aurora/medidas-voz";
import { neuronDeviceIdActual } from "@/lib/network/identidad-dispositivo";
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
import { motorRecomendado, MOTORES_VOZ, Plataforma } from "../catalogo-voces";
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

// ── (Ola 1018V · VST1018F 2/3) PRIMERA FRASE INSTANTÁNEA Y LICENCIA ─────────
//
// Contrato `architecture/voz-voicestudio.md` §4: la PRIMERA FRASE de una
// conversación sale del motor PERMITIDO de menor latencia MEDIDA en esta
// neurona que TENGA LA VOZ de esa persona (Supertonic, Kitten, Kokoro o el
// demonio). Y la regla del `speak-router` manda igual que ahí: UNA respuesta
// sale entera por UN motor — nunca se parte un mensaje entre dos motores, por
// rápido que sea el arranque. El elector es PURO: candidatos, medidas, contexto
// y capas entran como datos; nada de red, disco, reloj ni audio.

/** Motor candidato a la primera frase (lo arma quien llama desde el catálogo). */
export interface CandidatoInstantaneo {
    /** Identificador del motor (la misma clave de catálogo y de medidas). */
    id: string;
    claseLicencia: ClaseLicenciaVoz;
    /** Solo se mira en las «condicionada»; ausente equivale a no cumplida. */
    condicionCumplida?: boolean;
    /** true si este motor puede sonar con la voz de esa persona. */
    tieneLaVoz: boolean;
}

/** Traduce el contexto de la puerta única al uso del turno (pura). */
export function usoParaContexto(contexto: ContextoVoz): UsoVoz {
    switch (contexto) {
        case "aviso":
            return "aviso";
        case "lectura":
        case "rito": // el rito es una ventana larga: lectura
            return "lectura";
        default:
            return "conversacion";
    }
}

/** Media de «primer-sonido» por motor (ms), solo de los motores aptos. */
function latenciaMedia(candidatos: Set<string>, medidas: readonly MedidaVoz[]): Map<string, number> {
    const suma = new Map<string, { total: number; n: number }>();
    for (const m of medidas) {
        if (m.tipo !== "primer-sonido" || !Number.isFinite(m.valor) || m.valor < 0) continue;
        if (!candidatos.has(m.motor)) continue;
        const prev = suma.get(m.motor) ?? { total: 0, n: 0 };
        suma.set(m.motor, { total: prev.total + m.valor, n: prev.n + 1 });
    }
    const media = new Map<string, number>();
    for (const [motor, s] of suma) media.set(motor, s.total / s.n);
    return media;
}

/**
 * Elige QUIÉN habla la PRIMERA FRASE de una conversación. Orden de aptitud:
 *   1. Tiene la voz de esa persona (sin voz, fuera: identidad intocable).
 *   2. Tiene licencia en el contexto (`motoresPermitidos` de licencia-voz.ts):
 *      fuera de lo personal no entran motores «personal», y las «condicionada»
 *      solo con su condición cumplida, nunca por omisión.
 *   3. Tiene latencia de primer sonido MEDIDA en esta neurona (medidas-voz.ts).
 * Gana el de menor VALOR MEDIO medido; empate: el primero en llegar. Sin
 * aptos devuelve `null` y quien llama sigue su cadena habitual. Del que gana
 * sale el MENSAJE COMPLETO: nunca se parte entre dos motores. Pura, nunca lanza.
 */
export function elegirMotorPrimeraFrase(
    candidatos: readonly CandidatoInstantaneo[],
    medidas: readonly MedidaVoz[],
    contextoLicencia: ContextoLicenciaVoz,
    capas: CapasPrefs,
): CandidatoInstantaneo | null {
    try {
        const conVoz = candidatos.filter((c) => c.tieneLaVoz);
        if (!conVoz.length) return null;
        const conLicencia = motoresPermitidos(
            conVoz.map((c) => ({ id: c.id, claseLicencia: c.claseLicencia, condicionCumplida: c.condicionCumplida })),
            contextoLicencia,
            capas,
        ).permitidos;
        if (!conLicencia.length) return null;
        const aptos = conLicencia.map((m) => m.id);
        const conVozPermitidos = conVoz.filter((c) => aptos.includes(c.id));
        const media = latenciaMedia(new Set(aptos), medidas);
        let mejor: CandidatoInstantaneo | null = null;
        let mejorMs = Number.POSITIVE_INFINITY;
        for (const c of conVozPermitidos) {
            const ms = media.get(c.id);
            if (ms === undefined || ms < 0) continue; // sin medida no compite
            if (ms < mejorMs) {
                mejor = c;
                mejorMs = ms;
            }
        }
        return mejor;
    } catch {
        return null;
    }
}

// ── (Ola 1018F · VST1018F 2/3) APLICACIÓN: quién elige de verdad ─────────────
//
// El elector de arriba se usa en `hablarStarSeed`, la puerta única, para
// resolver el nivel de la PRIMERA frase de una conversación. Aquí está la parte
// que arma los datos: candidatos desde el catálogo (solo motores que esta
// neurona puede ejecutar de verdad), medidas reales de esta misma neurona y el
// contexto de escucha con sus capas. Del ganador sale el mensaje COMPLETO por
// UN nivel; sin ganador, manda la cadena de siempre. Nunca se lanza.

/** Motores del catálogo que la vía del demonio local sabe sonar (niveles estudio/alta). */
const IDS_MOTOR_LOCAL: ReadonlySet<string> = new Set(["voicemorphic", "voicestudio"]);

/** Motores del catálogo que suenan en el navegador por la vía «ligera». */
const IDS_MOTOR_NAVEGADOR: ReadonlySet<string> = new Set(["kokoro", "kittentts", "moss-tts-nano"]);

/** Nivel del motor único con el que sonaría ese id de catálogo; `null` si no tiene vía. */
function nivelDeCandidato(id: string): NivelVoz | null {
    if (IDS_MOTOR_LOCAL.has(id)) return "alta";
    return IDS_MOTOR_NAVEGADOR.has(id) ? "ligera" : null;
}

/**
 * Candidatos a la primera frase: los motores del catálogo que esta neurona
 * puede ejecutar de verdad (los demás no compiten aunque la licencia los deje):
 *  · demonio local → hace falta el demonio vivo y la RAM mínima del motor;
 *  · vía ligera    → escritorio con WebGPU o WASM SIMD (la regla de niveles.ts).
 * `tieneLaVoz` es `true` en todos: las vías del motor único conservan el
 * timbre, y el timbre viaja al elector por otras rampas si algún día un motor
 * no la puede expresar.
 */
function candidatosPrimeraFrase(plataforma: Plataforma, caps: Capacidades, ramGB: number): CandidatoInstantaneo[] {
    const candidatos: CandidatoInstantaneo[] = [];
    for (const m of MOTORES_VOZ) {
        if (!m.plataformas.includes(plataforma)) continue;
        if (IDS_MOTOR_LOCAL.has(m.id)) {
            if (!caps.daemonLocal || ramGB < m.ramMinGB) continue;
        } else if (IDS_MOTOR_NAVEGADOR.has(m.id)) {
            if (caps.movil || !(caps.webgpu || caps.wasmSimd)) continue;
        } else {
            continue; // sin vía en el motor único: no compite
        }
        candidatos.push({ id: m.id, claseLicencia: m.claseLicencia, tieneLaVoz: true });
    }
    return candidatos;
}

/** true solo hasta que la voz suena por primera vez en esta sesión de la interfaz. */
let habloEnSesion = false;

/**
 * Nivel de la PRIMERA frase de una conversación según el elector, o `null` si
 * no toca elegir o no hay ganador: en lectura, rito o avisos no; si el usuario
 * ya fijó un nivel, tampoco; y sin motor apto MEDIDO, la cadena de siempre.
 * Lee las medidas de esta neurona (único acceso a disco) y nunca lanza.
 */
async function nivelPrimeraFrase(plataforma: Plataforma, caps: Capacidades, uso: UsoVoz): Promise<NivelVoz | null> {
    try {
        if (habloEnSesion || uso !== "conversacion") return null;
        if (nivelPreferido() !== "auto") return null; // el nivel fijado por el usuario manda
        const conVoz = candidatosPrimeraFrase(plataforma, caps, caps.memoriaGB ?? 8);
        const elegido = elegirMotorPrimeraFrase(
            conVoz,
            leerMedidas(neuronDeviceIdActual()),
            "personal", // los contextos de grupo y más arriba los declara quien llama…
            {}, // …con sus capas; hoy la puerta única habla en la neurona de la persona
        );
        return elegido ? nivelDeCandidato(elegido.id) : null;
    } catch {
        return null;
    }
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
    const ramGB = caps.memoriaGB ?? 8;
    const motorCat = motorRecomendado(plataforma, ramGB, opciones.contexto === undefined ? "personal" : "grupo");
    // (Ola 1018V · VST1018F 2/3) «estudio» solo para lectura larga, doblaje y
    // audiolibros (contrato `voz-voicestudio.md` §4): en conversación, avisos,
    // rito e imaginación el candidato de estudio queda como «alta», y todo el
    // mensaje sale SIEMPRE por un solo nivel: nunca se parte entre dos motores.
    const uso = usoParaContexto(opciones.contexto);
    let nivel: NivelVoz;
    if (opciones.nivel) {
        // Nivel que pidió quien llama (p. ej. el banco de pruebas A/B): manda
        // sobre el elector y sobre la recomendación del catálogo.
        nivel = opciones.nivel;
    } else {
        // (Ola 1018F · VST1018F 2/3) PRIMERA frase de una conversación: la
        // elige el elector (licencia + voz + latencia MEDIDA en esta neurona)
        // y de él sale el mensaje COMPLETO por un solo nivel. Sin ganador —
        // o pasada la primera frase — manda la recomendación del catálogo.
        const primera = await nivelPrimeraFrase(plataforma, caps, uso);
        if (primera) {
            nivel = primera;
        } else {
            switch (motorCat.id) {
                case "voicemorphic":
                case "voicestudio":
                    nivel = estudioSegunUso(uso) ? "estudio" : "alta";
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
        }
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
                habloEnSesion = true; // a partir de aquí ya no hay primera frase
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
