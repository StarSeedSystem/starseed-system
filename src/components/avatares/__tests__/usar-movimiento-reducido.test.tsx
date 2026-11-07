/**
 * usarReducirMovimiento · el interruptor de accesibilidad único de los avatares.
 * Comprueba la costura compartida: lectura según la preferencia del sistema y
 * reacción EN VIVO al cambio de preferencia (el fallo real: AvatarVivoAdn la
 * leía una sola vez al montar y el visor VRM seguía animando con movimiento
 * reducido; y AvatarVivoFuente mantenía su propio oyente duplicado).
 */
import { renderHook, act, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usarReducirMovimiento } from "../usar-movimiento";

/** Sustituye `window.matchMedia` por una cola que sabemos disparar. */
function instalarMq(matchesInicial: boolean) {
    const oyentes = new Set<() => void>();
    const mq = {
        matches: matchesInicial,
        addEventListener: (_tipo: string, fn: () => void) => {
            oyentes.add(fn);
        },
        removeEventListener: (_tipo: string, fn: () => void) => {
            oyentes.delete(fn);
        },
    };
    window.matchMedia = (() => mq) as unknown as typeof window.matchMedia;
    return {
        cambiar(matches: boolean) {
            mq.matches = matches;
            for (const fn of oyentes) fn();
        },
    };
}

const matchMediaOriginal = window.matchMedia;

afterEach(() => {
    cleanup();
    window.matchMedia = matchMediaOriginal;
});

describe("usarReducirMovimiento", () => {
    it("devuelve false cuando el sistema no pide movimiento reducido", () => {
        instalarMq(false);
        const { result } = renderHook(() => usarReducirMovimiento());
        expect(result.current).toBe(false);
    });

    it("devuelve true cuando el sistema pide movimiento reducido", () => {
        instalarMq(true);
        const { result } = renderHook(() => usarReducirMovimiento());
        expect(result.current).toBe(true);
    });

    it("reacciona en vivo a un cambio de preferencia del sistema", () => {
        const { cambiar } = instalarMq(false);
        const { result } = renderHook(() => usarReducirMovimiento());
        expect(result.current).toBe(false);
        act(() => cambiar(true));
        expect(result.current).toBe(true);
        act(() => cambiar(false));
        expect(result.current).toBe(false);
    });
});
