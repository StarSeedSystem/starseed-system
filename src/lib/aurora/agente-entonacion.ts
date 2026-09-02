"use client";

/**
 * AGENTE DE ENTONACIÓN (Adenda 218 · 2026-09-02)
 * ─────────────────────────────────────────────────────────────────────────────
 * La «voz autónoma» deja de ser un ajuste fijo: un agente decide, para cada
 * cosa que Astraura va a decir, CÓMO decirla. Considera:
 *   · el TEXTO (intención, pregunta, urgencia, alegría, calma, tristeza),
 *   · la HORA (madrugada → suave; media mañana → despierta),
 *   · la PERSONALIDAD activa (rasgos que publica el motor),
 *   · las PREFERENCIAS del usuario (género elegido, timbres propios),
 *   · el CONTEXTO (rito, conversación, aviso, lectura larga),
 *   · y la MEMORIA DE TONO: no cambia de voz a cada frase. Un tono coherente
 *     es lo que hace que una voz suene a alguien y no a un menú.
 *
 * Dos velocidades, como pidió Alex:
 *   · EN VIVO: una decisión local instantánea (heurísticas; cero red) para no
 *     retrasar nunca la voz.
 *   · EN SEGUNDO PLANO: el agente reflexiona con el router económico
 *     (Astraura 1,58-bit primario, gratuitos primero) sobre el historial y va
 *     afinando su POLÍTICA —qué timbre y qué instrucción para cada situación—
 *     y la persiste. La siguiente decisión en vivo ya la usa. Se conecta con
 *     los agentes imaginativos por el mismo bus de eventos de fondo.
 *
 * Nunca lanza, nunca bloquea: si el router no responde, manda la heurística.
 */

import { TIMBRES, TIMBRE_AUTONOMO_BASE, buscarTimbre, type Timbre } from "@/lib/aurora/timbres";
import type { VoiceGender } from "@/lib/aurora/personalities";

export type ContextoVoz = "rito" | "conversacion" | "aviso" | "lectura" | "imaginacion";

export interface DecisionEntonacion {
    timbreId: string;
    /** Instrucción de estilo para el motor neuronal, ya compuesta. */
    instruct: string;
    /** Factores sobre la receta del timbre. */
    speed: number;
    pitch: number;
    /** Por qué (para la pestaña de Inteligencia). */
    motivo: string;
    origen: "heuristica" | "politica" | "router";
}

interface Politica {
    /** contexto+emoción → timbreId */
    mapa: Record<string, string>;
    /** Género base preferido para la autónoma (parte de neutra si no hay). */
    generoBase: VoiceGender;
    actualizada: number;
}

interface MemoriaTono {
    ultimoTimbre: string | null;
    ultimaEmocion: string | null;
    desde: number;
    historial: Array<{ t: number; ctx: ContextoVoz; emocion: string; timbre: string }>;
}

const CLAVE_POLITICA = "starseed.voz.autonoma.politica.v1";
const CLAVE_MEMORIA = "starseed.voz.autonoma.memoria.v1";
export const EVENTO_ENTONACION = "starseed:voz-entonacion";
/** Cuánto se mantiene un tono antes de permitir un cambio (coherencia). */
const INERCIA_MS = 90_000;

function leer<T>(k: string, def: T): T {
    try { const r = window.localStorage.getItem(k); return r ? (JSON.parse(r) as T) : def; } catch { return def; }
}
function guardar(k: string, v: unknown): void {
    try { window.localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ }
}

/* ── Lectura del texto ─────────────────────────────────────────────────────── */

export type Emocion = "calma" | "alegria" | "urgencia" | "pregunta" | "tristeza" | "asombro" | "neutra";

export function emocionDe(texto: string): Emocion {
    const t = (texto || "").toLowerCase();
    if (/[?¿]/.test(t)) return "pregunta";
    if (/\b(error|fallo|urgente|ahora mismo|peligro|cuidado|inmediat)/.test(t) || /!{2,}/.test(t)) return "urgencia";
    if (/\b(bienvenid|enhorabuena|genial|perfecto|listo|conseguido|celebr|alegr)/.test(t) || /[!¡]/.test(t)) return "alegria";
    if (/\b(lo siento|lament|perd|triste|no pude|no he conseguido)/.test(t)) return "tristeza";
    if (/\b(increíble|asombros|imagin|sueñ|infinit|universo|estrella)/.test(t)) return "asombro";
    if (/\b(respira|calma|tranquil|despacio|suave|descans)/.test(t)) return "calma";
    return "neutra";
}

