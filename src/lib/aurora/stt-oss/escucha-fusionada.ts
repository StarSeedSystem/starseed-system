/**
 * StarSeed OS — Escucha fusionada por tramos (Ola 1015V · tarea G). Contrato:
 * architecture/voz-fusionada-astraura.md §3 (reglas 1 y 2) y §4. Corta el audio
 * en tramos con el detector de energía de `oss-stt.ts` (silencio 800 ms, tramo
 * ≤ 30 s), pide por tramo al elector el motor de fase «final» y transcribe por
 * cliente OpenAI-compatible o demonio. El parcial sigue llegando del navegador
 * si está (regla 1 del §3) y entra por `parcial()`. Todo inyectable. Nada lanza.
 */
export const TRAMO_SILENCIO_MS = 800, TRAMO_MAX_MS = 30000, TRAMO_MIN_VOZ_MS = 350, TRAMO_PREROLL_MS = 300;
/** Suelo, umbral e histéresis: los valores del VAD de `oss-stt.ts`. */
const SUELO_MIN = 0.004, SUELO_MAX = 0.08, MULT = 2.4, MARGEN = 0.006;
const SIN_SIGUE = 0.6, SUAVE = 0.995;
/** Palabras propias del glosario StarSeed que viajan como `hotwords` (§6). */
export const HOTWORDS_STARSEED = ["Astraura", "StarSeed", "MetaGenesis", "PoliGenesis", "Genesis"];
export interface SolicitudTramo { pcm: Float32Array; sampleRate: number; motor: string; idioma?: string; hotwords: string[]; }
export interface ResultadoTramo { ok: boolean; texto: string; idioma?: string; }
/** Opciones: TODO inyectable. `elegir` lo compone el llamador con `elegirOido` y sus medidas; `idiomaPista` es pista, nunca imposición (regla 2). */
export interface OpcionesEscuchaFusionada {
  obtenerAudio: (alBloque: (pcm: Float32Array, ahora: number) => void) => { sampleRate: number; detener: () => void };
  elegir: (o: { idioma: string; fase: "final" }) => { motor: string };
  transcribir: (s: SolicitudTramo) => Promise<ResultadoTramo>;
  alParcial: (texto: string) => void;
  alFinal: (texto: string, motor: string) => void; // tramo final: texto y motor que lo escribió
  idiomaPista?: string;
  hotwords?: string[];
}
/** El oído fusionado: `parcial()` toma el parcial del navegador si está (regla 1 del §3); `arrancar()` enciende la fuente cuando decide el llamador; `motorFinal()` dice qué motor escribió el último tramo. */
export interface EscuchaFusionada { parcial(texto: string): void; arrancar(): void; detener(): void; activo(): boolean; motorFinal(): string | null; }

/** aWav — PCM16 mono → WAV RIFF (cabecera de 44 bytes), el `file` que acepta un servidor OpenAI-compatible. */
export function aWav(pcm16: Int16Array, sampleRate: number): Blob {
  const bytes = new ArrayBuffer(44 + pcm16.length * 2); const v = new DataView(bytes);
  const etiqueta = (pos: number, texto: string) => { for (let i = 0; i < texto.length; i++) v.setUint8(pos + i, texto.charCodeAt(i)); };
  etiqueta(0, "RIFF"); v.setUint32(4, 36 + pcm16.length * 2, true); etiqueta(8, "WAVE");
  etiqueta(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); // PCM · mono
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  etiqueta(36, "data"); v.setUint32(40, pcm16.length * 2, true);
  new Uint8Array(bytes, 44).set(new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength));
  return new Blob([bytes], { type: "audio/wav" });
}

/**
 * DivisorTramos — el detector de voz por ENERGÍA de `oss-stt.ts`, aislado y
 * puro: entra un bloque y sale un tramo PCM completo cerrado. Suelo adaptativo,
 * histéresis, pre-roll y descarte de clics, como el VAD del que viene.
 */
