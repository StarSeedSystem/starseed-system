/**
 * voz-datos/sesion — una conversación de voz por enlace de datos con UN par (LLA1108E).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Orquesta, sin tocar el navegador (todo se inyecta, así se prueba con enlaces en memoria):
 *   micro → tramas de 20 ms → códec → cola con contrapresión → paquetes de 1–8 tramas → enlace
 *   enlace → paquetes → códec → búfer de fluctuación (60–200 ms) → reproducción
 * El cifrado lo pone ya el enlace (sesión por enlace, CIF1108A): aquí no hay segunda capa.
 * Contrapresión: si el enlace está ocupado, las tramas esperan en la cola; si la cola pasa de 240 ms de
 * audio, se tira lo MÁS VIEJO (nunca segundos de retraso). La voz va en su cola propia del enlace, así no
 * le quita turno al chat ni a los archivos (ver `bluetooth-directo-motor.ts`, cola «voz»).
 * Contrato: architecture/llamadas-telefonia.md § «Voz por enlace de datos (sin red IP)».
 */
import {
  CODECS_VOZ,
  codificarTrama,
  decodificarTrama,
  elegirCodecComun,
  MS_TRAMA,
  MUESTRAS_TRAMA,
  type CodecVoz,
} from "./codec";
import { ColaSalidaVoz, agruparConsecutivas, unidadesDe, type TramaSalida } from "./cola-salida";
import { BufferJitter } from "./jitter";
import { armarControl, armarPaquete, armarPaqueteB, etiquetaLlamada, FORMATOS_VOZ, leerControl, leerPaquete, leerPaqueteB, PREFIJO_VOZ_B, type ControlVoz, type TramaVoz } from "./paquete";
import type { CalidadVoz } from "./decision";
// VOZ1111J: la voz sigue al enlace (escalera, medida del carril, informe del otro, reserva para el vídeo).
import { bytesPaqueteNivel, ControlNivelVoz, kbpsCabenVoz, kbpsTextoNivel, nivelInicial, NIVELES_OPUS, NIVELES_SIMPLES, type FormatoVoz, type NivelVoz } from "./niveles";
import { fijarReservaVoz } from "./reserva";
import { MedidorEnlace, type ResumenEnlace } from "@/lib/llamadas/video-datos/reparto";

export interface TransporteVoz {
  /** Encola un texto `voz.*` en el enlace. «descartado»: el enlace tiró lo más viejo; «cerrado»: ya no hay enlace. */
  enviar(texto: string): "ok" | "descartado" | "cerrado";
  /** ¿El enlace tiene ya voz en espera de salir? (contrapresión: mientras sea true, la cola de la sesión retiene.) */
  ocupado(): boolean;
  alRecibir(cb: (texto: string) => void): () => void;
  abierto(): boolean;
  info(): { tipo: string; cifrada: boolean };
  /* (LLA1108H) Opcionales para el vídeo ligero: cola propia por detrás de la voz, colas medidas y capacidad del enlace. */
  enviarVideo?(texto: string): "ok" | "descartado" | "cerrado";
  colaVozBytes?(): number;
  colaVideoBytes?(): number;
  capacidadKbps?(): number | null;
  mtu?(): number | null;
  /** VID1110A: tope de la cola de vídeo del enlace (el Bluetooth tira lo más viejo al pasarlo). */
  topeColaVideoBytes?(): number | null;
  /** (LLA1111B) Bytes que entraron en el carril de voz (acumulado): con `colaVozBytes` dan lo que el enlace acusa. */
  bytesEntrados?(): number;
  /** (VOZ1111J) ¿Entró vídeo en el carril de la voz hace poco? (su ventana no cuenta como voz atascada) */
  videoEnCarril?(): boolean;
}

export interface CodificadorVoz {
  /** `q`: unidad de 20 ms de la captura (VOZ1111J); sin ella, el codificador numera solo. */
  codificar(pcm: Int16Array, q?: number): void;
  /** `meta`: dónde empieza la trama (unidad de 20 ms) y cuántas unidades dura (Opus de 40/60 ms). */
  alSalir(cb: (bytes: Uint8Array, meta?: { q: number; n: number }) => void): void;
  /** (VOZ1111J) Cambia kb/s y duración de trama (solo Opus). */
  ajustar?(n: { kbps: number; msTrama: number }): void;
  cerrar(): void;
}
export interface DecodificadorVoz {
  decodificar(bytes: Uint8Array, q: number): void;
  alPcm(cb: (pcm: Int16Array, q: number) => void): void;
  cerrar(): void;
}
export interface FabricaCodecs {
  soportados(): CodecVoz[];
  /** (VOZ1111J) ¿Opus admite tramas de 40/60 ms aquí? (si no, la escalera se queda en 20 ms). */
  tramaLargaOpus?(): boolean;
  codificador(c: CodecVoz): CodificadorVoz | null;
  decodificador(c: CodecVoz): DecodificadorVoz | null;
}
export interface AudioVoz {
  /** Empieza a capturar el micro; `alTrama` recibe tramas de 20 ms (320 muestras, 16 kHz, mono). */
  iniciar(alTrama: (pcm: Int16Array) => void): Promise<boolean>;
  reproducir(pcm: Int16Array): void;
  detener(): void;
}
export interface RelojVoz {
  ahora(): number;
  cada(fn: () => void, ms: number): () => void;
}

