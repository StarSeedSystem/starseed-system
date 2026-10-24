import { describe, expect, it } from "vitest";
import { cupoRestante, puedeLanzar, repartir, ritmoDiario, type Consumo } from "../cupo-cloudroom";

const inicio = "2026-10-01T00:00:00Z";
const ahora = "2026-10-02T12:00:00Z";
const gratis = { tipo: "gratis" } as const;
const DIA = 24 * 60 * 60 * 1000;
const consumo = (contextoId: string, t: number, n: number): Consumo => ({ contextoId, t, n });

describe("cupo Cloudroom", () => {
  it("da 100 al comenzar el ciclo y cuenta solo consumos desde el inicio", () => {
    expect(cupoRestante(gratis, [], inicio, ahora)).toBe(100);
    const consumos: Consumo[] = [{ contextoId: "a", t: "2026-09-30T23:59:00Z", n: 8 }, { contextoId: "a", t: ahora, n: 3 }];
    expect(cupoRestante(gratis, consumos, inicio, ahora)).toBe(97);
  });

  it("no deja el cupo por debajo de cero", () => {
    expect(cupoRestante(gratis, [{ contextoId: "a", t: ahora, n: 120 }], inicio, ahora)).toBe(0);
  });

  it("respeta reservas y distribuye el resto por peso", () => {
    expect(repartir(12, [{ id: "a", peso: 1, reservado: 2 }, { id: "b", peso: 3, reservado: 3 }]))
      .toEqual({ a: 3, b: 9 });
  });

  it("usa enteros, entrega el sobrante al peso mayor y redondea el ritmo hacia abajo", () => {
    expect(repartir(5, [{ id: "a", peso: 1 }, { id: "b", peso: 2 }])).toEqual({ a: 1, b: 4 });
    expect(ritmoDiario(100, 30)).toBe(3);
    expect(ritmoDiario(2, 30)).toBe(0);
    expect(ritmoDiario(5, 0)).toBe(0);
  });

  it("no lanza en un plan de pago cuyo cupo no declaró la persona", () => {
    const resultado = puedeLanzar("a", { plan: { tipo: "pro" }, consumos: [], inicioCiclo: inicio,
      ahora, contextos: [{ id: "a", peso: 1 }], diasQueQuedan: 30 });
    expect(resultado).toMatchObject({ ok: false, motivo: expect.stringContaining("Declara el cupo") });
  });

  it("en un plan de pago con cifra declarada descuenta lo consumido del ciclo", () => {
    const consumos = [consumo("personal", Date.parse(inicio) + 1, 25)];
    expect(cupoRestante({ tipo: "ultra", cupoDeclarado: 400 }, consumos, inicio, ahora)).toBe(375);
  });

  it("el ciclo rueda a los 30 días y no arrastra el consumo anterior", () => {
    const previo = [consumo("personal", Date.parse(inicio) + DIA, 40)];
    expect(cupoRestante(gratis, previo, inicio, Date.parse(inicio) + 35 * DIA)).toBe(100);
    const vigente = [...previo, consumo("personal", Date.parse(inicio) + 31 * DIA, 10)];
    expect(cupoRestante(gratis, vigente, inicio, Date.parse(inicio) + 35 * DIA)).toBe(90);
  });

  it("lo reservado que supera el cupo no reparte más de lo disponible y queda en enteros", () => {
    const salida = repartir(50, [{ id: "a", peso: 1, reservado: 30 }, { id: "b", peso: 3, reservado: 60 }]);
    expect(Object.values(salida).reduce((s, n) => s + n, 0)).toBe(50);
    expect(Object.values(salida).every(Number.isInteger)).toBe(true);
  });

  it("deja lanzar con un ciclo nuevo y bloquea cuando la cuenta está agotada", () => {
    const nuevos = puedeLanzar("personal", { plan: gratis, consumos: [], inicioCiclo: inicio,
      ahora: inicio, contextos: [{ id: "personal", peso: 1 }], diasQueQuedan: 30 });
    expect(nuevos).toMatchObject({ ok: true, motivo: expect.stringContaining("cupo disponible") });
    const agotado = puedeLanzar("personal", { plan: gratis,
      consumos: [consumo("personal", Date.parse(inicio) + 1, 100)], inicioCiclo: inicio, ahora,
      contextos: [{ id: "personal", peso: 1 }], diasQueQuedan: 30 });
    expect(agotado).toMatchObject({ ok: false, motivo: expect.stringContaining("agotado") });
  });

  it("respeta la parte del contexto y su ritmo diario aunque la cuenta tenga cupo", () => {
    const contextos = [{ id: "personal", peso: 1, reservado: 10 }, { id: "otros", peso: 90 }];
    expect(puedeLanzar("personal", { plan: gratis, consumos: [], inicioCiclo: inicio, ahora: inicio,
      contextos, diasQueQuedan: 2 }).ok).toBe(true);
    const alcanzado = puedeLanzar("personal", { plan: gratis,
      consumos: [consumo("personal", Date.parse(inicio) + 1, 5)], inicioCiclo: inicio,
      ahora: Date.parse(inicio) + 2, contextos, diasQueQuedan: 2 });
    expect(alcanzado.ok).toBe(false);
    expect(alcanzado.motivo).toContain("ritmo diario");
  });

  it("bloquea cuando el ritmo diario es 0 aunque quede cupo en la cuenta", () => {
    const res = puedeLanzar("personal", { plan: gratis, consumos: [], inicioCiclo: inicio, ahora: inicio,
      contextos: [{ id: "personal", peso: 1 }, { id: "otros", peso: 99 }], diasQueQuedan: 30 });
    expect(res.ok).toBe(false);
    expect(res.motivo).toContain("ritmo diario");
  });
});
