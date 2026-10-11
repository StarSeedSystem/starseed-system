import { describe, it, expect, vi } from 'vitest';
import { anunciarPorEnlacesDirectos, escucharEstacionesDirectas } from '../malla-directa';
import type { Estacion } from '../tipos';
import type { EstacionOida } from '../malla';

const estacionMock: Estacion = {
  id: 'test-id',
  owner_id: 'owner-id',
  ambito_tipo: 'persona',
  entidad_ref: null,
  titulo: 'Test Station',
  descripcion: 'A test station',
  tipo: 'audio',
  fuente: 'enlace',
  enlace: 'https://example.com',
  formato: 'mp3',
  imagen: null,
  idioma: 'es',
  categorias: ['música'],
  licencia: 'cc-by',
  visibilidad: 'publica',
  empieza_en: null,
  termina_en: null,
  ultimo_latido: null,
  pausada: false,
  en_malla: false,
  espectadores: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('malla-directa', () => {
  it('anuncia por dos enlaces y un tercero falla', async () => {
    const mockEnlaces = [{ id: 'link1' }, { id: 'link2' }, { id: 'link3' }];
    let enviarMockCallCount = 0;
    const mockDeps = {
      enlaces: () => Promise.resolve(mockEnlaces),
      enviar: async (destino: any) => {
        enviarMockCallCount++;
        if (destino.enlaceId === 'link3') throw new Error('Fallo simulado');
        return { ok: true, enlace: { id: destino.enlaceId } };
      },
    };
    const result = await anunciarPorEnlacesDirectos(estacionMock, mockDeps);
    expect(result.enviados).toBe(2);
    expect(result.enlaces).toEqual(['link1', 'link2']);
    expect(enviarMockCallCount).toBe(3);
  });

  it('escucha estaciones válidas y las pasa al callback', (done: (err?: any) => void) => {
    const mockAlRecibir = (canal: string, cb: (m: any) => void) => {
      setTimeout(() => {
        cb({
          cuerpo: {
            id: 'test-id',
            kind: 'estacion',
            name: 'Test Station',
            category: 'audio',
            media_url: 'https://example.com',
          },
        });
      }, 10);
      return () => { };
    };
    const mockDeps = { alRecibir: mockAlRecibir };
    const callback = vi.fn((oidas: EstacionOida[]) => {
      expect(oidas.length).toBe(1);
      expect(oidas[0]).toMatchObject({
        id: 'test-id',
        titulo: 'Test Station',
        tipo: 'audio',
        enlace: 'https://example.com',
        oidaPorMalla: true,
      });
      done();
    });
    const unsubscribe = escucharEstacionesDirectas(callback, mockDeps);
  });

  it('ignora estaciones inválidas (no llama al callback)', (done: (err?: any) => void) => {
    const mockAlRecibir = (canal: string, cb: (m: any) => void) => {
      setTimeout(() => {
        cb({
          cuerpo: {
            id: 'test-id',
            kind: 'estacion',
            name: 'Test Station',
            category: 'audio',
            media_url: 'https://example.com',
          },
        });
      }, 10);
      return () => { };
    };
    const mockDeps = { alRecibir: mockAlRecibir };
    const callback = vi.fn();
    const unsubscribe = escucharEstacionesDirectas(callback, mockDeps);
    setTimeout(() => {
      expect(callback).not.toHaveBeenCalled();
      unsubscribe();
      done();
    }, 20);
  });
});