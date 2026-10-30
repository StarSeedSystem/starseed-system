// Servicio «hyperframes» · cola de render (HFR1018G). Contrato: architecture/video-hyperframes.md §4.3.
// Módulo PURO: proceso y reloj inyectados; aquí no hay red, disco ni temporizadores propios. Los args son
// SIEMPRE una lista (nunca una cadena de shell) y solo pasan banderas de la lista blanca. La telemetría de
// HyperFrames va siempre apagada: HYPERFRAMES_NO_TELEMETRY=1 en todo trabajo.
import { fueraDelProyecto } from "./rutas.mjs";
export const ESTADOS = Object.freeze({ EN_COLA: "en-cola", RENDERIZANDO: "renderizando", HECHO: "hecho", FALLO: "fallo", CANCELADO: "cancelado" });
export const ENTORNO = Object.freeze({ HYPERFRAMES_NO_TELEMETRY: "1" });
const BANDERAS = new Set(["-o", "-f", "-q", "-w", "--format", "--variables", "--composition"]);
const CONTROL = /[\u0000-\u001f\u007f]/, ID = /^[A-Za-z0-9_-]{1,64}$/, MARCA = "@hf-progress";
const PROYECTO = /^[A-Za-z0-9.-]+(?:\/[A-Za-z0-9.-]+)*$/, SEGUNDOS_POR_DEFECTO = 900;
/** Motivo en español si los args no son una lista segura; `null` si valen. */
export function validarArgs(args) {
  if (!Array.isArray(args)) return "los args deben ser una lista, nunca una cadena de shell";
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (typeof arg !== "string" || !arg || CONTROL.test(arg)) return "argumento vacío o con caracteres de control";
    if (!arg.startsWith("-")) return "argumento sin bandera";
    const [nombre, ...resto] = arg.split("=");
    if (!BANDERAS.has(nombre)) return `bandera no permitida: ${nombre}`;
    if (nombre === "-q" && !resto.length) continue;
    const valor = resto.length ? resto.join("=") : args[i + 1];
    if (!resto.length) i += 1;
    if (typeof valor !== "string" || !valor || CONTROL.test(valor) || valor.startsWith("-")) return `la bandera ${nombre} necesita un valor`;
    if (fueraDelProyecto(valor)) return `valor con ruta fuera del proyecto: ${valor}`;
  }
  return null;
}

/** Progreso de una línea `@hf-progress {...}` de la CLI; `null` si falta o no es válido. */
export function progresoDeLinea(linea) {
  const marca = typeof linea === "string" ? linea.indexOf(MARCA) : -1;
  if (marca < 0) return null;
  let dato;
  try { dato = JSON.parse(linea.slice(marca + MARCA.length).trim()); } catch { return null; }
  if (!dato || typeof dato !== "object" || Array.isArray(dato)) return null;
  const { frame, total } = dato;
  return Number.isInteger(frame) && Number.isInteger(total) && frame >= 0 && total > 0 ? { frame, total } : null;
}

