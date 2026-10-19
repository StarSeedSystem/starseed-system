const LIMITE_CUERPO_BYTES = 8 * 1024 * 1024;

function cuerpoExcedeLimite(cuerpo) {
  if (!cuerpo) return false;
  return Buffer.byteLength(JSON.stringify(cuerpo)) > LIMITE_CUERPO_BYTES;
}

function extraerIdRuta(ruta, prefijo) {
  if (!ruta.startsWith(prefijo)) return null;
  return ruta.slice(prefijo.length);
}

export function respuestaSalud(deps) {
  return {
    estado: 200,
    cuerpo: {
      version: deps.version,
      navegador: deps.navegador,
      ffmpeg: deps.ffmpeg,
      telemetriaApagada: true
    }
  };
}

export function manejarRender() {
  const idTrabajo = crypto.randomUUID();
  return {
    estado: 202,
    cuerpo: { mensaje: "Renderizado aceptado", idTrabajo }
  };
}

export function manejarTrabajo(id) {
  return {
    estado: 200,
    cuerpo: { id, estado: "procesando", progreso: 0 }
  };
}

function crearRutas(hyperframesMod, sdkMod, playerMod) {
  const { Hyperframes } = hyperframesMod;
  const { Sdk } = sdkMod;
  const { Player } = playerMod;

  async function manejarLint(cuerpo) {
    try {
      const resultado = await Hyperframes.lint(cuerpo);
      return { estado: 200, cuerpo: resultado };
    } catch (error) {
      return { estado: 400, cuerpo: { error: error.message } };
    }
  }

  async function manejarEditar(cuerpo) {
    try {
      const sdk = new Sdk();
      const composicion = await sdk.cargarComposicion(cuerpo.composicion);
      const resultado = await sdk.aplicarOperaciones(composicion, cuerpo.operaciones);
      return { estado: 200, cuerpo: resultado };
    } catch (error) {
      return { estado: 400, cuerpo: { error: error.message } };
    }
  }

  async function manejarVista(id) {
    try {
      const composicion = {
        id,
        elementos: [],
        duracion: 5,
        resolucion: "1280x720",
        fps: 24
      };
      const reproductor = new Player();
      const vistaPrevia = await reproductor.generarVistaPrevia(composicion);
      return { estado: 200, cuerpo: { composicion, vistaPrevia } };
    } catch {
      return { estado: 404, cuerpo: { error: "Composición no encontrada" } };
    }
  }

  return {
    "GET:/salud": ({ deps }) => respuestaSalud(deps),
    "POST:/lint": ({ cuerpo }) => manejarLint(cuerpo),
    "POST:/editar": ({ cuerpo }) => manejarEditar(cuerpo),
    "GET:/vista/": ({ ruta }) => {
      const id = extraerIdRuta(ruta, "/vista/");
      return id ? manejarVista(id) : { estado: 404, cuerpo: { error: "ID inválido" } };
    },
    "POST:/render": () => manejarRender(),
    "GET:/trabajos/": ({ ruta }) => {
      const id = extraerIdRuta(ruta, "/trabajos/");
      return id ? manejarTrabajo(id) : { estado: 404, cuerpo: { error: "ID inválido" } };
    }
  };
}

let _rutasCache = null;

function obtenerRutas() {
  if (_rutasCache) return _rutasCache;
  const hyperframesMod = import("hyperframes");
  const sdkMod = import("@hyperframes/sdk");
  const playerMod = import("@hyperframes/player");
  _rutasCache = Promise.all([hyperframesMod, sdkMod, playerMod]).then(([h, s, p]) =>
    crearRutas(h, s, p)
  );
  return _rutasCache;
}

export async function manejar({ metodo, ruta, cuerpo }, deps) {
  if (cuerpoExcedeLimite(cuerpo)) {
    return { estado: 413, cuerpo: { error: "Cuerpo demasiado grande" } };
  }

  const rutas = await obtenerRutas();

  const claveExacta = `${metodo}:${ruta}`;
  if (rutas[claveExacta]) {
    return rutas[claveExacta]({ metodo, ruta, cuerpo, deps });
  }

  for (const [patron, handler] of Object.entries(rutas)) {
    if (patron.endsWith("/") && ruta.startsWith(patron)) {
      return handler({ metodo, ruta, cuerpo, deps });
    }
  }

  return { estado: 404, cuerpo: { error: "Ruta no encontrada" } };
}

export { cuerpoExcedeLimite, extraerIdRuta, LIMITE_CUERPO_BYTES };