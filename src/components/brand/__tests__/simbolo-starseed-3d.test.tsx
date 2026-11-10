// ESC1110A — Con movimiento reducido (y en jsdom) el símbolo muestra la imagen fija.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { SimboloStarSeed3D, SIMBOLO_3D_FIJO } from "../simbolo-starseed-3d";

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("SimboloStarSeed3D", () => {
    it("con prefers-reduced-motion muestra la imagen fija y ningún lienzo", () => {
        vi.stubGlobal("matchMedia", (q: string) => ({
            matches: q.includes("reduce"), media: q, onchange: null,
            addEventListener: () => {}, removeEventListener: () => {},
            addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
        }));
        const { getByTestId, container } = render(<SimboloStarSeed3D />);
        const fijo = getByTestId("simbolo-starseed-fijo") as HTMLImageElement;
        expect(fijo.getAttribute("src")).toBe(SIMBOLO_3D_FIJO);
        expect(fijo.style.opacity).toBe("1");
        expect(getByTestId("simbolo-starseed-3d").dataset.modo).toBe("fijo");
        expect(container.querySelector("canvas")).toBeNull();
    });

    it("es decorativo por defecto y nombrado cuando va solo", () => {
        const { getByTestId, rerender } = render(<SimboloStarSeed3D />);
        expect(getByTestId("simbolo-starseed-3d").getAttribute("aria-hidden")).toBe("true");
        rerender(<SimboloStarSeed3D etiqueta="Símbolo de StarSeed" />);
        const caja = getByTestId("simbolo-starseed-3d");
        expect(caja.getAttribute("role")).toBe("img");
        expect(caja.getAttribute("aria-label")).toBe("Símbolo de StarSeed");
        expect(caja.getAttribute("aria-hidden")).toBeNull();
    });

    it("conserva la caja 2:3 del símbolo", () => {
        const { getByTestId } = render(<SimboloStarSeed3D alto={180} />);
        const caja = getByTestId("simbolo-starseed-3d");
        expect(caja.style.width).toBe("120px");
        expect(caja.style.height).toBe("180px");
    });
});
