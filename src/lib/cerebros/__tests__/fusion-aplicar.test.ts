import { describe, it, expect } from 'vitest';
import type { Brain } from '@/lib/brains/brains';
import { planFusion, type ArchivoMemoria, type PrefsCerebro } from '../fusion';

const cerebro = (id: string): Brain => ({
  id,
  owner: 'test-owner',
  name: id,
  scope: 'account',
  scope_ref: null,
  description: '',
  config: {},
  includes: {
    vaults: [],
    backends: [],
    personalities: [],
    runtimes: [],
    tokens: [],
    memories: [],
    connections: [],
    bindScope: false,
    permissions: [],
    aiProvider: undefined,
  },
  servers: [],
  created_at: undefined,
  updated_at: undefined,
});

const archivo = (brainId: string, name: string, content: string): ArchivoMemoria => ({
  brain_id: brainId,
  name,
  content,
  updated_at: null,
  meta: null,
});

const prefs: Record<string, PrefsCerebro> = {};

describe('planFusion · prefs defensivas', () => {
  it('ignora un archivo de prefs con JSON roto y sigue planificando', () => {
    const resultado = planFusion({
      destino: cerebro('dest-1'),
      origenes: [cerebro('orig-1')],
      archivos: [
        archivo('dest-1', 'prefs', '{esto no es json'),
        archivo('orig-1', 'memoria.md', '# Origen'),
      ],
      prefs,
      fecha: '2026-10-13',
    });
    expect(resultado.prefs).toEqual({});
    expect(resultado.archivos.find((a) => a.name === 'memoria.md')?.accion).toBe('copiar');
  });

  it('usa prefs vacías cuando ningún cerebro tiene archivo de prefs', () => {
    const resultado = planFusion({
      destino: cerebro('dest-1'),
      origenes: [],
      archivos: [],
      prefs,
      fecha: '2026-10-13',
    });
    expect(resultado.prefs).toEqual({});
  });
});