/** Códecs sin asincronía (ADPCM y μ-law). Opus lo añade `audio-web.ts` donde el navegador lo ofrezca. */
export function fabricaCodecsSimples(): FabricaCodecs {
  return {
    soportados: () => ["adpcm", "mulaw"],
    codificador(c) {
      if (c === "opus") return null;
      let cb: (b: Uint8Array) => void = () => undefined;
      let cbm: (b: Uint8Array, meta?: { q: number; n: number }) => void = () => undefined;
      return {
        codificar: (pcm, q) => (typeof q === "number" ? cbm(codificarTrama(c, pcm), { q, n: 1 }) : cb(codificarTrama(c, pcm))),
        alSalir: (f) => {
          cb = f;
          cbm = f;
        },
        cerrar: () => undefined,
      };
    },
    decodificador(c) {
      if (c === "opus") return null;
      let cb: (p: Int16Array, q: number) => void = () => undefined;
      return {
        decodificar: (b, q) => cb(decodificarTrama(c, b, MUESTRAS_TRAMA), q),
        alPcm: (f) => {
          cb = f;
        },
        cerrar: () => undefined,
      };
    },
  };
}

export interface DepsSesionVoz {
  idLlamada: string;
  transporte: TransporteVoz;
  audio: AudioVoz;
  codecs: FabricaCodecs;
  reloj: RelojVoz;
  /** ms de audio por paquete (por defecto 60 = 3 tramas). Con enlaces lentos sube a 100–120. */
  msLote?: number;
  /** Para anotar hitos en el registro del enlace. */
  anotar?: (hito: string) => void;
  /** (VOZ1111J) Solo pruebas: no anunciar el formato «b1» (se comporta como un aparato 0.5.1-prueba.36). */
  comoAnterior?: boolean;
  /** (VOZ1111J) Silencio declarado (DTX) con un otro que hable «b1». Por defecto sí. */
  dtx?: boolean;
}

/** (VOZ1111J) El escalón en uso, para la superficie y el registro. */
export interface NivelVozEstado {
  indice: number;
  kbps: number;
  msTrama: number;
  msPaquete: number;
  /** kb/s de texto que pone en el carril. */
  kbpsTexto: number;
  formato: FormatoVoz;
}

/** (VOZ1111J) Textos del aviso «bajo el suelo» (contienen «no alcanza para la voz», que busca el banco). */
export const AVISO_SIN_VOZ_RX = "La señal no alcanza para la voz: en silencio hasta que mejore, vuelve sola";
export const AVISO_SIN_VOZ_TX = "La señal no alcanza para la voz: al otro le llega a trozos; vuelve sola al mejorar";

export interface EstadoVozDatos {
  activa: boolean;
  /** Ya llegó audio del otro (la llamada «suena»). */
  recibiendo: boolean;
  codecTx: CodecVoz;
  codecRx: CodecVoz | null;
  rttMs: number | null;
  perdidaPct: number;
  jitterObjetivoMs: number;
  enviadas: number;
  recibidas: number;
  descartadas: number;
  mudo: boolean;
  medio: { tipo: string; cifrada: boolean };
  /** Epoch ms del último paquete de audio recibido (0: ninguno). */
  ultimoRxEn: number;
  fin: string | null;
  /** (VOZ1111J) Escalón de la voz que mando. */
  nivel?: NivelVozEstado;
  /** (VOZ1111J) Lo que me llega no se entiende: no reproduzco fragmentos (silencio) y lo digo. */
  sinVozRx?: boolean;
  /** (VOZ1111J) Lo que mando no cabe ni en el último escalón (o el otro me dice que no me entiende). */
  bajoSueloTx?: boolean;
  /** (VOZ1111J) El aviso en palabras (null: ninguno). */
  aviso?: string | null;
}

const MAX_MIOS: CodecVoz[] = [...CODECS_VOZ];

/** (VOZ1111J) Silencio para el DTX: por debajo de este nivel (≈ −48 dBFS) durante `COLA_SILENCIO_TRAMAS` tramas seguidas. */
export const UMBRAL_SILENCIO_RMS = 130;
export const COLA_SILENCIO_TRAMAS = 10;
/** (VOZ1111J) Cada cuánto se anota el estado de la voz en el registro del enlace, y se manda el informe al otro. */
export const REGISTRO_CADA_MS = 5_000;
export const INFORME_CADA_MS = 2_000;
/** (VOZ1111J) «No se entiende»: ventanas de 1 s con más de esta fracción de audio inventado (ocultación, huecos). */
export const CORTE_ENTRAR = 0.25;
export const CORTE_SALIR = 0.08;
export const CORTE_VENTANAS = 3;
/** Para salir basta con las 2 últimas ventanas limpias: callar más de lo justo también es un hueco. */
export const CORTE_VENTANAS_SALIR = 2;

export class SesionVozDatos {
  private readonly d: DepsSesionVoz;
  private readonly cola: ColaSalidaVoz;
  private readonly jitter = new BufferJitter({ msTrama: MS_TRAMA, maxMs: 400 });
  private readonly soportados: CodecVoz[];
  private codecTx: CodecVoz = "adpcm";
  private codecRx: CodecVoz | null = null;
  private codificador: CodificadorVoz | null = null;
  private readonly decodificadores = new Map<CodecVoz, DecodificadorVoz>();
  private seqTx = 0;
  /** (VOZ1111J) Unidad de 20 ms de la captura (avanza solo con el micro abierto: un silencio del micro no es pérdida). */
  private qCaptura = 0;
  private recibidas = 0;
  private enviadas = 0;
  private rttMs: number | null = null;
  private mudo = false;
  private activa = false;
  private ultimoRxEn = 0;
  private finTexto: string | null = null;
  private holaRecibido = false;
  private holasEnviadas = 0;
  /** (LLA1108H) Último aviso «me llega un códec que no sé decodificar» (ms), para no repetirlo en cada paquete. */
  private ultimoAvisoSinDecodificador = -1e9;
  private txAnotado: CodecVoz | null = null;
  private bajas: Array<() => void> = [];
  private readonly oyentes = new Set<(e: EstadoVozDatos) => void>();
  /* ── VOZ1111J ── */
  private formato: FormatoVoz = "p";
  private readonly etiqueta: number;
  private control: ControlNivelVoz | null = null;
  private readonly medidor: MedidorEnlace | null;
  private ultimoResumen: ResumenEnlace | null = null;
  private descartesVentana = 0;
  private descartesAntes = 0;
  private informe: { perd: number; tarde: number; corte: boolean; kbps: number; en: number } | null = null;
  private silenciosas = 0;
  /** Unidades de captura que fueron silencio (para el DTX), las más recientes. */
  private readonly unidadesSilencio = new Set<number>();
  private ultimoPaqueteTx: TramaVoz | null = null;
  private redundanciaOn = false;
  private paquetesTx = 0;
  private paquetesRx = 0;
  private bytesRxVentana = 0;
  private ultimoRegistro = 0;
  private ultimoInforme = 0;
  private statsAntes = { recibidas: 0, perdidas: 0, tardias: 0, ocultadas: 0 };
  private ventanasMalas: number[] = [];
  private sinVozRx = false;
  private ultimaFraccionMala = 0;
  private recientes = new Set<number>();
  private recientesOrden: number[] = [];

