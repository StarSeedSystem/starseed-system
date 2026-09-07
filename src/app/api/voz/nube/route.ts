/**
 * POST /api/voz/nube (Ola 279 · V6 · 2026-09-07)
 * ─────────────────────────────────────────────────────────────────────────────
 * Nivel de voz «nube» entre la ligera y la mínima: síntesis que suena bien SIN
 * depender del demonio local. Pedido de Alex: «deja por ahora algún modelo que
 * funcione aunque no sea local pero se pueda usar y suene bien».
 *
 * Recibe `{ texto (≤ 600), genero?, velocidad? }` y devuelve audio. Orden:
 *   (a) Gemini TTS (`GEMINI_API_KEY` / `GOOGLE_API_KEY`): PCM 16 bit 24 kHz
 *       mono, envuelto en WAV por el servidor. Voces Kore/Puck/Aoede según
 *       el género.
 *   (b) Pollinations `openai-audio` (sin clave): `audio/mpeg` tal cual.
 *       Voces nova/echo/alloy según el género.
 *   (c) Si ambos fallan → 503 `{ error, intentos: [{ motor, motivo }] }`.
 *
 * Cabeceras: `X-Astraura-Motor` (qué motor sonó) y `Cache-Control: no-store`.
 * La clave de Gemini NUNCA se registra: solo vive en `process.env`.
 *
 * Reglas: misma puerta de sesión y rate-limit que `/api/voz/hablar`.
 */

import { createClient } from "@/utils/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { esDespliegueLocal, exigirSesionSalvoLocal } from "@/lib/aurora/voz-starseed/puerta-local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Longitud máxima del texto a sintetizar (caracteres). */
const MAX_TEXTO = 600;
/** Tiempo máximo de espera a Gemini TTS antes de relevar a Pollinations. */
const TIMEOUT_GEMINI_MS = 15_000;
/** Tiempo máximo de espera a Pollinations. */
const TIMEOUT_POLLINATIONS_MS = 20_000;

/** Voces de Gemini TTS (prebuilt) por género. */
const VOCES_GEMINI: Record<string, string> = {
    femenina: "Kore",
    masculina: "Puck",
    neutra: "Aoede",
};

/** Voces de Pollinations openai-audio por género. */
const VOCES_POLLINATIONS: Record<string, string> = {
    femenina: "nova",
    masculina: "echo",
    neutra: "alloy",
};

/** Tipo de género que acepta la ruta; el timbre lo da como `VoiceGender`. */
type GeneroNube = "femenina" | "masculina" | "neutra";

/**
 * Cabecera WAV de 44 bytes para PCM lineal sin comprimir. Gemini devuelve
 * `inlineData.data` en base64 como PCM de 16 bit a 24 kHz mono; sin esta
 * cabecera el navegador no sabría interpretar los bytes como audio.
 */
function cabeceraWav(dataBytes: number, frecuencia: number, canales: number, bits: number): Uint8Array {
    const cabecera = new Uint8Array(44);
    const vista = new DataView(cabecera.buffer);
    cabecera.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
    vista.setUint32(4, 36 + dataBytes, true);
    cabecera.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
    cabecera.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
    vista.setUint32(16, 16, true); // tamaño del chunk fmt
    vista.setUint16(20, 1, true); // PCM lineal
    vista.setUint16(22, canales, true);
    vista.setUint32(24, frecuencia, true);
    const bytesPorMuestra = bits / 8;
    vista.setUint32(28, frecuencia * canales * bytesPorMuestra, true); // byte rate
    vista.setUint16(32, canales * bytesPorMuestra, true); // block align
    vista.setUint16(34, bits, true);
    cabecera.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
    vista.setUint32(40, dataBytes, true);
    return cabecera;
}

/**
 * Sintetiza con Gemini TTS. Devuelve `{ audio, motor }` (WAV envuelto) o un
 * motivo de fallo. Nunca registra la clave; la lee solo de `process.env`.
 */
async function sintetizarConGemini(
    texto: string,
    genero: GeneroNube,
): Promise<{ audio: Uint8Array; tipo: string } | { error: string }> {
    const clave = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!clave) return { error: "Sin GEMINI_API_KEY en esta neurona." };
    const modelo = process.env.STARSEED_TTS_GEMINI_MODEL || "gemini-2.5-flash-preview-tts";
    const voz = VOCES_GEMINI[genero];
    try {
        const control = new AbortController();
        const t = setTimeout(() => control.abort(), TIMEOUT_GEMINI_MS);
        let resp: Response;
        try {
            resp = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${clave}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: texto }] }],
                        generationConfig: {
                            responseModalities: ["AUDIO"],
                            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } } },
                        },
                    }),
                    signal: control.signal,
                    cache: "no-store",
                },
            );
        } finally {
            clearTimeout(t);
        }
        if (!resp.ok) return { error: `Gemini respondió ${resp.status}.` };
        const datos = (await resp.json()) as {
            candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>;
        };
        const b64 = datos.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
        if (!b64) return { error: "Gemini no devolvió audio." };
        // PCM 16 bit a 24 kHz mono (contrato de `generateContent` con AUDIO).
        const pcm = Buffer.from(b64, "base64");
        const cabecera = cabeceraWav(pcm.byteLength, 24_000, 1, 16);
        const wav = new Uint8Array(cabecera.byteLength + pcm.byteLength);
        wav.set(cabecera, 0);
        wav.set(new Uint8Array(pcm), cabecera.byteLength);
        return { audio: wav, tipo: "audio/wav" };
    } catch (e) {
        return { error: e instanceof Error && e.name === "AbortError" ? "Timeout de Gemini." : "Error de red con Gemini." };
    }
}

