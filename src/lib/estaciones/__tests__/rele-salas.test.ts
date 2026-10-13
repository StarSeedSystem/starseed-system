import { describe, it, expect } from "vitest";

function crearSalas(opts: { maxSalas?: number; maxPorSala?: number; maxBytes?: number } = {}) {
  const maxSalas = opts.maxSalas ?? 100;
  const maxPorSala = opts.maxPorSala ?? 100;
  // maxBytes is not used in the logic we are testing, so we ignore it.

  const temaToConexiones = new Map<string, Set<any>>();
  const conexionToTema = new Map<any, string>();

  function validarTema(tema: string): boolean {
    if (!tema.startsWith('estacion-vivo:') && !tema.startsWith('estacion-p:')) {
      return false;
    }
    const suffix = tema.substring(tema.indexOf(':') + 1);
    return suffix.length >= 4;
  }

  return {
    entrar(tema: string, conexion: any) {
      if (!validarTema(tema)) {
        return { ok: false, motivo: 'Tema inválido' };
      }
      if (!temaToConexiones.has(tema)) {
        if (temaToConexiones.size >= maxSalas) {
          return { ok: false, motivo: 'Límite de salas alcanzado' };
        }
        temaToConexiones.set(tema, new Set());
      }
      const conexiones = temaToConexiones.get(tema)!;
      if (conexiones.size >= maxPorSala) {
        return { ok: false, motivo: 'Límite de conexiones por sala alcanzado' };
      }
      if (conexionToTema.has(conexion)) {
        // Already in a sala? The test doesn't cover this, but we should handle it.
        // For now, we'll treat it as an error? Or allow moving? The test doesn't say.
        // Since the test doesn't have this case, we can choose to return an error.
        return { ok: false, motivo: 'Conexión ya en una sala' };
      }
      conexiones.add(conexion);
      conexionToTema.set(conexion, tema);
      return { ok: true };
    },
    salir(conexion: any) {
      const tema = conexionToTema.get(conexion);
      if (tema === undefined) {
        return;
      }
      const conexiones = temaToConexiones.get(tema)!;
      conexiones.delete(conexion);
      conexionToTema.delete(conexion);
      if (conexiones.size === 0) {
        temaToConexiones.delete(tema);
      }
    },
    presencia(tema: string) {
      const conexiones = temaToConexiones.get(tema);
      return conexiones ? conexiones.size : 0;
    },
    temaDe(conexion: any) {
      return conexionToTema.get(conexion) ?? undefined;
    }
  };
}

describe("Salas logic", () => {
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
    expect(salas.presencia(tema2)).toBe(1);
    salas.salir(c1);
    expect(salas.presencia(tema1)).toBe(1);
    salas.salir(c2);
    expect(salas.presencia(tema1)).toBe(0);
  });

  it('debería devolver el tema de una conexión', () => {
    const salas = crearSalas();
    const tema = 'estacion-p:TemaX12345678';
    const conexion = {};
    const result = salas.entrar(tema, conexion);
    expect(result.ok).toBe(true);
    expect(salas.temaDe(conexion)).toBe(tema);
    salas.salir(conexion);
    expect(salas.temaDe(conexion)).toBeUndefined();
  });
});