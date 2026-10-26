// src/lib/dock/pulsacion-larga.ts
/**
 * PULSACIÓN LARGA — el detector puro del gesto «mantener presionado» (Ola 1025U · V1a).
 * ════════════════════════════════════════════════════════════════════════════
 * QUÉ: una pequeña máquina de estados, sin React ni DOM, que decide si un
 * puntero (ratón, dedo o lápiz) está haciendo un toque, una pulsación larga o
 * un arrastre tras la pulsación larga.
 * POR QUÉ: el dock necesita DOS cosas con el mismo dedo — «mantener y soltar»
 * (abre las opciones del icono) y «mantener y arrastrar» (cambia su posición) —
 * sin romper el clic ni el toque normales ni el desplazamiento del carril. Con la
 * decisión aislada aquí se prueba con temporizadores falsos, sin navegador.
 *
 * Reglas (las que pidió Alex):
 *   · 450 ms de pulsación sin soltar.
 *   · Un movimiento de MÁS de 8 px antes de que se cumpla el tiempo la cancela:
 *     era un deslizamiento (del carril) o un toque torpe, no una pulsación.
 *   · Cumplido el tiempo, el siguiente movimiento de más de 8 px ya es un
 *     ARRASTRE (reordenar); si se suelta sin moverse, es una PULSACIÓN (menú).
 *
 * Estados: inactivo → esperando → activa → arrastrando → inactivo.
 */

export const RETARDO_PULSACION_MS = 450;
export const TOLERANCIA_MOVIMIENTO_PX = 8;

export type TipoPuntero = "mouse" | "touch" | "pen";
export interface Punto {
  x: number;
  y: number;
}

export type FaseGesto = "inactivo" | "esperando" | "activa" | "arrastrando";
/** Cómo terminó el gesto al soltar. */
export type ResultadoGesto =
  /** Soltó antes de tiempo sin moverse: un toque normal (el clic sigue su curso). */
  | "toque"
  /** Soltó tras el tiempo sin arrastrar: toca abrir las opciones. */
  | "pulsacion"
  /** Soltó tras arrastrar: toca fijar la nueva posición. */
  | "arrastre"
  /** Se canceló (movimiento temprano, `cancelar()` o puntero perdido). */
  | "cancelado";

export interface OpcionesDetector<T> {
  retardoMs?: number;
  tolerancia?: number;
  /** Se llama UNA vez cuando se cumple el tiempo sin moverse más de la tolerancia. */
  alActivar?: (clave: T, punto: Punto, tipo: TipoPuntero) => void;
  /** Se llama UNA vez cuando, ya activa, el puntero supera la tolerancia. */
  alEmpezarArrastre?: (clave: T, punto: Punto, tipo: TipoPuntero) => void;
  /** Inyectables para probar con temporizadores falsos; por defecto `setTimeout`/`clearTimeout`. */
  programar?: (accion: () => void, ms: number) => unknown;
  anular?: (id: unknown) => void;
}

export interface EstadoMovimiento {
  fase: FaseGesto;
  /** Desplazamiento del puntero respecto al punto de partida. */
  delta: Punto;
  /** true si ESTE movimiento canceló un gesto que esperaba (movimiento temprano). */
  cancelada: boolean;
  /** true si ESTE movimiento convirtió la pulsación en arrastre. */
  empezoArrastre: boolean;
}

export interface DetectorPulsacion<T> {
  /** Empieza a vigilar un puntero. Devuelve false si ya hay un gesto en curso. */
  comenzar(clave: T, punto: Punto, tipo: TipoPuntero): boolean;
  mover(punto: Punto): EstadoMovimiento;
  /** Cierra el gesto y dice cómo acabó. */
  terminar(): ResultadoGesto;
  /** Anula el gesto en curso sin resultado (puntero perdido, Escape, dock cerrado…). */
  cancelar(): void;
  fase(): FaseGesto;
  clave(): T | null;
  tipo(): TipoPuntero | null;
}

export function crearDetectorPulsacion<T>(op: OpcionesDetector<T> = {}): DetectorPulsacion<T> {
  const retardo = op.retardoMs ?? RETARDO_PULSACION_MS;
  const tolerancia = op.tolerancia ?? TOLERANCIA_MOVIMIENTO_PX;
  const programar = op.programar ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const anular = op.anular ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));

  let fase: FaseGesto = "inactivo";
  let clave: T | null = null;
  let tipo: TipoPuntero | null = null;
  let origen: Punto = { x: 0, y: 0 };
  let ultimo: Punto = { x: 0, y: 0 };
  let temporizador: unknown = null;

  const limpiarTemporizador = () => {
    if (temporizador !== null) {
      anular(temporizador);
      temporizador = null;
    }
  };
  const reiniciar = () => {
    limpiarTemporizador();
    fase = "inactivo";
    clave = null;
    tipo = null;
  };
  const distancia = (p: Punto) => Math.hypot(p.x - origen.x, p.y - origen.y);

  return {
    comenzar(k, punto, t) {
      if (fase !== "inactivo") return false;
      clave = k;
      tipo = t;
      origen = { ...punto };
      ultimo = { ...punto };
      fase = "esperando";
      limpiarTemporizador();
      temporizador = programar(() => {
        temporizador = null;
        if (fase !== "esperando") return;
        // Un último control: si el puntero ya se alejó más de la tolerancia, no hay pulsación.
        if (distancia(ultimo) > tolerancia) {
          reiniciar();
          return;
        }
        fase = "activa";
        op.alActivar?.(clave as T, { ...ultimo }, tipo as TipoPuntero);
      }, retardo);
      return true;
    },

    mover(punto) {
      ultimo = { ...punto };
      const delta = { x: punto.x - origen.x, y: punto.y - origen.y };
      if (fase === "inactivo") return { fase, delta, cancelada: false, empezoArrastre: false };
      if (fase === "esperando") {
        if (distancia(punto) > tolerancia) {
          reiniciar();
          return { fase: "inactivo", delta, cancelada: true, empezoArrastre: false };
        }
        return { fase, delta, cancelada: false, empezoArrastre: false };
      }
      if (fase === "activa" && distancia(punto) > tolerancia) {
        fase = "arrastrando";
        op.alEmpezarArrastre?.(clave as T, { ...punto }, tipo as TipoPuntero);
        return { fase, delta, cancelada: false, empezoArrastre: true };
      }
      return { fase, delta, cancelada: false, empezoArrastre: false };
    },

    terminar() {
      const f = fase;
      reiniciar();
      if (f === "esperando") return "toque";
      if (f === "activa") return "pulsacion";
      if (f === "arrastrando") return "arrastre";
      return "cancelado";
    },

    cancelar() {
      reiniciar();
    },

    fase: () => fase,
    clave: () => clave,
    tipo: () => tipo,
  };
}
