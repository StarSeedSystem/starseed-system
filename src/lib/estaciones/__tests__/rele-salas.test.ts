import { describe, it, expect } from "vitest";
import { crearSalas } from "../../salas/sala";

describe("salas · lógica pura de salas", () => {
  it('debería permitir entrar con tema válido y dentro de límites', () => {
    const salas = crearSalas({ maxSalas: 2, maxPorSala: 2, maxBytes: 100 });
    const tema = 'estacion-vivo:ABCDEF1234';
    const conexion = {};
    const result = salas.entrar(tema, conexion);
    expect(result.ok).toBe(true);
    expect(salas.presencia(tema)).toBe(1);
    expect(salas.temaDe(conexion)).toBe(tema);
  });
});
