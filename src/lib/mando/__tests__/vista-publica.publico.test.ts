import { describe, it, expect } from 'vitest';
import { vistaPublica, type EstadoAmbito, type VistaPublica } from '../vista-publica';

describe('vistaPublica (publico cases)', () => {
  it('returns public view when visibilidad is publico', () => {
    const now = Date.now();
    const unoReporte = new Date(now - 5 * 60 * 1000).toISOString(); // 5 minutes ago
    const estado: EstadoAmbito = {
      ambito: {
        nombre: 'Public Ambito',
        visibilidad: 'publico',
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
        {
          nombre: 'Ola 2',
          avance: 30,
          tareas: [
            { id: '3', titulo: 'Tarea 3', estado: 'pending' },
          ],
        },
      ],
      integradas: [
        { titulo: 'Integrada 1', fecha: '2026-10-01', archivos: ['file.ts'], commit: 'abc123' },
        { titulo: 'Integrada 2', fecha: '2026-10-02' },
      ],
      motor: {
        estado: 'activo',
        ultimo_reporte: unoReporte,
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

    const result = vistaPublica(estado);

    expect(result).not.toBeNull();
    if (result === null) return;

    expect(result.nombre).toBe('Public Ambito');
    expect(result.olas).toHaveLength(2);
    expect(result.olas[0]).toEqual({
      nombre: 'Ola 1',
      avance: 50,
      tareas: [
        { titulo: 'Tarea 1', estado: 'completed' },
        { titulo: 'Tarea 2', estado: 'in_progress' },
      ],
    });
    expect(result.olas[1]).toEqual({
      nombre: 'Ola 2',
      avance: 30,
      tareas: [
        { titulo: 'Tarea 3', estado: 'pending' },
      ],
    });
    expect(result.integradas).toHaveLength(2);
    expect(result.integradas[0]).toEqual({ titulo: 'Integrada 1', fecha: '2026-10-01' });
    expect(result.integradas[1]).toEqual({ titulo: 'Integrada 2', fecha: '2026-10-02' });
    expect(result.motor).toEqual({
      estado: 'activo',
      haceMin: expect.any(Number),
    });
    expect(result.motor.haceMin).toBeGreaterThanOrEqual(4);
    expect(result.motor.haceMin).toBeLessThanOrEqual(6);
    expect(result.avanceMedio).toBe(40); // (50+30)/2
    expect(result.chat).toHaveLength(2);
    expect(result.chat[0]).toEqual({ autor: 'user1', texto: 'Hello public' });
    expect(result.chat[1]).toEqual({ autor: 'user3', texto: 'Another public' });
  });

  it('handles empty olas array', () => {
    const estado: EstadoAmbito = {
      ambito: {
        nombre: 'Test Ambito',
        visibilidad: 'publico',
      },
      olas: [],
      integradas: [],
      motor: {
        estado: 'activo',
        ultimo_reporte: new Date().toISOString(),
      },
      chat: [],
    };

    const result = vistaPublica(estado);

    expect(result).not.toBeNull();
    if (result === null) return;

    expect(result.avanceMedio).toBe(0);
    expect(result.olas).toHaveLength(0);
    expect(result.integradas).toHaveLength(0);
    expect(result.chat).toHaveLength(0);
    expect(result.motor.estado).toBe('activo');
    expect(result.motor.haceMin).toBeGreaterThanOrEqual(0);
  });
});