/**
 * reloj-estable — el reloj de la llamada que no se para cuando la página se oculta o se tapa (LLA1113A).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Lo que pasó (prueba 40, Mac ↔ tableta solo por Bluetooth, la Mac sin nadie delante): durante tramos de 10–35 s los
 * temporizadores de 20 ms del motor (la salida de la voz `bombear`, la reproducción `reproducirTrama`, el marcapasos del
 * vídeo y la muestra del carril) corrieron UNA vez por segundo. La firma en el registro: «espera=992…1015/0ms» en
 * `video-datos reparto` y `voz-datos nivel` (48 veces en las dos llamadas limpias, ninguna en las rondas anteriores): el
 * medidor toma el hueco entre dos muestras como lo que esperó la voz en el carril, y el máximo queda en 0 porque en cada
 * muestra lo pendiente acaba de entrar. Con eso el vídeo se pausaba «por suelo» con 100–235 kb/s de sitio, la voz tiraba lo
 * que no salía (escalón 5, Opus 6 kb/s, en los dos sentidos por el informe del otro) y el otro lado oía un 97–100 % de audio
 * inventado. Es lo que hace WebKit con los temporizadores de una página oculta o tapada: los alinea a 1 s.
 *
 * Los temporizadores de un Worker no los alinea la página: aquí un Worker diminuto (de un Blob, sin archivo aparte) da un
 * tic cada `PERIODO_TIC_MS` y cada `cada(fn, ms)` corre con el tic del Worker O con su setInterval de la página, lo que llegue
 * antes, como mucho una vez por periodo. Con la página normal no cambia nada (los dos llegan a la vez y uno se salta); con la
 * página lenta manda el Worker; sin Worker (navegador sin Blob/Worker) sigue como antes, con la página.
 *
 * Diagnóstico (regla de Alex: cada arreglo deja rastro en `enlaces.log`): cuando un temporizador corto de la página tarda más
 * de `UMBRAL_PAGINA_LENTA_MS`, una línea «reloj temporizadores-pagina lentos …» (con la visibilidad del documento y si el
 * Worker sostiene el ritmo), y otra al volver a la normalidad. Así la próxima ronda dice si fue esto sin adivinar.
 */

export interface RelojLlamada {
  ahora(): number;
  cada(fn: () => void, ms: number): () => void;
}

/** Tic del Worker (ms): el temporizador más corto del motor. */
export const PERIODO_TIC_MS = 20;
/** Un temporizador corto de la página que tarda más que esto entre dos vueltas está «lento». */
export const UMBRAL_PAGINA_LENTA_MS = 400;
/** Tanto tiempo seguido con la página a su ritmo para dar por acabado un tramo lento. */
export const PAGINA_NORMAL_TRAS_MS = 5_000;

/** Una vuelta vale si pasó al menos esta fracción del periodo desde la anterior (dos fuentes, una sola vuelta). */
const FRACCION_MIN = 0.8;

/** El código del Worker: un setInterval que avisa en cada vuelta; `{ ms }` lo arranca, `{ ms: 0 }` lo para. */
export const CODIGO_TIC = "let t=null;onmessage=function(e){var ms=e&&e.data&&e.data.ms;if(t)clearInterval(t);t=null;if(ms>0)t=setInterval(function(){postMessage(1)},ms)};";

