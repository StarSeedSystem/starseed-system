/**
 * video-datos/reparto — voz y vídeo comparten UN enlace estrecho: la voz primero, el vídeo con lo que sobra (LLA1111B).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Puro (sin navegador ni red; el reloj y las colas se pasan como números).
 *
 * El problema que arregla (prueba 35): el Bluetooth saca SIEMPRE antes su carril de voz que el de vídeo, escribe en
 * «parada y espera» (cada escritura espera su acuse, ≈ 42 ms) y agrupa en una escritura lo que haya en UN carril. Con el
 * micro abierto entra voz cada 60 ms y cada escritura de voz tarda casi eso: el carril de voz nunca está vacío cuando el
 * Bluetooth elige, y el carril de vídeo no sale NUNCA (en la Mac, «kbps=0 motivos=cola-video:…» toda la llamada).
 * Además la sesión de vídeo solo mandaba con menos de 2 KiB de voz en cola: todo o nada.
 *
 * Cómo se reparte ahora:
 *  · Un solo carril. Los fragmentos de vídeo van al carril de la voz, detrás de la voz que ya espera, y la voz nueva
 *    entra directa (nunca espera a la sesión de vídeo). Así cada escritura del Bluetooth lleva voz Y vídeo juntos.
 *  · Modelo del enlace medido: cada escritura acusada (lo que entró en el carril menos lo que queda) da un par
 *    (bytes, duración). Con ellos se ajusta `duración = R + bytes / C` (R: el acuse fijo, ≈ 42 ms en el Bluetooth de
 *    Alex; C: lo que se serializa por ms). En parada y espera, con escrituras cada T ms, cabe `C·(1 − R/T)` por ms: lo
 *    que la voz no usa de eso, con T = `CICLO_OBJETIVO_MS`, es el presupuesto del vídeo. Un canal sin acuse (R ≈ 0) da
 *    toda su capacidad; uno sin cola medible no da pares y no limita.
 *  · Ventana: lo que cabe en una escritura de T ms, `(T − R)·C` bytes (entre 300 B y 1,5 KiB). El vídeo solo se mete
 *    mientras el carril (que cuenta hasta el acuse lo que está en vuelo) tiene menos de DOS ventanas: la escritura en
 *    vuelo y la siguiente. Un paquete de voz que llega espera, como mucho, la escritura en vuelo y sale en la siguiente:
 *    un trozo de vídeo nunca le pone delante más de una escritura. Cada fragmento cabe en una ventana (no en media: la
 *    cabecera de cada fragmento, ≈ 140 B con el id de la llamada, pesaba un 30 % con trozos tan pequeños).
 *  · Ritmo: una cubeta de fichas a la tasa objetivo del vídeo. Un fotograma clave grande sale a trozos a esa tasa,
 *    nunca de golpe (los siguientes diferenciales esperan; el que no cabe se tira y cuenta como «saliendo»).
 *  · Control (cada segundo): baja al presupuesto si lo pasa, ×0,6 si la voz espera más de `RETRASO_ALTO_MS` en el
 *    carril, ×0,7 si el receptor informa de pérdida; sube +15 % (mínimo 4 kbps) si la voz espera poco y el vídeo quiere
 *    más. El escalón (fps primero, luego tamaño) sale del objetivo con `PERFILES_VIDEO_REPARTO`.
 *  · Pausa con histéresis: si el objetivo queda por debajo del suelo (`SUELO_KBPS`, ≈ 1 fotograma por segundo de
 *    160×120) 3 s seguidos, el vídeo se pausa a propósito (el último fotograma se queda en pantalla y el otro lado lo
 *    sabe). Se reanuda solo, con un clave, cuando la voz sola deja el carril holgado `CALMA_REANUDAR_S` seguidos (y al
 *    menos `PAUSA_MINIMA_S` en pausa); si vuelve a pausarse antes de `REINCIDENCIA_S`, la calma pedida se duplica
 *    (hasta 40 s): no parpadea entre estados.
 */

/* ───────────────────────── Constantes ───────────────────────── */

