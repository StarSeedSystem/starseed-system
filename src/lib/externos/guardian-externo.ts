// ══════════════════════════════════════════════════════════════
// Guardián de la API externa v1 — Ola 281 · E2 (2026-09-07)
// Autentica peticiones con Bearer `ssk_…`, aplica rate-limit por
// token y da acceso al vínculo resuelto + un cliente Supabase con
// `service_role` (solo servidor; nunca viaja al cliente).
// ══════════════════════════════════════════════════════════════
import type { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolverToken, type Vinculo, type PermisosVinculo } from "@/lib/externos/vinculos";
import { rateLimit } from "@/lib/security/rate-limit";

export type ResultadoPermiso = "leer" | "escribir" | "hablar" | "memoria" | "herramientas";
export type ClavePermiso = keyof PermisosVinculo;

/** Autenticación correcta: vínculo vigente + owner + cliente service_role. */
export interface ExternoAutenticado {
  ok: true;
  vinculo: Vinculo;
  owner: string;
  supabase: SupabaseClient;
}

/** Rechazo con el código HTTP y un mensaje en español (nunca detalla el token). */
export interface ExternoRechazo {
  ok: false;
  status: 401 | 403 | 429;
  error: string;
}

export type ResultadoAutenticar = ExternoAutenticado | ExternoRechazo;

const PREFIJO_TOKEN = "ssk_";
const LIMITE_PETICIONES = 60;
const VENTANA_MS = 10 * 60 * 1000;

/** Extrae el token `ssk_…` de la cabecera Authorization (o null si no es válido). */
export function extraerToken(req: Pick<NextRequest, "headers">): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice("Bearer ".length).trim();
  if (!token.startsWith(PREFIJO_TOKEN)) return null;
  return token;
}

/**
 * Autentica la petición y, si se pasa `permiso`, exige que el vínculo lo tenga.
 * Orden de los rechazos: (1) token ausente/malformado 401, (2) límite de
 * peticiones por token 429, (3) token inválido/caducado 401, (4) permiso
 * ausente 403. El rate-limit cuenta por PREFIJO visible (8 caracteres), nunca
 * por el token completo, para no tocar el hash en cada petición.
 */
export async function autenticarExterno(
  req: NextRequest,
  permiso?: ClavePermiso,
): Promise<ResultadoAutenticar> {
  const token = extraerToken(req);
  if (!token) {
    return { ok: false, status: 401, error: "Falta un token válido (Authorization: Bearer ssk_…)." };
  }
  const prefijo = token.slice(0, PREFIJO_TOKEN.length + 8);
  const rl = rateLimit(`externos:${prefijo}`, LIMITE_PETICIONES, VENTANA_MS);
  if (!rl.allowed) {
    return { ok: false, status: 429, error: `Límite de ${LIMITE_PETICIONES} peticiones por 10 minutos superado.` };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !clave) {
    return { ok: false, status: 401, error: "Servicio externo no configurado en el servidor." };
  }
  const supabase = createClient(url, clave);
  const res = await resolverToken(supabase, token);
  if (!res) {
    return { ok: false, status: 401, error: "Token inválido o caducado." };
  }
  if (permiso && !exigir(res.vinculo, permiso)) {
    return { ok: false, status: 403, error: `Este vínculo no tiene permiso de ${permiso}.` };
  }
  return { ok: true, vinculo: res.vinculo, owner: res.owner, supabase };
}

/** ¿Tiene el vínculo el permiso pedido? (restrictivo: solo booleanos reales). */
export function exigir(vinculo: Vinculo, permiso: ClavePermiso): boolean {
  return vinculo.permisos[permiso] === true;
}