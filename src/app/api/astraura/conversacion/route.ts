/**
 * POST /api/astraura/conversacion — un turno de conversación EN VIVO, en streaming.
 * ─────────────────────────────────────────────────────────────────────────────
 * Local primero y a la vez inmediato (ver `conversacion-rapida.ts` para lo medido):
 *
 *   1. BitNet b1.58 de esta máquina (llama-server :8790) con un prompt corto y estable, para
 *      que `cache_prompt` reutilice todo lo anterior y solo procese la frase nueva.
 *   2. Si en `PLAZO_LOCAL_MS` no ha dado su primer token (máquina cargada, modelo frío), la
 *      nube gratuita entra EN CARRERA (Groq → FreeLLMAPI local → OpenRouter :free) y gana
 *      quien hable primero; al perdedor se le corta. La voz no cambia: es la misma.
 *   3. Si ganó la nube, al acabar se CALIENTA BitNet con la conversación completa (una
 *      petición de 1 token): el siguiente turno ya encuentra el prefijo en caché y suele
 *      ganar el local. La conversación converge sola a lo nativo.
 *
 * Emite `data: {evento}` (ver `EventoConversacion`). Solo en despliegue local: en Vercel no
 * hay BitNet de la máquina del usuario y las claves del servidor no se prestan.
 */
import {
    PLAZO_LOCAL_MS,
    mensajesConversacion,
    trozoDeLineaSSE,
    type EventoConversacion,
    type MensajeChat,
    type PersonaConversacion,
    type TurnoConversacion,
} from "@/lib/astraura/conversacion-rapida";
import { esDespliegueLocal } from "@/lib/aurora/voz-starseed/puerta-local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BITNET = process.env.ASTRAURA_BITNET_URL || "http://127.0.0.1:8790";

interface Carril {
    nombre: string;
    local: boolean;
    url: string;
    cabeceras: Record<string, string>;
    cuerpo: Record<string, unknown>;
    /** Tope de tokens del carril (los modelos que razonan cuentan también lo que piensan). */
    maxTokens?: number;
}

function carrilLocal(): Carril {
    return {
        nombre: "bitnet-b1.58-local",
        local: true,
        url: `${BITNET}/v1/chat/completions`,
        cabeceras: {},
        cuerpo: { cache_prompt: true, temperature: 0.7, top_p: 0.9 },
    };
}

/** Cabecera común: Groq (Cloudflare) rechaza con 403 · 1010 a clientes sin User-Agent. */
const UA = { "User-Agent": "StarSeed-OS/1.0" };

/**
 * Carriles de nube gratuitos, en orden de rapidez MEDIDA (2026-09-23, Mac de Alex):
 * Groq gpt-oss-20b sin razonamiento visible 0,35 s al primer token · FreeLLMAPI local
 * «auto» 0,73 s · OpenRouter :free como último recurso (limitado a menudo por 429).
 * `STARSEED_CONVERSACION_GROQ` / `STARSEED_CONVERSACION_OPENROUTER` cambian el modelo
 * sin tocar código (en OpenRouter solo se aceptan ids `:free`).
 */
function carrilesNube(): Carril[] {
    const c: Carril[] = [];
    const groq = process.env.GROQ_API_KEY;
    if (groq) {
        const modelo = process.env.STARSEED_CONVERSACION_GROQ || "openai/gpt-oss-20b";
        const razona = /gpt-oss/.test(modelo);
        c.push({
            nombre: `groq/${modelo}`,
            local: false,
            url: "https://api.groq.com/openai/v1/chat/completions",
            cabeceras: { ...UA, Authorization: `Bearer ${groq}` },
            cuerpo: razona
                ? { model: modelo, temperature: 0.7, reasoning_effort: "low", include_reasoning: false }
                : { model: modelo, temperature: 0.7 },
            maxTokens: razona ? 400 : 180,
        });
    }
    const free = process.env.FREELLMAPI_KEY;
    if (free) {
        c.push({
            nombre: "freellmapi/auto",
            local: false,
            url: "http://127.0.0.1:3001/v1/chat/completions",
            cabeceras: { ...UA, Authorization: `Bearer ${free}` },
            cuerpo: { model: "auto", temperature: 0.7 },
        });
    }
    const or = process.env.OPENROUTER_API_KEY;
    const modeloOr = process.env.STARSEED_CONVERSACION_OPENROUTER || "google/gemma-4-26b-a4b-it:free";
    if (or && modeloOr.endsWith(":free")) {
        c.push({
            nombre: `openrouter/${modeloOr}`,
            local: false,
            url: "https://openrouter.ai/api/v1/chat/completions",
            cabeceras: { ...UA, Authorization: `Bearer ${or}` },
            cuerpo: { model: modeloOr, temperature: 0.7 },
        });
    }
    return c;
}

