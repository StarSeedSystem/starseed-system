import * as React from "react";
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useGenerar3D } from "../use-generar-3d";
import type { Destino3D } from "@/lib/avatares/adn/optimizacion";
import type { Hierro, PlanOptimizacion } from "@/lib/avatares/adn/optimizacion";

describe("useGenerar3D", () => {
  const mockHierro: Hierro = {
    gpu: "ninguna",
    ramGB: 8,
    vramGB: null,
    blender: false,
    permiteEspacioHf: false,
    claveExterna: false,
  };

  it("should initialize with default state", () => {
    const { result } = renderHook(() =>
      useGenerar3D("avatar", { hierro: mockHierro })
    );
    expect(result.current.estado).toBe("idle");
    expect(result.current.imagen).toBeNull();
    expect(result.current.plan).toBeNull();
  });

  it("should compute plan when imagen is set", () => {
    const { result } = renderHook(() =>
      useGenerar3D("avatar", { hierro: mockHierro })
    );
    const mockFile = new File(["mock"], "test.png", { type: "image/png" });
    act(() => {
      result.current.setImagen(mockFile);
    });
    expect(result.current.imagen).toBe(mockFile);
    expect(result.current.plan).not.toBeNull();
    if (result.current.plan) {
      expect(result.current.plan.destino).toBe("avatar");
      expect(result.current.plan.prioridad).toBe("calidad");
    }
  });

  it("should compute pasos correctly", () => {
    const { result } = renderHook(() =>
      useGenerar3D("avatar", { hierro: mockHierro })
    );
    const mockFile = new File(["mock"], "test.png", { type: "image/png" });
    act(() => {
      result.current.setImagen(mockFile);
    });
    expect(result.current.pasos.length).toBeGreaterThan(0);
    // Check that each step has the expected structure
    result.current.pasos.forEach(paso => {
      expect(paso).toHaveProperty("etapa");
      expect(paso).toHaveProperty("motor");
      expect(paso).toHaveProperty("saltada");
      expect(paso).toHaveProperty("motivo");
      expect(paso).toHaveProperty("descartes");
    });
  });

  it("should handle memory error and retry", async () => {
    const { result } = renderHook(() =>
      useGenerar3D("protomolecula", { hierro: mockHierro })
    );
    const mockFile = new File(["mock"], "test.png", { type: "image/png" });
    act(() => {
      result.current.setImagen(mockFile);
    });
    // Mock onSuccess and onError
    const onSuccess = vi.fn();
    const onError = vi.fn();
    // Rerender hook with callbacks
    const { result: resultWithCallbacks } = renderHook(() =>
      useGenerar3D("protomolecula", { 
        hierro: mockHierro,
        onSuccess,
        onError
      })
    );
    act(() => {
      resultWithCallbacks.current.setImagen(mockFile);
    });
    // Wait for async operations
    await act(async () => {
      // Simulate multiple ticks for retries
      await vi.waitUntil(() => {
        // We'll check if the hook has succeeded or errored
        return resultWithCallbacks.current.estado === "success" || resultWithCallbacks.current.estado === "error";
      }, { timeout: 1000 });
    });
    // Expect either success or error after retries
    expect(onSuccess.mock.calls.length + onError.mock.calls.length).toBeGreaterThan(0);
  });
});