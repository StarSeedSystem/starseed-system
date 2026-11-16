/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { SelectorIdioma } from "../selector-idioma";
import { CLAVE_IDIOMA_NEURONA } from "@/lib/idiomas/estado";
import { expect } from "vitest";
import { IDIOMAS } from "@/lib/idiomas/idiomas";

beforeEach(() => {
    Object.defineProperty(navigator, "language", { value: "fr-FR", configurable: true });
    localStorage.setItem(CLAVE_IDIOMA_NEURONA, JSON.stringify({ codigo: "en", elegidoEn: new Date().toISOString() }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("hidratación del selector de idioma", () => {
    it("el primer render del rótulo es idéntico en servidor y cliente, y cambia después de 1 segundo", async () => {
        const html = renderToString(<SelectorIdioma />);
        const div = document.createElement("div");
        div.innerHTML = html!;
        document.body.appendChild(div);

        const { rerender } = render(<SelectorIdioma />, { container: div });
        await act(async () => { });

        const rotuloInitial = screen.getByTestId("rotulo-idioma").textContent;
        expect(rotuloInitial).toBe("Elegir idioma");

        vi.advanceTimersByTime(1000);
        await act(async () => { });

        const rotuloAfter1s = screen.getByTestId("rotulo-idioma").textContent;
        expect(rotuloAfter1s).not.toBe(rotuloInitial);
    });

    it("ningún error de hidratación en consola (ni 'Hydration', 'hydrat', ni '418')", () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {}) as ReturnType<typeof vi.spyOn>;

        const html = renderToString(<SelectorIdioma />);
        const div = document.createElement("div");
        div.innerHTML = html!;
        document.body.appendChild(div);

        render(<SelectorIdioma />, { container: div });
        act(() => { });

        const calls = consoleError.mock.calls.flat();
        const hasHydrationError = calls.some((c: unknown) =>
            String(c).includes("Hydration") ||
            String(c).includes("hydrat") ||
            String(c).includes("418")
        );
        expect(hasHydrationError).toBe(false);
        consoleError.mockRestore();
    });
});