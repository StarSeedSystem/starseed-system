/**
 * Dobles de prueba de la grabadora: pistas, flujos, MediaRecorder, reloj y entorno del navegador.
 * Solo los importan las pruebas (`__tests__`); la aplicación no. Sin DOM ni `vitest`: así sirven
 * tanto en las pruebas puras (entorno node) como en las de componentes (jsdom).
 */

import type { DepsControlador } from "./controlador";
import type { EntornoGrabacion } from "./soporte";

type Oyente = () => void;

export class PistaFalsa {
  readyState: "live" | "ended" = "live";
  detenida = false;
  private oyentes = new Map<string, Set<Oyente>>();
  constructor(
    public kind: "video" | "audio",
    private ajustes: Record<string, unknown> = {},
  ) {}
  stop() {
    this.detenida = true;
    this.readyState = "ended";
  }
  getSettings() {
    return this.ajustes;
  }
  addEventListener(tipo: string, fn: Oyente) {
    if (!this.oyentes.has(tipo)) this.oyentes.set(tipo, new Set());
    this.oyentes.get(tipo)!.add(fn);
  }
  removeEventListener(tipo: string, fn: Oyente) {
    this.oyentes.get(tipo)?.delete(fn);
  }
  /** Simula, p. ej., el botón «Dejar de compartir» del navegador. */
  emitir(tipo: string) {
    this.oyentes.get(tipo)?.forEach((f) => f());
  }
}

export class FlujoFalso {
  constructor(public pistas: PistaFalsa[] = []) {}
  getTracks() {
    return this.pistas;
  }
  getVideoTracks() {
    return this.pistas.filter((p) => p.kind === "video");
  }
  getAudioTracks() {
    return this.pistas.filter((p) => p.kind === "audio");
  }
}

export function flujoDePantalla(opts: { audio?: boolean; superficie?: string; ancho?: number; alto?: number } = {}): FlujoFalso {
  const pistas = [new PistaFalsa("video", { width: opts.ancho ?? 1920, height: opts.alto ?? 1080, displaySurface: opts.superficie ?? "monitor" })];
  if (opts.audio) pistas.push(new PistaFalsa("audio"));
  return new FlujoFalso(pistas);
}
export const flujoDeCamara = () => new FlujoFalso([new PistaFalsa("video", { width: 1280, height: 720 })]);
export const flujoDeMicro = () => new FlujoFalso([new PistaFalsa("audio")]);

export class GrabadorFalso {
  static soportados: string[] = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp9", "video/webm"];
  static instancias: GrabadorFalso[] = [];
  static isTypeSupported(mime: string) {
    return GrabadorFalso.soportados.includes(mime);
  }
  static reiniciar(soportados?: string[]) {
    GrabadorFalso.instancias = [];
    if (soportados) GrabadorFalso.soportados = soportados;
  }

  state: "inactive" | "recording" | "paused" = "inactive";
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  llamadas: string[] = [];
  /** Bytes que entrega al parar (0 = salida vacía). */
  bytesAlParar = 2048;

  constructor(
    public flujo: FlujoFalso,
    public opciones: { mimeType?: string; videoBitsPerSecond?: number; audioBitsPerSecond?: number } = {},
  ) {
    this.mimeType = opciones.mimeType ?? "video/webm";
    GrabadorFalso.instancias.push(this);
  }
  start(trozoMs?: number) {
    this.llamadas.push(`start:${trozoMs ?? ""}`);
    this.state = "recording";
  }
  pause() {
    this.llamadas.push("pause");
    this.state = "paused";
  }
  resume() {
    this.llamadas.push("resume");
    this.state = "recording";
  }
  stop() {
    this.llamadas.push("stop");
    if (this.state === "inactive") throw new Error("InvalidStateError");
    this.state = "inactive";
    queueMicrotask(() => {
      if (this.bytesAlParar > 0) this.ondataavailable?.({ data: new Blob([new Uint8Array(this.bytesAlParar)], { type: this.mimeType }) });
      this.onstop?.();
    });
  }
  /** Simula un trozo periódico. */
  trozo(bytes: number) {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)], { type: this.mimeType }) });
  }
}

export class ContextoAudioFalso {
  static creados = 0;
  cerrado = false;
  fuentes: number[] = [];
  constructor() {
    ContextoAudioFalso.creados += 1;
  }
  createMediaStreamDestination() {
    const stream = new FlujoFalso([new PistaFalsa("audio")]);
    return { stream };
  }
  createMediaStreamSource(flujo: FlujoFalso) {
    this.fuentes.push(flujo.pistas.length);
    return { connect() {} };
  }
  async resume() {}
  async close() {
    this.cerrado = true;
  }
}

