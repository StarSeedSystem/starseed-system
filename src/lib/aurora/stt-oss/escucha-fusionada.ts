/**
 * StarSeed OS — Escucha fusionada por TRAMOS (tarea VZF1015G, Ola 1015V).
 * Contrato: architecture/voz-fusionada-astraura.md §3-§4. Oído por tramos para cuando
 * el navegador no tiene reconocimiento o hay un oído LOCAL medido mejor: corta el
 * audio con el detector de `oss-stt.ts` (silencio 800 ms, tramo ≤ 30 s), pide al
 * elector el motor «final» de CADA tramo y transcribe con lo inyectado
 * (`transcribirOpenAI` o el demonio). El parcial real lo sigue dando el navegador
 * (regla 1 del §3). Nada lanza: un tramo tumbado no detiene la escucha.
 */
import type { ResultadoOido } from "@/lib/aurora/stt-oss/motores-oido";

export const SILENCIO_MS = 800, TRAMO_MS_MAX = 30000, VOZ_MS_MIN = 350; // VAD de `oss-stt.ts`
const SUELO_MIN = 0.004, SUELO_MAX = 0.08, FACTOR = 2.4, MARGEN = 0.006;
const LIBERA = 0.6, SUAVIZA = 0.995;

/** Tramo ya cortado; `EncajeVad` es lo que devuelve el detector por bloque. */
export interface TramoAudio { audio: Float32Array; sampleRate: number; ms: number; }
export interface EncajeVad { tipo: "nada" | "voz" | "tramo"; tramo?: TramoAudio; }
export interface FuenteAudio { parar: () => void; } // la fuente al parar no retiene el micrófono
/** Elector «final» ligado y transcriptor (`transcribirOpenAI` o el demonio `/asr`). */
export type ElectorFinal = (p: { idioma: string; fase: "final" }) => ResultadoOido;
export type Transcriptor = (tramo: TramoAudio, motor: string, extra: { idioma: string; hotwords: string[] }) => Promise<string>;
/** Opciones de `escucharFusionado` (todo inyectable, nada oculto). */
export interface OpcionesEscuchaFusionada {
  obtenerAudio: (alBloque: (bloque: Float32Array, sampleRate: number) => void) => FuenteAudio;
  elegir: ElectorFinal;
  transcribir: Transcriptor;
  alParcial: (texto: string) => void; // aviso de voz (el parcial real lo da el navegador)
  alFinal: (texto: string) => void; // texto FINAL del tramo (vacío si no entendió)
  idiomaPista?: string; // pista del idioma (§3 regla 2: el idioma lo decide el audio)
  hotwords?: string[]; // palabras propias (Astraura, StarSeed…)
}
export interface EscuchaFusionada { parar: () => void; }

// ── VAD por tramos (detector de energía, mismo algoritmo que `oss-stt.ts`) ────
type OpcionesVad = { silencioMs?: number; tramoMsMax?: number; vozMsMin?: number };

