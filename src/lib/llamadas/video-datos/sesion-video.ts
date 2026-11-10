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
  type ContadoresVideoRx,
  type ContadoresVideoTx,
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

/** Cada cuánto se anotan los contadores por sentido en el registro del enlace (VID1110A). */
export const PERIODO_CONTADORES_MS = 5000;
/** Errores seguidos de un códec antes de vetarlo y pasar al siguiente (o a JPEG). */
export const ERRORES_PARA_VETAR = 3;
/** Fotogramas capturados sin que salga ni uno del codificador → se da por roto (VID1110A). */
export const CAPTURAS_SIN_SALIDA = 12;
/** Fotogramas entregados al decodificador sin que salga ni una imagen → se da por roto. */
export const CUADROS_SIN_IMAGEN = 10;
/** Un fotograma que lleva tanto esperando sitio en la cola del enlace ya no vale: se tira y se manda un clave. */
export const CADUCA_SALIDA_MS = 2500;

const ORDEN_PREFERIDO: readonly CodecVideo[] = ["vp8", "h264", "jpeg"];
const ETIQUETA: Record<CodecVideo, string> = { vp8: "VP8", h264: "H.264", jpeg: "JPEG" };

/** El mejor códec que yo codifico y el otro decodifica (null si no hay ninguno en común). */
export function elegirCodecVideo(codificables: readonly CodecVideo[], decodificablesDelOtro: readonly CodecVideo[] | null | undefined): CodecVideo | null {
  if (!decodificablesDelOtro) return null;
  for (const c of ORDEN_PREFERIDO) if (codificables.includes(c) && decodificablesDelOtro.includes(c)) return c;
  return null;
}

