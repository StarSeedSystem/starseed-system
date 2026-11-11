/**
 * voz-datos/niveles — la voz sigue a lo que el enlace da de verdad (VOZ1111J).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Puro (sin navegador ni red; el reloj y las medidas se pasan como números).
 *
 * El problema (banco `llamadas-medio`, caso `voz-40`): Opus salía SIEMPRE a 24 kb/s en tramas de 20 ms y paquetes de
 * 60 ms. En el carril eso son ≈ 48 kb/s de texto (base64 + JSON con el id de la llamada) y el Bluetooth escribe en
 * «parada y espera» (cada escritura espera su acuse, ≈ 42 ms): a 40 kb/s no cabía ni sola y se perdía ≈ 19 %.
 *
 * Palancas, de la que más ahorra a la que menos:
 *  · Formato compacto «b1» (`paquete.ts`, negociado): ≈ 110 B menos de cabecera por paquete.
 *  · Escalera de niveles (`NIVELES_OPUS`): kb/s de Opus, duración de la trama (20/40/60 ms: menos cabeceras por
 *    segundo) y del paquete (60–180 ms: menos escrituras, cada una con su acuse fijo). Con un aparato anterior la trama
 *    se queda en 20 ms (su decodificador numera tramas de 20 ms) y solo bajan los kb/s y crecen los paquetes.
 *  · Silencio declarado (DTX): con el otro en «b1», lo que es silencio no se manda (no es pérdida al otro lado).
 *  · Redundancia: con pérdida informada por el otro y sitio de sobra (el escalón cabe dos veces), cada paquete repite la
 *    última trama del anterior.
 *
 * Entradas cada segundo (`paso`): el modelo del enlace (`video-datos/reparto.ts`: `ms = R + bytes/C` medido de las
 * escrituras acusadas), la espera de la voz en el carril, los descartes locales y el informe del otro (`rep`: % perdido
 * y % tarde de lo que le llega). Baja al momento con cualquier señal de atasco; sube un escalón solo tras una calma
 * (6 s, que se duplica si la subida anterior falló, hasta 48 s) y si el modelo dice que el de arriba cabe con holgura.
 * Por debajo del último escalón con atasco sostenido: «bajo el suelo» (la llamada lo dice en palabras).
 */
import { bytesTextoB1, bytesTextoP } from "./paquete";
import type { ModeloEnlace } from "@/lib/llamadas/video-datos/reparto";

export interface NivelVoz {
  /** kb/s pedidos al códec (Opus). */
  kbps: number;
  /** Duración de cada trama de Opus (ms). Con un aparato anterior siempre 20. */
  msTrama: 20 | 40 | 60;
  /** Audio por paquete (ms): cada cuánto sale un paquete al carril. */
  msPaquete: number;
}

/** La escalera de Opus (de mejor a más ligera). El último es el suelo del códec (6 kb/s). */
export const NIVELES_OPUS: readonly NivelVoz[] = [
  { kbps: 24, msTrama: 20, msPaquete: 60 },
  { kbps: 16, msTrama: 20, msPaquete: 60 },
  { kbps: 12, msTrama: 40, msPaquete: 80 },
  { kbps: 10, msTrama: 60, msPaquete: 120 },
  { kbps: 8, msTrama: 60, msPaquete: 120 },
  { kbps: 6, msTrama: 60, msPaquete: 180 },
];

/** ADPCM y μ-law no bajan de kb/s: solo crecen los paquetes (menos escrituras). */
export const NIVELES_SIMPLES: readonly NivelVoz[] = [
  { kbps: 65, msTrama: 20, msPaquete: 60 },
  { kbps: 65, msTrama: 20, msPaquete: 120 },
  { kbps: 65, msTrama: 20, msPaquete: 160 },
];

export type FormatoVoz = "p" | "b1";

/** El nivel tal como sale de verdad: la trama se queda en 20 ms con el formato anterior. */
export function nivelEfectivo(n: NivelVoz, formato: FormatoVoz): NivelVoz {
  return formato === "b1" ? n : { ...n, msTrama: 20 };
}

/** Bytes de una trama de Opus a esos kb/s (más su byte de tabla de contenido). */
export function bytesTramaOpus(kbps: number, msTrama: number): number {
  return Math.ceil((kbps * msTrama) / 8) + 1;
}

