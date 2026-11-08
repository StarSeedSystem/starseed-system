import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

import { onQuantumOrbParams, quantumOrbBus } from "@/lib/aurora/quantum-orb-bus";
import { useParamsOrbeDelBus } from "../quantum-orb-avatar";

afterEach(() => {
  cleanup();
  quantumOrbBus.clear();
});

describe("useParamsOrbeDelBus — QuantumOrbAvatar escucha el canal params del bus", () => {
  it("arranca sin vector publicado", () => {
    const { result } = renderHook(() => useParamsOrbeDelBus());
    expect(result.current).toBeUndefined();
  });

  it("recoge el último vector publicado en el canal params", () => {
    const { result } = renderHook(() => useParamsOrbeDelBus());
    const vector = { turbulence: 0.8, spikiness: 0.1, symmetry: 0.9, hueShift: 0.2, breath: 0.7 };
    act(() => {
      quantumOrbBus.emit("params", vector);
    });
    expect(result.current).toEqual(vector);
  });

  it("se suscribe por el azúcar del bus y se da de baja al desmontar", () => {
    const on = vi.spyOn(quantumOrbBus, "on");
    const off = vi.spyOn(quantumOrbBus, "off");
    const { unmount } = renderHook(() => useParamsOrbeDelBus());
    expect(onQuantumOrbParams).toBeDefined();
    expect(on).toHaveBeenCalledWith("params", expect.any(Function));
    unmount();
    expect(off).toHaveBeenCalledWith("params", expect.any(Function));
  });
});
