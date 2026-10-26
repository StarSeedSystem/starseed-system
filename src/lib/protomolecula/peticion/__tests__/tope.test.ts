// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLAVE_TOPE, TOPE_AGENTE_POR_HORA, TOPE_PERSONA_POR_HORA, almacenPorDefecto, consumirTope, estadoTope, vaciarTopeEnMemoria, type AlmacenTope } from "../tope";

const HORA = 60 * 60 * 1000;
const memoria = (inicial?: string): AlmacenTope & { valor: () => string | null } => {
  let v: string | null = inicial ?? null;
  return { getItem: () => v, setItem: (_k, nuevo) => { v = nuevo; }, valor: () => v };
};

beforeEach(() => { vaciarTopeEnMemoria(); try { window.localStorage.clear(); } catch { /* */ } });
afterEach(() => { vaciarTopeEnMemoria(); try { window.localStorage.clear(); } catch { /* */ } });

describe("tope por hora · ventana deslizante", () => {
  it("gasta fichas hasta el máximo y la siguiente dice en cuántos minutos vuelve", () => {
    const almacen = memoria();
    const t0 = 10_000_000;
    for (let i = 0; i < 3; i++) expect(consumirTope("persona", 3, { ahora: t0 + i * 60_000, almacen })).toEqual({ ok: true, restantes: 2 - i });
    const r = consumirTope("persona", 3, { ahora: t0 + 5 * 60_000, almacen });
    expect(r).toEqual({ ok: false, reintentoEnMin: 55 });
  });

  it("una ficha caduca a la hora exacta", () => {
    const almacen = memoria();
    consumirTope("persona", 1, { ahora: 1_000_000, almacen });
    expect(consumirTope("persona", 1, { ahora: 1_000_000 + HORA - 1, almacen }).ok).toBe(false);
    expect(consumirTope("persona", 1, { ahora: 1_000_000 + HORA, almacen }).ok).toBe(true);
  });

  it("cada agente tiene su propia cuenta", () => {
    const almacen = memoria();
    consumirTope("agente:a", 1, { ahora: 5_000_000, almacen });
    expect(consumirTope("agente:a", 1, { ahora: 5_000_000, almacen }).ok).toBe(false);
    expect(consumirTope("agente:b", 1, { ahora: 5_000_000, almacen }).ok).toBe(true);
  });

  it("estadoTope no gasta ninguna ficha", () => {
    const almacen = memoria();
    consumirTope("persona", 5, { ahora: 5_000_000, almacen });
    const e1 = estadoTope("persona", 5, { ahora: 5_000_000, almacen });
    const e2 = estadoTope("persona", 5, { ahora: 5_000_000, almacen });
    expect(e1).toEqual({ usadas: 1, maximo: 5, restantes: 4, reintentoEnMin: 0 });
    expect(e2).toEqual(e1);
  });

  it("el tope del agente es más corto que el de la persona", () => {
    expect(TOPE_AGENTE_POR_HORA).toBeLessThan(TOPE_PERSONA_POR_HORA);
  });
});

describe("tope por hora · un almacén roto o manipulado no abre la puerta", () => {
  it("un JSON corrupto o de otra forma se trata como vacío (sin lanzar)", () => {
    for (const basura of ["no json", "[1,2,3]", "null", '{"persona":"x"}', '{"persona":[null,"a",{}]}']) {
      const almacen = memoria(basura);
      expect(() => consumirTope("persona", 2, { ahora: 5_000_000, almacen })).not.toThrow();
      expect(consumirTope("persona", 2, { ahora: 5_000_000, almacen }).ok).toBe(true);
    }
  });

  it("marcas del futuro (un reloj manipulado) no cuentan como fichas libres ni como eternas", () => {
    const almacen = memoria(JSON.stringify({ persona: [9_999_999_999_999] }));
    expect(estadoTope("persona", 1, { ahora: 5_000_000, almacen }).usadas).toBe(0);
  });

  it("un almacén que lanza al escribir no rompe la consulta", () => {
    const almacen: AlmacenTope = { getItem: () => null, setItem: () => { throw new Error("lleno"); } };
    expect(consumirTope("persona", 2, { ahora: 5_000_000, almacen }).ok).toBe(true);
  });

  it("nunca guarda más de 100 marcas por clave ni más de 40 claves", () => {
    const grande: Record<string, number[]> = {};
    for (let i = 0; i < 60; i++) grande[`agente:${i}`] = Array.from({ length: 150 }, (_, j) => 5_000_000 - j);
    const almacen = memoria(JSON.stringify(grande));
    consumirTope("persona", 1000, { ahora: 5_000_000, almacen });
    const guardado = JSON.parse(almacen.valor()!) as Record<string, number[]>;
    expect(Object.keys(guardado).length).toBeLessThanOrEqual(41);
    for (const marcas of Object.values(guardado)) expect(marcas.length).toBeLessThanOrEqual(101);
  });
});

describe("tope por hora · almacén por defecto (localStorage + memoria)", () => {
  it("las consultas del mismo milisegundo cuentan todas (no se colapsan al unir los dos almacenes)", () => {
    const almacen = almacenPorDefecto();
    for (let i = 0; i < 4; i++) expect(consumirTope("persona", 4, { ahora: 7_000_000, almacen }).ok).toBe(true);
    expect(consumirTope("persona", 4, { ahora: 7_000_000, almacen }).ok).toBe(false);
  });

  it("se guarda en localStorage con su clave, y en memoria", () => {
    consumirTope("persona", 4, { ahora: 7_000_000, almacen: almacenPorDefecto() });
    expect(JSON.parse(window.localStorage.getItem(CLAVE_TOPE)!)).toEqual({ persona: [7_000_000] });
  });

  it("si alguien vacía localStorage a mano, la memoria del proceso mantiene la cuenta", () => {
    const almacen = almacenPorDefecto();
    for (let i = 0; i < 3; i++) consumirTope("persona", 3, { ahora: 7_000_000 + i, almacen });
    window.localStorage.clear();
    expect(consumirTope("persona", 3, { ahora: 7_000_010, almacen }).ok).toBe(false);
  });

  it("si localStorage lanza, sigue contando en memoria", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new Error("bloqueado"); } });
    try {
      const almacen = almacenPorDefecto();
      for (let i = 0; i < 2; i++) expect(consumirTope("persona", 2, { ahora: 7_000_000 + i, almacen }).ok).toBe(true);
      expect(consumirTope("persona", 2, { ahora: 7_000_005, almacen }).ok).toBe(false);
    } finally {
      Object.defineProperty(window, "localStorage", original);
    }
  });
});
