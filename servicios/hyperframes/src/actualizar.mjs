// Actualización segura de HyperFrames (HFR1018O). Módulo PURO: instalar, lint, render de prueba,
// huellas y enlace llegan INYECTADOS; aquí no hay `node:*`, red, disco ni reloj. Contrato:
// architecture/video-hyperframes.md §4.7 — la nueva versión se instala en carpeta aparte, se le pasa
// «lint», se hace un render de prueba de 3 fotogramas de la plantilla, se comparan sus huellas con
// las de referencia con tolerancia y solo entonces se cambia el enlace; si algo falla se queda la
// versión anterior y se devuelve el motivo. Nunca baja de versión sola y nada se ejecuta si la
// versión no es semver. Telemetría SIEMPRE apagada (§1): ver ENTORNO de cola-render.mjs.
/** ¿Es una versión semver («1.2.3», con pre «-rc.1» o compilación «+meta»)? */
export const esSemver = (version) => typeof version === "string"
  && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.]+)?$/.test(version);

/** [mayor, menor, parche] y lista de identificadores «pre» (sin la compilación). */
function partes(version) {
  const [nucleo, pre = ""] = version.split("+")[0].split("-");
  return { nums: nucleo.split(".").map(Number), pre: pre ? pre.split(".") : [] };
}

/** Orden de dos semver: -1 si a < b, 0 si iguales, 1 si a > b. Sin «pre» es mayor:
 * 1.2.3-rc.1 < 1.2.3, y entre «pre» gana el número sobre el texto. */
export function compararVersiones(a, b) {
  const A = partes(a), B = partes(b);
  for (let i = 0; i < 3; i++) {
    if (A.nums[i] !== B.nums[i]) return A.nums[i] < B.nums[i] ? -1 : 1;
  }
  if (A.pre.length !== B.pre.length) return B.pre.length ? 1 : -1;
  for (let i = 0; i < A.pre.length; i++) {
    const x = A.pre[i], y = B.pre[i];
    if (x === y) continue;
    const numero = (z) => /^\d+$/.test(z);
    if (numero(x) && numero(y)) return Number(x) < Number(y) ? -1 : 1;
    if (numero(x) !== numero(y)) return numero(x) ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/** Tolerancia al comparar huellas (0..255 por fotograma): el render es determinista, pero un
 * antialias mínimo o una fuente del sistema distinta no debe tumbar una actualización correcta. */
export const TOLERANCIA = 4;

/** ¿Concuerdan las huellas del render de prueba con las de referencia (misma longitud y
 * diferencia ≤ tolerancia en cada una)? */
export function huellasConcuerdan(referencia, nueva, tolerancia = TOLERANCIA) {
  if (!Array.isArray(referencia) || !Array.isArray(nueva)) return false;
  if (referencia.length !== nueva.length) return false;
  return referencia.every((valor, i) => Math.abs(Number(valor) - Number(nueva[i])) <= tolerancia);
}

/** Pasos de una aplicación, en orden. El cambio de enlace es el ÚLTIMO: si algo falla antes,
 * la carpeta nueva queda solo como ensayo y la versión anterior sigue viva y enlazada. */
export const PASOS = Object.freeze([
  "instalar", "lint", "render-prueba", "comparar-huellas", "cambiar-enlace",
]);

/** Plan de actualización de { actual, disponible }: viable solo si ambas son semver, son distintas
 * y no es rebajarse. Sin esa garantía devuelve { viable: false, motivo } y no se ejecuta nada. */
export function planActualizacion({ actual, disponible } = {}) {
  if (!esSemver(actual) || !esSemver(disponible)) {
    return { viable: false, motivo: "la versión no es semver" };
  }
  const orden = compararVersiones(disponible, actual);
  if (orden < 0) return { viable: false, motivo: "no se baja de versión sola" };
  if (orden === 0) return { viable: false, motivo: "misma versión, nada que actualizar" };
  return { viable: true, actual, disponible, pasos: [...PASOS] };
}

/* Dependencias que espera aplicar (todas inyectadas, nunca importadas):
 *   instalar(version)           → deja la nueva versión en carpeta aparte (lanza si falla).
 *   lint(version)               → null si pasa, o el motivo corto como cadena.
 *   renderPrueba(version)       → huella number[] de 3 fotogramas de la plantilla (lanza si falla).
 *   huellasReferencia()         → huella number[] guardada del render conocido bueno.
 *   cambiarEnlace(actual, nueva) → repunta el enlace de la neurona a la nueva versión.
 *   deshacerEnlace(version)     → vuelta atrás del enlace hacia la versión anterior (si hace falta). */
export async function aplicar(plan, deps) {
  if (!plan || !plan.viable) {
    return { ok: false, motivo: plan?.motivo ?? "plan no viable", pasos: [], version: null };
  }
  /* Doble verificación del plan: si la versión no es semver o es rebajarse, aquí no se ejecuta nada. */
  if (!esSemver(plan.actual) || !esSemver(plan.disponible)) {
    return { ok: false, motivo: "la versión no es semver: no se ejecuta nada", pasos: [], version: null };
  }
  if (compararVersiones(plan.disponible, plan.actual) < 0) {
    return { ok: false, motivo: "no se baja de versión sola", pasos: [], version: null };
  }
  const d = deps ?? {}, pasos = [];
  try {
    await d.instalar(plan.disponible); pasos.push("instalar");
    const motivoLint = await d.lint(plan.disponible);
    if (motivoLint) throw new Error(`lint con fallos: ${String(motivoLint)}`);
    pasos.push("lint");
    const huellas = await d.renderPrueba(plan.disponible);
    if (!Array.isArray(huellas) || huellas.length !== 3) throw new Error("la prueba no dio 3 fotogramas");
    pasos.push("render-prueba");
    if (!huellasConcuerdan(await d.huellasReferencia(), huellas)) {
      throw new Error("las huellas no concuerdan con las de referencia (tolerancia " + TOLERANCIA + ")");
    }
    pasos.push("comparar-huellas");
    await d.cambiarEnlace(plan.actual, plan.disponible);
    pasos.push("cambiar-enlace");
    return { ok: true, pasos, version: plan.disponible };
  } catch (error) {
    const bruto = error instanceof Error && error.message ? error.message : String(error);
    /* Vuelta atrás: si la neurona quedó a medias, el enlace vuelve a la versión anterior. */
    try { await d.deshacerEnlace?.(plan.actual); } catch { /* ya no se puede más; se avisa igual */ }
    return { ok: false, motivo: bruto.slice(0, 300), pasos, version: plan.actual };
  }
}
