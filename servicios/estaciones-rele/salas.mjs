export function crearSalas({ maxSalas = 200, maxPorSala = 500, maxBytes = 40000 } = {}) {
  // Map<topic, Set<connection>>
  const salas = new Map();
  // Map<connection, topic>
  const conexionATema = new Map();

  function entrar(tema, conexion) {
    if (!/^estacion-(vivo|p):[A-Za-z0-9_:-]{8,80}$/.test(tema)) {
      return { ok: false, motivo: 'tema inválido' };
    }
    // If connection already in a room, remove it from that room
    if (conexionATema.has(conexion)) {
      const antiguoTema = conexionATema.get(conexion);
      const antiguaSala = salas.get(antiguoTema);
      if (antiguaSala) {
        antiguaSala.delete(conexion);
        if (antiguaSala.size === 0) {
          salas.delete(antiguoTema);
        }
      }
      conexionATema.delete(conexion);
    }
    // Check if we are adding a new room
    const esNuevaSala = !salas.has(tema);
    if (esNuevaSala && salas.size >= maxSalas) {
      return { ok: false, motivo: 'límite de salas' };
    }
    // Get or create the set for this topic
    let sala = salas.get(tema);
    if (!sala) {
      sala = new Set();
      salas.set(tema, sala);
    }
    // Check room capacity
    if (sala.size >= maxPorSala) {
      return { ok: false, motivo: 'límite de conexiones por sala' };
    }
    // Add connection
    sala.add(conexion);
    conexionATema.set(conexion, tema);
    return { ok: true };
  }

  function salir(conexion) {
    const tema = conexionATema.get(conexion);
    if (tema) {
      const sala = salas.get(tema);
      if (sala) {
        sala.delete(conexion);
        if (sala.size === 0) {
          salas.delete(tema);
        }
      }
      conexionATema.delete(conexion);
    }
  }

  function difundir(conexion, texto) {
    if (typeof texto !== 'string') {
      return [];
    }
    const encoder = new TextEncoder();
    if (encoder.encode(texto).length > maxBytes) {
      return [];
    }
    if (!texto.startsWith('{"t":"est')) {
      return [];
    }
    const tema = conexionATema.get(conexion);
    if (!tema) {
      return [];
    }
    const sala = salas.get(tema);
    if (!sala) {
      return [];
    }
    const destinatarios = [];
    for (const conn of sala) {
      if (conn !== conexion) {
        destinatarios.push(conn);
      }
    }
    return destinatarios;
  }

  function presencia(tema) {
    const sala = salas.get(tema);
    return sala ? sala.size : 0;
  }

  function temaDe(conexion) {
    return conexionATema.get(conexion);
  }

  return {
    entrar,
    salir,
    difundir,
    presencia,
    temaDe
  };
}