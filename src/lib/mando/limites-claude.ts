<<<<<<< HEAD
/**
 * LÍMITES DEL PLAN DE CLAUDE (Ola 1004L · LC1004Bc) — módulo PURO
 * ─────────────────────────────────────────────────────────────────────────────
 * Resume lo que queda de las ventanas de uso del plan de Claude (sesión de
 * ~5 h y semanal, más la semanal de un modelo concreto si claude.ai la enseña),
 * leídas a mano desde claude.ai → Ajustes → Uso y guardadas con
 * `scripts/puente/limites_claude.py declarar …` en `~/.starseed/limites-claude.json`.
 * Sin `node:*` y sin `Date.now()`: el instante actual entra como `ahora` (ms).
 */

export const ENLACE_USO_CLAUDE = "https://claude.ai/settings/usage";

export interface LecturaLimites {
    t: string;
    sesion_pct: number;
    sesion_reinicio: string;
    semana_pct: number;
    semana_reinicio: string;
    modelo_nombre: string | null;
    modelo_pct: number | null;
    modelo_reinicio: string | null;
    fuente: string;
}

export interface ProgramadaClaude {
    nombre: string;
    proxima: string;
    cada_min: number | null;
}

/** Forma del archivo `~/.starseed/limites-claude.json`. */
export interface ConfigLimitesClaude {
    lecturas: LecturaLimites[];
    programadas: { t: string; lista: ProgramadaClaude[] };
    umbral_pct: number;
}

export type TonoLimites = "ok" | "aviso" | "peligro";

export interface VentanaClaude {
    pct: number;
    queda: number;
    reinicio: string;
    minutosParaReinicio: number;
    coste: number | null;
    proyeccion: number | null;
    reiniciada: boolean;
    tono: TonoLimites;
}

export interface EstadoLimitesClaude {
    sesion: VentanaClaude | null;
    semana: VentanaClaude | null;
    modelo: VentanaClaude | null;
    modeloNombre: string | null;
    lecturaEn: string | null;
    lecturaHaceMin: number | null;
    desactualizada: boolean;
    programadasEnSesion: number;
    programadasEnSemana: number;
    recomendacion: string | null;
    tono: TonoLimites;
}

export type CampoVentana = "sesion" | "semana" | "modelo";

type ClavePct = "sesion_pct" | "semana_pct" | "modelo_pct";
type ClaveReinicio = "sesion_reinicio" | "semana_reinicio" | "modelo_reinicio";

const CLAVES: Record<CampoVentana, { pct: ClavePct; reinicio: ClaveReinicio }> = {
    sesion: { pct: "sesion_pct", reinicio: "sesion_reinicio" },
    semana: { pct: "semana_pct", reinicio: "semana_reinicio" },
    modelo: { pct: "modelo_pct", reinicio: "modelo_reinicio" },
};

