// @vitest-environment jsdom
/**
 * DIR1125E · el orbe de Aurora DE VERDAD (su componente) respeta el modo de rendimiento.
 * Medido el 25-11 en la Maggabox: en «eficiente» pintaba a 22,5 cuadros/s (todo lo que daba el equipo) y llenaba el núcleo.
 */
import { act } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/aurora/quantum-orb", () => ({ QuantumOrb: () => null, prefersReducedMotion: () => false }));
vi.mock("@/components/astraura/astraura-158-presence", () => ({ Astraura158PresenceDot: () => null }));
vi.mock("@/ai/astraura/router", () => ({ ROUTE_EVENT: "ss:ruta-de-prueba", lastRoute: () => null }));

import { AuroraOrb } from "@/components/aurora/aurora-orb";
import { MODO_CHANGED_EVENT, MODO_KEY } from "@/lib/perf/modo-rendimiento";

const limpiados = vi.fn();
const puestas = vi.spyOn(CSSStyleDeclaration.prototype, "setProperty");
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

async function cuadrosEnUnSegundo(modo: string): Promise<{ cuadros: number; energia: string }> {
  window.localStorage.setItem(MODO_KEY, modo);
  window.dispatchEvent(new Event(MODO_CHANGED_EVENT));
  const { container } = render(<AuroraOrb size={56} speaking={false} listening={false} paused={false} supported />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000); // que el modo se asiente (el tope se relee cada 2 s)
  });
  limpiados.mockClear();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  void container;
  const ultima = [...puestas.mock.calls].reverse().find((c) => c[0] === "--aurora-energy");
  return { cuadros: limpiados.mock.calls.length, energia: String(ultima?.[1] ?? "") };
}

describe("DIR1125E · el orbe de Aurora y el modo de rendimiento", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
    HTMLCanvasElement.prototype.getContext = (() => lienzo) as unknown as HTMLCanvasElement["getContext"];
    limpiados.mockClear();
    puestas.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("en «alto» pinta en cada refresco de pantalla, como siempre", async () => {
    const r = await cuadrosEnUnSegundo("alto");
    expect(r.cuadros).toBeGreaterThanOrEqual(55);
    expect(r.energia).toMatch(/^\d\.\d{3}$/);
  });

  // DIR1125I: por decisión de Alex (25-11) el orbe EN REPOSO va a 5 cuadros/s en «eficiente» (antes 10). Con voz sigue a 10 (ver dir1125i-orbe-con-voz).
  it("en «eficiente» y en reposo pinta 5 veces por segundo, y sigue vivo", async () => {
    const r = await cuadrosEnUnSegundo("eficiente");
    expect(r.cuadros).toBeGreaterThanOrEqual(4);
    expect(r.cuadros).toBeLessThanOrEqual(6);
    expect(r.energia).toMatch(/^\d\.\d{3}$/);
  });

  it("en «eco» pinta como mucho 30 veces por segundo", async () => {
    const r = await cuadrosEnUnSegundo("eco");
    expect(r.cuadros).toBeGreaterThanOrEqual(24);
    expect(r.cuadros).toBeLessThanOrEqual(32);
  });

  it("al desmontarlo no queda ningún cuadro pedido", async () => {
    window.localStorage.setItem(MODO_KEY, "eficiente");
    window.dispatchEvent(new Event(MODO_CHANGED_EVENT));
    const { unmount } = render(<AuroraOrb size={56} speaking={false} listening={false} paused={false} supported />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    unmount();
    limpiados.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(limpiados).not.toHaveBeenCalled();
  });
});
