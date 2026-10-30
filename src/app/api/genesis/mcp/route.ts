import { NextRequest, NextResponse } from "next/server";
import { atenderMcp, type HerramientaMcp } from "@/lib/genesis/mcp/protocolo";
import { crearHerramientaVariaciones, type ListarVariaciones } from "@/lib/genesis/mcp/herramienta-variaciones";
import { crearDatosVariaciones, type ClienteVariaciones } from "@/lib/variaciones/datos";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** La capa de datos real de las variaciones, o una que avisa si el cliente no está disponible. */
async function herramientaVariaciones(): Promise<HerramientaMcp> {
  let listar: ListarVariaciones;
  try {
    const datos = crearDatosVariaciones((await createClient()) as unknown as ClienteVariaciones);
    listar = datos.listarVariaciones;
  } catch {
    listar = async () => ({
      disponible: false, variaciones: [], total: 0, pagina: 1, porPagina: 24,
      error: "sin conexión con la base",
    });
  }
  return crearHerramientaVariaciones(listar);
}

async function herramientasDelServidor(): Promise<HerramientaMcp[]> {
  return [...herramientasPredeterminadas(), await herramientaVariaciones()];
}

function herramientasPredeterminadas(): HerramientaMcp[] {
  return [
    {
      nombre: "estado",
      descripcion: "Obtiene el estado del sistema",
      esquema: { type: "object", properties: {} },
      ejecutar: async () => ({
        contenido: [{ tipo: "texto", texto: "ok" }],
      }),
    },
    {
      nombre: "tareas_listar",
      descripcion: "Lista tareas",
      esquema: { type: "object", properties: { limite: { type: "number" } } },
      ejecutar: async (args: Record<string, unknown>) => ({
        contenido: [{ tipo: "texto", texto: `tareas con límite ${args.limite ?? 10}` }],
      }),
    },
  ];
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const method = url.searchParams.get("method");
  const id: string | number = url.searchParams.get("id") || "1";

  let peticion: unknown;

  if (method === "initialize") {
    peticion = { jsonrpc: "2.0", id, method: "initialize" };
  } else if (method === "tools/list") {
    peticion = { jsonrpc: "2.0", id, method: "tools/list" };
  } else if (method === "tools/call") {
    const name = url.searchParams.get("name") || "";
    const argsStr = url.searchParams.get("arguments") || "{}";
    const args: Record<string, unknown> = JSON.parse(argsStr);
    peticion = { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } };
  } else {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32600, message: "Método no especificado" } },
      { status: 400 }
    );
  }

  const contexto = undefined;
  const herramientas = await herramientasDelServidor();
  const respuesta = await atenderMcp(peticion, { herramientas, contexto });

  return NextResponse.json(respuesta);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { method, id, params } = body;

  let peticion: unknown;

  if (method === "initialize") {
    peticion = { jsonrpc: "2.0", id, method: "initialize" };
  } else if (method === "tools/list") {
    peticion = { jsonrpc: "2.0", id, method: "tools/list" };
  } else if (method === "tools/call") {
    peticion = { jsonrpc: "2.0", id, method: "tools/call", params };
  } else {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32600, message: "Método no soportado" } },
      { status: 400 }
    );
  }

  const contexto = undefined;
  const herramientas = await herramientasDelServidor();
  const respuesta = await atenderMcp(peticion, { herramientas, contexto });

  return NextResponse.json(respuesta);
}