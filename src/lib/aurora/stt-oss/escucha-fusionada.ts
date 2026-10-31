/**
 * OÍDO FUSIONADO por tramos (VZF1015G · voz-fusionada-astraura.md §3): corta el
 * micro como el VAD de `oss-stt.ts` (silencio 800 ms, tramo ≤ 30 s, histéresis,
 * pre-roll); por TRAMO pide al elector la fase «final» (transcribirOpenAI u
 * oído 1.58 del demonio); el parcial lo sigue dando el navegador (regla 1):
 * aquí solo la pista «…». Inyectable y NUNCA lanza. */

/** Tramo cerrado listo para transcribir · fragmento del micro · petición con el motor. */
export interface TramoOido { pcm: Float32Array; rate: number; ms: number; }
export interface FragmentoOido { pcm: Float32Array; rate: number; }
export interface PeticionTranscripcion { motor: string; idioma?: string; hotwords?: string[]; }
export interface OpcionesEscuchaFusionada {
  obtenerAudio: () => FragmentoOido | null | Promise<FragmentoOido | null>;
  elegir?: (idioma: string) => { motor: string }; // elector inyectado, fase «final»
  transcribir?: (tramo: TramoOido, peticion: PeticionTranscripcion) => Promise<string | null>;
  alParcial: (texto: string) => void; // pista «te oigo»; el parcial real: el navegador
  alFinal: (texto: string) => void;
  idiomaPista?: string;
  hotwords?: string[];
}
export interface SesionEscuchaFusionada { activa: () => boolean; detener: () => void; }
/** WAV de 32 bits flotantes (lo aceptan los servidores Whisper-compatibles). */
export function tramoAWav(pcm: Float32Array, rate = 16000): ArrayBuffer {
  const v = new DataView(new ArrayBuffer(44 + pcm.length * 4));
  const txt = (p: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(p + i, s.charCodeAt(i)); };
  txt(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 4, true); txt(8, "WAVE"); txt(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 3, true); v.setUint16(22, 1, true); // IEEE float · mono
  v.setUint32(24, rate, true); v.setUint32(28, rate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 32, true);
  txt(36, "data"); v.setUint32(40, pcm.length * 4, true);
  for (let i = 0; i < pcm.length; i++) v.setFloat32(44 + i * 4, pcm[i], true);
  return v.buffer;
}

/** Opciones del tramador: por defecto, las mismas del detector de `oss-stt.ts`. */
type OpcionesTramador = { silencioMs?: number; tramoMaxMs?: number };
type TramadorOido = {
  vozActiva: () => boolean; cerrar: () => TramoOido | null;
  empujar: (bloque: Float32Array, rate?: number) => TramoOido | null;
};
/**
 * crearTramador — corta el audio por energía: RMS con suelo adaptativo,
 * histéresis (continúa al 60 % del umbral), pre-roll 300 ms, silencio 800 ms
 * de cierre, corte a 30 s y mínimo 350 ms (constantes de `oss-stt.ts`).
 * Sin reloj: el tiempo sale de las MUESTRAS (bloques/ritmo). Nunca lanza.
 */
export function crearTramador(opciones: OpcionesTramador = {}): TramadorOido {
  const silencioMs = opciones.silencioMs ?? 800;
  const tramoMaxMs = opciones.tramoMaxMs ?? 30000;
  let suelo = 0.004, marcha = false, rate0 = 16000, largo = 0, silencioVozMs = 0, prerreelMs = 0;
  let cuerpo: Float32Array[] = [];
  const prerreel: { audio: Float32Array; ms: number }[] = [];
  const unir = (): Float32Array => {
    let offset = 0; const total = new Float32Array(largo);
    for (const c of cuerpo) { total.set(c, offset); offset += c.length; }
    return total;
  };
  const cerrarTramo = (): TramoOido | null => {
    const tramo: TramoOido | null = largo >= rate0 * 0.35 ? { pcm: unir(), rate: rate0, ms: (largo / rate0) * 1000 } : null;
    cuerpo = []; largo = 0; silencioVozMs = 0; marcha = false;
    return tramo;
  };
  return {
    vozActiva: () => marcha,
    cerrar: () => (marcha ? cerrarTramo() : null),
    empujar: (bloque, rate = 16000) => {
      const msBloque = (bloque.length / rate) * 1000;
      let suma = 0; for (let i = 0; i < bloque.length; i++) { const s = bloque[i]; suma += s * s; }
      const rms = Math.sqrt(suma / (bloque.length || 1));
      const umbral = Math.min(0.192, suelo * 2.4 + 0.006);
      if (!marcha && rms < umbral) {
        suelo = Math.min(0.08, Math.max(0.004, suelo * 0.995 + rms * 0.005));
        prerreel.push({ audio: new Float32Array(bloque), ms: msBloque });
        prerreelMs += msBloque;
        while (prerreelMs > 300 && prerreel.length > 1) { prerreelMs -= prerreel.shift()!.ms; }
        return null;
      }
      if (!marcha) { // empieza la voz: la acumulación arranca en el PROPIO bloque (como oss-stt.ts)
        marcha = true; rate0 = rate; cuerpo = []; largo = 0;
        for (const p of prerreel) { cuerpo.push(p.audio); largo += p.audio.length; }
        prerreel.length = 0; prerreelMs = 0;
      }
      cuerpo.push(new Float32Array(bloque));
      largo += bloque.length;
      silencioVozMs = rms >= umbral * 0.6 ? 0 : silencioVozMs + msBloque;
      return (largo / rate0) * 1000 >= tramoMaxMs || silencioVozMs >= silencioMs ? cerrarTramo() : null;
    },
  };
}

/**
 * escucharFusionado — oído por TRAMOS con elector: tira de `obtenerAudio`,
 * corta en tramos y por cada tramo pide el motor de la fase «final» (`elegir`)
 * y lo transcribe (`transcribir`). El parcial lo sigue dando el navegador
 * (regla 1): aquí solo salta la pista «…»; un motor caído pierde su tramo.
 * Nunca lanza. */
export function escucharFusionado(opciones: OpcionesEscuchaFusionada): SesionEscuchaFusionada {
  const tramador = crearTramador(); let activa = true;
  const transcribirTramo = async (tramo: TramoOido): Promise<void> => { // el final NUNCA bloquea el tramo siguiente
    const eleccion = opciones.elegir?.(opciones.idiomaPista ?? "") ?? { motor: "navegador" }; // suelo: sin elector manda el navegador
    let texto: string | null = null;
    try { texto = (await opciones.transcribir?.(tramo, { motor: eleccion.motor, idioma: opciones.idiomaPista, hotwords: opciones.hotwords })) ?? null; }
    catch { texto = null; } // motor caído: se pierde ESTE tramo, nada más
    if (activa && texto?.trim()) { try { opciones.alFinal(texto.trim()); } catch { /* el consumidor puede fallar */ } }
  };
  const bucle = async (): Promise<void> => {
    while (activa) {
      const frag = await opciones.obtenerAudio();
      if (!activa || !frag || frag.pcm.length === 0) { activa = false; return; }
      try {
        const antes = tramador.vozActiva();
        const tramo = tramador.empujar(frag.pcm, frag.rate);
        if (!antes && tramador.vozActiva()) try { opciones.alParcial("…"); } catch { /* la pista nunca tumba */ }
        if (tramo) void transcribirTramo(tramo);
      } catch { /* un fragmento extraño no tumba la escucha */ }
    }
  };
  void bucle();
  return { activa: () => activa, detener: () => { activa = false; tramador.cerrar(); } };
}
