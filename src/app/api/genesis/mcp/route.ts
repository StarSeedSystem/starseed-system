import { NextRequest, NextResponse } from "next/server";
import { atenderMcp, type HerramientaMcp } from "@/lib/genesis/mcp/protocolo";
import { variaciones_buscar } from "@/lib/genesis/mcp/herramientas";
import { crearDatosVariaciones, type ClienteVariaciones, type OrdenVariaciones } from "@/lib/variaciones/datos";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    // Tarea Y (variaciones-publicas.md §7): la clave y la capa de datos viajan en el contexto.
    variaciones_buscar,
  ];
}

/** La capa de datos de las variaciones públicas, sobre el cliente de servidor; si falla, sin capa. */
async function contextoConVariaciones(): Promise<{ listarVariaciones?: unknown }> {
  try {
    const datos = crearDatosVariaciones((await createClient()) as unknown as ClienteVariaciones);
    return {
      listarVariaciones: (clave: string, opciones?: { buscar?: string; orden?: OrdenVariaciones }) =>
        datos.listarVariaciones(clave, opciones),
    };
  } catch {
    return {};
  }
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

  const contexto = await contextoConVariaciones();
  const herramientas = herramientasPredeterminadas();
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

  const contexto = await contextoConVariaciones();
  const herramientas = herramientasPredeterminadas();
  const respuesta = await atenderMcp(peticion, { herramientas, contexto });

  return NextResponse.json(respuesta);
}