import { NextRequest, NextResponse } from "next/server";
import { atenderMcp } from "@/lib/genesis/mcp/protocolo";
import { HERRAMIENTAS_GENESIS } from "@/lib/genesis/mcp/herramientas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const contexto = undefined;
  const herramientas = herramientasPredeterminadas();
  const respuesta = await atenderMcp(peticion, { herramientas, contexto });

  return NextResponse.json(respuesta);
}