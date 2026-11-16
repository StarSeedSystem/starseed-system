import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEstadoAstraura } from "../use-estado-astraura";

// Simulación del puente
const mockPuente = {
  getState: vi.fn(),
  subscribe: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
};

vi.mock("../../../lib/aurora/open-aurora", () => ({
  getAuroraBridge: () => mockPuente,
}));

describe("useEstadoAstraura", () => {
  it("debe suscribirse al puente cuando visible es true", () => {
    renderHook(() => useEstadoAstraura(true, null));
    expect(mockPuente.subscribe).toHaveBeenCalled();
  });

  it("debe retornar calma inicialmente", () => {
    mockPuente.getState.mockReturnValue({ speaking: false, listening: false, actionStatus: null });
    const { result } = renderHook(() => useEstadoAstraura(true, null));
    expect(result.current.estado).toBe("calma");
  });

  it("debe actualizar estado a error si getState lanza", () => {
    mockPuente.getState.mockImplementation(() => { throw new Error("Fallo"); });
    const { result } = renderHook(() => useEstadoAstraura(true, null));
    expect(result.current.estado).toBe("error");
  });
});
