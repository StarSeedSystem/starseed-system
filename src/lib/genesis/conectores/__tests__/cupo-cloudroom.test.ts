import { describe, it, expect } from 'vitest';
import {
  CUPO_GRATIS_CICLO,
  Consumo,
  cupoRestante,
  cicloActual,
  repartir,
  ritmoDiario,
  puedeLanzar,
} from '../cupo-cloudroom';

const MS_DIA = 24 * 60 * 60 * 1000;
const INICIO = 1_700_000_000_000;
const DIA = MS_DIA;

const consumo = (contextoId: string, t: number, n: number): Consumo => ({ contextoId, t, n });

describe('cupoRestante', () => {
  it('ciclo nuevo: da el cupo completo del plan gratis', () => {
    expect(cupoRestante({ tipo: 'gratis' }, [], INICIO, INICIO)).toBe(CUPO_GRATIS_CICLO);
  });

  it('cuenta solo el consumo del ciclo vigente y descuenta', () => {
    const consumos: Consumo[] = [
      consumo('personal', INICIO + DIA, 20),
      consumo('grupos', INICIO + 2 * DIA, 10),
      consumo('personal', INICIO - DIA, 50),
    ];
    expect(cupoRestante({ tipo: 'gratis' }, consumos, INICIO, INICIO + 3 * DIA)).toBe(70);
  });

  it('cupo agotado: queda 0 como mínimo', () => {
    const consumos: Consumo[] = [consumo('personal', INICIO + 1, 100)];
    expect(cupoRestante({ tipo: 'gratis' }, consumos, INICIO, INICIO + 2)).toBe(0);
  });

  it('plan de pago sin cifra declarada: null, no inventa', () => {
    expect(cupoRestante({ tipo: 'pro', cupoCiclo: null }, [], INICIO, INICIO)).toBeNull();
    expect(
      cupoRestante({ tipo: 'super', cupoCiclo: null }, [], INICIO, INICIO),
    ).toBeNull();
  });

  it('plan de pago con cifra declarada: usa la cifra de la persona', () => {
    const consumos: Consumo[] = [consumo('personal', INICIO + 1, 25)];
    expect(
      cupoRestante({ tipo: 'ultra', cupoCiclo: 400 }, consumos, INICIO, INICIO + 2),
    ).toBe(375);
  });
});

describe('ritmoDiario', () => {
  it('redondeo hacia abajo: nunca agota antes del reinicio', () => {
    expect(ritmoDiario(100, 30)).toBe(3);
    expect(ritmoDiario(7, 2)).toBe(3);
    expect(ritmoDiario(1, 5)).toBe(0);
  });

  it('mínimo 0 y sin días negativos', () => {
    expect(ritmoDiario(0, 10)).toBe(0);
    expect(ritmoDiario(-4, 10)).toBe(0);
    expect(ritmoDiario(10, 0)).toBe(10);
  });
});

describe('repartir', () => {
  it('reparte por peso sin decimales y la sobra al de más peso', () => {
    expect(repartir(5, [{ id: 'a', peso: 1 }, { id: 'b', peso: 2 }])).toEqual({ a: 1, b: 4 });
    expect(repartir(5, [{ id: 'a', peso: 1 }, { id: 'b', peso: 1 }])).toEqual({ a: 3, b: 2 });
    expect(repartir(3, [{ id: 'a', peso: 2 }, { id: 'b', peso: 1 }])).toEqual({ a: 2, b: 1 });
    expect(repartir(4, [{ id: 'a', peso: 2 }, { id: 'b', peso: 1 }])).toEqual({ a: 3, b: 1 });
  });

  it('respeta reservas y reparte el resto por peso', () => {
    expect(
      repartir(100, [
        { id: 'a', peso: 1 },
        { id: 'b', peso: 1, reservado: 40 },
        { id: 'c', peso: 2 },
      ]),
    ).toEqual({ a: 15, b: 55, c: 30 });
  });

  it('reservas que agotan el cupo se honran por orden y en enteros', () => {
    expect(
      repartir(50, [{ id: 'a', peso: 1, reservado: 30 }, { id: 'b', peso: 3, reservado: 60 }]),
    ).toEqual({ a: 30, b: 20 });
  });

  it('sin cupo reparte 0 en todas las claves', () => {
    expect(repartir(0, [{ id: 'a', peso: 1 }])).toEqual({ a: 0 });
  });
});