/** Suelo del vídeo: por debajo no cabe ni ≈ 1 fotograma por segundo de 160×120 (con su clave cada 4 s). */
export const SUELO_KBPS = 12;
/** Ciclo de escritura al que se reparte: cada escritura (voz + vídeo) no debería tardar más (la voz espera ≤ 1 ciclo). */
export const CICLO_OBJETIVO_MS = 100;
/**
 * Con la voz esperando más que esto en el carril (edad del byte más viejo), el vídeo baja. Con el vídeo dentro de su
 * ventana el byte más viejo espera, como mucho, la escritura en vuelo y la siguiente (≈ 2 ciclos); más de 2,6 ciclos es
 * que el enlace ya no da ni para eso.
 */
export const RETRASO_ALTO_MS = 260;
/** Con la voz esperando menos que esto (≈ 2 ciclos: lo normal con la ventana llena), el vídeo puede subir. */
export const RETRASO_BAJO_MS = 210;
/** Con reparto, un fotograma clave como mucho cada esto (si se pierde algo, el receptor pide uno). */
export const CLAVE_MIN_MS = 5000;
/** Segundos seguidos por debajo del suelo antes de pausar. */
export const BAJO_SUELO_PARA_PAUSAR_S = 3;
/** Segundos seguidos con el carril holgado (solo voz) para reanudar. */
export const CALMA_REANUDAR_S = 5;
export const PAUSA_MINIMA_S = 4;
/** Si se vuelve a pausar antes de esto tras reanudar, la calma pedida se duplica. */
export const REINCIDENCIA_S = 20;
export const CALMA_MAXIMA_S = 40;
/** Pérdida de fotogramas que informa el receptor a partir de la cual se baja. */
export const PERDIDA_RECEPTOR_ALTA = 0.15;
export const VENTANA_MIN_BYTES = 300;
export const VENTANA_MAX_BYTES = 1536;
/** Profundidad de la cubeta de fichas (ms a la tasa objetivo). */
export const CUBETA_MS = 400;
/** Sin medida de escrituras se supone esto (bytes por ms ≈ 160 kb/s, lo que midió el canal rápido L2CAP). */
export const BYTES_POR_MS_SUPUESTOS = 20;
/** Pares (bytes, ms) que se recuerdan para el modelo. */
export const PARES_MODELO = 40;

/* ───────────────────────── Modelo del enlace ───────────────────────── */

/** Lo que tarda una escritura: `rMs + bytes / bytesPorMs`. */
export interface ModeloEnlace {
  rMs: number;
  bytesPorMs: number;
  /** De dónde salió: «ajuste» (pares variados), «supuesto» (C supuesta, R de los pares). */
  fuente: "ajuste" | "supuesto";
}

/**
 * Ajusta `ms = R + bytes/C` a los pares (bytes, ms) de escrituras con el carril ocupado. Si los tamaños apenas varían
 * (solo voz) no se puede separar R de C: se supone C (`bytesPorMsSupuestos`, lo anunciado) y R sale de la mediana.
 */
export function ajustarModelo(pares: ReadonlyArray<{ bytes: number; ms: number }>, bytesPorMsSupuestos: number = BYTES_POR_MS_SUPUESTOS): ModeloEnlace | null {
  if (pares.length < 6) return null;
  const n = pares.length;
  const mb = pares.reduce((a, p) => a + p.bytes, 0) / n;
  const mm = pares.reduce((a, p) => a + p.ms, 0) / n;
  let vb = 0;
  let cv = 0;
  for (const p of pares) {
    vb += (p.bytes - mb) ** 2;
    cv += (p.bytes - mb) * (p.ms - mm);
  }
  const desv = Math.sqrt(vb / n);
  const supuesto = (): ModeloEnlace => {
    const c = Math.max(1, bytesPorMsSupuestos);
    const rs = pares.map((p) => p.ms - p.bytes / c).sort((a, b) => a - b);
    return { rMs: Math.max(0, Math.min(250, rs[Math.floor(rs.length / 2)])), bytesPorMs: c, fuente: "supuesto" };
  };
  if (mb <= 0 || desv / mb < 0.25 || vb <= 0) return supuesto();
  const b = cv / vb;
  if (!(b > 0)) return supuesto();
  const c = Math.max(1, Math.min(250, 1 / b));
  const r = Math.max(0, Math.min(250, mm - mb / c));
  return { rMs: Math.round(r), bytesPorMs: Math.round(c * 10) / 10, fuente: "ajuste" };
}

