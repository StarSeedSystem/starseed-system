// cola-render.mjs · cola de render del servicio «hyperframes» (HFR1018G).
// Contrato: architecture/video-hyperframes.md §3-§4. Módulo PURO: `ejecutar` lanza el proceso y
// `reloj` da los milisegundos. Lista de argumentos y flags de la lista blanca; telemetría apagada.
export const FLAGS_PERMITIDOS = Object.freeze(["-o", "-f", "-q", "-w", "--format", "--variables", "--composition"]);
export const ESTADOS = Object.freeze(["en-cola", "renderizando", "hecho", "fallo", "cancelado"]);
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const FINALES = new Set(["hecho", "fallo", "cancelado"]);
/** ¿El proyecto es una ruta relativa que no sale del proyecto? Devuelve el motivo o null. */
export function proyectoValido(proyecto) {
  if (typeof proyecto !== "string") return "el proyecto debe ser texto";
  const p = proyecto.trim();
  if (!p) return "falta el proyecto";
  if (p.length > 200 || p.startsWith("/") || p.startsWith("~") || p.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(p)) {
    return "el proyecto debe ser una ruta relativa";
  }
  return p.split(/[\\/]+/).includes("..") ? "el proyecto no puede salir del proyecto" : null;
}
/** Valida la lista de argumentos: textos y solo flags permitidos. Devuelve el motivo o null. */
export function validarArgs(args) {
  if (!Array.isArray(args)) return "los argumentos deben ser una lista, nunca una cadena de shell";
  if (args.length === 0) return "faltan los argumentos";
  if (args.length > 64) return "demasiados argumentos (máximo 64)";
  for (const arg of args) {
    if (typeof arg !== "string" || !arg) return "cada argumento debe ser un texto no vacío";
    if (/[\0\r\n]/.test(arg)) return "un argumento lleva caracteres de control";
    if (!arg.startsWith("-")) continue;
    if (!FLAGS_PERMITIDOS.includes(arg.split("=")[0])) return `flag no permitido: ${arg.split("=")[0].slice(0, 20)}`;
  }
  return null;
}
/** Lee una línea de la CLI y devuelve el objeto de `@hf-progress {...}` (o null). */
export function leerProgreso(linea) {
  const m = String(linea ?? "").match(/@hf-progress\s+(\{[^\r\n]*\})/);
  if (!m) return null;
  try {
    const datos = JSON.parse(m[1]);
    return datos && typeof datos === "object" && !Array.isArray(datos) ? datos : null;
  } catch { return null; }
}
/** @typedef {{ ejecutar: (t: {id: string, proyecto: string, args: string[]}, o: {entorno: Record<string,string>, senal: AbortSignal, alProgreso: (linea: string) => void}) => Promise<{codigo?: number}>, reloj: () => number, maxSimultaneos?: number, maxSegundos?: number }} OpcionesCola */
/** @param {OpcionesCola} [opciones] Crea la cola de render. `ejecutar` y `reloj` son obligatorios. */
export function crearCola({ ejecutar, reloj, maxSimultaneos = 1, maxSegundos = 900 } = {}) {
  if (typeof ejecutar !== "function") throw new TypeError("falta el ejecutor inyectado");
  if (typeof reloj !== "function") throw new TypeError("falta el reloj inyectado");
  const tope = Math.max(1, Math.floor(Number(maxSimultaneos) || 1));
  const limiteMs = Math.max(1, (Number(maxSegundos) || 900) * 1000);
  const trabajos = new Map(), espera = [];
  let enCurso = 0, siguiente = 0;
  const ahora = () => Number(reloj());
  const vista = (t) => ({ id: t.id, proyecto: t.proyecto, args: [...t.args], estado: t.estado, progreso: t.progreso,
    motivo: t.motivo, creadoEn: t.creadoEn, iniciadoEn: t.iniciadoEn, terminadoEn: t.terminadoEn });
  const anotar = (t, texto) => { for (const linea of String(texto ?? "").split(/\r?\n/)) { const p = leerProgreso(linea); if (p) t.progreso = p; } };
  function cerrar(t, estado, motivo = null) {
    if (FINALES.has(t.estado)) return;
    t.estado = estado; t.motivo = motivo; t.terminadoEn = ahora();
    clearTimeout(t.temporizador);
  }
  function finalizarTurno() { enCurso = Math.max(0, enCurso - 1); bombear(); }
  function agotarTiempo(t) {
    if (FINALES.has(t.estado)) return;
    t.controlador.abort(); cerrar(t, "fallo", "tiempo máximo excedido"); finalizarTurno();
  }
  function lanzar(t) {
    const controlador = new AbortController();
    t.controlador = controlador;
    t.temporizador = setTimeout(() => agotarTiempo(t), limiteMs);
    const alProgreso = (linea) => {
      if (FINALES.has(t.estado)) return;
      const progreso = leerProgreso(linea);
      if (progreso) t.progreso = progreso;
      if (ahora() - t.iniciadoEn >= limiteMs) agotarTiempo(t);
    };
    Promise.resolve()
      .then(() => ejecutar({ id: t.id, proyecto: t.proyecto, args: [...t.args] },
        { entorno: { HYPERFRAMES_NO_TELEMETRY: "1" }, senal: controlador.signal, alProgreso }))
      .then((r) => {
        if (FINALES.has(t.estado)) return;
        anotar(t, r && (r.salida ?? r.stdout));
        const codigo = r && typeof r === "object" ? Number(r.codigo) : 0;
        if (codigo === 0) cerrar(t, "hecho");
        else cerrar(t, "fallo", `el render salió con código ${Number.isFinite(codigo) ? codigo : "desconocido"}`);
        finalizarTurno();
      })
      .catch(() => {
        if (FINALES.has(t.estado)) return;
        cerrar(t, "fallo", "el render no pudo ejecutarse"); finalizarTurno();
      });
  }
  function bombear() {
    while (enCurso < tope && espera.length > 0) {
      const t = espera.shift();
      t.estado = "renderizando"; t.iniciadoEn = ahora(); enCurso += 1; lanzar(t);
    }
  }
  function encolar(entrada = {}) {
    const motivo = proyectoValido(entrada.proyecto) ?? validarArgs(entrada.args);
    if (motivo) throw new Error(motivo);
    let id = entrada.id;
    if (id === undefined) { do { id = `t${++siguiente}`; } while (trabajos.has(id)); }
    else if (typeof id !== "string" || !ID.test(id)) throw new Error("id no válido");
    else if (trabajos.has(id)) throw new Error("ese id ya existe");
    const t = { id, proyecto: entrada.proyecto.trim(), args: [...entrada.args], estado: "en-cola",
      progreso: null, motivo: null, creadoEn: ahora(), iniciadoEn: null, terminadoEn: null };
    trabajos.set(id, t); espera.push(t); bombear();
    return id;
  }
  const estado = (id) => { const t = trabajos.get(String(id)); return t ? vista(t) : null; };
  function cancelar(id) {
    const t = trabajos.get(String(id));
    if (!t || FINALES.has(t.estado)) return false;
    if (t.estado === "en-cola") {
      const i = espera.indexOf(t);
      if (i >= 0) espera.splice(i, 1);
      cerrar(t, "cancelado");
    } else { t.controlador.abort(); cerrar(t, "cancelado"); finalizarTurno(); }
    return true;
  }
  return { encolar, estado, cancelar };
}
