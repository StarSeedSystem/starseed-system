import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock the core modules before importing the module under test
vi.doMock('/home/runner/work/_temp/starseed-wt/BOT1011M/src/lib/astraura-bots/tipos', () => ({
  // We don't need to export anything specific for TipoAccion in the mock
  // We'll just export an empty object
  TipoAccion: {} as any,
}));

vi.doMock('/home/runner/work/_temp/starseed-wt/BOT1011M/src/lib/astraura-bots/acciones', () => ({
  // Mock validarAccion to return true for valid actions and false for invalid
  validarAccion: vi.fn((accion: any) => {
    // For simplicity, we'll consider actions with name 'validAction' as valid
    return accion.name === 'validAction';
  }),
}));

// We'll import the module after mocking
let reducirEventos: (estado: any, evento: any) => any;
let llamadasComoPropuestas: (estado: any) => { acciones: any[]; problemas: string[] };

beforeAll(async () => {
  const module = await import('../ag-ui');
  reducirEventos = module.reducirEventos;
  llamadasComoPropuestas = module.llamadasComoPropuestas;
});

describe('ag-ui', () => {
  it('should initialize state', () => {
    const estado = reducirEventos(undefined, {});
    expect(estado).toEqual({
      textoAcumulado: {},
      llamadas: {},
      estado: undefined,
      estadoDesincronizado: false,
      contadorEventosDesconocidos: 1,
      textoTotalLength: 0,
      llamadasCount: 0,
      argumentosTotalLength: 0,
    });
  });

  it('should handle RUN_STARTED', () => {
    const estado = reducirEventos(undefined, { type: 'RUN_STARTED', payload: {} });
    expect(estado).toEqual({
      textoAcumulado: {},
      llamadas: {},
      estado: undefined,
      estadoDesincronizado: false,
      contadorEventosDesconocidos: 0,
      textoTotalLength: 0,
      llamadasCount: 0,
      argumentosTotalLength: 0,
    });
  });

  it('should handle TOOL_CALL_START', () => {
    const estadoInicial = reducirEventos(undefined, {});
    const estado = reducirEventos(estadoInicial, {
      type: 'TOOL_CALL_START',
      payload: { toolCallId: 'call1', name: 'validAction' },
    });
    expect(estado.llamadas['call1']).toEqual({
      name: 'validAction',
      args: '',
      result: undefined,
      ended: false,
    });
    expect(estado.llamadasCount).toBe(1);
  });

  it('should ignore TOOL_CALL_START when limit reached', () => {
    // Start 50 tool calls
    let estado = reducirEventos(undefined, {});
    for (let i = 0; i < 50; i++) {
      estado = reducirEventos(estado, {
        type: 'TOOL_CALL_START',
        payload: { toolCallId: `call${i}`, name: `action${i}` },
      });
    }
    expect(estado.llamadasCount).toBe(50);
    // Try to start a 51st
    estado = reducirEventos(estado, {
      type: 'TOOL_CALL_START',
      payload: { toolCallId: 'call51', name: 'action51' },
    });
    // Should ignore, count still 50
    expect(estado.llamadasCount).toBe(50);
    expect(estado.llamadas['call51']).toBeUndefined();
  });

  it('should handle TOOL_CALL_ARGS', () => {
    let estado = reducirEventos(undefined, {});
    estado = reducirEventos(estado, {
      type: 'TOOL_CALL_START',
      payload: { toolCallId: 'call1', name: 'validAction' },
    });
    estado = reducirEventos(estado, {
      type: 'TOOL_CALL_ARGS',
      payload: { toolCallId: 'call1', args: '{"foo":' },
    });
    estado = reducirEventos(estado, {
      type: 'TOOL_CALL_ARGS',
      payload: { toolCallId: 'call1', args: '1}' },
    });
    expect(estado.llamadas['call1'].args).toBe('{"foo":1}');
    expect(estado.argumentosTotalLength).toBe(9);
  });

  it('should ignore TOOL_CALL_ARGS when argument limit exceeded', () => {
    let estado = reducirEventos(undefined, {});
    estado = reducirEventos(estado, {
      type: 'TOOL_CALL_START',
      payload: { toolCallId: 'call1', name: 'validAction' },
    });
    // Try to add args that would exceed the 20000 limit
    const largeArgs = 'x'.repeat(20001);
    estado = reducirEventos(estado, {
      type: 'TOOL_CALL_ARGS',
      payload: { toolCallId: 'call1', args: largeArgs },
    });
    // Should ignore, args remain empty
    expect(estado.llamadas['call1'].args).toBe('');
    expect(estado.argumentosTotalLength).toBe(0);
  });

  it('should handle TOOL_CALL_END', () => {
    let estado = reducirEventos(undefined, {});
    estado = reducirEventos(estado, {
      type: 'TOOL_CALL_START',
      payload: { toolCallId: 'call1', name: 'validAction' },
    });
    estado = reducirEventos(estado, {
      type: 'TOOL_CALL_ARGS',
      payload: { toolCallId: 'call1', args: '{}' },
    });
    estado = reducirEventos(estado, {
      type: 'TOOL_CALL_END',
      payload: { toolCallId: 'call1' },
    });
    expect(estado.llamadas['call1'].ended).toBe(true);
  });

  it('should handle TOOL_CALL_RESULT', () => {
    let estado = reducirEventos(undefined, {});
    estado = reducirEventos(estado, {
      type: 'TOOL_CALL_START',
      payload: { toolCallId: 'call1', name: 'validAction' },
    });
    estado = reducirEventos(estado, {
      type: 'TOOL_CALL_RESULT',
      payload: { toolCallId: 'call1', result: { success: true } },
    });
    expect(estado.llamadas['call1'].result).toEqual({ success: true });
  });

  it('should handle STATE_SNAPSHOT', () => {
    const estadoInicial = reducirEventos(undefined, {});
    const snapshot = { foo: 'bar' };
    const estado = reducirEventos(estadoInicial, {
      type: 'STATE_SNAPSHOT',
      payload: snapshot,
    });
    expect(estado.estado).toBe(snapshot);
    expect(estado.estadoDesincronizado).toBe(false);
  });

  it('should handle STATE_DELTA successfully', () => {
    let estado = reducirEventos(undefined, {});
    // Set initial state via snapshot
    estado = reducirEventos(estado, {
      type: 'STATE_SNAPSHOT',
      payload: { foo: 'baz' },
    });
    // Apply a delta: replace foo with 'qux'
    const delta = [{ op: 'replace', path: '/foo', value: 'qux' }];
    estado = reducirEventos(estado, {
      type: 'STATE_DELTA',
      payload: delta,
    });
    expect(estado.estado).toEqual({ foo: 'qux' });
    expect(estado.estadoDesincronizado).toBe(false);
  });

  it('should handle STATE_DELTA failure and set desync flag', () => {
    let estado = reducirEventos(undefined, {});
    // Set initial state via snapshot
    estado = reducirEventos(estado, {
      type: 'STATE_SNAPSHOT',
      payload: { foo: 'baz' },
    });
    // Apply a delta that tries to replace a non-existent path
    const delta = [{ op: 'replace', path: '/nonexistent', value: 'qux' }];
    estado = reducirEventos(estado, {
      type: 'STATE_DELTA',
      payload: delta,
    });
    // Estado should remain unchanged
    expect(estado.estado).toEqual({ foo: 'baz' });
    // Desync flag should be set
    expect(estado.estadoDesincronizado).toBe(true);
  });

  it('should count unknown events', () => {
    let estado = reducirEventos(undefined, {});
    estado = reducirEventos(estado, { type: 'UNKNOWN_EVENT', payload: {} });
    estado = reducirEventos(estado, { type: 'ANOTHER_UNKNOWN', payload: {} });
    expect(estado.contadorEventosDesconocidos).toBe(3);
  });

  it('llamadasComoPropuestas should return valid actions and problems', () => {
    let estado = reducirEventos(undefined, {});
    // Start a valid action
    estado = reducirEventos(estado, {
      type: 'TOOL_CALL_START',
      payload: { toolCallId: 'call1', name: 'validAction' },
    });
    estado = reducirEventos(estado, {
      type: 'TOOL_CALL_ARGS',
      payload: { toolCallId: 'call1', args: '{"param":1}' },
    });
    estado = reducirEventos(estado, {
      type: 'TOOL_CALL_END',
      payload: { toolCallId: 'call1' },
    });
    // Start an invalid action (name not 'validAction')
    estado = reducirEventos(estado, {
      type: 'TOOL_CALL_START',
      payload: { toolCallId: 'call2', name: 'invalidAction' },
    });
    estado = reducirEventos(estado, {
      type: 'TOOL_CALL_ARGS',
      payload: { toolCallId: 'call2', args: '{}' },
    });
    estado = reducirEventos(estado, {
      type: 'TOOL_CALL_END',
      payload: { toolCallId: 'call2' },
    });
    const { acciones, problemas } = llamadasComoPropuestas(estado);
    // Only the valid action should be in acciones
    expect(acciones).toHaveLength(1);
    expect(acciones[0]).toBe('validAction' as any); // TypeAccion is mocked
    // One problem for the invalid action
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain('Herramienta no disponible para invitados');
  });

  it('llamadasComoPropuestas should handle JSON parse errors in args', () => {
    let estado = reducirEventos(undefined, {});
    estado = reducirEventos(estado, {
      type: 'TOOL_CALL_START',
      payload: { toolCallId: 'call1', name: 'validAction' },
    });
    estado = reducirEventos(estado, {
      type: 'TOOL_CALL_ARGS',
      payload: { toolCallId: 'call1', args: 'invalid json' },
    });
    estado = reducirEventos(estado, {
      type: 'TOOL_CALL_END',
      payload: { toolCallId: 'call1' },
    });
    const { acciones, problemas } = llamadasComoPropuestas(estado);
    expect(acciones).toHaveLength(0);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain('Error al parsear argumentos');
  });

  it('llamadasComoPropuestas should not include tool calls that have not ended', () => {
    let estado = reducirEventos(undefined, {});
    estado = reducirEventos(estado, {
      type: 'TOOL_CALL_START',
      payload: { toolCallId: 'call1', name: 'validAction' },
    });
    estado = reducirEventos(estado, {
      type: 'TOOL_CALL_ARGS',
      payload: { toolCallId: 'call1', args: '{}' },
    });
    // No END event
    const { acciones, problemas } = llamadasComoPropuestas(estado);
    expect(acciones).toHaveLength(0);
    expect(problemas).toHaveLength(0);
  });
});