/**
 * Mezcla del audio de la grabación (sonido del sistema + micrófono).
 * `MediaRecorder` graba bien UNA pista de audio; con dos (sistema y micro) hay navegadores que
 * descartan una o fallan. Con dos o más se mezclan en un AudioContext y se graba la pista mezclada.
 */

interface NodoMinimo {
  connect(destino: unknown): void;
}
interface ContextoAudioMinimo {
  createMediaStreamDestination(): { stream: { getAudioTracks(): MediaStreamTrack[] } };
  createMediaStreamSource(flujo: MediaStream): NodoMinimo;
  resume?(): Promise<void>;
  close?(): Promise<void>;
}
export type ConstructorAudioContext = new () => ContextoAudioMinimo;

export interface AudioMezclado {
  pistas: MediaStreamTrack[];
  /** Pistas que no cupieron (sin AudioContext no se pueden mezclar más de una). */
  descartadas: number;
  cerrar(): void;
}

export function mezclarAudio(
  Ctor: unknown,
  pistas: MediaStreamTrack[],
  crearFlujo: (pistas: MediaStreamTrack[]) => MediaStream,
): AudioMezclado {
  if (pistas.length <= 1) return { pistas, descartadas: 0, cerrar: () => {} };
  if (typeof Ctor !== "function") {
    return { pistas: pistas.slice(0, 1), descartadas: pistas.length - 1, cerrar: () => {} };
  }
  try {
    const ctx = new (Ctor as ConstructorAudioContext)();
    const destino = ctx.createMediaStreamDestination();
    for (const pista of pistas) ctx.createMediaStreamSource(crearFlujo([pista])).connect(destino);
    void ctx.resume?.();
    return {
      pistas: destino.stream.getAudioTracks(),
      descartadas: 0,
      cerrar: () => {
        try {
          void ctx.close?.();
        } catch {
          /* ya cerrado */
        }
      },
    };
  } catch {
    return { pistas: pistas.slice(0, 1), descartadas: pistas.length - 1, cerrar: () => {} };
  }
}
