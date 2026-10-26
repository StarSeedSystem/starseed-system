/**
 * Controlador de la grabadora (sin React): getDisplayMedia/getUserMedia + MediaRecorder.
 * ─────────────────────────────────────────────────────────────────────────────
 * Vive FUERA de los componentes (ver `global.ts`) para que la grabación siga si se cambia de
 * sección o se cierra el panel del Centro de Control. Todo lo del navegador entra por
 * `DepsControlador`, así que se prueba entero con un MediaRecorder y unos flujos de mentira.
 *
 * Reglas:
 *   · Los permisos se piden SOLO dentro de `iniciar()` (que la persona dispara al pulsar). La
 *     pantalla va primero y sin ningún `await` antes: el navegador exige el gesto reciente.
 *   · Cámara y micrófono son opcionales: si fallan se graba sin ellos y se AVISA; nunca se
 *     cancela una grabación de pantalla por eso.
 *   · Cerrar el selector de pantalla no es un error: vuelve a «inactiva» con un aviso.
 *   · Lo que de verdad entra (micrófono, sonido del sistema, cámara) se mide en los flujos
 *     recibidos y se cuenta tal cual, no como se pidió.
 */

import { mezclarAudio } from "./audio";
import {
  crearComposicion,
  prepararVideo,
  type LienzoMinimo,
  type VideoMinimo,
} from "./composicion";
import { elegirFormato, extensionDeMime, mimeBase, type FormatoElegido } from "./formato";
import { duracionMs, estaOcupada, reducir, type EventoGrabadora } from "./maquina";
import { consejoSinPantalla, detectarSoporte, type EntornoGrabacion, type SoporteGrabacion } from "./soporte";
import { explicarFalloMedios, nombreArchivo } from "./texto";
import {
  BPS_AUDIO,
  CALIDADES,
  INSTANTANEA_INICIAL,
  LIMITE_AUTOPARADA_BYTES,
  TROZO_MS,
  type Instantanea,
  type OpcionesGrabacion,
  type PerfilCalidad,
  type ResultadoGrabacion,
  type SuperficieGrabada,
} from "./tipos";

export type ConstructorGrabador = (new (flujo: MediaStream, opciones?: MediaRecorderOptions) => MediaRecorder) & {
  isTypeSupported?: (mime: string) => boolean;
};

export interface DepsControlador {
  entorno: EntornoGrabacion;
  /** Reloj en ms (monótono). */
  ahora: () => number;
  fecha: () => Date;
  crearFlujo: (pistas: MediaStreamTrack[]) => MediaStream;
  crearElemento: (tag: "video" | "canvas") => unknown;
  crearUrl: (blob: Blob) => string;
  revocarUrl: (url: string) => void;
  latido: (cb: () => void, fps: number) => () => void;
  /** Tope de memoria de una grabación (por defecto 400 MB); las pruebas lo bajan. */
  limiteAutoparadaBytes?: number;
  temporizador: {
    setInterval: (fn: () => void, ms: number) => unknown;
    clearInterval: (id: unknown) => void;
    setTimeout: (fn: () => void, ms: number) => unknown;
    clearTimeout: (id: unknown) => void;
  };
}

export type ResultadoCaptura = { ok: true } | { ok: false; mensaje: string };

export interface Controlador {
  obtener(): Instantanea;
  suscribir(fn: () => void): () => void;
  /** Cuántas vistas escuchan ahora (0 = el panel está cerrado). */
  observadores(): number;
  soporte(): SoporteGrabacion;
  iniciar(opciones: OpcionesGrabacion): Promise<void>;
  pausar(): void;
  reanudar(): void;
  parar(): Promise<void>;
  /** Cancela la espera del selector o la cuenta atrás (antes de que empiece a grabar). */
  cancelar(): void;
  descartar(): void;
  descartarCaptura(): void;
  /** Un fotograma de la pantalla a PNG: del flujo vivo si se está grabando, o pidiendo uno. */
  capturarImagen(): Promise<ResultadoCaptura>;
  duracion(): number;
}

