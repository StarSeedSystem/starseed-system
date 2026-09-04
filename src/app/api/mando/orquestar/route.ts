/**
 * POST /api/mando/orquestar (Ola 234 · mundo de los avatares)
 * ─────────────────────────────────────────────────────────────────────────────
 * Chat de orquestación del Centro de Mando: hablar con el sistema multiagéntico
 * del enjambre SIN salir de la consola.
 *
 * ⚠️ Seguridad (innegociable, mismo guardián que el resto de `/api/mando/*`):
 *  • Rutas `/api/mando/*` SOLO funcionan en local: si no estamos en desarrollo
 *    ni `STARSEED_MANDO=1`, responden 404 sin mayor información.
 *  • Exigen sesión iniciada (como el resto de rutas privadas).
 *  • NUNCA devuelven claves, tokens ni rutas absolutas del disco del usuario.
 *  • Esta ruta JAMÁS ejecuta comandos del sistema ni lanza el enjambre por su
 *    cuenta: lanzar una ola es siempre una acción del usuario desde la terminal.
 *
 * MODOS (cuerpo `{ mensaje, modo }`):
 *  · "preguntar"  — responde el sistema primario (Astraura 1.58-bit, gratis y
 *                    soberano) a través de su nube; se devuelve qué motor
 *                    contestó, la latencia y los tokens cuando la nube los da.
 *  · "planificar" — el modelo devuelve una PROPUESTA de tareas en JSON (mismo
 *                    formato que las colas del enjambre). Es SOLO UNA PROPUESTA:
 *                    no escribe nada en disco ni en la cola.
 *  · "anotar"     — guarda una nota en el bus de eventos (`relevo_eventos`) con
 *                    `quien: "mando"`, para que el enjambre la vea en vivo.
 *
 * Como esta ruta es de servidor, no puede reutilizar el router de cliente
 * (`src/ai/astraura/router.ts`, usa `window`/`localStorage`). Por eso delega en
 * el sistema primario — la nube de Astraura 1.58-bit (Adenda 153) — vía el
 * destino resistente `destinoNube()` + clave `ASTRAURA_158_KEY` (variables de
 * entorno, nunca literales).
 */

import { createClient } from "@/utils/supabase/server";
import { destinoNube } from "@/lib/astraura/destino-nube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAT_TIMEOUT_MS = 110_000;
const TEXTO_MAX = 4_000;
const MENSAJE_MAX = 2_000;

/** Una tarea de la propuesta de planificación (formato de colas del enjambre). */
export interface TareaPropuesta {
    id: string;
    ola: string;
    titulo: string;
    archivos: string[];
    prompt: string;
}

/** Respuesta normalizada del sistema primario. */
interface VozPrimaria {
    ok: boolean;
    texto?: string;
    error?: string;
    latenciaMs?: number;
    motor?: string;
    modelo?: string;
    tokens?: number;
}

/** ¿El mando está permitido en esta instancia? (404 si no). */
function mandoHabilitado(): boolean {
    return process.env.NODE_ENV !== "production" || process.env.STARSEED_MANDO === "1";
}

/** Devuelve 401 si la sesión no es válida. */
async function exigirSesion(): Promise<Response | null> {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
            return Response.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
        }
    } catch {
        return Response.json({ error: "No se pudo verificar la sesión." }, { status: 401 });
    }
    return null;
}

/** Escapa un texto para incrustarlo con seguridad en un prompt. */
function recortar(texto: string, max: number): string {
    const limpio = String(texto ?? "").trim();
    return limpio.length > max ? `${limpio.slice(0, max)}…` : limpio;
}

/**
 * Llama al sistema primario (nube de Astraura 1.58-bit) con un mensaje y un
 * system prompt. Devuelve la respuesta en texto plano (no-stream). Nunca lanza:
 * ante cualquier error devuelve `{ ok:false, error }`.
 */
