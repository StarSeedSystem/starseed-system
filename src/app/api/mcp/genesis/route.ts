/**
 * MCP remoto de Genesis por ámbito (tarea S · Ola 1019G · Genesis abierto).
 * POST: JSON-RPC 2.0 con `Authorization: Bearer` (token externo del ámbito) o
 * sesión; resuelve el ámbito, filtra `tools/list` por permisos y alcance,
 * registra cada llamada en `genesis_llamadas` sin datos sensibles y aplica el
 * límite de uso del token. GET: 405. La lógica pura vive en
 * src/lib/genesis/mcp/ruta.ts, probada con dependencias falsas.
 * Contrato: architecture/genesis-conectores-abiertos.md §7.
 */
import { CAPACIDADES_AMBITO } from "@/lib/mando/ambito";
import { HERRAMIENTAS_MCP } from "@/lib/genesis/mcp/herramientas";
import { crearAlmacenMemoria } from "@/lib/genesis/mcp/tokens-externos";
import {
  atenderMcpConPermisos,
  extraerBearer,
  recurso405,
  type RegistroLlamada,
  type SesionResuelta,
} from "@/lib/genesis/mcp/ruta";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENDPOINT = "/api/mcp/genesis";
const MAX_CUERPO = 64 * 1024;
const SIN_CACHE = { "Cache-Control": "no-store" } as const;

// Tokens externos en memoria de este proceso: el almacén de tokens-externos.ts
// guarda SOLO la huella, nunca el valor ni se lo devuelve a nadie.
const ALMACEN = crearAlmacenMemoria();

export async function GET(): Promise<Response> {
  return Response.json(recurso405(), { status: 405, headers: SIN_CACHE });
}

export async function POST(req: Request): Promise<Response> {
  let cuerpo: unknown = null;
  try {
    const texto = await req.text();
    if (texto.length > MAX_CUERPO) {
      return Response.json({ error: "El cuerpo pesa demasiado." }, { status: 413, headers: SIN_CACHE });
    }
    cuerpo = JSON.parse(texto);
  } catch {
    cuerpo = null;
  }
  const { sesion, registrar } = await abrirSesion();
  const resultado = await atenderMcpConPermisos(
    cuerpo,
    HERRAMIENTAS_MCP,
    { almacen: ALMACEN, reloj: () => Date.now(), registrar },
    extraerBearer(req.headers.get("authorization")),
    sesion,
    ENDPOINT,
  );
  return Response.json(resultado.salida, { status: resultado.status, headers: SIN_CACHE });
}

/**
 * Resuelve la sesión del navegador con el cliente de servidor y prepara la
 * escritura del registro en `genesis_llamadas`: método y estado, nunca el
 * cuerpo ni el token. La insert es mejor esfuerzo (RLS o una tabla sin
 * aplicar devuelven false, y la llamada no falla por eso).
 */
async function abrirSesion(): Promise<{
  sesion: SesionResuelta | null;
  registrar: (llamada: RegistroLlamada) => Promise<boolean>;
}> {
  let supabase: Awaited<ReturnType<typeof createClient>> | null = null;
  try {
    supabase = await createClient();
  } catch {
    supabase = null;
  }
  let creador: string | null = null;
  let sesion: SesionResuelta | null = null;
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      creador = data.user.id;
      // Sesión = el Genesis propio de la cuenta: el usuario es dueño y su
      // alcance son las 12 capacidades del ámbito.
      sesion = { ambito: `cuenta:${data.user.id}`, alcance: [...CAPACIDADES_AMBITO], creador: data.user.id };
    }
  }
  const registrar = async (llamada: RegistroLlamada): Promise<boolean> => {
    if (!supabase) return false;
    try {
      const { error } = await supabase.from("genesis_llamadas").insert({
        ambito_id: llamada.ambito,
        tipo: llamada.tipo.slice(0, 50),
        endpoint: llamada.endpoint,
        metodo: llamada.metodo,
        status_code: llamada.statusCode,
        creado_por: creador,
      });
      return !error;
    } catch {
      return false;
    }
  };
  return { sesion, registrar };
}
