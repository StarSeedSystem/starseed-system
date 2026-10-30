import { describe, it, expect } from "vitest";
import { resumenPrestamos } from "../procesos-prestados";

describe("resumenPrestamos", () => {
  it("devuelve filas vacías y totales cero", () => {
    const ahora = 1_000_000;
    const r = resumenPrestamos([], [], ahora);
    expect(r.dados.totales.sesiones).toBe(0);
    expect(r.tomados.totales.sesiones).toBe(0);
    expect(r.dados.filas).toEqual([]);
    expect(r.tomados.filas).toEqual([]);
  });

  it("calcula filas legibles y totales con consumo", () => {
    const ahora = 10_000_000;
    const dados = [
      { id: "d1", contraparte: "neurona-A", recurso: "CPU", tipo: "capacidad" as const, desde: ahora - 3_600_000, consumo: 42 },
      { id: "d2", contraparte: "neurona-B", recurso: "appX", tipo: "app" as const, desde: ahora - 120_000, consumo: null },
    ];
    const tomados = [
      { id: "t1", contraparte: "neurona-C", recurso: "RAM", tipo: "capacidad" as const, desde: ahora - 600_000, consumo: 10 },
    ];
    const r = resumenPrestamos(dados, tomados, ahora);
    expect(r.dados.totales.sesiones).toBe(2);
    expect(r.dados.totales.consumoTotal).toBe(42);
    expect(r.tomados.totales.sesiones).toBe(1);
    expect(r.tomados.totales.consumoTotal).toBe(10);
    expect(r.dados.filas[0].quien).toBe("neurona-A");
    expect(r.dados.filas[0].que).toBe("Capacidad: CPU");
    expect(r.dados.filas[0].consumo).toBe("42");
    expect(r.dados.filas[1].consumo).toBe("sin medida");
    expect(r.tomados.filas[0].quien).toBe("neurona-C");
  });
});