/** Bytes de texto de un paquete de ese nivel en ese formato (sin redundancia). */
export function bytesPaqueteNivel(n: NivelVoz, formato: FormatoVoz, idLlamada = "00000000-0000-0000-0000-000000000000"): number {
  const e = nivelEfectivo(n, formato);
  const porTrama = bytesTramaOpus(e.kbps, e.msTrama);
  const tramas = Math.max(1, Math.round(e.msPaquete / e.msTrama));
  const largos = new Array<number>(tramas).fill(porTrama);
  return formato === "b1" ? bytesTextoB1(largos) : bytesTextoP(largos, idLlamada);
}

/** kb/s de texto que pone ese nivel en el carril (lo que reserva el reparto para la voz). */
export function kbpsTextoNivel(n: NivelVoz, formato: FormatoVoz, idLlamada?: string): number {
  return Math.round((bytesPaqueteNivel(n, formato, idLlamada) * 8) / n.msPaquete);
}

/**
 * Uso del carril (0–1) con ese escalón en parada y espera. El Bluetooth junta en UNA escritura todo lo que espera, así
 * que con voz a `v` bytes/ms y escrituras de `R + b/C` ms el ciclo se estabiliza en `R / (1 − v/C)`. Pedimos que ese
 * ciclo no pase de DOS paquetes (la espera de la voz queda acotada): `v/C + R/(2·paquete) ≤ 1`. `factor`: 2 con la
 * redundancia (cada paquete repite el anterior).
 */
export function usoNivel(n: NivelVoz, formato: FormatoVoz, m: ModeloEnlace, idLlamada?: string, factor = 1): number {
  const v = (factor * bytesPaqueteNivel(n, formato, idLlamada)) / n.msPaquete;
  return v / Math.max(0.05, m.bytesPorMs) + m.rMs / (2 * n.msPaquete);
}

/** ¿Cabe ese nivel dejando libre `holgura` del carril? Sin modelo: sí. */
export function cabeNivel(n: NivelVoz, formato: FormatoVoz, m: ModeloEnlace | null, holgura: number, idLlamada?: string): boolean {
  if (!m) return true;
  return usoNivel(n, formato, m, idLlamada) <= 1 - holgura;
}

/** kb/s de VOZ que caben con ese modelo con paquetes de `msPaquete` (lo que se anota como «cabe»). */
export function kbpsCabenVoz(m: ModeloEnlace | null, msPaquete: number): number | null {
  if (!m) return null;
  return Math.max(0, Math.round(8 * m.bytesPorMs * (1 - m.rMs / Math.max(1, 2 * msPaquete))));
}

/* ───────────────────────── Control ───────────────────────── */

export const CALMA_SUBIR_MS = 6_000;
export const CALMA_SUBIR_MAX_MS = 48_000;
/** Una subida que provoca atasco antes de esto cuenta como fallida (la calma siguiente se duplica). */
export const SUBIDA_FALLIDA_MS = 12_000;
/** Para subir: el de arriba cabiendo 3 pasos seguidos. */
export const PASOS_PARA_SUBIR = 3;
/** Holgura para subir (el escalón de arriba debe dejar libre este tanto del tiempo del paquete) y para quedarse. */
export const HOLGURA_SUBIR = 0.3;
export const HOLGURA_QUEDARSE = 0.05;
/** Sin cambios de escalón por su cuenta todavía (para rehacer el inicial si cambia el formato). */
export const MOTIVO_INICIO = "inicio";
/** Informe del otro: por encima de esto, se baja. */
export const PERDIDA_RX_ALTA = 3;
export const TARDE_RX_ALTA = 5;
/** Un informe más viejo que esto no cuenta. */
export const INFORME_VIGENTE_MS = 5_000;
/** Segundos con atasco en el último escalón para declarar «bajo el suelo», y limpios para salir. */
export const SUELO_ENTRAR_S = 3;
export const SUELO_SALIR_S = 3;
/** Redundancia: con pérdida informada por encima de esto y el escalón cabiendo dos veces. */
export const PERDIDA_PARA_REDUNDANCIA = 1;

export interface EntradaNivel {
  /** Modelo medido del carril (null: sin medida todavía o enlace sin cola medible). */
  modelo: ModeloEnlace | null;
  /** Mayor espera del byte más viejo del carril de voz en la ventana (ms). */
  retrasoMaxMs: number;
  /** Tramas tiradas en este lado en la ventana (cola propia o el enlace tiró lo más viejo). */
  descartes: number;
  /**
   * Lo que el carril acusó en la ventana (kb/s de texto). Con atasco es lo que el enlace da DE VERDAD ahora (el modelo
   * aún recuerda escrituras de antes de la caída): se usa para bajar de una vez al escalón que cabe.
   */
  entregadoKbps?: number | null;
  /** Lo último que informó el otro de lo que le llega (null: nada, o un aparato anterior). */
  informe: { perd: number; tarde: number; corte: boolean; edadMs: number } | null;
}

