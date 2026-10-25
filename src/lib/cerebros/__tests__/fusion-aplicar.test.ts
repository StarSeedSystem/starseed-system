import { describe, it, expect, vi } from 'vitest';
import { Brain } from '@/lib/brains/brains';
import { ArchivoMemoria, PrefsCerebro } from '../fusion';
import { leerParaFusion, copiaDeSeguridad, aplicarFusion } from '../fusion-aplicar';

const createMockBrain = (id: string, name: string): Brain => ({
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
  created_at: undefined,
  updated_at: undefined,
});

const createMockArchivoMemoria = (
  brainId: string,
  name: string,
  content: string,
  updatedAt?: string
): ArchivoMemoria => ({
  brain_id: brainId,
  name,
  content,
  updated_at: updatedAt ?? new Date().toISOString(),
  meta: null,
});

vi.mock('@/utils/supabase/client', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          abortSignal: vi.fn(callback => callback()),
          then: vi.fn(resolve => resolve({ data: [], error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          abortSignal: vi.fn(callback => callback()),
        })),
      })),
      insert: vi.fn(() => ({
        abortSignal: vi.fn(callback => callback()),
      })),
    })),
  })),
}));

vi.mock('@/lib/brains/brains', () => ({
  getBrain: vi.fn((id: string) => ({
    abortSignal: vi.fn(callback => callback()),
    then: vi.fn(resolve => resolve(createMockBrain(id, 'Mock Brain'))),
  })),
  saveBrain: vi.fn(brain => ({
    abortSignal: vi.fn(callback => callback()),
  })),
  deleteBrain: vi.fn(id => ({
    abortSignal: vi.fn(callback => callback()),
    then: vi.fn(resolve => resolve({ error: null })),
  })),
}));

vi.mock('@/lib/consumo/guardian', () => ({
  senalEsencial: vi.fn(() => ({})),
}));

vi.mock('@/lib/settings-sync', () => ({
  pushPreferences: vi.fn(() => ({
    abortSignal: vi.fn(callback => callback()),
  })),
}));

describe('fusion-aplicar', () => {
  describe('leerParaFusion', () => {
    it('should successfully read fusion data', async () => {
      const destino = createMockBrain('destino', 'Destino');
      const origen1 = createMockBrain('origen1', 'Origen1');
      const origen2 = createMockBrain('origen2', 'Origen2');

      const archivos: ArchivoMemoria[] = [
        createMockArchivoMemoria('destino', 'file1.md', '# Destino File'),
        createMockArchivoMemoria('origen1', 'file1.md', '# Origen1 File'),
        createMockArchivoMemoria('origen2', 'file2.md', '# Origen2 File'),
      ];

      const prefs = {
        'starseed.brain.destino.prefs1': { key1: 'value1' },
        'starseed.brain.origen1.prefs2': { key2: 'value2' },
      };

      Object.defineProperty(window.localStorage, 'getItem', {
        value: (key: string) => {
          if (key in prefs) return JSON.stringify(prefs[key]);
          return null;
        },
        writable: true,
      });

      const resultado = await leerParaFusion('destino', ['origen1', 'origen2']);

      expect(resultado.ok).toBe(true);
      expect(resultado.destino.id).toBe('destino');
      expect(resultado.origenes).toHaveLength(2);
      expect(resultado.archivos).toHaveLength(3);
      expect(resultado.prefs).toBeDefined();
    });
  });

  describe('copiaDeSeguridad', () => {
    it('should create a valid backup', () => {
      const datos = {
        ok: true,
        destino: createMockBrain('destino', 'Destino'),
        origenes: [createMockBrain('origen1', 'Origen1')],
        archivos: [createMockArchivoMemoria('destino', 'file1.md', '# Content')],
        prefs: { 'starseed.brain.destino.prefs': { key: 'value' } },
      };
      const fecha = '2026-10-13';

      const resultado = copiaDeSeguridad(datos, fecha);

      expect(resultado.nombre).toBe('cerebros-fusion-2026-10-13.json');
      expect(resultado.texto).toContain('destino');
      expect(JSON.parse(resultado.texto)).toEqual(datos);
    });
  });

  describe('aplicarFusion', () => {
    it('should successfully apply fusion plan', async () => {
      const destino = createMockBrain('destino', 'Destino');
      const origen1 = createMockBrain('origen1', 'Origen1');

      const plan = {
        archivos: [
          {
            name: 'file1.md',
            accion: 'copiar' as const,
            contenido: '# New File Content',
            bytesQueEntran: 18,
            desde: ['origen1'],
            idDestino: undefined,
          },
        ],
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
        config: { fusionados: ['origen1'], fusionadoEn: '2026-10-13' },
        prefs: { 'starseed.brain.destino.prefs': { key: 'value' } },
        resumen: {
          archivosNuevos: 1,
          archivosAnexados: 0,
          archivosOmitidos: 0,
          bytes: 18,
        },
      };

      const resultado = await aplicarFusion(plan, {
        destino,
        origenIds: ['origen1'],
        quitarOrigenes: false,
      });

      expect(resultado.ok).toBe(true);
      expect(resultado.archivosEscritos).toBe(1);
      expect(resultado.bytes).toBe(18);
    });

    it('should not delete origins when they have selections', async () => {
      const destino = createMockBrain('destino', 'Destino');
      const origen1 = createMockBrain('origen1', 'Origen1');

      const plan = {
        archivos: [],
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
        config: {},
        prefs: {},
        resumen: {
          archivosNuevos: 0,
          archivosAnexados: 0,
          archivosOmitidos: 0,
          bytes: 0,
        },
      };

      const resultado = await aplicarFusion(plan, {
        destino,
        origenIds: ['origen1'],
        quitarOrigenes: true,
      });

      expect(resultado.ok).toBe(true);
      expect(resultado.origenesQuitados).toHaveLength(0);
      expect(resultado.origenesConservados).toHaveLength(1);
      expect(resultado.origenesConservados[0].id).toBe('origen1');
    });
  });
});
