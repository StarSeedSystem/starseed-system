const LIMITE_CUERPO_BYTES = 8 * 1024 * 1024;

function cuerpoExcedeLimite(cuerpo) {
  return cuerpo && Buffer.byteLength(JSON.stringify(cuerpo)) > LIMITE_CUERPO_BYTES;
}

function extraerIdRuta(ruta, prefijo) {
  return ruta.startsWith(prefijo) ? ruta.slice(prefijo.length) : null;
}

export function respuestaSalud(deps) {
  return { estado: 200, cuerpo: { version: deps.version, navegador: deps.navegador, ffmpeg: deps.ffmpeg, telemetriaApagada: true } };
}

export function manejarRender() {
  return { estado: 202, cuerpo: { mensaje: "Renderizado aceptado", idTrabajo: crypto.randomUUID() } };
}

export function manejarTrabajo(id) {
  return { estado: 200, cuerpo: { id, estado: "procesando", progreso: 0 } };
}

function crearRutas(hyperframesMod, sdkMod, playerMod) {
  const { Hyperframes } = hyperframesMod, { Sdk } = sdkMod, { Player } = playerMod;
  const manejarLint = async (cuerpo) => {
    try { return { estado: 200, cuerpo: await Hyperframes.lint(cuerpo) }; }
    catch (e) { return { estado: 400, cuerpo: { error: e.message } }; }
  };
  const manejarEditar = async (cuerpo) => {
    try { const sdk = new Sdk(); const c = await sdk.cargarComposicion(cuerpo.composicion); return { estado: 200, cuerpo: await sdk.aplicarOperaciones(c, cuerpo.operaciones) }; }
    catch (e) { return { estado: 400, cuerpo: { error: e.message } }; }
  };
  const manejarVista = async (id) => {
    try {
      const composicion = { id, elementos: [], duracion: 5, resolucion: "1280x720", fps: 24 };
      const vistaPrevia = await new Player().generarVistaPrevia(composicion);
      return { estado: 200, cuerpo: { composicion, vistaPrevia } };
    } catch { return { estado: 404, cuerpo: { error: "Composición no encontrada" } }; }
  };
  return {
    "GET:/salud": ({ deps }) => respuestaSalud(deps),
    "POST:/lint": ({ cuerpo }) => manejarLint(cuerpo),
    "POST:/editar": ({ cuerpo }) => manejarEditar(cuerpo),
    "GET:/vista/": ({ ruta }) => { const id = extraerIdRuta(ruta, "/vista/"); return id ? manejarVista(id) : { estado: 404, cuerpo: { error: "ID inválido" } }; },
    "POST:/render": () => manejarRender(),
    "GET:/trabajos/": ({ ruta }) => { const id = extraerIdRuta(ruta, "/trabajos/"); return id ? manejarTrabajo(id) : { estado: 404, cuerpo: { error: "ID inválido" } }; }
  };
}

let _rutasCache = null;
function obtenerRutas() {
  if (_rutasCache) return _rutasCache;
  _rutasCache = Promise.all([import("hyperframes"), import("@hyperframes/sdk"), import("@hyperframes/player")]).then(([h, s, p]) => crearRutas(h, s, p));
  return _rutasCache;
}

export async function manejar({ metodo, ruta, cuerpo }, deps) {
  if (cuerpoExcedeLimite(cuerpo)) return { estado: 413, cuerpo: { error: "Cuerpo demasiado grande" } };
  const rutas = await obtenerRutas();
  const clave = `${metodo}:${ruta}`;
  if (rutas[clave]) return rutas[clave]({ metodo, ruta, cuerpo, deps });
  for (const [patron, h] of Object.entries(rutas)) if (patron.endsWith("/") && ruta.startsWith(patron)) return h({ metodo, ruta, cuerpo, deps });
  return { estado: 404, cuerpo: { error: "Ruta no encontrada" } };
}

export { cuerpoExcedeLimite, extraerIdRuta, LIMITE_CUERPO_BYTES };