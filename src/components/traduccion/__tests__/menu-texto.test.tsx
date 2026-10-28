import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
    MenuTexto,
    limpiarEntradasMenuTexto,
    registrarEntradaMenuTexto,
    type ContextoMenuTexto,
} from "../menu-texto";

/* Pruebas del menú del clic derecho sobre texto (TRD1020E): apertura, engaños y registro. */

function montar(texto: string): void {
    render(
        <>
            <div>{texto}</div>
            <input aria-label="campo de texto" />
            <MenuTexto />
        </>,
    );
}

function abrirSobre(texto: string, opciones: { shiftKey?: boolean } = {}): void {
    fireEvent.contextMenu(screen.getByText(texto), opciones);
}

afterEach(() => { cleanup(); limpiarEntradasMenuTexto(); });

describe("Menú del clic derecho sobre texto", () => {
    it("abre sobre texto y cierra con clic fuera y con Escape", () => {
        montar("Texto visible");
        abrirSobre("Texto visible");
        expect(screen.getByRole("menu", { name: "Acciones del clic derecho" })).toBeTruthy();
        fireEvent.pointerDown(document.body);
        expect(screen.queryByRole("menu")).toBeNull();
        abrirSobre("Texto visible");
        fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
        expect(screen.queryByRole("menu")).toBeNull();
    });

    it("no abre en campos editables ni con Mayúsculas pulsada", () => {
        montar("Texto visible");
        fireEvent.contextMenu(screen.getByLabelText("campo de texto"));
        expect(screen.queryByRole("menu")).toBeNull();
        abrirSobre("Texto visible", { shiftKey: true });
        expect(screen.queryByRole("menu")).toBeNull();
    });

    it("cierra con clic fuera y enseña solo las entradas visibles", () => {
        const captura: ContextoMenuTexto[] = [];
        registrarEntradaMenuTexto({
            id: "traducir",
            etiqueta: "Traducir selección",
            ejecutar: (ctx) => { captura.push(ctx); },
        });
        registrarEntradaMenuTexto({
            id: "oculta",
            etiqueta: "Entrada invisible",
            visible: () => false,
            ejecutar: () => {},
        });
        montar("Texto visible");
        abrirSobre("Texto visible");
        expect(screen.getByRole("menuitem", { name: "Traducir selección" })).toBeTruthy();
        expect(screen.queryByRole("menuitem", { name: "Entrada invisible" })).toBeNull();
        fireEvent.click(screen.getByRole("menuitem", { name: "Traducir selección" }));
        expect(captura).toEqual([{ seleccion: "", bloque: "Texto visible", paginaTraducida: false }]);
        expect(screen.queryByRole("menu")).toBeNull();
    });

    it("detiene el menú del navegador al abrir el propio sobre texto", () => {
        montar("Texto visible");
        // `fireEvent` devuelve `false` si el recorrido canceló el evento (defaultPrevented).
        expect(fireEvent.contextMenu(screen.getByText("Texto visible"))).toBe(false);
        expect(screen.getByRole("menu")).toBeTruthy();
    });

    it("en campos o con Mayúsculas también deja pasar el menú del navegador", () => {
        montar("Texto visible");
        expect(fireEvent.contextMenu(screen.getByLabelText("campo de texto"))).toBe(true);
        expect(fireEvent.contextMenu(screen.getByText("Texto visible"), { shiftKey: true })).toBe(true);
    });

    it("el contexto ve una página traducida y la selección", () => {
        const captura: ContextoMenuTexto[] = [];
        registrarEntradaMenuTexto({
            id: "traducir",
            etiqueta: "Traducir selección",
            ejecutar: (ctx) => { captura.push(ctx); },
        });
        render(
            <>
                <p>Origen<span data-traducido="true" /></p>
                <MenuTexto />
            </>,
        );
        fireEvent.contextMenu(screen.getByText("Origen"));
        fireEvent.click(screen.getByRole("menuitem", { name: "Traducir selección" }));
        expect(captura).toEqual([{ seleccion: "", bloque: "Origen", paginaTraducida: true }]);
    });

    it("navega con flechas entre las entradas registradas", () => {
        registrarEntradaMenuTexto({
            id: "primera",
            etiqueta: "Traducir selección",
            ejecutar: () => {},
        });
        registrarEntradaMenuTexto({
            id: "segunda",
            etiqueta: "Traducir este párrafo",
            ejecutar: () => {},
        });
        montar("Texto visible");
        abrirSobre("Texto visible");
        fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
        expect(document.activeElement?.textContent).toBe("Traducir este párrafo");
        fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowUp" });
        expect(document.activeElement?.textContent).toBe("Traducir selección");
    });
});
