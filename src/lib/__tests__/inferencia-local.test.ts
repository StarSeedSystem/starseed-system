import { describe, it, expect } from 'vitest';
import {
  nodoConBase,
  resumenDisponibles,
  elegirNodo,
  esNodoListo,
  NODOS_INFERENCIA_LOCAL_STORAGE,
  NodoInferenciaLocal,
} from '../network/inferencia-local';

describe('inferencia-local', () => {
  it('exporta la constante de almacenamiento correcta', () => {
    expect(NODOS_INFERENCIA_LOCAL_STORAGE).toBe('starseed.mesh.inferencia-local.v1');
  });

  describe('nodoConBase', () => {
    it('construye la URL OpenAI-compatible por defecto', () => {
      const nodo: NodoInferenciaLocal = {
        id: 'nodo-1',
        host: '192.168.1.50',
        puerto: 8080,
        baseUrl: '',
        motores: ['pair'],
        modelos: ['suptonica'],
        ramMB: 2048,
        ultimoLatido: '2026-09-21T00:00:00Z',
        transporte: 'wifi-halo',
      };
      expect(nodoConBase(nodo)).toBe('http://192.168.1.50:8080/v1/chat/completions');
    });

    it('respeta la ruta personalizada y baseUrl existente', () => {
      const nodo: NodoInferenciaLocal = {
        id: 'nodo-2',
        host: 'localhost',
        puerto: 11434,
        baseUrl: 'http://localhost:11434/',
        motores: ['ollama'],
        modelos: ['llama3'],
        ramMB: 4096,
        ultimoLatido: '2026-09-21T00:00:00Z',
        transporte: 'webrtc-local',
      };
      expect(nodoConBase(nodo, '/v1/models')).toBe('http://localhost:11434/v1/models');
    });
  });

  describe('esNodoListo', () => {
    it('verifica si un nodo cumple los criterios de RAM y modelo', () => {
      const nodoListo: NodoInferenciaLocal = {
        id: 'nl-1',
        host: '192.168.1.10',
        puerto: 8080,
        baseUrl: '',
        motores: ['pair'],
        modelos: ['bitnet-1.58'],
        ramMB: 1024,
        ultimoLatido: '2026-09-21T00:00:00Z',
        transporte: 'wifi-halo',
      };
      const nodoSinRam: NodoInferenciaLocal = {
        ...nodoListo,
        ramMB: 256,
      };
      const nodoSinModelo: NodoInferenciaLocal = {
        ...nodoListo,
        modelos: [],
      };

      expect(esNodoListo(nodoListo)).toBe(true);
      expect(esNodoListo(nodoSinRam)).toBe(false);
      expect(esNodoListo(nodoSinModelo)).toBe(false);
    });
  });

  describe('resumenDisponibles', () => {
    it('cuenta totales, listos, conModelo y calcula latenciaPromedio', () => {
      const nodos: NodoInferenciaLocal[] = [
        {
          id: 'n1',
          host: '10.0.0.1',
          puerto: 8000,
          baseUrl: '',
          motores: ['pair'],
          modelos: ['bitnet-1.58'],
          ramMB: 1024,
          latenciaMs: 30,
          carga: 0.1,
          ultimoLatido: '2026-09-21T00:00:00Z',
          transporte: 'wifi-halo',
        },
        {
          id: 'n2',
          host: '10.0.0.2',
          puerto: 8000,
          baseUrl: '',
          motores: ['pair'],
          modelos: [],
          ramMB: 2048,
          latenciaMs: 50,
          carga: 0.2,
          ultimoLatido: '2026-09-21T00:00:00Z',
          transporte: 'webrtc-local',
        },
        {
          id: 'n3',
          host: '10.0.0.3',
          puerto: 8000,
          baseUrl: '',
          motores: ['pair'],
          modelos: ['bitnet-1.58'],
          ramMB: 256,
          latenciaMs: 10,
          carga: 0.5,
          ultimoLatido: '2026-09-21T00:00:00Z',
          transporte: 'tunel',
        },
      ];

      const resumen = resumenDisponibles(nodos, {
        modelosEstudio: ['bitnet-1.58'],
        minRamMB: 512,
      });

      expect(resumen.totales).toBe(3);
      expect(resumen.conModelo).toBe(2);
      expect(resumen.listos).toBe(1);
      expect(resumen.latenciaPromedio).toBe(30);
    });
  });

  describe('elegirNodo', () => {
    it('elige el de menor carga deterministamente', () => {
      const nodos: NodoInferenciaLocal[] = [
        {
          id: 'b-nodo',
          host: '10.0.0.1',
          puerto: 8000,
          baseUrl: '',
          motores: ['pair'],
          modelos: ['suptonica'],
          ramMB: 1024,
          latenciaMs: 20,
          carga: 0.3,
          ultimoLatido: '2026-09-21T00:00:00Z',
          transporte: 'wifi-halo',
        },
        {
          id: 'a-nodo',
          host: '10.0.0.2',
          puerto: 8000,
          baseUrl: '',
          motores: ['pair'],
          modelos: ['suptonica'],
          ramMB: 1024,
          latenciaMs: 20,
          carga: 0.1,
          ultimoLatido: '2026-09-21T00:00:00Z',
          transporte: 'wifi-halo',
        },
      ];

      const elegido = elegirNodo(nodos, { modelo: 'suptonica' });
      expect(elegido?.id).toBe('a-nodo');
    });

    it('desempata por latenciaMs y luego por id', () => {
      const nodos: NodoInferenciaLocal[] = [
        {
          id: 'nodo-z',
          host: '10.0.0.1',
          puerto: 8000,
          baseUrl: '',
          motores: ['pair'],
          modelos: ['suptonica'],
          ramMB: 1024,
          latenciaMs: 15,
          carga: 0.2,
          ultimoLatido: '2026-09-21T00:00:00Z',
          transporte: 'wifi-halo',
        },
        {
          id: 'nodo-a',
          host: '10.0.0.2',
          puerto: 8000,
          baseUrl: '',
          motores: ['pair'],
          modelos: ['suptonica'],
          ramMB: 1024,
          latenciaMs: 15,
          carga: 0.2,
          ultimoLatido: '2026-09-21T00:00:00Z',
          transporte: 'wifi-halo',
        },
      ];

      const elegido = elegirNodo(nodos, { modelo: 'suptonica' });
      expect(elegido?.id).toBe('nodo-a');
    });

    it('descarta el nodo sin modelo requerido o con RAM insuficiente', () => {
      const nodos: NodoInferenciaLocal[] = [
        {
          id: 'nodo-sin-modelo',
          host: '10.0.0.1',
          puerto: 8000,
          baseUrl: '',
          motores: ['pair'],
          modelos: ['otra-cosa'],
          ramMB: 2048,
          carga: 0.05,
          ultimoLatido: '2026-09-21T00:00:00Z',
          transporte: 'wifi-halo',
        },
        {
          id: 'nodo-poca-ram',
          host: '10.0.0.2',
          puerto: 8000,
          baseUrl: '',
          motores: ['pair'],
          modelos: ['suptonica'],
          ramMB: 256,
          carga: 0.01,
          ultimoLatido: '2026-09-21T00:00:00Z',
          transporte: 'wifi-halo',
        },
      ];

      expect(elegirNodo(nodos, { modelo: 'suptonica', minRamMB: 512 })).toBeNull();
    });

    it('devuelve null si requiereGpu es true', () => {
      const nodo: NodoInferenciaLocal = {
        id: 'nodo-gpu',
        host: '10.0.0.1',
        puerto: 8000,
        baseUrl: '',
        motores: ['pair'],
        modelos: ['suptonica'],
        ramMB: 8192,
        carga: 0.01,
        ultimoLatido: '2026-09-21T00:00:00Z',
        transporte: 'wifi-halo',
      };

      expect(elegirNodo([nodo], { requiereGpu: true })).toBeNull();
    });

    it('devuelve null si la lista de nodos está vacía', () => {
      expect(elegirNodo([])).toBeNull();
    });
  });
});
