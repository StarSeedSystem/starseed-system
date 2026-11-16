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
    vi.useFakeTimers({ shouldAdvanceTime: true });
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
    it("el rótulo de la primera render es idéntico en servidor y cliente, cambia tras 1 s", () => {
        // Simular elección previa
        localStorage.setItem(CLAVE_IDIOMA_NEURONA, JSON.stringify({ codigo: "en" }));
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