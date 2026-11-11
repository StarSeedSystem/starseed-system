"use client";

/**
 * voz-datos/audio-web — micro y altavoz de la voz por enlace de datos, con AudioWorklet (LLA1108E).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Funciona en WKWebView (macOS/iOS) y en Android WebView: solo AudioContext + AudioWorklet (con un
 * respaldo a ScriptProcessor si el worklet no carga) y, para Opus, WebCodecs `AudioEncoder`/`AudioDecoder`
 * SOLO donde `isConfigSupported` lo confirme (si no, ADPCM; ver `codec.ts`).
 *  · Captura: micro (la pista de la llamada) → worklet → bloques de 128 muestras → tramas de 20 ms a 16 kHz mono.
 *  · Reproducción: tramas de 20 ms → worklet con su pequeña cola (≤ 240 ms) → destino del AudioContext. El
 *    encaminamiento a altavoz o auricular lo decide el sistema (LLA1108D: `useLlamadaNativa`), como en WebRTC.
 * Nunca lanza.
 */
import { aFloat32, aInt16, FS_VOZ, MS_TRAMA, MUESTRAS_TRAMA, remuestrear, type CodecVoz } from "./codec";
import { fabricaCodecsSimples, type AudioVoz, type CodificadorVoz, type DecodificadorVoz, type FabricaCodecs } from "./sesion";

const FUENTE_WORKLET = `
class SsCaptura extends AudioWorkletProcessor {
  process(inputs) {
    const c = inputs[0] && inputs[0][0];
    if (c) this.port.postMessage(c.slice(0));
    return true;
  }
}
registerProcessor('ss-captura', SsCaptura);
class SsReproduce extends AudioWorkletProcessor {
  constructor() {
    super();
    this.cola = [];
    this.cur = null;
    this.pos = 0;
    this.port.onmessage = (e) => {
      this.cola.push(e.data);
      while (this.cola.length > 12) this.cola.shift();
    };
  }
  process(_i, outputs) {
    const out = outputs[0][0];
    let i = 0;
    while (i < out.length) {
      if (!this.cur || this.pos >= this.cur.length) {
        this.cur = this.cola.shift() || null;
        this.pos = 0;
        if (!this.cur) break;
      }
      out[i++] = this.cur[this.pos++];
    }
    for (; i < out.length; i++) out[i] = 0;
    return true;
  }
}
registerProcessor('ss-reproduce', SsReproduce);
`;