export class DivisorTramos {
  private suelo = SUELO_MIN; private hablando = false; private trozos: Float32Array[] = []; private largo = 0; private inicio = 0;
  private ultimaVoz = 0; private previa: Float32Array[] = []; private previaMax = 0;
  constructor(private ritmo: number, private alCerrar: (pcm: Float32Array) => void) {}
  /** Umbral de INICIO de voz; para SEGUIR vale SIN_SIGUE × este umbral. */
  umbralVoz(): number { return Math.min(SUELO_MAX * MULT, this.suelo * MULT + MARGEN); }
  /** Recibe un bloque: VAD + acumulación; al cerrar entrega el tramo completo. */
  bloque(input: Float32Array, ahora: number): void {
    let suma = 0;
    for (let i = 0; i < input.length; i++) { const s = input[i]; suma += s * s; }
    const rms = Math.sqrt(suma / (input.length || 1));
    if (!this.previaMax && input.length > 0) this.previaMax = Math.max(1, Math.ceil((TRAMO_PREROLL_MS / 1000) * this.ritmo / input.length));
    const voz = this.hablando ? rms >= this.umbralVoz() * SIN_SIGUE : rms >= this.umbralVoz();
    if (voz) {
      if (!this.hablando) { this.hablando = true; this.inicio = ahora; for (const p of this.previa) { this.trozos.push(p); this.largo += p.length; } this.previa = []; }
      this.ultimaVoz = ahora; this.trozos.push(new Float32Array(input)); this.largo += input.length;
      if (ahora - this.inicio >= TRAMO_MAX_MS) this.cerrar(); // monólogo: se cierra entera, no a la mitad
    } else if (this.hablando) {
      this.trozos.push(new Float32Array(input)); this.largo += input.length; // cola de la frase
      if (ahora - this.ultimaVoz >= TRAMO_SILENCIO_MS) this.cerrar();
    } else {
      // Silencio real: adapta el suelo de ruido y mantiene el pre-roll al día.
      this.suelo = Math.min(SUELO_MAX, Math.max(SUELO_MIN, SUAVE * this.suelo + (1 - SUAVE) * rms));
      this.previa.push(new Float32Array(input));
      if (this.previa.length > this.previaMax) this.previa.shift();
    }
  }
  /** Cierra el tramo si trae voz suficiente; un clic de menos de 350 ms se tira. */
  cerrar(): void {
    const trozos = this.trozos; const largo = this.largo; this.trozos = []; this.largo = 0; this.hablando = false;
    const pcm = new Float32Array(largo); let o = 0;
    if ((largo / Math.max(1, this.ritmo)) * 1000 < TRAMO_MIN_VOZ_MS) return;
    for (const t of trozos) { pcm.set(t, o); o += t.length; }
    this.alCerrar(pcm);
  }
}

/** escucharFusionado — cada tramo cerrado pide al elector motor de fase «final» y transcribe fuera del hilo de audio; un tramo que falla se pierde y la escucha sigue. */
export function escucharFusionado(opciones: OpcionesEscuchaFusionada): EscuchaFusionada {
  let arrancado = false, detenido = false;
  let fuente: { sampleRate: number; detener: () => void } | null = null;
  let divisor: DivisorTramos | null = null; let ritmo = 16000; let motorUltimo: string | null = null;
  const procesarTramo = async (tramo: Float32Array) => {
    if (detenido) return;
    const idioma = (opciones.idiomaPista?.trim() || "es").toLowerCase();
    let motor = "navegador";
    try { motor = opciones.elegir({ idioma, fase: "final" }).motor; motorUltimo = motor; } catch { /* el elector cae al suelo (navegador) */ }
    try {
      const r = await opciones.transcribir({ pcm: tramo, sampleRate: ritmo, motor, idioma, hotwords: opciones.hotwords ?? [] });
      if (!detenido && r.ok && r.texto.trim()) opciones.alFinal(r.texto.trim(), motor);
    } catch { /* un tramo que falla se pierde; la escucha sigue */ }
  };
  return {
    parcial: (texto: string) => { const t = texto.trim(); if (detenido || !t) return; try { opciones.alParcial(t); } catch { /* el consumidor no tumba la escucha */ } },
    arrancar: () => {
      if (arrancado || detenido) return;
      arrancado = true;
      try {
        fuente = opciones.obtenerAudio((pcm, ahora) => {
          if (detenido) return;
          try {
            if (!divisor) { ritmo = fuente?.sampleRate || 16000; divisor = new DivisorTramos(ritmo, (tramo) => { void procesarTramo(tramo); }); }
            divisor.bloque(pcm, ahora);
          } catch { /* el divisor nunca tumba la escucha */ }
        });
      } catch { try { fuente?.detener(); } catch { /* */ } }
    },
    detener: () => { if (detenido) return; detenido = true; divisor = null; try { fuente?.detener(); } catch { /* */ } },
    activo: () => !detenido,
    motorFinal: () => motorUltimo,
  };
}
