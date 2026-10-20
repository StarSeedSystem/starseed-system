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
