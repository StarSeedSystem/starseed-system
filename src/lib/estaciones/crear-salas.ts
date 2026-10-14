"use client";

/**
 * crear-salas — lógica pura para gestión de salas en estaciones en vivo (2026-09-08).
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOP: `architecture/estaciones-en-vivo-parametricas.md` (§4.2).
 *
 * Expone un generador determinista (sin disco, sin red, sin efectos secundarios) que devuelve un
 * objeto con: `entrar(tema, conexion)`, `salir(conexion)`, `presencia(tema)` y `temaDe(conexion)`.
 * Validación estricta de tema: solo «estacion-vivo:<≥4chars>» y «estacion-p:<≥4chars>»;
 * límites en: número de salas, conexiones por sala y bytes (actualmente sin bytes en JS).
 *
 * Dado que el contrato ha sido validado por main en ola/TG1 · contrato de salas, no se toca ningún
 * dato: sin `node:*`, sin `vi.mock`, sin rutas (`route.ts`), sin `any`.
 */

export function crearSalas(options: {
  maxSalas?: number;
  maxPorSala?: number;
  maxBytes?: number;
} = {}) {
  const {
    maxSalas = 100,
    maxPorSala = 100,
    maxBytes = 100
  } = options;

  const salas = new Map<string, Set<object>>();
  const connectionToTema = new Map<object, string>();

  function validarTema(tema: string): boolean {
    if (!tema.startsWith('estacion-vivo:') && !tema.startsWith('estacion-p:')) {
      return false;
    }
    const afterColon = tema.substring(tema.indexOf(':') + 1);
    return afterColon.length >= 4;
  }

  function entrar(tema: string, conexion: object): { ok: boolean; motivo?: string } {
    if (!validarTema(tema)) {
      return { ok: false, motivo: 'Tema inválido' };
    }

    if (!salas.has(tema) && salas.size >= maxSalas) {
      return { ok: false, motivo: 'Límite de salas alcanzado' };
    }

    let sala = salas.get(tema);
    if (!sala) {
      sala = new Set();
      salas.set(tema, sala);
    }

    if (connectionToTema.has(conexion)) {
      return { ok: false, motivo: 'Conexión ya en una sala' };
    }

    if (sala.size >= maxPorSala) {
      return { ok: false, motivo: 'Límite de conexiones por sala alcanzado' };
    }

    sala.add(conexion);
    connectionToTema.set(conexion, tema);
    return { ok: true };
  }

  function salir(conexion: object): void {
    const tema = connectionToTema.get(conexion);
    if (tema) {
      const sala = salas.get(tema);
      if (sala) {
        sala.delete(conexion);
        if (sala.size === 0) {
          salas.delete(tema);
        }
      }
      connectionToTema.delete(conexion);
    }
  }

  function presencia(tema: string): number {
    const sala = salas.get(tema);
    return sala ? sala.size : 0;
  }

  function temaDe(conexion: object): string | undefined {
    return connectionToTema.get(conexion);
  }

  return {
    entrar,
    salir,
    presencia,
    temaDe
  };
}