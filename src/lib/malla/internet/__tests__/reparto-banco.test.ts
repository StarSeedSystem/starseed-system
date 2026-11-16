import { describe, it, expect } from "vitest";
import { repartirRacion } from "../reparto-banco";

describe("repartirRacion", () => {
  it("reparte proporcionalmente a la capacidad (1:3)", () => {
    const nodos = [
      { id: "a", capacidadKbps: 100, conectado: true },
      { id: "b", capacidadKbps: 300, conectado: true },
    ];
    const resultado = repartirRacion(40, nodos);
    expect(resultado.reparto).toEqual([
      { id: "a", mb: 10 },
      { id: "b", mb: 30 },
    ]);
    expect(resultado.sobranteMb).toBe(0);
  });

  it("respeta el tope máximo de un nodo", () => {
    const nodos = [
      { id: "a", capacidadKbps: 100, conectado: true, maxMb: 5 },
      { id: "b", capacidadKbps: 100, conectado: true },
    ];
    const resultado = repartirRacion(20, nodos);
    expect(resultado.reparto).toEqual([
      { id: "a", mb: 5 },
      { id: "b", mb: 15 },
    ]);
    expect(resultado.sobranteMb).toBe(0);
  });

  it("maneja nodos desconectados ignorándolos", () => {
    const nodos = [
      { id: "a", capacidadKbps: 100, conectado: false },
      { id: "b", capacidadKbps: 100, conectado: true },
    ];
    const resultado = repartirRacion(10, nodos);
    expect(resultado.reparto).toEqual([{ id: "b", mb: 10 }]);
    expect(resultado.sobranteMb).toBe(0);
  });

  it("calcula correctamente el sobrante si todos al tope", () => {
    const nodos = [
      { id: "a", capacidadKbps: 100, conectado: true, maxMb: 5 },
    ];
    const resultado = repartirRacion(10, nodos);
    expect(resultado.reparto).toEqual([{ id: "a", mb: 5 }]);
    expect(resultado.sobranteMb).toBe(5);
  });

  it("maneja ración cero", () => {
    const nodos = [{ id: "a", capacidadKbps: 100, conectado: true }];
    const resultado = repartirRacion(0, nodos);
    expect(resultado.reparto).toEqual([{ id: "a", mb: 0 }]);
    expect(resultado.sobranteMb).toBe(0);
  });
});
