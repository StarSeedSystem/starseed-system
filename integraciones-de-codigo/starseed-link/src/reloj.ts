/**
 * reloj — `relojComun()` del kit StarSeed Link. Copia fiel de `src/lib/estaciones/reloj-comun.ts`
 * del OS: UN reloj compartido por todos los medios de una estación en vivo (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOP: `architecture/estaciones-en-vivo-parametricas.md` (§2). Contrato §C de
 * `architecture/genesis-niveles-malla-universal-estaciones.md`.
 *
 * La transmisión es PARAMÉTRICA: no viaja audio, viajan la entonación y una línea de tiempo con
 * instantes en un reloj común. Cada medio genera el sonido en local y lo programa al instante
 * exacto, así que la precisión depende del reloj, no del ancho de banda.
 *
 * Método (el de NTP, sobre el canal de la propia estación):
 *   quien pregunta anota t0 (su hora al salir) → la referencia anota t1 (al llegar) y t2 (al
 *   responder) → quien pregunta anota t3 (al volver).
 *     desfase = ((t1 − t0) + (t2 − t3)) / 2      retardo = (t3 − t0) − (t2 − t1)
 *   Se guardan varias muestras, se quedan las de MENOR retardo (las que menos cola sufrieron) y
 *   el desfase es su MEDIANA. Dos números honestos salen de ahí:
 *     · precisión estimada = dispersión de esas muestras (desviación absoluta mediana × 1,4826);
 *     · cota = la mitad del mayor retardo usado: el error máximo posible si la ida y la vuelta
 *       tardaran distinto, que ninguna medida puede descartar.
 *   La interfaz enseña las dos. Nunca se inventa una precisión: sin muestras no hay número.
 *
 * El reloj de la referencia (el anfitrión) ES el reloj común. Este módulo es puro: el canal por
 * el que viajan las preguntas y respuestas (Supabase Realtime, enlace local P2P, postMessage) lo
 * pone quien lo usa, que además verifica la firma de cada respuesta antes de dársela.
 */

export interface MuestraReloj {
  /** Lo que hay que sumar a mi reloj local para obtener el común (ms). */
  desfaseMs: number;
  /** Ida y vuelta descontando lo que tardó la referencia en contestar (ms). */
  retardoMs: number;
  /** 1 = la referencia contestó en persona; >1 = contestó alguien sincronizado con ella. */
  estrato: number;
  /** Hora local en que se tomó (para caducarla). */
  at: number;
}

export interface EstimacionReloj {
  /** Desfase en el instante local `tRef` (ms). */
  desfaseMs: number;
  /** Cuánto más rápido (+) o lento (−) va mi reloj que el común, en partes por millón (0 si no se sabe). */
  derivaPpm: number;
  /** Instante local al que se refiere `desfaseMs`. */
  tRef: number;
  /** Dispersión de las mejores muestras (ms). */
  precisionMs: number;
  /** Error máximo posible si el camino fuera asimétrico (ms). */
  cotaMs: number;
  retardoMinMs: number;
  muestras: number;
  estrato: number;
}

const redondear = (n: number) => Math.round(n * 10) / 10;

/** Una muestra NTP a partir de los cuatro instantes. Null si los números no son posibles. */
export function muestraNtp(t0: number, t1: number, t2: number, t3: number, estrato = 1, at = t3): MuestraReloj | null {
  if (![t0, t1, t2, t3].every((x) => Number.isFinite(x))) return null;
  if (t2 < t1 || t3 < t0) return null;
  const retardo = t3 - t0 - (t2 - t1);
  // Un retardo negativo solo cabe por redondeo (relojes de 0,1 ms o peor): más allá, es basura.
  if (retardo < -1) return null;
  return {
    desfaseMs: (t1 - t0 + (t2 - t3)) / 2,
    retardoMs: Math.max(0, retardo),
    estrato: Math.max(1, Math.floor(estrato)),
    at,
  };
}

