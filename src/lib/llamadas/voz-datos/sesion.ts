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
import { ColaSalidaVoz, agruparConsecutivas } from "./cola-salida";
import { BufferJitter } from "./jitter";
import { armarControl, armarPaquete, leerControl, leerPaquete, type ControlVoz } from "./paquete";
import type { CalidadVoz } from "./decision";

export interface TransporteVoz {
  /** Encola un texto `voz.*` en el enlace. «descartado»: el enlace tiró lo más viejo; «cerrado»: ya no hay enlace. */
  enviar(texto: string): "ok" | "descartado" | "cerrado";
  /** ¿El enlace tiene ya voz en espera de salir? (contrapresión: mientras sea true, la cola de la sesión retiene.) */
  ocupado(): boolean;
  alRecibir(cb: (texto: string) => void): () => void;
  abierto(): boolean;
  info(): { tipo: string; cifrada: boolean };
}

export interface CodificadorVoz {
  codificar(pcm: Int16Array): void;
  alSalir(cb: (bytes: Uint8Array) => void): void;
  cerrar(): void;
}
export interface DecodificadorVoz {
  decodificar(bytes: Uint8Array, q: number): void;
  alPcm(cb: (pcm: Int16Array, q: number) => void): void;
  cerrar(): void;
}
export interface FabricaCodecs {
  soportados(): CodecVoz[];
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
      return {
        codificar: (pcm) => cb(codificarTrama(c, pcm)),
        alSalir: (f) => {
          cb = f;
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
}

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
}

const MAX_MIOS: CodecVoz[] = [...CODECS_VOZ];

export class SesionVozDatos {
  private readonly d: DepsSesionVoz;
  private readonly cola: ColaSalidaVoz;
  private readonly jitter = new BufferJitter({ msTrama: MS_TRAMA });
  private readonly soportados: CodecVoz[];
  private codecTx: CodecVoz = "adpcm";
  private codecRx: CodecVoz | null = null;
  private codificador: CodificadorVoz | null = null;
  private readonly decodificadores = new Map<CodecVoz, DecodificadorVoz>();
  private seqTx = 0;
  private recibidas = 0;
  private enviadas = 0;
  private rttMs: number | null = null;
  private mudo = false;
  private activa = false;
  private ultimoRxEn = 0;
  private finTexto: string | null = null;
  private holaRecibido = false;
  private holasEnviadas = 0;
  private bajas: Array<() => void> = [];
  private readonly oyentes = new Set<(e: EstadoVozDatos) => void>();

  constructor(deps: DepsSesionVoz) {
    this.d = deps;
    this.cola = new ColaSalidaVoz({ maxMs: 240, msTrama: MS_TRAMA });
    this.soportados = MAX_MIOS.filter((c) => deps.codecs.soportados().includes(c));
    if (!this.soportados.length) this.soportados.push("adpcm");
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
    };
  }

  calidad(): CalidadVoz {
    const e = this.estado();
    return { rttMs: e.rttMs, perdidaPct: e.perdidaPct, codec: e.codecRx ?? e.codecTx, jitterMs: e.jitterObjetivoMs };
  }

  private elegirCodecTx(suyos: CodecVoz[] | null): void {
    const c = elegirCodecComun(this.soportados, suyos);
    if (c === this.codecTx && this.codificador) return;
    this.codificador?.cerrar();
    this.codificador = this.d.codecs.codificador(c) ?? this.d.codecs.codificador("adpcm");
    this.codecTx = this.codificador ? c : "adpcm";
    this.codificador?.alSalir((bytes) => {
      if (!this.activa) return;
      this.cola.encolar({ q: this.seqTx++, ts: this.d.reloj.ahora(), bytes });
    });
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
      this.codificador?.codificar(pcm);
    });
    if (!ok) {
      this.d.anotar?.("voz-datos sin-micro");
      return false;
    }
    this.activa = true;
    this.bajas.push(this.d.transporte.alRecibir((t) => this.alTexto(t)));
    const msLote = Math.max(MS_TRAMA, this.d.msLote ?? 60);
    this.bajas.push(this.d.reloj.cada(() => this.bombear(), msLote));
    this.bajas.push(this.d.reloj.cada(() => this.reproducirTrama(), MS_TRAMA));
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

  private saludar(): void {
    this.holasEnviadas++;
    this.mandarControl({ k: "hola", codecs: this.soportados });
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

  /** Salida: lo que haya en cola, en paquetes de tramas consecutivas, si el enlace no está ocupado. */
  private bombear(): void {
    if (!this.activa) return;
    if (!this.d.transporte.abierto()) return;
    if (this.d.transporte.ocupado()) return; // contrapresión: se queda en la cola (y cae lo más viejo)
    const tramas = this.cola.sacar(MAX_PAQUETE_TRAMAS);
    for (const g of agruparConsecutivas(tramas)) {
      const texto = armarPaquete({ s: this.d.idLlamada, q: g[0].q, ts: g[0].ts, c: this.codecTx, f: MS_TRAMA, tramas: g.map((t) => t.bytes) });
      this.d.transporte.enviar(texto);
      this.enviadas += g.length;
    }
  }

  private reproducirTrama(): void {
    if (!this.activa) return;
    const s = this.jitter.sacar();
    if (s) this.d.audio.reproducir(s.pcm);
  }

  private decodificadorPara(c: CodecVoz): DecodificadorVoz | null {
    const ya = this.decodificadores.get(c);
    if (ya) return ya;
    const dec = this.d.codecs.decodificador(c);
    if (!dec) return null;
    dec.alPcm((pcm, q) => this.jitter.meter(q, pcm));
    this.decodificadores.set(c, dec);
    return dec;
  }

  private alTexto(texto: string): void {
    if (typeof texto !== "string") return;
    if (texto.startsWith('{"t":"voz.p"')) {
      const p = leerPaquete(texto);
      if (!p || p.s !== this.d.idLlamada) return;
      const dec = this.decodificadorPara(p.c);
      if (!dec) return;
      this.codecRx = p.c;
      this.ultimoRxEn = this.d.reloj.ahora();
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
      this.elegirCodecTx(c.codecs ?? null);
      if (primero) {
        this.mandarControl({ k: "hola", codecs: this.soportados });
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
    } else if (c.k === "fin") {
      this.finTexto = c.m ?? "colgada";
      this.avisar();
    }
  }
}

const MAX_PAQUETE_TRAMAS = 8;