/** Lo que cabe por ms (voz + vídeo) escribiendo cada `cicloMs` con ese modelo, en kbps. */
export function kbpsMaxConCiclo(m: ModeloEnlace, cicloMs: number = CICLO_OBJETIVO_MS): number {
  return Math.max(0, Math.round(8 * m.bytesPorMs * (1 - m.rMs / cicloMs)));
}

/** Bytes que puede llevar el carril delante de la voz: lo que cabe en una escritura de un ciclo. */
export function ventanaBytes(m: ModeloEnlace | null, anunciadoKbps?: number | null): number {
  const c = m ? m.bytesPorMs : typeof anunciadoKbps === "number" && anunciadoKbps > 0 ? anunciadoKbps / 8 : BYTES_POR_MS_SUPUESTOS;
  const r = m ? m.rMs : 42;
  return Math.round(Math.max(VENTANA_MIN_BYTES, Math.min(VENTANA_MAX_BYTES, (CICLO_OBJETIVO_MS - r) * c)));
}

/** Cabecera de un fragmento de vídeo en texto (JSON con el id de la llamada), por lo alto. */
export const CABECERA_FRAGMENTO_BYTES = 140;

/** Bytes crudos por fragmento para esa ventana: el fragmento en texto (base64 ≈ 4/3 más la cabecera) cabe en ella. */
export function mtuParaVentana(ventana: number): number {
  return Math.max(200, Math.floor(((ventana - CABECERA_FRAGMENTO_BYTES) * 3) / 4));
}

/* ───────────────────────── Medidor del carril ───────────────────────── */

/** Lo que se mide del carril en cada muestra (cada ~20 ms). */
export interface MuestraCarril {
  /** Bytes en el carril aún sin acuse (`colaVozBytes`). */
  cola: number;
  /** Bytes que entraron en el carril desde que se abrió (voz + vídeo, `bytesEntrados`). */
  entrados: number;
}

export interface ResumenEnlace {
  /** El modelo medido (null: aún sin escrituras con el carril ocupado, o un canal sin cola medible). */
  modelo: ModeloEnlace | null;
  /** Lo que cabe (voz + vídeo) con escrituras de un ciclo objetivo, kbps (null: sin modelo). */
  maxKbps: number | null;
  /** Todo lo que se acusó en la ventana, por segundo (kbps). */
  entregadoKbps: number;
  /** Voz que entró en la ventana (kbps): lo que entró menos el vídeo que metí yo. */
  vozKbps: number;
  /** Vídeo que metí en el carril en la ventana (kbps). */
  videoKbps: number;
  /** Mayor espera del byte más viejo del carril en la ventana (ms): lo que espera la voz. */
  retrasoMaxMs: number;
  /** Fracción del tiempo con el carril ocupado. */
  ocupacion: number;
}

/**
 * Mide el carril compartido a partir de dos contadores que el enlace ya tiene: lo que entró y lo que queda sin acuse.
 * acusado = entrados − cola (exacto: solo la voz y el vídeo de la llamada entran en ese carril).
 */
export class MedidorEnlace {
  private hist: Array<{ t: number; e: number }> = [];
  private ultimo: { t: number; acusado: number; entrados: number; cola: number } | null = null;
  private desde = 0;
  private acusadoVentana = 0;
  private ocupadoMs = 0;
  private entradosVentana = 0;
  private videoVentana = 0;
  private retrasoMax = 0;
  private acusadoMax = 0;
  private ultimaEscritura = 0;
  private ocupadoDesdeEscritura = false;
  private pares: Array<{ bytes: number; ms: number }> = [];
  /** Edad del byte más viejo del carril ahora (ms). */
  retrasoMs = 0;
  /** El último modelo calculado. */
  modelo: ModeloEnlace | null = null;

  constructor(private readonly bytesPorMsSupuestos: number = BYTES_POR_MS_SUPUESTOS) {}