/** Puro: se crea con el ritmo del stream y se le dan bloques (ni DOM ni relojes). */
export function crearVadTramos(sampleRate: number, opciones?: OpcionesVad) {
  const silencioMs = opciones?.silencioMs ?? SILENCIO_MS, tramoMsMax = opciones?.tramoMsMax ?? TRAMO_MS_MAX, vozMsMin = opciones?.vozMsMin ?? VOZ_MS_MIN;
  let hablando = false, desdeUltimaVoz = 0, suelo = SUELO_MIN, trozos: Float32Array[] = [], msTramo = 0;
  /** Cierra el tramo en curso (o lo tira si quedó demasiado corto). */
  const cerrar = (): TramoAudio | null => {
    const audio = trozos, ms = msTramo;
    trozos = []; msTramo = 0; hablando = false; desdeUltimaVoz = 0;
    if (ms < vozMsMin || audio.length === 0) return null;
    const fusion = new Float32Array(audio.reduce((n, t) => n + t.length, 0));
    audio.reduce((off, t) => { fusion.set(t, off); return off + t.length; }, 0);
    return { audio: fusion, sampleRate, ms };
  };
  const procesar = (bloque: Float32Array): EncajeVad => {
    let suma = 0;
    for (let i = 0; i < bloque.length; i++) { const s = bloque[i]; suma += s * s; }
    const rms = Math.sqrt(suma / (bloque.length || 1));
    const tasa = bloque.length ? (bloque.length / sampleRate) * 1000 : 0; // ms del bloque
    const inicio = Math.min(SUELO_MAX * FACTOR, suelo * FACTOR + MARGEN);
    const hayVoz = hablando ? rms >= inicio * LIBERA : rms >= inicio;
    if (!hablando && !hayVoz) { // silencio real: el suelo se adapta MUY despacio
      suelo = Math.min(SUELO_MAX, Math.max(SUELO_MIN, SUAVIZA * suelo + (1 - SUAVIZA) * rms));
      return { tipo: "nada" };
    }
    if (!hablando) { // empieza la voz (sin pre-roll: suficiente para el oído por tramos)
      hablando = true; trozos = []; desdeUltimaVoz = 0; msTramo = tasa; // ya lleva su primer bloque
      trozos.push(new Float32Array(bloque)); // no perdemos la primera sílaba
      return { tipo: "voz" };
    }
    trozos.push(new Float32Array(bloque));
    msTramo += tasa;
    desdeUltimaVoz = hayVoz ? 0 : desdeUltimaVoz + tasa;
    if (desdeUltimaVoz >= silencioMs || (hayVoz && msTramo >= tramoMsMax)) { // silencio o monólogo largo: se corta
      const tramo = cerrar();
      return tramo ? { tipo: "tramo", tramo } : { tipo: "nada" };
    }
    return { tipo: "nada" };
  };
  return { procesar, cortar: () => (hablando ? (cerrar() ? "tramo" : "nada") : "nada") };
}

/** WAV PCM16 mono, lo que espera un endpoint compatible con Whisper. Puro. */
export function blobWav(tramo: TramoAudio, tipo = "audio/wav"): Blob {
  const n = tramo.audio.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const texto = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  texto(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); texto(8, "WAVE");
  texto(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, tramo.sampleRate, true); v.setUint32(28, tramo.sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); texto(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { // PCM16 con recorte, igual que `oido-flujo.ts`
    const s = Math.max(-1, Math.min(1, tramo.audio[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: tipo });
}

/**
 * escucharFusionado — el oído único por tramos: de uno en uno en cola, sin
 * detenerse por un transcriptor tumbado. «navegador»/«malla»/«whisper-web»
 * como final no se transcriben (no hay endpoint que llamar).
 */
export function escucharFusionado(opciones: OpcionesEscuchaFusionada): EscuchaFusionada {
  let detenida = false, cadena: Promise<unknown> = Promise.resolve();
  let vad: ReturnType<typeof crearVadTramos> | null = null;
  const fuente = opciones.obtenerAudio((bloque, sampleRate) => {
    if (detenida) return; // parada: lo que llegue ya no me importa
    try {
      if (!vad) vad = crearVadTramos(sampleRate);
      const encaje = vad.procesar(bloque);
      // «voz» sólo llega en el arranque de un tramo: un aviso por frase.
      if (encaje.tipo === "voz") try { opciones.alParcial("…"); } catch { /* la UI puede fallar; el oído no */ }
      if (encaje.tipo !== "tramo" || !encaje.tramo) return;
      const tramo = encaje.tramo, idioma = opciones.idiomaPista || "es";
      const eleccion = opciones.elegir({ idioma, fase: "final" });
      const motor = eleccion && typeof eleccion.motor === "string" ? eleccion.motor : "vibeasr-158";
      if (motor === "navegador" || motor === "malla" || motor === "whisper-web") return; // suelo del elector
      const trabajo = async () => {
        const texto = (await opciones.transcribir(tramo, motor, { idioma, hotwords: opciones.hotwords ?? [] })) || "";
        if (!detenida) try { opciones.alFinal(texto); } catch { /* la UI puede fallar; el oído no */ }
      };
      // Uno en cola a la vez; si uno cae, la escucha sigue (nada lanza).
      cadena = cadena.then(trabajo).catch(() => { /* tramo no entendido: sigo oyendo */ });
    } catch { /* elector o bloque tumbado: sigo oyendo */ }
  });
  return { parar: () => { if (!detenida) { detenida = true; try { fuente.parar(); } catch { /* */ } } } };
}
