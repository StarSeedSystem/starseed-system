/**
 * video-datos/sesion-video — vídeo ligero de UNA llamada con UN par por el enlace de datos (LLA1108H).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Orquesta, sin tocar el navegador (todo se inyecta):
 *   cámara → fotograma reducido (160×120…320×240) → códec (VP8/H.264/JPEG) → fragmentos → enlace
 *   enlace → fragmentos → reensamblado → códec → salida (MediaStream que ya sabe enseñar el mosaico)
 * Prioridad: audio > vídeo > lo demás. El vídeo solo sale si la cola de voz del enlace está vacía y la suya es
 * corta; si no, el fotograma se tira (nunca el audio). Con presión sostenida baja de escalón (resolución y fps).
 * Pérdida: fragmento perdido → el receptor pide un clave (`kf`) y no enseña nada a medias.
 * Códec por sentido: cada lado dice qué sabe DECODIFICAR (`hola`) y el que emite elige el mejor que sabe CODIFICAR
 * y el otro decodifica; el registro anota el elegido por sentido.
 * Contrato: architecture/llamadas-telefonia.md § «Vídeo ligero por enlace de datos».
 */
import type { RelojVoz } from "@/lib/llamadas/voz-datos/sesion";
import { ControlAdaptativo, hayHueco } from "./adaptacion";
import { armarControlVideo, armarFragmento, esTextoVideo, fragmentar, leerControlVideo, leerFragmento, mtuSana, ReensambladorVideo } from "./paquete";
import {
  CODECS_VIDEO,
  PERFILES_VIDEO,
  type CodecVideo,
  type CodificadorVideo,
  type DecodificadorVideo,
  type FabricaVideo,
  type FuenteVideo,
  type PerfilVideo,
  type SalidaVideo,
  type TransporteVideo,
} from "./tipos";

export interface DepsSesionVideo {
  idLlamada: string;
  transporte: TransporteVideo;
  codecs: FabricaVideo;
  /** Dónde se pinta lo que llega (null: solo se manda). */
  salida: SalidaVideo | null;
  reloj: RelojVoz;
  anotar?: (hito: string) => void;
  /** Escalera de calidad (por defecto `PERFILES_VIDEO`). */
  escalera?: readonly PerfilVideo[];
}

export interface EstadoVideoDatos {
  activa: boolean;
  /** Envío mi imagen. */
  enviando: boolean;
  /** Ya llegó imagen del otro. */
  recibiendo: boolean;
  codecTx: CodecVideo | null;
  codecRx: CodecVideo | null;
  perfil: PerfilVideo;
  kbpsMedidos: number;
  omitidos: number;
  fotogramasTx: number;
  fotogramasRx: number;
  /** Peticiones de fotograma clave enviadas por pérdida. */
  clavesPedidas: number;
  nivel: "buena" | "regular" | "mala";
  /** «160×120 · 4 fps · 40 kbps · VP8». */
  texto: string;
  ultimoRxEn: number;
  fin: boolean;
}

const ORDEN_PREFERIDO: readonly CodecVideo[] = ["vp8", "h264", "jpeg"];
const ETIQUETA: Record<CodecVideo, string> = { vp8: "VP8", h264: "H.264", jpeg: "JPEG" };

/** El mejor códec que yo codifico y el otro decodifica (null si no hay ninguno en común). */
export function elegirCodecVideo(codificables: readonly CodecVideo[], decodificablesDelOtro: readonly CodecVideo[] | null | undefined): CodecVideo | null {
  if (!decodificablesDelOtro) return null;
  for (const c of ORDEN_PREFERIDO) if (codificables.includes(c) && decodificablesDelOtro.includes(c)) return c;
  return null;
}

export function textoPerfil(p: PerfilVideo, c: CodecVideo | null): string {
  return `${p.w}×${p.h} · ${p.fps} fps · ${p.kbps} kbps${c ? ` · ${ETIQUETA[c]}` : ""}`;
}

