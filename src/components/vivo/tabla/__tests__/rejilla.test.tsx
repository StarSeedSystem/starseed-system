/**
 * La rejilla de escritorio: teclado (flechas, Enter, Tab, Esc, Espacio, Supr), edición, copiar y
 * pegar en TSV, solo lectura y presencia. Las acciones son espías: aquí se prueba QUÉ pide la
 * rejilla, no cómo se guarda (eso lo cubren las pruebas de `lib/vivo`).
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { crearCalculadora } from "@/lib/vivo/tabla/formulas";
import { columnasVisibles, tablaVacia, type Ctx, type Tabla } from "@/lib/vivo/tabla/modelo";
import { anadirColumna, anadirFilasAlFinal, aplicarCeldas, establecerTotal } from "@/lib/vivo/tabla/operaciones";
import { VISTA_VACIA } from "@/lib/vivo/tabla/vista";
import { Rejilla } from "../rejilla";
import type { AccionesTabla } from "../tipos";

vi.mock("@/lib/social/os-profiles", () => ({
    fetchMyProfile: async () => null,
    fetchProfilesByIds: async () => ({}),
    searchUsers: async () => [],
}));

let n = 0;
const C = (): Ctx => ({ t: 1000 + n++, a: "ana000000000" });

function fixture() {
    let t = tablaVacia();
    const nom = anadirColumna(t, C(), { nombre: "Nombre", tipo: "texto" });
    t = nom.tabla;
    const imp = anadirColumna(t, C(), { nombre: "Importe", tipo: "numero" });
    t = imp.tabla;
    const ok = anadirColumna(t, C(), { nombre: "Pagado", tipo: "casilla" });
    t = ok.tabla;
    t = establecerTotal(t, imp.colId!, "suma", C());
    const f = anadirFilasAlFinal(t, 3, C());
    t = aplicarCeldas(
        f.tabla,
        [
            { filaId: f.filaIds[0], colId: nom.colId!, valor: "Alquiler" },
            { filaId: f.filaIds[0], colId: imp.colId!, valor: 800 },
            { filaId: f.filaIds[1], colId: nom.colId!, valor: "Luz" },
            { filaId: f.filaIds[1], colId: imp.colId!, valor: 60.5 },
            { filaId: f.filaIds[2], colId: nom.colId!, valor: "Agua" },
            { filaId: f.filaIds[2], colId: imp.colId!, valor: 25 },
        ],
        C(),
    );
    return { t, nom: nom.colId!, imp: imp.colId!, ok: ok.colId!, filas: f.filaIds };
}

function acciones(): { [K in keyof AccionesTabla]: ReturnType<typeof vi.fn> } {
    return {
        escribir: vi.fn(),
        escribirTexto: vi.fn(),
        pegar: vi.fn(() => 0),
        limpiar: vi.fn(),
        alternarCasilla: vi.fn(),
        crearOpcion: vi.fn(() => null),
        anadirFila: vi.fn(),
        duplicarFila: vi.fn(),
        borrarFilas: vi.fn(),
        moverFila: vi.fn(),
        moverColumna: vi.fn(),
        redimensionar: vi.fn(),
        abrirColumna: vi.fn(),
        ordenar: vi.fn(),
        filtrarPor: vi.fn(),
        borrarColumna: vi.fn(),
        establecerTotal: vi.fn(),
        deshacer: vi.fn(),
        rehacer: vi.fn(),
    };
}

function montar(opc: { editar?: boolean; presentes?: React.ComponentProps<typeof Rejilla>["presentes"] } = {}) {
    const f = fixture();
    const a = acciones();
    const tabla: Tabla = f.t;
    const cols = columnasVisibles(tabla);
    const r = render(
        <Rejilla
            tabla={tabla}
            calc={crearCalculadora(tabla)}
            columnas={cols}
            filaIds={f.filas}
            puedeEditar={opc.editar ?? true}
            ordenEditable
            vista={VISTA_VACIA}
            presentes={opc.presentes ?? []}
            perfil={() => undefined}
            candidatosPersonas={[]}
            acciones={a as unknown as AccionesTabla}
            onPosicion={() => {}}
            mensajeVacio="Sin filas"
        />,
    );
    const grid = screen.getByRole("grid", { name: "Tabla de datos" });
    return { f, a, grid, ...r };
}

/** La celda (fila, columna) por posición: las filas de datos empiezan en `aria-rowindex` 2. */
function celda(grid: HTMLElement, fila: number, col: number): HTMLElement {
    const filaEl = grid.querySelector(`[role="row"][aria-rowindex="${fila + 2}"]`) as HTMLElement;
    return within(filaEl).getAllByRole("gridcell")[col];
}

beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 600 });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 900 });
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.releasePointerCapture ??= () => {};
    Element.prototype.setPointerCapture ??= () => {};
    Element.prototype.scrollIntoView ??= () => {};
});
afterEach(cleanup);

describe("pintado", () => {
    test("cabeceras, celdas y totales", () => {
        const { grid } = montar();
        expect(within(grid).getByText("Nombre")).toBeTruthy();
        expect(within(grid).getByText("Importe")).toBeTruthy();
        expect(within(grid).getByText("Pagado")).toBeTruthy();
        expect(within(grid).getByText("Alquiler")).toBeTruthy();
        expect(within(grid).getByText("Luz")).toBeTruthy();
        expect(grid.getAttribute("aria-rowcount")).toBe("4");
        expect(grid.getAttribute("aria-colcount")).toBe("3");
        // pie: el total de la columna con «Suma» (800 + 60,5 + 25 = 885,5)
        expect(within(grid).getByLabelText("Total de la columna Importe")).toBeTruthy();
        expect(grid.textContent).toMatch(/885[.,]5/);
    });

    test("una tabla sin filas enseña el mensaje, no una rejilla rota", () => {
        const f = fixture();
        const t = tablaVacia();
        render(
            <Rejilla
                tabla={t}
                calc={crearCalculadora(t)}
                columnas={columnasVisibles(f.t)}
                filaIds={[]}
                puedeEditar
                ordenEditable
                vista={VISTA_VACIA}
                presentes={[]}
                perfil={() => undefined}
                candidatosPersonas={[]}
                acciones={acciones() as unknown as AccionesTabla}
                onPosicion={() => {}}
                mensajeVacio="Esta tabla aún no tiene filas."
            />,
        );
        expect(screen.getByRole("status").textContent).toContain("aún no tiene filas");
    });
});

