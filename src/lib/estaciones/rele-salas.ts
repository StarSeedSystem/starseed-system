export function crearSalas(opts: { maxSalas: number; maxPorSala: number; maxBytes: number }) {
  const { maxSalas, maxPorSala, maxBytes } = opts;
  const salasMap = new Map<string, { conexiones: Set<any> }>();
  const conexionToTema = new Map<any, string>();

  function entrar(tema: string, conexion: any): { ok: boolean; motivo?: string } {
    // Validate tema format: must be 'estacion-vivo:' or 'estacion-p:' followed by exactly 16 hexadecimal characters (case-insensitive)
    const temaRegex = /^(estacion-vivo|estacion-p):[0-9A-F]{16}$/i;
    if (!temaRegex.test(tema)) {
      return { ok: false, motivo: 'tema inválido' };
    }

    // Check if the connection is already in a sala
    let oldTema: string | undefined = undefined;
    if (conexionToTema.has(conexion)) {
      oldTema = conexionToTema.get(conexion);
    }

    // Calculate the change in the number of salas if we were to make this change
    let delta = 0;
    if (oldTema !== undefined) {
      // We are going to remove the connection from its old sala.
      const oldSala = salasMap.get(oldTema);
      if (oldSala) {
        // After removal, if the old sala becomes empty, we will remove it.
        if (oldSala.conexiones.size === 1) {
          delta -= 1;
        }
      }
    }

    const needsNewSala = !salasMap.has(tema);
    if (needsNewSala) {
      // We are going to need a new sala for the tema (if it doesn't exist)
      delta += 1;
    }

    // The new number of salas would be: salasMap.size + delta
    // We must not exceed maxSalas.
    if (salasMap.size + delta > maxSalas) {
      return { ok: false, motivo: 'límite de salas' };
    }

    // Now we can safely make the changes.

    // Remove the connection from the old sala (if any)
    if (oldTema !== undefined) {
      const oldSala = salasMap.get(oldTema);
      if (oldSala) {
        oldSala.conexiones.delete(conexion);
        if (oldSala.conexiones.size === 0) {
          salasMap.delete(oldTema);
        }
      }
    }

    // Get or create the sala for the new tema
    let sala = salasMap.get(tema);
    if (!sala) {
      sala = { conexiones: new Set() };
      salasMap.set(tema, sala);
    }

    // Check if the sala is full (before adding the connection)
    if (sala.conexiones.size >= maxPorSala) {
      return { ok: false, motivo: 'límite de conexiones por sala' };
    }

    // Add the connection
    sala.conexiones.add(conexion);
    conexionToTema.set(conexion, tema);

    return { ok: true };
  }

  function salir(conexion: any): void {
    if (conexionToTema.has(conexion)) {
      const tema = conexionToTema.get(conexion);
      const sala = salasMap.get(tema);
      if (sala) {
        sala.conexiones.delete(conexion);
        if (sala.conexiones.size === 0) {
          salasMap.delete(tema);
        }
      }
      conexionToTema.delete(conexion);
    }
  }

  function presencia(tema: string): number {
    const sala = salasMap.get(tema);
    return sala ? sala.conexiones.size : 0;
  }

  function temaDe(conexion: any): string | undefined {
    return conexionToTema.get(conexion);
  }

  function difundir(emisor: any, texto: string | any): any[] {
    // Check if texto is a string
    if (typeof texto !== 'string') {
      return [];
    }

    // Check maxBytes: count UTF-8 bytes
    const byteLength = new TextEncoder().encode(texto).length;
    if (byteLength > maxBytes) {
      return [];
    }

    // Check if it starts with '{"t":"est"' (note: the test expects exactly this prefix)
    if (!texto.startsWith('{"t":"est"')) {
      return [];
    }

    // Get the tema of the emisor
    const emisorTema = temaDe(emisor);
    if (!emisorTema) {
      // If the emisor is not in any sala, return empty
      return [];
    }

    // Get the sala for the emisor's tema
    const sala = salasMap.get(emisorTema);
    if (!sala) {
      return [];
    }

    // Return all connections in the sala except the emisor
    const destinatarios: any[] = [];
    for (const conexion of sala.conexiones) {
      if (conexion !== emisor) {
        destinatarios.push(conexion);
      }
    }
    return destinatarios;
  }

  return {
    entrar,
    salir,
    presencia,
    temaDe,
    difundir
  };
}