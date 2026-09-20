import { describe, it, expect } from 'vitest';
import {
  leerEstadoBitnet,
  diagnostico,
  recomendacion,
} from '../bitnet-estado';

describe('bitnet-estado', () => {
  it('fixture 1: vivo rápido', () => {
    const raw = { salud: { vivo: true, tok_s: 9.2, swap_mb: 1024, ram_libre_mb: 3000 } };
    const est = leerEstadoBitnet(raw);
    expect(diagnostico(est)).toEqual({ tono: 'verde', frase: 'BitNet responde a 9.2 tok/s' });
    expect(recomendacion(est)).toBeNull();
  });

  it('fixture 2: vivo lento', () => {
    const raw = { salud: { vivo: true, tok_s: 3.5, swap_mb: 2048, ram_libre_mb: 200 } };
    const est = leerEstadoBitnet(raw);
    expect(diagnostico(est)).toEqual({ tono: 'ambar', frase: 'lento: la máquina va justa' });
    expect(recomendacion(est)).toBe('dormir');
  });

  it('fixture 3: paginado', () => {
    const raw = { salud: { vivo: false, swap_mb: 9000, ram_libre_mb: 500 } };
    const est = leerEstadoBitnet(raw);
    expect(diagnostico(est)).toEqual({
      tono: 'rojo',
      frase: 'paginado a disco: la Mac no tiene RAM para BitNet y el enjambre a la vez',
    });
    expect(recomendacion(est)).toBe('dormir');
  });

  it('fixture 4: sin respuesta', () => {
    const raw = { salud: { vivo: false, swap_mb: 1024, ram_libre_mb: 3000 } };
    const est = leerEstadoBitnet(raw);
    expect(diagnostico(est)).toEqual({ tono: 'rojo', frase: 'sin respuesta' });
    expect(recomendacion(est)).toBe('despertar');
  });

  it('fixture 5: sin datos', () => {
    const estNull = leerEstadoBitnet(null);
    expect(diagnostico(estNull)).toEqual({ tono: 'gris', frase: 'Sin datos de BitNet' });
    expect(recomendacion(estNull)).toBeNull();

    const estEmpty = leerEstadoBitnet({});
    expect(diagnostico(estEmpty)).toEqual({ tono: 'gris', frase: 'Sin datos de BitNet' });
    expect(recomendacion(estEmpty)).toBeNull();

    expect(diagnostico(null)).toEqual({ tono: 'gris', frase: 'Sin datos de BitNet' });
    expect(recomendacion(null)).toBeNull();
  });
});
