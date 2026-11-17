/** @vitest-environment jsdom */
import { act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { SelectorIdioma } from "../selector-idioma";
import { CLAVE_IDIOMA_NEURONA } from "@/lib/idiomas/estado";

let serverHtml = "";
let serverLabel = "";

beforeEach(() => {
    localStorage.clear();
    // Elección previa de este aparato ANTES del render del servidor: el primer render
    // NO debe consumirla (el componente parte de «es»; el efecto la aplica tras hidratar).
    localStorage.setItem(CLAVE_IDIOMA_NEURONA, JSON.stringify({ codigo: "en" }));
    // Sin avance automático del reloj: el rótulo solo gira cuando la prueba lo avanza.
    vi.useFakeTimers();
    Object.defineProperty(navigator, "language", { value: "fr-FR", configurable: true });
    if (!navigator.languages) Object.defineProperty(navigator, "languages", { value: ["fr-FR"], configurable: true });
    serverHtml = renderToString(<SelectorIdioma />);
    const m = serverHtml.match(/data-testid="rotulo-idioma"[^>]*>(.*?)<\/span>/);
    serverLabel = m ? m[1] : "";
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("selector de idioma – hidratación", () => {
    it("el primer render del rótulo es idéntico en servidor y cliente, y gira tras 1 s", () => {
        // Capturar errores de consola
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        const container = document.createElement("div");
        container.innerHTML = serverHtml;
        act(() => { hydrateRoot(container, <SelectorIdioma />); });

        const rotulo = container.querySelector('[data-testid="rotulo-idioma"]');
        expect(rotulo?.textContent).toBe(serverLabel);

        const bad = errorSpy.mock.calls.find(call => /hydrat|418/i.test(call.join(" ")));
        expect(bad).toBeUndefined();

        act(() => { vi.advanceTimersByTime(1000); });
        const nuevoRotulo = container.querySelector('[data-testid="rotulo-idioma"]');
        expect(nuevoRotulo?.textContent).not.toBe(serverLabel);

        errorSpy.mockRestore();
    });
});