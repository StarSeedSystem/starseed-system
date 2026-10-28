// Cola de render de HyperFrames (HFR1018G) · PURA: `ejecutar` y `reloj` se inyectan (la prueba usa
// un ejecutor falso y un reloj que avanza a mano). en-cola → renderizando → hecho|fallo|cancelado;
// progreso en las líneas `@hf-progress {…}`; los `args` son SIEMPRE lista con flags en lista blanca.

export const FLAGS_PERMITIDOS = new Set(["-o", "-f", "-q", "-w", "--format", "--variables", "--composition"]);
const TERMINALES = new Set(["hecho", "fallo", "cancelado"]);

/** Rechazo de una lista de argumentos, o null si es una lista segura. */
export function rechazoDeArgs(args) {
  if (!Array.isArray(args)) return "los argumentos deben ser una lista, nunca una cadena";
  for (const a of args) {
    if (typeof a !== "string") return "todo argumento debe ser de texto";
    if (a.startsWith("-") && !FLAGS_PERMITIDOS.has(a)) return `flag no permitido: «${a}»`;
  }
  return null;
}
/** El entorno de todo proceso de render lleva HYPERFRAMES_NO_TELEMETRY=1, y ese flag manda siempre. */
export function entornoRender(extra = {}) {
  return Object.freeze({ ...extra, HYPERFRAMES_NO_TELEMETRY: "1" });
}
/** Lee el progreso de una línea de la CLI: `@hf-progress {"…": …}` → objeto, o null. */
export function progresoDeLinea(linea) {
  const texto = String(linea ?? ""), i = texto.indexOf("@hf-progress");
  if (i === -1) return null;
  const resto = texto.slice(i + "@hf-progress".length).trim();
  if (!resto.startsWith("{")) return null;
  try { const dato = JSON.parse(resto); return dato && typeof dato === "object" ? dato : null; }
  catch { return null; }
}
/** Quita rutas de disco de un texto de error: nada de rutas absolutas en los mensajes. */
export function sinRutas(texto) {
  return String(texto ?? "").replace(/(?:[A-Za-z]:)?[/\\](?:Users|home|private|var|tmp|srv|opt)[^\s"'`]*/g, "<ruta>").slice(0, 200);
}
const relojReal = {
  ahora: () => Date.now(),
  programar: (fn, ms) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); },
};
/** Crea la cola. `ejecutar(trabajo, canal)` recibe { id, proyecto, args } y un canal { linea, cancelada, entorno }. */
export function crearCola({ ejecutar, reloj = relojReal, maxSimultaneos = 1, maxSegundos = 900 } = {}) {
  if (typeof ejecutar !== "function") throw new Error("falta la función `ejecutar`");
  if (!reloj || typeof reloj.ahora !== "function" || typeof reloj.programar !== "function") throw new Error("el reloj necesita `ahora` y `programar`");
  const maxActivos = Math.floor(Math.min(Math.max(Number(maxSimultaneos) || 1, 1), 8));
  const maxMs = Math.floor(Math.min(Math.max(Number(maxSegundos) || 900, 1), 7200)) * 1000;
  const ahora = () => reloj.ahora();
  let numero = 0, activos = 0;
  const trabajos = new Map();
  const agotar = (t) => { // se fue el tiempo máximo: queda «fallo» y se pide cancelar el render vivo
    if (TERMINALES.has(t.estado)) return;
    t.pedirCancelar = true; t.quitaPlazo = null;
    t.estado = "fallo"; t.terminado = ahora(); t.motivo = `agotó el tiempo máximo (${Math.round(maxMs / 1000)} s)`;
  };
  const canalDe = (t) => ({
    // Cada línea que imprime la CLI: solo se lee progreso si el trabajo sigue vivo.
    linea: (texto) => { if (!TERMINALES.has(t.estado)) { const dato = progresoDeLinea(texto); if (dato) t.progreso = dato; } },
    cancelada: () => t.pedirCancelar,
    entorno: entornoRender(),
  });
  const despachar = () => {
    for (const t of trabajos.values())
      if (activos < maxActivos && t.estado === "en-cola") iniciar(t);
  };
  const cerrar = (t, error, resultado) => { // el resultado de un trabajo terminal (cancelado o agotado) se descarta
    if (t.quitaPlazo) { t.quitaPlazo(); t.quitaPlazo = null; }
    activos -= 1;
    if (!TERMINALES.has(t.estado)) {
      if (t.pedirCancelar) { t.estado = "cancelado"; t.motivo = "se pidió cancelar"; }
      else if (error) { t.estado = "fallo"; t.motivo = sinRutas(error && error.message ? error.message : error) || "falló el render"; }
      else { t.estado = "hecho"; t.resultado = typeof resultado === "string" ? resultado : null; }
      t.terminado = ahora();
    }
    despachar();
  };
  const iniciar = (t) => {
    t.estado = "renderizando";
    t.iniciado = ahora();
    activos += 1;
    t.quitaPlazo = reloj.programar(() => agotar(t), maxMs);
    Promise.resolve().then(() => ejecutar({ id: t.id, proyecto: t.proyecto, args: [...t.args] }, canalDe(t)))
      .then((r) => cerrar(t, null, r)).catch((e) => cerrar(t, e, null));
  };
  return {
    /** Encola un trabajo { proyecto, args } y devuelve su id único. */
    encolar(peticion) {
      if (!peticion || typeof peticion !== "object" || typeof peticion.proyecto !== "string" || !peticion.proyecto.trim()) throw new Error("falta el proyecto");
      const lista = peticion.args ?? [];
      const rechazo = rechazoDeArgs(lista);
      if (rechazo) throw new Error(rechazo);
      numero += 1;
      const id = `hf-${numero}`;
      trabajos.set(id, {
        id, proyecto: peticion.proyecto, args: lista, estado: "en-cola", progreso: null,
        creado: ahora(), iniciado: null, terminado: null, motivo: null,
        resultado: null, pedirCancelar: false, quitaPlazo: null,
      });
      despachar();
      return id;
    },
    /** Copia del estado de un trabajo, o null si no existe. */
    estado(id) {
      const t = trabajos.get(id);
      return t ? {
        id: t.id, proyecto: t.proyecto, args: [...t.args], estado: t.estado, progreso: t.progreso && { ...t.progreso },
        creado: t.creado, iniciado: t.iniciado, terminado: t.terminado, motivo: t.motivo, resultado: t.resultado,
      } : null;
    },
    /** Pide cancelar un trabajo. Devuelve false si no existe o ya acabó. */
    cancelar(id) {
      const t = trabajos.get(id);
      if (!t || TERMINALES.has(t.estado)) return false;
      t.pedirCancelar = true;
      if (t.quitaPlazo) { t.quitaPlazo(); t.quitaPlazo = null; }
      t.estado = "cancelado"; t.motivo = "se pidió cancelar"; t.terminado = ahora();
      despachar();
      return true;
    },
  };
}
