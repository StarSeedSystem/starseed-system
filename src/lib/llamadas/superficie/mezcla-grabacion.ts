/**
 * Mezcla para grabar la llamada (LLA1108G): el audio de TODOS (el mío y el de cada participante) en una sola
 * pista, más la imagen que haya (pantalla o cámara remota primero). Se hace con Web Audio dentro del aparato;
 * nada sale de él. Dependencias inyectables para probarlo sin navegador.
 */
export interface NodoAudioMinimo {
  connect(destino: unknown): void;
  disconnect?(): void;
}
export interface ContextoAudioMinimo {
  createMediaStreamDestination(): { stream: MediaStream };
  createMediaStreamSource(s: MediaStream): NodoAudioMinimo;
  close?(): Promise<void>;
}

export interface MezclaGrabacion {
  /** Flujo que se graba (audio mezclado + vídeo si hay). */
  stream: MediaStream;
  /** Suma el audio de un participante que entra a mitad de la grabación (idempotente por flujo). */
  anadir(s: MediaStream | null | undefined): void;
  cerrar(): void;
}

export interface DepsMezcla {
  crearContexto?: () => ContextoAudioMinimo | null;
  crearStream?: (pistas: MediaStreamTrack[]) => MediaStream;
}

function contextoPorDefecto(): ContextoAudioMinimo | null {
  try {
    const C = (globalThis as unknown as { AudioContext?: new () => ContextoAudioMinimo; webkitAudioContext?: new () => ContextoAudioMinimo }).AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: new () => ContextoAudioMinimo }).webkitAudioContext;
    return C ? new C() : null;
  } catch {
    return null;
  }
}

export function crearMezclaGrabacion(streams: Array<MediaStream | null | undefined>, video: MediaStreamTrack | null, deps: DepsMezcla = {}): MezclaGrabacion | null {
  const ctx = (deps.crearContexto ?? contextoPorDefecto)();
  if (!ctx) return null;
  const destino = ctx.createMediaStreamDestination();
  const vistos = new Set<MediaStream>();
  const nodos: NodoAudioMinimo[] = [];
  const anadir = (s: MediaStream | null | undefined) => {
    if (!s || vistos.has(s)) return;
    if (!s.getAudioTracks().length) return;
    vistos.add(s);
    try {
      const nodo = ctx.createMediaStreamSource(s);
      nodo.connect(destino);
      nodos.push(nodo);
    } catch {
      /* un flujo que no se deja mezclar no tumba la grabación */
    }
  };
  for (const s of streams) anadir(s);
  const pistas = [...destino.stream.getAudioTracks(), ...(video ? [video] : [])];
  const stream = deps.crearStream ? deps.crearStream(pistas) : new MediaStream(pistas);
  return {
    stream,
    anadir,
    cerrar: () => {
      for (const n of nodos) {
        try {
          n.disconnect?.();
        } catch {
          /* noop */
        }
      }
      void ctx.close?.().catch(() => undefined);
    },
  };
}
