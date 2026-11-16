import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useEstadoAstraura } from "../use-estado-astraura";
import { getAuroraBridge } from "@/lib/aurora/open-aurora";
import type { AuroraStateSnapshot } from "@/lib/aurora/open-aurora";

const makeSnapshot = (partial: Partial<AuroraStateSnapshot>): AuroraStateSnapshot => ({
  supported: true,
  enabled: true,
  listening: false,
  speaking: false,
  paused: false,
  interim: "",
  transcript: "",
  lastReply: "",
  actionStatus: "",
  conversation: [],
  actionLog: [],
  activePersonality: { name: "Aurora" },
  personalities: [],
  ...partial,
});

describe("useEstadoAstraura", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("estado inicial es calma", () => {
    const { result } = renderHook(() => useEstadoAstraura(true, null));
    expect(result.current.estado).toBe("calma");
  });

  it("no se suscribe cuando no visible", () => {
    const subscribe = vi.fn();
    vi.spyOn(getAuroraBridge, "getAuroraBridge" as any).mockReturnValue({ subscribe });
    renderHook(() => useEstadoAstraura(false, null));
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("se suscribe al puente cuando visible", () => {
    const subscribe = vi.fn(() => () => {});
    vi.spyOn(getAuroraBridge, "getAuroraBridge" as any).mockReturnValue({ subscribe });
    renderHook(() => useEstadoAstraura(true, null));
    expect(subscribe).toHaveBeenCalled();
  });

  it("cambia a hablando cuando speaking es true", () => {
    const snapshot = makeSnapshot({ speaking: true });
    const bridge = {
      subscribe: (cb: () => void) => { cb(); return () => {}; },
      getState: () => snapshot,
    };
    vi.spyOn(getAuroraBridge, "getAuroraBridge" as any).mockReturnValue(bridge as any);
    const { result } = renderHook(() => useEstadoAstraura(true, null));
    expect(result.current.estado).toBe("hablando");
  });

  it("cambia a escuchando cuando listening es true", () => {
    const snapshot = makeSnapshot({ listening: true });
    const bridge = {
      subscribe: (cb: () => void) => { cb(); return () => {}; },
      getState: () => snapshot,
    };
    vi.spyOn(getAuroraBridge, "getAuroraBridge" as any).mockReturnValue(bridge as any);
    const { result } = renderHook(() => useEstadoAstraura(true, null));
    expect(result.current.estado).toBe("escuchando");
  });

  it("cambia a pensando cuando actionStatus indica pensamiento", () => {
    const snapshot = makeSnapshot({ speaking: false, listening: false, actionStatus: "procesando" });
    const bridge = {
      subscribe: (cb: () => void) => { cb(); return () => {}; },
      getState: () => snapshot,
    };
    vi.spyOn(getAuroraBridge, "getAuroraBridge" as any).mockReturnValue(bridge as any);
    const { result } = renderHook(() => useEstadoAstraura(true, null));
    expect(result.current.estado).toBe("pensando");
  });

  it("cambia a error cuando actionStatus contiene error", () => {
    const snapshot = makeSnapshot({ speaking: false, listening: false, actionStatus: "error al procesar" });
    const bridge = {
      subscribe: (cb: () => void) => { cb(); return () => {}; },
      getState: () => snapshot,
    };
    vi.spyOn(getAuroraBridge, "getAuroraBridge" as any).mockReturnValue(bridge as any);
    const { result } = renderHook(() => useEstadoAstraura(true, null));
    expect(result.current.estado).toBe("error");
  });

  it("cambia a error si getState lanza", () => {
    const bridge = {
      subscribe: (cb: () => void) => { cb(); return () => {}; },
      getState: () => { throw new Error("test error"); },
    };
    vi.spyOn(getAuroraBridge, "getAuroraBridge" as any).mockReturnValue(bridge as any);
    const { result } = renderHook(() => useEstadoAstraura(true, null));
    expect(result.current.estado).toBe("error");
  });

  it("usa la última respuesta (< 60s) para indicar hablando cuando el puente está ausente", () => {
    const ahora = Date.now();
    const hace30s = ahora - 30_000;
    const bridge = { subscribe: vi.fn() };
    vi.spyOn(getAuroraBridge, "getAuroraBridge" as any).mockReturnValue(bridge as any);
    const { result } = renderHook(() => useEstadoAstraura(true, hace30s));
    expect(result.current.estado).toBe("calma");
  });

  it("escuchar llama a start del puente", () => {
    const start = vi.fn();
    vi.spyOn(getAuroraBridge, "getAuroraBridge" as any).mockReturnValue({ start });
    const { result } = renderHook(() => useEstadoAstraura(true, null));
    act(() => { result.current.escuchar(); });
    expect(start).toHaveBeenCalled();
  });

  it("callar llama a stop del puente", () => {
    const stop = vi.fn();
    vi.spyOn(getAuroraBridge, "getAuroraBridge" as any).mockReturnValue({ stop });
    const { result } = renderHook(() => useEstadoAstraura(true, null));
    act(() => { result.current.callar(); });
    expect(stop).toHaveBeenCalled();
  });

  it("voz es false cuando no hay puente", () => {
    vi.spyOn(getAuroraBridge, "getAuroraBridge" as any).mockReturnValue(null);
    const { result } = renderHook(() => useEstadoAstraura(true, null));
    expect(result.current.voz).toBe(false);
  });

  it("voz es true cuando supported y enabled son true", () => {
    const snapshot = makeSnapshot({ supported: true, enabled: true });
    const bridge = {
      subscribe: (cb: () => void) => { cb(); return () => {}; },
      getState: () => snapshot,
    };
    vi.spyOn(getAuroraBridge, "getAuroraBridge" as any).mockReturnValue(bridge as any);
    const { result } = renderHook(() => useEstadoAstraura(true, null));
    expect(result.current.voz).toBe(true);
  });

  it("voz es false cuando supported es false", () => {
    const snapshot = makeSnapshot({ supported: false, enabled: true });
    const bridge = {
      subscribe: (cb: () => void) => { cb(); return () => {}; },
      getState: () => snapshot,
    };
    vi.spyOn(getAuroraBridge, "getAuroraBridge" as any).mockReturnValue(bridge as any);
    const { result } = renderHook(() => useEstadoAstraura(true, null));
    expect(result.current.voz).toBe(false);
  });

  it("voz es false cuando enabled es false", () => {
    const snapshot = makeSnapshot({ supported: true, enabled: false });
    const bridge = {
      subscribe: (cb: () => void) => { cb(); return () => {}; },
      getState: () => snapshot,
    };
    vi.spyOn(getAuroraBridge, "getAuroraBridge" as any).mockReturnValue(bridge as any);
    const { result } = renderHook(() => useEstadoAstraura(true, null));
    expect(result.current.voz).toBe(false);
  });
});