export interface TemporizadoresPagina {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

/** Lo mínimo de un Worker que se usa (para poder probarlo sin navegador). */
export interface TicWorker {
  postMessage(m: unknown): void;
  terminate(): void;
  onmessage: ((e: unknown) => void) | null;
}

export interface OpcionesRelojEstable {
  ahora?: () => number;
  /** Temporizadores de la página (por defecto, los globales). */
  pagina?: TemporizadoresPagina;
  /** Crea el Worker del tic (por defecto, uno de un Blob). null: sin Worker. */
  crearWorker?: () => TicWorker | null;
  /** Línea al registro (`reloj …`). */
  anotar?: (detalle: string) => void;
  /** Visibilidad del documento para el registro (por defecto, `document.visibilityState`). */
  visibilidad?: () => string;
}

export interface EstadoRelojEstable {
  conWorker: boolean;
  paginaLenta: boolean;
  /** Mayor hueco visto entre dos vueltas de un temporizador corto de la página (ms) desde el último cambio. */
  huecoPaginaMaxMs: number;
  /** Mayor hueco entre dos tics del Worker desde el último cambio (ms; 0 sin Worker). */
  huecoWorkerMaxMs: number;
}

function workerDeBlob(): TicWorker | null {
  try {
    if (typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
    const url = URL.createObjectURL(new Blob([CODIGO_TIC], { type: "text/javascript" }));
    const w = new Worker(url);
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* el Worker ya cargó o cargará con su copia */
    }
    return w as unknown as TicWorker;
  } catch {
    return null;
  }
}

const paginaGlobal: TemporizadoresPagina = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
};

interface Suscripcion {
  fn: () => void;
  ms: number;
  ult: number;
  /** Última vuelta de SU temporizador de la página (para medir si la página va lenta). */
  ultPagina: number;
  idPagina: unknown;
}

/**
 * Reloj de una llamada. Un Worker para todo el reloj (se crea con la primera suscripción y se para con la última);
 * `detener()` lo suelta todo. Nunca lanza.
 */
export class RelojEstable implements RelojLlamada {
  private readonly subs = new Set<Suscripcion>();
  private worker: TicWorker | null = null;
  private workerIntentado = false;
  private ultTicWorker = 0;
  private huecoWorkerMax = 0;
  private paginaLenta = false;
  private huecoPaginaMax = 0;
  private normalDesde = 0;
  private lentaDesde = 0;
  private readonly reloj: () => number;
  private readonly pagina: TemporizadoresPagina;

  constructor(private readonly opc: OpcionesRelojEstable = {}) {
    this.reloj = opc.ahora ?? (() => Date.now());
    this.pagina = opc.pagina ?? paginaGlobal;
  }

  ahora(): number {
    return this.reloj();
  }

  cada(fn: () => void, ms: number): () => void {
    const periodo = Math.max(1, Math.floor(ms));
    const s: Suscripcion = { fn, ms: periodo, ult: this.reloj(), ultPagina: this.reloj(), idPagina: null };
    s.idPagina = this.pagina.setInterval(() => this.vueltaPagina(s), periodo);
    this.subs.add(s);
    this.asegurarWorker();
    return () => {
      if (!this.subs.delete(s)) return;
      try {
        this.pagina.clearInterval(s.idPagina);
      } catch {
        /* noop */
      }
      if (!this.subs.size) this.pararWorker();
    };
  }

  /** Suelta el Worker y todos los temporizadores. Idempotente. */
  detener(): void {
    for (const s of this.subs) {
      try {
        this.pagina.clearInterval(s.idPagina);
      } catch {
        /* noop */
      }
    }
    this.subs.clear();
    this.pararWorker();
  }

  estado(): EstadoRelojEstable {
    return { conWorker: !!this.worker, paginaLenta: this.paginaLenta, huecoPaginaMaxMs: Math.round(this.huecoPaginaMax), huecoWorkerMaxMs: Math.round(this.huecoWorkerMax) };
  }

  /** Corre la suscripción si toca (pasó casi un periodo desde la última vuelta, venga de donde venga). */
  private correr(s: Suscripcion, ahora: number): void {
    if (ahora - s.ult < s.ms * FRACCION_MIN) return;
    s.ult = ahora;
    try {
      s.fn();
    } catch {
      /* una vuelta que falla no para el reloj */
    }
  }

