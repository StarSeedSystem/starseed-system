/** @vitest-environment jsdom */
import { act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { SelectorIdioma } from "../selector-idioma";

let root: Root | undefined;
let serverHtml = "";
let serverLabel = "";

function idiomaDelAparato(language: string): void {
    Object.defineProperty(navigator, "language", { value: language, configurable: true });
    Object.defineProperty(navigator, "languages", { value: [language], configurable: true });
}

beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    // Como el servidor: sin señales de idioma del aparato, la sugerencia es el idioma fuente.
    Object.defineProperty(navigator, "language", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "languages", { value: [], configurable: true });
    serverHtml = renderToString(<SelectorIdioma abiertoAlInicio />);
    serverLabel = (serverHtml.match(/data-testid="rotulo-idioma"[^>]*>([^<]*)</) ?? ["", ""])[1];
    idiomaDelAparato("fr-FR");
});

afterEach(() => {
    act(() => { root?.unmount(); });
    root = undefined;
    cleanup();
    vi.useRealTimers();
});

describe("selector de idioma · primer render con el panel abierto", () => {
    // Antes del arreglo, el servidor no veía `navigator` y no pintaba «Sugerido para este
    // aparato», mientras el cliente ya lo pintaba en el primer render: ese texto difería (#418).
    it("el primer render del cliente es el del servidor; el sugerido entra en un efecto", () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const contenedor = document.createElement("div");
        document.body.appendChild(contenedor);
        contenedor.innerHTML = serverHtml;

        act(() => { root = hydrateRoot(contenedor, <SelectorIdioma abiertoAlInicio />); });

        expect(serverHtml).not.toContain("Sugerido para este aparato");
        expect(contenedor.querySelector('[data-testid="rotulo-idioma"]')?.textContent).toBe(serverLabel);
        const desajuste = errorSpy.mock.calls.find((llamada) => /hydrat|418/i.test(llamada.map((v) => String(v)).join(" ")));
        expect(desajuste).toBeUndefined();
        errorSpy.mockRestore();

        // Lo variable (el idioma del aparato) ya llegó tras hidratar, sin romper nada.
        expect(contenedor.textContent).toContain("Sugerido para este aparato");
        expect(contenedor.querySelector("[role=option]")?.getAttribute("data-codigo")).toBe("fr");

        // El rótulo es igual al del servidor en el primer render y solo gira al pasar un segundo.
        expect(contenedor.querySelector('[data-testid="rotulo-idioma"]')?.textContent).toBe(serverLabel);
        act(() => { vi.advanceTimersByTime(1000); });
        expect(contenedor.querySelector('[data-testid="rotulo-idioma"]')?.textContent).not.toBe(serverLabel);

        contenedor.remove();
    });
});
