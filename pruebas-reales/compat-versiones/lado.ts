/**
 * LLA1114B · Un lado de la llamada («una neurona») con el código de UN árbol: la voz por datos (`SesionVozDatos`) y el vídeo
 * ligero (`SesionVideoDatos`) DE VERDAD, que son los módulos que hablan en el enlace; lo demás (micro, códecs, cámara,
 * pantalla) es de mentira y determinista. `correr.mjs` empaqueta este archivo una vez por árbol (el de trabajo, el último
 * publicado, `9e489e8d^`) con `@/` apuntando a ESE árbol y carga cada lado como un módulo aparte (como dos aparatos: nada
 * de estado de módulo compartido entre los dos lados, p. ej. la reserva de la voz).
 *
 * Solo usa lo que existe desde LLA1111Q en `src/lib/llamadas` y lo opcional lo mira antes de llamarlo: así sirve también
 * para árboles viejos. Sin navegador, sin Node más allá de lo estándar.
 */
import { SesionVozDatos } from "@/lib/llamadas/voz-datos/sesion";
import { SesionVideoDatos } from "@/lib/llamadas/video-datos/sesion-video";
import * as Transporte from "@/lib/llamadas/voz-datos/transporte";
import * as Paquete from "@/lib/llamadas/voz-datos/paquete";

/** Unidades de 20 ms (y la marca de tiempo) que trae un paquete de voz, en cualquier formato que entienda ESTE árbol. */
export function unidadesVoz(t: string, ahora: number): { ts: number; unidades: number[] } | null {
  const f = (Paquete as Cualquiera).unidadesPaqueteVoz;
  return typeof f === "function" ? f(t, ahora) : null;
}

type Cualquiera = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const TRAMA = 320; // 20 ms a 16 kHz

/* ── Voz: micro de mentira (un tono que no es silencio) y Opus de mentira que pesa lo que pide la escalera ── */
function audioFalso(cuenta: { reproducidas: number; conSonido: number }) {
  let cb: ((pcm: Int16Array) => void) | null = null;
  return {
    async iniciar(f: (pcm: Int16Array) => void) {
      cb = f;
      return true;
    },
    reproducir(pcm: Int16Array) {
      cuenta.reproducidas++;
      let s = 0;
      for (let i = 0; i < pcm.length; i += 8) s += Math.abs(pcm[i]);
      if (s / Math.max(1, pcm.length / 8) > 500) cuenta.conSonido++;
    },
    detener() {
      cb = null;
    },
    /** El banco empuja una trama de 20 ms (el reloj del banco hace de AudioWorklet). */
    trama(q: number) {
      if (!cb) return;
      const pcm = new Int16Array(TRAMA);
      for (let i = 0; i < TRAMA; i++) pcm[i] = Math.round(4000 * Math.sin((2 * Math.PI * 440 * (q * TRAMA + i)) / 16000));
      cb(pcm);
    },
  };
}

function codecsFalsos() {
  return {
    soportados: () => ["opus", "adpcm", "mulaw"],
    tramaLargaOpus: () => true,
    codificador(c: string) {
      let kbps = 24;
      let msTrama = 20;
      let cb: (b: Uint8Array, meta?: { q: number; n: number }) => void = () => undefined;
      let junto: { q: number; n: number } | null = null;
      let auto = 0;
      return {
        codificar(_pcm: Int16Array, q?: number) {
          const u = typeof q === "number" ? q : auto++;
          if (!junto) junto = { q: u, n: 0 };
          junto.n++;
          const unidades = c === "opus" ? Math.max(1, Math.round(msTrama / 20)) : 1;
          if (junto.n < unidades) return;
          const bytes = c === "opus" ? Math.max(8, Math.round((kbps * 1000 * junto.n * 20) / 8000)) : c === "adpcm" ? 164 : 320;
          const b = new Uint8Array(bytes);
          b[0] = junto.n; // cuántas unidades de 20 ms lleva (el decodificador de mentira lo lee)
          for (let i = 1; i < bytes; i++) b[i] = (i * 17 + u) & 255;
          const meta = { q: junto.q, n: junto.n };
          junto = null;
          cb(b, meta);
        },
        alSalir(f: (b: Uint8Array, meta?: { q: number; n: number }) => void) {
          cb = f;
        },
        ajustar(n: { kbps: number; msTrama: number }) {
          kbps = n.kbps;
          msTrama = n.msTrama;
        },
        cerrar() {},
      };
    },
    decodificador(c: string) {
      let cb: (pcm: Int16Array, q: number) => void = () => undefined;
      return {
        decodificar(b: Uint8Array, q: number) {
          const n = c === "opus" ? Math.max(1, b[0] || 1) : 1;
          const pcm = new Int16Array(TRAMA * n);
          for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round(4000 * Math.sin((2 * Math.PI * 440 * i) / 16000));
          cb(pcm, q);
        },
        alPcm(f: (pcm: Int16Array, q: number) => void) {
          cb = f;
        },
        cerrar() {},
      };
    },
  };
}