export class SesionVideoDatos {
  private readonly d: DepsSesionVideo;
  private readonly ctrl: ControlAdaptativo;
  private readonly reasm = new ReensambladorVideo();
  private readonly decodificadores = new Map<CodecVideo, DecodificadorVideo>();
  private fuente: FuenteVideo | null = null;
  private codificador: CodificadorVideo | null = null;
  private codecTx: CodecVideo | null = null;
  private codecRx: CodecVideo | null = null;
  private activa = false;
  private holaRecibido = false;
  private holasEnviadas = 0;
  private decodificablesOtro: CodecVideo[] | null = null;
  private seqTx = 0;
  private forzarClave = true;
  private ultimoClaveEn = 0;
  private ultimaPeticionClave = -1e9;
  private ultimoAvisoSinCodec = -1e9;
  private enviadosTx = 0;
  private recibidosRx = 0;
  private clavesPedidas = 0;
  private ultimoRxEn = 0;
  private finRecibido = false;
  private bajaTic: (() => void) | null = null;
  private bajaSeg: (() => void) | null = null;
  private bajaRx: (() => void) | null = null;
  private fpsProgramado = 0;
  private readonly oyentes = new Set<(e: EstadoVideoDatos) => void>();

  constructor(deps: DepsSesionVideo) {
    this.d = deps;
    this.ctrl = new ControlAdaptativo(deps.escalera ?? PERFILES_VIDEO, 0);
  }