function franjaHoraria(): "madrugada" | "manana" | "tarde" | "noche" {
    const h = new Date().getHours();
    if (h < 6) return "madrugada";
    if (h < 13) return "manana";
    if (h < 20) return "tarde";
    return "noche";
}

/* ── Decisión en vivo (instantánea) ────────────────────────────────────────── */

const ESTILO_POR_EMOCION: Record<Emocion, string> = {
    calma: "sereno, pausado y cercano",
    alegria: "cálido, luminoso y con una sonrisa",
    urgencia: "claro, firme y atento, sin prisa nerviosa",
    pregunta: "curioso y abierto, con la entonación que invita a responder",
    tristeza: "suave, comprensivo y sin dramatizar",
    asombro: "maravillado, amplio, dejando espacio a las palabras",
    neutra: "natural, equilibrado y conversacional",
};

export function decidirEntonacion(texto: string, ctx: ContextoVoz = "conversacion"): DecisionEntonacion {
    const politica = leer<Politica>(CLAVE_POLITICA, { mapa: {}, generoBase: "neutra", actualizada: 0 });
    const memoria = leer<MemoriaTono>(CLAVE_MEMORIA, { ultimoTimbre: null, ultimaEmocion: null, desde: 0, historial: [] });
    const emocion = emocionDe(texto);
    const franja = franjaHoraria();
    const traits = (typeof window !== "undefined"
        ? (window as unknown as { STARSEED_personality_traits?: Record<string, number> }).STARSEED_personality_traits
        : undefined) || {};

    // 1 · ¿La política aprendida ya sabe qué timbre va con este contexto+emoción?
    const clavePol = `${ctx}:${emocion}`;
    let timbreId = politica.mapa[clavePol] ?? null;
    let origen: DecisionEntonacion["origen"] = timbreId ? "politica" : "heuristica";

    // 2 · Si no, heurística sobre la base del género preferido.
    if (!timbreId) {
        const base = TIMBRES.filter((t) => t.genero === politica.generoBase);
        const pick = (pred: (t: Timbre) => boolean) => base.find(pred)?.id;
        timbreId =
            (emocion === "urgencia" && pick((t) => /rotund|firme|claro/i.test(t.desc))) ||
            (emocion === "alegria" && pick((t) => /lumin|brillant|ágil|viva/i.test(t.desc))) ||
            ((emocion === "calma" || emocion === "tristeza" || franja === "madrugada") && pick((t) => /seren|calm|suave|envolv/i.test(t.desc))) ||
            (emocion === "asombro" && pick((t) => /ampli|profund|envolv/i.test(t.desc))) ||
            base[0]?.id || TIMBRE_AUTONOMO_BASE;
    }

    // 3 · COHERENCIA: si hace poco que se eligió otro timbre y la emoción no
    //     ha cambiado de familia, se mantiene. Una voz no cambia a cada frase.
    const ahora = Date.now();
    const cambioBrusco = memoria.ultimaEmocion !== null && memoria.ultimaEmocion !== emocion
        && (emocion === "urgencia" || memoria.ultimaEmocion === "urgencia");
    if (memoria.ultimoTimbre && ahora - memoria.desde < INERCIA_MS && !cambioBrusco && buscarTimbre(memoria.ultimoTimbre)) {
        timbreId = memoria.ultimoTimbre;
    }

    const t = buscarTimbre(timbreId) ?? buscarTimbre(TIMBRE_AUTONOMO_BASE)!;

    // 4 · Ajustes finos por hora y rasgos (pequeños: matizan, no cambian la voz).
    const energia = typeof traits.energia === "number" ? traits.energia : 0.5;
    let speed = 1;
    let pitch = 1;
    if (franja === "madrugada" || franja === "noche") { speed *= 0.95; pitch *= 0.98; }
    if (franja === "manana") speed *= 1.03;
    if (emocion === "urgencia") speed *= 1.06;
    if (emocion === "calma" || emocion === "tristeza") speed *= 0.93;
    speed *= 0.94 + energia * 0.12;

    const instruct = `${t.local.instruct ? t.local.instruct + "; " : ""}${ESTILO_POR_EMOCION[emocion]}${ctx === "rito" ? "; acompañando paso a paso" : ""}`;

    // Memoria de tono.
    const nueva: MemoriaTono = {
        ultimoTimbre: t.id,
        ultimaEmocion: emocion,
        desde: memoria.ultimoTimbre === t.id ? memoria.desde || ahora : ahora,
        historial: [...memoria.historial.slice(-40), { t: ahora, ctx, emocion, timbre: t.id }],
    };
    guardar(CLAVE_MEMORIA, nueva);

    const decision: DecisionEntonacion = {
        timbreId: t.id,
        instruct,
        speed: +speed.toFixed(3),
        pitch: +pitch.toFixed(3),
        motivo: `${ctx} · ${emocion} · ${franja} · ${origen === "politica" ? "política aprendida" : "heurística"}${memoria.ultimoTimbre === t.id ? " · coherencia" : ""}`,
        origen,
    };
    try { window.dispatchEvent(new CustomEvent(EVENTO_ENTONACION, { detail: decision })); } catch { /* */ }
    return decision;
}

