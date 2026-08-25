/**
 * /api/avatar-search — BÚSQUEDA DE AVATARES EN LÍNEA, por el SERVIDOR.
 *
 * Propósito (Alex, encargo de esta ola): «deben poder buscar avatars en
 * linea automaticamente cuando quieran o generar los suyos». La generación
 * procedural (`derivarAdn`) ya existía y no toca red — esta ruta es la otra
 * mitad: buscar un avatar YA HECHO por ahí, sin que la clave del proveedor
 * salga jamás del servidor. Mismo idioma que `/api/ai/openrouter`: sesión
 * exigida, rate-limit por usuario, 503 honesto si falta configurar, y
 * reenvío saneado (nunca el `fetch` del navegador contra el proveedor).
 *
 * PROVEEDOR ELEGIDO: Openverse (api.openverse.org), el motor de búsqueda de
 * Creative Commons / dominio público que mantiene la fundación
 * WordPress/Creative Commons. Se eligió sobre Pexels/Unsplash/Pixabay por
 * un motivo concreto y verificable: Openverse devuelve licencia (`license`,
 * `license_version`, `license_url`) y atribución YA REDACTADA **por
 * resultado individual** — exactamente lo que pide `FuenteAvatar` y
 * exactamente lo que exige Alex ("cada candidato viaja con su licencia").
 * Pexels/Unsplash/Pixabay, en cambio, tienen UNA licencia de plataforma
 * para todo su catálogo (útil, pero no lo que este contrato modela: un
 * campo `licencia` POR CANDIDATO). Queda como extensión futura documentada,
 * no implementada: `candidatoDesdeOpenverse` en `avatar-busqueda-logica.ts`
 * es deliberadamente el único punto que sabe leer la forma de UN proveedor;
 * sumar otro es añadir un `candidatoDesdeXxx` hermano y mezclar listas, sin
 * tocar el resto.
 *
 * CREDENCIALES: `OPENVERSE_CLIENT_ID` / `OPENVERSE_CLIENT_SECRET` — un
 * cliente OAuth2 gratuito y de autoservicio (sin aprobación manual, sin
 * tarjeta) que se registra en https://api.openverse.org/v1/auth_tokens/register/
 * y sube del límite anónimo al nivel "standard" solo por autenticarse. NO
 * hay una ruta anónima de repliegue a propósito: la cuota de Openverse
 * (anónima o autenticada) es COMPARTIDA por todo este despliegue del OS —
 * dejar caer a modo anónimo sin que nadie lo decidiera degradaría la cuota
 * de TODOS los seres en silencio. Sin credenciales configuradas, esta ruta
 * dice 503 con la verdad por delante; la generación procedural (que no pasa
 * por aquí) sigue funcionando siempre.
 *
 * SEGURIDAD:
 *   · Host de destino FIJO (api.openverse.org) — no hay parámetro de host
 *     controlado por quien llama, así que no hay superficie de SSRF (a
 *     diferencia de una URL arbitraria; nada que resolver ni fijar por IP).
 *   · Sesión exigida + rate-limit por usuario: la credencial es compartida
 *     por TODO el despliegue, igual que `OPENROUTER_SHARED_KEY` — abusable
 *     por anónimos si no se exige sesión.
 *   · El token de acceso (Bearer) se cachea EN MEMORIA del proceso y se
 *     invalida si el proveedor lo rechaza (401) — nunca se pide uno nuevo
 *     en cada búsqueda.
 *   · `license_type=commercial,modification` en la propia consulta al
 *     proveedor (primera barrera) + `filtrarCandidatosLibres` sobre la
 *     respuesta ya mapeada (segunda barrera, en `avatar-busqueda-logica.ts`,
 *     compartida con el navegador) — belt & suspenders: si Openverse
 *     cambiara de comportamiento, la segunda barrera sigue en pie.
 *
 * CSP: no hace falta tocarla. `img-src` ya es `'self' data: blob: https:`
 * (ver `next.config.ts`, ancho a propósito para avatares/imágenes ya hoy) y
 * el componente que pinta la imagen (`avatar-con-fuente.tsx`) usa un
 * `<img>` normal, NO `next/image` — `next/image` exigiría registrar cada
 * host de origen en `images.remotePatterns`, que hoy solo lista
 * `placehold.co` y `**.supabase.co` y no es mío tocar. Como esta ruta usa
 * la `thumbnail` de Openverse (un único host, `api.openverse.org`) en vez
 * del `url` original (que varía por proveedor subyacente — Flickr,
 * Wikimedia…), el CSP `img-src https:` de hoy ya cubre lo que se sirve de
 * verdad, tanto en report-only como el día que pase a exigir de verdad.
 */

import { NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";
import {
  candidatoDesdeOpenverse,
  filtrarCandidatosLibres,
  type CandidatoCrudoProveedor,
} from "@/components/astraura/genesis/avatar/avatar-busqueda-logica";
import type { FuenteAvatar } from "@/lib/astraura/genesis-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENVERSE_TOKEN_URL = "https://api.openverse.org/v1/auth_tokens/token/";
const OPENVERSE_SEARCH_URL = "https://api.openverse.org/v1/images/";
const TIMEOUT_MS = 10_000;
const MAX_CONSULTA_CHARS = 200;
const MAX_BODY_BYTES = 4_000;
const PAGE_SIZE = 20;

/** Token Bearer cacheado EN MEMORIA del proceso (se resetea al redeploy: da
 *  igual, se pide otro). Evita un round-trip de autenticación extra en cada
 *  búsqueda — el mismo espíritu que el `keyCursor` de `/api/ai/openrouter`,
 *  adaptado a un flujo OAuth2 de credenciales de cliente en vez de una
 *  clave estática. */
let tokenCache: { token: string; expiraEn: number } | null = null;

/** Pide (o reutiliza) un token de acceso. `null` si el proveedor no
 *  responde o rechaza las credenciales — nunca lanza. */
async function obtenerTokenOpenverse(clientId: string, clientSecret: string): Promise<string | null> {
  const ahora = Date.now();
  if (tokenCache && tokenCache.expiraEn > ahora) return tokenCache.token;

  try {
    const res = await fetch(OPENVERSE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      }).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
    if (!data || typeof data.access_token !== "string" || !data.access_token) return null;

    const ttlSegundos = typeof data.expires_in === "number" && data.expires_in > 0 ? data.expires_in : 43_200;
    // Margen de 60s antes de la caducidad real, para no usar un token que expira a mitad de la petición siguiente.
    tokenCache = { token: data.access_token, expiraEn: ahora + Math.max(30_000, ttlSegundos * 1000 - 60_000) };
    return tokenCache.token;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  // ── SEGURIDAD: sesión exigida ANTES de gastar cuota compartida ─────────
  let userId: string;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return Response.json(
        { ok: false, candidatos: [], error: "Necesitas iniciar sesión para buscar avatares en línea." },
        { status: 401 },
      );
    }
    userId = data.user.id;
  } catch {
    return Response.json({ ok: false, candidatos: [], error: "No se pudo verificar la sesión." }, { status: 401 });
  }

  // Rate-limit por usuario: la búsqueda es más barata que un LLM, pero la
  // cuota de Openverse la comparte TODO el despliegue — 20 cada 10 min es
  // margen de sobra para "buscar, mirar candidatos, afinar la consulta"
  // sin dejar que una pestaña en bucle agote la cuota de los demás seres.
  const rl = rateLimit(`avatar-search:${userId}`, 20, 10 * 60 * 1000);
  if (!rl.allowed) {
    return Response.json(
      { ok: false, candidatos: [], error: "Demasiadas búsquedas de avatar seguidas. Prueba de nuevo en unos minutos." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  // ── CONFIGURACIÓN: 503 honesto, nunca resultados inventados ────────────
  const clientId = process.env.OPENVERSE_CLIENT_ID;
  const clientSecret = process.env.OPENVERSE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return Response.json(
      {
        ok: false,
        candidatos: [],
        error:
          "La búsqueda de avatares en línea no está configurada en este despliegue (faltan OPENVERSE_CLIENT_ID / OPENVERSE_CLIENT_SECRET). El cuerpo procedural del ser sigue funcionando siempre, sin red.",
      },
      { status: 503 },
    );
  }

  // ── ENTRADA ──────────────────────────────────────────────────────────
  const raw = await req.text().catch(() => "");
  if (!raw || raw.length > MAX_BODY_BYTES) {
    return Response.json({ ok: false, candidatos: [], error: "Cuerpo vacío o demasiado grande." }, { status: 400 });
  }
  let body: { consulta?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return Response.json({ ok: false, candidatos: [], error: "JSON inválido." }, { status: 400 });
  }
  const consulta = typeof body.consulta === "string" ? body.consulta.trim().slice(0, MAX_CONSULTA_CHARS) : "";
  if (!consulta) {
    return Response.json({ ok: false, candidatos: [], error: "Falta `consulta`." }, { status: 400 });
  }

  // ── PROVEEDOR ────────────────────────────────────────────────────────
  const token = await obtenerTokenOpenverse(clientId, clientSecret);
  if (!token) {
    return Response.json(
      {
        ok: false,
        candidatos: [],
        error: "No se pudo autenticar con el proveedor de imágenes (Openverse). Inténtalo más tarde; el cuerpo procedural sigue disponible.",
      },
      { status: 502 },
    );
  }

  const params = new URLSearchParams({
    q: consulta,
    page_size: String(PAGE_SIZE),
    // Solo licencias que permiten uso comercial Y obra derivada — nunca "nc" (no comercial) ni "nd" (sin derivados).
    license_type: "commercial,modification",
    mature: "false",
  });

  let upstream: Response;
  try {
    upstream = await fetch(`${OPENVERSE_SEARCH_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return Response.json(
      { ok: false, candidatos: [], error: `No se pudo alcanzar Openverse: ${e instanceof Error ? e.message : "error de red"}.` },
      { status: 502 },
    );
  }

  if (upstream.status === 401) {
    tokenCache = null; // el proveedor rechazó el token (revocado o caducado a destiempo): se invalida para el próximo intento.
    return Response.json(
      { ok: false, candidatos: [], error: "El proveedor rechazó las credenciales configuradas." },
      { status: 502 },
    );
  }
  if (upstream.status === 429) {
    return Response.json(
      { ok: false, candidatos: [], error: "El proveedor de imágenes está saturado ahora mismo. Prueba de nuevo en un rato." },
      { status: 502 },
    );
  }
  if (!upstream.ok) {
    return Response.json({ ok: false, candidatos: [], error: `Openverse respondió ${upstream.status}.` }, { status: 502 });
  }

  let data: { results?: unknown } | null;
  try {
    data = (await upstream.json()) as { results?: unknown };
  } catch {
    return Response.json({ ok: false, candidatos: [], error: "Respuesta de Openverse ilegible." }, { status: 502 });
  }

  const resultadosCrudos = Array.isArray(data?.results) ? (data!.results as CandidatoCrudoProveedor[]) : [];
  const mapeados = resultadosCrudos
    .map((r) => candidatoDesdeOpenverse(r, consulta))
    .filter((c): c is FuenteAvatar => c !== null);
  // Segunda barrera (redundante a propósito, ver cabecera del fichero) — la
  // MISMA función que usará el navegador si alguna vez recompone una lista.
  const candidatos = filtrarCandidatosLibres(mapeados);

  return Response.json({ ok: true, candidatos }, { headers: { "Cache-Control": "no-store" } });
}
