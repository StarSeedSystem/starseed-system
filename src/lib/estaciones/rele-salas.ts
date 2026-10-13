/**
 * Rele de salas (gestión básica de salas y conexiones)
 * ═══════════════════════════════════════════════════════════════
 *
 * Función pura: crearSalas.
 *
 * Conceptos clave:
 *   · TEMA: string como "estacion-vivo:ABCDEF1234" (prefijo + : + hex)
 *   · CONEXIÓN: any (objeto plano) — el test usa {}.
 *   · LÍMITES: maxSalas (nº de temas activos), maxPorSala (conexiones por tema),
 *     maxBytes (tamaño total del tema + conexión).
 *   · RESPUESTAS: {ok: boolean, motivo?: string}.
 */

interface ConexionSalas {
  id: number;
  tema: string | undefined;
}

interface Salas {
  entrar(tema: string, conexion: any): { ok: boolean; motivo?: string };
  salir(conexion: any): void;
  presencia(tema: string): number;
  temaDe(conexion: any): string | undefined;
  difundir(conexion: any, texto: string): any[];
}

function crearSalas({ maxSalas = 100, maxPorSala = 100, maxBytes = 100_000 } = {}): Salas {
  const conexiones: Map<number, ConexionSalas> = new Map();
  const temas: Map<string, Set<number>> = new Map();
  const conexionesOriginales: Map<number, any> = new Map();
  let proximoId = 1;

  const conexionValida = (tema: string, conexion: any): boolean => {
    if (!tema || typeof tema !== "string") return false;
    if (!/^estacion-(?:vivo|p):[A-Z0-9]+$/i.test(tema)) return false;
    const match = tema.match(/^estacion-(?:vivo|p):([A-Z0-9]+)$/i);
    if (match && match[1] && match[1].length < 4) return false;
    return true;
  };

  const contarBytes = (tema: string, conexion: any): number => {
    const bytesTema = new TextEncoder().encode(tema).length;
    const bytesConexion = new TextEncoder().encode(JSON.stringify(conexion)).length;
    return bytesTema + bytesConexion;
  };

  function esTextoValido(texto: string): boolean {
    if (typeof texto !== "string") return false;
    if (!texto.startsWith('{"t":"est"')) return false;

    try {
      JSON.parse(texto);
      return true;
    } catch {
      return false;
    }
  }

  return {
    entrar(tema: string, conexion: any): { ok: boolean; motivo?: string } {
      if (!conexionValida(tema, conexion)) {
        return { ok: false, motivo: "Tema inválido" };
      }

      const idConexion = proximoId++;

      if (contarBytes(tema, conexion) > maxBytes) {
        return { ok: false, motivo: "Tema o conexión excede el límite de bytes" };
      }

      if (temas.size >= maxSalas) {
        return { ok: false, motivo: "Límite de salas alcanzado" };
      }

      if (!temas.has(tema)) {
        temas.set(tema, new Set());
      }

      const conexionesDelTema = temas.get(tema)!;
      if (conexionesDelTema.size >= maxPorSala) {
        return { ok: false, motivo: "Límite de conexiones por sala alcanzado" };
      }

      const conx: ConexionSalas = { id: idConexion, tema };
      conexiones.set(idConexion, conx);
      conexionesOriginales.set(idConexion, conexion);

      conexionesDelTema.add(idConexion);

      conexion.__salaId = idConexion;
      conexion.__salaTema = tema;

      return { ok: true };
    },

    salir(conexion: any): void {
      const id = conexion.__salaId;
      if (!id) return;

      const tema = conexion.__salaTema;
      if (!tema) return;

      const conexionesDelTema = temas.get(tema);
      if (conexionesDelTema) {
        conexionesDelTema.delete(id);
        if (conexionesDelTema.size === 0) {
          temas.delete(tema);
        }
      }

      conexiones.delete(id);
      conexionesOriginales.delete(id);
      delete conexion.__salaId;
      delete conexion.__salaTema;
    },

    presencia(tema: string): number {
      const conexionesDelTema = temas.get(tema);
      return conexionesDelTema ? conexionesDelTema.size : 0;
    },

    temaDe(conexion: any): string | undefined {
      return conexion.__salaTema;
    },

    difundir(conexion: any, texto: string): any[] {
      const tema = conexion.__salaTema;
      if (!tema || typeof texto !== "string") return [];

      if (!esTextoValido(texto)) return [];

      const conexionesDestino = temas.get(tema);
      if (!conexionesDestino) return [];

      const destino: any[] = [];
      for (const idDest of conexionesDestino) {
        if (idDest === conexion.__salaId) continue;
        const conxDest = conexiones.get(idDest);
        if (conxDest?.tema === tema) {
          const conexionDest = conexionesOriginales.get(idDest);
          if (conexionDest) {
            destino.push(conexionDest);
          }
        }
      }

      return destino;
    },
  };
}

export { crearSalas };
export type { Salas };