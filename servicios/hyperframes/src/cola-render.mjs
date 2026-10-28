// Servicio «hyperframes» · cola de render PURA (HFR1018G).
// Contrato: architecture/video-hyperframes.md §4.3. Sin red, disco ni procesos: `ejecutar` y `reloj`
// se inyectan. Todo proceso lleva HYPERFRAMES_NO_TELEMETRY=1. `args` es SIEMPRE lista (nunca una
// cadena de shell) y solo admite banderas de la lista blanca.

export const ESTADOS = Object.freeze({
  EN_COLA: "en-cola", RENDERIZANDO: "renderizando", HECHO: "hecho", FALLO: "fallo", CANCELADO: "cancelado",
});
export const FLAGS_PERMITIDOS = Object.freeze(["-o", "-f", "-q", "-w", "--format", "--variables", "--composition"]);
export const ENTORNO = Object.freeze({ HYPERFRAMES_NO_TELEMETRY: "1" });

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const TERMINALES = new Set([ESTADOS.HECHO, ESTADOS.FALLO, ESTADOS.CANCELADO]);

/** ¿El valor apunta al disco fuera del proyecto? (absoluta, de usuario, de Windows o con «..»). */
function fueraDelProyecto(v) {
  return v.startsWith("/") || v.startsWith("~") || v.startsWith("\\")
    || /^[A-Za-z]:[\\/]/.test(v) || v.split(/[\\/]+/).includes("..");
}

/** Valida `args`: lista de texto, banderas de la lista blanca y valores dentro del proyecto. */
export function validarArgs(args) {
  if (!Array.isArray(args)) return "args debe ser una lista, nunca una cadena de shell";
  if (args.length > 200) return "demasiados argumentos (máximo 200)";
  let esperaValor = false;
  for (const a of args) {
    if (typeof a !== "string" || a.length === 0) return "cada argumento debe ser texto no vacío";
    if (a.length > 2048) return "argumento demasiado largo";
    if (/[\u0000\r\n]/.test(a)) return "argumento con caracteres de control";
    if (a.startsWith("-")) {
      const bandera = a.startsWith("--") ? a.split("=")[0] : a;
      if (!FLAGS_PERMITIDOS.includes(bandera)) return `bandera no permitida: ${bandera.slice(0, 40)}`;
      esperaValor = !a.includes("=");
    } else if (!esperaValor) return "argumento sin bandera";
    else if (fueraDelProyecto(a)) return "argumento apunta fuera del proyecto";
    else esperaValor = false;
  }
  return null;
}

/** Lee una línea de la CLI («@hf-progress {…}») y devuelve su objeto, o null si no es progreso. */
export function progresoDeLinea(linea) {
  if (typeof linea !== "string") return null;
  const marca = linea.indexOf("@hf-progress");
  const resto = marca < 0 ? "" : linea.slice(marca + "@hf-progress".length).trim();
  if (!resto.startsWith("{")) return null;
  try {
    const datos = JSON.parse(resto);
    return datos && typeof datos === "object" && !Array.isArray(datos) ? datos : null;
  } catch { return null; }
}

