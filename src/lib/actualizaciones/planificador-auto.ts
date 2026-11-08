/**
 * ════════════════════════════════════════════════════════════════════════════
 * (ACT1108B · 2026-11-08) Cuándo se busca solo la versión nueva. Lógica PURA + un planificador sin DOM.
 * Contrato: architecture/centro-versiones-1105.md §9.
 *
 *   · ~20 s después de arrancar (sin competir con la primera carga) y luego cada 6 h.
 *   · El interruptor «Buscar actualizaciones automáticamente» (por defecto, SÍ) se guarda en este aparato.
 *   · Si la última búsqueda falló por falta de red, al volver la red se busca enseguida («Sin conexión: lo
 *     intentaré cuando vuelva la red»).
 *   · Si la última búsqueda fue hace menos de la mitad del intervalo (recarga de la página), no se repite
 *     a los 20 s: se espera lo que falte.
 * ════════════════════════════════════════════════════════════════════════════
 */

export const INICIO_AUTO_MS = 20_000;
export const CADA_MS = 6 * 60 * 60 * 1000;
export const CLAVE_AUTOMATICA = "starseed.actualizacion.automatica.v1";
export const EVENTO_AUTOMATICA = "starseed:actualizacion-automatica";

/** Lee el interruptor (por defecto, activado). Nunca lanza. */
export function leerAutomatica(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_AUTOMATICA) !== "0";
  } catch {
    return true;
  }
}

/** Guarda el interruptor y avisa a quien escucha. Nunca lanza. */
export function guardarAutomatica(activa: boolean): void {
  try {
    window.localStorage.setItem(CLAVE_AUTOMATICA, activa ? "1" : "0");
  } catch {
    /* sin almacenamiento: el interruptor vale hasta recargar */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_AUTOMATICA, { detail: activa }));
  } catch {
    /* sin window */
  }
}

export interface EntradaEspera {
  ahora: number;
  /** epoch ms de la última búsqueda hecha en este aparato (null = nunca). */
  ultimaEn: number | null;
  /** ¿Es la primera programación tras arrancar? */
  alArrancar: boolean;
}

/**
 * Los ms que faltan para la próxima búsqueda automática. Al arrancar: 20 s, salvo que la última fuera hace
 * menos de 3 h (entonces, lo que falte hasta las 6 h, nunca menos de 20 s). Después: 6 h. Pura.
 */
export function esperaHastaProxima(e: EntradaEspera): number {
  if (!e.alArrancar) return CADA_MS;
  if (e.ultimaEn === null || e.ultimaEn > e.ahora) return INICIO_AUTO_MS;
  const desde = e.ahora - e.ultimaEn;
  if (desde >= CADA_MS / 2) return INICIO_AUTO_MS;
  return Math.max(INICIO_AUTO_MS, CADA_MS - desde);
}

/** ¿Hay que buscar en cuanto vuelva la red? (la última búsqueda falló por falta de conexión). Pura. */
export function buscarAlVolverLaRed(ultima: { resultado: string; texto: string } | null): boolean {
  return !!ultima && ultima.resultado === "error" && /sin conexi[oó]n|no hubo conexi[oó]n|fetch|network/i.test(ultima.texto);
}

export interface Temporizadores {
  set: (f: () => void, ms: number) => unknown;
  clear: (id: unknown) => void;
}

export interface OpcionesPlanificador {
  /** Hace la búsqueda (la ventana decide qué enseña). */
  buscar: () => void | Promise<void>;
  /** ¿Sigue activo el interruptor? Se mira en cada vuelta. */
  activa: () => boolean;
  ultimaEn: () => number | null;
  ahora?: () => number;
  temporizadores?: Temporizadores;
  /** Solo para pruebas: la espera de la primera búsqueda (por defecto, la de `esperaHastaProxima`). */
  inicioMs?: number;
}

/**
 * Programa: primera búsqueda a los ~20 s y después cada 6 h, mirando el interruptor en cada vuelta (apagado:
 * no busca pero sigue vigilando por si lo vuelven a encender). `parar()` lo cancela. `reprogramar()` tras
 * cambiar el interruptor o tras una búsqueda manual.
 */
export function crearPlanificador(o: OpcionesPlanificador): { parar: () => void; reprogramar: (alArrancar?: boolean) => number } {
  const ahora = o.ahora ?? (() => Date.now());
  const t: Temporizadores = o.temporizadores ?? { set: (f, ms) => setTimeout(f, ms), clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>) };
  let id: unknown = null;
  let parado = false;
  const programar = (alArrancar: boolean): number => {
    if (id !== null) t.clear(id);
    const espera = alArrancar && o.inicioMs !== undefined ? o.inicioMs : esperaHastaProxima({ ahora: ahora(), ultimaEn: o.ultimaEn(), alArrancar });
    id = t.set(() => {
      if (parado) return;
      if (o.activa()) void Promise.resolve(o.buscar()).catch(() => undefined);
      programar(false);
    }, espera);
    return espera;
  };
  programar(true);
  return {
    parar: () => {
      parado = true;
      if (id !== null) t.clear(id);
    },
    reprogramar: (alArrancar = false) => (parado ? 0 : programar(alArrancar)),
  };
}
