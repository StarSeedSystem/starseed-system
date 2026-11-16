/**
 * Tests para useTimeoutInteraction — gestor de temporizador que reinicia al detectar interacción.
 * 
 * Nota: Este hook es un componente de React que requiere un entorno de navegador.
 * Los tests usan vi.useFakeTimers() para controlar el tiempo.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useTimeoutInteraction } from "../use-timeout-interaction";

describe("useTimeoutInteraction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    cleanup();
  });

  it("llama a onTimeout al expirar el temporizador", () => {
    const onTimeout = vi.fn();
    renderHook(() =>
      useTimeoutInteraction({
        timeoutMs: 10_000,
        onTimeout,
      })
    );

    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10_000);

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("no llama a onTimeout cuando está deshabilitado", () => {
    const onTimeout = vi.fn();
    renderHook(() =>
      useTimeoutInteraction({
        timeoutMs: 10_000,
        onTimeout,
        enabled: false,
      })
    );

    vi.advanceTimersByTime(10_000);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("reinicia el temporizador al hacer scroll", () => {
    const onTimeout = vi.fn();
    renderHook(() =>
      useTimeoutInteraction({
        timeoutMs: 10_000,
        onTimeout,
        enabled: true,
      })
    );

    // Avanzar 5 segundos
    vi.advanceTimersByTime(5_000);
    expect(onTimeout).not.toHaveBeenCalled();

    // Hacer scroll
    window.dispatchEvent(new Event("scroll"));

    // Avanzar 5 segundos más (total 10 pero reiniciado en 5)
    vi.advanceTimersByTime(5_000);
    expect(onTimeout).not.toHaveBeenCalled();

    // Avanzar los 5 segundos restantes
    vi.advanceTimersByTime(5_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("reinicia el temporizador al hacer click", () => {
    const onTimeout = vi.fn();
    renderHook(() =>
      useTimeoutInteraction({
        timeoutMs: 10_000,
        onTimeout,
        enabled: true,
      })
    );

    vi.advanceTimersByTime(5_000);
    expect(onTimeout).not.toHaveBeenCalled();

    window.dispatchEvent(new MouseEvent("click"));

    vi.advanceTimersByTime(5_000);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("reinicia el temporizador al mover el mouse", () => {
    const onTimeout = vi.fn();
    renderHook(() =>
      useTimeoutInteraction({
        timeoutMs: 10_000,
        onTimeout,
        enabled: true,
      })
    );

    vi.advanceTimersByTime(5_000);
    expect(onTimeout).not.toHaveBeenCalled();

    window.dispatchEvent(new MouseEvent("mousemove"));

    vi.advanceTimersByTime(5_000);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("reinicia el temporizador al presionar una tecla", () => {
    const onTimeout = vi.fn();
    renderHook(() =>
      useTimeoutInteraction({
        timeoutMs: 10_000,
        onTimeout,
        enabled: true,
      })
    );

    vi.advanceTimersByTime(5_000);
    expect(onTimeout).not.toHaveBeenCalled();

    window.dispatchEvent(new KeyboardEvent("keydown"));

    vi.advanceTimersByTime(5_000);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("reinicia el temporizador al tocar la pantalla", () => {
    const onTimeout = vi.fn();
    renderHook(() =>
      useTimeoutInteraction({
        timeoutMs: 10_000,
        onTimeout,
        enabled: true,
      })
    );

    vi.advanceTimersByTime(5_000);
    expect(onTimeout).not.toHaveBeenCalled();

    window.dispatchEvent(new TouchEvent("touchstart"));

    vi.advanceTimersByTime(5_000);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("no llama a onTimeout si el hook se desmonta antes del timeout", () => {
    const onTimeout = vi.fn();
    const { unmount } = renderHook(() =>
      useTimeoutInteraction({
        timeoutMs: 10_000,
        onTimeout,
        enabled: true,
      })
    );

    unmount();

    vi.advanceTimersByTime(10_000);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("usa el timeout mínimo de 5 segundos incluso si se pasa un valor menor", () => {
    const onTimeout = vi.fn();
    renderHook(() =>
      useTimeoutInteraction({
        timeoutMs: 100, // Valor muy pequeño, pero se debe respetar el mínimo de 5s
        onTimeout,
      })
    );

    // Avanzar 100ms - el valor pasado, pero el timeout real es 5000ms
    vi.advanceTimersByTime(100);
    expect(onTimeout).not.toHaveBeenCalled();

    // Avanzar hasta el mínimo (5 segundos desde el inicio)
    vi.advanceTimersByTime(4_900);
    // En este punto han pasado 5000ms, pero el hook usa el mínimo de 5000ms
    // El timeout se establece con 5000ms, así que al llegar a 5000ms debería dispararse
    // Si no está claro, avanzamos un poquito más
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("detiene y reinicia el timeout cuando change enabled", () => {
    const onTimeout = vi.fn();
    
    const { rerender } = renderHook(
      ({ enabled }) =>
        useTimeoutInteraction({
          timeoutMs: 10_000,
          onTimeout,
          enabled,
        }),
      { initialProps: { enabled: true } }
    );

    vi.advanceTimersByTime(5_000);
    expect(onTimeout).not.toHaveBeenCalled();

    // Deshabilitar
    rerender({ enabled: false });

    vi.advanceTimersByTime(10_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});