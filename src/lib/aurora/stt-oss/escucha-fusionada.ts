/**
 * StarSeed OS — Escucha fusionada del oído (Ola 1015V oído G). Contrato:
 * architecture/voz-fusionada-astraura.md §3 y §8. Tramos por el detector de
 * energía de `oss-stt.ts` (silencio 800 ms, tramo ≤ 30 s), elector POR TRAMO
 * (fase «final») y transcripción Whisper-compatible del demonio. Nada lanza.
 */
import { elegirOido, MOTORES_OIDO, type OpcionesEleccionOido, type ResultadoOido } from "@/lib/aurora/stt-oss/motores-oido";
import { transcribirOpenAI, type ResultadoTranscripcion } from "@/lib/aurora/stt-oss/oido-openai";
import { pcmAWav } from "@/lib/protomolecula/conv-binarios";
/** Demonio de voz local (127.0.0.1:4500) y medidores del oído (`medidasOido`). */
export const DEMONIO_VOZ = "http://127.0.0.1:4500";
export const SILENCIO_TRAMO_MS = 800;
export const TRAMO_MAX_MS = 30000;
export const ENERGIA_VOZ = 0.012;
/** Bloque del oyente (PCM mono + instante + tasa si se sabe) y tramo cerrado. */
export interface BloqueAudio { pcm: Float32Array; ms: number; tasa?: number; }
export interface TramoAudio { pcm: Float32Array; ms: number; duracionMs: number; }
/** Maquina de tramos: abre por energía; `bloque` dice el tramo que se cerró. */
export interface SegmentadorOido { bloque: (b: BloqueAudio) => TramoAudio | null; hablando: () => boolean; }

/** Corta por energía: abre por umbral, histéresis 0,6; silencio 800 ms o 30 s cierra; clic < 350 ms fuera. */
export function crearSegmentador(o?: { silencioMs?: number; tramoMaxMs?: number; umbral?: number }): SegmentadorOido {
  const sil = o?.silencioMs ?? SILENCIO_TRAMO_MS, maxMs = o?.tramoMaxMs ?? TRAMO_MAX_MS, umbral = o?.umbral ?? ENERGIA_VOZ;
  let hablando = false, inicio = 0, ultima = 0, muestras = 0, trozos: Float32Array[] = [];
  return {
    bloque: (b) => {
      try {
        if (!(b?.pcm instanceof Float32Array)) return null;
        let suma = 0;
        for (let i = 0; i < b.pcm.length; i++) suma += b.pcm[i] * b.pcm[i];
        const energia = Math.sqrt(suma / (b.pcm.length || 1)), ms = Number.isFinite(b.ms) ? b.ms : Date.now();
        if (!hablando && energia < umbral) return null;
        if (!hablando) { hablando = true; inicio = ms; ultima = ms; trozos = []; muestras = 0; }
        trozos.push(new Float32Array(b.pcm)); muestras += b.pcm.length;
        if (energia >= umbral * 0.6) ultima = ms;
        if (ms - ultima < sil && ms - inicio < maxMs) return null;
        const pcm = new Float32Array(muestras); let en = 0;
        for (const t of trozos) { pcm.set(t, en); en += t.length; }
        hablando = false; trozos = []; muestras = 0;
        return ultima - inicio < 350 ? null : { pcm, ms, duracionMs: ultima - inicio };
      } catch { return null; }
    },
    hablando: () => hablando,
  };
}

/** ¿Toma el turno la escucha fusionada? Sin SR del navegador, siempre; con él, solo si
 * ESTA neurona mide un motor mejor (menor retraso de oído) que el propio navegador. */
export function caminoFusionado(o: { hayReconocimientoNavegador: boolean; medidas?: Record<string, number> }): boolean {
  if (!o.hayReconocimientoNavegador) return true;
  const navegador = o.medidas?.navegador;
  return typeof navegador === "number" &&
    Object.entries(o.medidas ?? {}).some(([motor, ms]) => motor !== "navegador" && ms < navegador);
}

/** Datos de un tramo para transcribir: pcm y tasa, idioma, nombres y fetch inyectable. */
export interface InfoTranscripcionTramo {
  motor: string; pcm: Float32Array; sampleRate?: number; idioma?: string; hotwords?: string[];
  demonio?: string; fetchImpl?: typeof fetch;
}

export const MOTORES_TRAMO = ["phonon-2", "parakeet-v3", "vibeasr-158"] as const; // con API Whisper-compatible

