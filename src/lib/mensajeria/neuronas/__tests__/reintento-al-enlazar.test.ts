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

describe("un solo disparador de enlace (BLE1108B + OFF1108A)", () => {
  it("el mismo enlace avisado por el buzón y por el arranque sin internet no hace dos vueltas", async () => {
    const { reintentarAlEnlazar, __reiniciarDisparadorEnlace, __vueltasPorEnlace, ENFRIAMIENTO_ENLACE_MS } = await import("../buzon");
    __reiniciarDisparadorEnlace();
    vi.useFakeTimers();
    const t0 = Date.now();
    reintentarAlEnlazar("Bluetooth directo ligado", t0);
    await vi.advanceTimersByTimeAsync(ESPERA_REINTENTO_ENLACE_MS + 5); // sale la vuelta de 150 ms
    // 600 ms después llega el aviso agrupado del arranque sin internet: dentro del enfriamiento, no repite.
    reintentarAlEnlazar("arranque sin internet", Date.now() + 450);
    await vi.advanceTimersByTimeAsync(ESPERA_REINTENTO_ENLACE_MS + 5);
    expect(ENFRIAMIENTO_ENLACE_MS).toBeGreaterThan(600);
    expect(__vueltasPorEnlace()).toBe(1);
    // Un enlace que llega mucho después sí vuelve a vaciar la cola.
    reintentarAlEnlazar("enlace local", Date.now() + ENFRIAMIENTO_ENLACE_MS + 10);
    await vi.advanceTimersByTimeAsync(ESPERA_REINTENTO_ENLACE_MS + 5);
    expect(__vueltasPorEnlace()).toBe(2);
    __reiniciarDisparadorEnlace();
    vi.useRealTimers();
  });
});
