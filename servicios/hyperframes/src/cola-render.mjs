// Servicio «hyperframes» · cola de render PURA (HFR1018G).
// Contrato: architecture/video-hyperframes.md §5·G. Sin red, disco, procesos ni reloj de pared aquí:
// `ejecutar` (lanza la CLI) y `reloj` ({ ahora() → ms }) se inyectan; los args son SIEMPRE una lista
// (nunca una cadena de shell) con las flags de la lista blanca. Estados: en-cola · renderizando · hecho · fallo · cancelado.
import { sinRutas } from "./rutas.mjs";

export const FLAGS_PERMITIDAS = new Set(["-o", "-f", "-q", "-w", "--format", "--variables", "--composition"]);
export const TOPE_EN_COLA = 100;
const PREFIJO_PROGRESO = "@hf-progress";
const CAMPOS_PROGRESO = new Set(["fase", "fotograma", "total", "segundo", "pct"]);
const MAX_ARGS = 64, LIMITE_PROYECTO = 8 * 1024 * 1024;

/** Comprueba la lista de argumentos y devuelve el motivo del rechazo, o null si valen. */
export function validarArgs(args) {
  if (!Array.isArray(args) || args.length === 0 || args.length > MAX_ARGS) return "args deben ser una lista";
  let valeValor = false; // un elemento sin «-» solo vale como valor del flag anterior
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (typeof a !== "string" || a.length === 0 || a.includes("\0") || a.includes("\n")) return `argumento ${i} no válido`;
    if (a.startsWith("-")) {
      const nombre = a.split("=")[0];
      if (!FLAGS_PERMITIDAS.has(nombre)) return `flag no permitida: ${nombre}`;
      valeValor = !a.includes("=");
    } else if (!valeValor) return `argumento ${i} suelto (debe ir tras una flag)`;
    else valeValor = false;
  }
  return null;
}

/** Lee una línea `@hf-progress {…}` de la CLI y devuelve el objeto saneado, o null si no es progreso. */
export function leerProgreso(linea) {
  const t = String(linea ?? "").trim();
  if (!t.startsWith(PREFIJO_PROGRESO)) return null;
  try {
    const d = JSON.parse(t.slice(PREFIJO_PROGRESO.length));
    if (!d || typeof d !== "object" || Array.isArray(d)) return null;
    const p = {};
    for (const [k, v] of Object.entries(d)) {
      if (CAMPOS_PROGRESO.has(k)) p[k] = typeof v === "number" && Number.isFinite(v) ? v : String(v).slice(0, 120);
    }
    return Object.keys(p).length ? p : null;
  } catch { return null; }
}

/** Cola de render con topes y cancelación. `maxSimultaneos` a la vez, `maxSegundos` por trabajo. */
export function crearCola({ ejecutar, reloj, maxSimultaneos = 1, maxSegundos = 900 } = {}) {
  if (typeof ejecutar !== "function") throw new Error("falta el ejecutor (ejecutar)");
  if (!reloj || typeof reloj.ahora !== "function") throw new Error("falta el reloj (reloj.ahora)");
  const simultaneos = Math.floor(Number(maxSimultaneos)), msMax = Math.floor(Number(maxSegundos) * 1000);
  if (!Number.isFinite(simultaneos) || simultaneos < 1) throw new Error("maxSimultaneos debe ser un entero ≥ 1");
  if (!Number.isFinite(msMax) || msMax < 1000) throw new Error("maxSegundos debe ser ≥ 1");
  const pendientes = []; // ids de trabajos sin empezar
  const activos = new Set(); // ids en ejecución
  const trabajos = new Map(); // id → estado interno
  let contador = 0;

  const vista = (j) => ({ id: j.id, estado: j.estado, progreso: j.progreso ?? null, creado: j.creado, empezado: j.empezado ?? null, terminado: j.terminado ?? null, error: j.error ?? null });
  const motivoDe = (error) => sinRutas(error && error.message ? error.message : String(error));

  const bombear = () => {
    while (activos.size < simultaneos && pendientes.length > 0) {
      const j = trabajos.get(pendientes.shift());
      if (j && j.estado === "en-cola") arrancar(j);
    }
  };

  const excedio = (j) => msMax > 0 && reloj.ahora() - j.empezado > msMax;

  const terminar = (j, error) => {
    if (!j.cancelada && excedio(j)) { j.cancelada = true; j.motivoCancel = "tiempo máximo superado"; }
    if (j.cancelada) { j.estado = "cancelado"; j.error = j.motivoCancel ?? "cancelada a petición"; }
    else { j.estado = error ? "fallo" : "hecho"; j.error = error ? motivoDe(error) : null; }
    j.terminado = reloj.ahora(); activos.delete(j.id); bombear();
  };

  const linea = (j, texto) => {
    const p = leerProgreso(texto); if (p) j.progreso = p;
    if (!j.cancelada && excedio(j)) { j.cancelada = true; j.motivoCancel = "tiempo máximo superado"; }
  };

  const arrancar = (j) => {
    j.estado = "renderizando";
    j.empezado = reloj.ahora();
    activos.add(j.id);
    const opciones = { entorno: { HYPERFRAMES_NO_TELEMETRY: "1" }, linea: (texto) => linea(j, texto), cancelado: () => j.cancelada || excedio(j) };
    Promise.resolve().then(() => ejecutar({ id: j.id, proyecto: j.proyecto, args: j.args }, opciones)).then(() => terminar(j, null), (e) => terminar(j, e));
  };

  const encolar = async ({ proyecto, args } = {}) => {
    if (typeof proyecto !== "string" || !proyecto.trim()) throw new Error("falta el proyecto (composición en HTML)");
    if (proyecto.length > LIMITE_PROYECTO) throw new Error("la composición pasa de 8 MB");
    const motivo = validarArgs(args);
    if (motivo) throw new Error(`args no válidos: ${motivo}`);
    if (pendientes.length + activos.size >= TOPE_EN_COLA) throw new Error("la cola está llena");
    const id = `hf-${(++contador).toString(36).padStart(4, "0")}`;
    trabajos.set(id, { id, proyecto, args: [...args], estado: "en-cola", creado: reloj.ahora() });
    pendientes.push(id); bombear(); return id;
  };

  const cancelar = async (id) => {
    const j = trabajos.get(String(id ?? ""));
    if (!j) return false;
    if (j.estado === "en-cola") {
      const i = pendientes.indexOf(j.id);
      if (i >= 0) pendientes.splice(i, 1);
      j.estado = "cancelado";
      j.error = "cancelada a petición";
      j.terminado = reloj.ahora();
      return true;
    }
    if (j.estado !== "renderizando") return false;
    j.cancelada = true; // el ejecutor la verá por `opciones.cancelado()` y terminará cuanto antes
    return true;
  };

  const estado = async (id) => { const j = trabajos.get(String(id ?? "")); return j ? vista(j) : null; };
  const listar = () => [...trabajos.values()].map(vista);

  return { encolar, estado, cancelar, listar };
}
