import { describe, it, expect } from 'vitest';
import { atenderMcp } from '../protocolo';
import { type McpResponse, type McpError, type McpHerramienta } from './tipos';

describe('atenderMcp', () => {
  const herramientas: Record<string, McpHerramienta> = {
    herramienta1: {
      description: 'Herramienta de prueba',
      inputSchema: { type: 'object', properties: { parametro1: { type: 'string' } } },
      call: async (args: { parametro1?: string }, _: any) => `Resultado: ${args.parametro1 || 'sin parametro'}`,
    },
  };

  const contexto = { usuario: 'test' };

  it('debe manejar correctamente initialize', async () => {
    const peticion = { jsonrpc: '2.0', id: 1, method: 'initialize' };
    const resultado = await atenderMcp(peticion, { herramientas, contexto });
    if ('result' in resultado) {
      const res = resultado as McpResponse;
      expect(res.jsonrpc).toBe('2.0');
      expect(res.id).toBe(1);
      expect(res.result.serverInfo.name).toBe('starseed-genesis');
      expect(res.result.serverInfo.version).toBe('1.0.0');
      expect(res.result.capabilities.tools).toBeDefined();
    } else {
      fail('Se esperaba una respuesta exitosa');
    }
  });

  it('debe listar herramientas correctamente', async () => {
    const peticion = { jsonrpc: '2.0', id: 2, method: 'tools/list' };
    const resultado = await atenderMcp(peticion, { herramientas, contexto });
    if ('result' in resultado) {
      const res = resultado as McpResponse;
      expect(res.jsonrpc).toBe('2.0');
      expect(res.id).toBe(2);
      expect(Array.isArray(res.result.tools)).toBe(true);
      expect(res.result.tools.length).toBe(1);
      expect(res.result.tools[0].name).toBe('herramienta1');
      expect(res.result.tools[0].description).toBe('Herramienta de prueba');
    } else {
      fail('Se esperaba una respuesta exitosa');
    }
  });

  it('debe llamar a una herramienta correctamente', async () => {
    const peticion = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'herramienta1', arguments: { parametro1: 'valor de prueba' } },
    };
    const resultado = await atenderMcp(peticion, { herramientas, contexto });
    if ('result' in resultado) {
      const res = resultado as McpResponse;
      expect(res.jsonrpc).toBe('2.0');
      expect(res.id).toBe(3);
      expect(res.result.content).toBeDefined();
      expect(Array.isArray(res.result.content)).toBe(true);
      expect(res.result.content[0].type).toBe('text');
      expect(res.result.content[0].text).toContain('Resultado: valor de prueba');
    } else {
      fail('Se esperaba una respuesta exitosa');
    }
  });

  it('debe devolver error para método no encontrado', async () => {
    const peticion = { jsonrpc: '2.0', id: 4, method: 'metodo/inexistente' };
    const resultado = await atenderMcp(peticion, { herramientas, contexto });
    if ('error' in resultado) {
      const err = resultado as McpError;
      expect(err.jsonrpc).toBe('2.0');
      expect(err.id).toBe(4);
      expect(err.error.code).toBe(-32601);
      expect(err.error.message).toContain('Método no encontrado');
    } else {
      fail('Se esperaba un error');
    }
  });

  it('debe devolver error para petición no válida', async () => {
    const peticion = { jsonrpc: '2.0', method: 'initialize' };
    const resultado = await atenderMcp(peticion, { herramientas, contexto });
    if ('error' in resultado) {
      const err = resultado as McpError;
      expect(err.jsonrpc).toBe('2.0');
      expect(err.id).toBeNull();
      expect(err.error.code).toBe(-32600);
      expect(err.error.message).toBe('Petición no válida');
    } else {
      fail('Se esperaba un error');
    }
  });
});