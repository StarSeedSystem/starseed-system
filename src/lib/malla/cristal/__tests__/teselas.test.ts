// Pruebas de teselas.ts: CRDT, huella común, caducidad y peor medida.
import { describe, it, expect } from 'vitest';
import {
  caducarTeselas,
  canonico,
  fusionar,
  huellaReticula,
  senalesDeReticula,
} from '../teselas';
import type { NeuronaReticula, SenalMedida, Tesela } from '../tipos';

function neurona(id: string): NeuronaReticula {
  return { id, cuenta: 'c1', capacidad: { ramGb: 8, bateriaPct: 90, cargando: false }, medios: ['lora'] };
}

function tesela(origen: string, reloj: number, senales: SenalMedida[] = [], firma?: string): Tesela {
  return { origen, reloj, neurona: neurona(origen), senales, firma };
}

function senal(de: string, a: string, extra: Partial<SenalMedida> = {}): SenalMedida {
  return { de, a, medio: 'lora', vistaEn: 1000, ...extra };
}

describe('canonico y huellaReticula', () => {
  it('ordena claves a cualquier profundidad', () => {
    expect(canonico({ b: { d: 1, c: 2 }, a: 3 })).toBe(canonico({ a: 3, b: { c: 2, d: 1 } }));
  });

  it('la huella ignora el campo firma y el orden de inserción', () => {
    const a = tesela('n1', 1, [senal('n1', 'n2')], 'f1');
    const b = tesela('n2', 1, [], 'f2');
    const sin = fusionar({ teselas: {} }, { teselas: { n1: { ...a, firma: 'otra' }, n2: b } });
    const con = fusionar({ teselas: { n2: b } }, { teselas: { n1: a } });
    expect(huellaReticula(sin)).toBe(huellaReticula(con));
  });
});

describe('fusionar (CRDT)', () => {
  const t1 = tesela('n1', 5, [senal('n1', 'n2', { rssiDbm: -70 })]);
  const t1vieja = tesela('n1', 3, [senal('n1', 'n2', { rssiDbm: -10 })]);
  const t2 = tesela('n2', 4, [senal('n2', 'n1', { rssiDbm: -80 })]);
  const t3 = tesela('n3', 2);

  it('fusionar en dos órdenes distintos da la misma huella', () => {
    const ab = fusionar(fusionar({ teselas: { n1: t1 } }, { teselas: { n2: t2 } }), { teselas: { n3: t3 } });
    const ba = fusionar(fusionar({ teselas: { n3: t3 } }, { teselas: { n2: t2 } }), { teselas: { n1: t1 } });
    expect(huellaReticula(ab)).toBe(huellaReticula(ba));
    expect(ab).toEqual(ba);
  });

  it('la tesela vieja no pisa a la nueva', () => {
    const r = fusionar({ teselas: { n1: t1 } }, { teselas: { n1: t1vieja } });
    expect(r.teselas.n1.reloj).toBe(5);
    const r2 = fusionar({ teselas: { n1: t1vieja } }, { teselas: { n1: t1 } });
    expect(r2.teselas.n1.reloj).toBe(5);
  });

  it('empate de reloj: determinista (mismo ganador en ambos órdenes)', () => {
    const x = tesela('n1', 5, [senal('n1', 'n2', { rssiDbm: -70 })] , 'a');
    const y = tesela('n1', 5, [senal('n1', 'n2', { rssiDbm: -71 })] , 'b');
    const r1 = fusionar({ teselas: { n1: x } }, { teselas: { n1: y } });
    const r2 = fusionar({ teselas: { n1: y } }, { teselas: { n1: x } });
    expect(r1.teselas.n1).toEqual(r2.teselas.n1);
  });
});

describe('caducarTeselas', () => {
  it('caduca la tesela sin latido en 3 latidos y conserva la fresca', () => {
    const vieja = tesela('n1', 1, [senal('n1', 'n2', { vistaEn: 0 })]);
    const fresca = tesela('n2', 1, [senal('n2', 'n3', { vistaEn: 14_000 })]);
    const sin = tesela('n3', 1); // sin señales: se conserva
    const r = caducarTeselas({ teselas: { n1: vieja, n2: fresca, n3: sin } }, 16_000);
    expect(Object.keys(r.teselas).sort()).toEqual(['n2', 'n3']);
  });
});

describe('senalesDeReticula', () => {
  it('las dos puntas de un enlace se combinan en la peor medida', () => {
    const tu1 = tesela('n1', 1, [senal('n1', 'n2', { rssiDbm: -90, rttMs: 40, perdidaPct: 1, vistaEn: 500 })]);
    const tu2 = tesela('n2', 1, [senal('n2', 'n1', { rssiDbm: -60, rttMs: 10, perdidaPct: 5, vistaEn: 900 })]);
    const [s] = senalesDeReticula(fusionar({ teselas: { n1: tu1 } }, { teselas: { n2: tu2 } }));
    expect(s).toMatchObject({ de: 'n1', a: 'n2', rssiDbm: -90, rttMs: 40, perdidaPct: 5, vistaEn: 900 });
  });
});
