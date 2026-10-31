"use client";

/** ESCUCHA FUSIONADA de Astraura (Ola 1015V · VZF1015G) — contrato
 * architecture/voz-fusionada-astraura.md §3 y §4: corta el micrófono en TRAMOS
 * con el detector de energía de `oss-stt.ts` (silencio 800 ms cierra; tramo
 * ≤ 30 s) y por tramo pide al elector (`elegirOido`) el motor de la fase
 * «final»; el texto lo escribe una `transcribir` inyectada (transcribirOpenAI o
 * el demonio); el parcial real sigue dándolo el navegador (regla 1 §3) y aquí
 * solo viaja la señal «…». Libre de E/S (audio, red y reloj se inyectan), así
 * que las pruebas son secas. Ninguna función lanza (aurora-voz-motores.md). */
import { MOTORES_OIDO, elegirOido, type MotorOidoId, type OpcionesEleccionOido, type ResultadoOido } from "@/lib/aurora/stt-oss/motores-oido";
import { corregirConGlosario, glosarioBase } from "@/lib/aurora/stt-oss/glosario-oido";

export const SILENCIO_CIERRE_MS = 800; // y TRAMO_MAXIMO_MS: los umbrales del VAD de `oss-stt.ts`
export const TRAMO_MAXIMO_MS = 30000;
const PREROLL_MS = 300, SUELO_MIN = 0.004, SUELO_MAX = 0.08, MULT_VOZ = 2.4, MARGEN_VOZ = 0.006, LIBERACION = 0.6, SUAVIZADO = 0.995, HABLA_MINIMA_MS = 350;

/** Trama del micrófono inyectada por quien captura (ms = reloj del llamante). */
export interface TramaOida { pcm: Float32Array; sampleRate: number; ms: number }
/** Tramo cerrado por el detector: lo que va a transcribir. */
export interface TramoAudio { pcm: Float32Array; sampleRate: number; msCierre: number }
export interface OpcionesEscucharFusionado {
  obtenerAudio: () => Promise<TramaOida | null>; // null = fin de la escucha
  elegir?: (opciones: OpcionesEleccionOido) => ResultadoOido; // elector; por defecto `elegirOido`
  transcribir?: (tramo: TramoAudio, motor: string, contexto: { idioma: string; hotwords: string[] }) => Promise<string | null>; // null = motor sin respuesta
  alParcial?: (texto: string) => void;
  alFinal: (texto: string) => void;
  idiomaPista?: string; // pista para el elector, nunca imposición
  hotwords?: string[]; // palabras propias: nombre de la persona, de sus bots, de su grupo…
}

/** RMS (energía media) de una trama: el mismo metro que usa el VAD de `oss-stt.ts`. */
export function rmsDe(pcm: Float32Array): number {
  let suma = 0;
  for (let i = 0; i < pcm.length; i++) suma += pcm[i] * pcm[i];
  return Math.sqrt(suma / (pcm.length || 1));
}

/** El estado del VAD por energía de `oss-stt.ts`, dominado por parámetros. */
export interface TramadorEnergia {
  empujar: (trama: TramaOida) => TramoAudio | null; // acumula; tramo si este cierre lo terminó
  cerrar: () => TramoAudio | null; // fin de la escucha: tramo si algo valió la pena
  enVoz: () => boolean; // voz en curso (alimenta el parcial del navegador)
}

/** tramadorEnergia — el VAD en forma pequeña: suelo de ruido que se adapta al
 * silencio, pre-rollo de 300 ms para no cortar la primera sílaba, cierre por
 * silencio de 800 ms o tramo de 30 s, y descarte de murmullos de < 350 ms.
 * Umbral de INICIO de voz: suelo · 2,4 + 0,006 (histéresis, como `oss-stt.ts`). */