  muestra(ahora: number, m: MuestraCarril): void {
    const cola = Math.max(0, m.cola);
    const acusado = Math.max(this.acusadoMax, m.entrados - cola);
    this.acusadoMax = acusado;
    if (!this.desde) this.desde = ahora;
    const prev = this.ultimo;
    if (prev) {
      const dt = Math.max(0, ahora - prev.t);
      const dAc = Math.max(0, acusado - prev.acusado);
      this.acusadoVentana += dAc;
      this.entradosVentana += Math.max(0, m.entrados - prev.entrados);
      // Tiempo ocupado: el carril tenía algo al principio o al final del intervalo (un enlace sin cola medible, como
      // un canal WebRTC, nunca cuenta como ocupado: sin medida no hay modelo ni techo).
      if (prev.cola > 0 || cola > 0) this.ocupadoMs += dt;
      if (prev.cola <= 0) this.ocupadoDesdeEscritura = false;
      if (dAc > 0) {
        // Acabó una escritura (su acuse). Si el carril estuvo ocupado desde la anterior, su duración vale para el modelo.
        if (this.ultimaEscritura && this.ocupadoDesdeEscritura) {
          this.pares.push({ bytes: dAc, ms: ahora - this.ultimaEscritura });
          if (this.pares.length > PARES_MODELO) this.pares.shift();
        }
        this.ultimaEscritura = ahora;
        this.ocupadoDesdeEscritura = cola > 0;
      }
    }
    // Historia de lo que entró (para saber cuándo entró el byte más viejo que aún espera).
    const ult = this.hist[this.hist.length - 1];
    if (!ult || m.entrados > ult.e) this.hist.push({ t: ahora, e: m.entrados });
    while (this.hist.length > 1 && this.hist[0].e <= acusado && this.hist[1].e <= acusado) this.hist.shift();
    if (this.hist.length > 400) this.hist.splice(0, this.hist.length - 400);
    if (cola <= 0) this.retrasoMs = 0;
    else {
      // El primer registro con más bytes entrados que los acusados es cuando entró el byte más viejo pendiente.
      const h = this.hist.find((x) => x.e > acusado);
      this.retrasoMs = h ? Math.max(0, ahora - h.t) : 0;
    }
    this.retrasoMax = Math.max(this.retrasoMax, this.retrasoMs);
    this.ultimo = { t: ahora, acusado, entrados: m.entrados, cola };
  }

  /** Cuenta los bytes de vídeo que YO metí en el carril (para separar la voz de lo que entró). */
  videoMetido(bytes: number): void {
    this.videoVentana += Math.max(0, bytes);
  }

  /** Pares (bytes, ms) recientes, para pruebas y diagnóstico. */
  paresRecientes(): ReadonlyArray<{ bytes: number; ms: number }> {
    return this.pares;
  }

  /** Cierra la ventana (≈ 1 s) y devuelve el resumen. */
  cerrarVentana(ahora: number): ResumenEnlace {
    const ms = Math.max(1, ahora - (this.desde || ahora));
    const kbps = (b: number, t: number) => Math.round((b * 8) / Math.max(1, t));
    const nuevo = ajustarModelo(this.pares, this.bytesPorMsSupuestos);
    if (nuevo) this.modelo = nuevo;
    const r: ResumenEnlace = {
      modelo: this.modelo,
      maxKbps: this.modelo ? kbpsMaxConCiclo(this.modelo) : null,
      entregadoKbps: kbps(this.acusadoVentana, ms),
      vozKbps: kbps(Math.max(0, this.entradosVentana - this.videoVentana), ms),
      videoKbps: kbps(this.videoVentana, ms),
      retrasoMaxMs: Math.round(this.retrasoMax),
      ocupacion: Math.min(1, Math.round((this.ocupadoMs / ms) * 100) / 100),
    };
    this.desde = ahora;
    this.acusadoVentana = 0;
    this.ocupadoMs = 0;
    this.entradosVentana = 0;
    this.videoVentana = 0;
    this.retrasoMax = this.retrasoMs;
    return r;
  }
}

