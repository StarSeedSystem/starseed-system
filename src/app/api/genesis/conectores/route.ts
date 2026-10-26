/** GET/POST /api/genesis/conectores · API de opciones por ámbito (Ola 1019G · GCA1019Lb ·
 * architecture/genesis-conectores-abiertos.md §3 y §6).
 * GET `?ambito=` → catálogo único filtrado, sugerencias de `src/lib/genesis/conectores/sugerir.ts`
 * y asignaciones del ámbito, SIN claves. POST `{accion:"vincular",proveedor,valor}` guarda en la
 * bóveda cifrada del ámbito y responde SOLO la huella; `{accion:"asignar",clave,cadena}` guarda la
 * asignación de un papel. Sesión obligatoria (o bucle de esta máquina), permiso del ámbito con
 * `guardianMando` («usar-apis»), y límite de 20 peticiones por 10 min como /api/genesis/proponer.
 * La lógica vive en módulos puros con dependencias inyectables; aquí SOLO exportan los manejadores. */
import { rateLimit } from "@/lib/security/rate-limit";
import { guardianMando } from "@/lib/mando/guardian";
import {
  catalogoDelAmbito,
  despacharAccion,
  leerAccionConectores,
} from "@/lib/genesis/conectores/servicio";
import { CONSULTAS_SUPABASE, cuentaConectores } from "@/lib/genesis/conectores/datos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" } as const;
const MAX_CUERPO = 64 * 1024;

type Previo = { ok: true; ambitoId: string } | { ok: false; respuesta: Response };

function respuesta(estado: number, cuerpo: Record<string, unknown>): Response {
  return Response.json(cuerpo, { status: estado, headers: SIN_CACHE });
}

/** Sesión → permiso del ámbito → límite de 20/10 min. Sesión vacía → 401; sin ?ambito → 400. */
async function prepararPedido(peticion: Request, escrito: boolean): Promise<Previo> {
  const cuenta = await cuentaConectores(peticion);
  if (!cuenta) {
    const texto = escrito ? "Inicia sesión para conectar Genesis." : "Inicia sesión para ver las opciones de Genesis.";
    return { ok: false, respuesta: respuesta(401, { error: texto }) };
  }
  const ambitoId = new URL(peticion.url).searchParams.get("ambito");
  if (!ambitoId) return { ok: false, respuesta: respuesta(400, { error: "Falta ?ambito=." }) };
  const puerta = await guardianMando(peticion, { ambito: ambitoId, capacidad: "usar-apis" });
  if (puerta) return { ok: false, respuesta: puerta };
  const limite = rateLimit(`genesis-conectores:${cuenta}`, 20, 10 * 60 * 1000);
  if (!limite.allowed) {
    return {
      ok: false,
      respuesta: respuesta(429, { error: `Has pedido muchas peticiones seguidas. Vuelve a intentarlo en ${limite.retryAfterSec} s.` }),
    };
  }
  return { ok: true, ambitoId };
}

export async function GET(peticion: Request): Promise<Response> {
  const previo = await prepararPedido(peticion, false);
  if (!previo.ok) return previo.respuesta;
  const get = await catalogoDelAmbito(CONSULTAS_SUPABASE, previo.ambitoId);
  return respuesta(get.estado, get.cuerpo);
}

export async function POST(peticion: Request): Promise<Response> {
  const previo = await prepararPedido(peticion, true);
  if (!previo.ok) return previo.respuesta;
  const crudo = await peticion.text().catch(() => "");
  if (!crudo || crudo.length > MAX_CUERPO) return respuesta(400, { error: "Petición vacía o demasiado grande." });
  const leida = leerAccionConectores(crudo);
  if (!leida.ok) return respuesta(leida.estado, { error: leida.error });
  const post = await despacharAccion(CONSULTAS_SUPABASE, previo.ambitoId, leida.accion);
  return respuesta(post.estado, post.cuerpo);
}
