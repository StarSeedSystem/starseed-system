/**
 * scripts/verificar-neurona.lib.mjs (Ola 260 · 2026-09-06)
 * ─────────────────────────────────────────────────────────────────────────────
 * Funciones PURAS de la batería analítica de verificación de la neurona. Vive
 * aparte del runner para poder probarse sin red ni sistema (ver
 * `src/lib/__tests__/verificar-neurona.test.ts`) y para respetar la regla del
 * área: ESM puro, sin dependencias, todo exportado y testeable.
 *
 * Seguridad: ninguna de estas funciones toca el disco ni la red; solo reciben
 * medidas ya tomadas por el runner y las clasifican. Jamás manejan claves ni
 * rutas absolutas de la casa del usuario.
 */

// ────────────────────────────────────────────────────────────────────────────
// Semántica de los estados: «ok» suma 1, «aviso» suma 0,5 y «fallo» suma 0 en
// la puntuación; el «motivo» es texto en español para leer en el informe.
// ────────────────────────────────────────────────────────────────────────────

/** Una sola evaluación de umbral: qué clave se midió, su valor y cómo fue. */
export const ESTADO_OK = "ok";
export const ESTADO_AVISO = "aviso";
export const ESTADO_FALLO = "fallo";

/**
 * Evalúa las medidas contra los umbrales y devuelve una lista de resultados.
 *
 * @param {Record<string, unknown>} medidas — mapa clave → valor medido
 *   (números, booleanos, strings o null). El runner ya extrajo lo relevante
 *   de cada endpoint y lo aplana aquí con claves estables.
 * @param {Record<string, unknown>} umbrales — mapa clave → umbral. Cada
 *   umbral puede ser un número (comparación «mayor o igual»/«menor o igual»
 *   según la regla de la clave) o un objeto `{ aviso, fallo }` para rangos
 *   de dos pasos.
 * @returns {Array<{ clave: string; valor: unknown; estado: "ok"|"aviso"|"fallo"; motivo: string }>}
 */
export function evaluarUmbrales(medidas, umbrales) {
  const resultados = [];

  // Reglas fijas por clave: qué significa «bien» según la magnitud. Cada
  // regla sabe si queremos el valor ALTO (≥ umbral = ok) o BAJO (≤ umbral =
  // ok), y qué texto de motivo acompañar en cada estado.
  const reglas = {
    // Duración de una petición HTTP (ms): cuanto menos, mejor.
    duracionMs: { tipo: "bajo", etiqueta: "ms", lugar: "latencia" },
    // Raíz HTTP: estado esperado (200/307…).
    estadoRaiz: { tipo: "igual", etiqueta: "", lugar: "estado" },
    // Memoria libre+inactiva (MB): cuanto más, mejor. Dos pasos: aviso y fallo.
    memoriaLibreMb: { tipo: "alto", etiqueta: "MB", lugar: "memoria" },
    // Swap usado (MB): cuanto menos, mejor.
    swapUsadoMb: { tipo: "bajo", etiqueta: "MB", lugar: "swap" },
    // RTF de síntesis/transcripción: segundos de cómputo por segundo de audio.
    rtfVoz: { tipo: "bajo", etiqueta: "RTF", lugar: "síntesis" },
    rtfOido: { tipo: "bajo", etiqueta: "RTF", lugar: "oído" },
    // Similitud de transcripción (0..1): cuanto más, mejor.
    similitud: { tipo: "alto", etiqueta: "", lugar: "oído" },
    // Subagente BitNet: nº de respuestas exitosas y latencia en segundos.
    nExitosos: { tipo: "alto", etiqueta: "", lugar: "subagente" },
    bitnetLatenciaS: { tipo: "bajo", etiqueta: "s", lugar: "subagente" },
    // Diferencia de crashes antes/después: debe ser 0 (sin aumento).
    crashesDelta: { tipo: "igual", etiqueta: "", lugar: "crashes" },
    // Audio sintetizado: segundos de audio válidos (RIFF, ≥ 1 s).
    segundosAudio: { tipo: "alto", etiqueta: "s", lugar: "síntesis" },
    // Texto transcrito no vacío: dejamos que el runner lo codifique como 1/0.
    textoNoVacio: { tipo: "igual", etiqueta: "", lugar: "oído" },
  };

  for (const [clave, valorMedido] of Object.entries(medidas)) {
    const regla = reglas[clave];
    if (!regla) continue;

    const umbral = umbrales[clave];
    // Sin umbral para esta clave no se puede clasificar: se salta.
    if (umbral === undefined) continue;

    const resultado = clasificar(clave, valorMedido, umbral, regla);
    resultados.push(resultado);
  }

  return resultados;
}

/**
 * Clasifica un solo valor. Maneja las tres medidas de umbral posibles:
 * un número plano (una sola frontera), o `{ aviso, fallo }` (dos pasos).
 */
