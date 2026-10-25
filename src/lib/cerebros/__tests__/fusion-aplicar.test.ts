// Rescate RTVGM1016C: la rama CB1013C traía `fusion-aplicar.test.ts`. En main el
// aplicar vive en `fusionar-dialog.tsx` (I/O) y lo puro es `planFusion`. Aquí quedan
// solo los casos de la rama adaptados a esa API pura: lectura de preferencias y de
// los archivos de todos los orígenes.
import { describe, it, expect } from 'vitest';
import type { Brain } from '@/lib/brains/brains';
import { planFusion, type ArchivoMemoria, type PrefsCerebro } from '../fusion';

function cerebro(id: string, name: string): Brain {
  return {
    id,
    owner: 'test-owner',
    name,
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
  };
}

function archivo(brainId: string, name: string, content: string): ArchivoMemoria {
  return { brain_id: brainId, name, content, updated_at: null, meta: null };
}

describe('planFusion · preferencias y orígenes (rescate CB1013C)', () => {
  const fecha = '2026-10-13';
  const sinPrefs: Record<string, PrefsCerebro> = {};

  it('fusiona las preferencias del destino y del origen sin perder claves', () => {
    const destino = cerebro('dest-1', 'Destino');
    const origen = cerebro('orig-1', 'Origen');
    const archivos = [
      archivo('dest-1', 'prefs', JSON.stringify({ moa: { temperatura: 0.2 }, listas: [{ id: 'a' }] })),
      archivo('orig-1', 'prefs', JSON.stringify({ moa: { modelo: 'x' }, listas: [{ id: 'b' }], nueva: true })),
    ];

    const resultado = planFusion({ destino, origenes: [origen], archivos, prefs: sinPrefs, fecha });

    expect(resultado.prefs).toEqual({
      moa: { temperatura: 0.2, modelo: 'x' },
      listas: [{ id: 'a' }, { id: 'b' }],
      nueva: true,
    });
  });

  it('ignora unas preferencias que no son JSON válido y conserva las del origen', () => {
    const destino = cerebro('dest-1', 'Destino');
    const origen = cerebro('orig-1', 'Origen');
    const archivos = [
      archivo('dest-1', 'prefs', '{ roto'),
      archivo('orig-1', 'prefs', JSON.stringify({ moa: { ok: true } })),
    ];

    const resultado = planFusion({ destino, origenes: [origen], archivos, prefs: sinPrefs, fecha });

    expect(resultado.prefs).toEqual({ moa: { ok: true } });
  });

  it('devuelve preferencias vacías si ningún cerebro tiene preferencias guardadas', () => {
    const destino = cerebro('dest-1', 'Destino');
    const origen = cerebro('orig-1', 'Origen');
    const archivos = [archivo('dest-1', 'memoria.md', '# Destino'), archivo('orig-1', 'memoria.md', '# Origen')];

    const resultado = planFusion({ destino, origenes: [origen], archivos, prefs: sinPrefs, fecha });

    expect(resultado.prefs).toEqual({});
  });

  it('incluye los archivos de todos los orígenes, atribuidos a su cerebro', () => {
    const destino = cerebro('dest-1', 'Destino');
    const origenA = cerebro('orig-a', 'Origen A');
    const origenB = cerebro('orig-b', 'Origen B');
    const archivos = [
      archivo('orig-a', 'a.md', '# Memoria A'),
      archivo('orig-b', 'b.md', '# Memoria B'),
    ];

    const resultado = planFusion({
      destino,
      origenes: [origenA, origenB],
      archivos,
      prefs: sinPrefs,
      fecha,
    });

    const planA = resultado.archivos.find((a) => a.name === 'a.md');
    const planB = resultado.archivos.find((a) => a.name === 'b.md');
    expect(planA).toMatchObject({ accion: 'copiar', desde: ['orig-a'], contenido: '# Memoria A' });
    expect(planB).toMatchObject({ accion: 'copiar', desde: ['orig-b'], contenido: '# Memoria B' });
    expect(resultado.resumen.archivosNuevos).toBe(2);
  });
});
