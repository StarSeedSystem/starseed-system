export interface SalasOptions {
  maxSalas?: number;
  maxPorSala?: number;
  maxBytes?: number;
}

export interface Salas {
  entrar(tema: string, conexion: any): { ok: boolean };
  salir(conexion: any): void;
  presencia(tema: string): number;
  temaDe(conexion: any): string | undefined;
  difundir(tema: string, mensaje: any, remitente?: any): any[];
}

export function crearSalas(options: SalasOptions = {}): Salas {
  const {
    maxSalas = Infinity,
    maxPorSala = Infinity,
    maxBytes = Infinity,
  } = options;

  const TEMA_REGEX = /^estacion-[^:]+:[^:]+$/;
  function esTemaValido(tema: string): boolean {
    return TEMA_REGEX.test(tema);
  }

  const temas = new Map<string, Set<any>>(); // tema -> set of conexiones
  const conexionATema = new Map<any, string>(); // conexion -> tema

  function entrar(tema: string, conexion: any): { ok: boolean } {
    if (!esTemaValido(tema)) {
      return { ok: false };
    }
    // Check maxSalas
    if (!temas.has(tema) && temas.size >= maxSalas) {
      return { ok: false };
    }
    // Get or create set for tema
    let set = temas.get(tema);
    if (!set) {
      set = new Set();
      temas.set(tema, set);
    }
    // Check maxPorSala
    if (set.size >= maxPorSala) {
      return { ok: false };
    }
    // Add
    set.add(conexion);
    conexionATema.set(conexion, tema);
    return { ok: true };
  }

  function salir(conexion: any): void {
    const tema = conexionATema.get(conexion);
    if (tema === undefined) return;
    const set = temas.get(tema);
    if (set) {
      set.delete(conexion);
      if (set.size === 0) {
        temas.delete(tema);
      }
    }
    conexionATema.delete(conexion);
  }

  function presencia(tema: string): number {
    const set = temas.get(tema);
    return set ? set.size : 0;
  }

  function temaDe(conexion: any): string | undefined {
    return conexionATema.get(conexion);
  }

  function difundir(tema: string, mensaje: any, remitente?: any): any[] {
    // Validate mensaje is string
    if (typeof mensaje !== 'string') {
      return [];
    }
    // Validate starts with '{"t":"est"'
    if (!mensaje.startsWith('{"t":"est"')) {
      return [];
    }
    // Check length in bytes (UTF-8)
    try {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(mensaje).length;
      if (bytes > maxBytes) {
        return [];
      }
    } catch {
      // Fallback: approximate by length * 2 (overestimate)
      if (mensaje.length * 2 > maxBytes) {
        return [];
      }
    }

    // Return all connections in the tema except the remitente
    const set = temas.get(tema);
    if (!set) return [];
    const result = Array.from(set);
    if (remitente !== undefined) {
      return result.filter((c) => c !== remitente);
    }
    return result;
  }

  return {
    entrar,
    salir,
    presencia,
    temaDe,
    difundir,
  };
}