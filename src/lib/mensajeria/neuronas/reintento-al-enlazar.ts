/**
 * reintento-al-enlazar — la cola de pendientes se vacía en cuanto hay un medio (BLE1108B · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Caso real (08-11): la tableta, sin internet, tenía mensajes «esperando un medio disponible». Alex conectó
 * el Bluetooth a mano en Señales y el enlace quedó ligado, pero los mensajes no salieron: el buzón solo
 * reintentaba cada 20 s y, si justo había una vuelta en marcha, ni eso. Ahora CADA enlace que se registra
 * (Bluetooth ligado a una neurona, enlace local, red local nativa) dispara un reintento a los 150 ms, y si
 * llega otro mientras una vuelta corre, se repite al terminar. Módulo PURO: el reloj se inyecta.
 */

export interface DisparadorReintento {
  /** Un enlace nuevo: reintenta enseguida (junta las ráfagas). */
  disparar(motivo?: string): void;
  /** Anula lo pendiente. */
  parar(): void;
}

export const ESPERA_REINTENTO_ENLACE_MS = 150;

export function crearDisparadorReintento(p: {
  /** La vuelta de reintentos (devuelve cuántos salieron). */
  reintentar(): Promise<unknown>;
  esperaMs?: number;
  /** Para pruebas. */
  temporizar?: (f: () => void, ms: number) => unknown;
  cancelar?: (t: unknown) => void;
  /** Se llama con el motivo cada vez que arranca una vuelta (diagnóstico). */
  alArrancar?: (motivo: string) => void;
}): DisparadorReintento {
  const temporizar = p.temporizar ?? ((f, ms) => setTimeout(f, ms));
  const cancelar = p.cancelar ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const espera = p.esperaMs ?? ESPERA_REINTENTO_ENLACE_MS;
  let temporizador: unknown = null;
  let corriendo = false;
  let otraVez: string | null = null;
  let parado = false;

  const vuelta = async (motivo: string): Promise<void> => {
    if (parado) return;
    if (corriendo) {
      // Una vuelta ya en marcha pudo pasar de largo el mensaje que esperaba este enlace: otra al terminar.
      otraVez = motivo;
      return;
    }
    corriendo = true;
    try {
      p.alArrancar?.(motivo);
      await p.reintentar();
    } catch {
      /* el reintento nunca tumba al buzón */
    } finally {
      corriendo = false;
    }
    if (otraVez && !parado) {
      const m = otraVez;
      otraVez = null;
      await vuelta(m);
    }
  };

  return {
    disparar(motivo = "enlace nuevo") {
      if (parado) return;
      if (temporizador !== null) cancelar(temporizador);
      temporizador = temporizar(() => {
        temporizador = null;
        void vuelta(motivo);
      }, espera);
    },
    parar() {
      parado = true;
      if (temporizador !== null) cancelar(temporizador);
      temporizador = null;
      otraVez = null;
    },
  };
}
