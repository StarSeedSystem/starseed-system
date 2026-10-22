import { describe, it, expect } from 'vitest';
import {
  CONFIANZA_INICIAL,
  actualizarConfianza,
  decisionPorResonancia,
  type VeredictoCompartido,
} from '../resonancias';

function veredicto(parcial: Partial<VeredictoCompartido>): VeredictoCompartido {
  return {
    hash: 'h1',
    nivel: 'peligroso',
    nodo: 'n1',
    cuenta: 'c1',
    firmaOk: true,
    t: 1,
    ...parcial,
  };
}

describe('actualizarConfianza', () => {
  it('arranca en 0.5', () => {
    expect(CONFIANZA_INICIAL).toBe(0.5);
  });
  it('firma-ok suma 0.02', () => {
    expect(actualizarConfianza(0.5, 'firma-ok')).toBeCloseTo(0.52);
  });
  it('firma-mala resta 0.3', () => {
    expect(actualizarConfianza(0.5, 'firma-mala')).toBeCloseTo(0.2);
  });
  it('trama-corrupta resta 0.15', () => {
    expect(actualizarConfianza(0.5, 'trama-corrupta')).toBeCloseTo(0.35);
  });
  it('veredicto-confirmado suma 0.05 y desmentido resta 0.2', () => {
    expect(actualizarConfianza(0.5, 'veredicto-confirmado')).toBeCloseTo(0.55);
    expect(actualizarConfianza(0.5, 'veredicto-desmentido')).toBeCloseTo(0.3);
  });
  it('recorta a [0, 1]', () => {
    expect(actualizarConfianza(0.99, 'firma-ok')).toBe(1);
    expect(actualizarConfianza(0.1, 'firma-mala')).toBe(0);
  });
});

describe('decisionPorResonancia', () => {
  const conf = { n1: 0.6, n2: 0.6, n3: 0.6 };

  it('cuarentena con 2 cuentas distintas marcando peligroso', () => {
    const r = decisionPorResonancia('h1', [
      veredicto({ cuenta: 'c1', nodo: 'n1' }),
      veredicto({ cuenta: 'c2', nodo: 'n2' }),
    ], conf);
    expect(r.decision).toBe('cuarentena');
    expect(r.cuentas).toBe(2);
  });

  it('una sola cuenta con 10 nodos no basta para la cuarentena', () => {
    const vs = Array.from({ length: 10 }, (_, i) =>
      veredicto({ cuenta: 'c1', nodo: `nodo${i}`, t: i }));
    const confi = Object.fromEntries(vs.map((v) => [v.nodo, 0.9]));
    const r = decisionPorResonancia('h1', vs, confi);
    expect(r.decision).toBe('aviso');
    expect(r.cuentas).toBe(1);
  });

  it('aviso con una cuenta peligrosa', () => {
    const r = decisionPorResonancia('h1', [veredicto({})], conf);
    expect(r.decision).toBe('aviso');
  });

  it('aviso con 2 cuentas sospechosas', () => {
    const r = decisionPorResonancia('h1', [
      veredicto({ nivel: 'sospechoso', cuenta: 'c1' }),
      veredicto({ nivel: 'sospechoso', cuenta: 'c2', nodo: 'n2' }),
    ], conf);
    expect(r.decision).toBe('aviso');
    expect(r.cuentas).toBe(2);
  });

  it('limpio con 2 cuentas limpias y ninguna peligrosa', () => {
    const r = decisionPorResonancia('h1', [
      veredicto({ nivel: 'limpio', cuenta: 'c1' }),
      veredicto({ nivel: 'limpio', cuenta: 'c2', nodo: 'n2' }),
    ], conf);
    expect(r.decision).toBe('limpio');
  });

  it('aviso con 1 cuenta peligrosa y su motivo lo dice en español', () => {
    const r = decisionPorResonancia('h2', [veredicto({ hash: 'h2' })], conf);
    expect(r.decision).toBe('aviso');
    expect(r.motivo).toContain('una cuenta');
    expect(r.motivo).toContain('peligroso');
  });

  it('aviso con 2 cuentas sospechosas y su motivo cuenta las cuentas', () => {
    const r = decisionPorResonancia('h3', [
      veredicto({ hash: 'h3', nivel: 'sospechoso', cuenta: 'cA' }),
      veredicto({ hash: 'h3', nivel: 'sospechoso', cuenta: 'cB', nodo: 'n2' }),
    ], conf);
    expect(r.decision).toBe('aviso');
    expect(r.motivo).toContain('2 cuentas');
  });

  it('limpio con 2 cuentas y su motivo lo dice: «marcan limpio»', () => {
    const r = decisionPorResonancia('h4', [
      veredicto({ hash: 'h4', nivel: 'limpio', cuenta: 'cA' }),
      veredicto({ hash: 'h4', nivel: 'limpio', cuenta: 'cB', nodo: 'n2' }),
    ], conf);
    expect(r.motivo).toContain('marcan limpio');
  });

  it('sin-datos si no hay suficientes veredictos fiables', () => {
    const r = decisionPorResonancia('h1', [
      veredicto({ nivel: 'limpio', cuenta: 'c1' }),
    ], conf);
    expect(r.decision).toBe('sin-datos');
  });

  it('descarta firma mala y confianza baja', () => {
    const r = decisionPorResonancia('h1', [
      veredicto({ cuenta: 'c1', firmaOk: false }),
      veredicto({ cuenta: 'c2', nodo: 'n4' }), // n4 sin confianza registrada usa 0.5
    ], { n1: 0.1 });
    expect(r.decision).not.toBe('cuarentena');
  });

  it('respeta el umbral de confianza', () => {
    const r = decisionPorResonancia('h1', [
      veredicto({ cuenta: 'c1', nodo: 'n1' }),
      veredicto({ cuenta: 'c2', nodo: 'n2' }),
    ], { n1: 0.9, n2: 0.2 });
    expect(r.decision).toBe('aviso');
  });

  it('sin-datos con lista vacía y cuentas a 0', () => {
    const r = decisionPorResonancia('h5', [], conf);
    expect(r.decision).toBe('sin-datos');
    expect(r.cuentas).toBe(0);
  });

  it('ignora veredictos de otro hash', () => {
    const r = decisionPorResonancia('h5', [veredicto({ hash: 'otro' })], conf);
    expect(r.decision).toBe('sin-datos');
  });

  it('firma mala o confianza baja dejan la decisión en sin-datos', () => {
    expect(decisionPorResonancia('h6', [veredicto({ hash: 'h6', firmaOk: false })], conf).decision).toBe('sin-datos');
    expect(decisionPorResonancia('h7', [veredicto({ hash: 'h7' })], { n1: 0.1 }).decision).toBe('sin-datos');
  });

  it('un voto por cuenta: gana el más reciente', () => {
    const r = decisionPorResonancia('h1', [
      veredicto({ cuenta: 'c1', nivel: 'peligroso', t: 1 }),
      veredicto({ cuenta: 'c1', nivel: 'limpio', t: 5 }),
      veredicto({ cuenta: 'c2', nodo: 'n2', nivel: 'limpio' }),
      veredicto({ cuenta: 'c3', nodo: 'n3', nivel: 'limpio' }),
    ], conf);
    expect(r.decision).toBe('limpio');
  });
});
