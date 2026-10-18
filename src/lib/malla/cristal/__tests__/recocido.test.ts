import { describe, expect, it } from 'vitest';
import type { Cristal, Medio, NeuronaReticula, Puente, Reticula, SenalMedida } from '../tipos';
import { cristalizar } from '../cristalizacion';
import { costeSenal } from '../coste';
import { margenHisteresis, recocer, relajarLocal, vecindario } from '../recocido';
type Arista = [string, string, number, Medio?];
// Sin medios declarados: solo cuentan las señales medidas (ningún candidato estimado por Delaunay).
const neurona = (id: string, bateriaPct: number | null, esRouter: boolean): NeuronaReticula =>
  ({ id, cuenta: 'c1', esRouter, capacidad: { ramGb: 4, bateriaPct, cargando: bateriaPct === null }, medios: [] });
const senal = ([de, a, rssiDbm, medio]: Arista): SenalMedida => ({ de, a, medio: medio ?? 'wifi-lan', rssiDbm, vistaEn: 1 });
// Cada señal la publica la tesela de `de`; el orden de `ids` es el orden en que llegan las teselas.
const reticula = (ids: string[], aristas: Arista[], bateria: Record<string, number> = {}, routers: string[] = []):
  Reticula => ({ teselas: Object.fromEntries(ids.map(id => [id, {
    origen: id, reloj: 1, senales: aristas.filter(([de]) => de === id).map(senal),
    neurona: neurona(id, bateria[id] ?? null, routers.includes(id)) }] as const)) });
