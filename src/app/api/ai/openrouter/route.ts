/**
 * /api/ai/openrouter — PROXY COMPARTIDO de OpenRouter (Adenda 81).
 *
 * Propósito (petición de Alex): que TODOS los usuarios, grupos y contextos del
 * OS tengan acceso por defecto a los modelos GRATUITOS de OpenRouter sin
 * configurar nada, usando UNA clave compartida de la comunidad que vive SOLO
 * en el servidor (variable de entorno `OPENROUTER_SHARED_KEY` — jamás en el
 * repo público ni en el navegador).
 *
 * Seguridad:
 *   · SOLO modelos `:free` (o el enrutador "openrouter/free"): cualquier otro
 *     modelo → 400. La clave compartida no puede gastar dinero de nadie.
 *   · La clave nunca sale del servidor; el cliente llama a ESTA ruta sin
 *     cabecera Authorization.
 *   · Cuerpo limitado (~256 KB) y solo POST.
 *   · Si la variable no está configurada → 503 honesto (el router de Astraura
 *     sigue su cadena de failover con las fuentes sin clave).
 *
 * Los usuarios pueden seguir añadiendo SU clave personal (opcional) en
 * Ajustes → Inteligencia para límites más altos o modelos específicos; esa vía
 * no pasa por aquí (va directa de su navegador a OpenRouter).
 */

import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM = "https://openrouter.ai/api/v1/chat/completions";
const MAX_BODY_BYTES = 256 * 1024;

/** ¿Es un modelo de coste 0 permitido por la clave compartida? */
function isFreeModel(model: unknown): model is string {
  return (
    typeof model === "string" &&
    (model === "openrouter/free" || model.endsWith(":free"))
  );
}

/** Claves compartidas (rotación · Adenda 87): OPENROUTER_SHARED_KEY, _2, _3… */
function sharedKeys(): string[] {
  const keys: string[] = [];
  const base = process.env.OPENROUTER_SHARED_KEY;
  if (base) keys.push(...base.split(",").map((k) => k.trim()).filter(Boolean));
  for (const suf of ["_2", "_3", "_4"]) {
    const k = process.env[`OPENROUTER_SHARED_KEY${suf}`];
    if (k) keys.push(k.trim());
  }
  return keys;
}

/** Índice rotatorio en memoria del proceso (se resetea al redeploy: da igual). */
let keyCursor = 0;

export async function POST(req: NextRequest): Promise<Response> {
  const keys = sharedKeys();
  const key = keys[0];
  if (!key) {
    return Response.json(
      {
        error:
          "El acceso comunitario a OpenRouter no está configurado en este despliegue (falta OPENROUTER_SHARED_KEY). Aurora sigue con las demás fuentes gratis.",
      },
      { status: 503 },
    );
  }

  const raw = await req.text().catch(() => "");
  if (!raw || raw.length > MAX_BODY_BYTES) {
    return Response.json({ error: "Cuerpo vacío o demasiado grande." }, { status: 400 });
  }

  let body: {
    model?: unknown;
    messages?: unknown;
    stream?: unknown;
    temperature?: unknown;
    max_tokens?: unknown;
  };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!isFreeModel(body.model)) {
    return Response.json(
      {
        error:
          "La clave compartida de la comunidad solo permite modelos :free de OpenRouter (coste 0). Para modelos de pago, añade tu clave personal en Ajustes → Inteligencia.",
      },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "Faltan messages." }, { status: 400 });
  }

  // Reenvío saneado: SOLO los campos que conocemos (nada de pasar el body tal
  // cual: evita inyectar parámetros de pago/proveedor no previstos).
  const forward: Record<string, unknown> = {
    model: body.model,
    messages: body.messages,
    stream: body.stream === true,
    temperature: typeof body.temperature === "number" ? body.temperature : 0.7,
  };
  if (typeof body.max_tokens === "number" && body.max_tokens > 0) {
    forward.max_tokens = Math.min(body.max_tokens, 8192);
  }

  // ROTACIÓN (Adenda 87): si una clave agota su cupo diario de :free (429
  // "free-models-per-day"), se prueba la siguiente del anillo — el free tier de
  // OpenRouter es de ~50 peticiones/día POR CLAVE; con N claves, N×50 (y una
  // recarga única de $10 en cualquiera la sube a 1.000/día).
  let upstream: Response | null = null;
  let lastErr = "";
  for (let i = 0; i < Math.max(1, keys.length); i++) {
    const k = keys[(keyCursor + i) % keys.length];
    try {
      const res = await fetch(UPSTREAM, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${k}`,
          "HTTP-Referer": "https://starseed-os.vercel.app",
          "X-Title": "StarSeed OS · Aurora (acceso comunitario :free)",
        },
        body: JSON.stringify(forward),
        // El route handler corre en el servidor: sin CORS que valga aquí.
        signal: AbortSignal.timeout(120_000),
      });
      if (res.status === 429 && i + 1 < keys.length) {
        // Cupo de ESTA clave agotado → rota y reintenta con la siguiente.
        try { await res.text(); } catch { /* drena */ }
        continue;
      }
      keyCursor = (keyCursor + i) % keys.length; // la que respondió queda primera
      upstream = res;
      break;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "error de red";
    }
  }
  if (!upstream) {
    return Response.json(
      { error: `No se pudo alcanzar OpenRouter: ${lastErr || "error de red"}` },
      { status: 502 },
    );
  }

  // Passthrough del cuerpo (streaming SSE incluido) con el status original.
  const headers = new Headers();
  headers.set(
    "Content-Type",
    upstream.headers.get("content-type") || "application/json; charset=utf-8",
  );
  headers.set("Cache-Control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers });
}
