/**
 * OÍDO FUSIONADO (Ola 1015V · G) — tramos del micrófono hacia el mejor motor.
 * Contrato: architecture/voz-fusionada-astraura.md §3. Corta el audio en tramos
 * con el detector de energía de `oss-stt.ts` (silencio 800 ms, tramo ≤ 30 s),
 * pide a `elegirOido` el motor de la fase «final» POR TRAMO y transcribe con
 * `transcribirOpenAI` o el demonio (VibeASR). El parcial sigue saliendo del
 * navegador, que es el suelo (§3.1); aquí nunca se emite. «Aurora SIEMPRE
 * habla»: nada lanza; el fallo va por `onError` y la escucha sigue. Audio,
 * elector y transcripción entran inyectados; sin reloj ni estado global.
 */
import { MOTORES_OIDO, elegirOido, type MotorOidoId, type OpcionesEleccionOido, type ResultadoOido } from "./motores-oido";
import { transcribirOpenAI, urlOidoLocal } from "./oido-openai";
import { transcribirLocal } from "./vibeasr-local";

/** Tramo de audio en crudo (del micrófono real o falso en pruebas). */
export interface TramoAudio { pcm: Float32Array; rms: number; ms: number }
/** Lo que se pide al transcriptor de un tramo. */
export interface TramoOido { pcm: Float32Array; ms: number; muestreo: number; motor: string; idioma: string; hotwords: string[] }
export type Elegidor = (opciones: OpcionesEleccionOido) => ResultadoOido;
export type Transcriptor = (tramo: TramoOido) => Promise<string | null>;

// Detector de energía: los mismos parámetros del VAD de `oss-stt.ts`.
export const SILENCIO_CIERRE_MS = 800;
export const TRAMO_MAXIMO_MS = 30000;
export const TRAMO_MINIMO_MS = 350;
export const SUELO_RUIDO_INICIAL = 0.004;
const SUELO_RUIDO_MAX = 0.08, MULT_VOZ = 2.4, MARGEN_VOZ = 0.006, SUAVIZADO = 0.995, UMBRAL_TRAMO = 0.6;

export interface EstadoTramos { enTramo: boolean; msSinVoz: number; msTramo: number }
export const estadoTramosInicial = (): EstadoTramos => ({ enTramo: false, msSinVoz: 0, msTramo: 0 });

/** ¿Hay un motor NO navegador MEDIDO mejor que el navegador en esta neurona (§3)? */
export function hayMotorOidoMejorQueNavegador(medidas: Record<string, number>): boolean {
  const navegador = medidas["navegador"];
  if (typeof navegador !== "number" || !Number.isFinite(navegador)) return false;
  return Object.keys(medidas).some((m) => m !== "navegador" && typeof medidas[m] === "number" && medidas[m] < navegador);
}

/** Un paso del corte: cambia el estado y decide si guardar el bloque y/o cerrar el tramo. */
export interface PasoTramos { estado: EstadoTramos; guardar: boolean; cerrar: boolean }
export function avanzarTramos(estado: EstadoTramos, voz: boolean, msBloque: number): PasoTramos {
  if (!estado.enTramo) {
    return voz
      ? { estado: { enTramo: true, msSinVoz: 0, msTramo: msBloque }, guardar: true, cerrar: false }
      : { estado, guardar: false, cerrar: false };
  }
  const msTramo = estado.msTramo + msBloque;
  const msSinVoz = voz ? 0 : estado.msSinVoz + msBloque;
  // Tramo ≥ 30 s o silencio del cierre (≥ 800 ms): se cierra y se transcribe.
  const cerrar = voz ? msTramo >= TRAMO_MAXIMO_MS : msSinVoz >= SILENCIO_CIERRE_MS || msTramo >= TRAMO_MAXIMO_MS;
  return { estado: cerrar ? estadoTramosInicial() : { enTramo: true, msSinVoz, msTramo }, guardar: true, cerrar };
}

export interface OpcionesEscuchaFusionada {
  elegir?: Elegidor;           // elector (por defecto `elegirOido`, fase «final» POR TRAMO)
  transcribir: Transcriptor;   // real (`transcribirTramoElegido`) o falso en pruebas
  disponibles?: MotorOidoId[]; // motores que ofrece esta neurona (por defecto, todos)
  alParcial?: (texto: string) => void; // el parcial lo sigue dando el navegador (§3.1); aquí no
  alFinal: (texto: string, motor: string) => void;
  onError?: (mensaje: string) => void;
  idiomaPista?: string;        // pista de idioma del AUDIO; nunca es imposición (§3.2)
  hotwords?: string[];
  muestreo?: number;           // muestreo del PCM entrante; por defecto 16 kHz
}

/**
 * Sesión de tramos: llega el audio por `bloque`, el corte por energía decide
 * los tramos (suelo adaptativo + histéresis), el elector elige el motor de la
 * fase «final» y el texto sale por `alFinal`. Nada lanza.
 */
