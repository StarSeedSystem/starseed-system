import { describe, expect, it } from "vitest";

import {
  estadoDeIdes,
  LIMITE_FRESCURA_MS,
  type FrescuraIde,
  type Ide,
  type PunteroIde,
} from "@/lib/mando/ides";

describe("estadoDeIdes", () => {
  const ahora = 1_725_000_000_000; // base fija para cálculos deterministas

  it("lista vacía devuelve vacío", () => {
    expect(estadoDeIdes([], ahora)).toEqual([]);
  });

  it("puntero inexistente → nunca, nota 'no está vinculado'", () => {
    const punteros: PunteroIde[] = [
      { id: "x", nombre: "X", ruta: "/tmp/x", existeMs: null },
    ];
    const res = estadoDeIdes(punteros, ahora);
    expect(res).toHaveLength(1);
    expect(res[0]).toEqual({
      id: "x",
      nombre: "X",
      vinculado: false,
      sincronizadoMs: null,
      frescura: "nunca" as FrescuraIde,
      nota: "no está vinculado",
    });
  });

  it("puntero fresco (<2h) → al día, nota con minutos", () => {
    const fresco = ahora - 5 * 60 * 1000; // 5 min
    const punteros: PunteroIde[] = [
      { id: "c", nombre: "Claude", ruta: "/tmp/c", existeMs: fresco },
    ];
    const res = estadoDeIdes(punteros, ahora);
    expect(res[0].frescura).toBe("al día" as FrescuraIde);
    expect(res[0].vinculado).toBe(true);
    expect(res[0].nota).toBe("sincronizado hace 5 min");
  });

  it("puntero de hace 5 días → atrasado, nota con días", () => {
    const viejo = ahora - 5 * 24 * 60 * 60 * 1000;
    const punteros: PunteroIde[] = [
      { id: "h", nombre: "Hermes", ruta: "/tmp/h", existeMs: viejo },
    ];
    const res = estadoDeIdes(punteros, ahora);
    expect(res[0].frescura).toBe("atrasado" as FrescuraIde);
    expect(res[0].nota).toContain("5 días");
  });

  it("puntero de hace 3 h → atrasado con horas", () => {
    const viejo = ahora - 3 * 60 * 60 * 1000;
    const punteros: PunteroIde[] = [
      { id: "a", nombre: "Antigravity", ruta: "/tmp/a", existeMs: viejo },
    ];
    const res = estadoDeIdes(punteros, ahora);
    expect(res[0].frescura).toBe("atrasado" as FrescuraIde);
    expect(res[0].nota).toContain("3 horas");
  });
});
