import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { act } from "react";
import { SelectorIdioma } from "../selector-idioma";
import { CLAVE_IDIOMA_NEURONA } from "@/lib/idiomas/estado";
import { IDIOMAS } from "@/lib/idiomas/idiomas";

const consolaOriginal = { error: console.error, warn: console.warn, log: console.log, info: console.info };
let mensajesConsola: string[] = [];
let raizHidratacion: Root | null = null;
let contenedor: HTMLDivElement | null = null;

function capturarConsola() {
    for (const k of ["error", "warn", "log", "info"] as const) {
        console[k] = (...a: unknown[]) => {
            mensajesConsola.push(`${k}: ${a.map((x) => (x instanceof Error ? x.message : String(x))).join(" ").slice(0, 500)}`);
        };
    }
}

function restaurarConsola() {
    Object.assign(console, consolaOriginal);
}

function hayErrorHidratacion(): boolean {
    return mensajesConsola.some(
        (m) => m.toLowerCase().includes("hydration") || m.toLowerCase().includes("hydrat") || m.includes("418")
    );
}

function textoRotulo(contenedor: HTMLElement): string {
    const el = contenedor.querySelector('[data-testid="rotulo-idioma"]');
    return el?.textContent ?? "";
}

beforeAll(() => {
    capturarConsola();
    vi.useFakeTimers();
    const g = globalThis as any;
    g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    g.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
});

afterAll(() => {
    restaurarConsola();
    vi.useRealTimers();
});

beforeEach(() => {
    mensajesConsola = [];
    vi.clearAllMocks();
    contenedor = document.createElement("div");
    document.body.appendChild(contenedor);
    vi.setSystemTime(new Date("2026-01-15T10:00:00.000Z"));
    Object.defineProperty(navigator, "language", { writable: true, configurable: true, value: "fr-FR" });
    Object.defineProperty(navigator, "languages", { writable: true, configurable: true, value: ["fr-FR", "fr", "en-US", "en"] });
    localStorage.clear();
    localStorage.setItem(CLAVE_IDIOMA_NEURONA, JSON.stringify({ codigo: "en", elegidoEn: "2026-01-15T10:00:00.000Z" }));
});

afterEach(() => {
    raizHidratacion?.unmount();
    raizHidratacion = null;
    contenedor?.remove();
    contenedor = null;
    vi.restoreAllMocks();
});

describe("SelectorIdioma · hidratación sin mismatch", () => {
    it("el primer render del servidor y del cliente coinciden; el rótulo rota tras 1 s", () => {
        const htmlServidor = renderToString(<SelectorIdioma />);
        expect(htmlServidor).toContain("Elegir idioma");
        expect(htmlServidor).toContain('data-testid="rotulo-idioma"');

        act(() => {
            raizHidratacion = hydrateRoot(contenedor!, <SelectorIdioma />);
        });

        expect(hayErrorHidratacion()).toBe(false);

        const rotuloInicial = textoRotulo(contenedor!);
        expect(rotuloInicial).toBe("Elegir idioma");
        expect(rotuloInicial).toBe(IDIOMAS[0].rotulo);

        act(() => {
            vi.advanceTimersByTime(1000);
        });

        const rotuloDespues = textoRotulo(contenedor!);
        expect(rotuloDespues).not.toBe(rotuloInicial);
        expect(IDIOMAS.map((i) => i.rotulo)).toContain(rotuloDespues);
    });

    it("sin localStorage, el idioma efectivo sigue siendo español en el primer render", () => {
        localStorage.clear();
        const htmlServidor = renderToString(<SelectorIdioma />);
        act(() => {
            raizHidratacion = hydrateRoot(contenedor!, <SelectorIdioma />);
        });
        expect(hayErrorHidratacion()).toBe(false);
        expect(textoRotulo(contenedor!)).toBe("Elegir idioma");
    });
});