/* ── Vídeo: cámara, códec y pantalla de mentira (los fotogramas pesan lo que pide el perfil) ── */
function fabricaVideoFalsa() {
  return {
    codificables: () => ["vp8"],
    decodificables: () => ["vp8"],
    codificador(c: string) {
      let perfil: Cualquiera = null;
      let cb: (f: Cualquiera) => void = () => undefined;
      return {
        codec: c,
        configurar(p: Cualquiera) {
          perfil = p;
        },
        codificar(f: { ts: number; w: number; h: number }, clave: boolean) {
          const kbps = perfil?.kbps ?? 30;
          const fps = perfil?.fps ?? 4;
          const delta = Math.max(80, Math.round((kbps * 1000) / 8 / fps));
          const n = clave ? delta * 3 : delta;
          const bytes = new Uint8Array(n);
          for (let i = 0; i < n; i++) bytes[i] = (i * 31 + (clave ? 1 : 2)) & 255;
          cb({ clave, bytes, ts: f.ts, w: f.w, h: f.h });
        },
        alSalir(f: (x: Cualquiera) => void) {
          cb = f;
        },
        cerrar() {},
      };
    },
    decodificador() {
      let img: (i: Cualquiera) => void = () => undefined;
      return {
        decodificar(f: Cualquiera) {
          img({ imagen: { ts: f.ts }, w: f.w, h: f.h });
        },
        alImagen(f: (i: Cualquiera) => void) {
          img = f;
        },
        alError() {},
        cerrar() {},
      };
    },
  };
}

function fuenteFalsa(reloj: Cualquiera) {
  return {
    capturar(w: number, h: number) {
      return { imagen: {}, w, h, ts: reloj.ahora() };
    },
    cerrar() {},
  } as Cualquiera;
}

/** Lo que el banco ve de cada lado. */
export interface Lado {
  iniciar(): Promise<void>;
  /** Una trama de 20 ms del micro (la llama el reloj del banco). */
  tramaMicro(q: number): void;
  detener(): void;
  medida(): { pintadas: number[]; reproducidas: number; conSonido: number; vozRx: number };
  /** `vozOcupada` de este árbol (lo que el transporte de la app dice «ocupado»), o null si no la tiene. */
  vozOcupada: ((c: number, u: number, v: number | undefined, a: number) => boolean) | null;
  /** Lo acordado con el otro (null en un árbol sin anuncio o si aún no llegó). */
  acuerdo(): unknown;
}

export function crearLado(o: { idLlamada: string; transporte: Cualquiera; reloj: Cualquiera; anotar: (h: string) => void }): Lado {
  const cuenta = { reproducidas: 0, conSonido: 0 };
  const pintadas: number[] = [];
  const audio = audioFalso(cuenta);
  const voz: Cualquiera = new SesionVozDatos({ idLlamada: o.idLlamada, transporte: o.transporte, audio: audio as Cualquiera, codecs: codecsFalsos() as Cualquiera, reloj: o.reloj, anotar: (h: string) => o.anotar(`voz ${h}`) } as Cualquiera);
  const salida = {
    stream: null,
    pintar() {
      pintadas.push(o.reloj.ahora());
    },
    cerrar() {},
  } as Cualquiera;
  const video: Cualquiera = new SesionVideoDatos({ idLlamada: o.idLlamada, transporte: o.transporte, codecs: fabricaVideoFalsa() as Cualquiera, salida, reloj: o.reloj, anotar: (h: string) => o.anotar(`video ${h}`) } as Cualquiera);
  // Como el motor (`revisarCesionVoz`, LLA1112A): con mi vídeo en pausa por falta de sitio, mi voz cede.
  let cedida = false;
  const revisar = () => {
    const ev = video.estado?.();
    const mando = !!ev && ev.activa && (ev.enviando || !!ev.pausado);
    if (mando && ev?.pausado) cedida = true;
    if (!mando) cedida = false;
    try {
      voz.cederAlVideo?.(cedida);
    } catch {
      /* como el motor */
    }
  };
  return {
    async iniciar() {
      await voz.iniciar();
      video.suscribir?.(revisar);
      video.iniciar();
      video.ponerFuente(fuenteFalsa(o.reloj));
    },
    tramaMicro: (q) => audio.trama(q),
    detener() {
      try {
        video.detener();
      } catch {
        /* nada */
      }
      try {
        voz.detener();
      } catch {
        /* nada */
      }
    },
    medida: () => ({ pintadas, reproducidas: cuenta.reproducidas, conSonido: cuenta.conSonido, vozRx: voz.estado?.().recibidas ?? 0 }),
    vozOcupada: typeof (Transporte as Cualquiera).vozOcupada === "function" ? (Transporte as Cualquiera).vozOcupada : null,
    acuerdo: () => (typeof voz.acuerdoCapacidades === "function" ? voz.acuerdoCapacidades() : null),
  };
}