/** Crea la cola. `ejecutar(trabajo, { senal, alProgreso })` y `reloj.obtener()` se inyectan. */
export function crearCola({ ejecutar, reloj, maxSimultaneos = 1, maxSegundos = SEGUNDOS_POR_DEFECTO } = {}) {
  if (typeof ejecutar !== "function") throw new Error("falta el ejecutor de render");
  if (!reloj || typeof reloj.obtener !== "function") throw new Error("falta el reloj inyectado");
  const tope = Number.isInteger(maxSimultaneos) && maxSimultaneos > 0 ? maxSimultaneos : 1;
  const limite = Number.isFinite(maxSegundos) && maxSegundos > 0 ? maxSegundos : SEGUNDOS_POR_DEFECTO;
  const registros = new Map(), orden = [], activos = new Set();
  const ahora = () => reloj.obtener();
  const terminal = (r) => r.estado === ESTADOS.HECHO || r.estado === ESTADOS.FALLO || r.estado === ESTADOS.CANCELADO;
  const liquidar = (r, estado, resultado = null, motivo = null, error = null) => Object.assign(r, { estado, viviente: false, resultado, motivo, error });
  const liberar = (r) => { activos.delete(r.trabajo.id); queueMicrotask(arrancar); };
  const expirar = (r) => { if (r.estado !== ESTADOS.RENDERIZANDO || ahora() - r.inicio < limite * 1000) return;
    liquidar(r, ESTADOS.CANCELADO, null, "tiempo máximo"); r.control?.abort(); liberar(r); };
  const sinRutas = (texto) => String(texto ?? "").replace(/(^|[\s"'(])(?:[A-Za-z]:)?[\\/][^\s"'<>]*/g, (_m, pre) => `${pre}<ruta>`).slice(0, 300);
  function normalizar(bruto) {
    if (bruto == null) return { codigo: 0 }; if (typeof bruto === "number") return { codigo: bruto };
    if (typeof bruto !== "object") return { codigo: 1, error: "el render no devolvió un resultado" };
    const resultado = { codigo: Number.isInteger(bruto.codigo) ? bruto.codigo : 1 };
    if (typeof bruto.salida === "string") resultado.salida = sinRutas(bruto.salida);
    if (typeof bruto.error === "string") resultado.error = sinRutas(bruto.error);
    return resultado;
  }
  async function correr(r) {
    r.control = new AbortController(); r.inicio = ahora(); r.estado = ESTADOS.RENDERIZANDO;
    let bruto;
    try {
      bruto = await ejecutar(r.trabajo, { senal: r.control.signal, alProgreso: (linea) => {
        if (!r.viviente) return;
        const progreso = progresoDeLinea(linea);
        if (progreso) r.progreso = progreso;
        expirar(r);
      } });
    } catch { bruto = { codigo: 1, error: "el render se interrumpió" }; }
    if (!r.viviente) return;
    const resultado = normalizar(bruto);
    if (resultado.codigo === 0) liquidar(r, ESTADOS.HECHO, resultado);
    else liquidar(r, ESTADOS.FALLO, resultado, null, resultado.error ?? `el render falló (código ${resultado.codigo})`);
    liberar(r);
  }
  function arrancar() {
    while (activos.size < tope) {
      const id = orden.find((clave) => registros.get(clave).estado === ESTADOS.EN_COLA);
      if (id === undefined) return;
      activos.add(id); void correr(registros.get(id));
    }
  }
  return {
    encolar(entrada = {}) {
      const { id, proyecto, args } = entrada;
      if (typeof id !== "string" || !ID.test(id)) throw new Error("id de trabajo no válido");
      if (registros.has(id)) throw new Error(`id repetido en la cola: ${id}`);
      const limpio = typeof proyecto === "string" ? proyecto.trim() : "";
      if (!PROYECTO.test(limpio) || fueraDelProyecto(limpio) || limpio.split("/").some((p) => p === "." || p === ".."))
        throw new Error("el proyecto debe ser una carpeta relativa dentro del proyecto raíz");
      const malo = validarArgs(args);
      if (malo) throw new Error(malo);
      registros.set(id, { trabajo: { id, proyecto: limpio, args: [...args], env: { ...ENTORNO } },
        estado: ESTADOS.EN_COLA, progreso: null, resultado: null, error: null, motivo: null, control: null, viviente: true, inicio: 0 });
      orden.push(id); arrancar(); return id;
    },
    estado(id) {
      const r = registros.get(id);
      if (!r) return null;
      expirar(r);
      const cuerpo = { estado: r.estado, progreso: r.progreso };
      if (r.resultado) cuerpo.resultado = r.resultado; if (r.error) cuerpo.error = r.error; if (r.motivo) cuerpo.motivo = r.motivo;
      return cuerpo;
    },
    cancelar(id) {
      const r = registros.get(id);
      if (!r || terminal(r)) return false;
      const estaba = r.estado;
      liquidar(r, ESTADOS.CANCELADO, null, "cancelado");
      if (estaba === ESTADOS.RENDERIZANDO) { r.control?.abort(); liberar(r); }
      return true;
    },
    listar() {
      return orden.map((id) => { const r = registros.get(id); expirar(r); return { id, estado: r.estado, progreso: r.progreso }; });
    },
  };
}