/** Presupuesto del vídeo (kbps) con ese resumen: lo que cabe menos la voz, con un 10 % de margen. null: sin límite medido. */
export function presupuestoVideo(r: ResumenEnlace): number | null {
  if (r.maxKbps === null) return null;
  return Math.max(0, Math.round((r.maxKbps - r.vozKbps) * 0.9));
}

/* ───────────────────────── Control de la tasa del vídeo ───────────────────────── */

export type EstadoReparto = "activo" | "pausa";

export interface Entrada {
  enlace: ResumenEnlace;
  /** ¿El vídeo se quedó con ganas (fragmentos esperando fichas o fotogramas tirados por ritmo) en la ventana? */
  limitado: boolean;
  /** Fracción de fotogramas perdidos que informa el receptor (null: sin informe reciente). */
  perdidaReceptor: number | null;
}

export interface Cambio {
  estado: EstadoReparto;
  objetivoKbps: number;
  /** Por qué cambió (para el registro): «retraso-voz», «hay-sitio», «capacidad», «perdida-receptor», «suelo», «sitio-de-nuevo». */
  motivo: string;
}

export class ControlReparto {
  private est: EstadoReparto = "activo";
  private obj: number;
  private bajoSuelo = 0;
  private calma = 0;
  private enPausaDesde = 0;
  private reanudadoEn = -1e12;
  private calmaPedida = CALMA_REANUDAR_S;
  /** Último motivo (para el registro). */
  motivo = "inicio";
  pausas = 0;

  constructor(
    private readonly maxKbps: number,
    inicialKbps = 30,
  ) {
    this.obj = Math.max(SUELO_KBPS, Math.min(maxKbps, inicialKbps));
  }

  get estado(): EstadoReparto {
    return this.est;
  }

  get objetivoKbps(): number {
    return this.est === "pausa" ? 0 : this.obj;
  }

  get calmaPedidaS(): number {
    return this.calmaPedida;
  }

  /** Un paso por segundo. Devuelve el cambio si lo hubo (de estado o de objetivo). */
  paso(ahora: number, e: Entrada): Cambio | null {
    const antesEst = this.est;
    const antesObj = this.objetivoKbps;
    const l = e.enlace;
    const pres = presupuestoVideo(l);
    const techo = pres === null ? this.maxKbps : Math.min(this.maxKbps, pres);
    if (this.est === "activo") {
      let motivo: string | null = null;
      if (l.retrasoMaxMs > RETRASO_ALTO_MS) {
        this.obj = Math.min(this.obj * 0.6, techo);
        motivo = "retraso-voz";
      } else if (e.perdidaReceptor !== null && e.perdidaReceptor > PERDIDA_RECEPTOR_ALTA) {
        this.obj = Math.min(this.obj * 0.7, techo);
        motivo = "perdida-receptor";
      } else if (this.obj > techo) {
        this.obj = techo;
        motivo = "capacidad";
      } else if (l.retrasoMaxMs < RETRASO_BAJO_MS && e.limitado && this.obj < techo) {
        this.obj = Math.min(techo, this.obj + Math.max(4, this.obj * 0.15));
        motivo = "hay-sitio";
      }
      this.obj = Math.round(Math.max(0, this.obj));
      if (this.obj < SUELO_KBPS) {
        this.bajoSuelo++;
        this.obj = SUELO_KBPS;
        if (this.bajoSuelo >= BAJO_SUELO_PARA_PAUSAR_S) {
          this.est = "pausa";
          this.pausas++;
          this.enPausaDesde = ahora;
          this.calma = 0;
          // Reincidente: se pausó poco después de reanudar → más calma antes de volver a probar.
          this.calmaPedida = ahora - this.reanudadoEn < REINCIDENCIA_S * 1000 ? Math.min(CALMA_MAXIMA_S, this.calmaPedida * 2) : CALMA_REANUDAR_S;
          motivo = "suelo";
        }
      } else {
        this.bajoSuelo = 0;
      }
      if (motivo) this.motivo = motivo;
    } else {
      // En pausa solo va la voz: se reanuda si la voz espera poco y el modelo deja sitio para el doble del suelo.
      const holgura = pres === null || pres >= 2 * SUELO_KBPS;
      if (l.retrasoMaxMs < RETRASO_BAJO_MS && holgura) this.calma++;
      else this.calma = 0;
      if (this.calma >= this.calmaPedida && ahora - this.enPausaDesde >= PAUSA_MINIMA_S * 1000) {
        this.est = "activo";
        this.obj = Math.min(this.maxKbps, Math.max(2 * SUELO_KBPS, Math.min(techo, 3 * SUELO_KBPS)));
        this.bajoSuelo = 0;
        this.reanudadoEn = ahora;
        this.motivo = "sitio-de-nuevo";
      }
    }
    if (this.est !== antesEst || this.objetivoKbps !== antesObj) return { estado: this.est, objetivoKbps: this.objetivoKbps, motivo: this.motivo };
    return null;
  }
}