describe('puedeLanzar', () => {
  it('plan de pago sin cifra declarada: no lanza y lo dice, sin error', () => {
    const plan = { tipo: 'pro' as const, cupoCiclo: null };
    const res = puedeLanzar('personal', plan, [], INICIO, INICIO);
    expect(res.ok).toBe(false);
    expect(res.motivo).toContain('sin cifra declarada');
    expect(res.motivo).toContain('pro');
  });

  it('ciclo nuevo con plan gratis: puede lanzar', () => {
    const res = puedeLanzar('personal', { tipo: 'gratis' }, [], INICIO, INICIO);
    expect(res.ok).toBe(true);
    expect(res.motivo).toContain('Puede lanzar');
  });

  it('cupo agotado: bloquea y dice cuándo renueva', () => {
    const plan = { tipo: 'gratis' } as const;
    const consumos = [consumo('personal', INICIO + 5, CUPO_GRATIS_CICLO)];
    const res = puedeLanzar('personal', plan, consumos, INICIO, INICIO + 10);
    expect(res.ok).toBe(false);
    expect(res.motivo).toContain('agotado');
  });

  it('respeta el reparto por contexto antes que el cupo de la cuenta', () => {
    const plan = { tipo: 'gratis' } as const;
    expect(
      puedeLanzar('personal', plan, [], INICIO, INICIO, { asignado: 5, diasQueQuedan: 2 }).ok,
    ).toBe(true);
    const res = puedeLanzar(
      'personal',
      plan,
      [consumo('personal', INICIO + 1, 5)],
      INICIO,
      INICIO + 2,
      { asignado: 5, diasQueQuedan: 2 },
    );
    expect(res.ok).toBe(false);
    expect(res.motivo).toContain('agotado');
  });

  it('bloquea cuando el ritmo diario da 0 y cuando hoy se alcanzó el ritmo', () => {
    const plan = { tipo: 'gratis' } as const;
    const pocos = puedeLanzar('grupos', plan, [], INICIO, INICIO, {
      asignado: 1,
      diasQueQuedan: 30,
    });
    expect(pocos.ok).toBe(false);
    expect(pocos.motivo).toContain('ritmo diario es 0');

    const dias = puedeLanzar('grupos', plan, [], INICIO, INICIO, {
      asignado: 10,
      diasQueQuedan: 1,
    });
    expect(dias.ok).toBe(true);

    const alcanzado = puedeLanzar(
      'grupos',
      plan,
      [consumo('grupos', INICIO + 2, 9)],
      INICIO,
      INICIO + 3,
      { asignado: 10, diasQueQuedan: 1 },
    );
    expect(alcanzado.ok).toBe(false);
    expect(alcanzado.motivo).toContain('Ritmo diario');
  });
});

describe('cicloActual', () => {
  it('delimita el ciclo de 30 días vigente', () => {
    const { inicio, fin } = cicloActual(INICIO, INICIO + 5 * DIA);
    expect(inicio).toBe(INICIO);
    expect(fin).toBe(INICIO + 30 * DIA);
  });

  it('rueda a un ciclo nuevo pasados los 30 días', () => {
    const { inicio, fin } = cicloActual(INICIO, INICIO + 35 * DIA);
    expect(inicio).toBe(INICIO + 30 * DIA);
    expect(fin).toBe(INICIO + 60 * DIA);
  });
});
