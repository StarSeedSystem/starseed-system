// @vitest-environment jsdom
/** DIR1125I · con voz, el orbe de Aurora en «eficiente» sigue a 10 cuadros/s; solo en reposo baja a 5 (decisión de Alex del 25-11). */
import { act } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/aurora/quantum-orb", () => ({ QuantumOrb: () => null, prefersReducedMotion: () => false }));
vi.mock("@/components/astraura/astraura-158-presence", () => ({ Astraura158PresenceDot: () => null }));
vi.mock("@/ai/astraura/router", () => ({ ROUTE_EVENT: "ss:ruta-de-prueba", lastRoute: () => null }));

import { AuroraOrb } from "@/components/aurora/aurora-orb";
import { MODO_CHANGED_EVENT, MODO_KEY } from "@/lib/perf/modo-rendimiento";

const limpiados = vi.fn();
const lienzo = {
  clearRect: limpiados,
  setTransform() {},
  createRadialGradient: () => ({ addColorStop() {} }),
  createLinearGradient: () => ({ addColorStop() {} }),
  fillRect() {},
  save() {},
  restore() {},
  translate() {},
  rotate() {},
  beginPath() {},
  moveTo() {},
  lineTo() {},
  stroke() {},
  fill() {},
  arc() {},
  fillStyle: "",
  strokeStyle: "",
  lineWidth: 1,
  lineCap: "",
  lineJoin: "",
  globalCompositeOperation: "",
};

async function pintadasEnUnSegundo(modo: string, voz: { speaking?: boolean; thinking?: boolean }): Promise<number> {
  window.localStorage.setItem(MODO_KEY, modo);
  window.dispatchEvent(new Event(MODO_CHANGED_EVENT));
  render(<AuroraOrb size={56} speaking={!!voz.speaking} listening={false} thinking={!!voz.thinking} paused={false} supported />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  limpiados.mockClear();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  return limpiados.mock.calls.length;
}

describe("DIR1125I · el orbe de Aurora en «eficiente», con voz y en reposo", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
    HTMLCanvasElement.prototype.getContext = (() => lienzo) as unknown as HTMLCanvasElement["getContext"];
    limpiados.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("en reposo pinta 5 veces por segundo", async () => {
    const n = await pintadasEnUnSegundo("eficiente", {});
    expect(n).toBeGreaterThanOrEqual(4);
    expect(n).toBeLessThanOrEqual(6);
  });

  it("hablando sigue a 10 por segundo", async () => {
    const n = await pintadasEnUnSegundo("eficiente", { speaking: true });
    expect(n).toBeGreaterThanOrEqual(7);
    expect(n).toBeLessThanOrEqual(11);
  });

  it("pensando sigue a 10 por segundo", async () => {
    const n = await pintadasEnUnSegundo("eficiente", { thinking: true });
    expect(n).toBeGreaterThanOrEqual(7);
    expect(n).toBeLessThanOrEqual(11);
  });

  it("en «eco» el reposo no cambia: 30 por segundo", async () => {
    const n = await pintadasEnUnSegundo("eco", {});
    expect(n).toBeGreaterThanOrEqual(24);
    expect(n).toBeLessThanOrEqual(32);
  });
});