  constructor(deps: DepsSesionVoz) {
    this.d = deps;
    this.cola = new ColaSalidaVoz({ maxMs: 240, msTrama: MS_TRAMA });
    this.soportados = MAX_MIOS.filter((c) => deps.codecs.soportados().includes(c));
    if (!this.soportados.length) this.soportados.push("adpcm");
    this.etiqueta = etiquetaLlamada(deps.idLlamada);
    // VOZ1111J: el carril se mide solo si el enlace cuenta lo que entra (el Bluetooth). Un canal WebRTC local no.
    this.medidor = typeof deps.transporte.bytesEntrados === "function" && typeof deps.transporte.colaVozBytes === "function" ? new MedidorEnlace(this.bytesPorMsAnunciados() ?? undefined) : null;
  }

  private bytesPorMsAnunciados(): number | null {
    try {
      const k = this.d.transporte.capacidadKbps?.() ?? null;
      return typeof k === "number" && k > 0 ? k / 8 : null;
    } catch {
      return null;
    }
  }

  suscribir(cb: (e: EstadoVozDatos) => void): () => void {
    this.oyentes.add(cb);
    return () => {
      this.oyentes.delete(cb);
    };
  }

  private avisar(): void {
    const e = this.estado();
    for (const f of Array.from(this.oyentes)) {
      try {
        f(e);
      } catch {
        /* un oyente roto no tumba la voz */
      }
    }
  }

  /** (VOZ1111J) El escalón en uso (null antes de arrancar). */
  private nivelEstado(): NivelVozEstado | undefined {
    if (!this.control) return undefined;
    const n = this.control.nivel;
    return { indice: this.control.indice, kbps: n.kbps, msTrama: n.msTrama, msPaquete: n.msPaquete, kbpsTexto: kbpsTextoNivel(n, this.formato, this.d.idLlamada), formato: this.formato };
  }

  private bajoSueloTx(): boolean {
    return !!this.control?.bajoSuelo || (!!this.informe && this.informe.corte && this.d.reloj.ahora() - this.informe.en < 5000);
  }

  private aviso(): string | null {
    if (this.sinVozRx) return AVISO_SIN_VOZ_RX;
    if (this.bajoSueloTx() && !this.mudo) return AVISO_SIN_VOZ_TX;
    return null;
  }

  estado(): EstadoVozDatos {
    return {
      activa: this.activa,
      recibiendo: this.recibidas > 0,
      codecTx: this.codecTx,
      codecRx: this.codecRx,
      rttMs: this.rttMs,
      perdidaPct: this.jitter.perdidaPct(),
      jitterObjetivoMs: this.jitter.estadisticas().objetivoMs,
      enviadas: this.enviadas,
      recibidas: this.recibidas,
      descartadas: this.cola.descartadas,
      mudo: this.mudo,
      medio: this.d.transporte.info(),
      ultimoRxEn: this.ultimoRxEn,
      fin: this.finTexto,
      nivel: this.nivelEstado(),
      sinVozRx: this.sinVozRx,
      bajoSueloTx: this.bajoSueloTx(),
      aviso: this.aviso(),
    };
  }

  calidad(): CalidadVoz {
    const e = this.estado();
    return {
      rttMs: e.rttMs,
      perdidaPct: e.perdidaPct,
      codec: e.codecRx ?? e.codecTx,
      jitterMs: e.jitterObjetivoMs,
      ...(e.nivel && this.codecTx === "opus" ? { kbps: e.nivel.kbps } : {}),
      aviso: e.aviso ?? null,
    };
  }

  private escalera(): readonly NivelVoz[] {
    if (this.codecTx !== "opus") return NIVELES_SIMPLES;
    const larga = this.d.codecs.tramaLargaOpus?.() ?? false;
    return larga ? NIVELES_OPUS : NIVELES_OPUS.map((n) => ({ ...n, msTrama: 20 as const }));
  }

  /** (VOZ1111J) (Re)crea el control de escalón para el códec y el formato actuales, empezando por lo que cabe en lo anunciado. */
  private rehacerControl(): void {
    const esc = this.escalera();
    // Mientras el escalón no se haya movido por lo medido, se vuelve a elegir por lo anunciado (cambió el códec o el formato).
    const inicial = this.control && this.control.motivo !== "inicio" ? Math.min(this.control.indice, esc.length - 1) : nivelInicial(esc, this.formato, this.d.transporte.capacidadKbps?.() ?? null, this.d.idLlamada);
    this.control = new ControlNivelVoz(esc, this.formato, this.d.reloj.ahora(), inicial, this.d.idLlamada);
    this.aplicarNivel();
  }

