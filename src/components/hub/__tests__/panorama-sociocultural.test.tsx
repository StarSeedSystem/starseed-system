import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Cuatro paneles de mentira: la prueba es de la pestaña, no de las páginas.
vi.mock("@/components/network/paneles", () => ({
    PanelPanorama: () => <div data-testid="panel-panorama">panorama</div>,
    PanelPolitica: () => <div data-testid="panel-politica">politica</div>,
    PanelEducacion: () => <div data-testid="panel-educacion">educacion</div>,
    PanelCultura: () => <div data-testid="panel-cultura">cultura</div>,
}));

import {
    PanoramaSociocultural,
    PANORAMA_SUB_KEY,
} from "../panorama-sociocultural";

beforeEach(() => {
    window.localStorage.clear();
});

afterEach(() => {
    cleanup();
});

describe("PanoramaSociocultural", () => {
    it("arranca en Panorama", async () => {
        render(<PanoramaSociocultural />);
        expect(await screen.findByTestId("panel-panorama")).toBeTruthy();
        expect(screen.queryByTestId("panel-cultura")).toBeNull();
    });

    it("al pulsar Cultura pinta Cultura y deja de estar Panorama", async () => {
        render(<PanoramaSociocultural />);
        fireEvent.click(screen.getByRole("tab", { name: "Cultura" }));
        expect(await screen.findByTestId("panel-cultura")).toBeTruthy();
        expect(screen.queryByTestId("panel-panorama")).toBeNull();
    });

    it("guarda la elección y la recuerda en la siguiente visita", async () => {
        const vista = render(<PanoramaSociocultural />);
        fireEvent.click(screen.getByRole("tab", { name: "Política" }));
        await screen.findByTestId("panel-politica");
        expect(window.localStorage.getItem(PANORAMA_SUB_KEY)).toBe("politica");
        vista.unmount();

        render(<PanoramaSociocultural />);
        // Tras montar se lee el recuerdo: ya no está Panorama, está Política.
        expect(await screen.findByTestId("panel-politica")).toBeTruthy();
        expect(screen.queryByTestId("panel-panorama")).toBeNull();
    });

    it("si localStorage lanza al leer, sigue pintando sin romperse", async () => {
        const espia = vi
            .spyOn(Storage.prototype, "getItem")
            .mockImplementation(() => {
                throw new Error("bloqueado");
            });
        render(<PanoramaSociocultural />);
        expect(await screen.findByTestId("panel-panorama")).toBeTruthy();
        espia.mockRestore();
    });

    it("cada panel lleva role=tabpanel con su nombre", async () => {
        render(<PanoramaSociocultural />);
        expect(
            (await screen.findByRole("tabpanel")).getAttribute("aria-label"),
        ).toBe("Panorama");
        fireEvent.click(screen.getByRole("tab", { name: "Educación" }));
        await screen.findByTestId("panel-educacion");
        expect(screen.getByRole("tabpanel").getAttribute("aria-label")).toBe(
            "Educación",
        );
    });
});
