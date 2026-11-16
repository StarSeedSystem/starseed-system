import { describe, it, expect } from 'vitest';
import { leerSenalesPublicadas } from '../leer-senales';

describe('leerSenalesPublicadas', () => {
  it('debe filtrar las señales propias y limitar a 500', async () => {
    const cliente = {
      from: () => ({
        select: () => ({
          order: () => ({
            limit: () => ({
              data: [
                { id: '1', uid: 'user1', valor: 10, capa: 'publica', medido_en: '2026-11-16T10:00:00Z' },
                { id: '2', uid: 'user2', valor: 20, capa: 'publica', medido_en: '2026-11-16T10:01:00Z' },
              ],
              error: null,
            }),
          }),
        }),
      }),
    };
    const resultado = await leerSenalesPublicadas({ cliente, uid: 'user1' });
    expect(resultado.estado).toBe('ok');
    expect(resultado.senales.length).toBe(1);
    expect(resultado.senales[0].uid).toBe('user2');
  });

  it('debe devolver sin-tabla si la tabla no existe', async () => {
    const cliente = {
      from: () => ({
        select: () => ({
          order: () => ({
            limit: () => ({
              data: null,
              error: { code: '42P01', message: 'Table not found' },
            }),
          }),
        }),
      }),
    };
    const resultado = await leerSenalesPublicadas({ cliente, uid: 'user1' });
    expect(resultado.estado).toBe('sin-tabla');
  });
});
