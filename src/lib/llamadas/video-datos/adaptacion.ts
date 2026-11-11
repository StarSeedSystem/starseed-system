/**
 * video-datos/adaptacion — qué calidad de vídeo cabe en el enlace ahora (LLA1108H).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Puro. Regla de oro: AUDIO > VÍDEO > todo lo demás.
 *  · El vídeo solo se manda cuando el enlace no está ocupado por la voz y su propia cola es corta (`hayHueco`):
 *    si no, el fotograma se tira (primero se tiran fotogramas, luego se baja de escalón). LLA1110C: el umbral de voz
 *    era 700 B, pero el Bluetooth cuenta la voz hasta que vuelve el acuse de cada escritura: en la Mac la cola de voz
 *    casi nunca bajaba de 700 B y se tiraban 274 de cada 307 fotogramas. La voz ya sale SIEMPRE antes que el vídeo
 *    (la bomba del enlace la atiende primero); aquí solo se frena cuando el enlace está ocupado de verdad.
 *  · Con presión (cola ocupada o fragmentos descartados) en los últimos 2 s se baja UN escalón (resolución y
 *    fps a la vez, por la escalera `PERFILES_VIDEO`); tras 6 s sin presión y con holgura se sube uno.
 *  · El techo lo fija la capacidad del enlace: la mitad de lo que mide (o anuncia) menos lo que ya come la voz.
 * LLA1111B: esto es ahora solo el camino de un enlace SIN contadores del carril (`bytesEntrados`). Con ellos (el
 * Bluetooth) el reparto lo lleva `reparto.ts`: voz y vídeo en el mismo carril, tasa medida y pausa con histéresis. El
 * hueco de «todo o nada» (`UMBRAL_VOZ_HUECO_BYTES`) dejaba el vídeo parado mientras el micro estaba abierto.
 */
import { KBPS_VOZ_RESERVADOS, PERFILES_VIDEO, type PerfilVideo } from "./tipos";

/** Bytes de la cola propia del vídeo a partir de los cuales no se mete otro fotograma. */
export const UMBRAL_COLA_VIDEO_BYTES = 4 * 1024;
/**
 * Más voz que esto en cola y el vídeo espera (LLA1110C: igual que «ocupado» del Bluetooth, 2 KiB ≈ 250 ms de voz;
 * antes 700 B, que con el acuse por escritura de la Mac cerraba el hueco casi siempre).
 */
export const UMBRAL_VOZ_HUECO_BYTES = 2048;
export const VENTANA_PRESION_MS = 2000;
export const CALMA_PARA_SUBIR_MS = 6000;
/** Qué parte de la capacidad del enlace se le deja al vídeo (el resto es para la voz y lo demás). */
export const FRACCION_VIDEO = 0.5;
/** Sin medida del enlace se asume el orden de magnitud del Bluetooth LE entre móvil y ordenador. */
export const KBPS_ENLACE_SUPUESTO = 160;

export interface EstadoColas {
  /** Bytes de voz esperando salir por el enlace. */
  vozBytes: number;
  /** Bytes de vídeo esperando salir. */
  videoBytes: number;
  /** El enlace dice «ocupado» (contrapresión de la voz). */
  ocupado: boolean;
}

/** LLA1110C: por qué no cabe ahora un fotograma (null: sí cabe). */
export function motivoSinHueco(c: EstadoColas): "enlace-ocupado" | "cola-video" | null {
  if (c.ocupado || c.vozBytes >= UMBRAL_VOZ_HUECO_BYTES) return "enlace-ocupado";
  if (c.videoBytes >= UMBRAL_COLA_VIDEO_BYTES) return "cola-video";
  return null;
}

/** ¿Cabe ahora un fotograma de vídeo sin estorbar a la voz? */
export function hayHueco(c: EstadoColas): boolean {
  return motivoSinHueco(c) === null;
}

/** Presupuesto de vídeo (kbps) para un enlace de esa capacidad. */
export function presupuestoVideoKbps(capacidadKbps: number | null | undefined): number {
  const cap = typeof capacidadKbps === "number" && Number.isFinite(capacidadKbps) && capacidadKbps > 0 ? capacidadKbps : KBPS_ENLACE_SUPUESTO;
  return Math.max(0, cap * FRACCION_VIDEO - KBPS_VOZ_RESERVADOS);
}