export function tramadorEnergia(sampleRate: number): TramadorEnergia {
  let suelo = SUELO_MIN, enVoz = false, inicioVozMs = 0, ultimaVozMs = 0;
  let trozos: Float32Array[] = [], largo = 0, pre: Float32Array[] = [];
  const preMax = Math.max(1, Math.round((PREROLL_MS / 1000) * sampleRate));
  const soltar = (msCierre: number): TramoAudio | null => {
    const durMs = (largo / sampleRate) * 1000, todo = new Float32Array(largo);
    let foco = 0;
    for (const t of trozos) { todo.set(t, foco); foco += t.length; }
    trozos = []; largo = 0; enVoz = false;
    if (durMs < HABLA_MINIMA_MS) return null;
    return { pcm: todo, sampleRate, msCierre };
  };
  return {
    empujar: (trama) => {
      const energia = rmsDe(trama.pcm);
      if (enVoz) {
        trozos.push(trama.pcm); largo += trama.pcm.length;
        if (energia >= umbralVoz(suelo) * LIBERACION) ultimaVozMs = trama.ms;
        else if (trama.ms - ultimaVozMs >= SILENCIO_CIERRE_MS || trama.ms - inicioVozMs >= TRAMO_MAXIMO_MS) return soltar(trama.ms);
        return null;
      }
      suelo = Math.min(SUELO_MAX, Math.max(SUELO_MIN, SUAVIZADO * suelo + (1 - SUAVIZADO) * energia));
      if (energia >= umbralVoz(suelo)) { // arranca el tramo: pre-rollo + esta trama
        enVoz = true; inicioVozMs = trama.ms; ultimaVozMs = trama.ms;
        trozos = [...pre, trama.pcm]; largo = 0;
        for (const p of trozos) largo += p.length;
        pre = [];
        return null;
      }
      pre.push(trama.pcm); // silencio: mantengo el pre-rollo al día
      let preLargo = 0; for (const p of pre) preLargo += p.length;
      while (preLargo > preMax && pre.length > 1) { preLargo -= pre[0].length; pre.shift(); }
      return null;
    },
    cerrar: () => soltar(0),
    enVoz: () => enVoz,
  };
}

/** Umbral de INICIO de voz para un suelo de ruido dado (histéresis del VAD). */
function umbralVoz(suelo: number): number { return Math.min(SUELO_MAX * MULT_VOZ, suelo * MULT_VOZ + MARGEN_VOZ); }

/** blobWavDe — tramo PCM mono → WAV 16 bits (lo que aceptan los servidores
 * compatibles con la API Whisper y el `/asr` del demonio). Puro. */
export function blobWavDe(pcm: Float32Array, sampleRate: number): Blob {
  const bytes = pcm.length * 2, v = new DataView(new ArrayBuffer(44 + bytes));
  const escribe = (pos: number, texto: string) => { for (let i = 0; i < texto.length; i++) v.setUint8(pos + i, texto.charCodeAt(i)); };
  escribe(0, "RIFF"); v.setUint32(4, 36 + bytes, true); escribe(8, "WAVE");
  escribe(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  escribe(36, "data"); v.setUint32(40, bytes, true);
  for (let i = 0; i < pcm.length; i++) { let m = pcm[i]; m = m > 1 ? 1 : m < -1 ? -1 : m; v.setInt16(44 + i * 2, m * 0x7fff, true); }
  return new Blob([v.buffer as ArrayBuffer], { type: "audio/wav" });
}

/** escucharFusionado — consume tramas hasta que `obtenerAudio` da null; por
 * cada tramo cerrado pide al elector su motor «final», transcribe y avisa
 * `alFinal` con el texto ya corregido por glosario; mientras suena voz avisa
 * `alParcial("…")` cada 400 ms. Un fallo pierde el tramo, nunca la escucha. */
export async function escucharFusionado(opciones: OpcionesEscucharFusionado): Promise<void> {
  const elegir = opciones.elegir ?? elegirOido;
  const transcribir = opciones.transcribir ?? (async () => null);
  const alParcial = opciones.alParcial ?? (() => {});
  const idioma = opciones.idiomaPista?.split("-")[0] || "es", hotwords = opciones.hotwords ?? [];
  const glosario = glosarioBase(hotwords), candidaturas = MOTORES_OIDO.map((m) => m.id);
  const daFinal = async (tramo: TramoAudio): Promise<void> => {
    let texto: string | null = null;
    try {
      const motor = elegir({ idioma, disponibles: candidaturas, fase: "final" }).motor;
      texto = await transcribir(tramo, motor, { idioma, hotwords });
    } catch { texto = null; }
    if (texto && texto.trim()) {
      try { texto = corregirConGlosario(texto.trim(), glosario, idioma).texto; } catch { /* el corrector no tumba el final */ }
      opciones.alFinal(texto);
    }
  };
  let tramador: TramadorEnergia | null = null, sampleRate = 0, ultimoParcialMs = 0;
  for (;;) {
    let trama: TramaOida | null = null;
    try { trama = await opciones.obtenerAudio(); } catch { trama = null; }
    if (!trama) { const pendiente = tramador?.cerrar() ?? null; if (pendiente) await daFinal(pendiente); return; }
    if (!tramador || trama.sampleRate !== sampleRate) { // cambia el ritmo: suelta pendiente y re-arma
      const pendiente = tramador ? tramador.cerrar() : null;
      if (pendiente) await daFinal(pendiente);
      tramador = tramadorEnergia(trama.sampleRate); sampleRate = trama.sampleRate;
    }
    if (tramador.enVoz() && trama.ms - ultimoParcialMs >= 400) { ultimoParcialMs = trama.ms; alParcial("…"); }
    const tramo = tramador.empujar(trama);
    if (tramo) { ultimoParcialMs = 0; await daFinal(tramo); }
  }
}
