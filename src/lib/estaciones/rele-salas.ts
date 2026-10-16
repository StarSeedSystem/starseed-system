/**
 * Relé de estaciones — gestión de salas para el rele de temas.
 * Módulo puro: sin red, sin disco, sin procesos lanzados.
 */

export type tipoResultadoEntrada = {
  ok: boolean;
  motivo?: string;
};

interface Sala {
  conexiones: Set<any>;
}

export function crearSalas(config: {
  maxSalas?: number;
  maxPorSala?: number;
  maxBytes?: number;
} = {}) {
  const maxSalas = config.maxSalas ?? 100;
  const maxPorSala = config.maxPorSala ?? 100;
  const maxBytes = config.maxBytes ?? 1000;

  const salas = new Map<string, Sala>();
  const conexionToTema = new Map<any, string>();

  function validarTema(tema: string): { ok: true } | { ok: false; motivo: string } {
    if (!tema.startsWith('estacion-vivo:') && !tema.startsWith('estacion-p:')) {
      return { ok: false, motivo: 'Tema inválido' };
    }
    const resto = tema.substring(tema.indexOf(':') + 1);
    if (resto.length < 8) {
      return { ok: false, motivo: 'Tema inválido' };
    }
    if (!/^[A-Z0-9]+$/i.test(resto)) {
      return { ok: false, motivo: 'Tema inválido' };
    }
    return { ok: true };
  }

  return {
    entrar(tema: string, conexion: any): tipoResultadoEntrada {
      const validacion = validarTema(tema);
      if (!validacion.ok) {
        return validacion;
      }

      const sala = salas.get(tema);
      if (sala && sala.conexiones.size >= maxPorSala) {
        return { ok: false, motivo: 'Límite de conexiones por sala alcanzado' };
      }

      if (!sala && salas.size >= maxSalas) {
        return { ok: false, motivo: 'Límite de salas alcanzado' };
      }

      if (!sala) {
        salas.set(tema, { conexiones: new Set() });
      }
      salas.get(tema)!.conexiones.add(conexion);
      conexionToTema.set(conexion, tema);

      return { ok: true };
    },

    salir(conexion: any): void {
      const tema = conexionToTema.get(conexion);
      if (tema === undefined) {
        return;
      }
      conexionToTema.delete(conexion);
      const sala = salas.get(tema);
      if (sala) {
        sala.conexiones.delete(conexion);
        if (sala.conexiones.size === 0) {
          salas.delete(tema);
        }
      }
    },

    presencia(tema: string): number {
      const sala = salas.get(tema);
      return sala ? sala.conexiones.size : 0;
    },

    temaDe(conexion: any): string | undefined {
      return conexionToTema.get(conexion);
    },

    difundir(emisor: any, texto: any): any[] {
      if (typeof texto !== 'string') {
        return [];
      }
      const byteLength = new TextEncoder().encode(texto).length;
      if (byteLength > maxBytes) {
        return [];
      }
      if (!texto.startsWith('{"t":"est","datos":"')) {
        return [];
      }

      const temaEmisor = conexionToTema.get(emisor);
      if (temaEmisor === undefined) {
        return [];
      }

      const sala = salas.get(temaEmisor);
      if (!sala) {
        return [];
      }

      const destinatarios: any[] = [];
      sala.conexiones.forEach((conexion) => {
        if (conexion !== emisor) {
          destinatarios.push(conexion);
        }
      });
      return destinatarios;
    },
  };
}
