import { describe, it, expect } from 'vitest';
import { vistaPublica, type EstadoAmbito } from '../vista-publica';

describe('vistaPublica (null cases)', () => {
  it('returns null when visibilidad is privado', () => {
    const estado: EstadoAmbito = {
      ambito: {
        nombre: 'Test Ambito',
        visibilidad: 'privado',
      },
      olas: [],
      integradas: [],
      motor: {
        estado: 'activo',
        ultimo_reporte: new Date().toISOString(),
      },
      chat: [],
    };

    expect(vistaPublica(estado)).toBeNull();
  });

  it('returns null when visibilidad is miembros', () => {
    const estado: EstadoAmbito = {
      ambito: {
        nombre: 'Members Ambito',
        visibilidad: 'miembros',
      },
      olas: [],
      integradas: [],
      motor: {
        estado: 'activo',
        ultimo_reporte: new Date().toISOString(),
      },
      chat: [],
    };

    expect(vistaPublica(estado)).toBeNull();
  });
});