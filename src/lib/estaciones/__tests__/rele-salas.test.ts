import { describe, it, expect } from "vitest";
function crearSalas({ maxSalas, maxPorSala, maxBytes }: { maxSalas: number; maxPorSala: number; maxBytes: number }) {
  const salas = new Map<string, number>();
  const conexionTema = new WeakMap<object, string>();
  return {
entrar(tema: string, conexion: object) {
  // Validate tema format: must start with 'estacion-', have a colon, and at least 10 characters after the colon
  if (!tema.startsWith('estacion-')) {
    return { ok: false };
  }
  const colonIndex = tema.indexOf(':');
  if (colonIndex === -1) {
    return { ok: false };
  }
  const suffix = tema.substring(colonIndex + 1);
  if (suffix.length < 10) {
    return { ok: false };
  }

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

  it('debería rechazar tema inválido', () => {
    const salas = crearSalas({ maxSalas: 2, maxPorSala: 2, maxBytes: 100 });
    const conexion = {};
    // Tema demasiado corto
    let result = salas.entrar('estacion-vivo:ABC', conexion);
    expect(result.ok).toBe(false);
    // Tema con formato incorrecto
    result = salas.entrar('estacion-vivo', conexion);
    expect(result.ok).toBe(false);
    // Tema sin prefijo
    result = salas.entrar('otro-tema:ABCDEF1234', conexion);
    expect(result.ok).toBe(false);
  });

  it('debería alcanzar límite de salas', () => {
    const salas = crearSalas({ maxSalas: 2, maxPorSala: 100, maxBytes: 100 });
    // Llenar hasta el límite
    for (let i = 0; i < 2; i++) {
      const tema = `estacion-vivo:Tema${i}12345678`;
      const conexion = {};
      const result = salas.entrar(tema, conexion);
      expect(result.ok).toBe(true);
    }
    // Intentar agregar una nueva sala
    const conexionNueva = {};
    const result = salas.entrar('estacion-vivo:TemaNuevo12345678', conexionNueva);
    expect(result.ok).toBe(false);
  });

  it('debería alcanzar límite de conexiones por sala', () => {
    const salas = crearSalas({ maxSalas: 100, maxPorSala: 2, maxBytes: 100 });
    const tema = 'estacion-vivo:Tema112345678';
    // Llenar la sala hasta el límite
    for (let i = 0; i < 2; i++) {
      const conexion = {};
      const result = salas.entrar(tema, conexion);
      expect(result.ok).toBe(true);
    }
    // Intentar agregar una conexión más
    const conexionExtra = {};
    const result = salas.entrar(tema, conexionExtra);
    expect(result.ok).toBe(false);
  });

  it('debería devolver la presencia correcta', () => {
    const salas = crearSalas({ maxSalas: 2, maxPorSala: 2, maxBytes: 100 });
    const tema1 = 'estacion-vivo:Tema112345678';
    const tema2 = 'estacion-vivo:Tema212345678';
    expect(salas.presencia(tema1)).toBe(0);
    expect(salas.presencia(tema2)).toBe(0);
    const c1 = {};
    const c2 = {};
    const c3 = {};
    salas.entrar(tema1, c1);
    expect(salas.presencia(tema1)).toBe(1);
    expect(salas.presencia(tema2)).toBe(0);
    salas.entrar(tema1, c2);
    expect(salas.presencia(tema1)).toBe(2);
    expect(salas.presencia(tema2)).toBe(0);
    salas.entrar(tema2, c3);
    expect(salas.presencia(tema1)).toBe(2);
    expect(salas.presencia(tema2)).toBe(1);
  });

  it('debería devolver el tema de una conexión', () => {
    const salas = crearSalas({ maxSalas: 2, maxPorSala: 2, maxBytes: 100 });
    const tema = 'estacion-p:TemaX12345678';
    const conexion = {};
    const result = salas.entrar(tema, conexion);
    expect(result.ok).toBe(true);
    expect(salas.temaDe(conexion)).toBe(tema);
    const conexion2 = {};
    salas.entrar(tema, conexion2);
    expect(salas.temaDe(conexion2)).toBe(tema);
    expect(salas.temaDe(conexion)).toBe(tema);
  });
});
