import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { act, hydrateRoot } from "react-dom/client";
import { SelectorIdioma } from "../selector-idioma";
import { CLAVE_IDIOMA_NEURONA } from "../../lib/idiomas/estado";

function setupEnv() {
    Object.defineProperty(window, "navigator", {
        value: {
            language: "fr-FR",
            languages: ["fr-FR"],
        },
        writable: true,
    });
    const stored = { codigo: "en", elegidoEn: new Date().toISOString() };
    window.localStorage.setItem(CLAVE_IDIOMA_NEURONA, JSON.stringify(stored));
}

describe("SelectorIdioma hydration", () => {
    it("rótulo giratorio determinista entre SSR y CSR", async () => {
        vi.useFakeTimers();
        setupEnv();
        const serverHTML = renderToString(<SelectorIdioma />);
        const container = document.createElement("div");
        container.id = "root";
        document.body.appendChild(container);
        const consoleErrorSpy = vi.spyOn(console, "error");
        act(() => {
            hydrateRoot(container, <SelectorIdioma />);
        });
        expect(
            consoleErrorSpy.mock.calls.some((c) => c[0].includes("Hydrat") || c[0].includes("hydrat"))
        ).toBe(false);
        expect(container.innerHTML).toBe(serverHTML);
        const rotulo = container.querySelector('[data-testid="rotulo-idioma"]');
        expect(rotulo?.textContent).not.toBe(undefined);
        act(() => vi.advanceTimersByTime(1000));
        await Promise.resolve();
        const nuevoRotulo = container.querySelector('[data-testid="rotulo-idioma"]');
        expect(nuevoRotulo?.textContent).not.toBe(rotulo?.textContent);
        consoleErrorSpy.mockRestore();
        vi.useRealTimers();
    });
});