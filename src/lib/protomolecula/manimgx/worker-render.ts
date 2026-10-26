// ManimGX · Worker que carga el motor en el navegador y renderiza una escena
// a MP4 con tope de tiempo y cancelación. Import dinámico por CDN (sin tocar package.json).
// Contrato: architecture/repos-3d-oido-agentes-1023.md §3; sin node:*; puro.

export interface EscenaManim {
  nombre: string;
  codigoPython: string;
  duracionMaxSegundos?: number;
}

export interface ResultadoRender {
  escena: string;
  bytes: Uint8Array | null;
  cancelado: boolean;
  error?: string;
}

const CDN_MANIMGX = "https://cdn.jsdelivr.net/npm/manimgx@0.1.1/dist/manimgx.js";

export async function configurarWorkerRender(
  urlWorker: string | URL,
  señalCancelacion?: AbortSignal,
): Promise<{ inicializado: boolean; mensaje: string }> {
  return { inicializado: false, mensaje: "no implementado" };
}