  private aplicarNivel(): void {
    if (!this.control) return;
    const n = this.control.nivel;
    this.codificador?.ajustar?.({ kbps: n.kbps, msTrama: n.msTrama });
    this.cola.fijarMaxMs(Math.max(240, n.msPaquete + 100));
    fijarReservaVoz(this, this.activa ? kbpsTextoNivel(n, this.formato, this.d.idLlamada) : null);
  }

  private elegirCodecTx(suyos: CodecVoz[] | null): void {
    const c = elegirCodecComun(this.soportados, suyos);
    if (!(c === this.codecTx && this.codificador)) {
      this.codificador?.cerrar();
      // VOZ1111J: lo que espera en cola es del códec anterior; salir con la etiqueta del nuevo lo haría ruido al otro lado.
      if (this.codificador) this.cola.vaciar();
      this.codificador = this.d.codecs.codificador(c) ?? this.d.codecs.codificador("adpcm");
      this.codecTx = this.codificador ? c : "adpcm";
      this.codificador?.alSalir((bytes, meta) => {
        if (!this.activa) return;
        // VOZ1111J: con la marca de la captura cada trama sabe su sitio (y cuántas unidades de 20 ms dura).
        const q = meta ? meta.q : this.seqTx;
        const n = meta ? meta.n : 1;
        this.seqTx = Math.max(this.seqTx, q + n);
        this.encolarTrama({ q, n, ts: this.d.reloj.ahora(), bytes });
      });
      this.rehacerControl();
    }
    // (LLA1108H) Se anota la elección FINAL por sentido en cuanto se conoce y cada vez que cambia: «tx» es lo que mando, «rx» lo que me llega.
    if (suyos && this.txAnotado !== this.codecTx) {
      this.txAnotado = this.codecTx;
      this.d.anotar?.(`voz-datos tx=${this.codecTx} (comunes: ${this.soportados.filter((x) => suyos.includes(x)).join(",") || "ninguno"})`);
    }
  }

  /** (VOZ1111J) Una trama codificada a la cola; si todas sus unidades eran silencio y el otro habla «b1», va como silencio. */
  private encolarTrama(t: TramaSalida): void {
    let silencio = false;
    if (this.formato === "b1" && this.d.dtx !== false) {
      silencio = true;
      for (let k = 0; k < unidadesDe(t); k++) if (!this.unidadesSilencio.has(t.q + k)) silencio = false;
    }
    this.cola.encolar(silencio ? { q: t.q, n: t.n, ts: t.ts, bytes: new Uint8Array(0), silencio: true } : t);
  }

  private mandarControl(c: Omit<ControlVoz, "s">): void {
    this.d.transporte.enviar(armarControl({ s: this.d.idLlamada, ...c }));
  }

  /** Abre el micro y arranca. Devuelve false si no se pudo capturar. */
  async iniciar(): Promise<boolean> {
    if (this.activa) return true;
    this.elegirCodecTx(null);
    const ok = await this.d.audio.iniciar((pcm) => {
      if (this.mudo || !this.activa) return;
      const q = this.qCaptura++;
      this.marcarSilencio(q, pcm);
      this.codificador?.codificar(pcm, q);
    });
    if (!ok) {
      this.d.anotar?.("voz-datos sin-micro");
      return false;
    }
    this.activa = true;
    this.aplicarNivel();
    this.bajas.push(this.d.transporte.alRecibir((t) => this.alTexto(t)));
    // VOZ1111J: se mira cada 20 ms (medida del carril) y sale un paquete cuando hay audio de un paquete o el más viejo
    // ya esperó ese tanto. Antes salía cada `msLote` fijo.
    this.bajas.push(this.d.reloj.cada(() => this.bombear(), MS_TRAMA));
    this.bajas.push(this.d.reloj.cada(() => this.reproducirTrama(), MS_TRAMA));
    this.bajas.push(this.d.reloj.cada(() => this.pasoSegundo(), 1000));
    this.bajas.push(
      this.d.reloj.cada(() => {
        // Saludo hasta oír al otro (los primeros pueden perderse); luego, ping para medir la latencia.
        if (!this.holaRecibido && this.holasEnviadas < 8) this.saludar();
        else this.mandarControl({ k: "ping", ts: this.d.reloj.ahora() });
      }, 1500),
    );
    this.saludar();
    this.d.anotar?.(`voz-datos iniciada codec=${this.codecTx}`);
    this.avisar();
    return true;
  }

  /** (VOZ1111J) Lleva la cuenta de qué unidades de captura son silencio (con 200 ms de cola antes de declararlo). */
  private marcarSilencio(q: number, pcm: Int16Array): void {
    let s = 0;
    for (let i = 0; i < pcm.length; i++) s += pcm[i] * pcm[i];
    const rms = Math.sqrt(s / Math.max(1, pcm.length));
    this.silenciosas = rms < UMBRAL_SILENCIO_RMS ? this.silenciosas + 1 : 0;
    if (this.silenciosas > COLA_SILENCIO_TRAMAS) this.unidadesSilencio.add(q);
    if (this.unidadesSilencio.size > 400) {
      const corte = q - 300;
      for (const u of this.unidadesSilencio) if (u < corte) this.unidadesSilencio.delete(u);
    }
  }

  private saludar(): void {
    this.holasEnviadas++;
    this.mandarControl({ k: "hola", codecs: this.soportados, ...(this.d.comoAnterior ? {} : { fmt: [...FORMATOS_VOZ] }) });
  }

  silenciar(mudo: boolean): void {
    this.mudo = mudo;
    this.avisar();
  }

