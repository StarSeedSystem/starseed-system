export interface Salas {
  entrar(tema: string, conexion: any): { ok: boolean; motivo?: string };
  presencia(tema: string): number;
  temaDe(conexion: any): string | undefined;
  salir(conexion: any): void;
  difundir(emisor: any, texto: any): any[];
}

export function crearSalas(options: {
  maxSalas?: number;
  maxPorSala?: number;
  maxBytes?: number;
} = {}): Salas {
  const maxSalas = options.maxSalas ?? 100;
  const maxPorSala = options.maxPorSala ?? 100;
  const maxBytes = options.maxBytes ?? 1000;

  // State
  const salas = new Map<string, Set<any>>(); // tema -> set of conexiones
  const conexionTema = new Map<any, string>(); // conexion -> tema

function esTemaValido(tema: string): boolean {
  if (tema.startsWith('estacion-vivo:')) {
    const parte = tema.substring('estacion-vivo:'.length);
    return parte.length >= 4;
  }
  
  if (tema.startsWith('estacion-p:')) {
    const parte = tema.substring('estacion-p:'.length);
    return parte.length >= 4;
  }
  
  return false;
}

  return {
    entrar(tema, conexion) {
      if (!esTemaValido(tema)) {
        return { ok: false, motivo: 'Tema inválido' };
      }

      if (!salas.has(tema) && salas.size >= maxSalas) {
        return { ok: false, motivo: 'Límite de salas alcanzado' };
      }

      let conexiones = salas.get(tema);
      if (!conexiones) {
        conexiones = new Set();
        salas.set(tema, conexiones);
      }

      if (conexiones.size >= maxPorSala) {
        return { ok: false, motivo: 'Límite de conexiones por sala alcanzado' };
      }

      conexiones.add(conexion);
      conexionTema.set(conexion, tema);

      return { ok: true };
    },

    presencia(tema) {
      const conexiones = salas.get(tema);
      return conexiones ? conexiones.size : 0;
    },

    temaDe(conexion) {
      return conexionTema.get(conexion);
    },

    salir(conexion) {
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
    },

    difundir(emisor, texto) {
      // Check if texto is a string
      if (typeof texto !== 'string') {
        return [];
      }

      // Check if texto is too long
      if (texto.length > maxBytes) {
        return [];
      }

      // Check if texto starts with '{"t":"est"'
      if (!texto.startsWith('{"t":"est"')) {
        return [];
      }

      // Get the topic of the emisor
      const tema = conexionTema.get(emisor);
      if (!tema) {
        return [];
      }

      // Get all connections in the same topic except the emisor
      const conexiones = salas.get(tema);
      if (!conexiones) {
        return [];
      }

      const resultado: any[] = [];
      conexiones.forEach((conexion) => {
        if (conexion !== emisor) {
          resultado.push(conexion);
        }
      });
      return resultado;
    }
  };
}