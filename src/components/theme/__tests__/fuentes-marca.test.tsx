import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import {
    FUENTES_MARCA,
    FuentesMarca,
    HOJA_QUICKSAND,
    HOJA_SATOSHI,
    VARIABLES_MARCA,
    construirVariablesCss,
    enlacesPendientes,
    hojasParaPapel,
} from "../fuentes-marca";

afterEach(() => {
    cleanup();
    for (const enlace of document.querySelectorAll("link[data-ss-fuente]")) {
        enlace.remove();
    }
    document.getElementById("ss-fuentes-marca")?.remove();
});

describe("hojasParaPapel", () => {
    it("solo el papel editorial pide la hoja de Satoshi", () => {
        expect(hojasParaPapel("display-editorial")).toEqual([HOJA_SATOSHI]);
        expect(hojasParaPapel("titular-tecnico")).toEqual([]);
        expect(hojasParaPapel("cuerpo")).toEqual([]);
    });

    it("el papel orgánico y el tema Natural piden Quicksand", () => {
        expect(hojasParaPapel("organico")).toEqual([HOJA_QUICKSAND]);
        expect(hojasParaPapel("cuerpo", "natural")).toEqual([HOJA_QUICKSAND]);
        expect(hojasParaPapel("cuerpo", "Materia-Viva")).toEqual([
            HOJA_QUICKSAND,
        ]);
    });

    it("editorial sobre Natural pide las dos hojas, sin repetir", () => {
        expect(hojasParaPapel("display-editorial", "natural")).toEqual([
            HOJA_SATOSHI,
            HOJA_QUICKSAND,
        ]);
    });
});

describe("enlacesPendientes", () => {
    it("no duplica lo que ya está ni lo repetido en la solicitud", () => {
        const existentes = [HOJA_SATOSHI];
        expect(
            enlacesPendientes(
                [HOJA_SATOSHI, HOJA_QUICKSAND, HOJA_QUICKSAND],
                existentes,
            ),
        ).toEqual([HOJA_QUICKSAND]);
        expect(enlacesPendientes([HOJA_SATOSHI], existentes)).toEqual([]);
    });
});

describe("variables de marca", () => {
    it("expone las tres variables con respaldos legibles", () => {
        expect(VARIABLES_MARCA["--ss-font-display"]).toBe(
            FUENTES_MARCA.display,
        );
        expect(VARIABLES_MARCA["--ss-font-titular"]).toContain("Rajdhani");
        expect(VARIABLES_MARCA["--ss-font-organica"]).toContain("Quicksand");
        for (const valor of Object.values(VARIABLES_MARCA)) {
            expect(valor).toContain("Inter");
            expect(valor).toContain("sans-serif");
        }
    });

    it("construye el CSS con cada variable y su respaldo", () => {
        const css = construirVariablesCss();
        expect(css).toContain(":root {");
        expect(css).toContain("--ss-font-display: 'Satoshi'");
        expect(css).toContain("--ss-font-titular: 'Rajdhani'");
        expect(css).toContain("--ss-font-organica: 'Quicksand'");
    });
});

function enlacesDe(url: string): HTMLLinkElement[] {
    return Array.from(
        document.querySelectorAll<HTMLLinkElement>("link[data-ss-fuente]"),
    ).filter((enlace) => enlace.getAttribute("data-ss-fuente") === url);
}

describe("FuentesMarca", () => {
    it("carga una sola vez la hoja pedida aunque haya dos montajes", async () => {
        render(<FuentesMarca papel="display-editorial" />);
        render(<FuentesMarca papel="display-editorial" />);
        await waitFor(() => {
            expect(enlacesDe(HOJA_SATOSHI)).toHaveLength(1);
        });
    });

    it("el tema Natural añade Quicksand sin repetir Satoshi", async () => {
        render(<FuentesMarca papel="display-editorial" tema="natural" />);
        render(<FuentesMarca papel="display-editorial" tema="natural" />);
        await waitFor(() => {
            expect(enlacesDe(HOJA_SATOSHI)).toHaveLength(1);
            expect(enlacesDe(HOJA_QUICKSAND)).toHaveLength(1);
        });
        expect(
            document.getElementById("ss-fuentes-marca")?.textContent,
        ).toContain("--ss-font-organica");
    });
});
