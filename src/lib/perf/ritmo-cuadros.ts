/**
 * DIR1125E · un bucle de animación que respeta el modo de rendimiento.
 *
 * Medido el 25-11 en la Maggabox (Core i5-2520M, «eficiente» guardado): con la página quieta lo ÚNICO que cambiaba en
 * pantalla era el orbe de Aurora, a 22,5 cuadros/s, y pintarlo ocupaba el hilo principal entero. El modo «eficiente»
 * promete «canvas/WebGL/rAF → 0–10 cuadros/s», pero los orbes pedían cuadros con `requestAnimationFrame` a pelo.
 *
 * Sin tope (alto, o auto en un equipo capaz) esto ES `requestAnimationFrame`. Con tope (eco 30, eficiente 10) espera lo
 * que falte y dice cuántos pasos de 1/60 s representa el cuadro, para que la animación no vaya a cámara lenta.
 * Solo cambia el RITMO en tiempo de ejecución: no toca diseños, ajustes ni opciones guardadas.
 *
 * CAP1125D · en un nodo sin pantalla (ningún conector `connected`) `fpsObjetivoModo()` ya devuelve 1 cuadro/s, y
 * devuelve el tope normal mientras alguien controla o comparte esta neurona. Este ritmo hereda ese tope tal cual:
 * no lee ni guarda el estado de pantalla, solo aplica el `fps` efectivo del modo.
 */
import { fpsObjetivoModo, PERF_CHANGED_EVENT } from "./device-tier";
import { MODO_CHANGED_EVENT } from "./modo-rendimiento";

export interface DepsRitmo {
  raf: (cb: FrameRequestCallback) => number;
  caf: (id: number) => void;
  poner: (f: () => void, ms: number) => unknown;
  quitar: (id: unknown) => void;
  ahora: () => number;
  /** Cuadros por segundo efectivos del modo (0 = sin tope); ya incluye el tope de 1/s de un nodo sin pantalla. */
  fps: () => number;
}

export interface RitmoCuadros {
  /** Pide el siguiente cuadro: como `requestAnimationFrame`, sin pasar del tope del modo. */
  pedir(cb: FrameRequestCallback): void;
  cancelar(): void;
  /** Dentro del cuadro: cuántos pasos de 1/60 s representa (1 sin tope; nunca más de `PASOS_MAX`). */
  pasos(): number;
}

/** Tras una pausa larga (pestaña oculta, equipo dormido) la animación no da un salto: como mucho 0,2 s de golpe. */
export const PASOS_MAX = 12;
const CUADRO_BASE_MS = 1000 / 60;
const REFRESCO_FPS_MS = 2000;

let fpsGuardado: number | null = null;
let fpsLeidoEn = 0;
let oyendo = false;

/**
 * El tope del modo efectivo, leído como mucho cada 2 s y al cambiar el modo o el estado de energía
 * (leerlo en cada cuadro costaría más que el cuadro). `fpsObjetivoModo()` es quien aplica el tope de
 * 1 cuadro/s de un nodo sin pantalla y su excepción con control remoto o transmisión viva; aquí solo
 * se guarda el número resultante, sin tocar el modo elegido.
 */
export function fpsDelModo(): number {
  const ahora = Date.now();
  if (fpsGuardado === null || ahora - fpsLeidoEn > REFRESCO_FPS_MS || ahora < fpsLeidoEn) {
    try {
      const f = fpsObjetivoModo();
      fpsGuardado = Number.isFinite(f) && f > 0 ? f : 0;
    } catch {
      fpsGuardado = 0;
    }
    fpsLeidoEn = ahora;
    if (!oyendo && typeof window !== "undefined") {
      oyendo = true;
      const olvidar = () => {
        fpsGuardado = null;
      };
      try {
        window.addEventListener(MODO_CHANGED_EVENT, olvidar);
        window.addEventListener(PERF_CHANGED_EVENT, olvidar);
      } catch {
        /* sin eventos: se relee cada 2 s */
      }
    }
  }
  return fpsGuardado ?? 0;
}

function depsReales(): DepsRitmo {
  return {
    raf: (cb) => requestAnimationFrame(cb),
    caf: (id) => cancelAnimationFrame(id),
    poner: (f, ms) => setTimeout(f, ms),
    quitar: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    ahora: () => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now()),
    fps: fpsDelModo,
  };
}

export function crearRitmoCuadros(deps: DepsRitmo = depsReales()): RitmoCuadros {
  let idRaf = 0;
  let idEspera: unknown = null;
  let ultimo: number | null = null; // cuándo corrió el último cuadro
  let pasosDeEste = 1;

  const entrar = (cb: FrameRequestCallback, conTope: boolean) => (t: number) => {
    idRaf = 0;
    const ahora = deps.ahora();
    pasosDeEste = conTope && ultimo !== null ? Math.max(1, Math.min(PASOS_MAX, Math.round((ahora - ultimo) / CUADRO_BASE_MS))) : 1;
    ultimo = ahora;
    cb(t);
  };

  return {
    pedir(cb) {
      const fps = deps.fps();
      if (!(fps > 0)) {
        idRaf = deps.raf(entrar(cb, false));
        return;
      }
      // Se espera un poco menos de lo que falta: el cuadro sale en el siguiente refresco de pantalla, que es quien redondea.
      const falta = ultimo === null ? 0 : 1000 / fps - (deps.ahora() - ultimo) - CUADRO_BASE_MS / 2;
      if (falta <= 2) {
        idRaf = deps.raf(entrar(cb, true));
        return;
      }
      idEspera = deps.poner(() => {
        idEspera = null;
        idRaf = deps.raf(entrar(cb, true));
      }, falta);
    },
    cancelar() {
      if (idRaf) deps.caf(idRaf);
      if (idEspera !== null) deps.quitar(idEspera);
      idRaf = 0;
      idEspera = null;
      ultimo = null;
      pasosDeEste = 1;
    },
    pasos: () => pasosDeEste,
  };
}