  private vueltaPagina(s: Suscripcion): void {
    const ahora = this.reloj();
    // Solo los temporizadores cortos dicen si la página va lenta (uno de 1 s ya es lento de por sí).
    if (s.ms < UMBRAL_PAGINA_LENTA_MS) this.medirPagina(ahora - s.ultPagina, ahora);
    s.ultPagina = ahora;
    if (!this.subs.has(s)) return;
    if (this.worker) {
      this.correr(s, ahora);
      return;
    }
    // Sin Worker, exactamente como antes: cada vuelta de la página corre (sin mirar el reloj, que una prueba puede fijar).
    s.ult = ahora;
    try {
      s.fn();
    } catch {
      /* noop */
    }
  }

  private vueltaWorker(): void {
    const ahora = this.reloj();
    if (this.ultTicWorker) this.huecoWorkerMax = Math.max(this.huecoWorkerMax, ahora - this.ultTicWorker);
    this.ultTicWorker = ahora;
    for (const s of Array.from(this.subs)) this.correr(s, ahora);
    // Sin vueltas de la página en todo este rato también es «lenta» (una página parada no avisa sola).
    if (!this.paginaLenta) {
      for (const s of this.subs) {
        if (s.ms < UMBRAL_PAGINA_LENTA_MS && ahora - s.ultPagina > UMBRAL_PAGINA_LENTA_MS) {
          this.medirPagina(ahora - s.ultPagina, ahora);
          break;
        }
      }
    }
  }

  private medirPagina(hueco: number, ahora: number): void {
    this.huecoPaginaMax = Math.max(this.huecoPaginaMax, hueco);
    if (hueco > UMBRAL_PAGINA_LENTA_MS) {
      this.normalDesde = 0;
      if (!this.paginaLenta) {
        this.paginaLenta = true;
        this.lentaDesde = ahora;
        this.anotar(`reloj temporizadores-pagina lentos hueco=${Math.round(hueco)}ms worker=${this.worker ? "si" : "no"} tic-worker-max=${Math.round(this.huecoWorkerMax)}ms visible=${this.visible()}`);
        this.huecoPaginaMax = hueco;
        this.huecoWorkerMax = 0;
      }
      return;
    }
    if (!this.paginaLenta) return;
    if (!this.normalDesde) this.normalDesde = ahora;
    if (ahora - this.normalDesde >= PAGINA_NORMAL_TRAS_MS) {
      this.anotar(`reloj temporizadores-pagina normales tras=${Math.round((ahora - this.lentaDesde) / 1000)}s hueco-max=${Math.round(this.huecoPaginaMax)}ms tic-worker-max=${Math.round(this.huecoWorkerMax)}ms visible=${this.visible()}`);
      this.paginaLenta = false;
      this.normalDesde = 0;
      this.huecoPaginaMax = 0;
      this.huecoWorkerMax = 0;
    }
  }

  private asegurarWorker(): void {
    if (this.worker || this.workerIntentado) return;
    this.workerIntentado = true;
    let w: TicWorker | null = null;
    try {
      w = (this.opc.crearWorker ?? workerDeBlob)();
    } catch {
      w = null;
    }
    if (!w) {
      this.anotar("reloj sin-worker (los temporizadores de la página mandan solos)");
      return;
    }
    this.worker = w;
    this.ultTicWorker = 0;
    w.onmessage = () => this.vueltaWorker();
    try {
      w.postMessage({ ms: PERIODO_TIC_MS });
    } catch {
      this.pararWorker();
    }
  }

  private pararWorker(): void {
    const w = this.worker;
    this.worker = null;
    this.workerIntentado = false;
    if (!w) return;
    try {
      w.onmessage = null;
      w.postMessage({ ms: 0 });
      w.terminate();
    } catch {
      /* noop */
    }
  }

  private visible(): string {
    try {
      if (this.opc.visibilidad) return this.opc.visibilidad();
      return typeof document !== "undefined" ? document.visibilityState : "?";
    } catch {
      return "?";
    }
  }

  private anotar(d: string): void {
    try {
      this.opc.anotar?.(d);
    } catch {
      /* noop */
    }
  }
}
