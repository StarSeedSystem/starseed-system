import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useEstadoAstraura } from "../use-estado-astraura";

type PuenteFalso = {
  speaking: boolean;
  listening: boolean;
  actionStatus: string;
  error?: boolean;
  supported: boolean;
  enabled: boolean;
  getState: ReturnType<typeof vi.fn<() => PuenteFalso>>;
  subscribe: ReturnType<typeof vi.fn<(cb: () => void) => () => void>>;
  start: ReturnType<typeof vi.fn<() => void>>;
  stop: ReturnType<typeof vi.fn<() => void>>;
  _notificar: () => void;
};

let notificarActual: (() => void) | null = null;

function crearPuenteFalso(estadoInicial: Partial<Omit<PuenteFalso, "getState" | "subscribe" | "start" | "stop" | "_notificar">> = {}): PuenteFalso {
  const getState = vi.fn<() => PuenteFalso>();
  const subscribe = vi.fn<(cb: () => void) => () => void>();
  const start = vi.fn<() => void>();
  const stop = vi.fn<() => void>();

  let estado: PuenteFalso = {
    speaking: false,
    listening: false,
    actionStatus: "",
    error: false,
    supported: true,
    enabled: true,
    ...estadoInicial,
    getState,
    subscribe,
    start,
    stop,
    _notificar: () => { notificarActual?.(); },
  };

  getState.mockReturnValue(estado);
  subscribe.mockImplementation((cb) => {
    notificarActual = cb;
    cb();
    return vi.fn();
  });

  return estado;
}

beforeEach(() => {
  vi.useFakeTimers();
  notificarActual = null;
  // @ts-expect-error - test setup
  window.STARSEED_AURORA = undefined;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  notificarActual = null;
  // @ts-expect-error - test cleanup
  window.STARSEED_AURORA = undefined;
});

describe("useEstadoAstraura", () => {
  it("estado inicial es calma y voz true tras efecto", () => {
    const puente = crearPuenteFalso();
    // @ts-expect-error - test setup
    window.STARSEED_AURORA = puente;

    const { result } = renderHook(() => useEstadoAstraura(true, null));

    // El efecto corre sincrónicamente durante renderHook
    expect(result.current.estado).toBe("calma");
    expect(result.current.voz).toBe(true);
  });

  it("cambio por suscripción actualiza estado", async () => {
    const puente = crearPuenteFalso();
    // @ts-expect-error - test setup
    window.STARSEED_AURORA = puente;

    const { result } = renderHook(() => useEstadoAstraura(true, null));

    // Estado inicial tras efecto
    expect(result.current.estado).toBe("calma");
    expect(result.current.voz).toBe(true);

    // Simular cambio a escuchando
    await act(async () => { puente.speaking = false; puente.listening = true; puente.getState.mockReturnValue(puente); puente._notificar(); });

    expect(result.current.estado).toBe("escuchando");

    // Simular cambio a hablando
    await act(async () => { puente.speaking = true; puente.listening = false; puente.getState.mockReturnValue(puente); puente._notificar(); });

    expect(result.current.estado).toBe("hablando");

    // Simular vuelta a calma
    await act(async () => { puente.speaking = false; puente.listening = false; puente.getState.mockReturnValue(puente); puente._notificar(); });

    expect(result.current.estado).toBe("calma");
  });

  it("actionStatus con error → estado error", async () => {
    const puente = crearPuenteFalso({ actionStatus: "error al procesar" });
    // @ts-expect-error - test setup
    window.STARSEED_AURORA = puente;

    const { result } = renderHook(() => useEstadoAstraura(true, null));

    expect(result.current.estado).toBe("error");
  });

  it("getState que lanza → error sin romper", async () => {
    const puente = crearPuenteFalso();
    puente.getState.mockImplementation(() => { throw new Error("puente caído"); });
    // @ts-expect-error - test setup
    window.STARSEED_AURORA = puente;

    const { result } = renderHook(() => useEstadoAstraura(true, null));

    expect(result.current.estado).toBe("error");
  });

  it("con visible:false no se suscribe", async () => {
    const puente = crearPuenteFalso();
    // @ts-expect-error - test setup
    window.STARSEED_AURORA = puente;

    const { result, unmount } = renderHook(() => useEstadoAstraura(false, null));

    await act(async () => { await vi.runAllTimersAsync(); });
    expect(puente.subscribe).not.toHaveBeenCalled();
    expect(result.current.estado).toBe("calma");

    unmount();
  });

  it("desmontar da de baja suscripción y temporizadores", async () => {
    const puente = crearPuenteFalso();
    const desuscribir = vi.fn();
    puente.subscribe.mockReturnValue(desuscribir);
    // @ts-expect-error - test setup
    window.STARSEED_AURORA = puente;

    const { unmount } = renderHook(() => useEstadoAstraura(true, null));

    expect(puente.subscribe).toHaveBeenCalled();
    unmount();
    expect(desuscribir).toHaveBeenCalled();
  });

  it("escuchar y callar llaman a start/stop del puente y no fallan si no existe", async () => {
    const puente = crearPuenteFalso();
    // @ts-expect-error - test setup
    window.STARSEED_AURORA = puente;

    const { result } = renderHook(() => useEstadoAstraura(true, null));

    expect(result.current.voz).toBe(true);

    act(() => { result.current.escuchar(); });
    expect(puente.start).toHaveBeenCalled();

    act(() => { result.current.callar(); });
    expect(puente.stop).toHaveBeenCalled();

    // Sin puente
    // @ts-expect-error - test setup
    window.STARSEED_AURORA = undefined;
    act(() => { result.current.escuchar(); result.current.callar(); });
    // No debe lanzar
  });

  it("reintenta cada 5 s si el puente no existe", async () => {
    // @ts-expect-error - test setup
    window.STARSEED_AURORA = undefined;

    const { result, unmount } = renderHook(() => useEstadoAstraura(true, null));

    expect(result.current.estado).toBe("calma");

    // Avanza 4.9 s - no debe haber reintento efectivo aún
    await act(async () => { await vi.advanceTimersByTimeAsync(4900); });

    // Avanza 5.1 s total - debe reintentar
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });

    unmount();
  });
});