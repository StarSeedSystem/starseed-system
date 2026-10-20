import { describe, it, expect } from 'vitest';
import { elegirCandidatos, Tarea, OfertaContexto, Preferencias, Candidato } from '../escalera';

describe('elegirCandidatos', () => {
  it('should return an empty array for now', () => {
    const tarea: Tarea = {
      papel: 'escritor',
      privado: false,
      tamano: 1000,
    };
    const ofertas: OfertaContexto[] = [];
    const catalogo: any[] = []; // We'll type this later
    const vinculadas = new Set<string>();
    const preferencias: Preferencias = {
      permitirPago: false,
      topeDiario: null,
      prohibidos: [],
    };

    const resultado = elegirCandidatos({ tarea, ofertas, catalogo, vinculadas, preferencias });
    expect(resultado).toEqual([]);
  });
});