import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { PerimeterProvider, usePerimeter, type PerimeterEdge } from "@/context/perimeter-context";
import { SideCurtains } from "../side-curtains";
import { PerimeterInterface } from "../perimeter-interface";
import { DockDeslizable } from "../dock-deslizable";
import { AnimatePresence } from "framer-motion";
import {
    iniciarSesionBorde,
    moverSesionBorde,
    reiniciarSesionesBorde,
    sesionBordeActiva,
    soltarSesionBorde,
} from "@/lib/gestos";

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({
        config: { themeStore: { activeMode: "primary" }, styling: { crystalPreset: "none" }, trinity: { edgeSensitivity: 20 }, controlCenter: {} },
        updateSection: vi.fn(),
    }),
}));
vi.mock("@/context/board-context", () => ({
    useBoardSystem: () => ({ boards: [], activeBoardId: null, createBoard: vi.fn(), setActiveBoard: vi.fn(), deleteBoard: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

let reloj = 1000;
let borde: { actual: PerimeterEdge; set: (e: PerimeterEdge) => void } = { actual: null, set: () => {} };

function Espia() {
    const p = usePerimeter();
    useEffect(() => {
        borde.actual = p.activeEdge;
    });
    borde.set = p.setActiveEdge;
    return null;
}

function entorno(reducido: boolean) {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockImplementation((q: string) => ({
            matches: q.includes("reduced-motion") ? reducido : q.includes("fine") || q.includes("hover"),
            media: q,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    });
}

beforeEach(() => {
    cleanup();
    reiniciarSesionesBorde();
    reloj = 1000;
    borde = { actual: null, set: () => {} };
    vi.spyOn(performance, "now").mockImplementation(() => reloj);
    global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
        configurable: true,
        get() { return (this as HTMLElement).hasAttribute("data-trinity-curtain") ? 360 : 0; },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get() { return (this as HTMLElement).hasAttribute("data-omnidock") ? 120 : 0; },
    });
    for (const m of ["setPointerCapture", "releasePointerCapture"]) {
        Object.defineProperty(HTMLElement.prototype, m, { configurable: true, writable: true, value: vi.fn() });
    }
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, writable: true, value: () => true });
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth;
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight;
});

describe("abrir una cortina tirando desde el borde (sesión de borde)", () => {
    it("la cortina aparece bajo el dedo, lo sigue y se queda abierta al soltar con impulso", async () => {
        entorno(true);
        render(<PerimeterProvider><SideCurtains /><Espia /></PerimeterProvider>);
        act(() => {
            iniciarSesionBorde("horizon", { x: 20, y: 400, t: reloj }, 56);
            borde.set("horizon");
        });
        const panel = screen.getByTestId("horizon-curtain-container");
        // Recién montada: casi entera fuera de la pantalla (no salta a abierta).
        await waitFor(() => expect(panel.style.transform).toContain("translate3d(calc(-"));
        act(() => {
            for (let i = 1; i <= 6; i++) {
                reloj += 16;
                moverSesionBorde({ x: 20 + i * 30, y: 402, t: reloj });
            }
        });
        const aMitad = panel.style.transform;
        expect(aMitad).toContain("translate3d(calc(-");
        act(() => {
            reloj += 16;
            soltarSesionBorde({ x: 215, y: 402, t: reloj });
        });
        await waitFor(() => expect(panel.style.transform).toBe("none"));
        expect(borde.actual).toBe("horizon");
        expect(sesionBordeActiva("horizon", reloj)).toBeNull(); // la cortina la liberó
    });

    it("si el dedo vuelve al borde antes de soltar, la cortina se cierra sola", async () => {
        entorno(true);
        render(<PerimeterProvider><SideCurtains /><Espia /></PerimeterProvider>);
        act(() => {
            iniciarSesionBorde("logic", { x: 360, y: 300, t: reloj }, 56);
            borde.set("logic");
        });
        act(() => {
            reloj += 16; moverSesionBorde({ x: 260, y: 300, t: reloj });
            reloj += 300; moverSesionBorde({ x: 350, y: 300, t: reloj });
            reloj += 200; soltarSesionBorde({ x: 350, y: 300, t: reloj });
        });
        await waitFor(() => expect(borde.actual).toBeNull());
    });
});

describe("sensores de borde (ratón y lápiz)", () => {
    it("un clic quieto alterna la cortina; tirar hacia dentro la abre siguiendo al puntero", async () => {
        entorno(true);
        Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true });
        render(<PerimeterProvider><PerimeterInterface /><Espia /></PerimeterProvider>);
        const sensor = document.querySelector('[data-trinity-sensor="logic"]') as HTMLElement;
        expect(sensor).not.toBeNull();

        fireEvent.pointerDown(sensor, { pointerId: 2, pointerType: "mouse", isPrimary: true, button: 0, clientX: 1275, clientY: 400 });
        fireEvent.pointerUp(sensor, { pointerId: 2, pointerType: "mouse", isPrimary: true, button: 0, clientX: 1275, clientY: 400 });
        fireEvent.click(sensor);
        await waitFor(() => expect(borde.actual).toBe("logic"));
        act(() => borde.set(null));

        fireEvent.pointerDown(sensor, { pointerId: 3, pointerType: "mouse", isPrimary: true, button: 0, clientX: 1275, clientY: 400 });
        for (let i = 1; i <= 5; i++) {
            reloj += 16;
            fireEvent.pointerMove(sensor, { pointerId: 3, pointerType: "mouse", isPrimary: true, clientX: 1275 - i * 25, clientY: 402 });
        }
        await waitFor(() => expect(borde.actual).toBe("logic"));
        expect(sesionBordeActiva("logic", reloj)?.fase).toBe("arrastrando");
        reloj += 16;
        fireEvent.pointerUp(sensor, { pointerId: 3, pointerType: "mouse", isPrimary: true, button: 0, clientX: 1150, clientY: 402 });
        expect(sesionBordeActiva("logic", reloj)?.fase).toBe("soltada");
    });

    it("con el dedo, tocar el borde con otra cortina abierta es «tocar fuera»: la cierra", async () => {
        entorno(true);
        render(<PerimeterProvider><PerimeterInterface /><Espia /></PerimeterProvider>);
        act(() => borde.set("horizon"));
        const sensor = document.querySelector('[data-trinity-sensor="logic"]') as HTMLElement;
        fireEvent.pointerDown(sensor, { pointerId: 4, pointerType: "touch", isPrimary: true, clientX: 385, clientY: 300 });
        fireEvent.click(sensor);
        await waitFor(() => expect(borde.actual).toBeNull());
    });
});

