import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { renderToString } from "react-dom/server";
import { hydrateRoot, act } from "react-dom/client";
import { cleanup } from "@testing-library/react";
import { SelectorIdioma } from "../selector-idioma";
import { IDIOMAS } from "@/lib/idiomas/idiomas";
import { CLAVE_IDIOMA_NEURONA } from "@/lib/idiomas/estado";

const originalNavigatorLanguage = navigator.language;
const originalLocalStorage = global.localStorage;

beforeAll(() => {
    Object.defineProperty(navigator, "language", { value: "fr-FR", configurable: true });
});

afterAll(() => {
    Object.defineProperty(navigator, "language", { value: originalNavigatorLanguage, configurable: true });
});

beforeEach(() => {
    cleanup();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const store: Record<string, string> = {};
    global.localStorage = {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => { store[k] = v; },
        removeItem: (k: string) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
        key: (i: number) => Object.keys(store)[i] ?? null,
        get length() { return Object.keys(store).length; },
    } as Storage;
    localStorage.setItem(CLAVE_IDIOMA_NEURONA, JSON.stringify({ codigo: "en", elegidoEn: new Date().toISOString() }));
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    global.localStorage = originalLocalStorage;
});

describe("hidratación del selector de idioma", () => {
    it("el primer render del rótulo giratorio coincide en servidor y cliente sin errores de hidratación", () => {
        const errores: string[] = [];
        const originalError = console.error;
        console.error = (...args: unknown[]) => {
            const msg = args.map(String).join(" ");
            if (/Hydration|hydrat|418/i.test(msg)) errores.push(msg);
            originalError.apply(console, args);
        };

        const html = renderToString(<SelectorIdioma />);

        const contenedor = document.createElement("div");
        contenedor.innerHTML = html;
        document.body.appendChild(contenedor);

        let raiz: ReturnType<typeof hydrateRoot>;
        act(() => {
            raiz = hydrateRoot(contenedor, <SelectorIdioma />);
        });

        const rotuloServer = contenedor.querySelector("[data-testid=rotulo-idioma]")?.textContent ?? "";
        const rotuloCliente = contenedor.querySelector("[data-testid=rotulo-idioma]")?.textContent ?? "";

        expect(errores.filter((e) => /Hydration|hydrat|418/i.test(e))).toHaveLength(0);
        expect(rotuloCliente).toBe(rotuloServer);
        expect(rotuloServer).toBe(IDIOMAS[0].rotulo);

        act(() => { vi.advanceTimersByTime(1000); });
        const rotuloDespues = contenedor.querySelector("[data-testid=rotulo-idioma]")?.textContent ?? "";
        expect(rotuloDespues).not.toBe(rotuloServer);
        expect(IDIOMAS.map((i) => i.rotulo)).toContain(rotuloDespues);

        raiz!.unmount();
        contenedor.remove();
        console.error = originalError;
    });
});