export function crearEscuchaFusionada(opciones: OpcionesEscuchaFusionada): { bloque: (pcm: Float32Array, rms: number, ms: number) => void; parar: () => void } {
  const muestreo = opciones.muestreo ?? 16000;
  const idioma = (opciones.idiomaPista || "").split(/[-_]/)[0];
  const hotwords = opciones.hotwords ?? [];
  const disponibles = opciones.disponibles ?? MOTORES_OIDO.map((m) => m.id);
  let estado = estadoTramosInicial();
  let suelo = SUELO_RUIDO_INICIAL;
  let trozos: Float32Array[] = [];
  let muestras = 0;
  let parado = false;
  const cerrarTramo = () => {
    const juntas = new Float32Array(muestras);
    let w = 0;
    for (const t of trozos) { juntas.set(t, w); w += t.length; }
    const ms = muestras > 0 ? (muestras / muestreo) * 1000 : 0;
    trozos = [];
    muestras = 0;
    if (parado || ms < TRAMO_MINIMO_MS) return; // clic o ruido suelto: no se transcribe
    let motor = "navegador";
    try { motor = (opciones.elegir ?? elegirOido)({ idioma, disponibles, fase: "final" }).motor; } catch { /* el elector cae a navegador */ }
    void Promise.resolve()
      .then(() => opciones.transcribir({ pcm: juntas, ms, muestreo, motor, idioma, hotwords }))
      .then((texto) => {
        const limpio = (texto ?? "").trim();
        if (limpio && !parado) opciones.alFinal(limpio, motor);
      })
      .catch(() => { try { opciones.onError?.("No se pudo transcribir un tramo; sigo escuchando."); } catch { /* */ } });
  };
  return {
    bloque: (pcm, rms, ms) => {
      if (parado || ms <= 0) return;
      const umbral = Math.min(SUELO_RUIDO_MAX * MULT_VOZ, suelo * MULT_VOZ + MARGEN_VOZ);
      const voz = rms >= (estado.enTramo ? umbral * UMBRAL_TRAMO : umbral);
      const paso = avanzarTramos(estado, voz, ms);
      estado = paso.estado;
      if (!voz) suelo = Math.min(SUELO_RUIDO_MAX, Math.max(SUELO_RUIDO_INICIAL, SUAVIZADO * suelo + (1 - SUAVIZADO) * rms));
      if (paso.guardar) { trozos.push(pcm); muestras += pcm.length; }
      if (paso.cerrar) cerrarTramo();
    },
    parar: () => { parado = true; },
  };
}

/** Bucle con alimentación asíncrona: `obtenerAudio` da un tramo (o `null` para acabar). */
export function escucharFusionado(opciones: OpcionesEscuchaFusionada & { obtenerAudio: () => Promise<TramoAudio | null> }): { parar: () => void; cuandoTermine: Promise<void> } {
  const sesion = crearEscuchaFusionada(opciones);
  let parado = false;
  const cuandoTermine = (async () => {
    try {
      while (!parado) {
        const trozo = await opciones.obtenerAudio();
        if (!trozo) break;
        sesion.bloque(trozo.pcm, trozo.rms, trozo.ms);
      }
    } catch {
      try { opciones.onError?.("La toma del micrófono terminó de golpe."); } catch { /* */ }
    }
  })();
  return { parar: () => { parado = true; sesion.parar(); }, cuandoTermine };
}

/** Float32 mono → WAV PCM16 a 16 kHz (decimación lineal), formato común de las vías. */
export function tramoAWav(pcm: Float32Array, muestreo: number): Blob {
  const ratio = Math.max(1, muestreo / 16000);
  const pcm16 = new Int16Array(Math.max(1, Math.floor(pcm.length / ratio)));
  for (let i = 0; i < pcm16.length; i++) {
    const pos = Math.min(pcm.length - 1, Math.floor(i * ratio));
    pcm16[i] = Math.round(Math.max(-1, Math.min(1, pcm[pos])) * 0x7fff);
  }
  const v = new DataView(new ArrayBuffer(44));
  const s = (desde: number, texto: string) => { for (let i = 0; i < texto.length; i++) v.setUint8(desde + i, texto.charCodeAt(i)); };
  s(0, "RIFF"); v.setUint32(4, 36 + pcm16.length * 2, true); s(8, "WAVE"); s(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, "data"); v.setUint32(40, pcm16.length * 2, true);
  return new Blob([v.buffer, pcm16.buffer], { type: "audio/wav" });
}

/**
 * Transcriptor por defecto: servidor OpenAI-compatible (`urlOidoLocal`, Phonon-2/
 * Parakeet por el proxy local) o demonio (`/asr` de VibeASR). El motor «navegador»
 * no transcribe aquí: el parcial y el suelo son suyos.
 */
export async function transcribirTramoElegido(tramo: TramoOido): Promise<string | null> {
  if (tramo.motor === "navegador") return null;
  try {
    const wav = tramoAWav(tramo.pcm, tramo.muestreo);
    if (tramo.motor === "vibeasr-158") return (await transcribirLocal(wav)).texto || null;
    const r = await transcribirOpenAI(wav, {
      base: urlOidoLocal(tramo.motor), modelo: tramo.motor,
      idioma: tramo.idioma || undefined, hotwords: tramo.hotwords.length ? tramo.hotwords : undefined,
    });
    return r.ok ? (r.texto.trim() || null) : null;
  } catch {
    return null;
  }
}