function esObjeto(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}
function numero(v: unknown): number | null {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function texto(v: unknown): string | null {
    return typeof v === "string" && v.length > 0 ? v : null;
}
function msDe(iso: string): number | null {
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : null;
}
function mediana(xs: number[]): number | null {
    if (xs.length === 0) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Lectura saneada o null si le falta algo imprescindible. */
function leerLectura(v: unknown): LecturaLimites | null {
    if (!esObjeto(v)) return null;
    const t = texto(v.t);
    const sr = texto(v.sesion_reinicio);
    const wr = texto(v.semana_reinicio);
    const sp = numero(v.sesion_pct);
    const wp = numero(v.semana_pct);
    if (!t || !sr || !wr || sp === null || wp === null) return null;
    return {
        t, sesion_pct: sp, sesion_reinicio: sr, semana_pct: wp, semana_reinicio: wr,
        modelo_nombre: texto(v.modelo_nombre),
        modelo_pct: numero(v.modelo_pct),
        modelo_reinicio: texto(v.modelo_reinicio),
        fuente: texto(v.fuente) ?? "desconocida",
    };
}

function leerProgramada(v: unknown): ProgramadaClaude | null {
    if (!esObjeto(v)) return null;
    const nombre = texto(v.nombre);
    const proxima = texto(v.proxima);
    if (!nombre || !proxima) return null;
    return { nombre, proxima, cada_min: numero(v.cada_min) };
}

/**
 * Coste por revisión: mediana de los aumentos positivos de `*_pct` entre
 * lecturas CONSECUTIVAS de la misma ventana (mismo `*_reinicio`).
 * Null si no hay dos lecturas así.
 */
export function costePorRevision(lecturas: LecturaLimites[], campo: CampoVentana): number | null {
    const k = CLAVES[campo];
    const deltas: number[] = [];
    for (let i = 1; i < lecturas.length; i++) {
        const a = lecturas[i - 1];
        const b = lecturas[i];
        if (a[k.reinicio] === null || a[k.reinicio] !== b[k.reinicio]) continue;
        const pa = a[k.pct];
        const pb = b[k.pct];
        if (pa === null || pb === null) continue;
        const d = pb - pa;
        if (d > 0) deltas.push(d);
    }
    return mediana(deltas);
}

/**
 * Disparos de tareas programadas antes de `hasta` (ms): 1 por cada
 * `proxima` ∈ (ahora, hasta], más floor((hasta − proxima)/cada_min) cuando
 * `cada_min` > 0.
 */
export function disparosAntes(lista: ProgramadaClaude[], ahora: number, hasta: number): number {
    let n = 0;
    if (hasta <= ahora) return n;
    for (const p of lista) {
        const px = msDe(p.proxima);
        if (px === null || px <= ahora || px > hasta) continue;
        n += 1;
        if (typeof p.cada_min === "number" && p.cada_min > 0) {
            n += Math.floor((hasta - px) / (p.cada_min * 60000));
        }
    }
    return n;
}

function tonoVentana(pct: number, proyeccion: number | null, umbral: number): TonoLimites {
    if (pct >= umbral || (proyeccion !== null && proyeccion > 100)) return "peligro";
    if (pct >= 60 || (proyeccion !== null && proyeccion >= umbral)) return "aviso";
    return "ok";
}

function construirVentana(
    pct: number,
    reinicioIso: string,
    ahora: number,
    umbral: number,
    coste: number | null,
    disparos: number,
): VentanaClaude {
    const rMs = msDe(reinicioIso);
    const reiniciada = rMs !== null && rMs <= ahora;
    const efec = reiniciada ? 0 : pct;
    const proyeccion = coste === null ? null : efec + disparos * coste;
    return {
        pct: efec,
        queda: Math.max(0, 100 - efec),
        reinicio: reinicioIso,
        minutosParaReinicio: rMs === null ? 0 : Math.max(0, Math.round((rMs - ahora) / 60000)),
        coste,
        proyeccion,
        reiniciada,
        tono: tonoVentana(efec, proyeccion, umbral),
    };
}

function peorTono(tonos: TonoLimites[]): TonoLimites {
    if (tonos.includes("peligro")) return "peligro";
    if (tonos.includes("aviso")) return "aviso";
    return "ok";
}

const SIN_LECTURA = "Sin lectura todavía: la dirección la toma en su próxima revisión";

/** Estado completo; `cfg` es el JSON crudo del archivo y `ahora` va en ms. */
export function estadoLimitesClaude(cfg: unknown, ahora: number): EstadoLimitesClaude {
    const vacio: EstadoLimitesClaude = {
        sesion: null, semana: null, modelo: null, modeloNombre: null,
        lecturaEn: null, lecturaHaceMin: null, desactualizada: false,
        programadasEnSesion: 0, programadasEnSemana: 0,
        recomendacion: SIN_LECTURA, tono: "aviso",
    };
    if (!esObjeto(cfg)) return vacio;
    const lecturasRaw = Array.isArray(cfg.lecturas) ? cfg.lecturas : [];
    const lecturas = lecturasRaw
        .map(leerLectura)
        .filter((l): l is LecturaLimites => l !== null);
    if (lecturas.length === 0) return vacio;

    const ultima = lecturas[lecturas.length - 1];
    const umbral = numero(cfg.umbral_pct) ?? 90;
    const prog = esObjeto(cfg.programadas) && Array.isArray(cfg.programadas.lista)
        ? cfg.programadas.lista.map(leerProgramada).filter((p): p is ProgramadaClaude => p !== null)
        : [];

    const tMs = msDe(ultima.t);
    const lecturaHaceMin = tMs === null ? null : Math.round((ahora - tMs) / 60000);
    const desactualizada = lecturaHaceMin !== null && lecturaHaceMin > 120;

    const rSesionMs = msDe(ultima.sesion_reinicio);
    const rSemanaMs = msDe(ultima.semana_reinicio);
    const dispSesion = rSesionMs === null ? 0 : disparosAntes(prog, ahora, rSesionMs);
    const dispSemana = rSemanaMs === null ? 0 : disparosAntes(prog, ahora, rSemanaMs);

    const sesion = construirVentana(
        ultima.sesion_pct, ultima.sesion_reinicio, ahora, umbral,
        costePorRevision(lecturas, "sesion"), dispSesion,
    );
    const semana = construirVentana(
        ultima.semana_pct, ultima.semana_reinicio, ahora, umbral,
        costePorRevision(lecturas, "semana"), dispSemana,
    );
    let modelo: VentanaClaude | null = null;
    if (ultima.modelo_nombre !== null && ultima.modelo_pct !== null && ultima.modelo_reinicio !== null) {
        const rModeloMs = msDe(ultima.modelo_reinicio);
        const dispModelo = rModeloMs === null ? 0 : disparosAntes(prog, ahora, rModeloMs);
        modelo = construirVentana(
            ultima.modelo_pct, ultima.modelo_reinicio, ahora, umbral,
            costePorRevision(lecturas, "modelo"), dispModelo,
        );
    }

    let recomendacion: string | null = null;
    const candidatas: Array<[string, VentanaClaude]> = [["sesión", sesion], ["semana", semana]];
    for (const [nombre, v] of candidatas) {
        if (v.proyeccion !== null && v.proyeccion > umbral && v.coste !== null && v.coste > 0) {
            const n = Math.max(0, Math.floor((umbral - v.pct) / v.coste));
            recomendacion = `Espacia las revisiones: caben ${n} hasta el reinicio de ${nombre}`;
            break;
        }
    }

    let tono = peorTono([sesion.tono, semana.tono, ...(modelo ? [modelo.tono] : [])]);
    if (desactualizada && tono === "ok") tono = "aviso";

    return {
        sesion, semana, modelo,
        modeloNombre: ultima.modelo_nombre,
        lecturaEn: ultima.t,
        lecturaHaceMin,
        desactualizada,
        programadasEnSesion: dispSesion,
        programadasEnSemana: dispSemana,
        recomendacion,
        tono,
    };
}

function fmtDuracion(minutos: number): string {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    if (h > 0) return `${h} h ${m} min`;
    return `${m} min`;
}

/** «sesión 34 % · semana 61 % · reinicia en 2 h 10 min · proyección 72 %» o «sin lectura». */
export function resumenLimitesClaude(e: EstadoLimitesClaude): string {
    if (!e.sesion && !e.semana) return "sin lectura";
    const partes: string[] = [];
    if (e.sesion) partes.push(`sesión ${Math.round(e.sesion.pct)} %`);
    if (e.semana) partes.push(`semana ${Math.round(e.semana.pct)} %`);
    const v = e.sesion ?? e.semana;
    if (v) {
        partes.push(v.reiniciada ? "reiniciada" : `reinicia en ${fmtDuracion(v.minutosParaReinicio)}`);
        if (v.proyeccion !== null) partes.push(`proyección ${Math.round(v.proyeccion)} %`);
    }
    return partes.join(" · ");
}


=======
// Types for the limits of Claude plan

export interface LecturaLimites {
  t: string; // ISO timestamp
  sesion_pct: number; // 0-100
  sesion_reinicio: string; // ISO timestamp
  semana_pct: number; // 0-100
  semana_reinicio: string; // ISO timestamp
  modelo_nombre: string | null;
  modelo_pct: number | null; // 0-100
  modelo_reinicio: string | null; // ISO timestamp
  fuente: string;
}

export interface ProgramadaClaude {
  nombre: string;
  proxima: string; // ISO timestamp
  cada_min: number | null; // minutes, null if not periodic
}

export interface ConfigLimitesClaude {
  lecturas: LecturaLimites[];
  programadas: {
    t: string; // ISO timestamp of the config
    lista: ProgramadaClaude[];
  };
  umbral_pct: number; // e.g., 90
}

export interface VentanaClaude {
  pct: number; // current percentage
  queda: number; // remaining percentage (100 - pct)
  reinicio: string; // ISO timestamp of the next reset
  minutosParaReinicio: number; // minutes until reinicio (can be negative if passed)
  coste: number | null; // cost per revision (median of positive increases)
  proyeccion: number | null; // projected percentage at reinicio
  reiniciada: boolean; // true if the reinicio time has passed
  tono: "ok" | "aviso" | "peligro";
}

export interface EstadoLimitesClaude {
  sesion: VentanaClaude | null;
  semana: VentanaClaude | null;
  modelo: VentanaClaude | null;
  modeloNombre: string | null;
  lecturaEn: string | null; // ISO timestamp of the latest reading
  lecturaHaceMin: number | null; // minutes since latest reading
  desactualizada: boolean; // true if the latest reading is older than 120 min
  programadasEnSesion: number; // number of scheduled tasks in the session window
  programadasEnSemana: number; // number of scheduled tasks in the week window
  recomendacion: string | null;
  tono: "ok" | "aviso" | "peligro";
}

/**
 * Calcula el coste por revisión para un campo dado (sesion_pct, semana_pct, modelo_pct)
 * como la mediana de los aumentos positivos entre lecturas consecutivas de la misma ventana.
 * @param lecturas Array de lecturas ordenadas por tiempo (de más antigua a más reciente)
 * @param campo Nombre del campo en LecturaLimites (ej: "sesion_pct")
 * @return Mediana de los aumentos positivos, o null si no hay al menos dos lecturas con aumento positivo
 */
export function costePorRevision(lecturas: LecturaLimites[], campo: keyof LecturaLimites): number | null {
  if (!lecturas || lecturas.length < 2) {
    return null;
  }

  // Map from campo to the corresponding reinicio field
  const reinicioFieldMap: Record<string, keyof LecturaLimites> = {
    sesion_pct: 'sesion_reinicio',
    semana_pct: 'semana_reinicio',
    modelo_pct: 'modelo_reinicio',
  };

  const reinicioField = reinicioFieldMap[campo];
  if (!reinicioField) {
    return null;
  }

  // Group lectures by the reinicio field value (ISO string)
  const groups: Record<string, LecturaLimites[]> = {};
  for (const lectura of lecturas) {
    const reinicioValue = lectura[reinicioField];
    if (reinicioValue === null) {
      // Skip lectures with null reinicio for this campo
      continue;
    }
    if (!groups[reinicioValue]) {
      groups[reinicioValue] = [];
    }
    groups[reinicioValue].push(lectura);
  }

  const increases: number[] = [];

  // For each group, sort by t (timestamp) and compute positive differences
  for (const key in groups) {
    const group = groups[key];
    // Sort by t ascending
    group.sort((a, b) => a.t.localeCompare(b.t));

    for (let i = 1; i < group.length; i++) {
      const prev = group[i - 1];
      const curr = group[i];
      const prevValue = prev[campo];
      const currValue = curr[campo];
      if (typeof prevValue === 'number' && typeof currValue === 'number') {
        const diff = currValue - prevValue;
        if (diff > 0) {
          increases.push(diff);
        }
      }
    }
  }

  if (increases.length === 0) {
    return null;
  }

  // Sort the increases to compute median
  increases.sort((a, b) => a - b);
  const mid = Math.floor(increases.length / 2);
  if (increases.length % 2 === 0) {
    return (increases[mid - 1] + increases[mid]) / 2;
  } else {
    return increases[mid];
  }
}

/**
 * Calcula el número de disparos antes de un reinicio para una lista de tareas programadas.
 * @param lista Array de tareas programadas
 * @param ahora Timestamp actual en milliseconds
 * @param hasta Timestamp del reinicio en milliseconds
 * @return Número de disparos
 */
export function disparosAntes(lista: ProgramadaClaude[], ahora: number, hasta: number): number {
  let total = 0;
  for (const tarea of lista) {
    const proximaMs = new Date(tarea.proxima).getTime();
    // Check if proxima is in (ahora, hasta]
    if (proximaMs > ahora && proximaMs <= hasta) {
      total += 1; // The base shot
    }
    // Additional shots if cada_min is set and positive
    if (tarea.cada_min !== null && tarea.cada_min > 0) {
      const intervalMs = tarea.cada_min * 60 * 1000; // convert minutes to milliseconds
      if (proximaMs <= hasta) {
        // Number of additional intervals that fit between proxima and hasta
        const additional = Math.floor((hasta - proximaMs) / intervalMs);
        total += additional;
      }
    }
  }
  return total;
}

/**
 * Calcula el estado de los límites de Claude a partir de la configuración y el timestamp actual.
 * @param cfg Configuración (puede ser basura: objeto vacío o null)
 * @param ahora Timestamp actual en milliseconds
 * @return Estado calculado
 */
export function estadoLimitesClaude(cfg: unknown, ahora: number): EstadoLimitesClaude {
  // Handle trash input
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    return {
      sesion: null,
      semana: null,
      modelo: null,
      modeloNombre: null,
      lecturaEn: null,
      lecturaHaceMin: null,
      desactualizada: true,
      programadasEnSesion: 0,
      programadasEnSemana: 0,
      recomendacion: "Sin lectura todavía: la dirección la toma en su próxima revisión",
      tono: "aviso",
    };
  }

  const config = cfg as ConfigLimitesClaude;
  const lecturas = config.lecturas ?? [];
  const programadas = config.programadas?.lista ?? [];
  const umbral = config.umbral_pct ?? 90;

  // If there are no lecturas, return the default state (like trash)
  if (!lecturas || lecturas.length === 0) {
    return {
      sesion: null,
      semana: null,
      modelo: null,
      modeloNombre: null,
      lecturaEn: null,
      lecturaHaceMin: null,
      desactualizada: true,
      programadasEnSesion: 0,
      programadasEnSemana: 0,
      recomendacion: "Sin lectura todavía: la dirección la toma en su próxima revisión",
      tono: "aviso",
    };
  }

  // Sort lecturas by t ascending (oldest first, newest last)
  const sortedLecturas = [...lecturas].sort((a, b) => a.t.localeCompare(b.t));
  const latestLectura = sortedLecturas[sortedLecturas.length - 1];
  const latestTime = new Date(latestLectura.t).getTime();

  // Determine if the latest lectura is desactualizada (older than 120 minutes)
  const desactualizada = (ahora - latestTime) > 120 * 60 * 1000;

   // Helper to get a ventana for a given campo
    const getVentana = (campo: keyof LecturaLimites, reinicioField: keyof LecturaLimites): VentanaClaude | null => {
      // Find the most recent lectura with a non-null value for the campo
      let targetLectura: LecturaLimites | null = null;
      for (let i = sortedLecturas.length - 1; i >= 0; i--) {
        const lectura = sortedLecturas[i];
        const value = lectura[campo];
        if (value !== null && typeof value === 'number') {
          targetLectura = lectura;
          break;
        }
      }

      if (!targetLectura) {
        return null;
      }

      const pct = targetLectura[campo] as number;
      const reinicioStr = targetLectura[reinicioField] as string;
    const reinicioMs = new Date(reinicioStr).getTime();
    const minutosParaReinicio = (reinicioMs - ahora) / 60000; // minutes, can be negative
    let reiniciada = false;
    let adjustedPct = pct;
    let adjustedQueda = 100 - pct;

    if (reinicioMs <= ahora) {
      // Reinicio has passed
      reiniciada = true;
      adjustedPct = 0;
      adjustedQueda = 100;
      // minutosParaReinicio is already negative or zero
    }

    // Calculate coste for this campo
    const coste = costePorRevision(sortedLecturas, campo);

    // Calculate disparos for this window using the programmed tasks and the reinicio of this window
    const disparos = disparosAntes(programadas, ahora, reinicioMs);

    let proyeccion: number | null = null;
    if (coste !== null) {
      proyeccion = adjustedPct + disparos * coste;
      // Clamp proyeccion to a reasonable range? Not specified, but we leave as is.
    }

    // Determine tono based on pct and proyeccion
    let tono: 'ok' | 'aviso' | 'peligro' = 'ok';
    if (adjustedPct >= umbral || (proyeccion !== null && proyeccion > 100)) {
      tono = 'peligro';
    } else if (adjustedPct >= 60 || (proyeccion !== null && proyeccion >= umbral)) {
      tono = 'aviso';
    }

    return {
      pct: adjustedPct,
      queda: adjustedQueda,
      reinicio: reinicioStr,
      minutosParaReinicio,
      coste,
      proyeccion,
      reiniciada,
      tono,
    };
  };

  // Get ventanas for sesion, semana, modelo
  const sesionVentana = getVentana('sesion_pct', 'sesion_reinicio');
  const semanaVentana = getVentana('semana_pct', 'semana_reinicio');
  const modeloVentana = getVentana('modelo_pct', 'modelo_reinicio');

  // Determine modeloNombre: the modelo_nombre from the most recent lectura with a non-null modelo_pct
  let modeloNombre: string | null = null;
  for (let i = sortedLecturas.length - 1; i >= 0; i--) {
    const lectura = sortedLecturas[i];
    if (lectura.modelo_nombre !== null) {
      modeloNombre = lectura.modelo_nombre;
      break;
    }
  }

  // Calculate programadasEnSesion and programadasEnSemana using the same logic as disparosAntes
  // But note: we already computed disparos for each window inside getVentana, but we didn't store them.
  // We'll recompute or we can modify getVentana to return the disparos as well? Let's recompute for clarity.
  const sessionReinicioMs = sesionVentana ? new Date(sesionVentana.reinicio).getTime() : 0;
  const weekReinicioMs = semanaVentana ? new Date(semanaVentana.reinicio).getTime() : 0;
  const programadasEnSesion = disparosAntes(programadas, ahora, sessionReinicioMs);
  const programadasEnSemana = disparosAntes(programadas, ahora, weekReinicioMs);

    // Determine recomendacion
    let recomendacion: string | null = null;
    // Check if session or week window's proyeccion exceeds umbral
    const sessionExceeds = sesionVentana?.proyeccion !== null && sesionVentana.proyeccion > umbral;
    const weekExceeds = semanaVentana?.proyeccion !== null && semanaVentana.proyeccion > umbral;
    if (sessionExceeds || weekExceeds) {
      // Choose the window to report: prefer session if it exceeds, else week
      const targetWindow = sessionExceeds ? sesionVentana : semanaVentana;
      if (targetWindow && targetWindow.coste !== null) {
        const N = Math.max(0, Math.floor((umbral - targetWindow.pct) / targetWindow.coste));
        const ventanaName = sessionExceeds ? 'sesión' : 'semana';
        recomendacion = `Espacia las revisiones: caben ${N} hasta el reinicio de ${ventanaName}`;
      }
    }

  // Adjust tono if desactualizada: at least aviso
  let finalTono: 'ok' | 'aviso' | 'peligro' = 'ok';
  if (sesionVentana) {
    finalTono = sesionVentana.tono;
  } else if (semanaVentana) {
    finalTono = semanaVentana.tono;
  } else if (modeloVentana) {
    finalTono = modeloVentana.tono;
  }
  if (desactualizada && finalTono === 'ok') {
    finalTono = 'aviso';
  }

  // Overall tono: we need to pick one tono for the estado. The contract doesn't specify how to combine.
  // We'll use the worst tono among the three windows (peligro > aviso > ok)
  let overallTono: 'ok' | 'aviso' | 'peligro' = 'ok';
  const checkTono = (v: VentanaClaude | null) => {
    if (!v) return;
    if (v.tono === 'peligro') {
      overallTono = 'peligro';
    } else if (v.tono === 'aviso' && overallTono !== 'peligro') {
      overallTono = 'aviso';
    }
  };
  checkTono(sesionVentana);
  checkTono(semanaVentana);
  checkTono(modeloVentana);
  if (desactualizada && overallTono === 'ok') {
    overallTono = 'aviso';
  }

  return {
    sesion: sesionVentana,
    semana: semanaVentana,
    modelo: modeloVentana,
    modeloNombre,
    lecturaEn: latestLectura.t,
    lecturaHaceMin: Math.floor((ahora - latestTime) / 60000),
    desactualizada,
    programadasEnSesion,
    programadasEnSemana,
    recomendacion,
    tono: overallTono,
  };
}

/**
 * Genera un resumen legible del estado de los límites de Claude.
 * @param e Estado calculado
 * @return String de resumen
 */
export function resumenLimitesClaude(e: EstadoLimitesClaude): string {
  if (!e.sesion && !e.semana && !e.modelo) {
    return 'sin lectura';
  }

  const parts: string[] = [];

  if (e.sesion) {
    const { pct, minutosParaReinicio, proyeccion } = e.sesion;
    const horas = Math.floor(minutosParaReinicio / 60);
    const minutos = Math.floor(minutosParaReinicio % 60);
    const tiempoStr = `${horas} h ${minutos} min`;
    parts.push(`sesión ${pct} %`);
    if (proyeccion !== null) {
      parts.push(`proyección ${Math.round(proyeccion)} %`);
    } else {
      parts.push(`reinicia en ${tiempoStr}`);
    }
  }

  if (e.semana) {
    const { pct, minutosParaReinicio, proyeccion } = e.semana;
    const horas = Math.floor(minutosParaReinicio / 60);
    const minutos = Math.floor(minutosParaReinicio % 60);
    const tiempoStr = `${horas} h ${minutos} min`;
    parts.push(`semana ${pct} %`);
    if (proyeccion !== null) {
      parts.push(`proyección ${Math.round(proyeccion)} %`);
    } else {
      parts.push(`reinicia en ${tiempoStr}`);
    }
  }

  // We'll follow the example format: «sesión 34 % · semana 61 % · reinicia en 2 h 10 min · proyección 72 %»
  // But note: the example includes both session and week pct, then the time to reinicio (which one?) and the proyeccion (which one?).
  // The example seems to mix session and week. Let's re-examine the example from the contract:
  // «sesión 34 % · semana 61 % · reinicia en 2 h 10 min · proyección 72 %»
  // This suggests that the resumen shows both session and week pct, then the time to reinicio (probably for the session? or the earliest?) and a proyeccion (maybe for the session?).
  // However, the contract says: `resumenLimitesClaude(e)` → «sesión 34 % · semana 61 % · reinicia en 2 h 10 min · proyección 72 %» (o «sin lectura»)
  // It doesn't specify which window's reinicio and proyeccion are shown.

  // We'll assume that the resumen shows:
  // - session pct
  // - week pct
  // - time to reinicio for the session window (or the earliest reinicio?)
  // - proyeccion for the session window (or the one that is relevant?)

  // Given the ambiguity, we'll try to match the example by showing:
  //   sesión <sesion_pct> % · semana <semana_pct> % · reinicia en <time_to_session_reinicio> · proyección <session_proyeccion> %

  // But if session is null, we'll use week.

  // Let's build the string as in the example: we always show session and week pct if available, then the time to reinicio for the session (if available, else week), and the proyeccion for the session (if available, else week).

  // However, the example shows both pcts and then a single time and a single proyeccion.

  // We'll implement as follows:
  //   If session is available, use its reinicio and proyeccion for the latter parts.
  //   Else, if week is available, use its reinicio and proyeccion.
  //   Else, just show the pcts.

  // But the example shows both pcts even when giving a single time and proyeccion.

  // Let's do:
  //   part1: sesión <pct> % (if session exists, else omit)
  //   part2: semana <pct> % (if week exists, else omit)
  //   part3: reinicia en <time> (if we have a reinicio to show)
  //   part4: proyeccion <value> % (if we have a proyeccion to show)

  // We'll choose to show the reinicio and proyeccion from the session window if available, otherwise from the week window.

  const sessionOrWeek = e.sesion || e.semana;
  if (sessionOrWeek) {
    const ventana = e.sesion ? e.sesion : e.semana;
    const horas = Math.floor(ventana.minutosParaReinicio / 60);
    const minutos = Math.floor(ventana.minutosParaReinicio % 60);
    const tiempoStr = `${horas} h ${minutos} min`;
    parts.push(`reinicia en ${tiempoStr}`);
    if (ventana.proyeccion !== null) {
      parts.push(`proyección ${Math.round(ventana.proyeccion)} %`);
    }
  }

  // Join the parts with ' · '
  return parts.join(' · ');
}

// Enlace a la página de uso de Claude
export const ENLACE_USO_CLAUDE = "https://claude.ai/settings/usage";
>>>>>>> ff0277de (salvavidas · LC1004B: trabajo del agente antes de las puertas (tsc / vitest))