  suscribir(cb: (e: EstadoVideoDatos) => void): () => void {
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
        /* un oyente roto no tumba el vídeo */
      }
    }
  }

  estado(): EstadoVideoDatos {
    const p = this.ctrl.perfil();
    const i = this.ctrl.indice;
    return {
      activa: this.activa,
      enviando: !!this.fuente && this.activa && !!this.codecTx,
      recibiendo: this.recibidosRx > 0,
      codecTx: this.codecTx,
      codecRx: this.codecRx,
      perfil: p,
      kbpsMedidos: this.ctrl.medidoKbps,
      omitidos: this.ctrl.omitidos,
      fotogramasTx: this.enviadosTx,
      fotogramasRx: this.recibidosRx,
      clavesPedidas: this.clavesPedidas,
      nivel: i >= 3 ? "buena" : i >= 1 ? "regular" : "mala",
      texto: textoPerfil(p, this.codecTx),
      ultimoRxEn: this.ultimoRxEn,
      fin: this.finRecibido,
    };
  }

  /** Abre la escucha y saluda. Idempotente. */
  iniciar(): void {
    if (this.activa) return;
    this.activa = true;
    this.bajaRx = this.d.transporte.alRecibir((t) => this.alTexto(t));
    this.bajaSeg = this.d.reloj.cada(() => this.cadaSegundo(), 1000);
    this.saludar();
    this.avisar();
  }

  private saludar(): void {
    this.holasEnviadas++;
    this.d.transporte.enviar(armarControlVideo({ s: this.d.idLlamada, k: "hola", dec: this.d.codecs.decodificables() }));
  }

  /** Empieza (o cambia) a mandar mi imagen; null la deja de mandar sin cerrar la escucha. */
  ponerFuente(f: FuenteVideo | null): void {
    if (this.fuente && this.fuente !== f) {
      try {
        this.fuente.cerrar();
      } catch {
        /* noop */
      }
    }
    this.fuente = f;
    if (!f) {
      this.pararTic();
      this.cerrarCodificador();
      this.avisar();
      return;
    }
    this.forzarClave = true;
    this.prepararCodificador();
    this.programarTic();
    this.avisar();
  }

  private prepararCodificador(): void {
    if (!this.fuente || !this.codecTx) return;
    if (this.codificador) return;
    const enc = this.d.codecs.codificador(this.codecTx);
    if (!enc) {
      this.d.anotar?.(`video-datos sin-codificador codec=${this.codecTx}`);
      return;
    }
    enc.configurar(this.ctrl.perfil());
    enc.alSalir((f) => this.alCodificado(f));
    this.codificador = enc;
  }

  private cerrarCodificador(): void {
    try {
      this.codificador?.cerrar();
    } catch {
      /* noop */
    }
    this.codificador = null;
  }

  private programarTic(): void {
    const fps = this.ctrl.perfil().fps;
    if (this.bajaTic && this.fpsProgramado === fps) return;
    this.pararTic();
    this.fpsProgramado = fps;
    this.bajaTic = this.d.reloj.cada(() => this.tic(), Math.round(1000 / fps));
  }

  private pararTic(): void {
    this.bajaTic?.();
    this.bajaTic = null;
    this.fpsProgramado = 0;
  }

  /** Un fotograma de cámara por tic; si no hay hueco en el enlace (la voz manda), se tira. */
  private tic(): void {
    if (!this.activa || !this.fuente || !this.codificador || !this.codecTx) return;
    const t = this.d.transporte;
    if (!t.abierto()) return;
    const ahora = this.d.reloj.ahora();
    const hueco = hayHueco({ vozBytes: t.colaVozBytes?.() ?? 0, videoBytes: t.colaVideoBytes?.() ?? 0, ocupado: t.ocupado() });
    if (!hueco) {
      this.ctrl.registrarPresion(ahora);
      return;
    }
    const p = this.ctrl.perfil();
    const frame = this.fuente.capturar(p.w, p.h);
    if (!frame) return;
    const clave = this.forzarClave || ahora - this.ultimoClaveEn >= p.kfMs;
    if (clave) {
      this.forzarClave = false;
      this.ultimoClaveEn = ahora;
    }
    try {
      this.codificador.codificar(frame, clave);
    } catch {
      this.forzarClave = true;
    }
  }

  /** Salida del códec: se parte y se manda por la cola de vídeo del enlace. */
  private alCodificado(f: { clave: boolean; bytes: Uint8Array; ts: number; w: number; h: number }): void {
    if (!this.activa || !this.codecTx) return;
    const ahora = this.d.reloj.ahora();
    if (!f.clave && this.ctrl.pasaDePresupuesto(f.bytes.length, ahora)) {
      // Tirar un diferencial ya codificado rompe la cadena: el siguiente va clave.
      this.ctrl.registrarPresion(ahora);
      this.forzarClave = true;
      return;
    }
    const q = this.seqTx++;
    const frags = fragmentar(this.d.idLlamada, q, this.codecTx, f, this.d.transporte.mtu?.());
    if (!frags) {
      this.forzarClave = true;
      return;
    }
    const enviar = (txt: string) => (this.d.transporte.enviarVideo ? this.d.transporte.enviarVideo(txt) : this.d.transporte.enviar(txt));
    let bytes = 0;
    for (const fr of frags) {
      const txt = armarFragmento(fr);
      const r = enviar(txt);
      bytes += txt.length;
      if (r !== "ok") {
        this.ctrl.registrarPresion(ahora);
        this.forzarClave = true;
        if (r === "cerrado") break;
      }
    }
    this.ctrl.registrarSalida(bytes, ahora);
    this.enviadosTx++;
    this.avisar();
  }

  private cadaSegundo(): void {
    if (!this.activa) return;
    const ahora = this.d.reloj.ahora();
    // Saludo hasta oír al otro.
    if (!this.holaRecibido && this.holasEnviadas < 8) this.saludar();
    const nuevo = this.ctrl.tic(ahora, this.d.transporte.capacidadKbps?.() ?? null);
    if (nuevo) {
      this.d.anotar?.(`video-datos perfil=${textoPerfil(nuevo, this.codecTx)}`);
      try {
        this.codificador?.configurar(nuevo);
      } catch {
        /* noop */
      }
      this.forzarClave = true;
      if (this.fuente) this.programarTic();
      this.avisar();
    }
    const r = this.reasm.caducar(ahora);
    if (r.tipo === "perdida") this.pedirClave();
  }

  private pedirClave(): void {
    const ahora = this.d.reloj.ahora();
    if (ahora - this.ultimaPeticionClave < 1000) return;
    this.ultimaPeticionClave = ahora;
    this.clavesPedidas++;
    this.d.transporte.enviar(armarControlVideo({ s: this.d.idLlamada, k: "kf" }));
    this.d.anotar?.("video-datos pide-clave");
  }

  private decodificadorPara(c: CodecVideo): DecodificadorVideo | null {
    const ya = this.decodificadores.get(c);
    if (ya) return ya;
    const dec = this.d.codecs.decodificador(c);
    if (!dec) return null;
    dec.alImagen((img) => {
      this.recibidosRx++;
      this.ultimoRxEn = this.d.reloj.ahora();
      try {
        this.d.salida?.pintar(img);
      } catch {
        /* noop */
      }
      this.avisar();
    });
    dec.alError(() => {
      this.reasm.exigirClave();
      this.pedirClave();
    });
    this.decodificadores.set(c, dec);
    return dec;
  }

  private alTexto(texto: string): void {
    if (!esTextoVideo(texto)) return;
    const c = leerControlVideo(texto);
    if (c) {
      if (c.s !== this.d.idLlamada) return;
      this.alControl(c);
      return;
    }
    const f = leerFragmento(texto);
    if (!f || f.s !== this.d.idLlamada) return;
    const dec = this.decodificadorPara(f.c);
    if (!dec) {
      // Me mandan un códec que no sé decodificar: se lo digo (se rehace la elección) y se anota.
      const ahora = this.d.reloj.ahora();
      if (ahora - this.ultimoAvisoSinCodec > 3000) {
        this.ultimoAvisoSinCodec = ahora;
        this.d.anotar?.(`video-datos rx-sin-decodificador codec=${f.c}`);
        this.saludar();
      }
      return;
    }
    const r = this.reasm.meter(f, this.d.reloj.ahora());
    if (r.tipo === "frame") {
      if (this.codecRx !== r.codec) {
        this.codecRx = r.codec;
        this.d.anotar?.(`video-datos rx=${r.codec}`);
      }
      try {
        dec.decodificar(r.frame);
      } catch {
        this.reasm.exigirClave();
        this.pedirClave();
      }
    } else if (r.tipo === "perdida") {
      this.pedirClave();
    } else if (this.reasm.necesitaClave && !f.clave) {
      // Llegan diferenciales sin tener clave: se pide uno (la primera vez, al empezar).
      this.pedirClave();
    }
  }

  private alControl(c: { k: "hola" | "kf" | "fin"; dec?: CodecVideo[] }): void {
    if (c.k === "hola") {
      const primero = !this.holaRecibido;
      this.holaRecibido = true;
      this.decodificablesOtro = c.dec ?? null;
      const nuevo = elegirCodecVideo(this.d.codecs.codificables(), this.decodificablesOtro);
      if (nuevo !== this.codecTx) {
        this.cerrarCodificador();
        this.codecTx = nuevo;
        this.forzarClave = true;
        this.d.anotar?.(nuevo ? `video-datos tx=${nuevo}` : "video-datos tx=ninguno (sin códec común)");
      }
      if (primero) {
        this.reasm.reiniciar();
        this.saludar();
        this.pedirClave();
      }
      if (this.fuente) {
        this.prepararCodificador();
        this.programarTic();
      }
      this.avisar();
    } else if (c.k === "kf") {
      this.forzarClave = true;
    } else if (c.k === "fin") {
      this.finRecibido = true;
      this.avisar();
    }
  }

  /** Para todo y avisa al otro. Idempotente. */
  detener(): void {
    if (!this.activa) return;
    try {
      this.d.transporte.enviar(armarControlVideo({ s: this.d.idLlamada, k: "fin" }));
    } catch {
      /* noop */
    }
    this.activa = false;
    this.pararTic();
    this.bajaSeg?.();
    this.bajaSeg = null;
    this.bajaRx?.();
    this.bajaRx = null;
    this.cerrarCodificador();
    for (const dec of this.decodificadores.values()) {
      try {
        dec.cerrar();
      } catch {
        /* noop */
      }
    }
    this.decodificadores.clear();
    try {
      this.fuente?.cerrar();
    } catch {
      /* noop */
    }
    this.fuente = null;
    try {
      this.d.salida?.cerrar();
    } catch {
      /* noop */
    }
    this.avisar();
  }
}

export { CODECS_VIDEO, mtuSana };
