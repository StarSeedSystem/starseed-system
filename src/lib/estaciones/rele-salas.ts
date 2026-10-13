export function crearSalas(config: {
  maxSalas?: number;
  maxPorSala?: number;
  maxBytes?: number;
} = {}) {
  const maxSalas = config.maxSalas ?? 100;
  const maxPorSala = config.maxPorSala ?? 100;
  const maxBytes = config.maxBytes ?? 100;

  // Estado interno
  const salas = new Map<string, Set<any>>(); // tema -> Set<conexion>
  const conexionTema = new Map<any, string>(); // conexion -> tema

  function entrar(tema: string, conexion: any): { ok: boolean; motivo?: string } {
    // Validar formato del tema: debe empezar con 'estacion-' y tener al menos 8 caracteres después del colon
    if (!tema.startsWith('estacion-')) {
      return { ok: false, motivo: 'Tema inválido' };
    }
    const colonIndex = tema.indexOf(':');
    if (colonIndex === -1) {
      return { ok: false, motivo: 'Tema inválido' };
    }
    const resto = tema.substring(colonIndex + 1);
    if (resto.length < 8) {
      return { ok: false, motivo: 'Tema inválido' };
    }

    // Verificar límite de salas
    if (salas.size >= maxSalas && !salas.has(tema)) {
      return { ok: false, motivo: 'Límite de salas alcanzado' };
    }

    // Verificar límite de conexiones por sala
    const conexionesEnSala = salas.get(tema);
    if (conexionesEnSala && conexionesEnSala.size >= maxPorSala) {
      return { ok: false, motivo: 'Límite de conexiones por sala alcanzado' };
    }

    // Entrar
    if (!conexionesEnSala) {
      salas.set(tema, new Set());
    }
    salas.get(tema).add(conexion);
    conexionTema.set(conexion, tema);

    return { ok: true };
  }

  function salir(conexion: any): void {
    const tema = conexionTema.get(conexion);
    if (tema) {
      const conexiones = salas.get(tema);
      if (conexiones) {
        conexiones.delete(conexion);
        if (conexiones.size === 0) {
          salas.delete(tema);
        }
      }
      conexionTema.delete(conexion);
    }
  }

  function presencia(tema: string): number {
    const conexiones = salas.get(tema);
    return conexiones ? conexiones.size : 0;
  }

  function temaDe(conexion: any): string | undefined {
    return conexionTema.get(conexion);
  }

  function difundir(emisor: any, texto: any): any[] {
    // Validar que el texto sea una string
    if (typeof texto !== 'string') {
      return [];
    }
    // Validar longitud máxima
    if (texto.length > maxBytes) {
      return [];
    }
    // Validar que empiece por {"t":"est" seguido de " y luego , o }
    if (!texto.startsWith('{"t":"est"')) {
      return [];
    }
    if (texto.length <= 9) {
      return [];
    }
    if (texto[9] !== '"') {
      return [];
    }
    if (texto.length <= 10) {
      return [];
    }
    const nextChar = texto[10];
    if (nextChar !== ',' && nextChar !== '}') {
      return [];
    }

    // Obtener el tema del emisor
    const tema = temaDe(emisor);
    if (tema === undefined) {
      return [];
    }

    // Obtener las conexiones en ese tema, excepto el emisor
    const conexiones = salas.get(tema);
    if (!conexiones) {
      return [];
    }

    const resultado: any[] = [];
    for (const conexion of conexiones) {
      if (conexion !== emisor) {
        resultado.push(conexion);
      }
    }
    return resultado;
  }

  return {
    entrar,
    salir,
    presencia,
    temaDe,
    difundir
  };
}