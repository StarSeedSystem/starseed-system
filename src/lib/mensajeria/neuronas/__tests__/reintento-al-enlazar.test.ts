/**
 * (BLE1108B) «Esperando un medio disponible» se despeja solo: al registrarse un enlace con la neurona, el buzón
 * reintenta enseguida (juntando ráfagas) y repite si el enlace llegó con una vuelta en marcha.
 *   NODE_ENV=test npx vitest run src/lib/mensajeria/neuronas/__tests__/reintento-al-enlazar.test.ts
 */
import { describe, expect, it, vi } from "vitest";
import { crearDisparadorReintento, ESPERA_REINTENTO_ENLACE_MS } from "../reintento-al-enlazar";

describe("crearDisparadorReintento", () => {
  it("un enlace nuevo reintenta una vez, y una ráfaga de enlaces se junta en una sola vuelta", async () => {
    vi.useFakeTimers();
    const reintentar = vi.fn(async () => 2);
    const d = crearDisparadorReintento({ reintentar });
    d.disparar();
    d.disparar();
    d.disparar("ble");
    expect(reintentar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(ESPERA_REINTENTO_ENLACE_MS + 1);
    expect(reintentar).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("si llega otro enlace con una vuelta corriendo, hace otra al terminar (no se pierde el mensaje)", async () => {
    vi.useFakeTimers();
    let suelta: () => void = () => undefined;
    const reintentar = vi.fn(() => new Promise<void>((r) => (suelta = r)));
    const d = crearDisparadorReintento({ reintentar });
    d.disparar();
    await vi.advanceTimersByTimeAsync(ESPERA_REINTENTO_ENLACE_MS + 1);
    expect(reintentar).toHaveBeenCalledTimes(1);
    d.disparar("ble");
    await vi.advanceTimersByTimeAsync(ESPERA_REINTENTO_ENLACE_MS + 1);
    expect(reintentar).toHaveBeenCalledTimes(1); // aún corriendo la primera
    suelta();
    await vi.advanceTimersByTimeAsync(1);
    expect(reintentar).toHaveBeenCalledTimes(2);
    suelta();
    vi.useRealTimers();
  });

  it("un fallo del reintento no lo tumba y parar() anula lo pendiente", async () => {
    vi.useFakeTimers();
    const reintentar = vi.fn(async () => {
      throw new Error("x");
    });
    const d = crearDisparadorReintento({ reintentar });
    d.disparar();
    await vi.advanceTimersByTimeAsync(ESPERA_REINTENTO_ENLACE_MS + 1);
    expect(reintentar).toHaveBeenCalledTimes(1);
    d.disparar();
    d.parar();
    await vi.advanceTimersByTimeAsync(1000);
    expect(reintentar).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
