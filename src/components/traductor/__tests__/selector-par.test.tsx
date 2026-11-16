import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SelectorPar } from "../selector-par";

describe("SelectorPar", () => {
    const idiomas = [
        { codigo: "es", nombre: "Español", rotulo: "Elegir idioma", dir: "ltr" as const },
        { codigo: "en", nombre: "English", rotulo: "Choose language", dir: "ltr" as const },
        { codigo: "fr", nombre: "Français", rotulo: "Choisir la langue", dir: "ltr" as const },
    ];

    const instalados = ["Xenova/opus-mt-es-en"];

    it("muestra dos desplegables con las listas de idiomas", () => {
        render(<SelectorPar idiomas={idiomas} par={{ origen: "es", destino: "en" }} onCambiar={() => {}} instalados={instalados} />);

        const origen = screen.getByTestId("origen-selector");
        expect(origen).toBeInTheDocument();
        const destino = screen.getByTestId("destino-selector");
        expect(destino).toBeInTheDocument();
    });

    it("muestra 'Detectar idioma' como primera opción del origen", () => {
        render(<SelectorPar idiomas={idiomas} par={{ origen: "es", destino: "en" }} onCambiar={() => {}} instalados={instalados} />);

        const listaOrigen = screen.getByTestId("origen-lista");
        const opciones = Array.from(listaOrigen.querySelectorAll<HTMLElement>("li[role=option]"));
        const primera = opciones[0];
        expect(primera).toHaveAttribute("data-codigo", "detectar");
        expect(primera).toHaveTextContent(/detectar idioma/i);
    });

    it("muestra la insignia correcta para el destino cuando está instalado", () => {
        render(<SelectorPar idiomas={idiomas} par={{ origen: "es", destino: "en" }} onCambiar={() => {}} instalados={instalados} />);

        const etiqueta = screen.getByTestId("etiqueta-sin-internet-destino");
        expect(etiqueta).toHaveTextContent(/con descarga/i);
    });

    it("muestra la insignia correcta para el destino cuando no está instalado", () => {
        render(<SelectorPar idiomas={idiomas} par={{ origen: "es", destino: "fr" }} onCambiar={() => {}} instalados={instalados} />);

        const etiqueta = screen.getByTestId("etiqueta-sin-internet-destino");
        expect(etiqueta).toHaveTextContent(/solo con internet/i);
    });

    it("deshabilita el botón de intercambio cuando el origen es 'Detectar idioma'", () => {
        render(<SelectorPar idiomas={idiomas} par={{ origen: "detectar", destino: "en" }} onCambiar={() => {}} instalados={instalados} />);

        const botonIntercambiar = screen.getByTestId("intercambiar-btn");
        expect(botonIntercambiar).toBeDisabled();
    });

it("cambia el par cuando se hace clic en el botón de intercambio", () => {
        const onCambiar = (par: { origen: string; destino: string }) => {};
        render(<SelectorPar idiomas={idiomas} par={{ origen: \"es\", destino: \"en\" }} onCambiar={onCambiar} instalados={instalados} />);

        const botonIntercambiar = screen.getByTestId(\"intercambiar-btn\");
        fireEvent.click(botonIntercambiar);

        expect(onCambiar).toHaveBeenCalledWith({ origen: \"en\", destino: \"es\" });
    });
});