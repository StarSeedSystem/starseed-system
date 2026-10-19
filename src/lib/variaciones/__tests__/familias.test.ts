// Pruebas para el registro de familias de variaciones públicas
import { describe, it, expect, beforeEach } from 'vitest';
import type { AdaptadorFamilia } from '../familias';
import { registrarFamilia, adaptadorDe, familiasRegistradas, __resetRegistros } from '../familias';

describe('familias', () => {
  beforeEach(() => {
    __resetRegistros();
  });

  it('should register a family and retrieve it by key', () => {
    // Arrange
    const adaptador: AdaptadorFamilia<string> = {
      familia: 'widget',
      nombre: 'Widget Adapter',
      capturar: (clave) => {
        if (clave.startsWith('widget:')) {
          return clave.split(':')[1];
        }
        return null;
      },
      validar: (payload) => {
        if (typeof payload === 'string') {
          return { ok: true, payload };
        }
        return { ok: false, motivos: ['Payload must be a string'] };
      },
      aplicar: (clave, payload) => ({
        deshacer: () => {
          // No-op for test
        },
      }),
      vistaPrevia: (payload) => ({
        tipo: 'widget',
        contenido: payload,
      }),
    };

    // Act
    registrarFamilia(adaptador);

    // Assert
    const retrieved = adaptadorDe('widget:clima');
    expect(retrieved).toEqual(adaptador);
  });

  it('should return null for unknown family', () => {
    // Act
    const result = adaptadorDe('unknown:clave');
    // Assert
    expect(result).toBeNull();
  });

  it('should list registered families', () => {
    // Arrange
    const adaptador1: AdaptadorFamilia<string> = {
      familia: 'fam1',
      nombre: 'Adapter 1',
      capturar: () => null,
      validar: () => ({ ok: true, payload: '' }),
      aplicar: () => ({ deshacer: () => {} }),
    };

    const adaptador2: AdaptadorFamilia<number> = {
      familia: 'fam2',
      nombre: 'Adapter 2',
      capturar: () => null,
      validar: () => ({ ok: true, payload: 0 }),
      aplicar: () => ({ deshacer: () => {} }),
    };

    // Act
    registrarFamilia(adaptador1);
    registrarFamilia(adaptador2);
    const families = familiasRegistradas();

    // Assert
    expect(families).toContain('fam1');
    expect(families).toContain('fam2');
    expect(families.length).toBe(2);
  });
});