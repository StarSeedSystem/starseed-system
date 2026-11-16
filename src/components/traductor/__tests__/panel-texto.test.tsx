import { describe, it, expect } from 'vitest';
import { traducirInterno } from '../panel-texto';
import type { ResultadoTraductor } from '@/lib/traductor/tipos';

describe('traducirInterno', () => {
  it('devuelve texto y motor cuando servicio responde', async () => {
    const mockServicio = {
      traducir: (texto: string, destino: string) => {
        const r: ResultadoTraductor = {
          texto: `${texto} -> ${destino}`,
          origenDetectado: 'auto',
          motor: 'malla',
          local: true,
          ms: 0,
        };
        return Promise.resolve(r);
      },
    } as any;
    const res = await traducirInterno('hola', 'es', mockServicio as any);
    expect(res.texto).toBe('hola -> es');
    expect(res.motor).toBe('malla');
  });
});