  /** Para todo y avisa al otro. Idempotente. */
  detener(motivo = "colgada"): void {
    if (!this.activa && !this.bajas.length) return;
    if (this.activa) this.mandarControl({ k: "fin", m: motivo });
    this.activa = false;
    fijarReservaVoz(this, null);
    for (const b of this.bajas.splice(0)) {
      try {
        b();
      } catch {
        /* noop */
      }
    }
    try {
      this.d.audio.detener();
    } catch {
      /* noop */
    }
    this.codificador?.cerrar();
    this.codificador = null;
    for (const dec of this.decodificadores.values()) dec.cerrar();
    this.decodificadores.clear();
    this.cola.vaciar();
    this.avisar();
  }

  /** Salida: cada 20 ms; un paquete cuando hay audio para uno (o el más viejo ya esperó eso) y el enlace no está ocupado. */
  private bombear(): void {
    if (!this.activa) return;
    const ahora = this.d.reloj.ahora();
    this.medirCarril(ahora);
    if (!this.d.transporte.abierto()) return;
    // VOZ1111J: atasco grave entre pasos → baja ya (ver `bajadaRapida`).
    if (this.medidor && this.control && !this.mudo) {
      const c = this.control.bajadaRapida(ahora, this.medidor.retrasoMs);
      if (c) {
        this.aplicarNivel();
        const n = this.control.nivel;
        this.d.anotar?.(`voz-datos nivel ${c.desde}→${c.hasta} motivo=atasco-rapido opus=${n.kbps}kbps trama=${n.msTrama}ms paq=${n.msPaquete}ms espera=${Math.round(this.medidor.retrasoMs)}ms`);
        this.avisar();
      }
    }
    const n = this.control?.nivel ?? { msPaquete: 60, msTrama: 20 as const, kbps: 24 };
    const unidadesPaquete = Math.max(1, Math.round(n.msPaquete / MS_TRAMA));
    const items = this.cola.mirar();
    if (!items.length) return;
    const listo = this.cola.unidadesEnCola >= unidadesPaquete || ahora - items[0].ts >= n.msPaquete;
    if (!listo) return;
    if (this.d.transporte.ocupado()) return; // contrapresión: se queda en la cola (y cae lo más viejo)
    // VOZ1111J: con un carril estrecho, 2 KiB en el enlace son segundos de voz vieja. Sin vídeo en el carril, como mucho
    // dos paquetes de este escalón esperando: lo demás espera aquí, donde cae lo más viejo y se cuenta. Con vídeo manda
    // el reparto de LLA1111B (su ventana ya acota lo que va delante de la voz): retener aquí la dejaría detrás del vídeo.
    if (this.d.transporte.colaVozBytes && !this.d.transporte.videoEnCarril?.()) {
      const paquete = this.control ? bytesPaqueteNivel(this.control.nivel, this.formato, this.d.idLlamada) : 400;
      if (this.d.transporte.colaVozBytes() > Math.max(400, 2 * paquete)) return;
    }
    // Tramas enteras hasta llenar el paquete.
    let u = 0;
    let k = 0;
    while (k < items.length && (k === 0 || u + unidadesDe(items[k]) <= unidadesPaquete)) {
      u += unidadesDe(items[k]);
      k++;
    }
    const tramas = this.cola.sacar(k);
    if (this.formato === "b1") this.mandarB(tramas);
    else this.mandarP(tramas.filter((t) => !t.silencio));
  }

  private registrarEnvio(r: "ok" | "descartado" | "cerrado", tramas: number): void {
    if (r === "descartado") this.descartesVentana++;
    this.enviadas += tramas;
    this.paquetesTx++;
  }

  /** El formato de antes (aparato 0.5.1-prueba.36): tramas de 20 ms consecutivas. */
  private mandarP(tramas: TramaSalida[]): void {
    for (const g of agruparConsecutivas(tramas)) {
      const texto = armarPaquete({ s: this.d.idLlamada, q: g[0].q, ts: g[0].ts, c: this.codecTx, f: MS_TRAMA, tramas: g.map((t) => t.bytes) });
      this.registrarEnvio(this.d.transporte.enviar(texto), g.length);
    }
  }

  /** (VOZ1111J) «b1»: cubre de la primera a la última unidad; lo que no lleva trama es silencio declarado. */
  private mandarB(tramas: TramaSalida[]): void {
    if (!tramas.length) return;
    tramas.sort((a, b) => a.q - b.q);
    // Cobertura contigua por paquete; si hay un salto dentro (se tiró algo), se parte.
    const grupos: TramaSalida[][] = [];
    for (const t of tramas) {
      const g = grupos[grupos.length - 1];
      const fin = g ? g[g.length - 1].q + unidadesDe(g[g.length - 1]) : -1;
      if (g && t.q <= fin && t.q - g[0].q < 250) g.push(t);
      else grupos.push([t]);
    }
    for (const g of grupos) {
      const q0 = g[0].q;
      const audio: TramaVoz[] = [];
      let cursor = q0;
      for (const t of g) {
        if (t.silencio) {
          cursor = Math.max(cursor, t.q + unidadesDe(t));
          continue;
        }
        // Un solape (el codificador viejo vació su última trama tras un cambio de escalón): se recorta la anterior.
        const prev = audio[audio.length - 1];
        if (prev && t.q < prev.q + prev.n) {
          if (t.q - prev.q >= 1) prev.n = t.q - prev.q;
          else continue;
        }
        if (t.q < cursor && !prev) continue;
        audio.push({ q: t.q, n: unidadesDe(t), bytes: t.bytes });
        cursor = t.q + unidadesDe(t);
      }
      const cubre = Math.max(1, cursor - q0);
      const red = this.redundanciaOn && this.ultimoPaqueteTx && this.ultimoPaqueteTx.q < q0 && q0 - this.ultimoPaqueteTx.q <= 255 ? [this.ultimoPaqueteTx] : [];
      const texto = armarPaqueteB({ etiqueta: this.etiqueta, q: q0, cubre, ts: g[0].ts, c: this.codecTx, tramas: audio, red }) ?? armarPaqueteB({ etiqueta: this.etiqueta, q: q0, cubre, ts: g[0].ts, c: this.codecTx, tramas: audio, red: [] });
      if (!texto) continue;
      this.registrarEnvio(this.d.transporte.enviar(texto), audio.length);
      if (audio.length) this.ultimoPaqueteTx = audio[audio.length - 1];
    }
  }

