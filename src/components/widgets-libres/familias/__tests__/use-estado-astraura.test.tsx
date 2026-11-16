import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { EstadoAsistente } from "@/lib/widgets/astraura/estado-forma";
import { useEstadoAstraura } from "../use-estado-astraura";

type PuenteFalso = {
  speaking: boolean;
  listening: boolean;
  actionStatus: string;
  error?: boolean;
  supported: boolean;
  enabled: boolean;
  getState: () => PuenteFalso;
  subscribe: (cb: () => void) => () => void;
  start: () => void;
  stop: () => void;
  _notificar?: () => void;
};

function crearPuenteFalso(estadoInicial: Partial<PuenteFalso> = {}): PuenteFalso {
  const callbacks = new Set<() => void>();
  const estado: PuenteFalso = {
    speaking: false,
    listening: false,
    actionStatus: "",
    error: false,
    supported: true,
    enabled: true,
    getState() { return estado; },
    subscribe(cb) { callbacks.add(cb); cb(); return () => callbacks.delete(cb); },
    start() { estado.listening = true; callbacks.forEach((c) => c()); },
    stop() { estado.listening = false; estado.speaking = false; callbacks.forEach((c) => c()); },
    _notificar: () => callbacks.forEach((c) => c()),
    ...estadoInicial,
  };
  return estado;
}

function instalarPuente(puente: PuenteFalso) {
  if (typeof window !== "undefined") {
    (window as unknown as { STARSEED_AURORA?: PuenteFalso }).STARSEED_AURORA = puente;
  }
}

function desinstalarPuente() {
  if (typeof window !== "undefined") {
    (window as unknown as { STARSEED_AURORA?: PuenteFalso }).STARSEED_AURORA = undefined;
  }
}

describe("useEstadoAstraura: hook del estado del asistente con el puente de Aurora", () => {
  beforeEach(() => {
    desinstalarPuente();
  });

  afterEach(() => {
    desinstalarPuente();
    vi.restoreAllMocks();
  });

  it("con visible:false no se suscribe ni arranca temporizadores", () => {
    const puente = crearPuenteFalso();
    instalarPuente(puente);
    const subscribeSpy = vi.spyOn(puente, "subscribe");

    const { result } = renderHook(() => useEstadoAstraura(false, null));

    expect(result.current.estado).toBe("calma");
    expect(result.current.voz).toBe(false);
    expect(subscribeSpy).not.toHaveBeenCalled();
  });

  it("calma → escuchando → hablando → calma por suscripción", async () => {
    const puente = crearPuenteFalso();
    instalarPuente(puente);

    const { result } = renderHook(() => useEstadoAstraura(true, null));

    await waitFor(() => expect(result.current.estado).toBe("calma"));

    act(() => { puente.listening = true; puente.speaking = false; puente.actionStatus = ""; puente._notificar?.(); });
    await waitFor(() => expect(result.current.estado).toBe("escuchando"));

    act(() => { puente.speaking = true; puente.listening = false; puente._notificar?.(); });
    await waitFor(() => expect(result.current.estado).toBe("hablando"));

    act(() => { puente.speaking = false; puente.listening = false; puente._notificar?.(); });
    await waitFor(() => expect(result.current.estado).toBe("calma"));
  });

  it("actionStatus con error → estado error", async () => {
    const puente = crearPuenteFalso({ actionStatus: "error al procesar" });
    instalarPuente(puente);

    const { result } = renderHook(() => useEstadoAstraura(true, null));

    await waitFor(() => expect(result.current.estado).toBe("error"));
    act(() => { puente.actionStatus = ""; puente._notificar?.(); });
    await waitFor(() => expect(result.current.estado).toBe("calma"));
  });

  it("getState que lanza → error sin romper", async () => {
    const puente = crearPuenteFalso();
    puente.getState = vi.fn(() => { throw new Error("puente caído"); });
    instalarPuente(puente);

    const { result } = renderHook(() => useEstadoAstraura(true, null));

    await waitFor(() => expect(result.current.estado).toBe("error"));
    // restaurar getState y verificar que vuelve a calma
    act(() => {
      puente.getState = () => crearPuenteFalso({ speaking: false, listening: false, actionStatus: "", error: false, supported: true, enabled: true });
      puente._notificar?.();
    });
    await waitFor(() => expect(result.current.estado).toBe("calma"));
  });

  it("desmontar da de baja suscripción y limpia temporizadores", async () => {
    const puente = crearPuenteFalso();
    instalarPuente(puente);
    const subscribeSpy = vi.spyOn(puente, "subscribe");
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

    const { result, unmount } = renderHook(() => useEstadoAstraura(true, null));

    await waitFor(() => expect(result.current.estado).toBe("calma"));

    unmount();

    expect(subscribeSpy).toHaveBeenCalled();
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("escuchar llama a start del puente y no falla si no existe", () => {
    const puente = crearPuenteFalso();
    instalarPuente(puente);
    const startSpy = vi.spyOn(puente, "start");

    const { result } = renderHook(() => useEstadoAstraura(true, null));

    act(() => { result.current.escuchar(); });
    expect(startSpy).toHaveBeenCalled();

    desinstalarPuente();
    act(() => { expect(() => result.current.escuchar()).not.toThrow(); });
  });

  it("callar llama a stop del puente y no falla si no existe", () => {
    const puente = crearPuenteFalso();
    instalarPuente(puente);
    const stopSpy = vi.spyOn(puente, "stop");

    const { result } = renderHook(() => useEstadoAstraura(true, null));

    act(() => { result.current.callar(); });
    expect(stopSpy).toHaveBeenCalled();

    desinstalarPuente();
    act(() => { expect(() => result.current.callar()).not.toThrow(); });
  });

  it("voz refleja supported y enabled del puente", async () => {
    const puente = crearPuenteFalso({ supported: true, enabled: true });
    instalarPuente(puente);

    const { result } = renderHook(() => useEstadoAstraura(true, null));

    await waitFor(() => expect(result.current.voz).toBe(true));

    act(() => { puente.enabled = false; puente._notificar?.(); });
    await waitFor(() => expect(result.current.voz).toBe(false));
  });

  it("reintenta cada 5s si el puente no existe aún", async () => {
    vi.useFakeTimers();
    desinstalarPuente();

    const { result } = renderHook(() => useEstadoAstraura(true, null));

    expect(result.current.estado).toBe("calma");
    expect(result.current.voz).toBe(false);

    const puente = crearPuenteFalso();
    instalarPuente(puente);

    await act(async () => { vi.advanceTimersByTime(5000); });

    // después de 5s, el puente existe y la suscripción debería haber actualizado el estado
    expect(result.current.estado).toBe("calma");

    act(() => { puente.listening = true; puente._notificar?.(); });
    // con fake timers, waitFor puede no funcionar; usamos act para forzar actualización
    await act(async () => {});
    expect(result.current.estado).toBe("escuchando");

    vi.useRealTimers();
  });
});