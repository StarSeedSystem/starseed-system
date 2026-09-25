import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { TransicionRutas, objetivosDeTransicion, DURACION_COREOGRAFIA_MS } from "../transicion-rutas";
import { useDireccionPaso } from "../paso-animado";

let ruta = "/escritorios";
vi.mock("next/navigation", () => ({ usePathname: () => ruta }));

const animar = vi.fn(() => ({ cancel: vi.fn() }));

function entorno(reducido: boolean) {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockImplementation((q: string) => ({
            matches: q.includes("reduced-motion") ? reducido : false,
            media: q,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        })),
    });
}

function Escena() {
    return (
        <>
            <div id="main-content" style={{ display: "contents" }}>
                <main data-testid="pagina">Página</main>
            </div>
            <TransicionRutas />
        </>
    );
}

beforeEach(() => {
    cleanup();
    ruta = "/escritorios";
    animar.mockClear();
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, writable: true, value: animar });
    // La página ocupa toda la pantalla (jsdom no maqueta).
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
        x: 0, y: 0, top: 0, left: 0, right: 1024, bottom: 768, width: 1024, height: 768, toJSON: () => ({}),
    } as DOMRect);
    document.documentElement.removeAttribute("data-perf");
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).animate;
});

describe("TransicionRutas (entrada 3D entre páginas)", () => {
    it("no pinta nada en el servidor y no anima la primera carga (sin contenido invisible)", () => {
        expect(renderToString(<TransicionRutas />)).toBe("");
        entorno(false);
        render(<Escena />);
        expect(animar).not.toHaveBeenCalled();
        expect(document.documentElement.hasAttribute("data-ss-navegando")).toBe(false);
    });

    it("al navegar, la página entra en 3D, sin dejar nada puesto, y el cromo hace su coreografía", () => {
        vi.useFakeTimers();
        entorno(false);
        const { rerender } = render(<Escena />);
        ruta = "/biblioteca";
        rerender(<Escena />);
        expect(animar).toHaveBeenCalledTimes(1);
        const [fotogramas, opciones] = animar.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions];
        expect(String(fotogramas[0].transform)).toContain("rotateX");
        expect(fotogramas[0].opacity).toBe(0);
        expect(opciones.fill).toBe("none");
        expect(Number(opciones.duration)).toBeLessThanOrEqual(420);
        expect(document.documentElement.hasAttribute("data-ss-navegando")).toBe(true);
        vi.advanceTimersByTime(DURACION_COREOGRAFIA_MS + 10);
        expect(document.documentElement.hasAttribute("data-ss-navegando")).toBe(false);
    });

    it("con menos movimiento solo funde, y en equipos modestos no hay 3D", () => {
        entorno(true);
        const { rerender } = render(<Escena />);
        ruta = "/agent";
        rerender(<Escena />);
        const [reducido] = animar.mock.calls[0] as unknown as [Keyframe[]];
        expect(reducido.every((f) => f.transform === undefined)).toBe(true);

        cleanup();
        animar.mockClear();
        entorno(false);
        document.documentElement.setAttribute("data-perf", "eco");
        ruta = "/escritorios";
        const r2 = render(<Escena />);
        ruta = "/dashboard";
        r2.rerender(<Escena />);
        const [suave] = animar.mock.calls[0] as unknown as [Keyframe[]];
        expect(String(suave[0].transform)).not.toContain("rotate");
    });

    it("las rutas de consola no se animan", () => {
        entorno(false);
        const { rerender } = render(<Escena />);
        ruta = "/mando";
        rerender(<Escena />);
        expect(animar).not.toHaveBeenCalled();
    });

    it("elige las raíces visibles, entra en los envoltorios «contents» y respeta data-sin-transicion", () => {
        const raiz = document.createElement("div");
        raiz.innerHTML = `
            <section id="a"></section>
            <div id="envoltorio" style="display: contents"><article id="b"></article></div>
            <aside id="c" data-sin-transicion></aside>
            <div id="d" style="display: none"></div>`;
        document.body.appendChild(raiz);
        expect(objetivosDeTransicion(raiz).map((e) => e.id)).toEqual(["a", "b"]);
        raiz.remove();
    });
});

describe("useDireccionPaso", () => {
    it("deduce si se avanza o se retrocede", () => {
        const { result, rerender } = renderHook(({ i }) => useDireccionPaso(i), { initialProps: { i: 0 } });
        expect(result.current).toBe(1);
        rerender({ i: 2 });
        expect(result.current).toBe(1);
        rerender({ i: 1 });
        expect(result.current).toBe(-1);
        rerender({ i: 1 });
        expect(result.current).toBe(-1);
    });
});
