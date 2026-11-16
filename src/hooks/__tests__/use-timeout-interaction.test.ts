// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTimeoutInteraction, type TimeoutHandle } from "../use-timeout-interaction";

describe("useTimeoutInteraction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("addEventListener", vi.fn());
    vi.stubGlobal("removeEventListener", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("ejecuta el callback al expirar el timeout", async () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useTimeoutInteraction(callback, 1000));

    expect(callback).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("reinicia el timeout al llamar a handle.reiniciar", async () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useTimeoutInteraction(callback, 1000));

    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(callback).not.toHaveBeenCalled();

    await act(async () => {
      result.current.handle.reiniciar();
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("cancela el timeout al desmontarse", async () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() => useTimeoutInteraction(callback, 1000));

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it("devuelve un handle con cancelar", async () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useTimeoutInteraction(callback, 1000));

    const handle: TimeoutHandle = result.current.handle;
    await act(async () => {
      handle.cancelar();
      vi.advanceTimersByTime(1000);
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it("detecta scroll y reinicia automáticamente", async () => {
    const callback = vi.fn();
    const { result } = renderHook(() =>
      useTimeoutInteraction(callback, 1000, { escucharInteracciones: true }),
    );

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("detecta click y reinicia automáticamente", async () => {
    const callback = vi.fn();
    const { result } = renderHook(() =>
      useTimeoutInteraction(callback, 1000, { escucharInteracciones: true }),
    );

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent("click"));
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("no detecta interacciones cuando escucharInteracciones es false", async () => {
    const callback = vi.fn();
    const { result } = renderHook(() =>
      useTimeoutInteraction(callback, 1000, { escucharInteracciones: false }),
    );

    await act(async () => {
      vi.advanceTimersByTime(500);
      window.dispatchEvent(new Event("scroll"));
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("respeta delay configurable", async () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useTimeoutInteraction(callback, 2000));

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(callback).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("permite reiniciar manualmente tras cancelar", async () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useTimeoutInteraction(callback, 1000));

    await act(async () => {
      result.current.handle.cancelar();
      vi.advanceTimersByTime(1000);
    });

    expect(callback).not.toHaveBeenCalled();

    await act(async () => {
      result.current.handle.reiniciar();
      vi.advanceTimersByTime(1000);
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });
});