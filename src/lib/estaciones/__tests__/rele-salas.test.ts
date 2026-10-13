import { describe, expect, it } from "vitest";

// TODO: Implementar o importar crearSalas desde el módulo correspondiente
// Por ahora, verificamos si existe la funcionalidad
describe("salas: entrada válida", () => {
  it('debería permitir entrar con tema válido y dentro de límites', () => {
    // Este test fallará porque crearSalas no está implementado
    const salas = crearSalas({ maxSalas: 2, maxPorSala: 2, maxBytes: 100 });
    const tema = 'estacion-vivo:ABCDEF1234';
    const conexion = {};
    const result = salas.entrar(tema, conexion);
    expect(result.ok).toBe(true);
    expect(salas.presencia(tema)).toBe(1);
    expect(salas.temaDe(conexion)).toBe(tema);
  });
});