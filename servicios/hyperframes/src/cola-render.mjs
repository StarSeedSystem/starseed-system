// Servicio «hyperframes» · cola de render (HFR1018G). Contrato: architecture/video-hyperframes.md §3 y §6.
// Módulo PURO: «ejecutar» y «reloj» se inyectan (sin red, disco, procesos ni reloj propio); env con HYPERFRAMES_NO_TELEMETRY=1.
export const ESTADOS = { EN_COLA: "en_cola", RENDERIZANDO: "renderizando", HECHO: "hecho", FALLO: "fallo", CANCELADO: "cancelado" };
export const ENTORNO = Object.freeze({ HYPERFRAMES_NO_TELEMETRY: "1" });
const BANDERAS = new Set(["-o", "-f", "-q", "-w", "--format", "--variables", "--composition"]);
const CONTROL = /[\u0000-\u001F\u007F]/;
const RUTA_ABSOLUTA = /(?:[A-Za-z]:)?[\\/](?:Users|home|private|var|tmp|srv|opt)[^\s"'`]*/g;
const rutaFuera = (v) => v.startsWith("/") || v.startsWith("~") || v.includes("\\") || v.split("/").includes("..");

/** Los args solo se aceptan por lista: banderas de la lista blanca y valores dentro del proyecto. */
export function validarArgs(args) {
  if (!Array.isArray(args)) return "los args deben ser una lista de banderas, nunca una cadena de shell";
  let previa = false;
  for (const arg of args) {
    if (typeof arg !== "string" || CONTROL.test(arg)) return "argumento con caracteres de control";
    if (arg.startsWith("-")) {
      const nombre = arg.split("=", 1)[0]; if (!BANDERAS.has(nombre)) return `bandera no permitida: ${nombre}`;
      previa = true; continue;
    }
    if (!previa) return "argumento sin bandera";
    if (rutaFuera(arg)) return "bandera con ruta fuera del proyecto";
    previa = false;
  }
  return null;
}

/** Lee { frame, total } de una línea `@hf-progress {...}` que imprime la CLI; cualquier ruido es null. */
export function progresoDeLinea(linea) {
  const indice = String(linea ?? "").indexOf("@hf-progress");
  if (indice === -1) return null;
  let dato;
  try { dato = JSON.parse(String(linea).slice(indice + 13).trim()); } catch { return null; } // 13 = "@hf-progress"
  if (dato === null || typeof dato !== "object" || Array.isArray(dato)) return null;
  return typeof dato.frame === "number" && typeof dato.total === "number" ? { frame: dato.frame, total: dato.total } : null;
}

/** crearCola({ ejecutar, reloj, maxSimultaneos = 1, maxSegundos = 900 }): trabajos { id, proyecto, args }
 * copiados con env = {...ENTORNO}; «ejecutar» recibe (trabajo, { senal, alProgreso }); estados
 * en_cola/renderizando/hecho/fallo/cancelado; cancelación y tope de tiempo con el reloj inyectado. */
export function crearCola({ ejecutar, reloj, maxSimultaneos = 1, maxSegundos = 900 } = {}) {
  const trabajos = new Map(), orden = [], enCurso = new Set();
  const tiempo = reloj ?? { obtener: () => Date.now() };
  // Quita rutas absolutas de lo que salga de la CLI: los mensajes nunca llevan rutas de la neurona.
  const sinRutas = (texto) => String(texto ?? "").replace(RUTA_ABSOLUTA, "<ruta>").slice(0, 300);
  /** Estado final: el registro deja de estar viviente, se aborta su señal y se cede su hueco. */
  function liquidar(registro, estado, motivo) {
    registro.estado = estado; registro.viviente = false; registro.motivo = motivo ?? null;
    if (registro.control) { registro.control.abort(); registro.control = null; }
    enCurso.delete(registro.trabajo.id); lanzar();
  }
  function terminar(registro, bruto) {
    if (!registro.viviente) return; // cancelado mientras renderizaba: lo resuelto no cuenta
    const o = typeof bruto === "number" ? { codigo: bruto } : (bruto ?? {});
    const r = { codigo: typeof o.codigo === "number" ? o.codigo : 0 };
    if (typeof o.salida === "string") r.salida = sinRutas(o.salida);
    if (typeof o.error === "string") r.error = sinRutas(o.error);
    if (r.codigo === 0 && r.error === undefined) {
      registro.resultado = r; liquidar(registro, ESTADOS.HECHO);
    } else {
      registro.resultado = { codigo: r.codigo }; registro.error = sinRutas(r.error ?? "la CLI devolvió un código distinto de cero");
      liquidar(registro, ESTADOS.FALLO);
    }
  }
  async function correr(registro) {
    registro.inicio = tiempo.obtener(); registro.estado = ESTADOS.RENDERIZANDO;
    registro.control = new AbortController(); enCurso.add(registro.trabajo.id);
    const opciones = {
      senal: registro.control.signal,
      alProgreso: (linea) => { if (registro.viviente) { const p = progresoDeLinea(linea); if (p) registro.progreso = p; } },
    };
    try { terminar(registro, await ejecutar(registro.trabajo, opciones)); }
    catch (e) { terminar(registro, { codigo: 2, error: e && e.message ? e.message : String(e) }); }
  }
  /** Lanza lo siguiente mientras haya hueco según el tope de simultáneos. */
  function lanzar() {
    while (enCurso.size < Math.max(1, maxSimultaneos)) {
      const siguiente = orden.find((id) => trabajos.get(id)?.estado === ESTADOS.EN_COLA);
      if (!siguiente) return;
      void correr(trabajos.get(siguiente));
    }
  }
  /** Cancela los que pasaron el tope de tiempo; se comprueba al mirar estados. */
  function vencidos() {
    for (const id of [...enCurso]) {
      const registro = trabajos.get(id);
      if (tiempo.obtener() - registro.inicio >= maxSegundos * 1000) liquidar(registro, ESTADOS.CANCELADO, "tiempo máximo");
    }
  }
  function encolar(entrada) {
    if (trabajos.has(entrada.id)) throw new Error(`id repetido en la cola de render: ${entrada.id}`);
    if (typeof entrada.proyecto !== "string" || !entrada.proyecto.length || CONTROL.test(entrada.proyecto) || rutaFuera(entrada.proyecto)) {
      throw new Error("proyecto fuera del proyecto raíz");
    }
    const motivo = validarArgs(entrada.args); if (motivo) throw new Error(motivo);
    trabajos.set(entrada.id, {
      trabajo: { id: entrada.id, proyecto: entrada.proyecto, args: [...entrada.args], env: { ...ENTORNO } },
      estado: ESTADOS.EN_COLA, progreso: null, resultado: null, error: null, motivo: null,
      viviente: true, control: null, inicio: 0,
    });
    orden.push(entrada.id); lanzar(); return entrada.id;
  }
  /** Vista viva de un trabalho (null si no existe); de paso cancela los vencidos. */
  function estado(id) {
    if (!trabajos.has(id)) return null;
    vencidos();
    const registro = trabajos.get(id), dato = { estado: registro.estado };
    if (registro.progreso) dato.progreso = registro.progreso;
    if (registro.resultado) dato.resultado = registro.resultado;
    if (registro.error) dato.error = registro.error; if (registro.motivo) dato.motivo = registro.motivo;
    return dato;
  }
  /** Los trabajos por orden de llegada, con estado actual (y los vencidos, ya cancelados). */
  function listar() {
    vencidos();
    return orden.map((id) => {
      const { progreso, estado: de } = trabajos.get(id);
      return progreso ? { id, estado: de, progreso } : { id, estado: de };
    });
  }
  /** Cancela un trabajo vivo: en cola sin lanzarlo y en curso abortando su señal. */
  function cancelar(id) {
    const registro = trabajos.get(id);
    if (!registro || !registro.viviente) return false;
    liquidar(registro, ESTADOS.CANCELADO); return true;
  }
  return { encolar, estado, listar, cancelar };
}