export interface CambioNivel {
  desde: number;
  hasta: number;
  motivo: "atasco" | "descartes" | "perdida-rx" | "tarde-rx" | "capacidad" | "hay-sitio" | "formato";
}

export class ControlNivelVoz {
  private i: number;
  private ultimoCambio: number;
  private ultimaSubida = -1e12;
  private calma = CALMA_SUBIR_MS;
  private atascoSeguido = 0;
  private limpioSeguido = 0;
  private suelo = false;
  private cabeArriba = 0;
  /** Motivo del último cambio (para el registro). */
  motivo: CambioNivel["motivo"] | "inicio" = "inicio";
  /** Último paso: ¿hubo señal de atasco? (para el registro) */
  atascoAhora = false;

  constructor(
    private readonly escalera: readonly NivelVoz[],
    private formato: FormatoVoz,
    ahora: number,
    inicial = 0,
    private readonly idLlamada?: string,
  ) {
    this.i = Math.max(0, Math.min(escalera.length - 1, inicial));
    this.ultimoCambio = ahora;
  }

  get indice(): number {
    return this.i;
  }

  get nivel(): NivelVoz {
    return nivelEfectivo(this.escalera[this.i], this.formato);
  }

  get formatoActual(): FormatoVoz {
    return this.formato;
  }

  get bajoSuelo(): boolean {
    return this.suelo;
  }

  get calmaMs(): number {
    return this.calma;
  }

  /** Cambia el formato (el otro anunció «b1» o resultó ser un aparato anterior): el coste de cada nivel cambia. */
  fijarFormato(f: FormatoVoz): void {
    this.formato = f;
  }

  /** ¿Toca redundancia? El otro pierde y el escalón cabe dos veces con el modelo (o no hay modelo y sobra todo). */
  redundancia(e: EntradaNivel): boolean {
    if (this.formato !== "b1" || !e.informe || e.informe.edadMs > INFORME_VIGENTE_MS || e.informe.perd < PERDIDA_PARA_REDUNDANCIA) return false;
    if (!e.modelo) return false;
    return usoNivel(this.nivel, this.formato, e.modelo, this.idLlamada, 2) <= 1 - HOLGURA_SUBIR;
  }

  /** El escalón más alto (índice más bajo) que cabe con esa holgura, desde `desde` hacia abajo. */
  private queCabe(m: ModeloEnlace | null, holgura: number, desde: number): number {
    for (let k = desde; k < this.escalera.length; k++) if (cabeNivel(nivelEfectivo(this.escalera[k], this.formato), this.formato, m, holgura, this.idLlamada)) return k;
    return this.escalera.length - 1;
  }

  /**
   * Bajada rápida entre pasos (se mira cada 20 ms): la voz lleva esperando en el carril más de `max(400 ms, 3 paquetes)`.
   * Una caída brusca de capacidad (160 → 24 kb/s) vacía el búfer del otro en menos de un segundo; esperar al paso de
   * 1 s alargaba el hueco. Baja dos escalones, como mucho una vez cada 600 ms; el paso siguiente afina con lo medido.
   */
  bajadaRapida(ahora: number, retrasoMs: number): CambioNivel | null {
    const n = this.nivel;
    const ultimo = this.escalera.length - 1;
    if (this.i >= ultimo || retrasoMs <= Math.max(400, 3 * n.msPaquete) || ahora - this.ultimoCambio < 600) return null;
    const antes = this.i;
    this.i = Math.min(ultimo, this.i + 2);
    if (ahora - this.ultimaSubida < SUBIDA_FALLIDA_MS) this.calma = Math.min(CALMA_SUBIR_MAX_MS, this.calma * 2);
    this.ultimoCambio = ahora;
    this.motivo = "atasco";
    return { desde: antes, hasta: this.i, motivo: "atasco" };
  }

