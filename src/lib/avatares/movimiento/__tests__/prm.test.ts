import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isReducedMotion, subscribePRM } from "../prm";

function mockMatchMedia(matches: boolean, shouldIncludeReducedMotion: boolean = true): void {
    const query = shouldIncludeReducedMotion
        ? "(prefers-reduced-motion: reduce)"
        : "(other-query)";

    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockImplementation((q: string) => ({
            matches: q === query ? matches : false,
            media: q,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    });
}

function resetSingletonModule(): void {
    vi.resetModules();
}

describe("isReducedMotion singleton PRM", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetSingletonModule();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("lee el estado inicial del sistema cuando el sistema pide menos movimiento", () => {
        mockMatchMedia(true);
        expect(isReducedMotion()).toBe(true);
    });

    it("lee el estado inicial del sistema cuando el sistema permite movimiento completo", () => {
        mockMatchMedia(false);
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
        mockMatchMedia(false);
        const estados: boolean[] = [];

        const cancelar = subscribePRM((activo) => {
            estados.push(activo);
        });

        mockMatchMedia(true);
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        mq.dispatchEvent(new Event("change"));

        expect(estados).toContain(true);

        cancelar();
    });
});
