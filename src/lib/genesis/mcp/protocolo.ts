import {
  type McpRequest,
  type McpResponse,
  type McpError,
  type McpHerramienta,
  ERROR_CODES,
} from './tipos';

export async function atenderMcp(
  peticion: McpRequest,
  { herramientas, contexto }: { herramientas: Record<string, McpHerramienta>; contexto: any }
): Promise<McpResponse | McpError> {
  // Validar petición JSON-RPC básica
  if (!peticion || peticion.jsonrpc !== '2.0' || typeof peticion.id === 'undefined') {
    return {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: ERROR_CODES.INVALID_REQUEST,
        message: 'Petición no válida',
      },
    };
  }

  // Manejar métodos MCP
  switch (peticion.method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id: peticion.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'starseed-genesis', version: '1.0.0' },
        },
      };

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id: peticion.id,
        result: {
          tools: Object.entries(herramientas).map(([name, tool]) => ({
            name,
            description: tool.description || '',
            inputSchema: tool.inputSchema || { type: 'object', properties: {} },
          })),
        },
      };

    case 'tools/call':
      if (!peticion.params || typeof peticion.params !== 'object') {
        return {
          jsonrpc: '2.0',
          id: peticion.id,
          error: {
            code: ERROR_CODES.INVALID_PARAMS,
            message: 'Parámetros no válidos para tools/call',
          },
        };
      }

      const { name: toolName, arguments: args } = peticion.params as {
        name: string;
        arguments?: Record<string, unknown>;
      };

      if (!herramientas[toolName]) {
        return {
          jsonrpc: '2.0',
          id: peticion.id,
          error: {
            code: ERROR_CODES.METHOD_NOT_FOUND,
            message: `Herramienta no encontrada: ${toolName}`,
          },
        };
      }

      try {
        const result = await herramientas[toolName].call?.(args ?? {}, contexto);
        return {
          jsonrpc: '2.0',
          id: peticion.id,
          result: {
            content: [
              {
                type: 'text',
                text: typeof result === 'string' ? result : JSON.stringify(result),
              },
            ],
          },
        };
      } catch (error) {
        return {
          jsonrpc: '2.0',
          id: peticion.id,
          error: {
            code: ERROR_CODES.INTERNAL_ERROR,
            message: error instanceof Error ? error.message : 'Error interno',
          },
        };
      }

    default:
      return {
        jsonrpc: '2.0',
        id: peticion.id,
        error: {
          code: ERROR_CODES.METHOD_NOT_FOUND,
          message: `Método no encontrado: ${peticion.method}`,
        },
      };
  }
}