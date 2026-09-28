/**
 * Lienzo del Dibujo-adivina: pinta los trazos en el canvas, traduce el puntero a coordenadas
 * lógicas 0..1000 × 0..750, solo deja dibujar a quien puede, y el pintado suaviza los trazos.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { añadirPunto, lienzoVacio, nuevoTrazoLocal, type Lienzo } from "@/lib/vivo/juegos/dibujo-trazos";
import { altoParaAncho, pintarLienzo } from "../dibujo-pintar";
import { LienzoDibujo } from "../lienzo-dibujo";

function contextoFalso() {
    const llamadas: string[] = [];
    const ctx = new Proxy(
        {},
        {
            get: (_t, prop: string) => {
                if (prop === "canvas") return undefined;
                return (...args: unknown[]) => {
                    llamadas.push(`${prop}(${args.map((a) => (typeof a === "number" ? Math.round(a) : String(a))).join(",")})`);
                };
            },
            set: (_t, prop: string, valor: unknown) => {
                llamadas.push(`${prop}=${String(valor)}`);
                return true;
            },
        },
    ) as unknown as CanvasRenderingContext2D;
    return { ctx, llamadas };
}

let ctxGlobal: ReturnType<typeof contextoFalso>;
beforeEach(() => {
    ctxGlobal = contextoFalso();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctxGlobal.ctx as never);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

function trazoDe(puntos: [number, number][], c = 1, g = 1): Lienzo {
    const n = nuevoTrazoLocal(lienzoVacio("r:0"), c, g, puntos[0][0], puntos[0][1])!;
    let l = n.lienzo;
    for (const [x, y] of puntos.slice(1)) l = añadirPunto(l, n.trazo.i, x, y, 0);
    return l;
}

describe("pintar", () => {
    test("rellena el fondo y traza cada trazo con su color y grosor, suavizado", () => {
        const { ctx, llamadas } = contextoFalso();
        pintarLienzo(ctx, trazoDe([[0, 0], [100, 100], [200, 50], [300, 300]], 1, 2), 1000, 750);
        expect(llamadas).toContain("fillStyle=#0E1026");
        expect(llamadas).toContain("strokeStyle=#7C5CFF");
        expect(llamadas).toContain("lineWidth=18");
        expect(llamadas.filter((c) => c.startsWith("quadraticCurveTo")).length).toBeGreaterThan(0);
        expect(llamadas.some((c) => c.startsWith("stroke("))).toBe(true);
    });

    test("un solo punto es un círculo y la escala sigue al ancho del canvas", () => {
        const { ctx, llamadas } = contextoFalso();
        pintarLienzo(ctx, trazoDe([[500, 375]], 0, 3), 500, 375);
        expect(llamadas.some((c) => c.startsWith("arc(250,188,"))).toBe(true);
        expect(llamadas).toContain("lineWidth=17"); // 34 * 0,5
        expect(altoParaAncho(800)).toBe(600);
    });

    test("un lienzo vacío solo pinta el fondo", () => {
        const { ctx, llamadas } = contextoFalso();
        pintarLienzo(ctx, lienzoVacio("r:0"), 1000, 750);
        expect(llamadas.some((c) => c.startsWith("stroke("))).toBe(false);
        expect(llamadas.some((c) => c.startsWith("fillRect("))).toBe(true);
    });
});

describe("el componente", () => {
    test("ajusta la resolución del canvas al ancho y pinta", () => {
        render(<LienzoDibujo lienzo={trazoDe([[10, 10], [200, 200]])} editable={false} etiqueta="Dibujo de Ana" />);
        const canvas = screen.getByRole("img", { name: "Dibujo de Ana" }) as HTMLCanvasElement;
        expect(canvas.width).toBeGreaterThanOrEqual(800);
        expect(canvas.height).toBe(altoParaAncho(canvas.width));
        expect(ctxGlobal.llamadas.some((c) => c.startsWith("fillRect("))).toBe(true);
    });

    test("quien puede dibujar recibe empezar, mover y terminar con coordenadas lógicas", () => {
        const alEmpezar = vi.fn();
        const alMover = vi.fn();
        const alTerminar = vi.fn();
        render(<LienzoDibujo lienzo={lienzoVacio("r:0")} editable alEmpezar={alEmpezar} alMover={alMover} alTerminar={alTerminar} etiqueta="Lienzo" />);
        const canvas = screen.getByRole("img", { name: "Lienzo" });
        vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 100, top: 50, width: 500, height: 375, right: 600, bottom: 425, x: 100, y: 50, toJSON: () => ({}) });
        const puntero = (tipo: string, x: number, y: number) => fireEvent(canvas, new MouseEvent(tipo, { bubbles: true, clientX: x, clientY: y }));
        puntero("pointerdown", 350, 237.5); // centro del lienzo
        expect(alEmpezar).toHaveBeenCalledWith(500, 375);
        puntero("pointermove", 100, 50);
        expect(alMover).toHaveBeenLastCalledWith(0, 0);
        puntero("pointerup", 100, 50);
        expect(alTerminar).toHaveBeenCalledTimes(1);
        // ya no dibuja al mover sin pulsar
        alMover.mockClear();
        puntero("pointermove", 200, 200);
        expect(alMover).not.toHaveBeenCalled();
    });

    test("quien mira no dibuja aunque toque el lienzo", () => {
        const alEmpezar = vi.fn();
        render(<LienzoDibujo lienzo={lienzoVacio("r:0")} editable={false} alEmpezar={alEmpezar} etiqueta="Lienzo" />);
        const canvas = screen.getByRole("img", { name: "Lienzo" });
        fireEvent(canvas, new MouseEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10 }));
        expect(alEmpezar).not.toHaveBeenCalled();
    });
});
