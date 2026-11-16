import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { SelectorIdioma } from "../selector-idioma";
import { CLAVE_IDIOMA_NEURONA } from "@/lib/idiomas/estado";

let erroresConsola: string[] = [];

beforeEach(() => {
    erroresConsola = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
        const mensaje = String(args[0] ?? "");
        erroresConsola.push(mensaje);
        originalError.apply(console, args);
    };

    vi.stubGlobal("matchMedia", () => ({
        matches: false,
        media: "",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }));

    vi.stubGlobal("navigator", {
        language: "fr-FR",
        languages: ["fr-FR", "fr"],
    });

    vi.stubGlobal("window", {
        localStorage: (() => {
            const store: Record<string, string> = {};
            return {
                getItem: (k: string) => store[k] ?? null,
                setItem: (k: string, v: string) => { store[k] = v; },
                removeItem: (k: string) => { delete store[k]; },
                clear: () => { Object.keys(store).forEach(k => delete store[k]); },
                addEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            };
        })(),
        addEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        location: { href: "http://localhost:9002", origin: "http://localhost:9002" },
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("SelectorIdioma: hidratación servidor → cliente", () => {
    it("el primer render es idéntico en servidor y cliente sin errores de hidratación", async () => {
        const contenedor = document.createElement("div");
        document.body.appendChild(contenedor);

        const htmlServidor = renderToString(<SelectorIdioma />);
        expect(htmlServidor).toContain("Elegir idioma");

        const erroresAntes = [...erroresConsola];
        erroresConsola = [];

        await act(async () => {
            hydrateRoot(contenedor, <SelectorIdioma />);
        });

        const erroresDespues = erroresConsola.filter(e => !erroresAntes.includes(e));

        const erroresHidratacion = erroresDespues.filter(e =>
            /hydration|hydrat|418/i.test(e)
        );
        expect(erroresHidratacion).toHaveLength(0);

        expect(screen.getByTestId("rotulo-idioma")).toBeInTheDocument();
        expect(screen.getByTestId("rotulo-idioma")).toHaveTextContent(/Elegir idioma|Choose language/i);

        const contenedorHijo = document.createElement("div");
        document.body.appendChild(contenedorHijo);
        const htmlServidor2 = renderToString(<SelectorIdioma />);
        const nodo = contenedorHijo;
        await act(async () => {
            hydrateRoot(nodo, <SelectorIdioma />);
        });
        expect(nodo.querySelector("[data-testid='selector-idioma']")).toBeInTheDocument();

        vi.useFakeTimers();
        await act(async () => {
            vi.advanceTimersByTime(1000);
        });
        vi.useRealTimers();

        contenedor.remove();
        contenedorHijo.remove();
    });

    it("el rótulo rota secuencialmente por los idiomas del arreglo IDIOMAS", async () => {
        vi.useFakeTimers();

        await act(async () => {
            render(<SelectorIdioma />);
        });

        const rotulo = screen.getByTestId("rotulo-idioma");
        expect(rotulo).toHaveTextContent("Elegir idioma");

        await act(async () => {
            vi.advanceTimersByTime(1000);
        });
        expect(rotulo).toHaveTextContent("English");

        await act(async () => {
            vi.advanceTimersByTime(1000);
        });
        expect(rotulo).toHaveTextContent("Português");

        vi.useRealTimers();
    });
});

describe("SelectorIdioma: estado inicial con localStorage", () => {
    it("muestra el idioma guardado en localStorage como idioma actual", async () => {
        const guardado = JSON.stringify({ codigo: "en", elegidoEn: "2026-01-01T00:00:00.000Z" });
        (window.localStorage as { getItem: (k: string) => string | null }).setItem(CLAVE_IDIOMA_NEURONA, guardado);

        await act(async () => {
            render(<SelectorIdioma />);
        });

        const estadoIdioma = screen.getByTestId("estado-idioma");
        expect(estadoIdioma).toHaveTextContent(/en|English/i);
    });

    it("muestra español cuando localStorage está vacío", async () => {
        window.localStorage.clear();

        await act(async () => {
            render(<SelectorIdioma />);
        });

        const estadoIdioma = screen.getByTestId("estado-idioma");
        expect(estadoIdioma).toHaveTextContent(/es|Español/i);
    });
});