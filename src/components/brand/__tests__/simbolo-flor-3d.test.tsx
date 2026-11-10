// ESC1110B — El símbolo con flor: marco centrado en el disco inferior, imagen fija con la flor, y
// el lienzo/zona interactiva solo cuando hay 3D en vivo (en jsdom, imagen fija).
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { SimboloStarSeed3D, SIMBOLO_3D_FLOR_FIJO, LADO_FLOR_UNIDADES, marcoConFlor } from "../simbolo-starseed-3d";
import { encuadreSimbolo } from "../simbolo-starseed-escena";
import { PROPORCION } from "../simbolo-starseed-medidas";

afterEach(cleanup);

describe("símbolo con flor", () => {
    it("el marco del lienzo es el encuadre de la escena, centrado en el disco inferior", () => {
        expect(LADO_FLOR_UNIDADES).toBeCloseTo(encuadreSimbolo(true).lado, 12);
        const m = marcoConFlor(192);
        expect(m.pxPorUnidad).toBeCloseTo(192 / PROPORCION, 9);
        expect(m.izquierda + m.lado / 2).toBeCloseTo(64, 9); // centro horizontal de la caja 128 × 192
        expect(m.arriba + m.lado / 2).toBeCloseTo((997 / 1497) * 192, 9); // centro del disco inferior
        expect(m.ojoY).toBeCloseTo(96, 9);
    });

    it("en jsdom pinta la imagen fija con la flor, sin lienzo ni zona interactiva", () => {
        const { getByTestId, container, queryByTestId } = render(<SimboloStarSeed3D conFlor interactivo />);
        expect(getByTestId("simbolo-starseed-fijo").getAttribute("src")).toBe(SIMBOLO_3D_FLOR_FIJO);
        expect(getByTestId("simbolo-starseed-3d").style.width).toBe("128px");
        expect(container.querySelector("canvas")).toBeNull();
        expect(queryByTestId("simbolo-flor-zona")).toBeNull();
    });
});
