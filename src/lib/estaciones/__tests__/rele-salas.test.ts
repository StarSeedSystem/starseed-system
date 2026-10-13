import { describe, expect, it } from "vitest";

function crearSalas(config: { maxSalas: number; maxPorSala: number; maxBytes: number }) {
  const temas = new Map<string, number>();
  const conexiones = new Map<Object, string>();

  function entrar(tema: string, conexion: Object) {
    const count = (temas.get(tema) ?? 0) + 1;
    temas.set(tema, count);
    conexiones.set(conexion, tema);
    return { ok: true };
  }

  function presencia(tema: string): number {
    return temas.get(tema) ?? 0;
  }

  function temaDe(conexion: Object): string | null {
    return conexiones.get(conexion) ?? null;
  }

  return { entrar, presencia, temaDe };
}

describe("salas: entrada válida", () => {
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