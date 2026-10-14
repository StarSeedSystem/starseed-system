import { describe, it, expect } from "vitest";
function crearSalas({ maxSalas, maxPorSala, maxBytes }: { maxSalas: number; maxPorSala: number; maxBytes: number }) {
  const salas = new Map<string, number>();
  const conexionTema = new WeakMap<object, string>();
  return {
    entrar(tema: string, conexion: object) {
      const current = salas.get(tema) ?? 0;
      if (current >= maxPorSala) return { ok: false };
      // optional: check maxSalas (number of distinct temas)
      if (salas.size >= maxSalas && !salas.has(tema)) return { ok: false };
      salas.set(tema, current + 1);
      conexionTema.set(conexion, tema);
      return { ok: true };
    },
    presencia(tema: string) {
      return salas.get(tema) ?? 0;
    },
    temaDe(conexion: object) {
      return conexionTema.get(conexion);
    }
  };
}

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
