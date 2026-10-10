/**
 * GENESIS · CARRILES DE MODELOS GRATUITOS (solo servidor, 2026-10-10)
 * ─────────────────────────────────────────────────────────────────────────────
 * Los modelos gratuitos que este servidor ya tiene configurados, en orden de
 * rapidez y de respeto a las cuotas (Groq → NVIDIA NIM comunitario →
 * OpenRouter `:free` → FreeLLMAPI local → Gemini al final, que se reserva).
 * Cada carril se declara solo si su variable existe; las claves nunca salen de
 * aquí ni se registran. 429/402/5xx o tiempo agotado → siguiente carril.
 *
 * Solo servidor: lee `process.env`. No importa `node:*` (usa `fetch` global).
 */

export interface CarrilGenesis {
    /** Nombre legible sin secretos: «groq/openai/gpt-oss-20b». */
    nombre: string;
    url: string;
    cabeceras: Record<string, string>;
    cuerpo: Record<string, unknown>;
}

const UA = { "User-Agent": "StarSeedOS-Genesis/1.0" };

function primeraClave(...nombres: string[]): string | null {
    for (const n of nombres) {
        const v = process.env[n];
        if (v && v.trim()) return v.split(",")[0].trim();
    }
    return null;
}

/** Variables que se miran (para decir cuáles faltan cuando no hay ninguna). */
export const VARIABLES_CARRILES = ["GROQ_API_KEY", "NVIDIA_SHARED_KEY", "NVIDIA_API_KEY", "OPENROUTER_SHARED_KEY", "OPENROUTER_API_KEY", "FREELLMAPI_KEY", "GEMINI_API_KEY"];

export function carrilesGenesis(opciones: { local: boolean }): CarrilGenesis[] {
    const c: CarrilGenesis[] = [];
    const groq = primeraClave("GROQ_API_KEY");
    if (groq) {
        const modelo = process.env.STARSEED_GENESIS_GROQ || "openai/gpt-oss-20b";
        c.push({
            nombre: `groq/${modelo}`,
            url: "https://api.groq.com/openai/v1/chat/completions",
            cabeceras: { ...UA, Authorization: `Bearer ${groq}` },
            cuerpo: /gpt-oss/.test(modelo) ? { model: modelo, reasoning_effort: "low", include_reasoning: false } : { model: modelo },
        });
    }
    const nim = primeraClave("NVIDIA_SHARED_KEY", "NVIDIA_API_KEY");
    if (nim) {
        const modelo = process.env.STARSEED_GENESIS_NIM || "google/gemma-4-31b-it";
        c.push({
            nombre: `nim/${modelo}`,
            url: "https://integrate.api.nvidia.com/v1/chat/completions",
            cabeceras: { ...UA, Authorization: `Bearer ${nim}` },
            cuerpo: { model: modelo },
        });
    }
    const or = primeraClave("OPENROUTER_SHARED_KEY", "OPENROUTER_API_KEY");
    const modeloOr = process.env.STARSEED_GENESIS_OPENROUTER || "google/gemma-4-26b-a4b-it:free";
    if (or && modeloOr.endsWith(":free")) {
        c.push({
            nombre: `openrouter/${modeloOr}`,
            url: "https://openrouter.ai/api/v1/chat/completions",
            cabeceras: { ...UA, Authorization: `Bearer ${or}` },
            cuerpo: { model: modeloOr },
        });
    }
    const libre = primeraClave("FREELLMAPI_KEY");
    if (libre && opciones.local) {
        c.push({
            nombre: "freellmapi/auto",
            url: "http://127.0.0.1:3001/v1/chat/completions",
            cabeceras: { ...UA, Authorization: `Bearer ${libre}` },
            cuerpo: { model: "auto" },
        });
    }
    const gemini = primeraClave("GEMINI_API_KEY");
    if (gemini) {
        const modelo = process.env.STARSEED_GENESIS_GEMINI || "gemini-2.5-flash";
        c.push({
            nombre: `gemini/${modelo}`,
            url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
            cabeceras: { ...UA, Authorization: `Bearer ${gemini}` },
            cuerpo: { model: modelo },
        });
    }
    return c;
}

export interface MensajeModelo {
    role: "system" | "user" | "assistant";
    content: string;
}

export type ResultadoCarriles =
    | { ok: true; texto: string; carril: string; intentos: { carril: string; motivo: string }[] }
    | { ok: false; intentos: { carril: string; motivo: string }[] };

/** Prueba los carriles en orden hasta que uno conteste. Nunca lanza. */
export async function preguntarCarriles(carriles: CarrilGenesis[], mensajes: MensajeModelo[], plazoMs = 25_000): Promise<ResultadoCarriles> {
    const intentos: { carril: string; motivo: string }[] = [];
    for (const carril of carriles) {
        const control = new AbortController();
        const reloj = setTimeout(() => control.abort(), plazoMs);
        try {
            const r = await fetch(carril.url, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...carril.cabeceras },
                body: JSON.stringify({ ...carril.cuerpo, messages: mensajes, temperature: 0.2, max_tokens: 1400, stream: false }),
                signal: control.signal,
            });
            if (!r.ok) {
                intentos.push({ carril: carril.nombre, motivo: r.status === 429 ? "sin cupo ahora (429)" : r.status === 402 ? "sin crédito (402)" : `HTTP ${r.status}` });
                continue;
            }
            const j = (await r.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[] } | null;
            const texto = j?.choices?.[0]?.message?.content;
            if (typeof texto !== "string" || !texto.trim()) {
                intentos.push({ carril: carril.nombre, motivo: "respuesta vacía" });
                continue;
            }
            return { ok: true, texto, carril: carril.nombre, intentos };
        } catch (e) {
            intentos.push({ carril: carril.nombre, motivo: control.signal.aborted ? "tardó demasiado" : e instanceof Error ? e.message.slice(0, 80) : "error de red" });
        } finally {
            clearTimeout(reloj);
        }
    }
    return { ok: false, intentos };
}
