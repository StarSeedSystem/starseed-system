import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { Slider } from "@/components/ui/slider";

// Radix mide el control con ResizeObserver, que jsdom no trae.
beforeAll(() => {
  class ResizeObserverFalso {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverFalso);
});

afterEach(() => cleanup());

describe("Slider (shadcn) · onValueCommit", () => {
  it("deja pasar onValueCommit a Radix: se dispara con el valor final, junto a onValueChange", () => {
    const alMover = vi.fn();
    const alSoltar = vi.fn();
    render(
      <Slider
        value={[0.5]}
        min={0}
        max={1}
        step={0.1}
        onValueChange={alMover}
        onValueCommit={alSoltar}
        aria-label="prueba"
      />,
    );

    // El teclado confirma cada paso (en Radix, teclado = mover + soltar a la vez).
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });

    expect(alMover).toHaveBeenCalledWith([0.6]);
    expect(alSoltar).toHaveBeenCalledTimes(1);
    expect(alSoltar).toHaveBeenCalledWith([0.6]);
  });
});
