/**
 * /api/ai/nvidia — PROXY COMPARTIDO de NVIDIA NIM (Adenda 219).
 *
 * Mismo principio que /api/ai/openrouter (Adenda 81): una clave gratuita de la
 * comunidad (`NVIDIA_SHARED_KEY`, con rotación `_2`, `_3`, `_4`) vive SOLO en el
 * servidor y da a todos los usuarios del OS acceso a los 80+ modelos abiertos
 * de build.nvidia.com sin configurar nada. La clave jamás toca el navegador.
 *
 * Seguridad y economía de créditos:
 *   · Exige sesión (relé abusable por anónimos) y rate-limit por usuario.
 *   · Cuerpo saneado (solo model/messages/stream/temperature/max_tokens) y
 *     limitado (~256 KB); max_tokens tope 8192.
 *   · 429/402 de una clave → rota a la siguiente del anillo; si todas están
 *     agotadas devuelve el status real y el router de Astraura RELEVA la tarea
 *     a otra fuente gratis (ningún modelo debe agotar sus créditos).
 *   · Sin variable configurada → 503 honesto (la cadena sigue sin esta fuente).
 *   · GET → lista de modelos (para el catálogo/ajustes), sin exponer la clave.
 */

import { NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM = "https://integrate.api.nvidia.com/v1";
const MAX_BODY_BYTES = 256 * 1024;

function sharedKeys(): string[] {
  const keys: string[] = [];
  const base = process.env.NVIDIA_SHARED_KEY;
  if (base) keys.push(...base.split(",").map((k) => k.trim()).filter(Boolean));
  for (const suf of ["_2", "_3", "_4"]) {
    const k = process.env[`NVIDIA_SHARED_KEY${suf}`];
    if (k) keys.push(k.trim());
  }
  return keys;
}

let keyCursor = 0;

async function requireUser(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

export async function GET(): Promise<Response> {
  const userId = await requireUser();
  if (!userId) return Response.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
  const key = sharedKeys()[0];
  if (!key) return Response.json({ error: "NVIDIA comunitario no configurado (NVIDIA_SHARED_KEY)." }, { status: 503 });
  const res = await fetch(`${UPSTREAM}/models`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!res) return Response.json({ error: "No se pudo alcanzar NVIDIA." }, { status: 502 });
  const json = await res.json().catch(() => ({}));
  return Response.json(json, { status: res.status, headers: { "Cache-Control": "private, max-age=600" } });
}

export async function POST(req: NextRequest): Promise<Response> {
  const userId = await requireUser();
  if (!userId) {
    return Response.json(
      { error: "Necesitas iniciar sesión para usar el acceso comunitario a NVIDIA." },
      { status: 401 },
    );
  }
  const rl = rateLimit(`ai-nvidia:${userId}`, 40, 10 * 60 * 1000);
  if (!rl.allowed) {
    return Response.json(
      { error: "Demasiadas solicitudes. Inténtalo más tarde." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const keys = sharedKeys();
  if (!keys[0]) {
    return Response.json(
      { error: "El acceso comunitario a NVIDIA no está configurado en este despliegue (falta NVIDIA_SHARED_KEY). Aurora sigue con las demás fuentes gratis." },
      { status: 503 },
    );
  }

  const raw = await req.text().catch(() => "");
  if (!raw || raw.length > MAX_BODY_BYTES) {
    return Response.json({ error: "Cuerpo vacío o demasiado grande." }, { status: 400 });
  }
  let body: { model?: unknown; messages?: unknown; stream?: unknown; temperature?: unknown; max_tokens?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (typeof body.model !== "string" || !/^[a-z0-9._\-]+\/[a-z0-9._\-]+$/i.test(body.model)) {
    return Response.json({ error: "Modelo no válido (formato org/modelo de build.nvidia.com)." }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "Faltan messages." }, { status: 400 });
  }

  const forward: Record<string, unknown> = {
    model: body.model,
    messages: body.messages,
    stream: body.stream === true,
    temperature: typeof body.temperature === "number" ? body.temperature : 0.7,
  };
  if (typeof body.max_tokens === "number" && body.max_tokens > 0) {
    forward.max_tokens = Math.min(body.max_tokens, 8192);
  }

  let upstream: Response | null = null;
  let lastErr = "";
  for (let i = 0; i < Math.max(1, keys.length); i++) {
    const k = keys[(keyCursor + i) % keys.length];
    try {
      const res = await fetch(`${UPSTREAM}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${k}` },
        body: JSON.stringify(forward),
        signal: AbortSignal.timeout(120_000),
      });
      if ((res.status === 429 || res.status === 402) && i + 1 < keys.length) {
        try { await res.text(); } catch { /* drena */ }
        continue; // créditos/límite de ESTA clave agotados → siguiente del anillo
      }
      keyCursor = (keyCursor + i) % keys.length;
      upstream = res;
      break;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "error de red";
    }
  }
  if (!upstream) {
    return Response.json({ error: `No se pudo alcanzar NVIDIA: ${lastErr || "error de red"}` }, { status: 502 });
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers });
}