describe("teclado", () => {
    test("la primera tecla coloca el foco en A1 y las flechas lo mueven", () => {
        const { grid } = montar();
        grid.focus();
        fireEvent.keyDown(grid, { key: "ArrowDown" });
        expect(celda(grid, 0, 0).getAttribute("data-foco")).toBe("true");
        fireEvent.keyDown(grid, { key: "ArrowDown" });
        expect(celda(grid, 1, 0).getAttribute("data-foco")).toBe("true");
        fireEvent.keyDown(grid, { key: "ArrowRight" });
        expect(celda(grid, 1, 1).getAttribute("data-foco")).toBe("true");
        fireEvent.keyDown(grid, { key: "ArrowUp" });
        expect(celda(grid, 0, 1).getAttribute("data-foco")).toBe("true");
        // en el borde no se sale de la tabla
        fireEvent.keyDown(grid, { key: "ArrowUp" });
        expect(celda(grid, 0, 1).getAttribute("data-foco")).toBe("true");
    });

    test("Ctrl + flecha salta al borde y Shift + flecha extiende la selección", () => {
        const { grid } = montar();
        grid.focus();
        fireEvent.keyDown(grid, { key: "ArrowDown" });
        fireEvent.keyDown(grid, { key: "ArrowDown", ctrlKey: true });
        expect(celda(grid, 2, 0).getAttribute("data-foco")).toBe("true");
        fireEvent.keyDown(grid, { key: "ArrowRight", shiftKey: true });
        expect(celda(grid, 2, 0).getAttribute("aria-selected")).toBe("true");
        expect(celda(grid, 2, 1).getAttribute("aria-selected")).toBe("true");
    });

    test("Tab recorre las celdas pero no atrapa el teclado en el borde", () => {
        const { grid } = montar();
        grid.focus();
        fireEvent.keyDown(grid, { key: "ArrowDown" });
        const dentro = fireEvent.keyDown(grid, { key: "Tab" });
        expect(dentro).toBe(false); // preventDefault: se quedó dentro
        expect(celda(grid, 0, 1).getAttribute("data-foco")).toBe("true");
        fireEvent.keyDown(grid, { key: "ArrowDown", ctrlKey: true });
        fireEvent.keyDown(grid, { key: "ArrowRight", ctrlKey: true });
        const fuera = fireEvent.keyDown(grid, { key: "Tab" });
        expect(fuera).toBe(true); // sin preventDefault: el foco sale de la tabla
    });

    test("Enter abre el editor, escribir y Enter guarda y baja", () => {
        const { grid, a, f } = montar();
        grid.focus();
        fireEvent.keyDown(grid, { key: "ArrowDown" });
        fireEvent.keyDown(grid, { key: "Enter" });
        const input = within(grid).getByRole("textbox") as HTMLInputElement;
        expect(input.value).toBe("Alquiler");
        fireEvent.change(input, { target: { value: "Alquiler piso" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(a.escribirTexto).toHaveBeenCalledWith(f.filas[0], f.nom, "Alquiler piso");
        expect(celda(grid, 1, 0).getAttribute("data-foco")).toBe("true");
    });

    test("escribir una letra sobre una celda empieza a editarla con esa letra", () => {
        const { grid, a, f } = montar();
        grid.focus();
        fireEvent.keyDown(grid, { key: "ArrowDown" });
        fireEvent.keyDown(grid, { key: "x" });
        const input = within(grid).getByRole("textbox") as HTMLInputElement;
        expect(input.value).toBe("x");
        fireEvent.keyDown(input, { key: "Enter" });
        expect(a.escribirTexto).toHaveBeenCalledWith(f.filas[0], f.nom, "x");
    });

    test("Esc cancela la edición sin guardar nada", () => {
        const { grid, a } = montar();
        grid.focus();
        fireEvent.keyDown(grid, { key: "ArrowDown" });
        fireEvent.keyDown(grid, { key: "Enter" });
        const input = within(grid).getByRole("textbox") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "otra cosa" } });
        fireEvent.keyDown(input, { key: "Escape" });
        expect(a.escribirTexto).not.toHaveBeenCalled();
        expect(within(grid).queryByRole("textbox")).toBeNull();
    });

    test("Espacio marca una casilla y Supr borra el rango", () => {
        const { grid, a, f } = montar();
        grid.focus();
        fireEvent.keyDown(grid, { key: "ArrowDown" });
        fireEvent.keyDown(grid, { key: "ArrowRight", ctrlKey: true }); // columna «Pagado»
        fireEvent.keyDown(grid, { key: " " });
        expect(a.alternarCasilla).toHaveBeenCalledWith(f.filas[0], f.ok);
        fireEvent.keyDown(grid, { key: "Delete" });
        expect(a.limpiar).toHaveBeenCalledWith([f.filas[0]], [f.ok]);
    });

    test("Ctrl+Z deshace y Ctrl+Y rehace", () => {
        const { grid, a } = montar();
        grid.focus();
        fireEvent.keyDown(grid, { key: "ArrowDown" });
        fireEvent.keyDown(grid, { key: "z", ctrlKey: true });
        fireEvent.keyDown(grid, { key: "y", ctrlKey: true });
        expect(a.deshacer).toHaveBeenCalledTimes(1);
        expect(a.rehacer).toHaveBeenCalledTimes(1);
    });
});