  /* ───────────────────────── VOZ1111J: medida, escalón, informe y registro ───────────────────────── */

  private medirCarril(ahora: number): void {
    if (!this.medidor) return;
    try {
      this.medidor.muestra(ahora, { cola: this.d.transporte.colaVozBytes!(), entrados: this.d.transporte.bytesEntrados!() });
    } catch {
      /* un enlace que no mide */
    }
  }

  /** Una vez por segundo: cierra la medida del carril, mueve el escalón, mira lo que me llega y lo cuenta. */
  private pasoSegundo(): void {
    if (!this.activa || !this.control) return;
    const ahora = this.d.reloj.ahora();
    const r = this.medidor ? this.medidor.cerrarVentana(ahora) : null;
    this.ultimoResumen = r;
    const desc = this.cola.descartadas - this.descartesAntes + this.descartesVentana;
    this.descartesAntes = this.cola.descartadas;
    this.descartesVentana = 0;
    const inf = this.informe ? { perd: this.informe.perd, tarde: this.informe.tarde, corte: this.informe.corte, edadMs: ahora - this.informe.en } : null;
    const entrada = { modelo: r?.modelo ?? null, retrasoMaxMs: r?.retrasoMaxMs ?? 0, descartes: this.mudo ? 0 : desc, informe: inf, entregadoKbps: r ? r.entregadoKbps : null };
    const sueloAntes = this.control.bajoSuelo;
    const cambio = this.mudo ? null : this.control.paso(ahora, entrada);
    this.redundanciaOn = this.control.redundancia(entrada);
    if (cambio) {
      this.aplicarNivel();
      const n = this.control.nivel;
      this.d.anotar?.(
        `voz-datos nivel ${cambio.desde}→${cambio.hasta} motivo=${cambio.motivo} opus=${n.kbps}kbps trama=${n.msTrama}ms paq=${n.msPaquete}ms texto≈${kbpsTextoNivel(n, this.formato, this.d.idLlamada)}kbps cabe=${kbpsCabenVoz(r?.modelo ?? null, n.msPaquete) ?? "?"}kbps espera=${r?.retrasoMaxMs ?? 0}ms desc=${desc}${inf ? ` rx-otro=perd ${inf.perd}% tarde ${inf.tarde}%` : ""} calma=${Math.round(this.control.calmaMs / 1000)}s`,
      );
    }
    if (this.control.bajoSuelo !== sueloAntes) this.d.anotar?.(this.control.bajoSuelo ? `voz-datos bajo-suelo tx motivo=${this.control.motivo} cabe=${kbpsCabenVoz(r?.modelo ?? null, this.control.nivel.msPaquete) ?? "?"}kbps` : "voz-datos sobre-suelo tx");
    this.pasoRecepcion(ahora);
    if (ahora - this.ultimoRegistro >= REGISTRO_CADA_MS) {
      this.ultimoRegistro = ahora;
      this.anotarEstado(ahora, r);
    }
    if (cambio || this.control.bajoSuelo !== sueloAntes) this.avisar();
  }

  /** Lo que me llega: fracción de audio inventado por ventana, «no se entiende» con histéresis, e informe al otro. */
  private pasoRecepcion(ahora: number): void {
    const st = this.jitter.estadisticas();
    const d = { recibidas: st.recibidas - this.statsAntes.recibidas, perdidas: st.perdidas - this.statsAntes.perdidas, tardias: st.tardias - this.statsAntes.tardias, ocultadas: st.ocultadas - this.statsAntes.ocultadas };
    this.statsAntes = { recibidas: st.recibidas, perdidas: st.perdidas, tardias: st.tardias, ocultadas: st.ocultadas };
    // Solo cuenta si el otro habla (llegó algo hace poco): un otro silenciado no es «no se entiende».
    const hablando = this.ultimoRxEn > 0 && ahora - this.ultimoRxEn < 3000;
    // Audio inventado = lo que en este segundo NO fue audio real (ocultación que se apaga, o nada mientras el búfer se
    // rellena). El silencio declarado por el otro cuenta como real.
    const seg = Math.max(0.5, (ahora - this.ultimoPasoRx) / 1000);
    this.ultimoPasoRx = ahora;
    const mala = hablando ? Math.max(0, Math.min(1, 1 - this.realesVentana / ((seg * 1000) / MS_TRAMA))) : 0;
    this.realesVentana = 0;
    this.ultimaFraccionMala = mala;
    this.ventanasMalas.push(mala);
    if (this.ventanasMalas.length > CORTE_VENTANAS + 3) this.ventanasMalas.shift();
    const antes = this.sinVozRx;
    // Mientras el otro aún puede bajar de escalón (sus paquetes no son los del suelo) se le dan más ventanas: una caída de
    // capacidad se recoloca en 2–4 s y callar entonces solo alargaría el hueco. Con un aparato anterior no se sabe: 5.
    const ventanasEntrar = this.emisorEnSuelo ? CORTE_VENTANAS : CORTE_VENTANAS + 3;
    if (!this.sinVozRx && this.ventanasMalas.length >= ventanasEntrar && this.ventanasMalas.slice(-ventanasEntrar).every((x) => x > CORTE_ENTRAR)) this.sinVozRx = true;
    else if (this.sinVozRx && (this.ventanasMalas.slice(-CORTE_VENTANAS_SALIR).every((x) => x < CORTE_SALIR) || !hablando)) this.sinVozRx = false;
    if (antes !== this.sinVozRx) {
      this.d.anotar?.(this.sinVozRx ? `voz-datos bajo-suelo rx audio-inventado=${this.ventanasMalas.map((x) => Math.round(x * 100)).join("/")}% (en silencio, aviso)` : `voz-datos sobre-suelo rx audio-inventado=${Math.round(mala * 100)}%`);
      this.avisar();
    }
    this.acumuladoInforme.recibidas += d.recibidas;
    this.acumuladoInforme.perdidas += d.perdidas;
    this.acumuladoInforme.tardias += d.tardias;
    if (this.formato === "b1" && ahora - this.ultimoInforme >= INFORME_CADA_MS) {
      const a = this.acumuladoInforme;
      const tot = a.recibidas + a.perdidas;
      const seg = Math.max(1, (ahora - this.ultimoInforme) / 1000);
      this.ultimoInforme = ahora;
      if (hablando || this.sinVozRx) {
        this.mandarControl({ k: "rep", perd: tot ? Math.round((1000 * a.perdidas) / tot) / 10 : 0, tarde: tot ? Math.round((1000 * a.tardias) / tot) / 10 : 0, kbps: Math.round((this.bytesRxVentana * 8) / seg / 1000), ...(this.sinVozRx ? { corte: 1 } : {}) });
      }
      this.acumuladoInforme = { recibidas: 0, perdidas: 0, tardias: 0 };
      this.bytesRxVentana = 0;
    }
  }

