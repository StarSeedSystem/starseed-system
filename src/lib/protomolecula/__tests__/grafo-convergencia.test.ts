import { describe, it, expect } from 'vitest';
import { 
  normalizarFormato,
  atomo,
  def,
  analizarConvergencia,
  sinRuta,
  buscar
} from '../grafo-convergencia';

describe('normalizarFormato', () => {
  it('pasa a minúsculas y quita el punto inicial', () => {
    expect(normalizarFormato('.PNG')).toBe('png');
    expect(normalizarFormato(' Mp3 ')).toBe('mp3');
  });
});

describe('analizarConvergencia', () => {
  it('cadena lineal: orden respeta las dependencias', () => {
    const atomos = [atomo('c', 'gen'), atomo('a', 'gen'), atomo('b', 'visor')];
    const defs = new Map([
      ['gen', def({ herramientaId: 'gen', salidas: ['png'] })],
      ['visor', def({ herramientaId: 'visor', entradas: ['png'], salidas: [] })],
    ]);
    const aristas: { de: string; a: string }[] = [{ de: 'a', a: 'b' }];
    const d = analizarConvergencia(atomos, aristas, (id) => defs.get(id), sinRuta);
    expect(d.ok).toBe(true);
    expect(d.orden.indexOf('a')).toBeLessThan(d.orden.indexOf('b'));
  });

  it('diamante: los dos caminos convergen y el final va último', () => {
    const atomos = [atomo('a', 'gen'), atomo('b', 'mez'), atomo('c', 'mez'), atomo('d', 'visor')];
    const defs = new Map([
      ['gen', def({ herramientaId: 'gen', salidas: ['png'] })],
      ['mez', def({ herramientaId: 'mez', entradas: ['png'], salidas: ['png'] })],
      ['visor', def({ herramientaId: 'visor', entradas: ['png'] })],
    ]);
    const aristas: { de: string; a: string }[] = [
      { de: 'a', a: 'b' },
      { de: 'a', a: 'c' },
      { de: 'b', a: 'd' },
      { de: 'c', a: 'd' },
    ];
    const d = analizarConvergencia(atomos, aristas, (id) => defs.get(id), sinRuta);
    expect(d.ok).toBe(true);
    expect(d.orden).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ciclo simple: ok es false y el ciclo se detalla', () => {
    const atomos = [atomo('a', 'gen'), atomo('b', 'gen')];
    const defs = new Map([[ 'gen', def({ herramientaId: 'gen', entradas: ['png'], salidas: ['png'] })]]);
    const d = analizarConvergencia(
      atomos,
      [{ de: 'a', a: 'b' }, { de: 'b', a: 'a' }],
      (id) => defs.get(id),
      sinRuta,
    );
    expect(d.ok).toBe(false);
    expect(d.ciclos).toHaveLength(1);
    expect(new Set(d.ciclos[0])).toEqual(new Set(['a', 'b']));
    expect(d.orden).toEqual([]);
    expect(d.avisos.some((a) => a.includes('Ciclo'))).toBe(true);
  });

  it('ciclo con cola: lo ordenable queda en `orden`', () => {
    const atomos = [atomo('a', 'gen'), atomo('b', 'gen'), atomo('c', 'visor')];
    const defs = new Map([
      ['gen', def({ herramientaId: 'gen', entradas: ['png'], salidas: ['png'] })],
      ['visor', def({ herramientaId: 'visor', entradas: ['png'] })],
    ]);
    const aristas: { de: string; a: string }[] = [{ de: 'a', a: 'b' }, { de: 'b', a: 'a' }, { de: 'c', a: 'a' }];
    const d = analizarConvergencia(atomos, aristas, (id) => defs.get(id), sinRuta);
    expect(d.ok).toBe(false);
    expect(d.orden).toEqual(['c']);
    expect(new Set(d.ciclos[0])).toEqual(new Set(['a', 'b']));
  });

  it('orden estable: desempate por el orden de entrada de `atomos`', () => {
    const atomos = [atomo('z', 'gen'), atomo('m', 'gen'), atomo('a', 'gen')];
    const defs = new Map([[ 'gen', def({ herramientaId: 'gen', salidas: ['png'] })]]);
    const d = analizarConvergencia(atomos, [], (id) => defs.get(id), sinRuta);
    expect(d.orden).toEqual(['z', 'm', 'a']);
  });

  it('formato directo (normalizado): arista compatible sin conversión', () => {
    const atomos = [atomo('a', 'img'), atomo('b', 'visor')];
    const d = analizarConvergencia(atomos, [{ de: 'a', a: 'b' }], buscar, sinRuta);
    expect(d.ok).toBe(true);
    expect(d.conversiones).toHaveLength(0);
    expect(d.incompatibles).toHaveLength(0);
  });

  it('conversión de dos pasos vía `rutaDe`: la arista va a `conversiones` con la ruta', () => {
    const atomos = [atomo('a', 'img'), atomo('b', 'audio')];
    const rutaDe = (de: string, a: string) =>
      de === 'png' && a === 'wav' ? ['tiff', 'pcm'] : null;
    const d = analizarConvergencia(atomos, [{ de: 'a', a: 'b' }], buscar, rutaDe);
    expect(d.ok).toBe(true);
    expect(d.conversiones).toEqual([{ arista: { de: 'a', a: 'b' }, ruta: ['tiff', 'pcm'] }]);
  });

  it('incompatible: sin formato común y sin ruta', () => {
    const atomos = [atomo('a', 'img'), atomo('b', 'audio')];
    const d = analizarConvergencia(atomos, [{ de: 'a', a: 'b' }], buscar, sinRuta);
    expect(d.ok).toBe(false);
    expect(d.incompatibles).toHaveLength(1);
    expect(d.incompatibles[0].salidas).toEqual(['png']);
    expect(d.incompatibles[0].entradas).toEqual(['wav']);
  });

  it('átomo con herramienta desconocida: incompatible con aviso en español', () => {
    const atomos = [atomo('a', 'fantasma'), atomo('b', 'visor')];
    const d = analizarConvergencia(atomos, [{ de: 'a', a: 'b' }], buscar, sinRuta);
    expect(d.ok).toBe(false);
    expect(d.incompatibles).toHaveLength(1);
    expect(d.avisos.some((a) => a.includes('Herramienta desconocida: fantasma'))).toBe(true);
  });

  it('destino sin entradas declaradas: incompatible, «no recibe archivos»', () => {
    const atomos = [atomo('a', 'img'), atomo('b', 'mute')];
    const d = analizarConvergencia(atomos, [{ de: 'a', a: 'b' }], buscar, sinRuta);
    expect(d.ok).toBe(false);
    expect(d.incompatibles).toHaveLength(1);
    expect(d.avisos.some((a) => a.includes('La herramienta Solo muestra no recibe archivos'))).toBe(true);
  });

  it('arista a un átomo que no está en la molécula: se ignora con aviso', () => {
    const atomos = [atomo('a', 'img')];
    const d = analizarConvergencia(atomos, [{ de: 'a', a: 'fantasma' }], buscar, sinRuta);
    expect(d.ok).toBe(true);
    expect(d.incompatibles).toHaveLength(0);
    expect(d.avisos.some((a) => a.includes('no está en la molécula'))).toBe(true);
    expect(d.orden).toEqual(['a']);
  });
});
