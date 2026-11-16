import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEstadoAstraura } from "../use-estado-astraura";

// Mock del puente
const mockBridge = {
  speaking: false,
  listening: false,
  actionStatus: null,
  start: vi.fn(),
  stop: vi.fn(),
};

vi.mock("../../../lib/aurora/open-aurora", () => ({
  getAuroraBridge: () => mockBridge,
}));

describe("useEstadoAstraura", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("debe retornar estado inicial de calma", () => {
    const { result } = renderHook(() => useEstadoAstraura(true, null));
    expect(result.current.estado).toBe("calma");
  });

  it("debe cambiar a error si actionStatus indica fallo", () => {
    mockBridge.actionStatus = "error al procesar";
    const { result } = renderHook(() => useEstadoAstraura(true, null));
    expect(result.current.estado).toBe("error");
  });

  it("debe llamar al puente al escuchar/callar", () => {
    const { result } = renderHook(() => useEstadoAstraura(true, null));
    act(() => result.current.escuchar());
    expect(mockBridge.start).toHaveBeenCalled();
    act(() => result.current.callar());
    expect(mockBridge.stop).toHaveBeenCalled();
  });
});