/** Texto corto y sin comillas ni saltos para una línea del registro. */
function limpiar(t: string): string {
  return String(t ?? "").replace(/["\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 80);
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
  /* VID1110A: contadores por sentido, vetos de códec y salida paciente (un clave entero cabe aunque la cola del enlace sea corta). */
  private txCap = 0;
  private txCod = 0;
  private txEnv = 0;
  private txDesc = 0;
  private txClave = 0;
  private txErrores = 0;
  private txBytesDesdeLog = 0;
  private txKbps = 0;
  private txCapSinSalida = 0;
  private txErroresSeguidos = 0;
  private rxPaq = 0;
  private rxCuadros = 0;
  private rxDec = 0;
  private rxPint = 0;
  private rxErr = 0;
  private rxUltimoError = "";
  private rxCuadrosSinImagen = 0;
  private readonly rxErroresSeguidos = new Map<CodecVideo, number>();
  private readonly vetoCodificar = new Set<CodecVideo>();
  private readonly vetoDecodificar = new Set<CodecVideo>();
  private salidaPendiente: Array<{ txt: string; ultimo: boolean }> = [];
  private salidaDesde = 0;
  private ultimoLog = 0;
  private avisadoNegro = false;
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
    this.d.transporte.enviar(armarControlVideo({ s: this.d.idLlamada, k: "hola", dec: this.decodificablesPropios() }));
  }

  /** Lo que codifico menos lo que ya falló aquí (VID1110A). */
  private codificablesPropios(): CodecVideo[] {
    return this.d.codecs.codificables().filter((c) => !this.vetoCodificar.has(c));
  }

  /** Lo que sé decodificar menos lo que ya falló aquí: el otro no me lo manda más (VID1110A). */
  private decodificablesPropios(): CodecVideo[] {
    return this.d.codecs.decodificables().filter((c) => !this.vetoDecodificar.has(c));
  }

  /** VID1110A: el códec de salida falló. Con errores seguidos se veta y se renegocia (VP8 → H.264 → JPEG). */
  private alErrorCodificador(codec: CodecVideo | null, mensaje: string): void {
    this.txErrores++;
    this.txErroresSeguidos++;
    const m = limpiar(mensaje);
    if (this.txErrores <= 3) this.d.anotar?.(`video-datos tx-error codec=${codec ?? "?"} "${m}"`);
    if (!codec || codec === "jpeg" || this.txErroresSeguidos < ERRORES_PARA_VETAR) return;
    this.vetoCodificar.add(codec);
    this.txErroresSeguidos = 0;
    this.cerrarCodificador();
    const nuevo = elegirCodecVideo(this.codificablesPropios(), this.decodificablesOtro);
    this.codecTx = nuevo;
    this.forzarClave = true;
    this.d.anotar?.(nuevo ? `video-datos tx=${nuevo} (${codec} vetado: ${m})` : `video-datos tx=ninguno (${codec} vetado: ${m})`);
    if (this.fuente) {
      this.prepararCodificador();
      this.programarTic();
    }
    this.avisar();
  }

  /** VID1110A: el decodificador de un códec no da imagen. Se veta y se avisa al otro con un nuevo `hola`. */
  private vetarDecodificador(c: CodecVideo, motivo: string): void {
    if (c === "jpeg" || this.vetoDecodificar.has(c)) return;
    this.vetoDecodificar.add(c);
    const dec = this.decodificadores.get(c);
    this.decodificadores.delete(c);
    try {
      dec?.cerrar();
    } catch {
      /* noop */
    }
    this.reasm.reiniciar();
    this.d.anotar?.(`video-datos rx-vetado codec=${c} "${limpiar(motivo)}"`);
    this.saludar();
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
    const codec = this.codecTx;
    enc.alError?.((m) => this.alErrorCodificador(codec, m));
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
    // Un fotograma anterior aún sale a trozos por la cola del enlace: no se captura otro encima.
    if (this.salidaPendiente.length) {
      this.vaciarSalida(ahora);
      return;
    }
    const hueco = hayHueco({ vozBytes: t.colaVozBytes?.() ?? 0, videoBytes: t.colaVideoBytes?.() ?? 0, ocupado: t.ocupado() });
    if (!hueco) {
      this.ctrl.registrarPresion(ahora);
      this.txDesc++;
      return;
    }
    const p = this.ctrl.perfil();
    const frame = this.fuente.capturar(p.w, p.h);
    if (!frame) return;
    this.txCap++;
    this.txCapSinSalida++;
    const clave = this.forzarClave || ahora - this.ultimoClaveEn >= p.kfMs;
    if (clave) {
      this.forzarClave = false;
      this.ultimoClaveEn = ahora;
    }
    try {
      this.codificador.codificar(frame, clave);
    } catch (e) {
      this.forzarClave = true;
      this.alErrorCodificador(this.codecTx, e instanceof Error ? e.message : "codificar lanzó");
    }
  }

  /**
   * VID1110A: mete en el enlace tantos fragmentos como quepan SIN pasar el tope de su cola. El Bluetooth tira lo más
   * viejo al pasarse (24 KiB), y si lo viejo era la primera mitad de un fotograma clave, ese clave no llegaba nunca
   * entero y el otro lado se quedaba en negro pidiendo claves. Así un clave grande sale a trozos, sin pérdida.
   */
  private vaciarSalida(ahora: number): void {
    const t = this.d.transporte;
    if (!this.salidaPendiente.length) return;
    if (ahora - this.salidaDesde > CADUCA_SALIDA_MS) {
      this.salidaPendiente = [];
      this.txDesc++;
      this.forzarClave = true;
      this.ctrl.registrarPresion(ahora);
      return;
    }
    const enviar = (txt: string) => (t.enviarVideo ? t.enviarVideo(txt) : t.enviar(txt));
    const tope = t.topeColaVideoBytes?.() ?? null;
    while (this.salidaPendiente.length) {
      const sig = this.salidaPendiente[0];
      const cola = t.colaVideoBytes?.() ?? 0;
      // Con la cola vacía siempre cabe lo siguiente (un fragmento suelto nunca pasa del tope).
      if (tope !== null && cola > 0 && cola + sig.txt.length > tope) return;
      this.salidaPendiente.shift();
      const r = enviar(sig.txt);
      this.txBytesDesdeLog += sig.txt.length;
      this.ctrl.registrarSalida(sig.txt.length, ahora);
      if (r !== "ok") {
        this.ctrl.registrarPresion(ahora);
        this.forzarClave = true;
        if (r === "cerrado") {
          this.salidaPendiente = [];
          return;
        }
      }
      if (sig.ultimo) {
        this.txEnv++;
        this.avisar();
      }
    }
  }

  /** Salida del códec: se parte y se manda por la cola de vídeo del enlace, a medida que hay sitio. */
  private alCodificado(f: { clave: boolean; bytes: Uint8Array; ts: number; w: number; h: number }): void {
    if (!this.activa || !this.codecTx) return;
    const ahora = this.d.reloj.ahora();
    this.txCod++;
    this.txCapSinSalida = 0;
    this.txErroresSeguidos = 0;
    if (!f.clave && this.ctrl.pasaDePresupuesto(f.bytes.length, ahora)) {
      // Tirar un diferencial ya codificado rompe la cadena: el siguiente va clave.
      this.ctrl.registrarPresion(ahora);
      this.txDesc++;
      this.forzarClave = true;
      return;
    }
    if (this.salidaPendiente.length) {
      // Aún sale el anterior. Un clave nuevo lo sustituye (el viejo ya no sirve); un diferencial se tira.
      if (!f.clave) {
        this.txDesc++;
        this.forzarClave = true;
        return;
      }
      this.salidaPendiente = [];
      this.txDesc++;
    }
    const q = this.seqTx++;
    const frags = fragmentar(this.d.idLlamada, q, this.codecTx, f, this.d.transporte.mtu?.());
    if (!frags) {
      this.txDesc++;
      this.forzarClave = true;
      return;
    }
    if (f.clave) this.txClave++;
    this.salidaPendiente = frags.map((fr, k) => ({ txt: armarFragmento(fr), ultimo: k === frags.length - 1 }));
    this.salidaDesde = ahora;
    this.vaciarSalida(ahora);
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
    if (this.salidaPendiente.length) this.vaciarSalida(ahora);
    // Codificador mudo: la cámara da fotogramas pero no sale ni uno (Safari sin VideoFrame de canvas, etc.).
    if (this.codificador && this.codecTx && this.txCapSinSalida >= CAPTURAS_SIN_SALIDA) {
      this.txCapSinSalida = 0;
      this.txErroresSeguidos = ERRORES_PARA_VETAR;
      this.alErrorCodificador(this.codecTx, "el codificador no devuelve nada");
    }
    // Decodificador mudo: llegan fotogramas completos y no sale ninguna imagen.
    if (this.rxCuadrosSinImagen >= CUADROS_SIN_IMAGEN && this.codecRx) {
      const c = this.codecRx;
      this.rxCuadrosSinImagen = 0;
      this.vetarDecodificador(c, "el decodificador no devuelve imágenes");
    }
    if (!this.ultimoLog) this.ultimoLog = ahora;
    if (ahora - this.ultimoLog >= PERIODO_CONTADORES_MS) this.anotarContadores(ahora);
  }

  /** Contadores de cada sentido para el registro (`video-datos tx …` / `video-datos rx …`). */
  contadores(): { tx: ContadoresVideoTx; rx: ContadoresVideoRx } {
    const dg = this.fuente?.diagnostico?.();
    return {
      tx: { capturados: this.txCap, codificados: this.txCod, enviados: this.txEnv, descartados: this.txDesc, clave: this.txClave, kbps: this.txKbps, negros: dg?.negros ?? 0, erroresCodec: this.txErrores },
      rx: { paquetes: this.rxPaq, cuadros: this.rxCuadros, decodificados: this.rxDec, pintados: this.rxPint, errores: this.rxErr, ultimoError: this.rxUltimoError },
    };
  }

  private anotarContadores(ahora: number): void {
    const seg = Math.max(1, (ahora - this.ultimoLog) / 1000);
    this.txKbps = Math.round((this.txBytesDesdeLog * 8) / 1000 / seg);
    this.txBytesDesdeLog = 0;
    this.ultimoLog = ahora;
    const { tx, rx } = this.contadores();
    const dg = this.fuente?.diagnostico?.();
    if (this.fuente || tx.capturados > 0) {
      this.d.anotar?.(`video-datos tx capturados=${tx.capturados} codificados=${tx.codificados} enviados=${tx.enviados} descartados=${tx.descartados} clave=${tx.clave} kbps=${tx.kbps} negros=${tx.negros}`);
    }
    if (rx.paquetes > 0 || this.holaRecibido) {
      this.d.anotar?.(`video-datos rx paquetes=${rx.paquetes} cuadros=${rx.cuadros} decodificados=${rx.decodificados} pintados=${rx.pintados} errores=${rx.errores} ultimoError=${rx.ultimoError ? `"${rx.ultimoError}"` : "ninguno"}`);
    }
    // Todas las muestras de la cámara eran negras: no es un fallo del vídeo ligero, es la fuente (tapada, Continuidad sin imagen…).
    if (dg && !this.avisadoNegro && dg.vistos >= 12 && dg.negros >= Math.ceil(dg.vistos / 4)) {
      this.avisadoNegro = true;
      this.d.anotar?.("video-datos fuente-negra (la cámara entrega fotogramas negros; probar otra cámara)");
    }
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
      this.rxDec++;
      this.rxCuadrosSinImagen = 0;
      this.rxErroresSeguidos.set(c, 0);
      this.ultimoRxEn = this.d.reloj.ahora();
      try {
        this.d.salida?.pintar(img);
        this.rxPint++;
      } catch (e) {
        this.rxErr++;
        this.rxUltimoError = limpiar(`pintar: ${e instanceof Error ? e.message : "falló"}`);
      }
      this.avisar();
    });
    dec.alError((m) => {
      this.rxErr++;
      const msg = limpiar(m ?? "error del decodificador");
      this.rxUltimoError = msg;
      this.reasm.exigirClave();
      // Pedir el clave es lo normal al empezar; solo los fallos reales del códec cuentan para vetarlo.
      if (m !== "diferencial sin clave previa") {
        const n = (this.rxErroresSeguidos.get(c) ?? 0) + 1;
        this.rxErroresSeguidos.set(c, n);
        if (n >= ERRORES_PARA_VETAR) this.vetarDecodificador(c, msg);
      }
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
    this.rxPaq++;
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
      this.rxCuadros++;
      this.rxCuadrosSinImagen++;
      if (this.codecRx !== r.codec) {
        this.codecRx = r.codec;
        this.d.anotar?.(`video-datos rx=${r.codec}`);
      }
      try {
        dec.decodificar(r.frame);
      } catch (e) {
        this.rxErr++;
        this.rxUltimoError = limpiar(e instanceof Error ? e.message : "decodificar lanzó");
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
      const nuevo = elegirCodecVideo(this.codificablesPropios(), this.decodificablesOtro);
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
