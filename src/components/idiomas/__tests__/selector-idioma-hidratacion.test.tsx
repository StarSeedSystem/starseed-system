import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act } from "react";
import { SelectorIdioma } from "../selector-idioma";
import { IDIOMAS } from "@/lib/idiomas/idiomas";

// DIFERENCIA EN EL PRIMER RENDER:
// - El servidor renderiza con el estado inicial useState(0) del RotuloGiratorio → "Elegir idioma" (es)
// - El cliente también inicia en 0 → "Elegir idioma" (es)  
// - Ambos coinciden, pero el servidor NO ejecuta useEffect (sin window), mientras que el cliente sí.
// - El error #418 de hidratación NO proviene del RotuloGiratorio: el HTML inicial coincide.
// - La prueba verifica que el primer render es determinista (sin diferencias entre SSR y CSR).

// Mock para entorno cliente (SelectorIdioma es "use client")
const localStorageMock = {
    getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
};

describe("SelectorIdioma Hidratación", () => {
    beforeEach(() => {
        Object.defineProperty(window, "localStorage", { value: localStorageMock });
        Object.defineProperty(window, "addEventListener", { value: vi.fn() });
        Object.defineProperty(window, "removeEventListener", { value: vi.fn() });
        Object.defineProperty(window, "dispatchEvent", { value: vi.fn() });
        localStorageMock.getItem.mockClear();
        localStorageMock.setItem.mockClear();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("el primer render del rótulo es determinista: servidor y cliente coinciden", () => {
        const html = renderToString(<SelectorIdioma />);
        const rotuloInicial = IDIOMAS[0].rotulo;
        expect(html).toContain(rotuloInicial);
    });

    it("debe hidratarse sin errores de Hydration #418", async () => {
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {}).mockName("console.error");
        
        const html = renderToString(<SelectorIdioma />);
        expect(html).toContain(`data-testid="selector-idioma"`);

        const container = document.body.appendChild(document.createElement("div"));
        container.innerHTML = html;

        await act(async () => {
            hydrateRoot(container, <SelectorIdioma />);
        });

        const erroresHydratacion = consoleErrorSpy.mock.calls.filter(
            (call) => typeof call[0] === "string" && (call[0].includes("Hydrat") || call[0].includes("418"))
        );
        
        expect(erroresHydratacion).toEqual([]);
        container.remove();
    });

    it("el texto del rótulo coincide entre servidor y cliente en el primer render", () => {
        const htmlServidor = renderToString(<SelectorIdioma />);
        
        const contenedorRotulo = htmlServidor.match(/data-testid="rotulo-idioma"[^>]*>([^<]*)</);
        expect(contenedorRotulo).not.toBeNull();
        expect(contenedorRotulo![1]).toBe(IDIOMAS[0].rotulo);
    });

    it("el rótulo cambia tras el primer intervalo (1 segundo)", () => {
        vi.useFakeTimers();
        
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {}).mockName("console.error");
        
        const container = document.body.appendChild(document.createElement("div"));
        
        hydrateRoot(container, <SelectorIdioma />);
        
        const rotulo = container.querySelector('[data-testid="rotulo-idioma"]');
        expect(rotulo?.textContent).toBe(IDIOMAS[0].rotulo);
        
        vi.advanceTimersByTime(1000);
        
        expect(rotulo?.textContent).toBe(IDIOMAS[1].rotulo);
        
        consoleErrorSpy.mockRestore();
        vi.useRealTimers();
        container.remove();
    });
});