/** Reloj controlado a mano: intervalos y esperas que solo avanzan con `avanzar()`. */
export class RelojFalso {
  ahora = 1000;
  private siguiente = 1;
  private tareas = new Map<number, { cada?: number; en: number; fn: () => void }>();
  setInterval = (fn: () => void, ms: number) => {
    const id = this.siguiente++;
    this.tareas.set(id, { cada: ms, en: this.ahora + ms, fn });
    return id;
  };
  clearInterval = (id: unknown) => {
    this.tareas.delete(id as number);
  };
  setTimeout = (fn: () => void, ms: number) => {
    const id = this.siguiente++;
    this.tareas.set(id, { en: this.ahora + ms, fn });
    return id;
  };
  clearTimeout = (id: unknown) => {
    this.tareas.delete(id as number);
  };
  avanzar(ms: number) {
    const meta = this.ahora + ms;
    for (;;) {
      let proximo: [number, { cada?: number; en: number; fn: () => void }] | null = null;
      for (const t of this.tareas) if (t[1].en <= meta && (!proximo || t[1].en < proximo[1].en)) proximo = t;
      if (!proximo) break;
      const [id, tarea] = proximo;
      this.ahora = tarea.en;
      if (tarea.cada) tarea.en += tarea.cada;
      else this.tareas.delete(id);
      tarea.fn();
    }
    this.ahora = meta;
  }
  get pendientes() {
    return this.tareas.size;
  }
}

export const UA_CHROME_ESCRITORIO =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
export const UA_SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
export const UA_CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
export const UA_FIREFOX_ESCRITORIO = "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0";
export const UA_SAFARI_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

export interface MedioFalso {
  getDisplayMedia?: (c?: unknown) => Promise<FlujoFalso>;
  getUserMedia?: (c: { video?: unknown; audio?: unknown }) => Promise<FlujoFalso>;
  getSupportedConstraints?: () => Record<string, unknown>;
}

export function entornoFalso(parcial: Partial<EntornoGrabacion> = {}): EntornoGrabacion {
  return {
    mediaDevices: {
      getDisplayMedia: async () => flujoDePantalla(),
      getUserMedia: async (c: { video?: unknown }) => (c.video ? flujoDeCamara() : flujoDeMicro()),
      getSupportedConstraints: () => ({}),
    },
    MediaRecorder: GrabadorFalso,
    AudioContext: ContextoAudioFalso,
    contextoSeguro: true,
    userAgent: UA_CHROME_ESCRITORIO,
    plataforma: "Win32",
    puntosTactiles: 0,
    ...parcial,
  } as EntornoGrabacion;
}

export interface ElementoFalso {
  tag: string;
  srcObject: unknown;
  muted: boolean;
  playsInline: boolean;
  videoWidth: number;
  videoHeight: number;
  width: number;
  height: number;
  play(): Promise<void>;
  pause(): void;
  addEventListener(): void;
  removeEventListener(): void;
  getContext(tipo: string): unknown;
  captureStream(): FlujoFalso;
  toBlob(cb: (b: Blob | null) => void): void;
  dibujos: number;
}

export function elementoFalso(tag: string): ElementoFalso {
  const el: ElementoFalso = {
    tag,
    srcObject: null,
    muted: false,
    playsInline: false,
    videoWidth: tag === "video" ? 1920 : 0,
    videoHeight: tag === "video" ? 1080 : 0,
    width: 0,
    height: 0,
    dibujos: 0,
    async play() {},
    pause() {},
    addEventListener() {},
    removeEventListener() {},
    getContext() {
      return {
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 1,
        fillRect() {},
        drawImage() {
          el.dibujos += 1;
        },
        save() {},
        restore() {},
        beginPath() {},
        arc() {},
        clip() {},
        stroke() {},
      };
    },
    captureStream() {
      return new FlujoFalso([new PistaFalsa("video", { width: el.width, height: el.height })]);
    },
    toBlob(cb) {
      cb(new Blob([new Uint8Array(512)], { type: "image/png" }));
    },
  };
  return el;
}

export interface DepsFalsas extends DepsControlador {
  reloj: RelojFalso;
  urls: string[];
  revocadas: string[];
  elementos: ElementoFalso[];
  latidos: Array<{ cb: () => void; fps: number; parado: boolean }>;
}

export function depsFalsas(parcial: Partial<EntornoGrabacion> = {}): DepsFalsas {
  const reloj = new RelojFalso();
  const urls: string[] = [];
  const revocadas: string[] = [];
  const elementos: ElementoFalso[] = [];
  const latidos: DepsFalsas["latidos"] = [];
  return {
    reloj,
    urls,
    revocadas,
    elementos,
    latidos,
    entorno: entornoFalso(parcial),
    ahora: () => reloj.ahora,
    fecha: () => new Date(2026, 9, 26, 15, 30),
    crearFlujo: (pistas) => new FlujoFalso(pistas as unknown as PistaFalsa[]) as unknown as MediaStream,
    crearElemento: (tag) => {
      const el = elementoFalso(tag);
      elementos.push(el);
      return el;
    },
    crearUrl: () => {
      const u = `blob:falso/${urls.length + 1}`;
      urls.push(u);
      return u;
    },
    revocarUrl: (u) => {
      revocadas.push(u);
    },
    latido: (cb, fps) => {
      const l = { cb, fps, parado: false };
      latidos.push(l);
      return () => {
        l.parado = true;
      };
    },
    temporizador: {
      setInterval: reloj.setInterval,
      clearInterval: reloj.clearInterval,
      setTimeout: reloj.setTimeout,
      clearTimeout: reloj.clearTimeout,
    },
  };
}