/* ── Reflexión en segundo plano ────────────────────────────────────────────── */

let reflexionando = false;

/**
 * Pide al router económico (Astraura 1,58-bit primario, gratuitos primero) que
 * revise el historial de tono y proponga una política mejor: qué timbre para
 * cada contexto+emoción y qué género base. Guarda el resultado; la siguiente
 * decisión en vivo ya lo usa. Nunca bloquea la voz.
 */
export async function reflexionarEntonacion(): Promise<boolean> {
    if (typeof window === "undefined" || reflexionando) return false;
    reflexionando = true;
    try {
        const memoria = leer<MemoriaTono>(CLAVE_MEMORIA, { ultimoTimbre: null, ultimaEmocion: null, desde: 0, historial: [] });
        if (memoria.historial.length < 5) return false;

        const catalogo = TIMBRES.map((t) => `${t.id}: ${t.genero}, ${t.desc}`).join("\n");
        const historial = memoria.historial.slice(-30).map((h) => `${h.ctx}/${h.emocion} → ${h.timbre}`).join("\n");
        const prompt =
            `Eres el agente de entonación de Astraura. Timbres disponibles:\n${catalogo}\n\n` +
            `Historial reciente (contexto/emoción → timbre usado):\n${historial}\n\n` +
            `Propón una política JSON {"generoBase":"femenina|masculina|neutra","mapa":{"contexto:emocion":"timbreId"}} ` +
            `que suene coherente y natural: pocos cambios de timbre, el mismo para contextos parecidos, ` +
            `voz serena de madrugada, clara en urgencia, cálida en alegría. Responde SOLO el JSON.`;

        // El router económico del OS: Astraura 1,58-bit primario, gratuitos
        // primero, registro de la ruta en `starseed.astraura.routes.v1`.
        const router = await import("@/ai/astraura/router");
        const res = await router.astrauraChat({
            messages: [{ role: "user", content: prompt }],
            taskHint: "reasoning",
            maxTokens: 400,
            temperature: 0.2,
            agentId: "agente-entonacion",
        });
        const texto = res?.text ?? "";
        const m = texto.match(/\{[\s\S]*\}/);
        if (!m) return false;
        const json = JSON.parse(m[0]) as Partial<Politica>;
        const mapa: Record<string, string> = {};
        for (const [k, v] of Object.entries(json.mapa ?? {})) if (typeof v === "string" && buscarTimbre(v)) mapa[k] = v;
        const generoBase = (["femenina", "masculina", "neutra"] as VoiceGender[]).includes(json.generoBase as VoiceGender)
            ? (json.generoBase as VoiceGender) : "neutra";
        guardar(CLAVE_POLITICA, { mapa, generoBase, actualizada: Date.now() } satisfies Politica);
        return true;
    } catch {
        return false;
    } finally {
        reflexionando = false;
    }
}

/** Lectura para la pestaña de Inteligencia. */
export function estadoEntonacion(): { politica: Politica; memoria: MemoriaTono } {
    return {
        politica: leer<Politica>(CLAVE_POLITICA, { mapa: {}, generoBase: "neutra", actualizada: 0 }),
        memoria: leer<MemoriaTono>(CLAVE_MEMORIA, { ultimoTimbre: null, ultimaEmocion: null, desde: 0, historial: [] }),
    };
}