async function hablarConElPrimario(
    mensaje: string,
    systemPrompt: string,
): Promise<VozPrimaria> {
    let destino = null;
    try {
        destino = await destinoNube();
    } catch {
        destino = null;
    }
    if (!destino) {
        return {
            ok: false,
            error:
                "La nube de Astraura 1.58-bit no está disponible ahora mismo. Puedes hablar con los agentes desde sus canales habituales (Astraura IA, Chat del OS) o desde la terminal del enjambre.",
        };
    }

    const cabeceras: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
    };
    const clave = String(process.env.ASTRAURA_158_KEY ?? "").trim();
    if (clave) cabeceras["X-Astraura-Key"] = clave;

    const t0 = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CHAT_TIMEOUT_MS);
    try {
        const res = await fetch(`${destino.base}/api/starseed/chat`, {
            method: "POST",
            headers: cabeceras,
            body: JSON.stringify({
                messages: [{ role: "user", content: recortar(mensaje, MENSAJE_MAX) }],
                system_prompt: systemPrompt,
                stream: false,
            }),
            signal: ctrl.signal,
            cache: "no-store",
        });
        if (!res.ok) {
            const texto = await res.text().catch(() => "");
            return {
                ok: false,
                error: `Astraura respondió ${res.status}: ${(texto || res.statusText).slice(0, 180)}`,
            };
        }
        const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        const respuesta = String(json?.response ?? json?.full_text ?? json?.text ?? "").trim();
        if (!respuesta) {
            return { ok: false, error: "Astraura no devolvió texto." };
        }
        const latenciaMs = Date.now() - t0;
        // Tokens de telemetría si la nube los publica (opcional).
        const telemetria = json?.telemetry as Record<string, unknown> | undefined;
        const tokens =
            typeof telemetria?.tokens_generated === "number"
                ? telemetria.tokens_generated
                : undefined;
        const persona = String(json?.persona ?? json?.personality ?? "").trim();
        return {
            ok: true,
            texto: respuesta,
            latenciaMs,
            motor: "Astraura 1.58-bit (nube StarSeed)",
            modelo: persona || "primario",
            tokens,
        };
    } catch (e) {
        const mensajeErr = e instanceof Error ? e.message : String(e);
        return {
            ok: false,
            error: `No se pudo contactar la nube de Astraura 1.58-bit: ${mensajeErr.slice(0, 180)}`,
        };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Extrae el JSON de la propuesta desde la respuesta del modelo. El modelo puede
 * envolver el array en bloques de código o añadir texto; buscamos el primer
 * `[ … ]` balanceado y lo sanitizamos tarea a tarea. Nunca `any`.
 */
function extraerPropuesta(raw: string): TareaPropuesta[] {
    const texto = String(raw ?? "").trim();
    if (!texto) return [];

    // Quita llaves de bloque de código markdown alrededor del array.
    const sinFences = texto.replace(/```(?:json)?/gi, "");
    const ini = sinFences.indexOf("[");
    if (ini < 0) return [];

    let profundidad = 0;
    let fin = -1;
    for (let i = ini; i < sinFences.length; i++) {
        const c = sinFences[i];
        if (c === "[") profundidad++;
        else if (c === "]") {
            profundidad--;
            if (profundidad === 0) {
                fin = i + 1;
                break;
            }
        }
    }
    if (fin < 0) return [];

    let crudo: unknown;
    try {
        crudo = JSON.parse(sinFences.slice(ini, fin));
    } catch {
        return [];
    }
    if (!Array.isArray(crudo)) return [];

    const tareas: TareaPropuesta[] = [];
    for (const entrada of crudo) {
        if (!entrada || typeof entrada !== "object") continue;
        const e = entrada as Record<string, unknown>;
        const archivos = Array.isArray(e.archivos)
            ? e.archivos
                  .filter((a): a is string => typeof a === "string")
                  .map((a) => a.trim())
                  .filter(Boolean)
            : [];
        const titulo = String(e.titulo ?? "").trim();
        const prompt = String(e.prompt ?? "").trim();
        const id = String(e.id ?? `tarea-${tareas.length + 1}`).trim();
        const ola = String(e.ola ?? "mando").trim() || "mando";
        if (!titulo || !prompt) continue;
        tareas.push({ id, ola, titulo, archivos, prompt });
        if (tareas.length >= 12) break;
    }
    return tareas;
}

/** Prompt de sistema para pedir la propuesta de tareas (solo JSON, no escribe). */
const PROMPT_PLANIFICAR = `Eres el planificador del enjambre de desarrollo del StarSeed OS.
El usuario te pide descomponer una intención en tareas concreatas. Devuelve EXCLUSIVAMENTE un array JSON (sin texto alrededor, sin bloques de código) de objetos con esta forma EXACTA:
{"id":"t3","ola":"mando","titulo":"Título corto de la tarea","archivos":["ruta/a/archivo.tsx"],"prompt":"Instrucción clara y en español para un agente que tocará solo esos archivos."}
Reglas:
- Máximo 6 tareas; cada una con un único objetivo.
- Solo JSON: el array completo. Nada más.`;

/** Prompt de sistema para preguntar (contexto breve del enjambre). */
const PROMPT_PREGUNTAR = `Eres el oráculo del Centro de Mando del StarSeed OS.
Responde de forma clara y concisa en español sobre el desarrollo y la orquestación
multiagéntica del proyecto. Si alguien te pide "lanzar una ola", "disparar el
enjambre" o "ejecutar un comando", explica que lanzar una ola es siempre una
acción del usuario desde la terminal, nunca automática desde aquí.`;

export async function POST(req: Request): Promise<Response> {
    if (!mandoHabilitado()) {
        return new Response("Not Found", { status: 404 });
    }
    const noAuth = await exigirSesion();
    if (noAuth) return noAuth;

    let cuerpo: unknown;
    try {
        cuerpo = await req.json();
    } catch {
        return Response.json(
            { error: "Cuerpo JSON inválido." },
            { status: 400 },
        );
    }

    const c = (cuerpo && typeof cuerpo === "object" ? cuerpo : {}) as Record<string, unknown>;
    const mensajeLimpio = String(c.mensaje ?? "").trim();
    const modo = String(c.modo ?? "preguntar").trim();

    if (!mensajeLimpio) {
        return Response.json(
            { error: "Falta el mensaje." },
            { status: 400 },
        );
    }
    if (modo !== "preguntar" && modo !== "planificar" && modo !== "anotar") {
        return Response.json(
            { error: "Modo inválido: usa «preguntar», «planificar» o «anotar»." },
            { status: 400 },
        );
    }

    // ── Modo "anotar": guarda la nota en el bus de eventos (nunca ejecuta nada) ──
    if (modo === "anotar") {
        try {
            const supabase = await createClient();
            const { data, error } = await supabase
                .from("relevo_eventos")
                .insert({
                    quien: "mando",
                    tipo: "nota_mando",
                    tarea: null,
                    texto: recortar(mensajeLimpio, TEXTO_MAX),
                })
                .select("id")
                .single();
            if (error || !data) {
                return Response.json(
                    { error: `No se pudo guardar la nota en el bus: ${error?.message ?? "error desconocido"}` },
                    { status: 500 },
                );
            }
            return Response.json(
                {
                    ok: true,
                    modo: "anotar",
                    id: data.id,
                    mensaje:
                        "Nota guardada en el bus del relevo. El enjambre la verá en su próxima lectura.",
                },
                { headers: { "Cache-Control": "no-store" } },
            );
        } catch (e) {
            const mensajeErr = e instanceof Error ? e.message : String(e);
            return Response.json(
                { error: `No se pudo guardar la nota en el bus: ${mensajeErr.slice(0, 160)}` },
                { status: 500 },
            );
        }
    }

    // ── Modos "preguntar" y "planificar": hablan con el sistema primario ──
    const systemPrompt = modo === "planificar" ? PROMPT_PLANIFICAR : PROMPT_PREGUNTAR;
    const voz = await hablarConElPrimario(mensajeLimpio, systemPrompt);
    if (!voz.ok || voz.texto === undefined) {
        return Response.json(
            { error: voz.error ?? "El sistema primario no respondió." },
            { status: 502 },
        );
    }

    if (modo === "planificar") {
        const propuesta = extraerPropuesta(voz.texto);
        if (!propuesta.length) {
            return Response.json(
                {
                    ok: true,
                    modo: "planificar",
                    propuesta: [],
                    motor: voz.motor,
                    latenciaMs: voz.latenciaMs,
                    reparo:
                        "El modelo no devolvió una propuesta en JSON válido. Reintenta reformulando la petición o concreta más el alcance.",
                },
                { headers: { "Cache-Control": "no-store" } },
            );
        }
        return Response.json(
            {
                ok: true,
                modo: "planificar",
                propuesta,
                motor: voz.motor,
                modelo: voz.modelo,
                latenciaMs: voz.latenciaMs,
                aviso:
                    "Propuesta de tareas (solo sugerencia, no se ha escrito en la cola). Lanzar una ola es una acción tuya desde la terminal.",
            },
            { headers: { "Cache-Control": "no-store" } },
        );
    }

    return Response.json(
        {
            ok: true,
            modo: "preguntar",
            respuesta: voz.texto,
            motor: voz.motor,
            modelo: voz.modelo,
            latenciaMs: voz.latenciaMs,
            tokens: voz.tokens,
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}