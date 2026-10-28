import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import type { ReactNode } from "react";
import {
    MenuTexto,
    registrarEntradaMenuTexto,
    abrirMenuTexto,
    objetivoEditable,
    paginaTraducida,
    posicionMenu,
    type CtxMenuTexto,
} from "../menu-texto";

const bajas: Array<() => void> = [];

/** Anota una entrada de prueba y devuelve el registro de los ctx que la ejecutarón. */
function entradaDePrueba(id: string, visible?: (ctx: CtxMenuTexto) => boolean): CtxMenuTexto[] {
    const recibidos: CtxMenuTexto[] = [];
    bajas.push(
        registrarEntradaMenuTexto({
            id,
            etiqueta: `Entrada ${id}`,
            visible,
            ejecutar: (ctx) => recibidos.push(ctx),
        }),
    );
    return recibidos;
}

const clicDerecho = (diana: Element, opciones: MouseEventInit = {}): void => {
    act(() => {
        diana.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 24, clientY: 30, ...opciones }));
    });
};

const dibujar = (interior: ReactNode): void => {
    render(
        <>
            <MenuTexto />
            <div data-prueba>{interior}</div>
        </>,
    );
};

const itemsDelMenu = () => screen.getAllByRole("menuitem") as HTMLButtonElement[];

describe("ayudas puras del menú de texto", () => {
    it("abrirMenuTexto: solo con el evento limpio, sin Mayúsculas, no editable y con texto", () => {
        expect(abrirMenuTexto({ atendido: false, mayusculas: false, editable: false, conTexto: true })).toBe(true);
        expect(abrirMenuTexto({ atendido: true, mayusculas: false, editable: false, conTexto: true })).toBe(false);
        expect(abrirMenuTexto({ atendido: false, mayusculas: true, editable: false, conTexto: true })).toBe(false);
        expect(abrirMenuTexto({ atendido: false, mayusculas: false, editable: true, conTexto: true })).toBe(false);
        expect(abrirMenuTexto({ atendido: false, mayusculas: false, editable: false, conTexto: false })).toBe(false);
    });

    it("objetivoEditable: campos y editores sí, texto normal no", () => {
        expect(objetivoEditable(document.createElement("input"))).toBe(true);
        const editor = document.createElement("div");
        editor.setAttribute("contenteditable", "true");
        expect(objetivoEditable(editor)).toBe(true);
        expect(objetivoEditable(document.createElement("p"))).toBe(false);
        expect(objetivoEditable(null)).toBe(false);
    });

    it("paginaTraducida: coge la marca que deja aplicar (TRD1020C)", () => {
        const limpio = document.createElement("div");
        limpio.append(document.createElement("p"));
        expect(paginaTraducida(limpio)).toBe(false);
        limpio.firstElementChild?.setAttribute("data-traducido", "true");
        expect(paginaTraducida(limpio)).toBe(true);
    });

    it("posicionMenu: entra en la ventana y respeta el margen", () => {
        expect(posicionMenu(100, 100, 96, { innerWidth: 1_024, innerHeight: 768 })).toEqual({ left: 100, top: 100 });
        expect(posicionMenu(5_000, 5_000, 96, { innerWidth: 1_024, innerHeight: 768 })).toEqual({ left: 792, top: 664 });
        expect(posicionMenu(2, 2, 96, { innerWidth: 1_024, innerHeight: 768 })).toEqual({ left: 8, top: 8 });
    });
});