/** Tramo → WAV (el `pcmAWav` de Protomolécula) → API Whisper-compatible. */
export async function transcribirPorDemonio(info: InfoTranscripcionTramo): Promise<ResultadoTranscripcion> {
  if (!(MOTORES_TRAMO as readonly string[]).includes(info.motor)) {
    return { ok: false, motivo: `${info.motor} no queda tras la API de tramos del demonio` };
  }
  try {
    const bytes = new Uint8Array(info.pcm.buffer, info.pcm.byteOffset, info.pcm.byteLength);
    const wav = new Blob([pcmAWav(bytes, { frecuencia: info.sampleRate ?? 16000 })], { type: "audio/wav" });
    return await transcribirOpenAI(wav, { base: info.demonio ?? DEMONIO_VOZ, modelo: info.motor, idioma: info.idioma,
      hotwords: info.hotwords, fetchImpl: info.fetchImpl, timeoutMs: 20000 });
  } catch { return { ok: false, motivo: "la transcripción del tramo falló de forma inesperada" }; }
}

export interface OpcionesEscuchaFusionada {
  /** Empieza la captura y entrega cada bloque a `entregame`; devuelve el soltar. */
  obtenerAudio: (entregame: (b: BloqueAudio) => void) => Promise<{ soltar: () => void }>;
  /** Elector y transcriptor inyectables (por defecto: `elegirOido` y el demonio). */
  elegir?: (opciones: OpcionesEleccionOido) => ResultadoOido;
  transcribir?: (info: InfoTranscripcionTramo) => Promise<ResultadoTranscripcion>;
  /** Señal de «hay voz»: el parcial real lo da el navegador (§3.1); error no fatal por `alError`. */
  alParcial?: (texto: string) => void; alFinal?: (texto: string) => void; alError?: (motivo: string) => void;
  idiomaPista?: string; hotwords?: string[];
}

/** Sesión viviente: `parar` idempotente; `activa` dice si sigue viva. */
export interface EscuchaFusionada { parar: () => void; activa: () => boolean; }

/** Escucha fusionada: tramos → elector fase «final» → transcribir → alFinal. */
export function escucharFusionado(opciones: OpcionesEscuchaFusionada): EscuchaFusionada {
  let parada = true, lista = false, ultimoParcialMs = 0, tasa: number | undefined, soltarCaptura: (() => void) | null = null;
  const seg = crearSegmentador(), pista = (opciones.idiomaPista || "es").trim().toLowerCase().split(/[-_]/)[0];
  const idioma = /^[a-z]{2,3}$/.test(pista) ? pista : "es";
  const elegir = opciones.elegir ?? ((o: OpcionesEleccionOido) => elegirOido(o)), transcribir = opciones.transcribir ?? transcribirPorDemonio;
  const aviso = (motivo: string) => { try { opciones.alError?.(motivo); } catch { /* */ } };
  /** Tramo cerrado → elector → transcribir → alFinal (nunca lanza). */
  const transcribirTramo = (pcm: Float32Array) => {
    void (async () => {
      try {
        const eleccion = elegir({ idioma, disponibles: MOTORES_OIDO.map((m) => m.id), fase: "final" });
        const res = await transcribir({ motor: eleccion.motor, pcm, sampleRate: tasa, idioma, hotwords: opciones.hotwords });
        if (res.ok && res.texto.trim()) { try { opciones.alFinal?.(res.texto); } catch { /* */ } }
        else if (!res.ok) aviso(`el tramo quedó sin texto (${eleccion.motor}): ${res.motivo}`);
      } catch { aviso("el tramo no se pudo transcribir"); }
    })();
  };
  void (async () => {
    try {
      const fuente = await opciones.obtenerAudio((b) => {
        if (parada || !lista) return;
        try {
          tasa = typeof b.tasa === "number" ? b.tasa : tasa;
          const tramo = seg.bloque(b);
          if (seg.hablando() && b.ms - ultimoParcialMs >= 400) {
            ultimoParcialMs = b.ms; try { opciones.alParcial?.("…"); } catch { /* */ }
          }
          if (tramo) transcribirTramo(tramo.pcm);
        } catch { aviso("un bloque raro no tumba la escucha"); }
      });
      if (parada) { try { fuente.soltar(); } catch { /* */ } return; }
      soltarCaptura = () => { try { fuente.soltar(); } catch { /* */ } };
      lista = true;
    } catch { aviso("no se pudo oír: sin captura de audio"); }
  })();
  return {
    parar: () => { parada = true; lista = false; try { soltarCaptura?.(); } catch { /* */ } soltarCaptura = null; },
    activa: () => !parada,
  };
}
