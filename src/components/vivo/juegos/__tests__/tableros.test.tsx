/**
 * Tableros de los juegos: se pintan bien, solo dejan jugar cuando toca, resaltan lo que hay que
 * resaltar y hablan (aria-label) en español. Sin red: componentes puros.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { desdeFEN, posicionInicial } from "@/lib/vivo/juegos/ajedrez";
import { tableroAjedrezInicial, type TableroAjedrez as EstadoAjedrez } from "@/lib/vivo/juegos/ajedrez-juego";
import { tableroC4Inicial, type TableroConecta4 } from "@/lib/vivo/juegos/conecta4";
import { tableroTresInicial, type TableroTresEnRaya } from "@/lib/vivo/juegos/tres-en-raya";
import { materialDe } from "../escenario-ajedrez";
import { Pieza, describirPieza, tipoDeValor } from "../piezas-ajedrez";
import { TableroAjedrez } from "../tablero-ajedrez";
import { TableroC4 } from "../tablero-c4";
import { TableroTres } from "../tablero-tres";

afterEach(cleanup);

const tres = (celdas: (0 | 1 | null)[], extra: Partial<TableroTresEnRaya> = {}): TableroTresEnRaya => ({
    ...tableroTresInicial(),
    c: celdas,
    ...extra,
});

describe("tres en raya", () => {
    test("nueve casillas; jugar en una vacía llama con su número", () => {
        const alJugar = vi.fn();
        render(<TableroTres tablero={tableroTresInicial()} activo alJugar={alJugar} />);
        expect(screen.getAllByRole("gridcell")).toHaveLength(9);
        fireEvent.click(screen.getByRole("gridcell", { name: "Casilla en medio en el centro, vacía" }));
        expect(alJugar).toHaveBeenCalledWith(4);
    });

    test("si no es tu turno, o la casilla está ocupada, no se puede pulsar", () => {
        const alJugar = vi.fn();
        const { rerender } = render(<TableroTres tablero={tableroTresInicial()} activo={false} alJugar={alJugar} />);
        for (const c of screen.getAllByRole("gridcell")) expect(c).toBeDisabled();
        rerender(<TableroTres tablero={tres([0, null, null, null, null, null, null, null, null])} activo alJugar={alJugar} />);
        expect(screen.getAllByRole("gridcell")[0]).toBeDisabled();
        expect(screen.getAllByRole("gridcell")[1]).toBeEnabled();
        expect(screen.getAllByRole("gridcell")[0]).toHaveAccessibleName(/marca X/);
    });

    test("la línea ganadora se resalta y el resto se apaga", () => {
        const t = tres([0, 0, 0, 1, 1, null, null, null, null], { linea: [0, 1, 2], jugadas: 5 });
        const { container } = render(<TableroTres tablero={t} activo={false} alJugar={() => {}} />);
        const celdas = container.querySelectorAll("button");
        expect(celdas[0].className).toMatch(/celdaGana/);
        expect(celdas[3].className).toMatch(/celdaApagada/);
    });
});

describe("conecta 4", () => {
    test("siete columnas; soltar una ficha llama con la columna", () => {
        const alJugar = vi.fn();
        render(<TableroC4 tablero={tableroC4Inicial()} activo alJugar={alJugar} />);
        const cols = screen.getAllByRole("button");
        expect(cols).toHaveLength(7);
        fireEvent.click(cols[3]);
        expect(alJugar).toHaveBeenCalledWith(3);
        expect(cols[3]).toHaveAccessibleName("Soltar ficha en la columna 4, quedan 6 huecos");
    });

    test("una columna llena y un tablero inactivo no aceptan fichas", () => {
        const c: TableroConecta4["c"] = Array.from({ length: 42 }, () => null);
        for (let f = 0; f < 6; f++) c[f * 7 + 2] = (f % 2) as 0 | 1;
        const { rerender } = render(<TableroC4 tablero={{ ...tableroC4Inicial(), c }} activo alJugar={() => {}} />);
        const cols = screen.getAllByRole("button");
        expect(cols[2]).toBeDisabled();
        expect(cols[2]).toHaveAccessibleName("Columna 3, llena");
        expect(cols[0]).toBeEnabled();
        rerender(<TableroC4 tablero={{ ...tableroC4Inicial(), c }} activo={false} alJugar={() => {}} />);
        for (const b of screen.getAllByRole("button")) expect(b).toBeDisabled();
    });
});

describe("ajedrez", () => {
    const inicial = tableroAjedrezInicial();
    const de = (fen: string, extra: Partial<EstadoAjedrez> = {}): EstadoAjedrez => ({ ...inicial, pos: desdeFEN(fen), ...extra });
    const casilla = (n: string) => screen.getByRole("button", { name: new RegExp(`^${n},`) });

    test("64 casillas con nombre y pieza en español", () => {
        render(<TableroAjedrez tablero={inicial} activo bandoPropio={null} girado={false} alJugar={() => {}} />);
        expect(screen.getAllByRole("button")).toHaveLength(64);
        expect(casilla("e1")).toHaveAccessibleName("e1, rey blanco");
        expect(casilla("d8")).toHaveAccessibleName("d8, dama negra");
        expect(casilla("a1")).toHaveAccessibleName("a1, torre blanca");
        expect(casilla("e4")).toHaveAccessibleName("e4, vacía");
    });

    test("seleccionar una pieza enseña sus movimientos legales y jugar llama con la notación", () => {
        const alJugar = vi.fn();
        render(<TableroAjedrez tablero={inicial} activo bandoPropio={0} girado={false} alJugar={alJugar} />);
        fireEvent.click(casilla("e2"));
        expect(casilla("e3")).toHaveAccessibleName(/movimiento posible/);
        expect(casilla("e4")).toHaveAccessibleName(/movimiento posible/);
        expect(casilla("e5")).not.toHaveAccessibleName(/movimiento posible/);
        expect(casilla("e2")).toHaveAttribute("aria-pressed", "true");
        fireEvent.click(casilla("e4"));
        expect(alJugar).toHaveBeenCalledWith("e2e4");
    });

    test("no deja seleccionar piezas rivales ni jugar si no toca", () => {
        const alJugar = vi.fn();
        const { rerender } = render(<TableroAjedrez tablero={inicial} activo bandoPropio={0} girado={false} alJugar={alJugar} />);
        fireEvent.click(casilla("e7")); // negra
        expect(casilla("e7")).toHaveAttribute("aria-pressed", "false");
        rerender(<TableroAjedrez tablero={inicial} activo={false} bandoPropio={0} girado={false} alJugar={alJugar} />);
        fireEvent.click(casilla("e2"));
        expect(casilla("e2")).toHaveAttribute("aria-pressed", "false");
        expect(alJugar).not.toHaveBeenCalled();
    });

    test("coronación: pregunta la pieza y juega con la letra", () => {
        const alJugar = vi.fn();
        render(<TableroAjedrez tablero={de("7k/4P3/8/8/8/8/8/K7 w - - 0 1")} activo bandoPropio={0} girado={false} alJugar={alJugar} />);
        fireEvent.click(casilla("e7"));
        fireEvent.click(casilla("e8"));
        const dialogo = screen.getByRole("dialog", { name: /coron/i });
        expect(alJugar).not.toHaveBeenCalled();
        fireEvent.click(within(dialogo).getByRole("button", { name: "Coronar a caballo" }));
        expect(alJugar).toHaveBeenCalledWith("e7e8n");
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    test("el rey en jaque y la última jugada se marcan", () => {
        const t = de("4k3/8/8/8/8/8/4r3/4K3 w - - 0 1", { jaque: true, ultimo: { de: 12, a: 12 } });
        render(<TableroAjedrez tablero={t} activo={false} bandoPropio={0} girado={false} alJugar={() => {}} />);
        expect(casilla("e1")).toHaveAccessibleName(/rey en jaque/);
        expect(casilla("e1").className).toMatch(/casillaJaque/);
    });

    test("girado: las negras quedan abajo", () => {
        render(<TableroAjedrez tablero={inicial} activo bandoPropio={null} girado alJugar={() => {}} />);
        const botones = screen.getAllByRole("button");
        expect(botones[0]).toHaveAccessibleName(/^h1,/); // arriba a la izquierda
        expect(botones[63]).toHaveAccessibleName(/^a8,/);
    });

    test("se navega con el teclado: una sola casilla en el orden de tabulación", () => {
        render(<TableroAjedrez tablero={inicial} activo bandoPropio={0} girado={false} alJugar={() => {}} />);
        const enfocables = screen.getAllByRole("button").filter((b) => b.getAttribute("tabindex") === "0");
        expect(enfocables).toHaveLength(1);
        fireEvent.keyDown(enfocables[0], { key: "ArrowRight" });
        const ahora = screen.getAllByRole("button").filter((b) => b.getAttribute("tabindex") === "0");
        expect(ahora).toHaveLength(1);
        expect(ahora[0]).not.toBe(enfocables[0]);
    });
});

describe("piezas", () => {
    test("cada tipo se pinta como SVG decorativo, sin emojis ni texto", () => {
        for (const tipo of ["p", "n", "b", "r", "q", "k"] as const) {
            for (const bando of [0, 1] as const) {
                const { container, unmount } = render(<Pieza tipo={tipo} bando={bando} />);
                const svg = container.querySelector("svg");
                expect(svg).toHaveAttribute("aria-hidden", "true");
                expect(container.textContent).toBe("");
                expect(svg!.querySelectorAll("path").length).toBeGreaterThan(0);
                unmount();
            }
        }
    });

    test("valor con signo → tipo y bando, y descripciones con género", () => {
        expect(tipoDeValor(1)).toEqual({ tipo: "p", bando: 0 });
        expect(tipoDeValor(-5)).toEqual({ tipo: "q", bando: 1 });
        expect(tipoDeValor(0)).toBeNull();
        expect(tipoDeValor(9)).toBeNull();
        expect(describirPieza("q", 1)).toBe("dama negra");
        expect(describirPieza("n", 0)).toBe("caballo blanco");
    });

    test("material: piezas y valor de cada bando", () => {
        const m = materialDe(posicionInicial().t);
        expect(m.cuenta[0].p).toBe(8);
        expect(m.cuenta[1].q).toBe(1);
        expect(m.valor).toEqual([39, 39]);
    });
});