describe("dock (Anchor) deslizable", () => {
    function Dock({ gestos, alCerrar }: { gestos: boolean; alCerrar: () => void }) {
        return (
            <AnimatePresence>
                <DockDeslizable key="d" gestos={gestos} onCerrar={alCerrar} className="fixed bottom-0">
                    <div data-agarre-panel="" data-testid="pildora">
                        <button type="button">Escritorio</button>
                    </div>
                    <input aria-label="nombre" />
                </DockDeslizable>
            </AnimatePresence>
        );
    }
    const p = (x: number, y: number) => ({ pointerId: 7, pointerType: "touch", isPrimary: true, clientX: x, clientY: y });

    it("bajarlo arrastrando desde su agarre lo cierra; un desliz horizontal es del carril", () => {
        entorno(true);
        const alCerrar = vi.fn();
        render(<Dock gestos alCerrar={alCerrar} />);
        const pildora = screen.getByTestId("pildora");
        fireEvent.pointerDown(pildora, p(200, 760));
        for (let i = 1; i <= 6; i++) { reloj += 16; fireEvent.pointerMove(pildora, p(200 + i * 20, 762)); }
        fireEvent.pointerUp(pildora, p(320, 762));
        expect(alCerrar).not.toHaveBeenCalled();

        fireEvent.pointerDown(pildora, p(200, 700));
        for (let i = 1; i <= 6; i++) { reloj += 16; fireEvent.pointerMove(pildora, p(201, 700 + i * 20)); }
        reloj += 16;
        fireEvent.pointerUp(pildora, p(201, 820));
        expect(alCerrar).toHaveBeenCalledTimes(1);
    });

    it("Escape lo cierra; con «siempre visible» no hay gestos ni Escape", () => {
        entorno(true);
        const alCerrar = vi.fn();
        const { unmount } = render(<Dock gestos alCerrar={alCerrar} />);
        fireEvent.keyDown(window, { key: "Escape" });
        expect(alCerrar).toHaveBeenCalledTimes(1);
        unmount();

        const fijo = vi.fn();
        render(<Dock gestos={false} alCerrar={fijo} />);
        fireEvent.keyDown(window, { key: "Escape" });
        const pildora = screen.getByTestId("pildora");
        fireEvent.pointerDown(pildora, p(200, 700));
        for (let i = 1; i <= 6; i++) { reloj += 16; fireEvent.pointerMove(pildora, p(201, 700 + i * 25)); }
        fireEvent.pointerUp(pildora, p(201, 850));
        expect(fijo).not.toHaveBeenCalled();
    });
});