function clasificar(clave, valor, umbral, regla) {
  const { tipo, etiqueta, lugar } = regla;
  const valorTxt = textoDe(valor);

  // Umbral en dos pasos: aviso más permisivo, fallo más estricto.
  if (typeof umbral === "object" && umbral !== null && ("aviso" in umbral || "fallo" in umbral)) {
    const aviso = umbral.aviso;
    const fallo = umbral.fallo;
    if (supera(valor, fallo, tipo)) return falloResultado(clave, valor, valorTxt, etiqueta, lugar, "fallo");
    if (supera(valor, aviso, tipo)) return falloResultado(clave, valor, valorTxt, etiqueta, lugar, "aviso");
    return okResultado(clave, valor, valorTxt, etiqueta, lugar);
  }

  // Umbral plano: una sola frontera.
  if (supera(valor, umbral, tipo)) return falloResultado(clave, valor, valorTxt, etiqueta, lugar, "fallo");
  return okResultado(clave, valor, valorTxt, etiqueta, lugar);
}

/**
 * ¿El valor cruza la frontera en el sentido que marca la regla?
 *  · alto  → cruza cuando valor < umbral (queremos alto, está bajo).
 *  · bajo  → cruza cuando valor > umbral (queremos bajo, está alto).
 *  · igual → cruza cuando valor !== umbral.
 * Los `null`/`undefined` cuentan como cruce (no se pudo medir = fallo).
 */
function supera(valor, umbral, tipo) {
  if (valor === null || valor === undefined) return true;
  if (tipo === "igual") return valor !== umbral;
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n)) return true;
  const u = typeof umbral === "number" ? umbral : Number(umbral);
  if (!Number.isFinite(u)) return true;
  return tipo === "alto" ? n < u : n > u;
}

function okResultado(clave, valor, valorTxt, etiqueta, lugar) {
  return { clave, valor, estado: ESTADO_OK, motivo: `${clave} ${valorTxt}${etiqueta ? ` ${etiqueta}` : ""} (${lugar} en orden)` };
}

function falloResultado(clave, valor, valorTxt, etiqueta, lugar, estado) {
  const qu = estado === "fallo" ? "falló" : "en aviso";
  return { clave, valor, estado, motivo: `${clave} ${valorTxt}${etiqueta ? ` ${etiqueta}` : ""} ${qu} (${lugar})` };
}

/** Texto legible de un valor: números redondeados, booleanos como sí/no. */
function textoDe(v) {
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (v === null || v === undefined) return "—";
  return String(v);
}

/**
 * Compara la corrida actual con la anterior y devuelve regresiones y mejoras.
 *
 * Reglas de regresión (algo empeoró respecto a la corrida previa):
 *  · `rtfVoz` / `rtfOido` peor en más del 30 %.
 *  · `memoriaLibreMb` menor que el 60 % de la anterior.
 *  · `crashes24h` mayor que el valor anterior.
 *  · Cualquier check que pasó de «ok» a «fallo».
 *
 * Las mejoras son los movimientos contrarios, para glorificar lo que fue bien.
 *
 * @param {Record<string, unknown>} actual — medidas de esta corrida.
 * @param {Record<string, unknown>} anterior — medidas de la corrida previa.
 * @returns {{ regresiones: Array<{clave:string; antes:unknown; ahora:unknown; motivo:string}>, mejoras: Array<{clave:string; antes:unknown; ahora:unknown; motivo:string}> }}
 */
export function compararConAnterior(actual, anterior) {
  const regresiones = [];
  const mejoras = [];

  // RTF: un valor más alto significa cómputo más lento por segundo de audio.
  for (const clave of ["rtfVoz", "rtfOido"]) {
    const a = num(anterior[clave]);
    const b = num(actual[clave]);
    if (a !== null && b !== null && a > 0) {
      const cambio = (b - a) / a;
      if (cambio > 0.3) {
        regresiones.push({ clave, antes: redondear(a), ahora: redondear(b), motivo: `${clave} empeoró ${Math.round(cambio * 100)} % respecto a la corrida anterior` });
      } else if (cambio < -0.3) {
        mejoras.push({ clave, antes: redondear(a), ahora: redondear(b), motivo: `${clave} mejoró ${Math.round(-cambio * 100)} %` });
      }
    }
  }

  // Memoria libre: por debajo del 60 % de la anterior hay regresión.
  {
    const a = num(anterior.memoriaLibreMb);
    const b = num(actual.memoriaLibreMb);
    if (a !== null && b !== null) {
      if (b < a * 0.6) {
        regresiones.push({ clave: "memoriaLibreMb", antes: redondear(a), ahora: redondear(b), motivo: `memoria libre bajó a ${Math.round((b / a) * 100)} % de la corrida anterior` });
      } else if (b > a * 1.4) {
        mejoras.push({ clave: "memoriaLibreMb", antes: redondear(a), ahora: redondear(b), motivo: "memoria libre subió respecto a la anterior" });
      }
    }
  }

  // Crashes del llama-server en 24 h: cualquier aumento es regresión.
  {
    const a = num(anterior.crashes24h);
    const b = num(actual.crashes24h);
    if (a !== null && b !== null) {
      if (b > a) {
        regresiones.push({ clave: "crashes24h", antes: a, ahora: b, motivo: `los crashes pasaron de ${a} a ${b} en 24 h` });
      } else if (b < a) {
        mejoras.push({ clave: "crashes24h", antes: a, ahora: b, motivo: `los crashes bajaron de ${a} a ${b}` });
      }
    }
  }

  return { regresiones, mejoras };
}

