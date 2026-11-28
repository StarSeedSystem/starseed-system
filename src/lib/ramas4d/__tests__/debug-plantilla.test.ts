import { describe, it } from 'vitest';
import { construirPlantillaEducacion, type RamaEducativa } from '../plantillas/educacion';
function rama(id: string, extra: Partial<RamaEducativa> = {}): RamaEducativa {
  return { id, titulo: `Rama ${id}`, formato: 'leccion', ref: `/educacion/${id}`, ...extra };
}
describe('debug', () => {
  it('log', () => {
    const r = rama('sub-cuantica', { formato: 'video', prerequisitos: ['top-fisica'] });
    console.log('RAMA', JSON.stringify(r));
    const p = construirPlantillaEducacion({ rutas: [{ id: 'cat-ciencia', titulo: 'Ciencia', ramas: [rama('top-fisica'), r] }] });
    console.log('ARISTAS', p.grafo.aristas);
  });
});
