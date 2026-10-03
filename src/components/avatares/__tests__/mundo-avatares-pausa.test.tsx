import * as React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppearanceProvider } from "@/context/appearance-context";
import { MundoAvatares } from "../mundo-avatares";
import { mundoInicial } from "@/lib/avatares/mundo/simulacion";

/* En jsdom no hay WebGL real, así que el componente degrada a CronicaMundo,
 * que expone el tick del estado: basta para probar la conducta de la pausa. */

const estadoCero = () => mundoInicial([{ id: "a1", nombre: "Astra" }]);

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("MundoAvatares · pausa de la simulación", () => {
    it("con pausadoInicial el tick no avanza aunque pase el tiempo", () => {
        render(
            <AppearanceProvider>
                <MundoAvatares estadoInicial={estadoCero()} pausadoInicial />
            </AppearanceProvider>,
        );
        expect(screen.getByText(/tick 0/)).toBeTruthy();
        act(() => {
            vi.advanceTimersByTime(10_000);
        });
        expect(screen.getByText(/tick 0/)).toBeTruthy();
    });

    it("sin pausa el tick sí avanza al pasar el tiempo", () => {
        render(
            <AppearanceProvider>
                <MundoAvatares estadoInicial={estadoCero()} />
            </AppearanceProvider>,
        );
        expect(screen.getByText(/tick 0/)).toBeTruthy();
        act(() => {
            vi.advanceTimersByTime(10_000);
        });
        expect(screen.queryByText(/tick 0/)).toBeNull();
        expect(screen.getByText(/tick [1-9]/)).toBeTruthy();
    });
});
