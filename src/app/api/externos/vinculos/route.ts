/**
 * /api/externos/vinculos — gestión de vínculos externos (tokens `ssk_…`).
 *
 * Ola 281 · E1B (2026-09-08). El token completo solo se devuelve EN CLARO una
 * única vez al crearlo; aquí jamás se lee ni se devuelve un `token_hash`.
 *
 *   · GET  → vínculos del usuario SIN el token (prefijo, ámbito, permisos,
 *            caducidad, último uso y usos).
 *   · POST `{accion}` → "crear" (devuelve el token una sola vez y avisa de que
 *            no se volverá a mostrar), "revocar" (id) y "renovar" (id, caducaEn).
 */

import { NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  crearVinculo,
  validarPermisos,
  type AmbitoTipo,
  type Vinculo,
} from "@/lib/externos/vinculos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Columna de ámbito que sí se expone (nunca `token_hash`). */
type VinculoSinHash = Vinculo;

/**
 * Puerta de sesión: exige un usuario autenticado. Devuelve el `userId` o, si
 * no hay sesión, la `Response` 401 lista para devolverse.
 */
async function requireUser(): Promise<{ userId: string; supabase: Awaited<ReturnType<typeof createClient>> } | Response> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return Response.json(
        { error: "Necesitas iniciar sesión para gestionar vínculos externos." },
        { status: 401 },
      );
    }
    return { userId: data.user.id, supabase };
  } catch {
    return Response.json({ error: "No se pudo verificar la sesión." }, { status: 401 });
  }
}

/** Convierte una fila sin `token_hash` en el `Vinculo` que se expone. */
function aVinculoPublico(fila: Record<string, unknown>): Vinculo {
  return {
    id: String(fila.id),
    owner: String(fila.owner),
    ambito_tipo: fila.ambito_tipo as AmbitoTipo,
    ambito_id: String(fila.ambito_id ?? ""),
    nombre: String(fila.nombre ?? ""),
    prefijo: String(fila.prefijo ?? ""),
    permisos: validarPermisos(fila.permisos),
    expira_en: fila.expira_en ? String(fila.expira_en) : null,
    ultimo_uso: fila.ultimo_uso ? String(fila.ultimo_uso) : null,
    usos: Number(fila.usos ?? 0),
    creado_en: String(fila.creado_en),
    revocado_en: fila.revocado_en ? String(fila.revocado_en) : null,
    origen: String(fila.origen ?? "os"),
  };
}

/** Lee `caducaEn` (días) del cuerpo: entero positivo → número, si no null. */
function diasCaducidad(bruto: unknown): number | null {
  const n = Number(bruto);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** GET: vínculos del usuario, SIN `token_hash` (nunca se expone). */
export async function GET(req: NextRequest): Promise<Response> {
  const autenticado = await requireUser();
  if (autenticado instanceof Response) return autenticado;
  const { userId, supabase } = autenticado;

  const { data, error } = await supabase
    .from("os_vinculos_externos")
    .select("id,owner,ambito_tipo,ambito_id,nombre,prefijo,permisos,expira_en,ultimo_uso,usos,creado_en,revocado_en,origen")
    .eq("owner", userId)
    .order("creado_en", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  const vinculos = (data ?? []).map(aVinculoPublico);
  return Response.json({ vinculos });
}

/** POST: crear (token una sola vez), revocar o renovar caducidad. */
export async function POST(req: NextRequest): Promise<Response> {
  const autenticado = await requireUser();
  if (autenticado instanceof Response) return autenticado;
  const { userId, supabase } = autenticado;

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const accion = typeof cuerpo.accion === "string" ? cuerpo.accion : "";
  if (!accion) return Response.json({ error: "Falta la acción." }, { status: 400 });

  if (accion === "crear") {
    return crearHandler(supabase, userId, cuerpo);
  }
  if (accion === "revocar") {
    return revocarHandler(supabase, userId, cuerpo);
  }
  if (accion === "renovar") {
    return renovarHandler(supabase, userId, cuerpo);
  }
  return Response.json({ error: "Acción no reconocida." }, { status: 400 });
}

/** Crea un vínculo y devuelve el token EN CLARO una única vez. */
async function crearHandler(
  supabase: Awaited<ReturnType<typeof createClient>>,
  owner: string,
  cuerpo: Record<string, unknown>,
): Promise<Response> {
  const ambitoTipo = typeof cuerpo.ambitoTipo === "string" ? cuerpo.ambitoTipo : "";
  const ambitoId = typeof cuerpo.ambitoId === "string" ? cuerpo.ambitoId : undefined;
  const nombre = typeof cuerpo.nombre === "string" ? cuerpo.nombre : "";
  try {
    const { vinculo, token } = await crearVinculo(supabase, owner, {
      ambito_tipo: ambitoTipo as AmbitoTipo,
      ambito_id: ambitoId,
      nombre,
      permisos: cuerpo.permisos,
      caducaEnDias: diasCaducidad(cuerpo.caducaEn),
    });
    return Response.json({
      vinculo,
      token,
      aviso: "El token solo se muestra esta única vez: cópialo ahora, no se podrá volver a leer.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo crear el vínculo.";
    return Response.json({ error: msg }, { status: 400 });
  }
}

/** Marca el vínculo como revocado (RLS ya limita a los del dueño). */
async function revocarHandler(
  supabase: Awaited<ReturnType<typeof createClient>>,
  owner: string,
  cuerpo: Record<string, unknown>,
): Promise<Response> {
  const id = typeof cuerpo.id === "string" ? cuerpo.id : "";
  if (!id) return Response.json({ error: "Falta el id." }, { status: 400 });
  const { error } = await supabase
    .from("os_vinculos_externos")
    .update({ revocado_en: new Date().toISOString() })
    .eq("id", id)
    .eq("owner", owner);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

/** Renueva la caducidad del vínculo (null borra la caducidad). */
async function renovarHandler(
  supabase: Awaited<ReturnType<typeof createClient>>,
  owner: string,
  cuerpo: Record<string, unknown>,
): Promise<Response> {
  const id = typeof cuerpo.id === "string" ? cuerpo.id : "";
  if (!id) return Response.json({ error: "Falta el id." }, { status: 400 });
  const dias = diasCaducidad(cuerpo.caducaEn);
  const expira_en = dias !== null
    ? new Date(Date.now() + dias * 86_400_000).toISOString()
    : null;
  const { error } = await supabase
    .from("os_vinculos_externos")
    .update({ expira_en })
    .eq("id", id)
    .eq("owner", owner);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}