  /** Un paso por segundo. Devuelve el cambio de escalón, si lo hubo. */
  paso(ahora: number, e: EntradaNivel): CambioNivel | null {
    const n = this.nivel;
    const inf = e.informe && e.informe.edadMs <= INFORME_VIGENTE_MS ? e.informe : null;
    // Lo normal en parada y espera: el paquete espera la escritura en vuelo y la suya (≈ 2 escrituras de un paquete).
    const umbralRetraso = Math.max(300, 2.5 * n.msPaquete);
    let motivo: CambioNivel["motivo"] | null = null;
    if (e.descartes > 0) motivo = "descartes";
    else if (e.retrasoMaxMs > umbralRetraso) motivo = "atasco";
    else if (inf && inf.perd > PERDIDA_RX_ALTA) motivo = "perdida-rx";
    else if (inf && inf.tarde > TARDE_RX_ALTA) motivo = "tarde-rx";
    this.atascoAhora = motivo !== null || !!inf?.corte;
    const ultimo = this.escalera.length - 1;
    // «Bajo el suelo»: en el último escalón y con atasco sostenido (o el otro ya no entiende).
    if (this.atascoAhora && this.i === ultimo) {
      this.atascoSeguido++;
      this.limpioSeguido = 0;
      if (this.atascoSeguido >= SUELO_ENTRAR_S || inf?.corte) this.suelo = true;
    } else if (!this.atascoAhora) {
      this.limpioSeguido++;
      this.atascoSeguido = 0;
      if (this.limpioSeguido >= SUELO_SALIR_S) this.suelo = false;
    }
    const antes = this.i;
    if (motivo) {
      // Atasco: al escalón que cabe con el modelo (si lo hay) y, como poco, uno más abajo.
      this.cabeArriba = 0;
      let objetivo = Math.max(this.i + 1, e.modelo ? this.queCabe(e.modelo, HOLGURA_QUEDARSE, this.i + 1) : this.i + 1);
      if (typeof e.entregadoKbps === "number" && e.entregadoKbps > 0 && (motivo === "atasco" || motivo === "descartes")) {
        let k = this.i + 1;
        while (k < this.escalera.length - 1 && kbpsTextoNivel(nivelEfectivo(this.escalera[k], this.formato), this.formato, this.idLlamada) > 0.8 * e.entregadoKbps) k++;
        objetivo = Math.max(objetivo, k);
      }
      this.i = Math.min(ultimo, objetivo);
      if (ahora - this.ultimaSubida < SUBIDA_FALLIDA_MS) this.calma = Math.min(CALMA_SUBIR_MAX_MS, this.calma * 2);
    } else if (e.modelo && !cabeNivel(n, this.formato, e.modelo, HOLGURA_QUEDARSE, this.idLlamada) && this.i < ultimo) {
      this.i = this.queCabe(e.modelo, HOLGURA_QUEDARSE, this.i + 1);
      motivo = "capacidad";
    } else if (this.i > 0 && ahora - this.ultimoCambio >= this.calma && (!inf || (inf.perd <= 1 && inf.tarde <= 2 && !inf.corte))) {
      const arriba = nivelEfectivo(this.escalera[this.i - 1], this.formato);
      // Tres pasos seguidos cabiendo: un modelo mal ajustado en un segundo (escrituras de tamaños mezclados) no basta. La
      // ocupación del carril no sirve de señal aquí: en parada y espera el acuse fijo lo tiene ocupado casi siempre.
      this.cabeArriba = cabeNivel(arriba, this.formato, e.modelo, HOLGURA_SUBIR, this.idLlamada) && e.retrasoMaxMs <= Math.max(200, 1.5 * n.msPaquete) ? this.cabeArriba + 1 : 0;
      if (this.cabeArriba >= PASOS_PARA_SUBIR) {
        this.cabeArriba = 0;
        this.i -= 1;
        motivo = "hay-sitio";
        this.suelo = false;
        this.ultimaSubida = ahora;
      }
    }
    // Tras una calma larga sin fallos, la calma vuelve poco a poco a la base.
    if (!this.atascoAhora && ahora - this.ultimaSubida > 3 * SUBIDA_FALLIDA_MS && this.calma > CALMA_SUBIR_MS) this.calma = Math.max(CALMA_SUBIR_MS, this.calma / 2);
    if (this.i === antes) return null;
    this.ultimoCambio = ahora;
    this.motivo = motivo ?? "capacidad";
    return { desde: antes, hasta: this.i, motivo: this.motivo as CambioNivel["motivo"] };
  }
}

/** El escalón con el que empezar: el más alto que cabe en lo anunciado (con el acuse típico del Bluetooth, 42 ms). */
export function nivelInicial(escalera: readonly NivelVoz[], formato: FormatoVoz, anunciadoKbps: number | null | undefined, idLlamada?: string): number {
  if (!(typeof anunciadoKbps === "number" && anunciadoKbps > 0)) return 0;
  const m: ModeloEnlace = { rMs: 42, bytesPorMs: anunciadoKbps / 8, fuente: "supuesto" };
  for (let k = 0; k < escalera.length; k++) if (cabeNivel(nivelEfectivo(escalera[k], formato), formato, m, HOLGURA_SUBIR, idLlamada)) return k;
  return escalera.length - 1;
}