/** El escalón más alto cuya tasa cabe en el presupuesto (como mínimo el 0: el suelo siempre se intenta). */
export function techoDePerfiles(presupuestoKbps: number, escalera: readonly PerfilVideo[] = PERFILES_VIDEO): number {
  let t = 0;
  for (let i = 0; i < escalera.length; i++) if (escalera[i].kbps <= presupuestoKbps) t = i;
  return t;
}

export class ControlAdaptativo {
  private idx: number;
  private presiones: number[] = [];
  private ultimoCambio = 0;
  private bytesVentana = 0;
  private desdeVentana = 0;
  private kbpsMedidos = 0;
  /** Fotogramas tirados por falta de hueco (para el registro). */
  omitidos = 0;
  private readonly escalera: readonly PerfilVideo[];

  constructor(escalera: readonly PerfilVideo[] = PERFILES_VIDEO, inicial = 0) {
    this.escalera = escalera;
    this.idx = Math.max(0, Math.min(escalera.length - 1, inicial));
  }

  get indice(): number {
    return this.idx;
  }

  /** LLA1111B: el reparto elige el escalón (devuelve true si cambió). */
  fijarIndice(i: number): boolean {
    const n = Math.max(0, Math.min(this.escalera.length - 1, Math.floor(i)));
    if (n === this.idx) return false;
    this.idx = n;
    return true;
  }

  perfil(): PerfilVideo {
    return this.escalera[this.idx];
  }

  get medidoKbps(): number {
    return this.kbpsMedidos;
  }

  /** Cuenta un aviso de presión (fotograma tirado, fragmento descartado por el enlace…). */
  registrarPresion(ahora: number): void {
    this.presiones.push(ahora);
    this.omitidos++;
    if (this.presiones.length > 32) this.presiones.splice(0, this.presiones.length - 32);
  }

  /** Cuenta bytes de vídeo enviados (para medir lo que sale de verdad). */
  registrarSalida(bytes: number, ahora: number): void {
    if (!this.desdeVentana) this.desdeVentana = ahora;
    this.bytesVentana += bytes;
  }

  /** ¿Se pasaría de presupuesto metiendo `bytes` más en el último segundo? Los fotogramas CLAVE no se frenan. */
  pasaDePresupuesto(bytes: number, ahora: number): boolean {
    const ms = this.desdeVentana ? Math.max(1000, ahora - this.desdeVentana) : 1000;
    const kbps = ((this.bytesVentana + bytes) * 8) / ms;
    return kbps > this.perfil().kbps * 1.6;
  }

  /**
   * Un tic por segundo. Devuelve el perfil nuevo si cambió (hay que reconfigurar el códec y pedir un clave).
   * `capacidadKbps`: lo que mide o anuncia el enlace (null: no se sabe).
   */
  tic(ahora: number, capacidadKbps: number | null): PerfilVideo | null {
    if (!this.ultimoCambio) this.ultimoCambio = ahora;
    if (this.desdeVentana) {
      const ms = Math.max(1, ahora - this.desdeVentana);
      this.kbpsMedidos = Math.round((this.bytesVentana * 8) / ms);
      this.bytesVentana = 0;
      this.desdeVentana = ahora;
    }
    this.presiones = this.presiones.filter((t) => ahora - t <= VENTANA_PRESION_MS);
    const techo = techoDePerfiles(presupuestoVideoKbps(capacidadKbps), this.escalera);
    const antes = this.idx;
    if (this.presiones.length >= 2) {
      // Presión sostenida: baja un escalón y deja pasar la ventana antes de volver a juzgar.
      this.idx = Math.max(0, this.idx - 1);
      this.presiones = [];
      this.ultimoCambio = ahora;
    } else if (this.idx > techo) {
      this.idx = techo;
      this.ultimoCambio = ahora;
    } else if (this.presiones.length === 0 && this.idx < techo && ahora - this.ultimoCambio >= CALMA_PARA_SUBIR_MS) {
      this.idx += 1;
      this.ultimoCambio = ahora;
    }
    return this.idx !== antes ? this.perfil() : null;
  }
}
