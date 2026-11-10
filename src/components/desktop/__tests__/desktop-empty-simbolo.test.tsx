// ESC1110A — El escritorio vacío muestra el símbolo oficial en 3D (imagen fija en jsdom),
// justo encima de «Lienzo soberano», y ya no el orbe con la estrella de cuatro puntas.
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EmptyDesktopState } from "../desktop-empty";
import type { Desktop } from "../desktop-store";

afterEach(cleanup);

const escritorio = { id: "d1", name: "Inicio" } as unknown as Desktop;

describe("EmptyDesktopState", () => {
    it("pinta el símbolo StarSeed 3D sobre «Lienzo soberano» y no el orbe ni la estrella", () => {
        const { container } = render(
            <EmptyDesktopState desktop={escritorio} onAddApps={() => {}} onAddWidgets={() => {}} onExploreLibrary={() => {}} />,
        );
        const simbolo = screen.getByTestId("simbolo-starseed-3d");
        // ESC1110B: la imagen fija ya trae la flor fundida.
        expect(screen.getByTestId("simbolo-starseed-fijo").getAttribute("src")).toBe("/brand/starseed-simbolo-flor-3d.webp");
        expect(simbolo.dataset.flor).toBe("si");

        const pastilla = screen.getByText("Lienzo soberano");
        // El símbolo va antes que la pastilla en el documento.
        expect(simbolo.compareDocumentPosition(pastilla) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        // Ni la estrella de cuatro puntas ni el núcleo del orbe.
        expect(container.querySelector('path[d^="M12 1 C12.9 8"]')).toBeNull();
        expect(container.querySelector(".size-32")).toBeNull();
        expect(container.innerHTML).not.toContain("circle at 34% 30%");
        expect(screen.getByText(/Bienvenido a «Inicio»/)).toBeTruthy();
    });
});