  private acumuladoInforme = { recibidas: 0, perdidas: 0, tardias: 0 };
  private realesVentana = 0;
  private emisorEnSuelo = false;
  private ultimoPasoRx = 0;

  /**
   * Dos líneas cortas (el registro corta cada detalle a 200 caracteres):
   *   voz-datos tx n=3 opus=10k trama/paq=60/120ms texto=17k fmt=b1 cabe=30k enlace=36k+40ms entregado=19k espera=121ms paq=581 tiradas=0 otro:perd=0% tarde=0%
   *   voz-datos rx paq=599 perd=0.2% tardias=3 ocultadas=+12 inventado=0% jitter=200ms
   */
  private anotarEstado(ahora: number, r: ResumenEnlace | null): void {
    if (!this.control) return;
    const n = this.control.nivel;
    const st = this.jitter.estadisticas();
    const inf = this.informe && ahora - this.informe.en < 10_000 ? this.informe : null;
    const m = r?.modelo ?? null;
    const k = (x: number | null | undefined) => (typeof x === "number" ? `${x}k` : "?");
    this.d.anotar?.(
      `voz-datos tx n=${this.control.indice} ${this.codecTx}=${k(n.kbps)} trama/paq=${n.msTrama}/${n.msPaquete}ms texto=${k(kbpsTextoNivel(n, this.formato, this.d.idLlamada))} fmt=${this.formato}` +
        ` cabe=${k(kbpsCabenVoz(m, n.msPaquete))} enlace=${m ? `${Math.round(m.bytesPorMs * 8)}k+${m.rMs}ms` : "?"} entregado=${k(r?.entregadoKbps)} espera=${r?.retrasoMaxMs ?? "?"}ms` +
        ` paq=${this.paquetesTx} tiradas=${this.cola.descartadas}${inf ? ` otro:perd=${inf.perd}% tarde=${inf.tarde}%` : ""}${this.redundanciaOn ? " red" : ""}${this.control.bajoSuelo ? " BAJO-SUELO" : ""}${this.mudo ? " mudo" : ""}`,
    );
    this.d.anotar?.(
      `voz-datos rx paq=${this.paquetesRx} perd=${this.jitter.perdidaPct()}% tardias=${st.tardias} ocultadas=+${st.ocultadas - this.ocultadasRegistro} inventado=${Math.round(this.ultimaFraccionMala * 100)}% jitter=${st.objetivoMs}ms${this.sinVozRx ? " BAJO-SUELO" : ""}`,
    );
    this.ocultadasRegistro = st.ocultadas;
  }

  private ocultadasRegistro = 0;

  private reproducirTrama(): void {
    if (!this.activa) return;
    const s = this.jitter.sacar();
    if (!s) return;
    if (!s.oculta) this.realesVentana++;
    // VOZ1111J: bajo el suelo no se reproducen fragmentos (se dice en palabras): silencio limpio.
    this.d.audio.reproducir(this.sinVozRx ? new Int16Array(s.pcm.length) : s.pcm);
  }

  private decodificadorPara(c: CodecVoz): DecodificadorVoz | null {
    const ya = this.decodificadores.get(c);
    if (ya) return ya;
    const dec = this.d.codecs.decodificador(c);
    if (!dec) return null;
    // VOZ1111J: una trama de 40/60 ms sale entera: se parte en unidades de 20 ms con su número.
    dec.alPcm((pcm, q) => {
      if (pcm.length <= MUESTRAS_TRAMA) {
        this.jitter.meter(q, pcm);
        return;
      }
      for (let k = 0; k * MUESTRAS_TRAMA < pcm.length; k++) this.jitter.meter(q + k, pcm.subarray(k * MUESTRAS_TRAMA, (k + 1) * MUESTRAS_TRAMA));
    });
    this.decodificadores.set(c, dec);
    return dec;
  }

  /** (VOZ1111J) Para la redundancia: ¿ya me llegó esa unidad? */
  private recibida(q: number): boolean {
    return this.recientes.has(q) || this.jitter.yaNoHaceFalta(q);
  }

