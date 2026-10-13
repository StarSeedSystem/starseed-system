import { describe, it, expect } from "vitest";

function crearSalas(opts: {
  maxSalas?: number;
  maxPorSala?: number;
  maxBytes?: number;
} = {}) {
  const maxSalas = opts.maxSalas ?? 1000;
  const maxPorSala = opts.maxPorSala ?? 1000;
  const salas = new Map<string, Set<object>>();
  const conexionTema = new Map<object, string>();

  function validarTema(tema: string): boolean {
    if (tema.startsWith('estacion-vivo:')) {
      return tema.slice('estacion-vivo:'.length).length >= 4;
    }
    if (tema.startsWith('estacion-p:')) {
      return tema.slice('estacion-p:'.length).length >= 4;
    }
    return false;
  }

  return {
    entrar(tema: string, conexion: object) {
      if (!validarTema(tema)) {
        return { ok: false, motivo: 'Tema inválido' };
      }
      const existentes = salas.get(tema);
      if (existentes === undefined) {
        if (salas.size >= maxSalas) {
          return { ok: false, motivo: 'Límite de salas alcanzado' };
        }
        salas.set(tema, new Set());
      }
      const set = salas.get(tema)!;
      if (set.size >= maxPorSala) {
        return { ok: false, motivo: 'Límite de conexiones por sala alcanzado' };
      }
      set.add(conexion);
      conexionTema.set(conexion, tema);
      return { ok: true };
    },
    presencia(tema: string): number {
      const set = salas.get(tema);
      return set ? set.size : 0;
    },
    temaDe(conexion: object): string | undefined {
      return conexionTema.get(conexion);
    },
    salir(conexion: object) {
      const tema = conexionTema.get(conexion);
      if (tema === undefined) {
        return;
      }
      const set = salas.get(tema);
      if (set) {
        set.delete(conexion);
        if (set.size === 0) {
          salas.delete(tema);
        }
      }
      conexionTema.delete(conexion);
    },
  };
}

describe("rele-salas", () => {
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
    const salas = crearSalas();
    const conexion = {};
    // Tema demasiado corto
    let result = salas.entrar('estacion-vivo:ABC', conexion);
    expect(result.ok).toBe(false);
    expect(result.motivo).toBe('Tema inválido');
    // Tema con formato incorrecto
    result = salas.entrar('estacion-vivo', conexion);
    expect(result.ok).toBe(false);
    expect(result.motivo).toBe('Tema inválido');
    // Tema sin prefijo
    result = salas.entrar('otro-tema:ABCDEF1234', conexion);
    expect(result.ok).toBe(false);
    expect(result.motivo).toBe('Tema inválido');
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
    expect(result.motivo).toBe('Límite de salas alcanzado');
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
    expect(result.motivo).toBe('Límite de conexiones por sala alcanzado');
  });

  it('debería salir correctamente', () => {
    const salas = crearSalas();
    const tema = 'estacion-p:Tema12345678';
    const conexion1 = {};
    const conexion2 = {};
    salas.entrar(tema, conexion1);
    salas.entrar(tema, conexion2);
    expect(salas.presencia(tema)).toBe(2);
    salas.salir(conexion1);
    expect(salas.presencia(tema)).toBe(1);
    expect(salas.temaDe(conexion1)).toBeUndefined();
    expect(salas.temaDe(conexion2)).toBe(tema);
    salas.salir(conexion2);
    expect(salas.presencia(tema)).toBe(0);
  });
});