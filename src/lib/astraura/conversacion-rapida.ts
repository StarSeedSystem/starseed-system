/**
 * Conversación en vivo con Astraura · la parte PURA (sin red, sin DOM).
 * ─────────────────────────────────────────────────────────────────────────────
 * Alex (2026-09-22): «la prioridad es que responda inmediatamente con la voz en tiempo real
 * como una conversación con un humano… siempre prefiriendo local». Lo medido esa noche:
 *
 *   · El orbe esperaba la respuesta ENTERA del enrutador (hasta 120 s) y solo entonces
 *     empezaba a hablar. El sistema primario local (`/api/chat/stream` del backend) tardaba
 *     ~95 s hasta el primer token: prompt enorme (personalidad, habilidades, contexto de
 *     pantalla) procesado a ~15 tok/s por BitNet, que no puede subir su microlote por encima
 *     de 24 (el backend BLAS revienta con i2_s por encima de 32).
 *   · BitNet genera a ~8 tok/s: de sobra para la voz (se habla a ~3 palabras/s). Lo que mata
 *     la conversación es el PREFILL, no la generación.
 *
 * Así que la conversación va por un carril propio: un prompt de sistema CORTO y SIEMPRE
 * IGUAL, y un historial que solo CRECE por el final. Con `cache_prompt`, llama-server
 * reutiliza el prefijo común y en cada turno solo procesa lo nuevo (la frase del usuario):
 * ~2 s en vez de ~95. Si aun así el local no da su primer token a tiempo, la nube entra en
 * carrera y gana quien hable primero (la voz no cambia: es la misma).
 */

import type { QuantumOrbParams } from "@/lib/aurora/quantum-orb-theme";

export interface TurnoConversacion {
    rol: "usuario" | "astraura";
    texto: string;
}

export interface PersonaConversacion {
    id: string;
    nombre: string;
}

export interface MensajeChat {
    role: "system" | "user" | "assistant";
    content: string;
}

/** Tope del historial que viaja (caracteres). Por encima, se reinicia a los dos últimos turnos. */
export const HISTORIAL_MAX_CHARS = 1400;
/** Cuánto se espera al primer token local antes de abrir la carrera con la nube (ms). */
export const PLAZO_LOCAL_MS = 2800;

/** El sistema: corto, estable (misma cadena siempre para la misma persona) y hablado. */
export function sistemaConversacion(persona: PersonaConversacion): string {
    const nombre = (persona?.nombre || "Astraura").trim().slice(0, 40);
    return (
        `Eres ${nombre}, la inteligencia de StarSeed OS, conversando en voz alta con una persona. ` +
        "Habla en español natural, cálido y cercano, con frases cortas. Responde en una a tres frases; " +
        "si el tema da para más, ofrece ampliarlo. Nunca uses listas, markdown, emojis ni enlaces."
    );
}

/**
 * El historial que se manda: solo crece por el final mientras quepa, para que el prefijo
 * cacheado siga valiendo. Cuando se pasa del tope, se queda con los dos últimos turnos (una
 * sola vez paga el prefill entero y vuelve a crecer). PURA.
 */
export function recortarHistorial(historial: TurnoConversacion[], maxChars = HISTORIAL_MAX_CHARS): TurnoConversacion[] {
    const limpios = (historial || []).filter((t) => t && typeof t.texto === "string" && t.texto.trim());
    const total = limpios.reduce((n, t) => n + t.texto.length, 0);
    if (total <= maxChars) return limpios;
    return limpios.slice(-2);
}

/** Los mensajes para un servidor OpenAI-compatible (llama-server aplica la plantilla de BitNet). PURA. */
export function mensajesConversacion(
    persona: PersonaConversacion,
    historial: TurnoConversacion[],
    texto: string,
): MensajeChat[] {
    const msgs: MensajeChat[] = [{ role: "system", content: sistemaConversacion(persona) }];
    for (const t of recortarHistorial(historial)) {
        msgs.push({ role: t.rol === "usuario" ? "user" : "assistant", content: t.texto.trim().slice(0, 700) });
    }
    msgs.push({ role: "user", content: String(texto || "").trim().slice(0, 700) });
    return msgs;
}