  private marcarRecibida(q: number, n: number): void {
    for (let k = 0; k < n; k++) {
      if (this.recientes.has(q + k)) continue;
      this.recientes.add(q + k);
      this.recientesOrden.push(q + k);
    }
    while (this.recientesOrden.length > 600) this.recientes.delete(this.recientesOrden.shift()!);
  }

  private sinDecodificador(c: CodecVoz): void {
    // (LLA1108H) Me llega un códec que no sé decodificar (el otro supuso mal): se lo digo con un saludo nuevo para
    // que rehaga la elección con lo que de verdad entiendo. Antes se tiraba el audio en silencio.
    const ahora = this.d.reloj.ahora();
    if (ahora - this.ultimoAvisoSinDecodificador > 3000) {
      this.ultimoAvisoSinDecodificador = ahora;
      this.d.anotar?.(`voz-datos rx-sin-decodificador codec=${c}`);
      this.saludar();
    }
  }

  private alTexto(texto: string): void {
    if (typeof texto !== "string") return;
    if (texto.startsWith(PREFIJO_VOZ_B)) {
      const p = leerPaqueteB(texto);
      if (!p || p.etiqueta !== this.etiqueta) return;
      const dec = this.decodificadorPara(p.c);
      if (!dec) return this.sinDecodificador(p.c);
      if (this.codecRx !== p.c) this.d.anotar?.(`voz-datos rx=${p.c} fmt=b1`);
      this.codecRx = p.c;
      this.ultimoRxEn = this.d.reloj.ahora();
      this.paquetesRx++;
      this.bytesRxVentana += texto.length;
      this.jitter.fijarMinimo(p.cubre * MS_TRAMA + 20);
      // ¿Ya manda en el último escalón (paquetes de ≥ 160 ms)? Entonces lo que no llega es que no cabe.
      const enSuelo = p.cubre * MS_TRAMA >= 160;
      // Acaba de bajar al suelo: lo malo de antes era la recolocación, no «no cabe». Se cuenta desde ahora.
      if (enSuelo && !this.emisorEnSuelo) this.ventanasMalas = [];
      this.emisorEnSuelo = enSuelo;
      // Redundancia primero (es más vieja), solo lo que aún no llegó y aún sirve.
      for (const t of p.red) {
        if (this.recibida(t.q)) continue;
        this.marcarRecibida(t.q, t.n);
        this.recibidas++;
        dec.decodificar(t.bytes, t.q);
      }
      const conAudio = new Set<number>();
      for (const t of p.tramas) {
        for (let k = 0; k < t.n; k++) conAudio.add(t.q + k);
        if (this.recientes.has(t.q)) continue;
        this.marcarRecibida(t.q, t.n);
        this.recibidas++;
        dec.decodificar(t.bytes, t.q);
      }
      // Silencio declarado: se oye silencio (no es pérdida ni se tapa con la trama anterior).
      for (let k = 0; k < p.cubre; k++) {
        const u = p.q + k;
        if (conAudio.has(u) || this.recientes.has(u)) continue;
        this.marcarRecibida(u, 1);
        this.jitter.meter(u, new Int16Array(MUESTRAS_TRAMA));
      }
      return;
    }
    if (texto.startsWith('{"t":"voz.p"')) {
      const p = leerPaquete(texto);
      if (!p || p.s !== this.d.idLlamada) return;
      const dec = this.decodificadorPara(p.c);
      if (!dec) return this.sinDecodificador(p.c);
      if (this.codecRx !== p.c) this.d.anotar?.(`voz-datos rx=${p.c}`);
      this.codecRx = p.c;
      this.ultimoRxEn = this.d.reloj.ahora();
      this.paquetesRx++;
      this.bytesRxVentana += texto.length;
      if (p.tramas.length > 3) this.jitter.fijarMinimo(p.tramas.length * MS_TRAMA + 20);
      p.tramas.forEach((b, i) => {
        this.recibidas++;
        dec.decodificar(b, p.q + i);
      });
      return;
    }
    const c = leerControl(texto);
    if (!c || c.s !== this.d.idLlamada) return;
    if (c.k === "hola") {
      const primero = !this.holaRecibido;
      this.holaRecibido = true;
      // VOZ1111J: «b1» solo si el otro lo anuncia; un aparato anterior no manda `fmt` y se le habla `voz.p`.
      const fmt: FormatoVoz = !this.d.comoAnterior && (c.fmt ?? []).includes("b1") ? "b1" : "p";
      const cambioFmt = fmt !== this.formato;
      this.formato = fmt;
      this.elegirCodecTx(c.codecs ?? null);
      if (cambioFmt) {
        this.control?.fijarFormato(fmt);
        this.rehacerControl();
        this.d.anotar?.(`voz-datos formato=${fmt === "b1" ? "b1 (compacto)" : "p (aparato anterior)"} nivel=${this.control?.indice ?? 0}`);
      }
      if (primero) {
        this.saludar();
        this.d.anotar?.(`voz-datos hola codec=${this.codecTx}`);
      }
      this.avisar();
    } else if (c.k === "ping") {
      this.mandarControl({ k: "pong", ts: c.ts });
    } else if (c.k === "pong" && typeof c.ts === "number") {
      const rtt = this.d.reloj.ahora() - c.ts;
      if (rtt >= 0 && rtt < 60_000) {
        this.rttMs = this.rttMs === null ? rtt : Math.round(this.rttMs * 0.7 + rtt * 0.3);
        this.avisar();
      }
    } else if (c.k === "rep") {
      const antes = this.bajoSueloTx();
      this.informe = { perd: c.perd ?? 0, tarde: c.tarde ?? 0, corte: c.corte === 1, kbps: c.kbps ?? 0, en: this.d.reloj.ahora() };
      if (antes !== this.bajoSueloTx()) this.avisar();
    } else if (c.k === "fin") {
      this.finTexto = c.m ?? "colgada";
      this.avisar();
    }
  }
}
