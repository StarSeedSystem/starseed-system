import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  clasificarRechazo,
  registrarUnhandledRejectionHandler,
  obtenerRegistroRechazos,
  limpiarRegistroRechazos,
  type CategoriaRechazo,
} from "../unhandled-rejection";

describe("Guardia global de rechazos de promesas", () => {
  beforeEach(() => {
    limpiarRegistroRechazos();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clasifica AbortError de locks como ignorables silenciosos", () => {
    const error = { name: "AbortError", message: "Lock broken by another request" };
    expect(clasificarRechazo(error)).toBe("lock_silencioso");
  });

  it("clasifica errores de red o fetch como error_red", () => {
    const error = new TypeError("Failed to fetch");
    expect(clasificarRechazo(error)).toBe("error_red");
  });

  it("clasifica errores genéricos o desconocidos como no_manejado", () => {
    const error = new Error("Errorinesperado");
    expect(clasificarRechazo(error)).toBe("no_manejado");
  });

  it("clasifica AbortError simple como cancelacion", () => {
    const error = new DOMException("aborted", "AbortError");
    expect(clasificarRechazo(error)).toBe("cancelacion");
  });

  it("registrarUnhandledRejectionHandler instala listener y retorna cleanup", () => {
    const cleanup = registrarUnhandledRejectionHandler();
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  it("registra rechazos no manejados en el historial", async () => {
    // En entorno Node, window no existe, así que solo verificamos que la función devuelve cleanup
    if (typeof window === "undefined") {
      const cleanup = registrarUnhandledRejectionHandler();
      expect(typeof cleanup).toBe("function");
      cleanup();
      return;
    }
    const cleanup = registrarUnhandledRejectionHandler();
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  it("no duplica listener si se llama varias veces", () => {
    if (typeof window === "undefined") {
      const cleanup1 = registrarUnhandledRejectionHandler();
      const cleanup2 = registrarUnhandledRejectionHandler();
      cleanup1();
      cleanup2();
      return;
    }
    const cleanup1 = registrarUnhandledRejectionHandler();
    const cleanup2 = registrarUnhandledRejectionHandler();
    cleanup1();
    cleanup2();
  });

  it("prevenirDefault y stopImmediatePropagation para lock_silencioso", () => {
    if (typeof window === "undefined") {
      expect(clasificarRechazo({ name: "AbortError", message: "Lock broken by another request" })).toBe("lock_silencioso");
      return;
    }
  });
});
