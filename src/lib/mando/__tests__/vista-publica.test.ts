import { describe, it, expect } from 'vitest';
import { vistaPublica, type EstadoAmbito, type VistaPublica } from '../vista-publica';

describe('vistaPublica contract compliance', () => {
  const baseTime = Date.now();
  const fiveMinAgo = new Date(baseTime - 5 * 60 * 1000).toISOString();

  /** Helper to create a minimal EstadoAmbito with given visibilidad */
  function makeEstado(visibilidad: 'publico' | 'privado' | 'miembros'): EstadoAmbito {
    return {
      ambito: {
        nombre: 'Test Ambito',
        visibilidad,
      },
      olas: [
        {
          nombre: 'Ola 1',
          avance: 50,
          tareas: [
            { id: '1', titulo: 'Tarea 1', estado: 'completed', prompt: 'PROMPT-SECRETO', archivos: ['ruta/privada.ts'], registro: 'registro', proveedor: 'proveedor-x' },
            { id: '2', titulo: 'Tarea 2', estado: 'in_progress' },
          ],
        },
      ],
      integradas: [
        { titulo: 'Integrada 1', fecha: '2026-10-01', archivos: ['file.ts'], commit: 'abc123' },
      ],
      motor: {
        estado: 'activo',
        ultimo_reporte: fiveMinAgo,
        proveedores: ['proveedor-x', 'proveedor-y'],
      },
      medidores: {
        creditos: 123.45,
      },
      chat: [
        { canal: 'publico', autor: 'user1', texto: 'Hello public' },
        { canal: 'interno', autor: 'user2', texto: 'Secret message' },
        { canal: 'publico', autor: 'user3', texto: 'Another public' },
      ],
    };
  }

  describe('returns null for non-public visibilidad', () => {
    it('privado -> null', () => {
      const estado = makeEstado('privado');
      expect(vistaPublica(estado)).toBeNull();
    });

    it('miembros -> null', () => {
      const estado = makeEstado('miembros');
      expect(vistaPublica(estado)).toBeNull();
    });
  });

  describe('public view whitelist', () => {
    it('returns correct public view when visibilidad is publico', () => {
      const estado = makeEstado('publico');
      const result = vistaPublica(estado);

      expect(result).not.toBeNull();
      if (result === null) return;

      expect(result.nombre).toBe('Test Ambito');
      expect(result.olas).toHaveLength(1);
      expect(result.olas[0]).toEqual({
        nombre: 'Ola 1',
        avance: 50,
        tareas: [
          { titulo: 'Tarea 1', estado: 'completed' },
          { titulo: 'Tarea 2', estado: 'in_progress' },
        ],
      });
      expect(result.integradas).toHaveLength(1);
      expect(result.integradas[0]).toEqual({ titulo: 'Integrada 1', fecha: '2026-10-01' });
      expect(result.motor).toEqual({
        estado: 'activo',
        haceMin: expect.any(Number),
      });
      // haceMin should be around 5
      expect(result.motor.haceMin).toBeGreaterThanOrEqual(4);
      expect(result.motor.haceMin).toBeLessThanOrEqual(6);
      expect(result.avanceMedio).toBe(50); // single ola
      expect(result.chat).toHaveLength(2);
      expect(result.chat[0]).toEqual({ autor: 'user1', texto: 'Hello public' });
      expect(result.chat[1]).toEqual({ autor: 'user3', texto: 'Another public' });
    });
  });

  describe('private data not exposed', () => {
    it('JSON.stringify does not contain private prompt, file, provider, creditos, or internal chat', () => {
      const estado = makeEstado('publico');
      const result = vistaPublica(estado);
      expect(result).not.toBeNull();
      if (result === null) return;

      const json = JSON.stringify(result);
      // These should NOT appear in the output
      expect(json).not.toContain('PROMPT-SECRETO');
      expect(json).not.toContain('ruta/privada.ts');
      expect(json).not.toContain('proveedor-x');
      expect(json).not.toContain('123.45');
      expect(json).not.toContain('Secret message');
      expect(json).not.toContain('registro');
      expect(json).not.toContain('file.ts');
      expect(json).not.toContain('abc123');
      // Ensure public data IS present
      expect(json).toContain('Hello public');
      expect(json).toContain('Another public');
      expect(json).toContain('Test Ambito');
      expect(json).toContain('Ola 1');
      expect(json).toContain('Integrada 1');
    });
  });

  describe('average advance calculation', () => {
    it('computes correct avanceMedio across multiple olas', () => {
      const estado: EstadoAmbito = {
        ambito: { nombre: 'Test', visibilidad: 'publico' },
        olas: [
          { nombre: 'Ola A', avance: 30, tareas: [{ id: 'a', titulo: 'Tarea A', estado: 'done' }] },
          { nombre: 'Ola B', avance: 70, tareas: [{ id: 'b', titulo: 'Tarea B', estado: 'done' }] },
          { nombre: 'Ola C', avance: 80, tareas: [{ id: 'c', titulo: 'Tarea C', estado: 'done' }] },
        ],
        integradas: [],
        motor: { estado: 'idle', ultimo_reporte: new Date().toISOString() },
        chat: [],
      };
      const result = vistaPublica(estado);
      expect(result).not.toBeNull();
      if (result === null) return;
      // (30+70+80)/3 = 60
      expect(result.avanceMedio).toBeCloseTo(60);
    });
  });
});