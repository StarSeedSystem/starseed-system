import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";

import { SelectorColorSeleccion } from "@/components/seleccion/selector-color-seleccion";

describe("SelectorColorSeleccion · etiquetas de participante", () => {
    afterEach(() => {
        cleanup();
    });

    it("muestra 'Maggasukha (tú)' como nombre del participante local", () => {
        render(<SelectorColorSeleccion />);

        expect(screen.getByText("Maggasukha (tú)")).toBeInTheDocument();
    });
});