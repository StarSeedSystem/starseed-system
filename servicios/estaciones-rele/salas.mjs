// Relé de estaciones (lógica pura de salas)
// Creado para la tarea S1010-EV-ORACLE-1a
export function crearSalas({ maxSalas = 200, maxPorSala = 500, maxBytes = 40000 } = {}) {
  // Map<tema, Set<conexion>>
  const salas = new Map();
  // WeakMap<conexion, tema> para obtener el tema de una conexión rápidamente
  const connectionToTema = new WeakMap();

  // Expresión regular para validar el tema
  const temaValido = /^estacion-(vivo|p):[A-Za-z0-9_:-]{8,80}$/;

  return {
    entrar(tema, conexion) {
      // Validar tema
      if (!temaValido.test(tema)) {
        return { ok: false, motivo: 'Tema inválido' };
      }
      // Límite de salas
      if (salas.size >= maxSalas && !salas.has(tema)) {
        return { ok: false, motivo: 'Límite de salas alcanzado' };
      }
      // Obtener o crear el set de conexiones para el tema
      let conexiones = salas.get(tema);
      if (!conexiones) {
        conexiones = new Set();
        salas.set(tema, conexiones);
      }
      // Límite de conexiones por sala
      if (conexiones.size >= maxPorSala) {
        return { ok: false, motivo: 'Límite de conexiones por sala alcanzado' };
      }
      // Añadir conexión
      conexiones.add(conexion);
      connectionToTema.set(conexion, tema);
      return { ok: true };
    },
    salir(conexion) {
      const tema = connectionToTema.get(conexion);
      if (tema) {
        const conexiones = salas.get(tema);
        if (conexiones) {
          conexiones.delete(conexion);
          // Si la sala queda vacía, opcionalmente eliminarla para ahorrar memoria
          if (conexiones.size === 0) {
            salas.delete(tema);
          }
          connectionToTema.delete(conexion);
        }
      }
    },
    difundir(conexion, texto) {
      // Validar texto
      if (typeof texto !== 'string' || texto.length > maxBytes || !texto.startsWith('{"t":"est"')) {
        return [];
      }
      const tema = connectionToTema.get(conexion);
      if (!tema) {
        return [];
      }
      const conexiones = salas.get(tema);
      if (!conexiones) {
        return [];
      }
      // Devolver todas las conexiones de la sala excepto el emisor
      const destino = [];
      for (const c of conexiones) {
        if (c !== conexion) {
          destino.push(c);
        }
      }
      return destino;
    },
    presencia(tema) {
      const conexiones = salas.get(tema);
      return conexiones ? conexiones.size : 0;
    },
    temaDe(conexion) {
      return connectionToTema.get(conexion);
    }
  };
}