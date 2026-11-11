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
 * LLA1111B · reparto: si el enlace da sus contadores (`bytesEntrados` + `colaVozBytes`, el Bluetooth), el vídeo va en
 * el MISMO carril que la voz, con ventana, ritmo medido y pausa con histéresis (ver `reparto.ts`). Si no, como antes.
 * Contrato: architecture/llamadas-telefonia.md § «Vídeo ligero por enlace de datos» y § «Reparto voz/vídeo».
 */
import type { RelojVoz } from "@/lib/llamadas/voz-datos/sesion";
import { ControlAdaptativo, motivoSinHueco, techoDePerfiles } from "./adaptacion";
import { CLAVE_MIN_MS, ControlReparto, CosteEscalon, Cubeta, MedidorEnlace, mtuParaVentana, SUELO_KBPS, ventanaBytes, type ResumenEnlace } from "./reparto";
import { armarControlVideo, armarFragmento, esTextoVideo, fragmentar, leerControlVideo, leerFragmento, mtuSana, ReensambladorVideo } from "./paquete";
import {
  CODECS_VIDEO,
  PERFILES_VIDEO,
  PERFILES_VIDEO_REPARTO,
  type CodecVideo,
  type CodificadorVideo,
  type ContadoresVideoRx,
  type ContadoresVideoTx,
  type DecodificadorVideo,
  type FabricaVideo,
  type FuenteVideo,
  type MotivoDescarteVideo,
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
  /** «160×120 · 4 fps · 40 kbps · VP8» (LLA1111B: con reparto, lo MEDIDO) o el aviso de pausa. */
  texto: string;
  /** LLA1111B: el vídeo que mando está en pausa (la señal solo alcanza para la voz). */
  pausado?: boolean;
  /** LLA1111B: el otro pausó el suyo. */
  pausadoOtro?: boolean;
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
/** LLA1111B: el aviso que ve la persona cuando el vídeo se pausa por falta de señal (en cualquiera de los dos lados). */
export const TEXTO_VIDEO_EN_PAUSA = "Vídeo en pausa: la señal solo alcanza para la voz";
/** LLA1111B: cada cuánto mira el marcapasos el carril (ms). */
export const PERIODO_MARCAPASOS_MS = 20;
/** LLA1111B: cada cuánto informa el receptor de lo que le llega (ms). */
export const PERIODO_INFORME_MS = 2000;

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

/** LLA1110C: «saliendo:12,enlace-ocupado:3» con los más frecuentes primero (cabe en una línea del registro). */
export function textoMotivos(m: Readonly<Record<string, number | undefined>>, max = 5): string {
  return Object.entries(m)
    .filter((e): e is [string, number] => typeof e[1] === "number" && e[1] > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([k, v]) => `${k}:${v}`)
    .join(",");
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
  /** LLA1110C: cada descarte con su motivo, y por qué la cámara no dio imagen. */
  private readonly motivos: Partial<Record<MotivoDescarteVideo, number>> = {};
  private readonly sinImagen: Record<string, number> = {};
  /** El fotograma que sale ahora ya perdió algún trozo en el enlace (se cuenta una vez). */
  private salidaTocada = false;
  private readonly oyentes = new Set<(e: EstadoVideoDatos) => void>();
  /* LLA1111B · reparto con la voz en el mismo carril (null: enlace sin contadores, camino de antes). */
  private readonly reparto: ControlReparto | null = null;
  private readonly medidor: MedidorEnlace | null = null;
  private readonly cubeta = new Cubeta();
  private readonly escalera: readonly PerfilVideo[];
  private bajaMarcapasos: (() => void) | null = null;
  private limitado = false;
  private ultimoResumen: ResumenEnlace | null = null;
  private ultimoLogReparto = 0;
  private motivoCambio = "inicio";
  private pausadoOtro = false;
  private txVentanaFotos = 0;
  private txVentanaDesde = 0;
  private txFpsReal = 0;
  private txKbpsReal = 0;
  private rxVentanaFotos = 0;
  private rxFpsReal = 0;
  private rxInformeVis = 0;
  private rxInformePer = 0;
  private ultimoInforme = 0;
  private perdidaReceptor: number | null = null;
  private perdidaReceptorEn = 0;
  private ultimoW = 0;
  private ultimoH = 0;
  private salidaBytes = 0;
  private readonly coste = new CosteEscalon();
  /** Texto y fotogramas que soltó el códec desde el último paso del reparto (lo que cuesta el escalón). */
  private producidoBytes = 0;
  private producidoFotos = 0;

  constructor(deps: DepsSesionVideo) {
    this.d = deps;
    const t = deps.transporte;
    const compartido = typeof t.bytesEntrados === "function" && typeof t.colaVozBytes === "function";
    this.escalera = deps.escalera ?? (compartido ? PERFILES_VIDEO_REPARTO : PERFILES_VIDEO);
    if (compartido) {
      const anunciadoKbps = t.capacidadKbps?.() ?? null;
      this.medidor = new MedidorEnlace(anunciadoKbps && anunciadoKbps > 0 ? anunciadoKbps / 8 : undefined);
      const max = this.escalera[this.escalera.length - 1].kbps;
      // Se empieza prudente (≈ un tercio de lo anunciado menos la voz, entre el suelo y 40 kbps) y se sube con lo medido.
      const anunciado = t.capacidadKbps?.() ?? null;
      const inicial = anunciado ? Math.max(2 * SUELO_KBPS, Math.min(40, Math.round(anunciado / 3) - 10)) : 30;
      this.reparto = new ControlReparto(max, inicial);
      this.ctrl = new ControlAdaptativo(this.escalera, techoDePerfiles(this.reparto.objetivoKbps, this.escalera));
    } else {
      this.ctrl = new ControlAdaptativo(this.escalera, 0);
    }
  }

  /** LLA1111B: ¿voz y vídeo comparten el carril (reparto medido)? */
  get conReparto(): boolean {
    return !!this.reparto;
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

  /** Texto de la línea de estado: lo que de verdad sale (o llega), o el aviso de pausa. */
  private textoEstado(p: PerfilVideo): string {
    if (!this.reparto) return textoPerfil(p, this.codecTx);
    const enviando = !!this.fuente && !!this.codecTx;
    if ((enviando && this.reparto.estado === "pausa") || (!enviando && this.pausadoOtro)) return TEXTO_VIDEO_EN_PAUSA;
    const etiqueta = (c: CodecVideo | null) => (c ? ` · ${ETIQUETA[c]}` : "");
    if (enviando) return `${p.w}×${p.h} · ${this.txFpsReal} fps · ${this.txKbpsReal} kbps${etiqueta(this.codecTx)}`;
    if (this.recibidosRx > 0 && this.ultimoW) return `${this.ultimoW}×${this.ultimoH} · ${this.rxFpsReal} fps${etiqueta(this.codecRx)}`;
    return textoPerfil(p, this.codecTx);
  }

  estado(): EstadoVideoDatos {
    const p = this.ctrl.perfil();
    const i = this.ctrl.indice;
    const pausado = this.reparto?.estado === "pausa";
    const nivelReparto = (): "buena" | "regular" | "mala" => {
      const k = this.reparto?.objetivoKbps ?? 0;
      return pausado || (this.pausadoOtro && !this.fuente) ? "mala" : k >= 75 ? "buena" : k >= 30 ? "regular" : "mala";
    };
    return {
      activa: this.activa,
      enviando: !!this.fuente && this.activa && !!this.codecTx,
      recibiendo: this.recibidosRx > 0,
      codecTx: this.codecTx,
      codecRx: this.codecRx,
      perfil: p,
      kbpsMedidos: this.reparto ? this.txKbpsReal : this.ctrl.medidoKbps,
      omitidos: this.ctrl.omitidos,
      fotogramasTx: this.enviadosTx,
      fotogramasRx: this.recibidosRx,
      clavesPedidas: this.clavesPedidas,
      nivel: this.reparto ? nivelReparto() : i >= 3 ? "buena" : i >= 1 ? "regular" : "mala",
      texto: this.textoEstado(p),
      pausado,
      pausadoOtro: this.pausadoOtro,
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
    if (this.reparto) this.bajaMarcapasos = this.d.reloj.cada(() => this.marcapasos(), PERIODO_MARCAPASOS_MS);
    this.saludar();
    if (this.reparto) this.d.anotar?.(`video-datos reparto carril=compartido objetivo=${this.reparto.objetivoKbps}kbps escalon=${textoPerfil(this.ctrl.perfil(), null)}`);
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

  /** LLA1110C: un fotograma que no sale, con su motivo. */
  private descartar(m: MotivoDescarteVideo): void {
    this.txDesc++;
    this.motivos[m] = (this.motivos[m] ?? 0) + 1;
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
      if (this.salidaPendiente.length) this.descartar("saliendo");
      return;
    }
    if (this.reparto) {
      // LLA1111B: en pausa no se captura (el último fotograma se queda en la pantalla del otro).
      if (this.reparto.estado === "pausa") {
        this.descartar("pausa");
        return;
      }
    } else {
      const sinHueco = motivoSinHueco({ vozBytes: t.colaVozBytes?.() ?? 0, videoBytes: t.colaVideoBytes?.() ?? 0, ocupado: t.ocupado() });
      if (sinHueco) {
        this.ctrl.registrarPresion(ahora);
        this.descartar(sinHueco);
        return;
      }
    }
    // LLA1110C: el códec aún no ha soltado los anteriores (antes se saltaba dentro del códec sin contarlo).
    if (this.codificador.ocupado?.()) {
      this.descartar("codec");
      return;
    }
    const p = this.ctrl.perfil();
    const frame = this.fuente.capturar(p.w, p.h);
    if (!frame) {
      const m = this.fuente.motivoSinImagen?.() ?? "sin-datos";
      this.sinImagen[m] = (this.sinImagen[m] ?? 0) + 1;
      this.descartar("sin-imagen");
      return;
    }
    this.txCap++;
    this.txCapSinSalida++;
    const clave = this.forzarClave || ahora - this.ultimoClaveEn >= (this.reparto ? Math.max(p.kfMs, CLAVE_MIN_MS) : p.kfMs);
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
    // LLA1111B: con reparto un clave grande sale a la tasa objetivo; caduca cuando tarda 1,5 veces lo que le toca.
    const caduca = this.reparto ? Math.max(CADUCA_SALIDA_MS, ((this.salidaBytes * 8) / Math.max(1, this.reparto.objetivoKbps)) * 1.5) : CADUCA_SALIDA_MS;
    if (ahora - this.salidaDesde > caduca) {
      this.salidaPendiente = [];
      this.descartar("caducado");
      this.forzarClave = true;
      this.ctrl.registrarPresion(ahora);
      return;
    }
    // LLA1111B: con reparto, el vídeo entra en el carril de la VOZ (cada escritura lleva las dos cosas), solo con la
    // ventana libre y con fichas de la cubeta; la voz nueva entra siempre directa detrás de, como mucho, esa ventana.
    const compartido = !!this.reparto;
    const enviar = (txt: string) => (compartido ? t.enviar(txt) : t.enviarVideo ? t.enviarVideo(txt) : t.enviar(txt));
    // El carril cuenta hasta el acuse lo que está en vuelo: se deja una ventana para la escritura en vuelo y otra para
    // la siguiente (el Bluetooth arranca la siguiente nada más llegar el acuse, antes de que el marcapasos mire).
    const tope = compartido ? 2 * this.ventana() : (t.topeColaVideoBytes?.() ?? null);
    while (this.salidaPendiente.length) {
      const sig = this.salidaPendiente[0];
      const cola = compartido ? (t.colaVozBytes?.() ?? 0) : (t.colaVideoBytes?.() ?? 0);
      // Con la cola vacía siempre cabe lo siguiente (un fragmento suelto nunca pasa del tope).
      if (tope !== null && cola > 0 && cola + sig.txt.length > tope) return;
      if (compartido) {
        this.cubeta.recargar(ahora, this.reparto?.objetivoKbps ?? 0);
        if (!this.cubeta.puede()) {
          this.limitado = true;
          return;
        }
        this.cubeta.gastar(sig.txt.length);
        this.medidor?.videoMetido(sig.txt.length);
      }
      this.salidaPendiente.shift();
      const r = enviar(sig.txt);
      this.txBytesDesdeLog += sig.txt.length;
      this.ctrl.registrarSalida(sig.txt.length, ahora);
      if (r !== "ok") {
        this.ctrl.registrarPresion(ahora);
        this.forzarClave = true;
        // El enlace tiró trozos al pasar su tope: ese fotograma ya no llega entero (se cuenta una vez).
        if (!this.salidaTocada) {
          this.salidaTocada = true;
          this.descartar("enlace-tiro");
        }
        if (r === "cerrado") {
          this.salidaPendiente = [];
          return;
        }
      }
      if (sig.ultimo) {
        if (!this.salidaTocada) {
          this.txEnv++;
          this.txVentanaFotos++;
        }
        this.salidaTocada = false;
        this.avisar();
      }
    }
  }

  /** Salida del códec: se parte y se manda por la cola de vídeo del enlace, a medida que hay sitio. */
  private alCodificado(f: { clave: boolean; bytes: Uint8Array; ts: number; w: number; h: number }): void {
    if (!this.activa || !this.codecTx) return;
    const ahora = this.d.reloj.ahora();
    this.txCod++;
    if (this.reparto?.estado === "pausa") {
      // Lo que el códec aún soltaba al pausar: no sale (al reanudar va un clave).
      this.txCapSinSalida = 0;
      this.descartar("pausa");
      this.forzarClave = true;
      return;
    }
    this.txCapSinSalida = 0;
    this.txErroresSeguidos = 0;
    if (!this.reparto && !f.clave && this.ctrl.pasaDePresupuesto(f.bytes.length, ahora)) {
      // Tirar un diferencial ya codificado rompe la cadena: el siguiente va clave.
      this.ctrl.registrarPresion(ahora);
      this.descartar("presupuesto");
      this.forzarClave = true;
      return;
    }
    // LLA1111B: con reparto, el tic no captura mientras sale el anterior; lo que el códec suelta justo después (es
    // asíncrono) va DETRÁS en vez de tirarse (tirar un diferencial obligaba a un clave, y los claves comían el enlace).
    const encolarDetras = !!this.reparto && this.salidaPendiente.length > 0 && !f.clave && this.salidaPendiente.length < 24;
    if (this.salidaPendiente.length && !encolarDetras) {
      // Aún sale el anterior. Un clave nuevo lo sustituye (el viejo ya no sirve); un diferencial se tira.
      if (!f.clave) {
        this.descartar("saliendo");
        this.forzarClave = true;
        this.limitado = true;
        return;
      }
      this.salidaPendiente = [];
      this.salidaTocada = false;
      this.descartar("sustituido");
    }
    const q = this.seqTx++;
    // LLA1111B: con reparto, cada fragmento cabe en una ventana del carril (nunca tapa a la voz más de una escritura).
    const mtuEnlace = this.d.transporte.mtu?.() ?? null;
    const mtu = this.reparto ? Math.min(mtuEnlace ?? Infinity, mtuParaVentana(this.ventana())) : mtuEnlace;
    const frags = fragmentar(this.d.idLlamada, q, this.codecTx, f, mtu);
    if (!frags) {
      this.descartar("trocear");
      this.forzarClave = true;
      return;
    }
    if (f.clave) this.txClave++;
    const nuevos = frags.map((fr, k) => ({ txt: armarFragmento(fr), ultimo: k === frags.length - 1 }));
    this.producidoBytes += nuevos.reduce((a, x) => a + x.txt.length, 0);
    this.producidoFotos++;
    if (encolarDetras) {
      this.salidaPendiente.push(...nuevos);
      this.salidaBytes += nuevos.reduce((a, x) => a + x.txt.length, 0);
    } else {
      this.salidaPendiente = nuevos;
      this.salidaBytes = nuevos.reduce((a, x) => a + x.txt.length, 0);
      this.salidaDesde = ahora;
    }
    this.vaciarSalida(ahora);
  }

  private cadaSegundo(): void {
    if (!this.activa) return;
    const ahora = this.d.reloj.ahora();
    // Saludo hasta oír al otro.
    if (!this.holaRecibido && this.holasEnviadas < 8) this.saludar();
    if (this.reparto) this.pasoReparto(ahora);
    const nuevo = this.reparto ? null : this.ctrl.tic(ahora, this.d.transporte.capacidadKbps?.() ?? null);
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
    // LLA1111B: informe del receptor (lo que llega entero y lo que se pierde) para que el otro ajuste su tasa.
    if (this.reparto || this.rxPaq > 0) {
      if (!this.ultimoInforme) this.ultimoInforme = ahora;
      if (ahora - this.ultimoInforme >= PERIODO_INFORME_MS && (this.rxInformeVis || this.rxInformePer)) {
        this.ultimoInforme = ahora;
        this.d.transporte.enviar(armarControlVideo({ s: this.d.idLlamada, k: "rep", vis: this.rxInformeVis, per: this.rxInformePer }));
        this.rxInformeVis = 0;
        this.rxInformePer = 0;
      }
    }
    // Fotogramas por segundo de verdad, en los dos sentidos (para la línea de estado).
    if (!this.txVentanaDesde) this.txVentanaDesde = ahora;
    if (ahora - this.txVentanaDesde >= 2000) {
      const seg = (ahora - this.txVentanaDesde) / 1000;
      const antes = `${this.txFpsReal}/${this.rxFpsReal}`;
      this.txFpsReal = Math.round((this.txVentanaFotos / seg) * 10) / 10;
      this.rxFpsReal = Math.round((this.rxVentanaFotos / seg) * 10) / 10;
      this.txKbpsReal = this.ultimoResumen?.videoKbps ?? this.txKbpsReal;
      this.txVentanaFotos = 0;
      this.rxVentanaFotos = 0;
      this.txVentanaDesde = ahora;
      if (this.reparto && antes !== `${this.txFpsReal}/${this.rxFpsReal}`) this.avisar();
    }
    if (!this.ultimoLog) this.ultimoLog = ahora;
    if (ahora - this.ultimoLog >= PERIODO_CONTADORES_MS) this.anotarContadores(ahora);
  }

  /** LLA1111B: bytes que el vídeo puede tener en el carril delante de la voz ahora. */
  private ventana(): number {
    return ventanaBytes(this.medidor?.modelo ?? null, this.d.transporte.capacidadKbps?.() ?? null);
  }

  /** LLA1111B: mira el carril (cada 20 ms) y mete los fragmentos que quepan en la ventana. */
  private marcapasos(): void {
    if (!this.activa || !this.medidor) return;
    const t = this.d.transporte;
    const ahora = this.d.reloj.ahora();
    try {
      this.medidor.muestra(ahora, { cola: t.colaVozBytes?.() ?? 0, entrados: t.bytesEntrados?.() ?? 0 });
    } catch {
      /* contadores no disponibles un instante */
    }
    if (this.salidaPendiente.length && t.abierto()) this.vaciarSalida(ahora);
  }

  /** LLA1111B: un paso del control con lo medido en el último segundo. */
  private pasoReparto(ahora: number): void {
    const rep = this.reparto;
    const med = this.medidor;
    if (!rep || !med) return;
    const r = med.cerrarVentana(ahora);
    this.ultimoResumen = r;
    const enviando = !!this.fuente && !!this.codecTx;
    // El informe del receptor caduca a los 6 s.
    const perdida = ahora - this.perdidaReceptorEn <= 6000 ? this.perdidaReceptor : null;
    // ¿El vídeo quiere más? Se quedó sin fichas, o el escalón siguiente ya no cabe en el objetivo.
    const sig = this.escalera[this.ctrl.indice + 1];
    const limitado = this.limitado || (enviando && (r.videoKbps >= 0.6 * rep.objetivoKbps || (!!sig && this.coste.prevision(sig) > rep.objetivoKbps)));
    this.limitado = false;
    const antes = rep.estado;
    // Sin cámara no hay nada que repartir: el control se queda quieto (la voz va sola).
    const cambio = enviando ? rep.paso(ahora, { enlace: r, limitado, perdidaReceptor: perdida }) : null;
    if (cambio) {
      this.motivoCambio = cambio.motivo;
      if (cambio.estado === "pausa" && antes !== "pausa") {
        this.salidaPendiente = [];
        this.salidaTocada = false;
        this.cubeta.vaciar();
        this.d.transporte.enviar(armarControlVideo({ s: this.d.idLlamada, k: "pausa", m: cambio.motivo }));
        this.d.anotar?.(`video-datos pausa motivo=${cambio.motivo} cabe=${r.maxKbps ?? "?"}kbps voz=${r.vozKbps}kbps retraso=${r.retrasoMaxMs}ms calma-pedida=${rep.calmaPedidaS}s`);
      } else if (cambio.estado === "activo" && antes === "pausa") {
        this.forzarClave = true;
        this.d.transporte.enviar(armarControlVideo({ s: this.d.idLlamada, k: "sigue" }));
        this.d.anotar?.(`video-datos sigue motivo=${cambio.motivo} cabe=${r.maxKbps ?? "?"}kbps voz=${r.vozKbps}kbps retraso=${r.retrasoMaxMs}ms`);
      }
      this.avisar();
    }
    const reiniciarProducido = () => {
      this.producidoBytes = 0;
      this.producidoFotos = 0;
    };
    // El escalón sale del objetivo y de lo que CUESTA de verdad cada escalón en el carril (ver `CosteEscalon`): así un
    // códec que gasta menos de lo configurado deja subir los fps, y uno que gasta más los baja antes de pasarse.
    if (enviando && rep.estado === "activo") {
      const p0 = this.ctrl.perfil();
      // Por fotograma (no por segundo): si se saltaron capturas por falta de sitio, el coste no parece menor de lo que es.
      if (this.producidoFotos > 0) this.coste.medir((this.producidoBytes / this.producidoFotos) * 8 * p0.fps / 1000, p0, this.producidoFotos);
      const idx = this.coste.escalon(rep.objetivoKbps, this.escalera, this.ctrl.indice, ahora);
      if (this.ctrl.fijarIndice(idx)) {
        const p = this.ctrl.perfil();
        this.d.anotar?.(`video-datos perfil=${textoPerfil(p, this.codecTx)} motivo=${cambio?.motivo ?? this.motivoCambio} coste=x${this.coste.factor.toFixed(2)}`);
        try {
          this.codificador?.configurar(p);
        } catch {
          /* noop */
        }
        // Cambiar de tamaño obliga a un clave; cambiar solo los fps, no.
        if (p.w !== p0.w || p.h !== p0.h) this.forzarClave = true;
        if (this.fuente) this.programarTic();
        this.avisar();
      }
    }
    reiniciarProducido();
    if (!this.ultimoLogReparto) this.ultimoLogReparto = ahora;
    if (ahora - this.ultimoLogReparto >= PERIODO_CONTADORES_MS || (cambio && cambio.estado !== antes)) {
      this.ultimoLogReparto = ahora;
      this.d.anotar?.(
        // Cabe en una línea del registro (200 caracteres): kbps salvo donde se dice.
        `video-datos reparto ${rep.estado} motivo=${this.motivoCambio} kbps obj=${rep.objetivoKbps} voz=${r.vozKbps} video=${r.videoKbps} cabe=${r.maxKbps ?? "?"} enlace=${r.modelo ? `${Math.round(r.modelo.bytesPorMs * 8)}+${r.modelo.rMs}ms` : "?"} espera-voz=${r.retrasoMaxMs}ms vent=${this.ventana()}B coste=x${this.coste.factor.toFixed(1)} fps=${this.txFpsReal}${perdida !== null ? ` perd-rx=${Math.round(perdida * 100)}%` : ""}${this.pausadoOtro ? " otro=pausa" : ""}`,
      );
    }
  }

  /** Contadores de cada sentido para el registro (`video-datos tx …` / `video-datos rx …`). */
  contadores(): { tx: ContadoresVideoTx; rx: ContadoresVideoRx } {
    const dg = this.fuente?.diagnostico?.();
    return {
      tx: { capturados: this.txCap, codificados: this.txCod, enviados: this.txEnv, descartados: this.txDesc, clave: this.txClave, kbps: this.txKbps, negros: dg?.negros ?? 0, erroresCodec: this.txErrores, motivos: { ...this.motivos } },
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
      this.d.anotar?.(`video-datos tx capturados=${tx.capturados} codificados=${tx.codificados} enviados=${tx.enviados} descartados=${tx.descartados} clave=${tx.clave} kbps=${tx.kbps} negros=${tx.negros}${tx.descartados ? ` motivos=${textoMotivos(tx.motivos)}` : ""}`);
      // LLA1110C: por qué la cámara no dio imagen, y en qué estado está su <video> (WKWebView lo pausa si no lo ve).
      if (this.sinImagen && Object.keys(this.sinImagen).length) {
        this.d.anotar?.(`video-datos fuente sin-imagen=${textoMotivos(this.sinImagen)} pausada=${dg?.pausada ? "si" : "no"} listo=${dg?.listo ?? "?"} viva=${dg?.vivo ? "si" : "no"}${dg?.errorPlay ? ` play="${limpiar(dg.errorPlay)}"` : ""}`);
      }
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
    // LLA1111B: el otro pausó a propósito: no se le piden claves (al reanudar manda uno).
    if (this.pausadoOtro) return;
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
      this.rxInformeVis++;
      this.rxVentanaFotos++;
      this.ultimoW = r.frame.w;
      this.ultimoH = r.frame.h;
      if (this.pausadoOtro) {
        // Llega imagen: el otro ya no está en pausa (por si se perdió el «sigue»).
        this.pausadoOtro = false;
        this.avisar();
      }
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
      this.rxInformePer++;
      this.pedirClave();
    } else if (this.reasm.necesitaClave && !f.clave) {
      // Llegan diferenciales sin tener clave: se pide uno (la primera vez, al empezar).
      this.pedirClave();
    }
  }

  private alControl(c: { k: "hola" | "kf" | "fin" | "pausa" | "sigue" | "rep"; dec?: CodecVideo[]; vis?: number; per?: number; m?: string }): void {
    if (c.k === "pausa" || c.k === "sigue") {
      const p = c.k === "pausa";
      if (p !== this.pausadoOtro) {
        this.pausadoOtro = p;
        this.d.anotar?.(p ? `video-datos otro-en-pausa motivo=${c.m ?? "?"} (se queda el último fotograma)` : "video-datos otro-sigue");
        this.avisar();
      }
      return;
    }
    if (c.k === "rep") {
      const vis = c.vis ?? 0;
      const per = c.per ?? 0;
      if (vis + per > 0) {
        this.perdidaReceptor = per / (vis + per);
        this.perdidaReceptorEn = this.d.reloj.ahora();
      }
      return;
    }
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
    this.bajaMarcapasos?.();
    this.bajaMarcapasos = null;
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