/**
 * Lee una línea `data: …` de un stream OpenAI y devuelve el trozo de texto, `null` si no
 * trae texto y `"[FIN]"` al terminar. PURA.
 */
export function trozoDeLineaSSE(linea: string): string | null {
    const l = (linea || "").trim();
    if (!l.startsWith("data:")) return null;
    const dato = l.slice(5).trim();
    if (!dato) return null;
    if (dato === "[DONE]") return "[FIN]";
    try {
        const j = JSON.parse(dato) as {
            choices?: { delta?: { content?: string | null }; text?: string; finish_reason?: string | null }[];
            content?: string;
        };
        const c = j.choices?.[0];
        const t = c?.delta?.content ?? c?.text ?? j.content ?? null;
        return typeof t === "string" && t.length ? t : null;
    } catch {
        return null;
    }
}

/**
 * Vector visual de la orbe que el modelo publica por cláusula (BitNet 1.58b).
 * Heurística determinista sobre la puntuación y la longitud, con todo en 0..1.
 * PURA: la usa la ruta (servidor) y el cliente la recibe como evento `params`.
 */
export function paramsDeClausula(texto: string): Partial<QuantumOrbParams> {
    if (!texto || !texto.trim()) return {};
    const palabras = (texto.match(/\S+/g) ?? []).length;
    if (palabras === 0) return {};
    const pregunta = /[?¿]/.test(texto);
    const exclama = /[!¡]/.test(texto);
    const progreso = Math.min(palabras / 14, 1);
    const r3 = (x: number): number => Math.round(x * 1000) / 1000;
    return {
        breath: r3(0.25 + 0.5 * progreso),
        turbulence: r3(pregunta || exclama ? 0.7 : 0.35),
        spikiness: r3(exclama ? 0.75 : pregunta ? 0.45 : 0.25),
        symmetry: r3(exclama ? 0.35 : pregunta ? 0.5 : 0.7),
        hueShift: r3(exclama ? 0.65 : pregunta ? 0.4 : 0.5),
    };
}

/** ¿La posición `i` del flujo cierra una cláusula? El punto solo si le sigue espacio o el fin. */
function cierraClausula(buffer: string, i: number): boolean {
    const c = buffer[i];
    if (c === "!" || c === "?" || c === "…" || c === "\n") return true;
    if (c !== ".") return false;
    const siguiente = buffer[i + 1];
    return siguiente === undefined || /\s/.test(siguiente);
}

/**
 * Separa las cláusulas YA cerradas del texto que sigue llegando. La puntuación
 * se queda con su cláusula; `resto` es lo que aún no ha terminado. PURA.
 */
export function clausulasCompletas(buffer: string): { clausulas: string[]; resto: string } {
    const clausulas: string[] = [];
    let inicio = 0;
    for (let i = 0; i < buffer.length; i++) {
        if (!cierraClausula(buffer, i)) continue;
        const trozo = buffer.slice(inicio, i + 1).trim();
        if (trozo) clausulas.push(trozo);
        inicio = i + 1;
    }
    return { clausulas, resto: buffer.slice(inicio) };
}

/** Un evento del stream de la conversación hacia el cliente. */
export type EventoConversacion =
    | { t: "ruta"; motor: string; local: boolean }
    | { t: "token"; v: string }
    | { t: "params"; v: Partial<QuantumOrbParams> }
    | { t: "fin"; motor: string; local: boolean; msPrimerToken: number | null; msTotal: number; caracteres: number }
    | { t: "error"; error: string };

/** Lee una línea `data: {json}` del stream propio. PURA. */
export function eventoDeLinea(linea: string): EventoConversacion | null {
    const l = (linea || "").trim();
    if (!l.startsWith("data:")) return null;
    try {
        const e = JSON.parse(l.slice(5).trim()) as EventoConversacion;
        return e && typeof e === "object" && "t" in e ? e : null;
    } catch {
        return null;
    }
}
