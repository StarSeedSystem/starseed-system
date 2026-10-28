/**
 * /api/genesis/conectores — opciones por ámbito (Ola 1019G · GCA1019L).
 * GET `?ambito=` → catálogo filtrado, sugerencias de `sugerir.ts` y asignaciones
 * del ámbito, SIN claves. POST `vincular` guarda en la bóveda y responde solo la
 * huella; POST `asignar` fija la cadena de un papel. Sesión obligatoria, permiso
 * del ámbito (guardián + `permisos.ts`) y 20 peticiones cada 10 minutos.
 * SOP: architecture/genesis-conectores-abiertos.md §3, §4 y §6.
 */

import { rateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/utils/supabase/server";
import { guardianMando } from "@/lib/mando/guardian";
import {
  asignarClave, cargarOpciones, guardarEnBoveda, permiteUsarApis, type CuentaSesion,
} from "@/lib/genesis/conectores/sugerir-conector";
import { ambitoDeUrl, leerCuerpo, validarCuerpo } from "@/lib/genesis/conectores/vacio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITE = 20;
const VENTANA_MS = 10 * 60 * 1000;

async function sesion(req: Request): Promise<CuentaSesion | null> {
  try {
    const supabase = await createClient();
    let { data } = await supabase.auth.getUser();
    if (!data.user) {
      const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
      if (token) ({ data } = await supabase.auth.getUser(token));
    }
    return data.user ? { id: data.user.id, correo: data.user.email ?? null } : null;
  } catch {
    return null;
  }
}

function vetoDelLimite(cuenta: CuentaSesion): Response | null {
  const l = rateLimit(`genesis-conectores:${cuenta.id}`, LIMITE, VENTANA_MS);
  if (l.allowed) return null;
  return Response.json(
    { error: `Has pedido muchas peticiones seguidas. Vuelve a intentarlo en ${l.retryAfterSec} s.` },
    { status: 429, headers: { "Retry-After": String(l.retryAfterSec) } },
  );
}

/** Sesión → ámbito → permiso del ámbito → límite por cuenta. */
async function puerta(req: Request): Promise<{ cuenta: CuentaSesion; ambito: string } | Response> {
  const cuenta = await sesion(req);
  if (!cuenta) return Response.json({ error: "Inicia sesión para usar Genesis." }, { status: 401 });
  const ambito = ambitoDeUrl(req.url);
  if (!ambito) return Response.json({ error: "Falta ?ambito=" }, { status: 400 });
  const veto = await guardianMando(req, { ambito, capacidad: "usar-apis" });
  if (veto) return veto;
  if (!(await permiteUsarApis(cuenta))) {
    return Response.json({ error: "No tienes permiso para usar las APIs de este ámbito." }, { status: 403 });
  }
  return vetoDelLimite(cuenta) ?? { cuenta, ambito };
}

export async function GET(req: Request): Promise<Response> {
  const abierta = await puerta(req);
  if (abierta instanceof Response) return abierta;
  try {
    const opciones = await cargarOpciones(abierta.ambito);
    return Response.json(
      { ambito: abierta.ambito, ...opciones },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "No se pudo obtener el catálogo." }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const abierta = await puerta(req);
  if (abierta instanceof Response) return abierta;
  const cuerpo = leerCuerpo(await req.text().catch(() => ""));
  if (!cuerpo) {
    return Response.json({ error: "Petición vacía, inválida o demasiado grande." }, { status: 400 });
  }
  const validado = validarCuerpo(cuerpo);
  if ("error" in validado) return Response.json({ error: validado.error }, { status: 400 });

  if (validado.accion === "vincular") {
    const r = await guardarEnBoveda(abierta.ambito, validado.proveedor, validado.valor);
    if (r.error || !r.huella) {
      return Response.json({ error: r.error ?? "No se pudo vincular el proveedor." }, { status: 400 });
    }
    return Response.json(
      { accion: "vincular", proveedor: validado.proveedor, huella: r.huella, ambito: abierta.ambito },
      { status: 201 },
    );
  }

  const r = await asignarClave(abierta.ambito, validado.clave, validado.cadena, abierta.cuenta);
  if (!r.ok) {
    return Response.json({ error: r.error ?? "No se pudo asignar la clave." }, { status: 400 });
  }
  return Response.json({
    accion: "asignar", clave: validado.clave, cadena: validado.cadena, ambito: abierta.ambito, ok: true,
  });
}
