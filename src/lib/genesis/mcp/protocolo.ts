/**
 * Protocolo MCP (HTTP, JSON-RPC 2.0) puro para Genesis abierto.
 * Contrato: architecture/genesis-conectores-abiertos.md §7.
 */

export interface HerramientaMcp {
  nombre: string;
  descripcion: string;
  esquema: Record<string, unknown>;
  ejecutar: (
    argumentos: Record<string, unknown>,
    contexto?: unknown
  ) => Promise<{ contenido: Array<{ tipo: "texto"; texto: string }>; esError?: boolean }>;
}

export interface PeticionJsonRpc {
  jsonrpc: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface RespuestaErrorJsonRpc {
  jsonrpc: "2.0";
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface RespuestaExitoJsonRpc {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
}

export type RespuestaJsonRpc = RespuestaExitoJsonRpc | RespuestaErrorJsonRpc;

export interface OpcionesAtenderMcp {
  herramientas: HerramientaMcp[];
  contexto?: unknown;
}

export async function atenderMcp(
  peticion: unknown,
  { herramientas, contexto }: OpcionesAtenderMcp
): Promise<RespuestaJsonRpc> {
  if (!esPeticionValida(peticion)) {
    return respuestaError(null, -32600, "Solicitud inválida");
  }

  const p = peticion as PeticionJsonRpc;

  if (p.jsonrpc !== "2.0") {
    return respuestaError(p.id, -32600, "Versión JSON-RPC no soportada");
  }

  switch (p.method) {
    case "initialize":
      return atenderInitialize(p.id);
    
    case "tools/list":
      return atenderToolsList(p.id, herramientas);
    
    case "tools/call":
      return atenderToolsCall(p.id, p.params, herramientas, contexto);
    
    default:
      return respuestaError(p.id, -32601, "Método no encontrado");
  }
}

function esPeticionValida(peticion: unknown): peticion is PeticionJsonRpc {
  if (typeof peticion !== "object" || peticion === null) return false;
  const p = peticion as Record<string, unknown>;
  if (typeof p.jsonrpc !== "string" || p.jsonrpc !== "2.0") return false;
  if (typeof p.method !== "string") return false;
  return true;
}

function respuestaError(
  id: string | number | null | undefined,
  codigo: number,
  mensaje: string,
  datos?: unknown
): RespuestaErrorJsonRpc {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code: codigo, message: mensaje, data: datos },
  };
}

function respuestaExito(
  id: string | number | null | undefined,
  resultado: unknown
): RespuestaExitoJsonRpc {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    result: resultado,
  };
}

async function atenderInitialize(id: string | number | null | undefined): Promise<RespuestaJsonRpc> {
  return respuestaExito(id, {
    protocolVersion: "2024-11-05",
    capabilities: {
      tools: {},
    },
    serverInfo: {
      name: "starseed-genesis",
      version: "0.1.0",
    },
  });
}

async function atenderToolsList(
  id: string | number | null | undefined,
  herramientas: HerramientaMcp[]
): Promise<RespuestaJsonRpc> {
  const herramientasListadas = herramientas.map((h) => ({
    name: h.nombre,
    description: h.descripcion,
    inputSchema: h.esquema,
  }));
  
  return respuestaExito(id, { tools: herramientasListadas });
}

async function atenderToolsCall(
  id: string | number | null | undefined,
  params: Record<string, unknown> | undefined,
  herramientas: HerramientaMcp[],
  contexto?: unknown
): Promise<RespuestaJsonRpc> {
  if (!params || typeof params !== "object") {
    return respuestaError(id, -32602, "Parámetros inválidos");
  }

  const paramsObj = params as Record<string, unknown>;
  const nombreHerramienta = paramsObj.name;
  const argumentos = paramsObj.arguments;

  if (typeof nombreHerramienta !== "string" || typeof argumentos !== "object" || argumentos === null) {
    return respuestaError(id, -32602, "Parámetros inválidos");
  }

  const herramienta = herramientas.find((h) => h.nombre === nombreHerramienta);
  if (!herramienta) {
    return respuestaError(id, -32602, "Herramienta no encontrada");
  }

  try {
    const resultado = await herramienta.ejecutar(argumentos as Record<string, unknown>, contexto);
    return respuestaExito(id, resultado);
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    return respuestaExito(id, {
      content: [{ type: "text", text: `Error: ${mensaje}` }],
      isError: true,
    });
  }
}