const pares = (c: Cristal): string[] => c.puentes.map(p => [p.a, p.b].sort().join('-')).sort();
const conexa = (c: Cristal, ids: string[]): boolean => vecindario(c, ids[0], Infinity).size === ids.length;
const linea = (n: number): string[] => Array.from({ length: n }, (_, i) => `n${i}`);
const enLinea = (ids: string[]): Arista[] => ids.slice(1).map((id, i): Arista => [ids[i], id, -50]);
const ABCD = enLinea(['a', 'b', 'c', 'd']);
const IDS = ['a', 'b', 'c', 'd', 'x'];
// x medía a (coste 0,40) y ahora mide c un 20 % mejor (0,32): más que el 5 % fundido, menos que el 30 % vítreo.
const PREVIO_X = relajarLocal(null, reticula(IDS, [...ABCD, ['x', 'a', -60]]), []);
const CON_XC: Arista[] = [...ABCD, ['x', 'a', -60], ['x', 'c', -56]];
const R1_X = reticula(IDS, CON_XC);
describe('margenHisteresis y vecindario', () => {
  it('el margen va lineal del 30 % vítreo al 5 % fundido y se acota', () => {
    for (const [t, m] of [[0, 0.3], [1, 0.05], [0.5, 0.175], [-3, 0.3], [9, 0.05]]) expect(margenHisteresis(t)).toBeCloseTo(m);
  });
  it('el vecindario reúne las neuronas a ≤ 2 saltos, o los saltos que se pidan', () => {
    const c = cristalizar(reticula(linea(5), enLinea(linea(5))));
    const v = (o: string, s?: number): string[] => [...vecindario(c, o, s)].sort();
    expect([v('n0'), v('n2', 1), v('otra'), v('n0', Infinity).length]).toEqual([['n0', 'n1', 'n2'], ['n1', 'n2', 'n3'], ['otra'], 5]);
  });
});
describe('relajarLocal', () => {
  it('sin cristal previo cristaliza entero', () => expect(relajarLocal(null, R1_X, [])).toEqual(cristalizar(R1_X)));
  it('solo reordena el vecindario de 2 saltos: más allá no se toca aunque el propuesto cambie', () => {
    const ids = linea(10), previo = relajarLocal(null, reticula(ids, enLinea(ids)), []);
    // Cambia n0. Sin declararlo, n2 (a 2 saltos) pasa de medir n3 a medir n4, y n3 (a 3) de medir n4 a medir n5.
    const r1 = reticula(ids, [...enLinea(ids).filter(([de]) => !['n0', 'n2', 'n3'].includes(de)),
      ['n0', 'n1', -60], ['n2', 'n4', -45], ['n3', 'n5', -45]]);
    expect(pares(cristalizar(r1))).toEqual(expect.arrayContaining(['n2-n4', 'n3-n5']));
    const res = relajarLocal(previo, r1, ['n0']), vigilados = ['n0-n1', 'n2-n4', 'n3-n4', 'n3-n5'];
    expect(pares(res).filter(k => vigilados.includes(k))).toEqual(['n0-n1', 'n2-n4', 'n3-n4']);
    const lejos = (c: Cristal): string[] => c.puentes
      .filter(p => [p.a, p.b].every(id => Number(id.slice(1)) >= 3)).map(p => JSON.stringify(p)).sort();
    expect(lejos(res)).toEqual(lejos(previo));
  });
  it('la histéresis depende de la temperatura del extremo; un titanio lleva siempre la máxima', () => {
    const fria = pares(PREVIO_X), caliente = ['a-b', 'b-c', 'c-d', 'c-x'];
    expect(pares(cristalizar(R1_X))).toEqual(caliente);
    // 20 % de mejora: pasa con márgenes del 5 % (t = 1) y 17,5 % (t = 0,5); no con 23,75 % (t = 0,25) ni 30 % (t = 0).
    for (const [t, esperado] of [[1, caliente], [0.5, caliente], [0.25, fria], [0, fria]] as const)
      expect(pares(relajarLocal(PREVIO_X, R1_X, ['x'], { temperatura: { x: t } }))).toEqual(esperado);
    expect(pares(relajarLocal(PREVIO_X, reticula(IDS, CON_XC, {}, ['a']), ['x'], { temperatura: { x: 1 } }))).toEqual(fria);
  });
  it('cambiar de medio entre las mismas neuronas también pasa la histéresis', () => {
    // Por BLE, a–b cuesta 0,16 en vez de 0,20 (20 % mejor): cambia en zona fundida, no en vítrea.
    const abc = ['a', 'b', 'c'], previo = relajarLocal(null, reticula(abc, [['a', 'b', -50], ['b', 'c', -50]]), []);
    const r1 = reticula(abc, [['a', 'b', -50], ['a', 'b', -48, 'ble'], ['b', 'c', -50]]);
    const medioAB = (t: number): string | undefined => relajarLocal(previo, r1, ['a'], { temperatura: { a: t, b: t } })
      .puentes.find(p => [p.a, p.b].sort().join('-') === 'a-b')?.medio;
    expect([medioAB(1), medioAB(0)]).toEqual(['ble', 'wifi-lan']);
  });
  it('en frío conserva un puente medido que el propuesto suelta sin sustituto, y hereda la temperatura', () => {
    const p = (a: string, b: string): Puente => ({ a, b, medio: 'wifi-lan', coste: 0.5 });
    const previo: Cristal = { puentes: [p('a', 'b'), p('b', 'c'), p('c', 'd'), p('a', 'd')], estado: 'vitreo',
      temperatura: { a: 0, b: 0, c: 0, d: 0 }, huella: 'h', coordinacion: { a: 2, b: 2, c: 2, d: 2 } };
    const r1 = reticula(['a', 'b', 'c', 'd'], [...ABCD, ['a', 'd', -55]]);
    expect(pares(cristalizar(r1))).not.toContain('a-d');
    const res = relajarLocal(previo, r1, ['a'], { temperatura: { a: 0 } });
    expect([pares(res).includes('a-d'), res.temperatura, res.estado]).toEqual([true, previo.temperatura, 'vitreo']);
  });
  it('misma entrada → mismos puentes en todas las neuronas, lleguen como lleguen las teselas', () => {
    const opc = { temperatura: { x: 1 } }, aqui = relajarLocal(PREVIO_X, R1_X, ['x', 'a'], opc);
    expect(JSON.stringify(relajarLocal(PREVIO_X, reticula([...IDS].reverse(), CON_XC), ['a', 'x'], opc))).toBe(JSON.stringify(aqui));
  });
  it('nunca desconecta: si quitar un puente parte la red, se conserva el previo', () => {
    const r1 = reticula(IDS, ABCD), res = relajarLocal(PREVIO_X, r1, ['x']); // x ya no mide a nadie
    expect([conexa(cristalizar(r1), IDS), conexa(res, IDS), pares(res).includes('a-x')]).toEqual([false, true, true]);
  });
  it('nunca desconecta a lo largo de una serie de cambios', () => {
    const ids = linea(7), todas: Arista[] = [...enLinea(ids), ['n0', 'n3', -55], ['n2', 'n5', -58]];
    let c = relajarLocal(null, reticula(ids, todas), []);
    for (let k = 0; k < ids.length; k++) { // la neurona k pierde sus medidas
      c = relajarLocal(c, reticula(ids, todas.filter(([de]) => de !== ids[k])), [ids[k]], { temperatura: { [ids[k]]: k / 6 } });
      expect(conexa(c, ids)).toBe(true);
    }
  });
});
describe('recocer', () => {
  const ids = ['a', 'b', 'c', 'd'], aristas: Arista[] = [['a', 'b', -85], ['a', 'c', -45], ['b', 'c', -50], ['c', 'd', -50]];
  const costes = new Map(aristas.map((x): [string, number] => [`${x[0]}-${x[1]}`, costeSenal(senal(x))]));
  const costeTotal = (c: Cristal): number => pares(c).reduce((t, k) => t + (costes.get(k) ?? 1), 0);
  const puente = (a: string, b: string): Puente => ({ a, b, medio: 'wifi-lan', coste: costes.get(`${a}-${b}`) ?? 1 });
  const inicial: Cristal = { puentes: [puente('a', 'b'), puente('b', 'c'), puente('c', 'd')], estado: 'vitreo',
    temperatura: {}, huella: 'h:3', coordinacion: {} };
  it('baja el coste total sin desconectar', () => {
    const r = reticula(ids, aristas), res = recocer(inicial, r);
    expect([costeTotal(res) < costeTotal(inicial), conexa(res, ids)]).toEqual([true, true]);
    expect(pares(recocer(inicial, r, 200))).toEqual(['a-c', 'b-c', 'c-d']);
  });
  it('misma huella y retícula → mismo recocido en todas las neuronas, lleguen como lleguen las teselas', () => {
    const n = linea(8), malla: Arista[] = n.flatMap((de, i) => n.slice(i + 1)
      .map((a, j): Arista => [de, a, -40 - ((i * 13 + j * 7) % 45)]).filter((_, j) => (i * 7 + j * 3) % 5 < 3));
    const r = reticula(n, malla), otra = reticula([...n].reverse(), malla);
    const base = (k: number): Cristal => ({ ...inicial, huella: `h#${k}`, puentes: enLinea(n).map(([a, b]) => puente(a, b)) });
    for (let k = 0; k < 12; k++) expect(JSON.stringify(recocer(base(k), otra))).toBe(JSON.stringify(recocer(base(k), r)));
    expect(pares(recocer(base(0), r))).not.toEqual(pares(base(0)));
  });
  it('no supera la coordinación del nuevo extremo ni le quita a una hoja su único puente', () => {
    const res = recocer(inicial, reticula(ids, aristas, { c: 10 }), 200); // c con batería baja: coordinación 2
    expect([res.coordinacion.c <= 2, pares(res)]).toEqual([true, ['a-b', 'a-c', 'c-d']]);
    const hoja = reticula(['e', 'o', 'y', 'x'], [['o', 'e', -85], ['e', 'y', -50], ['y', 'x', -50], ['e', 'x', -45]]);
    const res2 = recocer({ ...inicial, puentes: [puente('o', 'e'), puente('e', 'y'), puente('y', 'x')] }, hoja, 200);
    expect(conexa(res2, ['e', 'o', 'y', 'x']) && pares(res2).includes('e-o')).toBe(true);
  });
});
