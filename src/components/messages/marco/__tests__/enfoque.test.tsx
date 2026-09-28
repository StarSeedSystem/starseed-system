// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-nivel-movimiento", () => ({ useNivelMovimiento: () => "minimo" }));

import { LS_ENFOQUE, useEnfoque } from "../use-enfoque";
import { MarcoDosPaneles } from "../marco-dos-paneles";

function Prueba() {
    const { enfocado, alternar } = useEnfoque();
    return (
        <div>
            <button type="button" onClick={alternar}>
                Alternar
            </button>
            <MarcoDosPaneles
                esMovil={false}
                enfocado={enfocado}
                verDetalle
                lista={<p>La lista</p>}
                detalle={<p>El chat</p>}
                etiquetaLista="Lista de chats"
                etiquetaDetalle="Chat abierto"
            />
        </div>
    );
}

function aside(): HTMLElement {
    return screen.getByLabelText("Lista de chats");
}

describe("modo enfoque", () => {
    beforeEach(() => window.localStorage.clear());
    afterEach(cleanup);

    it("recoge la lista (inert + aria-hidden) y lo recuerda en este navegador", () => {
        render(<Prueba />);
        expect(aside().getAttribute("data-enfocado")).toBe("no");
        fireEvent.click(screen.getByText("Alternar"));
        expect(aside().getAttribute("data-enfocado")).toBe("si");
        expect(aside().getAttribute("aria-hidden")).toBe("true");
        expect(aside().hasAttribute("inert")).toBe(true);
        expect(window.localStorage.getItem(LS_ENFOQUE)).toBe("1");
        // El detalle sigue ahí, a todo el ancho.
        expect(screen.getByLabelText("Chat abierto").textContent).toContain("El chat");
    });

    it("al volver a la página empieza enfocado si así lo dejaste", () => {
        window.localStorage.setItem(LS_ENFOQUE, "1");
        render(<Prueba />);
        expect(aside().getAttribute("data-enfocado")).toBe("si");
    });

    it("Esc sale del enfoque y lo guarda", () => {
        window.localStorage.setItem(LS_ENFOQUE, "1");
        render(<Prueba />);
        act(() => {
            fireEvent.keyDown(window, { key: "Escape" });
        });
        expect(aside().getAttribute("data-enfocado")).toBe("no");
        expect(window.localStorage.getItem(LS_ENFOQUE)).toBe("0");
    });

    it("Esc con un diálogo abierto es del diálogo, no del enfoque", () => {
        window.localStorage.setItem(LS_ENFOQUE, "1");
        render(<Prueba />);
        const dialogo = document.createElement("div");
        dialogo.setAttribute("role", "dialog");
        document.body.appendChild(dialogo);
        act(() => {
            fireEvent.keyDown(window, { key: "Escape" });
        });
        expect(aside().getAttribute("data-enfocado")).toBe("si");
        dialogo.remove();
    });

    it("sin almacenamiento disponible funciona igual (sin recordar)", () => {
        const espia = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("bloqueado");
        });
        render(<Prueba />);
        fireEvent.click(screen.getByText("Alternar"));
        expect(aside().getAttribute("data-enfocado")).toBe("si");
        espia.mockRestore();
    });
});

describe("MarcoDosPaneles en móvil", () => {
    afterEach(cleanup);

    it("apila: con el detalle abierto, la lista queda debajo inerte", () => {
        render(
            <MarcoDosPaneles esMovil enfocado={false} verDetalle lista={<p>La lista</p>} detalle={<p>El chat</p>} etiquetaLista="Lista" etiquetaDetalle="Chat" />,
        );
        expect(screen.getByTestId("marco-movil")).toBeTruthy();
        expect(screen.getByLabelText("Lista").hasAttribute("inert")).toBe(true);
        expect(screen.getByLabelText("Chat").textContent).toContain("El chat");
    });

    it("sin detalle abierto solo se ve la lista", () => {
        render(
            <MarcoDosPaneles esMovil enfocado={false} verDetalle={false} lista={<p>La lista</p>} detalle={<p>El chat</p>} etiquetaLista="Lista" etiquetaDetalle="Chat" />,
        );
        expect(screen.queryByText("El chat")).toBeNull();
        expect(screen.getByLabelText("Lista").hasAttribute("inert")).toBe(false);
    });
});