/** Número finito del campo, o null si no lo es. */
function num(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Redondea a dos decimales solo cuando tiene parte fraccionaria. */
function redondear(n) {
  return Number.isInteger(n) ? n : Math.round(n * 100) / 100;
}

/**
 * Distancia de Levenshtein clásica (O(n·m), con dos filas para no gastar
 * memoria). Se normaliza a 0..1 y se complementa: la similitud es mayor
 * cuanto más parecidas son las frases. Se compara sobre minúsculas y sin
 * tildes para no castigar acentos ni mayúsculas.
 *
 * @param {string} a — texto transcrito.
 * @param {string} b — texto esperado.
 * @returns {number} similitud 0..1 (1 = idénticas).
 */
export function similitudNormalizada(a, b) {
  const sa = normalizar(a);
  const sb = normalizar(b);
  if (sa.length === 0 && sb.length === 0) return 1;
  const max = Math.max(sa.length, sb.length);
  if (max === 0) return 0;
  return 1 - distanciaLevenshtein(sa, sb) / max;
}

/** Minúsculas y sin tildes (�...→vocales planas), sin espacios extremos. */
function normalizar(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Distancia de Levenshtein con dos filas (memoria O(min(n,m))). */
export function distanciaLevenshtein(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // `a` como la más corta para usar dos filas del tamaño de b.
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const coste = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + coste);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Convierte un informe completo en una tabla Markdown legible.
 *
 * @param {object} informe — informe con `{ fecha, base, checks, resumen }`.
 *   `checks` es la lista de `{ clave, valor, estado, motivo }`.
 * @returns {string} tabla Markdown (una fila por check + líneas de resumen).
 */
export function resumenMarkdown(informe) {
  const lineas = [];
  const separa = (s) => String(s ?? "").replace(/\|/g, "\\|");

  if (informe.fecha) lineas.push(`## Verificación de la neurona — ${informe.fecha}`);
  if (informe.base) lineas.push(`- **Base:** \`${separa(informe.base)}\``);
  lineas.push("");
  lineas.push("| Check | Valor | Estado |");
  lineas.push("|---|---|---|");

  const checks = Array.isArray(informe.checks) ? informe.checks : [];
  const icono = { ok: "✅", aviso: "⚠️", fallo: "❌" };
  for (const c of checks) {
    const valor = typeof c.valor === "boolean" ? (c.valor ? "sí" : "no") : (c.valor ?? "—");
    lineas.push(`| ${separa(c.clave)} | ${separa(String(valor))} | ${icono[c.estado] ?? ""} ${c.estado} |`);
  }

  if (informe.resumen) {
    lineas.push("");
    const r = informe.resumen;
    lineas.push(`- **Puntuación:** ${r.puntuacion ?? "—"}/100`);
    if (r.fallos !== undefined) lineas.push(`- **Fallos:** ${r.fallos} · **Avisos:** ${r.avisos} · **Ok:** ${r.ok}`);
    if (Array.isArray(r.regresiones) && r.regresiones.length) {
      lineas.push(`- **Regresiones:** ${r.regresiones.length}`);
      for (const reg of r.regresiones) lineas.push(`  - ${separa(reg.motivo ?? reg.clave ?? "")}`);
    }
  }

  return lineas.join("\n");
}

/**
 * Puntuación 0-100 del informe: cada check vale 1 (ok), 0,5 (aviso) o 0
 * (fallo), ponderado por igual; las regresiones restan 5 puntos cada una
 * (sin bajar de 0).
 */
export function puntuacion(informe) {
  const checks = Array.isArray(informe.checks) ? informe.checks : [];
  if (checks.length === 0) return { total: 0, ok: 0, aviso: 0, fallo: 0, valor: 0 };

  let ok = 0;
  let aviso = 0;
  let fallo = 0;
  let suma = 0;
  for (const c of checks) {
    if (c.estado === ESTADO_OK) {
      ok += 1;
      suma += 1;
    } else if (c.estado === ESTADO_AVISO) {
      aviso += 1;
      suma += 0.5;
    } else {
      fallo += 1;
    }
  }

  let valor = Math.round((suma / checks.length) * 100);

  // Cada regresión detectada resta 5 puntos (piso en 0).
  const regresiones = informe?.resumen?.regresiones ?? informe?.regresiones;
  if (Array.isArray(regresiones)) {
    valor = Math.max(0, valor - regresiones.length * 5);
  }

  return { total: checks.length, ok, aviso, fallo, valor };
}