/**
 * Sintetiza con Pollinations `openai-audio` (sin clave). Devuelve el blob
 * `audio/mpeg` tal cual, o un motivo de fallo.
 */
async function sintetizarConPollinations(
    texto: string,
    genero: GeneroNube,
): Promise<{ audio: ArrayBuffer; tipo: string } | { error: string }> {
    const voz = VOCES_POLLINATIONS[genero];
    const url = `https://text.pollinations.ai/${encodeURIComponent(texto)}?model=openai-audio&voice=${voz}`;
    try {
        const control = new AbortController();
        const t = setTimeout(() => control.abort(), TIMEOUT_POLLINATIONS_MS);
        let resp: Response;
        try {
            resp = await fetch(url, { signal: control.signal, cache: "no-store" });
        } finally {
            clearTimeout(t);
        }
        if (!resp.ok) return { error: `Pollinations respondió ${resp.status}.` };
        const audio = await resp.arrayBuffer();
        if (!audio.byteLength) return { error: "Pollinations devolvió audio vacío." };
        return { audio, tipo: "audio/mpeg" };
    } catch (e) {
        return { error: e instanceof Error && e.name === "AbortError" ? "Timeout de Pollinations." : "Error de red con Pollinations." };
    }
}

/** Construye la respuesta de éxito con el motor que sonó. */
function responderAudio(audio: Uint8Array | ArrayBuffer, tipo: string, motor: string): Response {
    const cuerpo: BodyInit = audio instanceof ArrayBuffer ? audio : new Uint8Array(audio);
    return new Response(cuerpo, {
        status: 200,
        headers: {
            "Content-Type": tipo,
            "X-Astraura-Motor": motor,
            "Cache-Control": "no-store",
        },
    });
}

export async function POST(req: Request): Promise<Response> {
    // Misma puerta de sesión que /api/voz/hablar: en producción desplegada exige
    // usuario; en el modo ligero local (la propia neurona) abre sin sesión.
    const puerta = await exigirSesionSalvoLocal(req);
    if (puerta) return puerta;

    // Identificador para el rate-limit (usuario en Vercel; `null` en local).
    let userId: string | null = null;
    if (process.env.NODE_ENV === "production" && !esDespliegueLocal(req)) {
        try {
            const supabase = await createClient();
            const { data } = await supabase.auth.getUser();
            userId = data.user?.id ?? null;
        } catch {
            userId = null;
        }
    }

    const rl = rateLimit(`voz-nube:${userId}`, 30, 10 * 60 * 1000);
    if (!rl.allowed) {
        return Response.json(
            { error: "Demasiadas síntesis. Inténtalo más tarde." },
            { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
        );
    }

    let cuerpo: { texto?: unknown; genero?: unknown; velocidad?: unknown };
    try {
        cuerpo = (await req.json()) as typeof cuerpo;
    } catch {
        return Response.json({ error: "JSON inválido." }, { status: 400 });
    }

    if (typeof cuerpo.texto !== "string" || !cuerpo.texto.trim()) {
        return Response.json({ error: "Falta el texto a sintetizar." }, { status: 400 });
    }
    const texto = cuerpo.texto.trim().slice(0, MAX_TEXTO);
    const genero: GeneroNube = cuerpo.genero === "femenina" || cuerpo.genero === "masculina" ? cuerpo.genero : "neutra";
    // `velocidad` viaja en el cuerpo (lo manda el motor); cada fuente nube la
    // expresa a su manera, así que aquí no se aplica directamente.

    // (a) Gemini TTS si hay clave; (b) Pollinations sin clave; (c) 503 con motivo.
    const intentos: Array<{ motor: string; motivo: string }> = [];
    const gemini = await sintetizarConGemini(texto, genero);
    if ("audio" in gemini) return responderAudio(gemini.audio, gemini.tipo, "gemini-tts");
    intentos.push({ motor: "gemini-tts", motivo: gemini.error });

    const pollinations = await sintetizarConPollinations(texto, genero);
    if ("audio" in pollinations) return responderAudio(pollinations.audio, pollinations.tipo, "pollinations");
    intentos.push({ motor: "pollinations", motivo: pollinations.error });

    return Response.json({ error: "Ninguna fuente de voz en la nube respondió.", intentos }, { status: 503 });
}