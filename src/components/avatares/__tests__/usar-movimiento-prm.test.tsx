/**
 * Tests for unified prefers-reduced-motion (PRM) handling in useMovimiento hook.
 * Verifies that the hook uses the centralized PRM singleton.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useMovimiento } from "../usar-movimiento";
import { isReducedMotion, subscribePRM, __resetPRMTestOnly } from "@/lib/avatares/movimiento/prm";

let matchMediaMock: ReturnType<typeof vi.fn>;
let currentMock: {
  matches: boolean;
  media: string;
  onchange: null;
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  dispatchEvent: ReturnType<typeof vi.fn>;
};
let changeListeners: Set<(event: Event) => void> = new Set();

function createMatchMediaMock(matches: boolean) {
  const query = "(prefers-reduced-motion: reduce)";
  const mock = {
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_event: string, listener: (event: Event) => void) => {
      changeListeners.add(listener);
    }),
    removeEventListener: vi.fn((_event: string, listener: (event: Event) => void) => {
      changeListeners.delete(listener);
    }),
    dispatchEvent: vi.fn((event: Event) => {
      if (event.type === "change") {
        changeListeners.forEach((listener) => listener(event));
      }
      return true;
    }),
  };
  return mock;
}

function setupMatchMediaMock(matches: boolean): void {
  if (!currentMock) {
    currentMock = createMatchMediaMock(matches);
    matchMediaMock = vi.fn().mockReturnValue(currentMock);
  } else {
    currentMock.matches = matches;
  }
  if (typeof window !== "undefined") {
    (window as any).matchMedia = matchMediaMock;
  }
}

function resetPRM(): void {
  vi.clearAllMocks();
  __resetPRMTestOnly();
  changeListeners.clear();
  currentMock = undefined;
  setupMatchMediaMock(false);
}

const GESTO_PRUEBA = {
  prompt: "saludo amistoso",
  emocion: "alegre",
  energia: 0.5,
  duracionMs: 2000,
  bucle: false,
};

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("useMovimiento · unified PRM handling", () => {
  beforeEach(() => {
    resetPRM();
  });

  it("devuelve clip null y nivel null cuando PRM está activo inicialmente", async () => {
    setupMatchMediaMock(true);

    const { result } = renderHook(() =>
      useMovimiento(GESTO_PRUEBA, { personalidadId: "test" })
    );

    await waitFor(() => {
      expect(result.current.nivel).toBeNull();
      expect(result.current.clip).toBeNull();
      expect(result.current.reproduciendo).toBe(false);
    });
  });

  it("respeta cambios de PRM en tiempo de ejecución", async () => {
    setupMatchMediaMock(false);

    const { result, rerender } = renderHook(
      ({ gesto, opciones }) => useMovimiento(gesto, opciones),
      { initialProps: { gesto: GESTO_PRUEBA, opciones: { personalidadId: "test" } } }
    );

    await waitFor(() => {
      expect(result.current.nivel).not.toBeNull();
    });

    setupMatchMediaMock(true);
    if (typeof window !== "undefined") {
      const mq = (window as any).matchMedia("(prefers-reduced-motion: reduce)");
      mq.dispatchEvent(new Event("change"));
    }

    rerender({ gesto: GESTO_PRUEBA, opciones: { personalidadId: "test" } });

    await waitFor(() => {
      // Cuando PRM se activa, moverAvatar devuelve nivel "quieto" y clip null
      expect(result.current.nivel).toBe("quieto");
      expect(result.current.clip).toBeNull();
    });
  });

  it("SSR-safe: isReducedMotion devuelve false sin window", () => {
    const windowOriginal = global.window;
    delete (global as any).window;

    try {
      __resetPRMTestOnly();
      expect(isReducedMotion()).toBe(false);
    } finally {
      global.window = windowOriginal;
    }
  });

  it("subscribePRM notifica cambios inmediatamente", () => {
    setupMatchMediaMock(false);

    const valores: boolean[] = [];
    const cancelar = subscribePRM((activo) => valores.push(activo));

    expect(valores).toContain(false);

    setupMatchMediaMock(true);
    if (typeof window !== "undefined") {
      const mq = (window as any).matchMedia("(prefers-reduced-motion: reduce)");
      mq.dispatchEvent(new Event("change"));
    }

    expect(valores).toContain(true);

    cancelar();
  });
});