interface Sesion {
  pantalla: MediaStream | null;
  camara: MediaStream | null;
  micro: MediaStream | null;
  flujos: MediaStream[];
  grabador: MediaRecorder | null;
  formato: FormatoElegido;
  trozos: Blob[];
  bytes: number;
  limpiezas: Array<() => void>;
  idCuenta: unknown;
  idEspera: unknown;
  parando: boolean;
  finalizado: boolean;
  conAudio: boolean;
  ancho?: number;
  alto?: number;
}

const nuevaSesion = (): Sesion => ({
  pantalla: null,
  camara: null,
  micro: null,
  flujos: [],
  grabador: null,
  formato: { mimeType: undefined, extension: "webm", contenedor: "webm" },
  trozos: [],
  bytes: 0,
  limpiezas: [],
  idCuenta: null,
  idEspera: null,
  parando: false,
  finalizado: false,
  conAudio: false,
});

/** Espera máxima entre `recorder.stop()` y su evento `stop` antes de cerrar a la fuerza. */
const ESPERA_STOP_MS = 5000;

export function restriccionesPantalla(op: OpcionesGrabacion, cal: PerfilCalidad): Record<string, unknown> {
  return {
    video: { frameRate: { ideal: cal.fps, max: 30 } },
    audio: op.sonidoSistema ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
    ...(op.sonidoSistema ? { systemAudio: "include" } : {}),
  };
}

export function restriccionesCamara(cal: PerfilCalidad): MediaTrackConstraints {
  return { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: cal.fps }, facingMode: "user" };
}