function mediana(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Desfase con la mitad de muestras de menor retardo (como mucho `maxUsadas`): mediana y dispersión. */
function medianaMejores(muestras: MuestraReloj[], maxUsadas: number) {
  const orden = [...muestras].sort((a, b) => a.retardoMs - b.retardoMs);
  const k = Math.max(1, Math.min(maxUsadas, Math.ceil(orden.length / 2)));
  const mejores = orden.slice(0, k);
  const desfases = mejores.map((m) => m.desfaseMs);
  const desfase = mediana(desfases);
  const retardoMax = Math.max(...mejores.map((m) => m.retardoMs));
  // Con una o dos muestras no hay dispersión que medir: la precisión es la cota.
  const dispersion =
    mejores.length >= 3 ? mediana(desfases.map((d) => Math.abs(d - desfase))) * 1.4826 : retardoMax / 2;
  return { desfase, dispersion, retardoMax, retardoMin: mejores[0].retardoMs };
}

/** Ventana de muestras para el desfase SIN deriva conocida (los relojes derivan). */
const VENTANA_SIN_DERIVA_MS = 120_000;
/** La deriva solo se usa con ≥ 4 rondas que abarquen ≥ 90 s: con menos, estimarla empeora el resultado. */
const RONDAS_MIN_DERIVA = 4;
const TRAMO_MIN_DERIVA_MS = 90_000;
/** Ningún cristal de cuarzo sano deriva más de esto. */
const DERIVA_MAX = 500e-6;

/**
 * Estima el desfase con las mejores muestras del estrato más bajo.
 *   · Siempre: mediana de la mitad con menos retardo de los últimos 2 min.
 *   · Si hay ≥ 4 rondas de medidas (muestras a menos de 5 s entre sí) que abarcan ≥ 90 s, además la
 *     DERIVA: recta por mínimos cuadrados con la mejor muestra de cada ronda, pesada por 1/retardo².
 *     Así el reloj sigue siendo de milisegundos aunque se pregunte la hora cada pocos minutos.
 */
export function estimarDesfase(muestras: MuestraReloj[], maxUsadas = 8): EstimacionReloj | null {
  const validas = muestras.filter(
    (m) => m && Number.isFinite(m.desfaseMs) && Number.isFinite(m.retardoMs) && Number.isFinite(m.at),
  );
  if (!validas.length) return null;
  const estrato = Math.min(...validas.map((m) => m.estrato));
  const delEstrato = validas.filter((m) => m.estrato === estrato).sort((a, b) => a.at - b.at);
  const tUlt = delEstrato[delEstrato.length - 1].at;
  const recientes = delEstrato.filter((m) => tUlt - m.at <= VENTANA_SIN_DERIVA_MS);
  const b = medianaMejores(recientes, maxUsadas);
  const basica: EstimacionReloj = {
    desfaseMs: b.desfase,
    derivaPpm: 0,
    tRef: tUlt,
    precisionMs: redondear(Math.max(0.1, b.dispersion)),
    cotaMs: redondear(b.retardoMax / 2),
    retardoMinMs: redondear(b.retardoMin),
    muestras: validas.length,
    estrato,
  };

  // Rondas → la mejor muestra de cada una.
  const rondas: MuestraReloj[][] = [];
  for (const m of delEstrato) {
    const r = rondas[rondas.length - 1];
    if (r && m.at - r[r.length - 1].at <= 5_000) r.push(m);
    else rondas.push([m]);
  }
  const puntos = rondas.map((r) => r.reduce((x, y) => (y.retardoMs < x.retardoMs ? y : x)));
  if (puntos.length < RONDAS_MIN_DERIVA || puntos[puntos.length - 1].at - puntos[0].at < TRAMO_MIN_DERIVA_MS) {
    return basica;
  }
  let sw = 0, sx = 0, sy = 0;
  const w = puntos.map((p) => 1 / (p.retardoMs + 0.5) ** 2);
  puntos.forEach((p, i) => {
    sw += w[i];
    sx += w[i] * (p.at - tUlt);
    sy += w[i] * p.desfaseMs;
  });
  const mx = sx / sw;
  const my = sy / sw;
  let sxx = 0, sxy = 0;
  puntos.forEach((p, i) => {
    const dx = p.at - tUlt - mx;
    sxx += w[i] * dx * dx;
    sxy += w[i] * dx * (p.desfaseMs - my);
  });
  if (!(sxx > 0)) return basica;
  const pendiente = Math.max(-DERIVA_MAX, Math.min(DERIVA_MAX, sxy / sxx));
  const enUlt = my - pendiente * mx; // desfase en tUlt
  const residuos = puntos.map((p) => Math.abs(p.desfaseMs - (enUlt + pendiente * (p.at - tUlt))));
  const dispersion = residuos.length >= 3 ? mediana(residuos) * 1.4826 : b.retardoMax / 2;
  return {
    ...basica,
    desfaseMs: enUlt,
    derivaPpm: -pendiente * 1e6, // pendiente del desfase = −(lo que adelanta mi reloj)
    precisionMs: redondear(Math.max(0.1, dispersion)),
  };
}

/* ═══════════════════════ El reloj con estado ═══════════════════════ */

export interface PingReloj {
  /** Id de la pregunta (para casar la respuesta). */
  id: string;
  /** Quién pregunta (id aleatorio de este medio). */
  de: string;
  t0: number;
}

export interface PongReloj {
  id: string;
  para: string;
  t0: number;
  t1: number;
  t2: number;
  /** Estrato de quien contesta: 0 = la referencia. */
  estrato: number;
}

export type ModoReloj = "referencia" | "sincronizado" | "sin-referencia";

export interface EstadoReloj {
  modo: ModoReloj;
  desfaseMs: number;
  /** Deriva medida del reloj de este aparato frente al común (ppm); 0 si aún no se sabe. */
  derivaPpm: number;
  precisionMs: number | null;
  cotaMs: number | null;
  retardoMinMs: number | null;
  muestras: number;
  /** Hora local de la última muestra buena (null si nunca hubo). */
  ultimaMuestra: number | null;
}

export interface OpcionesReloj {
  /** Reloj local en ms de época (por defecto, el monotónico del navegador anclado a la época). */
  relojLocal?: () => number;
  /** true en el anfitrión: su hora ES la común. */
  esReferencia?: boolean;
  /** Muestras que se guardan (ventana deslizante). */
  maxMuestras?: number;
  /** Una muestra más vieja que esto ya no cuenta (los relojes derivan). */
  caducidadMs?: number;
  /** Id de este medio. */
  id?: string;
}

/** Reloj local por defecto: monotónico (no salta con ajustes del sistema) y en ms de época. */
export function relojLocalPorDefecto(): number {
  try {
    if (typeof performance !== "undefined" && typeof performance.now === "function" && performance.timeOrigin) {
      return performance.timeOrigin + performance.now();
    }
  } catch {
    /* sin performance: hora del sistema */
  }
  return Date.now();
}

function idAleatorio(): string {
  try {
    const b = new Uint8Array(8);
    globalThis.crypto.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  } catch {
    return Math.random().toString(36).slice(2, 12);
  }
}

export class RelojComun {
  readonly id: string;
  private readonly local: () => number;
  private readonly maxMuestras: number;
  private readonly caducidadMs: number;
  private referencia: boolean;
  private muestras: MuestraReloj[] = [];
  private pendientes = new Map<string, number>();
  private estimacion: EstimacionReloj | null = null;
  private oyentes = new Set<(e: EstadoReloj) => void>();

  constructor(op: OpcionesReloj = {}) {
    this.local = op.relojLocal ?? relojLocalPorDefecto;
    this.referencia = !!op.esReferencia;
    this.maxMuestras = op.maxMuestras ?? 48;
    this.caducidadMs = op.caducidadMs ?? 900_000;
    this.id = op.id ?? idAleatorio();
  }

  /** Hora local de este medio (ms de época). */
  horaLocal(): number {
    return this.local();
  }

  /** Desfase (común − local) en el instante local `l`, con la deriva si se conoce. */
  private desfaseEn(l: number): number {
    if (this.referencia || !this.estimacion) return 0;
    const e = this.estimacion;
    return e.desfaseMs - (e.derivaPpm / 1e6) * (l - e.tRef);
  }

  /** Hora común (ms). Sin referencia todavía, la local: el estado lo dice como «sin referencia». */
  ahora(): number {
    const l = this.local();
    return l + this.desfaseEn(l);
  }

  /** Pasa una hora común a la local de este medio. */
  aLocal(tComun: number): number {
    return tComun - this.desfaseEn(tComun);
  }

  hacerReferencia(si: boolean): void {
    this.referencia = si;
    this.emitir();
  }

  esReferencia(): boolean {
    return this.referencia;
  }

  estado(): EstadoReloj {
    if (this.referencia) {
      return { modo: "referencia", desfaseMs: 0, derivaPpm: 0, precisionMs: 0, cotaMs: 0, retardoMinMs: 0, muestras: 0, ultimaMuestra: null };
    }
    const e = this.estimacion;
    return {
      modo: e ? "sincronizado" : "sin-referencia",
      desfaseMs: e ? this.desfaseEn(this.local()) : 0,
      derivaPpm: e?.derivaPpm ?? 0,
      precisionMs: e?.precisionMs ?? null,
      cotaMs: e?.cotaMs ?? null,
      retardoMinMs: e?.retardoMinMs ?? null,
      muestras: e?.muestras ?? 0,
      ultimaMuestra: this.muestras.length ? this.muestras[this.muestras.length - 1].at : null,
    };
  }

  suscribir(cb: (e: EstadoReloj) => void): () => void {
    this.oyentes.add(cb);
    return () => {
      this.oyentes.delete(cb);
    };
  }

  /** Prepara una pregunta de hora (anota t0). */
  nuevoPing(): PingReloj {
    const id = idAleatorio();
    const t0 = this.local();
    this.pendientes.set(id, t0);
    if (this.pendientes.size > 64) this.pendientes.delete(this.pendientes.keys().next().value as string);
    return { id, de: this.id, t0 };
  }

  /**
   * La referencia contesta: `t1` es la hora LOCAL a la que llegó la pregunta (anotada al recibir,
   * antes de cualquier trabajo); t2 se toma aquí, justo antes de devolver. Firmar la respuesta
   * después (≈ 0,05–0,2 ms con ECDSA en un navegador) cuenta como camino de vuelta: un sesgo de la
   * mitad de eso, muy por debajo de la precisión que se enseña.
   */
  atenderPing(p: PingReloj, t1Local: number): PongReloj | null {
    if (!this.referencia && !this.estimacion) return null; // sin hora fiable no se contesta
    const desfase = this.desfaseEn(t1Local);
    const estrato = this.referencia ? 0 : this.estimacion?.estrato ?? 1;
    return { id: p.id, para: p.de, t0: p.t0, t1: t1Local + desfase, t2: this.ahora(), estrato };
  }

  /**
   * Llega una respuesta (ya verificada). `t3Local` es la hora local a la que llegó, anotada al
   * recibir y no después de verificar la firma. Devuelve true si sirvió como muestra.
   */
  recibirPong(p: PongReloj, t3Local: number): boolean {
    if (this.referencia || p.para !== this.id) return false;
    const t0 = this.pendientes.get(p.id);
    if (t0 === undefined || t0 !== p.t0) return false;
    this.pendientes.delete(p.id);
    const m = muestraNtp(t0, p.t1, p.t2, t3Local, (p.estrato ?? 0) + 1, t3Local);
    if (!m) return false;
    this.muestras.push(m);
    const corte = t3Local - this.caducidadMs;
    this.muestras = this.muestras.filter((x) => x.at >= corte).slice(-this.maxMuestras);
    this.estimacion = estimarDesfase(this.muestras);
    this.emitir();
    return true;
  }

  /** Olvida las muestras (p. ej. al cambiar de anfitrión). */
  reiniciar(): void {
    this.muestras = [];
    this.pendientes.clear();
    this.estimacion = null;
    this.emitir();
  }

  private emitir(): void {
    const e = this.estado();
    for (const cb of Array.from(this.oyentes)) {
      try {
        cb(e);
      } catch {
        /* un oyente roto no para el reloj */
      }
    }
  }
}

/**
 * Ritmo de sondeo, pensado para gastar pocos mensajes sin perder el milisegundo:
 *   · al empezar, una ráfaga de `rafaga` preguntas separadas `rafagaMs`;
 *   · después, rondas de `porVuelta` preguntas cada `periodoMs`, que se va doblando hasta
 *     `periodoMaxMs` (con 4 rondas en 90 s ya se conoce la deriva y se puede espaciar).
 * `preguntar` manda una pregunta por el canal. Devuelve la función para pararlo.
 */
export function programarSondeo(
  preguntar: () => void,
  op: {
    rafaga?: number;
    rafagaMs?: number;
    porVuelta?: number;
    periodoMs?: number;
    periodoMaxMs?: number;
    poner?: typeof setTimeout;
    quitar?: typeof clearTimeout;
  } = {},
): () => void {
  const rafaga = op.rafaga ?? 8;
  const rafagaMs = op.rafagaMs ?? 150;
  const porVuelta = Math.max(1, op.porVuelta ?? 3);
  let periodo = op.periodoMs ?? 30_000;
  const periodoMax = Math.max(periodo, op.periodoMaxMs ?? 300_000);
  const poner = op.poner ?? setTimeout;
  const quitar = op.quitar ?? clearTimeout;
  let n = 0;
  let enRonda = 0;
  let parado = false;
  let h: ReturnType<typeof setTimeout> | null = null;
  const paso = () => {
    if (parado) return;
    try {
      preguntar();
    } catch {
      /* el canal puede no estar listo: la siguiente vuelta lo intenta */
    }
    n++;
    let espera: number;
    if (n < rafaga) espera = rafagaMs;
    else if (n === rafaga) espera = periodo;
    else if (++enRonda < porVuelta) espera = rafagaMs;
    else {
      enRonda = 0;
      periodo = Math.min(periodoMax, periodo * 2);
      espera = periodo;
    }
    h = poner(paso, espera);
  };
  h = poner(paso, 0);
  return () => {
    parado = true;
    if (h) quitar(h);
  };
}
