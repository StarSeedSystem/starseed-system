/**
 * Protomolécula · ADAPTADOR GAMEPAD (F6). Lee ejes y botones con Gamepad API, emite solo cambios.
 * El acceso al navegador se INYECTA: no se toca navigator directamente. Zona de captura ≤60 Hz via requestAnimationFrame.
 * Mismo contrato que adaptador MIDI: conectar devuelve función de desconexión.
 */
import type { FuenteControl } from "./vinculos-control";

export type FuenteGamepad = Extract<FuenteControl, { tipo: "gamepad" }>;
export interface MensajeGamepad { fuente: FuenteGamepad; bruto: number }

export interface GamepadButton { pressed?: boolean; value?: number }
export interface GamepadRaw { index: number; id: string; connected: boolean; axes: number[]; buttons: GamepadButton[] }

export const SIN_GAMEPAD = "Este navegador no ofrece Gamepad API";

export const hayGamepad = (nav?: { getGamepads?: unknown }): boolean =>
  typeof nav?.getGamepads === "function";

export function conectarGamepad(
  getGamepads: () => GamepadRaw[] | null,
  requestAnimationFrame: (cb: FrameRequestCallback) => number,
  cancelAnimationFrame: (id: number) => void,
  alMensaje: (m: MensajeGamepad) => void,
  alCambiarDispositivos?: (ids: string[]) => void,
): () => void {
  const prev = new Map<string, number>();
  let rafId = 0;
  let activo = true;

  const clave = (i: number, c: "eje" | "boton", n: number) => `gp:${i}:${c}:${n}`;

  const leer = () => {
    if (!activo) return;
    const pads = getGamepads?.() ?? [];
    const vivos = new Set<string>();
    for (const p of pads) {
      if (!p || !p.connected) continue;
      vivos.add(p.id);
      for (let i = 0; i < (p.axes?.length ?? 0); i++) {
        const v = p.axes[i];
        const k = clave(p.index, "eje", i);
        if (prev.get(k) !== v) {
          prev.set(k, v);
          alMensaje({ fuente: { tipo: "gamepad", control: "eje", numero: i, indice: p.index }, bruto: v });
        }
      }
      for (let i = 0; i < (p.buttons?.length ?? 0); i++) {
        const b = p.buttons[i];
        const v = typeof b?.value === "number" ? b.value : (b?.pressed ? 1 : 0);
        const k = clave(p.index, "boton", i);
        if (prev.get(k) !== v) {
          prev.set(k, v);
          alMensaje({ fuente: { tipo: "gamepad", control: "boton", numero: i, indice: p.index }, bruto: v });
        }
      }
    }
    for (const k of [...prev.keys()]) {
      if (k.startsWith("gp:")) {
        const [, idx, , , ] = k.split(":");
        const id = pads.find(p => p.index === Number(idx))?.id;
        if (!id || !vivos.has(id)) prev.delete(k);
      }
    }
    alCambiarDispositivos?.(Array.from(vivos));
    rafId = requestAnimationFrame(leer);
  };

  rafId = requestAnimationFrame(leer);
  alCambiarDispositivos?.([]);

  return () => {
    activo = false;
    cancelAnimationFrame(rafId);
    prev.clear();
  };
}
