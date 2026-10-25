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
 *   · (Ola 1018V, contrato `architecture/voz-voicestudio.md` §4) La PRIMERA
 *     frase sale del motor PERMITIDO con MENOR latencia media medida que tenga
 *     la voz de esa persona (`elegirMotorInstantaneo`); «estudio» solo para
 *     lectura larga, doblaje y audiolibros; NUNCA se parte un mensaje entre
 *     dos motores (`sinDegradar`).
 *
 * Este módulo no sintetiza nada: delega en las vías que el OS ya tiene.
 */

import type { Timbre } from "@/lib/aurora/timbres";
import type { MedidaVoz } from "@/lib/aurora/medidas-voz";
import { detectarCapacidades, capacidadesEnCache, type Capacidades } from "./capacidades";
import { nivelPara, siguienteNivel, NIVELES, type NivelVoz, type OpcionesEstudio } from "./niveles";
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
 * este equipo; si no, el mejor que el hardware pueda sostener. `estudio`
 * (Ola 1018V): la medición de VoiceStudio ya hecha por el llamador, sin
 * sondear aquí de nuevo.
 */
async function resolverNivel(explicito?: NivelVoz, estudio?: OpcionesEstudio): Promise<NivelVoz> {
    const caps: Capacidades = await detectarCapacidades();
    const auto = nivelPara(caps, estudio);
    if (explicito) return explicito;
    const preferencia = nivelPreferido();
    return preferencia === "auto" ? auto : preferencia;
}

// ── (Ola 1018V) LA PRIMERA FRASE: INSTANTÁNEA, PERMITIDA Y MEDIDA ───────────
// Contrato §4. Pureza: candidatos, medidas y contexto entran por argumentos.

/** Contexto de licencia (contrato §4), heredado de `preferencias-capas.ts`. */
export type ContextoLicencia = "personal" | "grupo" | "comunidad" | "publico" | "comercial";

/** Usos que reservan «estudio»: lectura larga, doblaje, audiolibros (y lo largo). */
export type UsoLargoVoz = ContextoVoz | "doblaje" | "audiolibro";

/** ¿El uso MERECE el motor de estudio? (contrato §4). Pura. */
export function usoLargoVoz(uso: UsoLargoVoz): boolean {
    return uso === "lectura" || uso === "doblaje" || uso === "audiolibro" || uso === "imaginacion";
}

/** Un candidato a sonar la primera frase; lo rellena quien escruta la neurona. */
export interface CandidatoNivel {
    /** Id del NIVEL del motor único (lo suena `sintetizar` de este módulo). */
    id: NivelVoz;
    /** Id con el que ese motor anota su latencia en `medidas-voz.ts`. */
    motorMedida: string;
    /** Responde en este instante en esta neurona, o la malla lo sirve. */
    vivo: boolean;
    /** Clase de licencia de los PESOS del motor detrás (`catalogo-voces.ts`). */
    claseLicencia: "libre" | "condicionada" | "personal";
    /** Condiciones de una licencia «condicionada» ya comprobadas por quien llama. */
    condicionesCumplidas?: string[];
    /** Sabe sacar la voz de ESA persona (propia o clonada con permiso). */
    tieneLaVoz: boolean;
}

/** Lo elegido, para anotarlo en el mensaje y que las medidas sigan aprendiendo. */
export interface EleccionInstantanea {
    id: NivelVoz;
    motorMedida: string;
    /** Latencia media medida (ms); `null` si ese motor aún no tiene medidas. */
    latenciaMs: number | null;
}

/** Latencia media «primer-sonido» de un motor, en sus medidas. Pura. */
export function mediaPrimerSonido(medidas: readonly MedidaVoz[], motorMedida: string): number | null {
    let suma = 0;
    let n = 0;
    for (const m of medidas) {
        if (m.tipo === "primer-sonido" && m.motor === motorMedida && Number.isFinite(m.valor) && m.valor >= 0) {
            suma += m.valor;
            n += 1;
        }
    }
    return n > 0 ? suma / n : null;
}

