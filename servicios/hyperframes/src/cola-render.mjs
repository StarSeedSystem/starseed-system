// Cola de render del servicio «hyperframes» (HFR1018G). Contrato: architecture/video-hyperframes.md §4.3.
// PURO: ejecutor y reloj inyectados, sin disco/red/child_process. Args SIEMPRE lista (nunca shell); telemetría apagada.
import { fueraDelProyecto, sinRutas } from "./rutas.mjs";
/** Flags que la CLI de HyperFrames puede recibir desde esta cola. */
export const FLAGS_PERMITIDOS = Object.freeze(["-o", "-f", "-q", "-w", "--format", "--variables", "--composition"]);
/** Estados de un trabajo, en el orden en que puede pasar por ellos. */
export const ESTADOS = Object.freeze(["en-cola", "renderizando", "hecho", "fallo", "cancelado"]);
export const MAX_ARGUMENTOS = 64;
const ID = /^[A-Za-z0-9_-]{1,64}$/, TERMINALES = new Set(["hecho", "fallo", "cancelado"]);
const ENV = Object.freeze({ HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1" });
const RELOJ = { ahora: () => Date.now(), tras: (ms) => { let id; return { promesa: new Promise((r) => { id = setTimeout(r, ms); }), cancelar: () => clearTimeout(id) }; } };
/** Motivo en español si los argumentos no son una lista segura; `null` si valen. */
export function validarArgumentos(args) {
  if (!Array.isArray(args)) return "los argumentos deben ser una lista, nunca una cadena de shell";
  if (args.length > MAX_ARGUMENTOS) return `demasiados argumentos (máximo ${MAX_ARGUMENTOS})`;
  for (const arg of args) {
    if (typeof arg !== "string" || !arg.trim()) return "cada argumento debe ser un texto no vacío";
    if (arg.length > 512) return "un argumento pasa de 512 caracteres";
    if (/[\0\r\n]/.test(arg)) return "un argumento lleva un carácter de control";
    if (arg.startsWith("-") && !FLAGS_PERMITIDOS.includes(arg.split("=", 1)[0])) return `el flag «${arg}» no está permitido`;
    if (fueraDelProyecto(arg)) return "un argumento apunta fuera del proyecto";
  }
  return null;
}
/** Motivo en español si el trabajo no sirve; `null` si vale. */
export function validarTrabajo(trabajo) {
  if (!trabajo || typeof trabajo !== "object" || Array.isArray(trabajo)) return "el trabajo debe ser un objeto { id, proyecto, args }";
  if (typeof trabajo.id !== "string" || !ID.test(trabajo.id)) return "el id no es válido (letras, números, guion y guion bajo; máximo 64)";
  if (typeof trabajo.proyecto !== "string" || !trabajo.proyecto.trim()) return "falta el proyecto";
  if (trabajo.proyecto.length > 200) return "el proyecto pasa de 200 caracteres";
  if (/[\0\r\n]/.test(trabajo.proyecto) || fueraDelProyecto(trabajo.proyecto)) return "el proyecto apunta fuera del proyecto";
  return validarArgumentos(trabajo.args);
}
/** Lee una línea `@hf-progress {...}`; devuelve `{ progreso, etapa, mensaje }` o `null`. */
export function leerProgreso(linea) {
  const m = /^\s*@hf-progress\s+(\{[\s\S]*\})\s*$/.exec(String(linea ?? ""));
  if (!m) return null;
  let datos;
  try { datos = JSON.parse(m[1]); } catch { return null; }
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) return null;
  const salida = {}, progreso = Number(datos.progreso ?? datos.progress);
  if (Number.isFinite(progreso)) salida.progreso = Math.max(0, Math.min(100, progreso));
  const etapa = typeof datos.etapa === "string" ? datos.etapa : typeof datos.stage === "string" ? datos.stage : "";
  if (etapa) salida.etapa = sinRutas(etapa).slice(0, 80);
  const mensaje = typeof datos.mensaje === "string" ? datos.mensaje : typeof datos.message === "string" ? datos.message : "";
  if (mensaje) salida.mensaje = sinRutas(mensaje).slice(0, 200);
  return Object.keys(salida).length ? salida : null;
}
function codigoDe(resultado) {
  if (typeof resultado === "number") return Number.isInteger(resultado) ? resultado : 1;
  const codigo = resultado && typeof resultado === "object" ? resultado.codigo ?? resultado.code ?? resultado.exitCode : undefined;
  return Number.isInteger(codigo) ? codigo : 1;
}
/** @param {{ ejecutar?: Function, reloj?: { ahora: () => number, tras: (ms: number) => { promesa: Promise<void>, cancelar: () => void } }, maxSimultaneos?: number, maxSegundos?: number }} [opciones] Crea la cola; el ejecutor recibe `(args, { proyecto, env, senal, alProgreso })` y devuelve `{ codigo }`. */
export function crearCola({ ejecutar, reloj = RELOJ, maxSimultaneos = 1, maxSegundos = 900 } = {}) {
  if (typeof ejecutar !== "function") throw new Error("la cola necesita un ejecutor");
  if (!Number.isInteger(maxSimultaneos) || maxSimultaneos < 1) throw new Error("maxSimultaneos debe ser un entero positivo");
  if (!Number.isFinite(maxSegundos) || maxSegundos <= 0) throw new Error("maxSegundos debe ser un número positivo");
  if (!reloj || typeof reloj.ahora !== "function" || typeof reloj.tras !== "function") throw new Error("el reloj debe traer ahora() y tras(ms)");
  const registros = new Map(), cola = [], esperas = new Set(); let activos = 0, bombeando = false;
  const avisar = () => { if (!cola.length && activos === 0) { for (const r of esperas) r(); esperas.clear(); } };
  const foto = (r) => ({ id: r.id, proyecto: r.proyecto, args: [...r.args], estado: r.estado, progreso: r.progreso, etapa: r.etapa, mensaje: r.mensaje, motivo: r.motivo, inicio: r.inicio, fin: r.fin, duracionMs: r.duracionMs });
  function terminar(r, resultado, error, vencido = false) {
    if (TERMINALES.has(r.estado)) return;
    r._plazo?.cancelar();
    r.fin = reloj.ahora();
    r.duracionMs = Math.max(0, r.fin - (r.inicio ?? r.fin));
    if (r._cancelado) r.estado = "cancelado";
    else if (vencido) { r.estado = "fallo"; r.motivo = `pasó del tiempo máximo (${maxSegundos} s)`; }
    else if (error) { r.estado = "fallo"; r.motivo = sinRutas(error?.message ?? error); }
    else if (codigoDe(resultado) === 0) { r.estado = "hecho"; r.progreso = 100; r.motivo = null; }
    else { r.estado = "fallo"; r.motivo = sinRutas(resultado?.motivo ?? resultado?.error ?? `la CLI terminó con código ${codigoDe(resultado)}`); }
    activos = Math.max(0, activos - 1); bombear();
  }
  function lanzar(r) {
    activos += 1; r.estado = "renderizando"; r.inicio = reloj.ahora();
    const control = new AbortController(); r._control = control;
    r._plazo = reloj.tras(maxSegundos * 1000);
    r._plazo.promesa.then(() => { r._vencido = true; control.abort(); terminar(r, null, null, true); });
    const alProgreso = (linea) => {
      if (TERMINALES.has(r.estado)) return; const p = leerProgreso(linea); if (!p) return;
      if (p.progreso !== undefined) r.progreso = Math.max(r.progreso, p.progreso);
      if (p.etapa) r.etapa = p.etapa; if (p.mensaje) r.mensaje = p.mensaje;
    };
    try {
      Promise.resolve(ejecutar([...r.args], { proyecto: r.proyecto, env: { ...ENV }, senal: control.signal, signal: control.signal, alProgreso, onProgress: alProgreso }))
        .then((res) => terminar(r, res), (e) => terminar(r, null, e));
    } catch (e) { terminar(r, null, e); }
  }
  function bombear() {
    if (bombeando) return;
    bombeando = true;
    try { while (activos < maxSimultaneos && cola.length) lanzar(registros.get(cola.shift())); }
    finally { bombeando = false; }
    avisar();
  }
  function encolar(trabajo) {
    const motivo = validarTrabajo(trabajo);
    if (motivo) return { ok: false, motivo };
    if (registros.has(trabajo.id)) return { ok: false, motivo: "ya existe un trabajo con ese id" };
    const r = { id: trabajo.id, proyecto: trabajo.proyecto, args: [...trabajo.args], estado: "en-cola", progreso: 0, etapa: null, mensaje: null, motivo: null, inicio: null, fin: null, duracionMs: null, _cancelado: false, _vencido: false, _control: null, _plazo: null };
    registros.set(r.id, r); cola.push(r.id); bombear();
    return { ok: true, id: r.id };
  }
  function estado(id) {
    const r = registros.get(String(typeof id === "string" ? id : id?.id)); return r ? foto(r) : null;
  }
  function cancelar(id) {
    const r = registros.get(String(typeof id === "string" ? id : id?.id));
    if (!r) return { ok: false, motivo: "no existe ese trabajo" };
    if (TERMINALES.has(r.estado)) return { ok: false, motivo: `el trabajo ya está ${r.estado}` };
    r._cancelado = true;
    if (r.estado === "en-cola") {
      const i = cola.indexOf(r.id); if (i >= 0) cola.splice(i, 1);
      r.fin = reloj.ahora(); r.duracionMs = 0; r.estado = "cancelado"; avisar();
    } else { r._control?.abort(); terminar(r); }
    return { ok: true, estado: "cancelado" };
  }
  return { encolar, estado, cancelar, listar: () => [...registros.values()].map(foto), esperarInactividad: () => (cola.length || activos ? new Promise((res) => esperas.add(res)) : Promise.resolve()) };
}
