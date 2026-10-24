// Relé de estaciones (lógica pura de salas)
// Creado para la tarea S1010-EV-ORACLE-1a
export function crearSalas({ maxSalas = 200, maxPorSala = 500, maxBytes = 40000 } = {}) {
  // Map<tema, Set<conexion>>
  const salas = new Map();
  // WeakMap<conexion, tema> para obtener el tema de una conexión rápidamente
  const connectionToTema = new WeakMap();

  // Expresión regular para validar el tema
  const temaValido = /^estacion-(vivo|p):[A-Za-z0-9_:-]{8,80}$/;

  // Saca la conexión de su sala (y borra la sala si queda vacía, para ahorrar memoria).
  function salir(conexion) {
    const tema = connectionToTema.get(conexion);
    if (tema === undefined) return;
    const conexiones = salas.get(tema);
    if (conexiones) {
      conexiones.delete(conexion);
      if (conexiones.size === 0) {
        salas.delete(tema);
      }
    }
    connectionToTema.delete(conexion);
  }

  return {
    entrar(tema, conexion) {
      // Validar tema
      if (!temaValido.test(tema)) {
        return { ok: false, motivo: 'Tema inválido' };
      }
      // Una conexión vive en UNA sola sala (el cliente abre `/ws?tema=…`).
      const anterior = connectionToTema.get(conexion);
      if (anterior === tema) {
        return { ok: true };
      }
      // La sala que deja vacía al irse no cuenta para el límite.
      const liberaSala = anterior !== undefined && salas.get(anterior)?.size === 1;
      // Límite de salas
      if (!salas.has(tema) && salas.size - (liberaSala ? 1 : 0) >= maxSalas) {
        return { ok: false, motivo: 'Límite de salas alcanzado' };
      }
      // Límite de conexiones por sala
      const existente = salas.get(tema);
      if (existente && existente.size >= maxPorSala) {
        return { ok: false, motivo: 'Límite de conexiones por sala alcanzado' };
      }
      // Solo cuando la nueva sala la acepta sale de la anterior: si la rechaza, se queda donde estaba.
      if (anterior !== undefined) {
        salir(conexion);
      }
      let conexiones = salas.get(tema);
      if (!conexiones) {
        conexiones = new Set();
        salas.set(tema, conexiones);
      }
      conexiones.add(conexion);
      connectionToTema.set(conexion, tema);
      return { ok: true };
    },
    salir,
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