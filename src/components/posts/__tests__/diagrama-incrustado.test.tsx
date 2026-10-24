/**
 * Los diagramas incrustados en publicaciones usan `VistaDiagrama`: mismo iframe
 * aislado de siempre, ahora con zoom, piel clara/oscura y exportar SVG/PNG.
 * El resto de código ejecutable conserva el sandbox mínimo de su iframe.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EmbeddedContentWindow, esDiagramaIncrustado } from "../embedded-content-window";

const DIAGRAMA =
    "<!DOCTYPE html><html><head><style>:root{--color-paper:#f5f5f5;--color-ink:#2d3142}</style></head>" +
    '<body><svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="#f5f5f5" /></svg></body></html>';

const LAYOUT = "<!doctype html><html><body><h1>Hola</h1></body></html>";

const item = (content: string, title: string) => ({ kind: "programa", content, name: title, title });

afterEach(cleanup);

describe("esDiagramaIncrustado", () => {
    it("reconoce un documento con <svg> y descarta el código que no lo lleva", () => {
        expect(esDiagramaIncrustado(DIAGRAMA)).toBe(true);
        expect(esDiagramaIncrustado("<SVG></SVG>")).toBe(true);
        expect(esDiagramaIncrustado(LAYOUT)).toBe(false);
    });
});

describe("diagrama incrustado en una publicación", () => {
    it("se pinta con VistaDiagrama: zoom, piel y exportar", () => {
        render(<EmbeddedContentWindow item={item(DIAGRAMA, "Arquitectura")} defaultOpen />);

        expect(screen.getByRole("toolbar", { name: "Controles de Arquitectura" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Alejar" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Acercar" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Piel oscura" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Exportar SVG" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Exportar PNG" })).toBeInTheDocument();
        expect(screen.getByTitle("Arquitectura")).toHaveAttribute("sandbox", "");

        fireEvent.click(screen.getByRole("button", { name: "Acercar" }));
        expect(screen.getByText("125 %")).toBeInTheDocument();
    });

    it("si no valida enseña el motivo y no el visor", () => {
        render(<EmbeddedContentWindow item={item("<svg></svg>", "Roto")} defaultOpen />);

        expect(screen.getByRole("alert")).toHaveTextContent("Diagrama rechazado");
        expect(screen.getByRole("alert")).toHaveTextContent("espera exactamente un documento HTML");
        expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
    });

    it("lo demás sigue igual: el código sin svg va en su iframe sandbox", () => {
        render(<EmbeddedContentWindow item={item(LAYOUT, "Diseño")} defaultOpen />);

        const marco = screen.getByTitle("Diseño");
        expect(marco.tagName).toBe("IFRAME");
        expect(marco).toHaveAttribute("sandbox", "allow-scripts");
        expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Exportar SVG" })).not.toBeInTheDocument();
    });
});
