import { NextRequest, NextResponse } from "next/server";
import { atenderMcp, type HerramientaMcp } from "@/lib/genesis/mcp/protocolo";
import {
  crearHerramientaVariaciones,
  type OrdenVariaciones,
  type VariacionPublica,
} from "@/lib/genesis/mcp/herramienta-variaciones";
import { crearDatosVariaciones, type ClienteVariaciones, type FilaVariacion } from "@/lib/variaciones/datos";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Conexión Genesis ↔ capa de datos. */
function aVariacionPublica(f: FilaVariacion): VariacionPublica {
  return {
    id: f.id, clave: f.clave, tipo: f.tipo, titulo: f.titulo, licencia: f.licencia,
    ...(f.descripcion ? { descripcion: f.descripcion } : {}),
    ...(f.etiquetas.length ? { etiquetas: f.etiquetas } : {}),
    valoracionMedia: f.valoracion_media, usos: f.usos,
  };
}

/** Listador de `variaciones_buscar` sobre la capa real de variaciones públicas. */
const listarVariaciones = async ({
  clave,
  buscar,
  orden,
}: {
  clave: string; buscar?: string; orden?: OrdenVariaciones;
}) => {
  const cliente = createClient() as unknown as PromiseLike<ClienteVariaciones>;
  const datos = crearDatosVariaciones(await cliente);
  const listado = await datos.listarVariaciones(clave, { buscar, orden });
  if (listado.error) throw new Error(listado.error);
  return listado.variaciones.map(aVariacionPublica);
};

function herramientasPredeterminadas(): HerramientaMcp[] {
  return [
    crearHerramientaVariaciones(listarVariaciones),
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