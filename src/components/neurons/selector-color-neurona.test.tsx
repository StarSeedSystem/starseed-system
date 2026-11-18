// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { SelectorColorNeurona } from "./selector-color-neurona";
import { NEURON_PREFS_KEY, settingsFor } from "@/lib/neurons/neurons";
import { colorPublicoDeNeurona } from "@/lib/neurons/color-publico-ajuste";
import { PALETA_COLOR_PUBLICO } from "@/lib/neurons/color-publico";

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("CTL1117I · color público en los ajustes de la neurona", () => {
    it("sin dato guardado enseña el color por defecto de su id y las 12 muestras, ninguna marcada", () => {
        render(<SelectorColorNeurona id="neurona-1" />);
        expect(screen.getByTestId("color-actual")).toHaveTextContent("#3c9fdd");
        const r = screen.getAllByRole("radio");
        expect(r).toHaveLength(PALETA_COLOR_PUBLICO.length);
        expect(r.filter((x) => x.getAttribute("aria-checked") === "true")).toHaveLength(0);
    });
    it("elegir una muestra la guarda en los ajustes de la neurona (misma clave que el resto, sin migración)", async () => {
        render(<SelectorColorNeurona id="neurona-1" />);
        await userEvent.click(screen.getByRole("radio", { name: /Violeta/ }));
        expect(screen.getByTestId("color-actual")).toHaveTextContent("#8e4ec6");
        expect(settingsFor("neurona-1").colorPublico).toBe("#8e4ec6");
        expect(JSON.parse(window.localStorage.getItem(NEURON_PREFS_KEY) ?? "{}").settings["neurona-1"].colorPublico).toBe("#8e4ec6");
        expect(screen.getByRole("radio", { name: /Violeta/ })).toHaveAttribute("aria-checked", "true");
        expect(colorPublicoDeNeurona("neurona-1")).toBe("#8e4ec6");
    });
    it("un color propio se normaliza a minúsculas; uno mal escrito avisa y no guarda", async () => {
        render(<SelectorColorNeurona id="neurona-1" />);
        const campo = screen.getByLabelText("Otro color (#rrggbb)");
        await userEvent.type(campo, "#ABCDEF{Enter}");
        expect(screen.getByTestId("color-actual")).toHaveTextContent("#abcdef");
        expect(settingsFor("neurona-1").colorPublico).toBe("#abcdef");
        await userEvent.type(campo, "azul{Enter}");
        expect(screen.getByTestId("color-invalido")).toBeInTheDocument();
        expect(campo).toHaveAttribute("aria-invalid", "true");
        expect(settingsFor("neurona-1").colorPublico).toBe("#abcdef");
        expect(screen.getByRole("button", { name: "Usar este color" })).toBeDisabled();
    });
    it("«Volver al color de siempre» deja el de su id", async () => {
        render(<SelectorColorNeurona id="neurona-1" />);
        await userEvent.click(screen.getByRole("radio", { name: /Rojo/ }));
        await userEvent.click(screen.getByRole("button", { name: "Volver al color de siempre" }));
        expect(screen.getByTestId("color-actual")).toHaveTextContent("#3c9fdd");
        expect(settingsFor("neurona-1").colorPublico).toBeUndefined();
    });
    it("cada muestra se maneja con teclado y dice su nombre y su valor", async () => {
        render(<SelectorColorNeurona id="neurona-1" />);
        const m = screen.getByRole("radio", { name: "Color Azul #0091ff" });
        m.focus();
        await userEvent.keyboard("{Enter}");
        expect(m).toHaveAttribute("aria-checked", "true");
    });
});