/* ───────────────────────── Cubeta de fichas ───────────────────────── */

/** Deja pasar bytes a la tasa objetivo; un fragmento sale si hay fichas (puede dejar la cubeta en deuda). */
export class Cubeta {
  private fichas = 0;
  private t = 0;

  recargar(ahora: number, kbps: number): void {
    if (!this.t) this.t = ahora;
    const dt = Math.max(0, ahora - this.t);
    this.t = ahora;
    const tope = Math.max(400, (kbps * CUBETA_MS) / 8);
    this.fichas = Math.min(tope, this.fichas + (kbps * dt) / 8);
  }

  puede(): boolean {
    return this.fichas > 0;
  }

  gastar(bytes: number): void {
    this.fichas -= bytes;
  }

  vaciar(): void {
    this.fichas = 0;
  }
}

/* ───────────────────────── Coste real de cada escalón ───────────────────────── */

/** Cada cuánto, como poco, se sube de escalón (bajar es inmediato). */
export const SUBIR_ESCALON_CADA_MS = 3000;

/**
 * Lo que cuesta de verdad un escalón en el carril: el códec no gasta lo configurado (a 160×120 suele gastar menos; con
 * una cámara movida, más) y el texto (base64 + cabecera) pesa ≈ 4/3. `factor` = kbps de texto que salen del códec /
 * kbps configurados, media móvil con los claves dentro (amortizados). El escalón elegido es el más alto cuyo coste
 * previsto cabe en el objetivo: con poco sitio bajan primero los fps y luego el tamaño (el orden de la escalera).
 */
export class CosteEscalon {
  /** Al empezar se supone el texto ≈ 1,3 veces lo configurado. */
  factor = 1.3;
  private muestras = 0;
  private ultimoCambio = 0;

  /** Una muestra de ≈ 1 s: kbps de texto que soltó el códec con ese perfil. Sin fotogramas no hay muestra. */
  medir(kbpsTexto: number, perfil: { kbps: number }, fotos: number): void {
    if (!(kbpsTexto > 0) || !(fotos > 0) || !(perfil.kbps > 0)) return;
    const f = Math.max(0.3, Math.min(3, kbpsTexto / perfil.kbps));
    const a = this.muestras < 3 ? 0.5 : 0.25;
    this.factor = Math.round((this.factor * (1 - a) + f * a) * 100) / 100;
    this.muestras++;
  }

  /** kbps de texto previstos para ese perfil. */
  prevision(perfil: { kbps: number }): number {
    return perfil.kbps * this.factor;
  }

  /** El escalón para ese objetivo (con histéresis: subir pide un 10 % de holgura y `SUBIR_ESCALON_CADA_MS`). */
  escalon(objetivoKbps: number, escalera: ReadonlyArray<{ kbps: number }>, actual: number, ahora: number): number {
    let i = 0;
    for (let k = 0; k < escalera.length; k++) if (this.prevision(escalera[k]) <= objetivoKbps) i = k;
    if (i > actual) {
      let arriba = actual;
      for (let k = actual + 1; k <= i; k++) if (this.prevision(escalera[k]) <= objetivoKbps * 0.9) arriba = k;
      if (arriba === actual || ahora - this.ultimoCambio < SUBIR_ESCALON_CADA_MS) return actual;
      i = arriba;
    }
    if (i !== actual) this.ultimoCambio = ahora;
    return i;
  }
}
