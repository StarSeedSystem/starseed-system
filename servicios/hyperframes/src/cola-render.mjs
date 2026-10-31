// Cola de render del servicio «hyperframes» (HFR1018G). Módulo PURO: ejecutor, reloj y topes
// inyectados; aquí no hay red, disco ni `node:*`. Contrato: architecture/video-hyperframes.md §4.
export const ESTADOS = Object.freeze({
  EN_COLA: "en-cola",
  RENDERIZANDO: "renderizando",
  HECHO: "hecho",
  FALLO: "fallo",
  CANCELADO: "cancelado",
});
/** El entorno de todo proceso hijo apaga la telemetría de HyperFrames (§1). */
export const ENTORNO = Object.freeze({ HYPERFRAMES_NO_TELEMETRY: "1" });
const BANDERAS = new Set(["-o", "-f", "-q", "-w", "--format", "--variables", "--composition"]);
const CONTROL = /[\u0000-\u001F\u007F]/;
const RUTA_ABSOLUTA = /(?:[A-Za-z]:)?[\\/][^\s"'<>]*/g;
/** ¿Apunta fuera del proyecto? (absoluta, de usuario, de Windows, con «..» o de control). */
const fuera = (v) => typeof v !== "string" || !v || CONTROL.test(v)
  || /^(?:[~\\/]|[A-Za-z]:[\\/])|(?:^|[\\/])\.\.(?:[\\/]|$)/.test(v);
/** Quita rutas absolutas de un mensaje: nunca salen del proyecto. */
export function sinRutas(texto) {
  return String(texto ?? "").replace(RUTA_ABSOLUTA, "<ruta>").slice(0, 300);
}
/** args SIEMPRE lista (nunca una cadena de shell): lista blanca de banderas y rutas del proyecto. */
export function validarArgs(args) {
  if (!Array.isArray(args)) return "los args deben ser una lista de banderas";
  let esperaValor = false;
  for (const arg of args) {
    if (typeof arg !== "string" || CONTROL.test(arg)) return "bandera con caracteres de control";
    if (!arg.startsWith("-")) {
      if (!esperaValor) return "argumento sin bandera";
      if (fuera(arg)) return `bandera con ruta fuera del proyecto: ${arg}`;
      esperaValor = false;
      continue;
    }
    const nombre = arg.split("=")[0];
    if (!BANDERAS.has(nombre)) return `bandera no permitida: ${nombre}`;
    esperaValor = !arg.includes("=");
  }
  return null;
}
/** Progreso de una línea `@hf-progress {...}` de la CLI; null para cualquier otra cosa. */
export function progresoDeLinea(linea) {
  const marca = "@hf-progress";
  const i = typeof linea === "string" ? linea.indexOf(marca) : -1;
  if (i === -1) return null;
  let dato;
  try { dato = JSON.parse(linea.slice(i + marca.length).trim()); } catch { return null; }
  const ok = dato && typeof dato === "object" && typeof dato.frame === "number" && typeof dato.total === "number";
  return ok ? { frame: dato.frame, total: dato.total } : null;
}

/** Crea la cola de render: { encolar, estado, cancelar, listar }. */
export function crearCola({ ejecutar, reloj, maxSimultaneos = 1, maxSegundos = 900 } = {}) {
  const registros = new Map(), orden = [], vivos = new Set();
  const tope = Math.max(1, Math.floor(maxSimultaneos) || 1);
  const fijar = (r, estado, resultado = null, motivo = null) => {
    Object.assign(r, { estado, resultado, motivo, viviente: false }); vivos.delete(r.trabajo.id);
  };
  const lanzar = () => {
    for (const id of orden) {
      if (vivos.size >= tope) return;
      const r = registros.get(id);
      if (!r || r.estado !== ESTADOS.EN_COLA) continue;
      vivos.add(id); void correr(r);
    }
  };
  const vencer = () => {
    const ahora = reloj.obtener();
    for (const id of [...vivos]) {
      const r = registros.get(id);
      if (r && r.viviente && ahora - r.inicio >= maxSegundos * 1000) {
        fijar(r, ESTADOS.CANCELADO, null, "tiempo máximo"); r.control?.abort();
      }
    }
    lanzar();
  };
  async function correr(r) {
    Object.assign(r, { estado: ESTADOS.RENDERIZANDO, inicio: reloj.obtener(), control: new AbortController() });
    const opciones = { senal: r.control.signal, alProgreso: (l) => {
      const p = progresoDeLinea(l); if (p && r.viviente) r.progreso = p;
    } };
    let bruto;
    try { bruto = await ejecutar({ ...r.trabajo, args: [...r.trabajo.args], env: { ...ENTORNO } }, opciones); }
    catch { bruto = { codigo: 1 }; }
    if (!r.viviente) return;
    const o = bruto && typeof bruto === "object" ? bruto : { codigo: bruto };
    const resultado = { codigo: typeof o.codigo === "number" ? o.codigo : 0 };
    if (typeof o.salida === "string") resultado.salida = sinRutas(o.salida);
    if (typeof o.error === "string") resultado.error = sinRutas(o.error);
    if (resultado.codigo !== 0) r.error = resultado.error ?? "el render falló";
    fijar(r, resultado.codigo === 0 ? ESTADOS.HECHO : ESTADOS.FALLO, resultado);
    lanzar();
  }
  return {
    encolar({ id, proyecto, args }) {
      if (registros.has(id)) throw new Error(`id repetido en la cola: ${id}`);
      if (fuera(proyecto)) throw new Error("proyecto fuera del proyecto raíz");
      const motivo = validarArgs(args); if (motivo) throw new Error(motivo);
      registros.set(id, { trabajo: { id, proyecto, args: [...args], env: { ...ENTORNO } }, estado: ESTADOS.EN_COLA,
        progreso: null, resultado: null, error: null, motivo: null, control: null, inicio: 0, viviente: true });
      orden.push(id); lanzar();
      return id;
    },
    estado(id) {
      vencer();
      const r = registros.get(id); if (!r) return null;
      const s = { estado: r.estado };
      for (const k of ["progreso", "resultado", "error", "motivo"]) if (r[k]) s[k] = r[k];
      return s;
    },
    cancelar(id) {
      const r = registros.get(id); if (!r || !r.viviente) return false;
      fijar(r, ESTADOS.CANCELADO); r.control?.abort(); lanzar();
      return true;
    },
    listar() {
      vencer();
      return orden.map((id) => { const r = registros.get(id); return { id, estado: r.estado, progreso: r.progreso }; });
    },
  };
}