/** Quita rutas absolutas de un mensaje antes de guardarlo o enseñarlo. */
function limpio(texto) {
  return String(texto ?? "").replace(/(?:[A-Za-z]:)?[\\/](?:Users|home|private|var|tmp|srv|opt)[^\s"'`]*/g, "<ruta>")
    .slice(0, 300);
}

/** Crea la cola; `ejecutar` y `reloj` se inyectan (sin red, disco, procesos ni reloj de pared).
 * @param {{ ejecutar: Function, reloj: { ahora: () => number, programar: (ms: number, fn: () => void) => () => void }, maxSimultaneos?: number, maxSegundos?: number }} [opciones]
 * @returns {{ encolar: Function, estado: Function, listar: Function, cancelar: Function }} */
export function crearCola({ ejecutar, reloj, maxSimultaneos = 1, maxSegundos = 900 } = {}) {
  if (typeof ejecutar !== "function" || typeof reloj?.programar !== "function") throw new TypeError("ejecutar y reloj son obligatorios");
  const tope = Math.max(1, Math.floor(maxSimultaneos)), segundos = Math.max(1, Number(maxSegundos) || 900);
  const trabajos = new Map(), oyentes = new Map();
  let enCurso = 0, secuencia = 0;
  const foto = (t) => ({ id: t.id, estado: t.estado, progreso: t.progreso, error: t.error, motivo: t.motivo,
    resultado: t.resultado, creado: t.creado, inicio: t.inicio, fin: t.fin });
  const avisar = (t) => { const o = oyentes.get(t.id); if (o) { oyentes.delete(t.id); o(foto(t)); } };
  const terminar = (t, estado, extra = {}) => {
    Object.assign(t, { estado, motivo: extra.motivo ?? null, error: extra.error ?? null,
      resultado: extra.resultado ?? null, fin: reloj.ahora() });
    avisar(t);
  };
  const cancelarPor = (t, motivo) => {
    if (!t || TERMINALES.has(t.estado)) return false;
    const activo = t.estado === ESTADOS.RENDERIZANDO;
    terminar(t, ESTADOS.CANCELADO, { motivo });
    if (activo) { if (t.pararReloj) t.pararReloj(); t.pararReloj = null; if (t.abortar) t.abortar(); }
    return true;
  };
  function bombear() {
    for (let t; enCurso < tope && (t = [...trabajos.values()].find((x) => x.estado === ESTADOS.EN_COLA));) lanzar(t);
  }
  function lanzar(t) {
    enCurso += 1; t.estado = ESTADOS.RENDERIZANDO; t.inicio = reloj.ahora();
    const control = new AbortController();
    t.abortar = () => control.abort();
    t.pararReloj = reloj.programar(segundos * 1000, () => cancelarPor(t, "tiempo máximo"));
    const alProgreso = (linea) => {
      if (TERMINALES.has(t.estado)) return;
      const avance = progresoDeLinea(linea) ?? (linea && typeof linea === "object" && !Array.isArray(linea) ? linea : null);
      if (avance) t.progreso = avance;
    };
    Promise.resolve()
      .then(() => ejecutar({ id: t.id, proyecto: t.proyecto, args: [...t.args], env: { ...ENTORNO } }, { alProgreso, senal: control.signal }))
      .then((res) => {
        if (t.estado === ESTADOS.CANCELADO) return;
        const codigo = typeof res === "number" ? res : Number(res?.codigo ?? 0);
        const salida = res && typeof res === "object" ? res.salida ?? null : null;
        if (codigo === 0) return terminar(t, ESTADOS.HECHO, { resultado: { codigo, salida } });
        terminar(t, ESTADOS.FALLO, { error: limpio(res?.error ?? `el render terminó con código ${codigo}`), resultado: { codigo, salida } });
      })
      .catch((e) => { if (t.estado !== ESTADOS.CANCELADO) terminar(t, ESTADOS.FALLO, { error: limpio(e?.message ?? e) }); })
      .finally(() => { if (t.pararReloj) t.pararReloj(); t.pararReloj = null; enCurso -= 1; bombear(); });
  }
  function encolar(trabajo = {}) {
    const id = trabajo.id ?? `hf-${reloj.ahora().toString(36)}-${++secuencia}`;
    if (typeof id !== "string" || !ID.test(id) || trabajos.has(id)) throw new Error("id no válido o repetido");
    if (typeof trabajo.proyecto !== "string" || !trabajo.proyecto || fueraDelProyecto(trabajo.proyecto)) throw new Error("proyecto no válido");
    const motivo = validarArgs(trabajo.args ?? []); if (motivo) throw new Error(motivo);
    trabajos.set(id, { id, proyecto: trabajo.proyecto, args: [...(trabajo.args ?? [])], estado: ESTADOS.EN_COLA,
      progreso: null, error: null, motivo: null, resultado: null, creado: reloj.ahora(), inicio: null, fin: null, abortar: null, pararReloj: null });
    bombear();
    return id;
  }
  return { encolar, estado: (id) => (trabajos.has(id) ? foto(trabajos.get(id)) : null),
    listar: () => [...trabajos.values()].map(foto), cancelar: (id) => cancelarPor(trabajos.get(id), "cancelado por la persona") };
}
