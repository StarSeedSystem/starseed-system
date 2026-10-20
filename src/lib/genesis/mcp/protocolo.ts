/**
 * Protocolo MCP (HTTP, JSON-RPC 2.0) para Genesis abierto.
 * Contrato: architecture/genesis-conectores-abiertos.md §7.
 */
export interface HerramientaMcp {
  nombre: string;
  descripcion: string;
  esquema: Record<string, unknown>;
  ejecutar: (args: Record<string, unknown>, ctx?: unknown) => Promise<{ contenido: Array<{ tipo: "texto"; texto: string }>; esError?: boolean }>;
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

  switch (p.method) {
    case "initialize":
      return respuestaExito(p.id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "starseed-genesis", version: "0.1.0" },
      });
    
    case "tools/list": {
      const listadas = herramientas.map((h) => ({
        name: h.nombre,
        description: h.descripcion,
        inputSchema: h.esquema,
      }));
      return respuestaExito(p.id, { tools: listadas });
    }
    
    case "tools/call":
      return atenderToolsCall(p.id, p.params, herramientas, contexto);
    
    default:
      return respuestaError(p.id, -32601, "Método no encontrado");
  }
}

function esPeticionValida(peticion: unknown): peticion is PeticionJsonRpc {
  if (typeof peticion !== "object" || peticion === null) return false;
  const p = peticion as Record<string, unknown>;
  return typeof p.jsonrpc === "string" && p.jsonrpc === "2.0" && typeof p.method === "string";
}

function respuestaError(id: string | number | null | undefined, codigo: number, mensaje: string): RespuestaErrorJsonRpc {
  return { jsonrpc: "2.0", id: id ?? null, error: { code: codigo, message: mensaje } };
}

function respuestaExito(id: string | number | null | undefined, resultado: unknown): RespuestaExitoJsonRpc {
  return { jsonrpc: "2.0", id: id ?? null, result: resultado };
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

  const { name, arguments: argumentos } = params as { name: unknown; arguments: unknown };
  if (typeof name !== "string" || typeof argumentos !== "object" || argumentos === null) {
    return respuestaError(id, -32602, "Parámetros inválidos");
  }

  const herramienta = herramientas.find((h) => h.nombre === name);
  if (!herramienta) {
    return respuestaError(id, -32602, "Herramienta no encontrada");
  }

  try {
    const resultado = await herramienta.ejecutar(argumentos as Record<string, unknown>, contexto);
    return respuestaExito(id, resultado);
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    return respuestaExito(id, { contenido: [{ tipo: "texto", texto: `Error: ${mensaje}` }], esError: true });
  }
}