/**
 * ¿Motor PERMITIDO en ese contexto? En lo personal vale todo; fuera, solo los
 * «libre» y las «condicionada» ya comprobadas: nada de clase «personal» fuera
 * de lo personal (OmniVoice, VoiceMorphic, VoiceStudio). Pura.
 */
export function motorPermitido(
    c: Pick<CandidatoNivel, "vivo" | "claseLicencia" | "condicionesCumplidas">,
    contexto: ContextoLicencia,
): boolean {
    if (!c.vivo) return false;
    if (contexto === "personal") return true;
    if (c.claseLicencia === "libre") return true;
    return c.claseLicencia === "condicionada" && (c.condicionesCumplidas ?? []).length > 0;
}

/**
 * ELIGE la primera frase (contrato §4): entre los PERMITIDOS con la voz de
 * esa persona gana la MENOR latencia media medida (sin medidas: al final);
 * «estudio» solo en lectura larga, doblaje y audiolibros. Sin candidato,
 * `null` y quien llama sigue su cadena con la misma identidad. Pura.
 */
export function elegirMotorInstantaneo(op: {
    candidatos: readonly CandidatoNivel[];
    medidas: readonly MedidaVoz[];
    contexto: ContextoLicencia;
    uso: UsoLargoVoz;
}): EleccionInstantanea | null {
    const largo = usoLargoVoz(op.uso);
    const tabla = op.candidatos
        .filter((c) => motorPermitido(c, op.contexto) && c.tieneLaVoz && (largo || c.id !== "estudio"))
        .map((c) => ({ c, lat: mediaPrimerSonido(op.medidas, c.motorMedida) }))
        .sort((a, b) => (a.lat ?? Infinity) - (b.lat ?? Infinity));
    // En lectura larga el estudio manda si está disponible: es su uso natural.
    const elegido = largo ? tabla.find((x) => x.c.id === "estudio") ?? tabla[0] : tabla[0];
    return elegido ? { id: elegido.c.id, motorMedida: elegido.c.motorMedida, latenciaMs: elegido.lat } : null;
}

/**
 * Nivel con el que suena TODO el mensaje según su uso: el «estudio» pasa a
 * «alta» en conversación, rito y avisos. Pura.
 */
export function nivelParaUso(uso: UsoLargoVoz, nivel: NivelVoz): NivelVoz {
    if (nivel !== "estudio") return nivel;
    return usoLargoVoz(uso) ? nivel : "alta";
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
    /** (Ola 1018V) Medición de VoiceStudio ya hecha por el llamador (más abajo). */
    estudio?: OpcionesEstudio;
    /**
     * (Ola 1018V) «Nunca se parte un mensaje entre dos motores»: si true, esta
     * llamada NO degrada — devuelve `false` si su nivel falla, para que la
     * degradación se decida UNA vez para el mensaje entero, no frase a frase.
     */
    sinDegradar?: boolean;
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
    const { memoriaGB } = await detectarCapacidades();
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
    // (Ola 1018V) «estudio» solo para lectura larga, doblaje y audiolibros:
    // en conversación, rito y avisos el nivel se baja a «alta» ANTES de sonar.
    nivel = nivelParaUso(opciones.contexto, nivel);

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

    // Cadena de degradación: mismo timbre, niveles cada vez más ligeros. Con
    // `sinDegradar` (Ola 1018V) quien agrupa el mensaje la decide UNA vez: aquí
    // se prueba un nivel y ya (el mensaje no se parte entre dos motores).
    let actual: NivelVoz | null = nivel;
    while (actual) {
        try {
            if (await sintetizar(actual, limpio, timbre, opciones)) {
                nivelEnUso = actual;
                return true;
            }
        } catch { /* esta vía falló: se baja de nivel */ }
        if (opciones.sinDegradar) break;
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