export function crearControlador(deps: DepsControlador): Controlador {
  let estado: Instantanea = INSTANTANEA_INICIAL;
  const oyentes = new Set<() => void>();
  let sesion: Sesion | null = null;

  const despachar = (ev: EventoGrabadora) => {
    const siguiente = reducir(estado, ev);
    if (siguiente === estado) return;
    estado = siguiente;
    for (const fn of Array.from(oyentes)) fn();
  };

  const liberarResultado = (r: ResultadoGrabacion | null) => {
    if (!r) return;
    try {
      deps.revocarUrl(r.url);
    } catch {
      /* ya revocada */
    }
  };

  /** Para todo lo que la sesión tiene abierto. Idempotente. */
  const liberarSesion = (s: Sesion) => {
    if (s.idCuenta !== null) deps.temporizador.clearInterval(s.idCuenta);
    if (s.idEspera !== null) deps.temporizador.clearTimeout(s.idEspera);
    s.idCuenta = null;
    s.idEspera = null;
    const g = s.grabador;
    if (g) {
      g.ondataavailable = null;
      g.onerror = null;
      g.onstop = null;
      try {
        if (g.state !== "inactive") g.stop();
      } catch {
        /* ya parado */
      }
    }
    for (const limpiar of s.limpiezas.splice(0)) {
      try {
        limpiar();
      } catch {
        /* */
      }
    }
    for (const f of s.flujos) {
      for (const pista of f.getTracks()) {
        try {
          pista.stop();
        } catch {
          /* */
        }
      }
    }
    s.flujos = [];
  };

  const fallar = (s: Sesion, mensaje: string) => {
    liberarSesion(s);
    if (sesion === s) sesion = null;
    despachar({ tipo: "FALLO", mensaje });
  };

  const finalizar = (s: Sesion) => {
    if (s.finalizado) return;
    s.finalizado = true;
    const mime = mimeBase(s.grabador?.mimeType || s.formato.mimeType);
    const duracion = estado.acumuladoMs;
    const trozos = s.trozos.slice();
    const conAudio = s.conAudio;
    const { ancho, alto } = s;
    liberarSesion(s);
    if (sesion === s) sesion = null;
    const blob = new Blob(trozos, { type: mime });
    if (blob.size === 0) {
      despachar({ tipo: "FALLO", mensaje: "La grabación salió vacía: el navegador no entregó imagen. Vuelve a probar." });
      return;
    }
    const extension = extensionDeMime(mime);
    despachar({
      tipo: "LISTO",
      resultado: {
        tipo: "video",
        blob,
        url: deps.crearUrl(blob),
        mimeType: mime,
        extension,
        nombre: nombreArchivo("video", deps.fecha(), extension),
        bytes: blob.size,
        duracionMs: duracion,
        ancho,
        alto,
        conAudio,
      },
    });
  };

  const empezar = (s: Sesion) => {
    if (sesion !== s || estado.fase !== "cuenta-atras" || !s.grabador) return;
    try {
      s.grabador.start(TROZO_MS);
    } catch {
      fallar(s, "No se pudo empezar a grabar con este formato. Vuelve a probar.");
      return;
    }
    despachar({ tipo: "EMPEZAR", ahora: deps.ahora() });
  };

  const arrancarCuenta = (s: Sesion, segundos: number) => {
    if (segundos <= 0) {
      empezar(s);
      return;
    }
    s.idCuenta = deps.temporizador.setInterval(() => {
      if (sesion !== s) return;
      despachar({ tipo: "TICK_CUENTA" });
      if (estado.cuenta <= 0) {
        if (s.idCuenta !== null) deps.temporizador.clearInterval(s.idCuenta);
        s.idCuenta = null;
        empezar(s);
      }
    }, 1000);
  };

  const parar = async (): Promise<void> => {
    const s = sesion;
    if (!s || s.parando || (estado.fase !== "grabando" && estado.fase !== "pausada")) return;
    s.parando = true;
    despachar({ tipo: "PARAR", ahora: deps.ahora() });
    const g = s.grabador;
    if (!g || g.state === "inactive") {
      finalizar(s);
      return;
    }
    // Si el navegador no manda `stop`, se cierra con lo que haya llegado.
    s.idEspera = deps.temporizador.setTimeout(() => finalizar(s), ESPERA_STOP_MS);
    try {
      g.stop();
    } catch {
      finalizar(s);
    }
  };

  const iniciar = async (op: OpcionesGrabacion): Promise<void> => {
    if (estado.fase !== "inactiva" && estado.fase !== "lista" && estado.fase !== "error") return;
    liberarResultado(estado.resultado);
    despachar({ tipo: "PEDIR" });

    const soporte = detectarSoporte(deps.entorno);
    if (op.fuente === "pantalla" ? !soporte.pantalla : !soporte.camara) {
      const motivo = soporte.motivoSinPantalla;
      despachar({
        tipo: "FALLO",
        mensaje: op.fuente === "pantalla" && motivo ? consejoSinPantalla(motivo).titulo : "Este navegador no puede usar la cámara aquí.",
      });
      return;
    }

    const s = nuevaSesion();
    sesion = s;
    const md = deps.entorno.mediaDevices as unknown as MediaDevices;
    const cal = CALIDADES[op.calidad];
    const avisos: string[] = [];
    const Grabador = deps.entorno.MediaRecorder as unknown as ConstructorGrabador;
    const cancelada = () => sesion !== s;

    try {
      // 1 · Pantalla: lo PRIMERO y sin await antes (el navegador exige el gesto de la persona).
      if (op.fuente === "pantalla") {
        try {
          s.pantalla = await md.getDisplayMedia(restriccionesPantalla(op, cal) as DisplayMediaStreamOptions);
        } catch (e) {
          if (cancelada()) return;
          const f = explicarFalloMedios(e, "pantalla");
          liberarSesion(s);
          sesion = null;
          despachar(f.cancelado ? { tipo: "SIN_PERMISO", aviso: f.mensaje } : { tipo: "FALLO", mensaje: f.mensaje });
          return;
        }
        s.flujos.push(s.pantalla);
        if (cancelada()) {
          liberarSesion(s);
          return;
        }
      }

      // 2 · Cámara (sola, o para superponer).
      if (op.fuente === "camara" || op.camaraSuperpuesta) {
        try {
          s.camara = await md.getUserMedia({ video: restriccionesCamara(cal), audio: false });
          s.flujos.push(s.camara);
        } catch (e) {
          if (cancelada()) return;
          const f = explicarFalloMedios(e, "camara");
          if (op.fuente === "camara") {
            liberarSesion(s);
            sesion = null;
            despachar({ tipo: "FALLO", mensaje: f.mensaje });
            return;
          }
          avisos.push(`${f.mensaje} Se graba sin la cámara.`);
        }
        if (cancelada()) {
          liberarSesion(s);
          return;
        }
      }

      // 3 · Micrófono.
      if (op.microfono) {
        try {
          s.micro = await md.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false,
          });
          s.flujos.push(s.micro);
        } catch (e) {
          if (cancelada()) return;
          avisos.push(`${explicarFalloMedios(e, "microfono").mensaje} Se graba sin micrófono.`);
        }
        if (cancelada()) {
          liberarSesion(s);
          return;
        }
      }

      // 4 · Vídeo de la grabación (directo, o la pantalla con la cámara dibujada encima).
      let pistaVideo: MediaStreamTrack | undefined;
      let superficie: SuperficieGrabada = "camara";
      let conCamara = false;
      if (op.fuente === "pantalla" && s.pantalla) {
        const base = s.pantalla.getVideoTracks()[0];
        if (!base) {
          fallar(s, "El navegador no entregó imagen de la pantalla.");
          return;
        }
        const ajustes = (base.getSettings?.() ?? {}) as MediaTrackSettings & { displaySurface?: string };
        superficie = ajustes.displaySurface === "window" || ajustes.displaySurface === "browser" ? ajustes.displaySurface : "monitor";
        s.ancho = ajustes.width;
        s.alto = ajustes.height;
        pistaVideo = base;
        if (op.camaraSuperpuesta && s.camara) {
          try {
            const comp = await crearComposicion(
              {
                pantalla: s.pantalla,
                camara: s.camara,
                ancho: ajustes.width ?? 1280,
                alto: ajustes.height ?? 720,
                fps: cal.fps,
                posicion: op.posicionCamara,
                tamano: op.tamanoCamara,
              },
              { crearElemento: deps.crearElemento, latido: deps.latido },
            );
            s.limpiezas.push(() => comp.detener());
            pistaVideo = comp.pista;
            s.ancho = comp.ancho;
            s.alto = comp.alto;
            conCamara = true;
          } catch {
            avisos.push("No se pudo superponer la cámara; se graba solo la pantalla.");
          }
          if (cancelada()) {
            liberarSesion(s);
            return;
          }
        }
      } else if (s.camara) {
        pistaVideo = s.camara.getVideoTracks()[0];
        const ajustes = (pistaVideo?.getSettings?.() ?? {}) as MediaTrackSettings;
        s.ancho = ajustes.width;
        s.alto = ajustes.height;
        conCamara = true;
      }
      if (!pistaVideo) {
        fallar(s, "El navegador no entregó imagen para grabar.");
        return;
      }

      // 5 · Audio: sonido del sistema + micrófono, mezclados si son dos.
      const audioSistema = s.pantalla?.getAudioTracks() ?? [];
      if (op.sonidoSistema && op.fuente === "pantalla" && audioSistema.length === 0) {
        avisos.push("El navegador no compartió el sonido. Al elegir qué compartir, marca «Compartir audio» (solo Chrome y Edge de escritorio lo ofrecen).");
      }
      const mezcla = mezclarAudio(
        deps.entorno.AudioContext,
        [...audioSistema, ...(s.micro?.getAudioTracks() ?? [])],
        deps.crearFlujo,
      );
      s.limpiezas.push(mezcla.cerrar);
      if (mezcla.descartadas > 0) {
        avisos.push("Este navegador no puede mezclar el sonido del sistema con el micrófono: se graba solo el sonido del sistema.");
      }
      s.conAudio = mezcla.pistas.length > 0;
      const conSonidoSistema = audioSistema.length > 0;
      const conMicrofono = !!s.micro && s.micro.getAudioTracks().length > 0 && mezcla.descartadas === 0;

      // 6 · La grabadora.
      s.formato = elegirFormato(Grabador.isTypeSupported ? (m) => Grabador.isTypeSupported!(m) : null, s.conAudio, op.formato);
      const flujoFinal = deps.crearFlujo([pistaVideo, ...mezcla.pistas]);
      const opciones: MediaRecorderOptions = {
        ...(s.formato.mimeType ? { mimeType: s.formato.mimeType } : {}),
        videoBitsPerSecond: cal.bps,
        ...(s.conAudio ? { audioBitsPerSecond: BPS_AUDIO } : {}),
      };
      try {
        s.grabador = new Grabador(flujoFinal, opciones);
      } catch {
        try {
          s.grabador = new Grabador(flujoFinal);
        } catch {
          fallar(s, "Este navegador no pudo preparar la grabadora. Vuelve a probar con otra calidad.");
          return;
        }
      }
      const grabador = s.grabador;
      grabador.ondataavailable = (e: BlobEvent) => {
        if (!e.data || e.data.size === 0 || s.finalizado) return;
        s.trozos.push(e.data);
        s.bytes += e.data.size;
        despachar({ tipo: "BYTES", bytes: s.bytes });
        if (s.bytes >= (deps.limiteAutoparadaBytes ?? LIMITE_AUTOPARADA_BYTES) && !s.parando && sesion === s) {
          despachar({ tipo: "AVISO", aviso: "La grabación se detuvo sola al llegar a 400 MB para no agotar la memoria del aparato." });
          void parar();
        }
      };
      grabador.onstop = () => {
        // El navegador la paró por su cuenta (p. ej. la fuente se cerró): se cierra con lo grabado.
        if (!s.parando && (estado.fase === "grabando" || estado.fase === "pausada")) {
          s.parando = true;
          despachar({ tipo: "PARAR", ahora: deps.ahora() });
        }
        finalizar(s);
      };
      grabador.onerror = () => {
        if (sesion === s && !s.finalizado) fallar(s, "La grabadora del navegador dejó de funcionar. Vuelve a probar.");
      };

      // Si la persona pulsa «Dejar de compartir» (o desenchufa la cámara), se cierra con lo grabado.
      const alTerminarFuente = () => {
        if (sesion !== s) return;
        if (estado.fase === "grabando" || estado.fase === "pausada") void parar();
        else if (estado.fase === "cuenta-atras" || estado.fase === "preparando") cancelar();
      };
      const pistaFuente = (op.fuente === "pantalla" ? s.pantalla : s.camara)?.getVideoTracks()[0];
      pistaFuente?.addEventListener("ended", alTerminarFuente);

      despachar({
        tipo: "PERMISO_OK",
        cuentaAtras: op.cuentaAtras,
        superficie,
        conMicrofono,
        conSonidoSistema,
        conCamara,
        mimeType: s.formato.mimeType ?? null,
        avisos,
      });
      arrancarCuenta(s, op.cuentaAtras);
    } catch {
      if (sesion === s) fallar(s, "No se pudo preparar la grabación. Vuelve a probar.");
      else liberarSesion(s);
    }
  };

  const cancelar = (): void => {
    const s = sesion;
    if (estado.fase !== "preparando" && estado.fase !== "cuenta-atras") return;
    sesion = null;
    if (s) liberarSesion(s);
    despachar({ tipo: "CANCELAR" });
  };

  const pausar = (): void => {
    const s = sesion;
    if (!s?.grabador || estado.fase !== "grabando") return;
    try {
      s.grabador.pause();
    } catch {
      return;
    }
    despachar({ tipo: "PAUSAR", ahora: deps.ahora() });
  };

  const reanudar = (): void => {
    const s = sesion;
    if (!s?.grabador || estado.fase !== "pausada") return;
    try {
      s.grabador.resume();
    } catch {
      return;
    }
    despachar({ tipo: "REANUDAR", ahora: deps.ahora() });
  };

  const capturarImagen = async (): Promise<ResultadoCaptura> => {
    const soporte = detectarSoporte(deps.entorno);
    if (!soporte.pantalla) {
      return { ok: false, mensaje: soporte.motivoSinPantalla ? consejoSinPantalla(soporte.motivoSinPantalla).titulo : "Este navegador no puede capturar la pantalla." };
    }
    let flujo: MediaStream | null = sesion?.pantalla ?? null;
    let propio = false;
    if (!flujo) {
      if (estaOcupada(estado)) return { ok: false, mensaje: "Espera a que termine la grabación en curso." };
      try {
        const md = deps.entorno.mediaDevices as unknown as MediaDevices;
        flujo = await md.getDisplayMedia({ video: true, audio: false });
        propio = true;
      } catch (e) {
        return { ok: false, mensaje: explicarFalloMedios(e, "pantalla").mensaje };
      }
    }
    const video = deps.crearElemento("video") as VideoMinimo;
    try {
      video.muted = true;
      video.playsInline = true;
      video.srcObject = flujo;
      await prepararVideo(video);
      const ajustes = (flujo.getVideoTracks()[0]?.getSettings?.() ?? {}) as MediaTrackSettings;
      const ancho = video.videoWidth || ajustes.width || 0;
      const alto = video.videoHeight || ajustes.height || 0;
      if (!ancho || !alto) return { ok: false, mensaje: "No llegó imagen de la pantalla. Vuelve a probar." };
      const lienzo = deps.crearElemento("canvas") as LienzoMinimo;
      lienzo.width = ancho;
      lienzo.height = alto;
      const ctx = lienzo.getContext("2d");
      if (!ctx || !lienzo.toBlob) return { ok: false, mensaje: "Este navegador no puede guardar la captura como imagen." };
      ctx.drawImage(video, 0, 0, ancho, alto);
      const blob = await new Promise<Blob | null>((resolver) => lienzo.toBlob!((b) => resolver(b), "image/png"));
      if (!blob) return { ok: false, mensaje: "No se pudo convertir la captura en imagen." };
      liberarResultado(estado.captura);
      despachar({
        tipo: "CAPTURA",
        captura: {
          tipo: "imagen",
          blob,
          url: deps.crearUrl(blob),
          mimeType: "image/png",
          extension: "png",
          nombre: nombreArchivo("imagen", deps.fecha(), "png"),
          bytes: blob.size,
          duracionMs: 0,
          ancho,
          alto,
        },
      });
      return { ok: true };
    } catch {
      return { ok: false, mensaje: "No se pudo hacer la captura. Vuelve a probar." };
    } finally {
      try {
        video.pause?.();
        video.srcObject = null;
      } catch {
        /* */
      }
      if (propio && flujo) for (const pista of flujo.getTracks()) pista.stop();
    }
  };

  return {
    obtener: () => estado,
    suscribir(fn) {
      oyentes.add(fn);
      return () => {
        oyentes.delete(fn);
      };
    },
    observadores: () => oyentes.size,
    soporte: () => detectarSoporte(deps.entorno),
    iniciar,
    pausar,
    reanudar,
    parar,
    cancelar,
    descartar() {
      liberarResultado(estado.resultado);
      despachar({ tipo: "DESCARTAR" });
    },
    descartarCaptura() {
      liberarResultado(estado.captura);
      despachar({ tipo: "DESCARTAR_CAPTURA" });
    },
    capturarImagen,
    duracion: () => duracionMs(estado, deps.ahora()),
  };
}
