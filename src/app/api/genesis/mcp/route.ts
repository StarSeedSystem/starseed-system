import { NextRequest, NextResponse } from "next/server";
import { atenderMcp } from "@/lib/genesis/mcp/protocolo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const method = url.searchParams.get("method");
  const id = url.searchParams.get("id") || "1";
  const params = url.searchParams.get("params")
    ? JSON.parse(url.searchParams.get("params") || "{}")
    : undefined;

  let peticion: any;

  if (method === "initialize") {
    peticion = { jsonrpc: "2.0", id: id, method: "initialize" };
  } else if (method === "tools/list") {
    peticion = { jsonrpc: "2.0", id: id, method: "tools/list" };
  } else if (method === "tools/call") {
    const name = url.searchParams.get("name") || "";
    const args = url.searchParams.get("arguments")
      ? JSON.parse(url.searchParams.get("arguments") || "{}")
      : {};
    peticion = {
      jsonrpc: "2.0",
      id: id,
      method: "tools/call",
      params: { name, arguments: args },
    };
  } else {
    return NextResponse.json(
      { ok: false, error: "Método no especificado" },
      { status: 400 }
    );
  }

  const { herramientas } = await import("../mcp/protocolo");
  // Nota: herramientas se inyectarán en tiempo de ejecución

  // Para esta conexión provisional, usamos herramientas falsas para compatibilidad
  const herramientasFalsas = [
    {
      nombre: "estado",
      descripcion: "Obtiene el estado del sistema",
      esquema: { type: "object", properties: {} } as Record<string, unknown>,
      ejecutar: async () => ({
        contenido: [{ tipo: "texto", texto: "ok" }],
      }),
    },
    {
      nombre: "tareas_listar",
      descripcion: "Lista tareas",
      esquema: { type: "object", properties: { limite: { type: "number" } } } as Record<string, unknown>,
      ejecutar: async (args: Record<string, unknown>) => ({
        contenido: [{ tipo: "texto", texto: `tareas con límite ${args.limite ?? 10}` }],
      }),
    },
  ];

  const contexto = undefined;
  const respuesta = await atenderMcp(peticion, { herramientas: herramientasFalsas, contexto });

  return NextResponse.json(respuesta);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { method, id, params } = body;

  let peticion: any;

  if (method === "initialize") {
    peticion = { jsonrpc: "2.0", id, method: "initialize" };
  } else if (method === "tools/list") {
    peticion = { jsonrpc: "2.0", id, method: "tools/list" };
  } else if (method === "tools/call") {
    peticion = { jsonrpc: "2.0", id, method: "tools/call", params };
  } else {
    return NextResponse.json(
      { ok: false, error: "Método no soportado" },
      { status: 400 }
    );
  }

  const contexto = undefined;
  const { herramientas } = await import("../mcp/protocolo");
  const herramientasFalsas = [
    {
      nombre: "estado",
      descripcion: "Obtiene el estado del sistema",
      esquema: { type: "object", properties: {} } as Record<string, unknown>,
      ejecutar: async () => ({
        contenido: [{ tipo: "texto", texto: "ok" }],
      }),
    },
    {
      nombre: "tareas_listar",
      descripcion: "Lista tareas",
      esquema: { type: "object", properties: { limite: { type: "number" } } } as Record<string, unknown>,
      ejecutar: async (args: Record<string, unknown>) => ({
        contenido: [{ tipo: "texto", texto: `tareas con límite ${args.limite ?? 10}` }],
      }),
    },
  ];

  const respuesta = await atenderMcp(peticion, { herramientas: herramientasFalsas, contexto });

  return NextResponse.json(respuesta);
}