interface GlobalAudio {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

export function audioWebDisponible(): boolean {
  if (typeof window === "undefined") return false;
  const g = window as unknown as GlobalAudio;
  return !!(g.AudioContext ?? g.webkitAudioContext);
}

/** Micro + altavoz sobre la pista de audio de la llamada. Null si el motor no ofrece AudioContext. */
export function crearAudioWeb(micro: MediaStream | null): AudioVoz | null {
  if (!audioWebDisponible()) return null;
  const g = window as unknown as GlobalAudio;
  const Ctx = (g.AudioContext ?? g.webkitAudioContext) as typeof AudioContext;
  let ctx: AudioContext | null = null;
  let fuente: MediaStreamAudioSourceNode | null = null;
  let nodoCaptura: AudioWorkletNode | ScriptProcessorNode | null = null;
  let nodoReproduce: AudioWorkletNode | null = null;
  let urlWorklet: string | null = null;
  let acumulado = new Float32Array(0);
  let activo = false;
  let proximo = 0;

  const cerrar = () => {
    activo = false;
    try {
      nodoCaptura?.disconnect();
      fuente?.disconnect();
      nodoReproduce?.disconnect();
    } catch {
      /* noop */
    }
    try {
      void ctx?.close();
    } catch {
      /* noop */
    }
    if (urlWorklet) {
      try {
        URL.revokeObjectURL(urlWorklet);
      } catch {
        /* noop */
      }
    }
    ctx = null;
    nodoCaptura = null;
    nodoReproduce = null;
    fuente = null;
    urlWorklet = null;
  };

  return {
    async iniciar(alTrama) {
      try {
        ctx = new Ctx({ sampleRate: FS_VOZ });
      } catch {
        try {
          ctx = new Ctx();
        } catch {
          return false;
        }
      }
      const c = ctx;
      try {
        if (c.state === "suspended") await c.resume();
      } catch {
        /* se reintenta al sonar */
      }
      const hz = c.sampleRate;
      const porTrama = Math.round((hz * MS_TRAMA) / 1000);
      const entregar = (bloque: Float32Array) => {
        if (!activo) return;
        const nuevo = new Float32Array(acumulado.length + bloque.length);
        nuevo.set(acumulado);
        nuevo.set(bloque, acumulado.length);
        acumulado = nuevo;
        while (acumulado.length >= porTrama) {
          const trama = acumulado.subarray(0, porTrama);
          acumulado = acumulado.slice(porTrama);
          const f = hz === FS_VOZ ? trama : remuestrear(trama, hz, FS_VOZ);
          const pcm = aInt16(f.length === MUESTRAS_TRAMA ? f : remuestrear(f, f.length, MUESTRAS_TRAMA));
          alTrama(pcm);
        }
      };
      const pistas = micro?.getAudioTracks() ?? [];
      if (pistas.length) {
        try {
          fuente = c.createMediaStreamSource(new MediaStream(pistas));
        } catch {
          fuente = null;
        }
      }
      activo = true;
      try {
        if (!c.audioWorklet) throw new Error("sin audioWorklet");
        urlWorklet = URL.createObjectURL(new Blob([FUENTE_WORKLET], { type: "application/javascript" }));
        await c.audioWorklet.addModule(urlWorklet);
        const cap = new AudioWorkletNode(c, "ss-captura", { numberOfInputs: 1, numberOfOutputs: 0 });
        cap.port.onmessage = (e: MessageEvent<Float32Array>) => entregar(e.data);
        fuente?.connect(cap);
        nodoCaptura = cap;
        const rep = new AudioWorkletNode(c, "ss-reproduce", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
        rep.connect(c.destination);
        nodoReproduce = rep;
      } catch {
        // Respaldo: ScriptProcessor (obsoleto, pero está en todos los motores) para capturar; sin worklet no hay
        // reproducción con cola propia, así que se reproduce con buffers encadenados.
        try {
          const sp = c.createScriptProcessor(2048, 1, 1);
          sp.onaudioprocess = (e) => entregar(new Float32Array(e.inputBuffer.getChannelData(0)));
          fuente?.connect(sp);
          sp.connect(c.destination);
          nodoCaptura = sp;
        } catch {
          cerrar();
          return false;
        }
      }
      return true;
    },

    reproducir(pcm) {
      const c = ctx;
      if (!c || !activo) return;
      const f = aFloat32(pcm);
      const salida = c.sampleRate === FS_VOZ ? f : remuestrear(f, FS_VOZ, c.sampleRate);
      if (nodoReproduce) {
        nodoReproduce.port.postMessage(salida);
        return;
      }
      // Sin worklet: un buffer por trama, programado a continuación del anterior.
      try {
        const b = c.createBuffer(1, salida.length, c.sampleRate);
        b.copyToChannel(new Float32Array(salida), 0);
        const s = c.createBufferSource();
        s.buffer = b;
        s.connect(c.destination);
        const t = Math.max(c.currentTime + 0.02, proximo);
        s.start(t);
        proximo = t + b.duration;
      } catch {
        /* sin altavoz: se ignora esta trama */
      }
    },

    detener: cerrar,
  };
}

/* ─────────────────────────────── Opus por WebCodecs ─────────────────────────────── */

interface CodificadorNativo {
  configure(c: Record<string, unknown>): void;
  encode(d: unknown): void;
  close(): void;
}
interface DecodificadorNativo {
  configure(c: Record<string, unknown>): void;
  decode(d: unknown): void;
  close(): void;
}
interface WebCodecsGlobal {
  AudioEncoder?: { new (i: { output: (c: { byteLength: number; timestamp?: number; duration?: number | null; copyTo(b: Uint8Array): void }) => void; error: (e: unknown) => void }): CodificadorNativo & { flush?(): Promise<void> }; isConfigSupported(c: Record<string, unknown>): Promise<{ supported?: boolean }> };
  AudioDecoder?: { new (i: { output: (d: { numberOfFrames: number; timestamp: number; copyTo(b: Float32Array, o: Record<string, unknown>): void; close(): void }) => void; error: (e: unknown) => void }): DecodificadorNativo; isConfigSupported(c: Record<string, unknown>): Promise<{ supported?: boolean }> };
  AudioData?: new (i: Record<string, unknown>) => unknown;
  EncodedAudioChunk?: new (i: Record<string, unknown>) => unknown;
}

const CFG_OPUS = { codec: "opus", sampleRate: FS_VOZ, numberOfChannels: 1 } as const;

/** ¿El motor sabe codificar y decodificar Opus a 16 kHz mono, a 16–24 kbps? (si no, ADPCM). */
export async function opusWebCodecsSoportado(): Promise<boolean> {
  try {
    const w = globalThis as unknown as WebCodecsGlobal;
    if (!w.AudioEncoder || !w.AudioDecoder || !w.AudioData || !w.EncodedAudioChunk) return false;
    const [e, d] = await Promise.all([w.AudioEncoder.isConfigSupported({ ...CFG_OPUS, bitrate: 24_000 }), w.AudioDecoder.isConfigSupported(CFG_OPUS)]);
    return !!e?.supported && !!d?.supported;
  } catch {
    return false;
  }
}

/**
 * (VOZ1111J) ¿Admite el motor tramas de Opus de 60 ms y 6 kb/s (el suelo de la escalera)? Si no, la escalera se queda
 * en tramas de 20 ms (`niveles.ts`): siguen bajando los kb/s y creciendo los paquetes.
 */
async function opusTramaLargaSoportada(w: WebCodecsGlobal): Promise<boolean> {
  try {
    const r = await w.AudioEncoder!.isConfigSupported({ ...CFG_OPUS, bitrate: 6_000, opus: { frameDuration: 60_000, application: "voip" } });
    return !!r?.supported;
  } catch {
    return false;
  }
}

/** Fábrica con ADPCM/μ-law siempre y Opus donde WebCodecs lo confirme. */
export async function crearFabricaCodecsWeb(): Promise<FabricaCodecs> {
  const simples = fabricaCodecsSimples();
  const opus = await opusWebCodecsSoportado();
  if (!opus) return simples;
  const w = globalThis as unknown as WebCodecsGlobal;
  const tramaLarga = await opusTramaLargaSoportada(w);
  return {
    soportados: () => ["opus", ...simples.soportados()] as CodecVoz[],
    tramaLargaOpus: () => tramaLarga,
    codificador(c): CodificadorVoz | null {
      if (c !== "opus") return simples.codificador(c);
      try {
        let salida: (b: Uint8Array, meta?: { q: number; n: number }) => void = () => undefined;
        const US = MS_TRAMA * 1000;
        // (VOZ1111J) Un codificador por escalón: al cambiar kb/s o duración de trama se abre otro y el anterior se vacía y
        // se cierra. Las marcas de tiempo son las de la captura (unidad q × 20 ms), así cada trama sale con su sitio.
        const abrir = (kbps: number, msTrama: number) => {
          const e = new (w.AudioEncoder as NonNullable<WebCodecsGlobal["AudioEncoder"]>)({
            output: (ch) => {
              const b = new Uint8Array(ch.byteLength);
              ch.copyTo(b);
              const q = typeof ch.timestamp === "number" ? Math.round(ch.timestamp / US) : -1;
              const n = typeof ch.duration === "number" && ch.duration > 0 ? Math.max(1, Math.round(ch.duration / US)) : Math.max(1, Math.round(msTrama / MS_TRAMA));
              salida(b, q >= 0 ? { q, n } : undefined);
            },
            error: () => undefined,
          });
          e.configure({ ...CFG_OPUS, bitrate: kbps * 1000, opus: { frameDuration: msTrama * 1000, application: "voip" } });
          return e;
        };
        let actual = { kbps: 24, msTrama: MS_TRAMA };
        let enc = abrir(actual.kbps, actual.msTrama);
        let t = 0;
        return {
          codificar: (pcm, q) => {
            try {
              const ts = typeof q === "number" ? q * US : t;
              enc.encode(new (w.AudioData as NonNullable<WebCodecsGlobal["AudioData"]>)({ format: "s16", sampleRate: FS_VOZ, numberOfFrames: pcm.length, numberOfChannels: 1, timestamp: ts, data: pcm }));
              t = ts + US;
            } catch {
              /* una trama que no entra: se pierde */
            }
          },
          ajustar: (n) => {
            const msTrama = tramaLarga ? n.msTrama : MS_TRAMA;
            if (n.kbps === actual.kbps && msTrama === actual.msTrama) return;
            actual = { kbps: n.kbps, msTrama };
            const viejo = enc;
            try {
              enc = abrir(actual.kbps, actual.msTrama);
            } catch {
              enc = viejo;
              return;
            }
            const cerrar = () => {
              try {
                viejo.close();
              } catch {
                /* noop */
              }
            };
            try {
              void (viejo.flush?.() ?? Promise.resolve()).then(cerrar, cerrar);
            } catch {
              cerrar();
            }
          },
          alSalir: (f) => {
            salida = f;
          },
          cerrar: () => {
            try {
              enc.close();
            } catch {
              /* noop */
            }
          },
        };
      } catch {
        return null;
      }
    },
    decodificador(c): DecodificadorVoz | null {
      if (c !== "opus") return simples.decodificador(c);
      try {
        let salida: (p: Int16Array, q: number) => void = () => undefined;
        const dec = new (w.AudioDecoder as NonNullable<WebCodecsGlobal["AudioDecoder"]>)({
          output: (d) => {
            const f = new Float32Array(d.numberOfFrames);
            d.copyTo(f, { planeIndex: 0, format: "f32-planar" });
            const q = Math.round(d.timestamp / (MS_TRAMA * 1000));
            d.close();
            salida(aInt16(f), q);
          },
          error: () => undefined,
        });
        dec.configure(CFG_OPUS);
        return {
          // (VOZ1111J) Una trama de 40/60 ms sale entera (640/960 muestras) con la marca de su primera unidad: la sesión la parte.
          decodificar: (b, q) => {
            try {
              dec.decode(new (w.EncodedAudioChunk as NonNullable<WebCodecsGlobal["EncodedAudioChunk"]>)({ type: "key", timestamp: q * MS_TRAMA * 1000, data: b }));
            } catch {
              /* trama corrupta: el búfer de fluctuación la tapa */
            }
          },
          alPcm: (f) => {
            salida = f;
          },
          cerrar: () => {
            try {
              dec.close();
            } catch {
              /* noop */
            }
          },
        };
      } catch {
        return null;
      }
    },
  };
}
