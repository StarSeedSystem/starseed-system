/**
 * /api/voz/oir — el OÍDO EN LA NUBE de Astraura (Ola 1105 · VOZ · 2026-11-05)
 * ─────────────────────────────────────────────────────────────────────────────
 * Alex: al pulsar la orbe «se mantiene repitiendo en loop el sonido de reinicio del micrófono …
 * debería ser una línea estable receptora». En Android el reconocedor del navegador termina tras
 * cada frase o cada silencio y, al reiniciarlo, el sistema PITA. Con este oído, el móvil mantiene
 * UNA línea de micrófono abierta (getUserMedia + VAD por tramos, `escucha-fusionada.ts`) y solo
 * manda aquí cada tramo de voz ya cortado: sin reinicios, sin pitidos.
 *
 *   GET  → { disponible, motores }            (nunca devuelve claves ni rutas)
 *   POST → cuerpo `audio/wav` (≤ 4 MB, ≤ 30 s), `?idioma=es` → { texto, motor }
 *
 * Motores, en orden: Groq Whisper (`GROQ_API_KEY`) y Gemini (`GEMINI_API_KEY` / `GOOGLE_API_KEY`).
 * Ninguno → 503 y el cliente sigue con el oído del navegador. Misma puerta de sesión que
 * `/api/voz/nube`: en producción exige usuario; en la neurona local abre sin sesión.
 */

import { createClient } from "@/utils/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { esDespliegueLocal, exigirSesionSalvoLocal } from "@/lib/aurora/voz-starseed/puerta-local";
import { claveDe } from "@/lib/mando/modelos-disponibles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 20_000;

function esLocal(): boolean {
    return process.env.STARSEED_LOCAL === "1" || process.env.STARSEED_MANDO === "1";
}

async function clave(...nombres: string[]): Promise<string | null> {
    if (esLocal()) return claveDe(...nombres);
    for (const n of nombres) {
        const v = process.env[n];
        if (v && v.trim()) return v.trim();
    }
    return null;
}

const claveGroq = () => clave("GROQ_API_KEY", "STARSEED_PASARELA_GROQ_KEY");
const claveGemini = () => clave("GEMINI_API_KEY", "GOOGLE_API_KEY");

/** Idioma ISO de dos letras (es-MX → es). */
function idiomaCorto(v: string | null): string {
    const m = /^[a-z]{2}/i.exec((v || "es").trim());
    return m ? m[0].toLowerCase() : "es";
}

async function conGroq(audio: ArrayBuffer, idioma: string, k: string): Promise<string | null> {
    const form = new FormData();
    form.append("file", new Blob([audio], { type: "audio/wav" }), "tramo.wav");
    form.append("model", process.env.STARSEED_OIDO_GROQ_MODEL || "whisper-large-v3-turbo");
    form.append("language", idioma);
    form.append("response_format", "json");
    form.append("temperature", "0");
    const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${k}` },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { text?: string };
    return typeof j.text === "string" ? j.text.trim() : null;
}

async function conGemini(audio: ArrayBuffer, idioma: string, k: string): Promise<string | null> {
    const modelo = process.env.STARSEED_OIDO_GEMINI_MODEL || "gemini-2.0-flash";
    const datos = Buffer.from(audio).toString("base64");
    const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${k}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: `Transcribe exactamente lo que dice la persona (idioma: ${idioma}). Devuelve SOLO el texto ` +
                                "dicho, sin comillas ni comentarios. Si no se oye a nadie hablar, devuelve una cadena vacía." },
                        { inlineData: { mimeType: "audio/wav", data: datos } },
                    ],
                }],
                generationConfig: { temperature: 0 },
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
            cache: "no-store",
        },
    );
    if (!r.ok) return null;
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const texto = j.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim();
    return typeof texto === "string" ? texto.replace(/^["«]|["»]$/g, "").trim() : null;
}

export async function GET(): Promise<Response> {
    const motores: string[] = [];
    if (await claveGroq()) motores.push("groq-whisper");
    if (await claveGemini()) motores.push("gemini");
    return Response.json({ disponible: motores.length > 0, motores }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request): Promise<Response> {
    const puerta = await exigirSesionSalvoLocal(req);
    if (puerta) return puerta;
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
    // Un turno largo son varios tramos: el tope es por usuario y generoso (≈ 1 tramo cada 2,5 s).
    const rl = rateLimit(`voz-oir:${userId}`, 240, 10 * 60 * 1000);
    if (!rl.allowed) {
        return Response.json({ error: "Demasiados tramos de voz. Inténtalo en un momento." },
            { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
    }
    const audio = await req.arrayBuffer();
    if (!audio.byteLength) return Response.json({ error: "Sin audio." }, { status: 400 });
    if (audio.byteLength > MAX_BYTES) return Response.json({ error: "Tramo demasiado largo." }, { status: 413 });
    const idioma = idiomaCorto(new URL(req.url).searchParams.get("idioma"));
    const intentos: { motor: string; motivo: string }[] = [];
    const motores: [string, string | null, typeof conGroq][] = [
        ["groq-whisper", await claveGroq(), conGroq],
        ["gemini", await claveGemini(), conGemini],
    ];
    for (const [motor, k, fn] of motores) {
        if (!k) continue;
        try {
            const texto = await fn(audio, idioma, k);
            if (texto !== null) {
                return Response.json({ texto, motor }, { headers: { "Cache-Control": "no-store", "X-Astraura-Motor": motor } });
            }
            intentos.push({ motor, motivo: "sin respuesta válida" });
        } catch (e) {
            intentos.push({ motor, motivo: e instanceof Error ? e.name : "error" });
        }
    }
    return Response.json({ error: "Ningún oído en la nube disponible.", intentos }, { status: 503 });
}