describe("MenuTexto", () => {
    beforeEach(() => { window.getSelection()?.removeAllRanges(); });
    afterEach(() => {
        bajas.splice(0).forEach((baja) => baja());
        cleanup();
    });

    it("abre sobre texto, muestra las entradas registradas y las ejecuta con el contexto", () => {
        const recibidos = entradaDePrueba("probar");
        dibujar(<p data-texto>Hola mundo</p>);
        const texto = document.querySelector("[data-texto]") as Element;
        clicDerecho(texto);
        const menu = screen.getByRole("menu", { name: "Acciones del texto" });
        expect(menu).toBeTruthy();
        fireEvent.click(itemsDelMenu()[0]);
        expect(screen.queryByRole("menu")).toBeNull();
        expect(recibidos).toHaveLength(1);
        expect(recibidos[0].bloque).toContain("Hola mundo");
        expect(recibidos[0].x).toBe(24);
        expect(recibidos[0].objetivo).toBe(texto);
    });

    it("lleva la selección y la marca de página traducida (TRD1020C)", () => {
        const recibidos = entradaDePrueba("seleccion");
        dibujar(
            <div data-traducido="true">
                <p data-texto>Hola mundo</p>
            </div>,
        );
        const texto = document.querySelector("[data-texto]") as Element;
        const sel = window.getSelection() as Selection;
        const rango = document.createRange();
        rango.selectNodeContents(texto);
        sel.removeAllRanges();
        sel.addRange(rango);
        clicDerecho(texto);
        fireEvent.click(itemsDelMenu()[0]);
        expect(recibidos[0].seleccion).toContain("Hola mundo");
        expect(recibidos[0].paginaTraducida).toBe(true);
        sel.removeAllRanges();
    });

    it("no abre en campos editables, con Mayúsculas, con evento atendido ni sin entradas", () => {
        dibujar(
            <>
                <input aria-label="campo" data-editable />
                <p data-texto>Hola mundo</p>
            </>,
        );
        // Sin entradas no hay menú (el registro está vacío).
        clicDerecho(document.querySelector("[data-texto]") as Element);
        expect(screen.queryByRole("menu")).toBeNull();
        // Campo editable: el del navegador manda.
        entradaDePrueba("editable");
        clicDerecho(document.querySelector("[data-editable]") as Element);
        expect(screen.queryByRole("menu")).toBeNull();
        // Mayúsculas pulsadas y evento ya atendido: tampoco.
        clicDerecho(document.querySelector("[data-texto]") as Element, { shiftKey: true });
        expect(screen.queryByRole("menu")).toBeNull();
        const atender = (ev: Event) => ev.preventDefault();
        document.addEventListener("contextmenu", atender, true);
        clicDerecho(document.querySelector("[data-texto]") as Element);
        document.removeEventListener("contextmenu", atender, true);
        expect(screen.queryByRole("menu")).toBeNull();
    });

    it("respeta visible(ctx): la entrada que no toca no entra en esta apertura", () => {
        entradaDePrueba("oculta", (ctx) => ctx.seleccion.length > 0);
        entradaDePrueba("visible");
        dibujar(<p data-texto>Texto sin selección</p>);
        clicDerecho(document.querySelector("[data-texto]") as Element);
        expect(itemsDelMenu().map((b) => b.textContent)).toEqual(["Entrada visible"]);
    });

    it("teclado: foco inicial, flechas entre items, Escape y clic fuera cierran", () => {
        entradaDePrueba("primera");
        entradaDePrueba("segunda");
        dibujar(<p data-texto>Hola mundo</p>);
        const texto = document.querySelector("[data-texto]") as Element;
        clicDerecho(texto);
        const items = itemsDelMenu();
        expect(document.activeElement).toBe(items[0]);
        fireEvent.keyDown(items[0], { key: "ArrowDown" });
        expect(document.activeElement).toBe(screen.getAllByRole("menuitem")[1]);
        fireEvent.keyDown(screen.getAllByRole("menuitem")[1], { key: "ArrowUp" });
        expect(document.activeElement).toBe(items[0]);
        // Escape cierra y clic fuera también.
        fireEvent.keyDown(window, { key: "Escape" });
        expect(screen.queryByRole("menu")).toBeNull();
        clicDerecho(texto);
        expect(screen.getByRole("menu")).toBeTruthy();
        fireEvent.pointerDown(texto);
        expect(screen.queryByRole("menu")).toBeNull();
    });
});