describe("portapapeles (TSV)", () => {
    test("copiar un rango deja las celdas separadas por tabuladores", () => {
        const { grid } = montar();
        grid.focus();
        fireEvent.keyDown(grid, { key: "ArrowDown" });
        fireEvent.keyDown(grid, { key: "ArrowDown", shiftKey: true });
        fireEvent.keyDown(grid, { key: "ArrowRight", shiftKey: true });
        const setData = vi.fn();
        fireEvent.copy(grid, { clipboardData: { setData, getData: () => "" } });
        expect(setData).toHaveBeenCalledWith("text/plain", "Alquiler\t800\nLuz\t60,5");
    });

    test("pegar una matriz pide pegarla desde la celda activa", () => {
        const { grid, a, f } = montar();
        grid.focus();
        fireEvent.keyDown(grid, { key: "ArrowDown" });
        fireEvent.keyDown(grid, { key: "ArrowDown" });
        fireEvent.paste(grid, { clipboardData: { getData: () => "Gas\t40\nInternet\t30", setData: vi.fn() } });
        expect(a.pegar).toHaveBeenCalledTimes(1);
        const [matriz, destino] = a.pegar.mock.calls[0] as [string[][], { desdeFila: number; desdeCol: number; filaIds: string[] }];
        expect(matriz).toEqual([["Gas", "40"], ["Internet", "30"]]);
        expect(destino.desdeFila).toBe(1);
        expect(destino.desdeCol).toBe(0);
        expect(destino.filaIds).toEqual(f.filas);
    });

    test("cortar copia y luego borra el rango", () => {
        const { grid, a, f } = montar();
        grid.focus();
        fireEvent.keyDown(grid, { key: "ArrowDown" });
        const setData = vi.fn();
        fireEvent.cut(grid, { clipboardData: { setData, getData: () => "" } });
        expect(setData).toHaveBeenCalledWith("text/plain", "Alquiler");
        expect(a.limpiar).toHaveBeenCalledWith([f.filas[0]], [f.nom]);
    });
});

describe("solo lectura y presencia", () => {
    test("sin permiso de edición no se abre el editor ni se pega ni se borra", () => {
        const { grid, a } = montar({ editar: false });
        grid.focus();
        fireEvent.keyDown(grid, { key: "ArrowDown" });
        fireEvent.keyDown(grid, { key: "Enter" });
        expect(within(grid).queryByRole("textbox")).toBeNull();
        fireEvent.keyDown(grid, { key: "Delete" });
        fireEvent.paste(grid, { clipboardData: { getData: () => "x", setData: vi.fn() } });
        fireEvent.keyDown(grid, { key: "x" });
        expect(a.limpiar).not.toHaveBeenCalled();
        expect(a.pegar).not.toHaveBeenCalled();
        expect(a.escribirTexto).not.toHaveBeenCalled();
        // mirar y copiar sí se puede
        const setData = vi.fn();
        fireEvent.copy(grid, { clipboardData: { setData, getData: () => "" } });
        expect(setData).toHaveBeenCalled();
    });

    test("otra persona en una celda: contorno de su color con su nombre", () => {
        const f = fixture();
        const a = acciones();
        const tabla = f.t;
        render(
            <Rejilla
                tabla={tabla}
                calc={crearCalculadora(tabla)}
                columnas={columnasVisibles(tabla)}
                filaIds={f.filas}
                puedeEditar
                ordenEditable
                vista={VISTA_VACIA}
                presentes={[{ clave: "k1", uid: "u-2", nombre: "Marta", color: "#10B981", fila: f.filas[1], col: f.imp, editando: true }]}
                perfil={() => undefined}
                candidatosPersonas={[]}
                acciones={a as unknown as AccionesTabla}
                onPosicion={() => {}}
                mensajeVacio="-"
            />,
        );
        const grid = screen.getByRole("grid", { name: "Tabla de datos" });
        expect(celda(grid, 1, 1).getAttribute("data-presente")).toBe("true");
        expect(celda(grid, 1, 1).textContent).toContain("Marta");
        expect(celda(grid, 0, 1).getAttribute("data-presente")).toBe("false");
    });
});
