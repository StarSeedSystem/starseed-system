/**
 * /api/laboratorio/ejecutar — BANCO DE PRUEBAS del laboratorio de Astraura.
 *
 * Ejecuta UN prompt de prueba contra un motor de IA, para medir una versión
 * del genoma SIN tocar nada del OS en marcha:
 *   · Los parámetros del genoma (temperatura, contexto, cuantización, semilla)
 *     llegan explícitos en el cuerpo; aquí SOLO se traducen a opciones de la
 *     llamada (temperatura, system) y jamás se escriben en la configuración
 *     viva del OS ni en Supabase.
 *   · Enrutamiento «gratis primero»: primero el sistema primario Astraura
 *     1.58-bit (nube, vía `destinoNube` del Ola 228) y, si no responde, las
 *     fuentes gratuitas del catálogo con clave SOLO de servidor
 *     (`NVIDIA_SHARED_KEY`, mismo anillo que /api/ai/nvidia).
 *
 * Seguridad:
 *   · Sesión obligatoria + rate-limit por usuario (mismo patrón que
 *     /api/ai/nvidia: relé abusable por anónimos).
 *   · Prompt saneado, ≤ 4000 caracteres, cuerpo ≤ 16 KB.
 *   · Nunca expone claves ni rutas del disco: los errores internos se
 *     devuelven genéricos.
 */

import { NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { destinoNube } from "@/lib/astraura/destino-nube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PROMPT = 4000;
const MAX_BODY_BYTES = 16 * 1024;
const MODELO_NIM_DEFECTO = "moonshotai/kimi-k3";

export interface ParametrosEjecucion {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  /** Parámetros del genoma: solo se informan al motor, nunca se escriben. */
  contextoTokens?: number;
  cuantizacionBits?: number;
  semilla?: number;
}

interface RespuestaEjecucion {
  salida: string;
  latenciaMs: number;
  motor: string;
  tokens?: number;
}

function limiteNum(v: unknown, min: number, max: number): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.min(max, Math.max(min, v));
}

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

function clavesNvidia(): string[] {
  const keys: string[] = [];
  const base = process.env.NVIDIA_SHARED_KEY;
  if (base) keys.push(...base.split(",").map((k) => k.trim()).filter(Boolean));
  for (const suf of ["_2", "_3", "_4"]) {
    const k = process.env[`NVIDIA_SHARED_KEY${suf}`];
    if (k) keys.push(k.trim());
  }
  return keys;
}

function extraerTexto158(json: Record<string, unknown>): string {
  const v = json.response ?? json.full_text ?? json.text;
  return typeof v === "string" ? v : "";
}

/** Sistema primario: Astraura 1.58-bit en la nube (destino resistente con sonda). */
async function ejecutarEnAstraura158(prompt: string, p: ParametrosEjecucion): Promise<RespuestaEjecucion | null> {
  const destino = await destinoNube();
  if (!destino) return null;
  const t0 = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch(`${destino.base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        prompt,
        system_prompt: p.systemPrompt,
        preferences: {
          laboratory: true,
          temperature: p.temperature,
          max_tokens: p.maxTokens,
          seed: p.semilla,
        },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const salida = json ? extraerTexto158(json) : "";
    if (!salida.trim()) return null;
    return {
      salida,
      latenciaMs: Date.now() - t0,
      motor: "astraura-158-bit (nube)",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Reserva: NVIDIA NIM comunitario (clave SOLO servidor, rotación del anillo). */
async function ejecutarEnNvidia(prompt: string, p: ParametrosEjecucion): Promise<RespuestaEjecucion | null> {
  const keys = clavesNvidia();
  if (keys.length === 0) return null;
  const t0 = Date.now();
  const messages: Array<{ role: string; content: string }> = [];
  if (p.systemPrompt) messages.push({ role: "system", content: p.systemPrompt });
  messages.push({ role: "user", content: prompt });
  for (const key of keys) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 90_000);
    try {
      const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: MODELO_NIM_DEFECTO,
          messages,
          temperature: p.temperature ?? 0.7,
          max_tokens: p.maxTokens ?? 512,
          stream: false,
        }),
        signal: ctrl.signal,
      });
      // 429/402 de esta clave → siguiente del anillo sin insistir.
      if (res.status === 429 || res.status === 402) {
        try { await res.text(); } catch { /* drena */ }
        continue;
      }
      if (!res.ok) return null;
      const json = (await res.json().catch(() => null)) as {
        choices?: Array<{ message?: { content?: unknown } }>;
        usage?: { total_tokens?: unknown };
      } | null;
      const contenido = json?.choices?.[0]?.message?.content;
      const salida = typeof contenido === "string" ? contenido : "";
      if (!salida.trim()) return null;
      const tokens = typeof json?.usage?.total_tokens === "number" ? json.usage.total_tokens : undefined;
      return {
        salida,
        latenciaMs: Date.now() - t0,
        motor: `nvidia-nim:${MODELO_NIM_DEFECTO}`,
        tokens,
      };
    } catch {
      continue;
    } finally {
      clearTimeout(t);
    }
  }
  return null;
}

const PATRON = /^[\s\S]+$/;

export async function POST(req: NextRequest): Promise<Response> {
  const userId = await requireUser();
  if (!userId) {
    return Response.json({ error: "Necesitas iniciar sesión para usar el banco de pruebas." }, { status: 401 });
  }
  const rl = rateLimit(`lab-ejecutar:${userId}`, 30, 10 * 60 * 1000);
  if (!rl.allowed) {
    return Response.json(
      { error: "Demasiadas ejecuciones de prueba. Inténtalo más tarde." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const raw = await req.text().catch(() => "");
  if (!raw || raw.length > MAX_BODY_BYTES) {
    return Response.json({ error: "Cuerpo vacío o demasiado grande." }, { status: 400 });
  }
  let body: { prompt?: unknown; parametros?: Record<string, unknown> };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (typeof body.prompt !== "string" || !body.prompt.trim() || !PATRON.test(body.prompt)) {
    return Response.json({ error: "Falta el prompt de prueba." }, { status: 400 });
  }
  const prompt = body.prompt.trim();
  if (prompt.length > MAX_PROMPT) {
    return Response.json({ error: `El prompt supera los ${MAX_PROMPT} caracteres.` }, { status: 400 });
  }

  const pr = body.parametros ?? {};
  const parametros: ParametrosEjecucion = {
    temperature: limiteNum(pr.temperature, 0, 1),
    maxTokens: limiteNum(pr.maxTokens, 16, 2048),
    systemPrompt:
      typeof pr.systemPrompt === "string" && pr.systemPrompt.trim()
        ? pr.systemPrompt.trim().slice(0, 1000)
        : undefined,
    contextoTokens: limiteNum(pr.contextoTokens, 512, 1_048_576),
    cuantizacionBits: limiteNum(pr.cuantizacionBits, 1, 16),
    semilla: limiteNum(pr.semilla, 0, 2 ** 31 - 1),
  };

  const resultado =
    (await ejecutarEnAstraura158(prompt, parametros)) ??
    (await ejecutarEnNvidia(prompt, parametros));

  if (!resultado) {
    return Response.json(
      { error: "Ningún motor de prueba respondió (ni el sistema primario 1.58-bit ni las fuentes gratuitas)." },
      { status: 503 },
    );
  }
  return Response.json(resultado, { headers: { "Cache-Control": "no-store" } });
}
