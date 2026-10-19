import { Hyperframes } from "hyperframes";
import { Sdk } from "@hyperframes/sdk";
import { Player } from "@hyperframes/player";

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

export async function manejarLint(cuerpo) {
  try {
    const resultado = await Hyperframes.lint(cuerpo);
    return { estado: 200, cuerpo: resultado };
  } catch (error) {
    return { estado: 400, cuerpo: { error: error.message } };
  }
}

export async function manejarEditar(cuerpo) {
  try {
    const sdk = new Sdk();
    const composicion = await sdk.cargarComposicion(cuerpo.composicion);
    const resultado = await sdk.aplicarOperaciones(composicion, cuerpo.operaciones);
    return { estado: 200, cuerpo: resultado };
  } catch (error) {
    return { estado: 400, cuerpo: { error: error.message } };
  }
}

export async function manejarVista(id, deps) {
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

export const RUTAS = {
  "GET:/salud": ({ deps }) => respuestaSalud(deps),
  "POST:/lint": ({ cuerpo }) => manejarLint(cuerpo),
  "POST:/editar": ({ cuerpo }) => manejarEditar(cuerpo),
  "GET:/vista/": ({ ruta, deps }) => {
    const id = extraerIdRuta(ruta, "/vista/");
    return id ? manejarVista(id, deps) : { estado: 404, cuerpo: { error: "ID inválido" } };
  },
  "POST:/render": () => manejarRender(),
  "GET:/trabajos/": ({ ruta }) => {
    const id = extraerIdRuta(ruta, "/trabajos/");
    return id ? manejarTrabajo(id) : { estado: 404, cuerpo: { error: "ID inválido" } };
  }
};

export async function manejar({ metodo, ruta, cuerpo }, deps) {
  if (cuerpoExcedeLimite(cuerpo)) {
    return { estado: 413, cuerpo: { error: "Cuerpo demasiado grande" } };
  }

  const claveExacta = `${metodo}:${ruta}`;
  if (RUTAS[claveExacta]) {
    return RUTAS[claveExacta]({ metodo, ruta, cuerpo, deps });
  }

  for (const [patron, handler] of Object.entries(RUTAS)) {
    if (patron.endsWith("/") && ruta.startsWith(patron)) {
      return handler({ metodo, ruta, cuerpo, deps });
    }
  }

  return { estado: 404, cuerpo: { error: "Ruta no encontrada" } };
}