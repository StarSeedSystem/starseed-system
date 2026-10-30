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
  const acceso = await abrirSesion();
  const { sesion, registrar } = acceso;
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
 * Resuelve la sesión del navegador con el cliente de servidor y deja
 * preparada la escritura del registro en `genesis_llamadas`. Sin sesión,
 * el registro queda igualmente disponible para llamadas con token (mejor
 * esfuerzo: la insert puede chocar con RLS y devuelve false, sin fallar).
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
  const registrar = async (llamada: RegistroLlamada): Promise<boolean> => {
    if (!supabase) return false;
    try {
      const { error } = await supabase.from("genesis_llamadas").insert({
        ambito_id: llamada.ambito,
        tipo: llamada.tipo.slice(0, 50),
        endpoint: llamada.endpoint,
        metodo: llamada.metodo,
        status_code: llamada.statusCode,
      });
      return !error;
    } catch {
      return false;
    }
  };
  let sesion: SesionResuelta | null = null;
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    const usuario = data?.user;
    if (usuario) {
      sesion = { ambito: `cuenta:${usuario.id}`, alcance: [...CAPACIDADES_AMBITO], creador: usuario.id };
      const { error } = await supabase
        .from("genesis_llamadas")
        .insert({ metodo: "ping" } as never); // sondeo best-effort, siempre silencioso
      void error;
      const registradorBase = registrar;
      const registrarConCreador = async (llamada: RegistroLlamada): Promise<boolean> =>
        regirConCreador(registradorBase, llamada, sesion!.creador);
      return { sesion, registrar: registrarConCreador };
    }
  }
  return { sesion, registrar };
}

function regirConCreador(
  base: (llamada: RegistroLlamada) => Promise<boolean>,
  llamada: RegistroLlamada,
  creador: string,
): Promise<boolean> {
  return base({ ...llamada, creador });
}
