import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isReducedMotion, subscribePRM, __resetPRMTestOnly } from "../prm";

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

describe("isReducedMotion singleton PRM", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetPRMTestOnly();
        changeListeners.clear();
        currentMock = undefined;
        setupMatchMediaMock(false);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        __resetPRMTestOnly();
    });

    it("lee el estado inicial del sistema cuando el sistema pide menos movimiento", () => {
        setupMatchMediaMock(true);
        expect(isReducedMotion()).toBe(true);
    });

    it("lee el estado inicial del sistema cuando el sistema permite movimiento completo", () => {
        setupMatchMediaMock(false);
        expect(isReducedMotion()).toBe(false);
    });

    it("devuelve false en entorno sin ventana (SSR-safe)", () => {
        const windowOriginal = global.window;
        delete (global as any).window;

        try {
            expect(isReducedMotion()).toBe(false);
        } finally {
            global.window = windowOriginal;
        }
    });

    it("actualiza suscriptores cuando el sistema operativo cambia la preferencia", () => {
        setupMatchMediaMock(false);
        const estados: boolean[] = [];

        const cancelar = subscribePRM((activo) => {
            estados.push(activo);
        });

        setupMatchMediaMock(true);
        if (typeof window !== "undefined") {
            const mq = (window as any).matchMedia("(prefers-reduced-motion: reduce)");
            mq.dispatchEvent(new Event("change"));
        }

        expect(estados).toContain(true);

        cancelar();
    });
});