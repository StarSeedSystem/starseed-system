/**
 * reloj-unificado — controlador de un solo requestAnimationFrame para el mapa 3D.
 * ============================================================================
 * Evita que varios bucles (escena-3d.tsx, marcador-3d.tsx, capa-alcance.ts, capa-parches.ts)
 * pidan requestAnimationFrame simultáneamente, causando 270-315 frames por segundo.
 *
 * Un solo reloj por cuadro, con un callback compartido que ejecuta todas las actualizaciones.
 */

type Callback = (dt: number, timestamp: number) => void;

const callbacks = new Set<Callback>();
let rafId: number = 0;
let lastTimestamp: number = 0;

function pedirRaf() {
  if (rafId) return;
  rafId = requestAnimationFrame((timestamp) => {
    rafId = 0;
    const dt = lastTimestamp === 0 ? 0 : Math.min(0.1, (timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;
    callbacks.forEach((cb) => cb(dt, timestamp));
    if (callbacks.size > 0) pedirRaf();
  }) as unknown as number;
}

function cancelarRaf() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

export const relojUnificado = {
  registrar: (cb: Callback): (() => void) => {
    callbacks.add(cb);
    return () => callbacks.delete(cb);
  },

  pedir: () => pedirRaf(),

  cancelar: () => cancelarRaf(),

  reiniciar: () => {
    cancelarRaf();
    lastTimestamp = 0;
    pedirRaf();
  },
};

export interface RelojSimple {
  total: number;
  tick: () => void;
  tickConConteo: (ahora: () => number, ts: number, cb: () => void) => void;
  cancelar: () => void;
}

export function crearRelojSimple(): RelojSimple {
  return {
    total: 0,
    tick: function() { this.total++; },
    tickConConteo: function(ahora, ts, cb) { this.total++; cb(); },
    cancelar: () => {},
  };
}