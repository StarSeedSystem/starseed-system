import { describe, it, expect } from 'vitest';
import type { AdaptadorFamilia } from '../familias';
import { registrarFamilia, adaptadorDe, familiasRegistradas } from '../familias';

describe('familias', () => {
  // Reset the registry before each test to avoid interference
  // Note: Since the registry is not exported, we cannot reset it directly.
  // Instead, we will use unique family names in each test.

  it('should register and retrieve an adapter', () => {
    const familia = 'test-familia';
    const adapter: AdaptadorFamilia<string> = {
      familia,
      nombre: 'Test Adapter',
      capturar: (clave) => {
        if (clave.startsWith(`${familia}:`)) {
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
      aplicar: (clave, payload) => {
        return () => {
          // undo logic (if any)
        };
      },
      vistaPrevia: (payload) => {
        return { preview: payload };
      },
    };

    registrarFamilia(adapter);

    const retrieved = adaptadorDe(`${familia}:something`);
    expect(retrieved).toEqual(adapter);

    const allFamilies = familiasRegistradas();
    expect(allFamilies).toHaveLength(1);
    expect(allFamilies[0]).toEqual(adapter);
  });

  it('should return null for unknown family', () => {
    const retrieved = adaptadorDe('unknown-familia:something');
    expect(retrieved).toBeNull();
  });

  it('should validate payload correctly', () => {
    const familia = 'validation-test';
    const adapter: AdaptadorFamilia<number> = {
      familia,
      nombre: 'Validation Adapter',
      capturar: () => 42,
      validar: (payload) => {
        if (typeof payload === 'number') {
          return { ok: true, payload };
        }
        return { ok: false, motivos: ['Must be a number'] };
      },
      aplicar: (clave, payload) => () => {},
    };

    registrarFamilia(adapter);

    const validResult = adapter.validar(10);
    expect(validResult).toEqual({ ok: true, payload: 10 });

    const invalidResult = adapter.validar('not a number');
    expect(invalidResult).toEqual({ ok: false, motivos: ['Must be a number'] });
  });
});