/** Trozos de texto de un carril OpenAI-compatible en streaming. Lanza si el carril falla. */
async function* leerTokens(carril: Carril, mensajes: MensajeChat[], senal: AbortSignal) {
    const maxTokens = carril.maxTokens ?? 180;
    const r = await fetch(carril.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...carril.cabeceras },
        body: JSON.stringify({ ...carril.cuerpo, messages: mensajes, stream: true, max_tokens: maxTokens }),
        signal: senal,
    });
    if (!r.ok || !r.body) throw new Error(`${carril.nombre}: HTTP ${r.status}`);
    const lector = r.body.getReader();
    const dec = new TextDecoder();
    let resto = "";
    for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        resto += dec.decode(value, { stream: true });
        const lineas = resto.split("\n");
        resto = lineas.pop() ?? "";
        for (const l of lineas) {
            const t = trozoDeLineaSSE(l);
            if (t === "[FIN]") return;
            if (t) yield t;
        }
    }
}

/** Deja el prefijo de la conversación en la caché de BitNet sin generar (1 token). */
function calentarLocal(mensajes: MensajeChat[]): void {
    const c = carrilLocal();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 90_000);
    void fetch(c.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...c.cuerpo, messages: mensajes, stream: false, max_tokens: 1 }),
        signal: ctrl.signal,
    })
        .catch(() => undefined)
        .finally(() => clearTimeout(t));
}

export async function POST(req: Request): Promise<Response> {
    if (!esDespliegueLocal(req)) return new Response("Not Found", { status: 404 });
    let cuerpo: {
        texto?: string;
        historial?: TurnoConversacion[];
        persona?: PersonaConversacion;
        soloLocal?: boolean;
        plazoLocalMs?: number;
    };
    try {
        cuerpo = await req.json();
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
    }
    const entrada = String(cuerpo.texto || "").trim();
    if (!entrada) return Response.json({ error: "Falta el texto." }, { status: 400 });
    const persona = cuerpo.persona?.nombre ? cuerpo.persona : { id: "astraura", nombre: "Astraura" };
    const mensajes = mensajesConversacion(persona, cuerpo.historial ?? [], entrada);
    const plazo = Math.max(300, Math.min(20_000, Number(cuerpo.plazoLocalMs) || PLAZO_LOCAL_MS));
    const soloLocal = !!cuerpo.soloLocal;
    const inicio = Date.now();
    const enc = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
        async start(ctrl) {
            const enviar = (e: EventoConversacion) => {
                try {
                    ctrl.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
                } catch {
                    /* el cliente se fue */
                }
            };
            let ganador: Carril | null = null;
            let primerToken: number | null = null;
            let dicho = "";
            let avisarPrimero: () => void = () => undefined;
            const primero = new Promise<void>((ok) => (avisarPrimero = ok));
            const cortes = new Map<string, AbortController>();
            const carreras = new Map<string, Promise<void>>();

            const correr = async (carril: Carril) => {
                const corte = new AbortController();
                cortes.set(carril.nombre, corte);
                req.signal.addEventListener("abort", () => corte.abort(), { once: true });
                for await (const t of leerTokens(carril, mensajes, corte.signal)) {
                    if (!ganador) {
                        ganador = carril;
                        primerToken = Date.now() - inicio;
                        enviar({ t: "ruta", motor: carril.nombre, local: carril.local });
                        for (const [n, c] of cortes) if (n !== carril.nombre) c.abort();
                        avisarPrimero();
                    }
                    if (ganador !== carril) return;
                    dicho += t;
                    enviar({ t: "token", v: t });
                }
            };
            const lanzar = (carril: Carril) => {
                const p = correr(carril).catch(() => undefined);
                carreras.set(carril.nombre, p);
                return p;
            };

            const local = lanzar(carrilLocal());
            if (!soloLocal) {
                await Promise.race([primero, local, new Promise((ok) => setTimeout(ok, plazo))]);
                for (const carril of carrilesNube()) {
                    if (ganador) break;
                    // Cada carril de nube entra solo si el anterior terminó sin hablar.
                    await Promise.race([lanzar(carril), primero]);
                }
            }
            const g = ganador as Carril | null;
            if (g) await carreras.get(g.nombre);
            await local;
            const final = ganador as Carril | null;
            if (!final) {
                enviar({ t: "error", error: "ningún motor respondió (ni BitNet local ni la nube)" });
            } else {
                enviar({
                    t: "fin",
                    motor: final.nombre,
                    local: final.local,
                    msPrimerToken: primerToken,
                    msTotal: Date.now() - inicio,
                    caracteres: dicho.length,
                });
                if (!final.local && dicho) calentarLocal([...mensajes, { role: "assistant", content: dicho }]);
            }
            try {
                ctrl.close();
            } catch {
                /* ya cerrado */
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
        },
    });
}
