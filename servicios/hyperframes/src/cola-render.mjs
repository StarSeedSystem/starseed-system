// Cola de render del servicio «hyperframes» de una neurona (HFR1018G).
// Contrato: architecture/video-hyperframes.md §4.3. `ejecutar` y `reloj` se inyectan: aquí no hay
// red, disco ni procesos. La telemetría de HyperFrames viaja SIEMPRE apagada en el entorno.

export const ESTADOS = Object.freeze(["en-cola", "renderizando", "hecho", "fallo", "cancelado"]);
export const FLAGS_PERMITIDOS = Object.freeze([
  "-o", "-f", "-q", "-w", "--format", "--variables", "--composition",
]);

const FLAGS = new Set(FLAGS_PERMITIDOS);
const FINALES = new Set(["hecho", "fallo", "cancelado"]);
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Motivo por el que unos argumentos no son seguros, o null si lo son. */
export function validarArgs(args) {
  return null;
}

/** Progreso (0..1) de una línea `@hf-progress {...}` de la CLI, o null si no lo es. */
export function leerProgreso(linea) {
  return null;
}

/** Quita rutas absolutas de un mensaje antes de guardarlo o devolverlo. */
export function sinRutas(texto) {
  return String(texto ?? "")
    .replace(/(?:[A-Za-z]:)?[\\/](?:Users|home|private|var|tmp|srv|opt)[^\s"'`]*/g, "<ruta>")
    .slice(0, 300);
}

/** Crea una cola con topes de simultaneidad y de tiempo. */
export function crearCola({
  ejecutar,
  reloj = () => Date.now(),
  maxSimultaneos = 1,
  maxSegundos = 900,
  entorno = {},
} = {}) {
  if (typeof ejecutar !== "function") throw new Error("falta ejecutar");
  if (typeof reloj !== "function") throw new Error("falta reloj");
  const tope = Math.max(1, Math.floor(Number(maxSimultaneos)) || 1);
  const limite = Math.max(1, Math.floor(Number(maxSegundos)) || 900);
  const trabajos = new Map();
  const orden = [];
  let activos = 0;

  return { encolar, estado, listar, cancelar, revisar };
}
