import { describe, expect, it } from "vitest";
import { cupoRestante, puedeLanzar, repartir, ritmoDiario, type Consumo } from "../cupo-cloudroom";

const inicio = "2026-10-01T00:00:00Z";
const ahora = "2026-10-02T12:00:00Z";
const gratis = { tipo: "gratis" } as const;

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
});
