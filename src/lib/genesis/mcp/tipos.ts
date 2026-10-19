export interface McpRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params?: unknown;
}

export interface McpResponse {
  jsonrpc: string;
  id: string | number;
  result: unknown;
}

export interface McpError {
  jsonrpc: string;
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// Definición de una herramienta MCP
export interface McpHerramienta {
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
  call: (args: Record<string, unknown>, contexto: any) => Promise<unknown>;
}

// Error codes según JSON-RPC 2.0
export const ERROR_CODES = {
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;