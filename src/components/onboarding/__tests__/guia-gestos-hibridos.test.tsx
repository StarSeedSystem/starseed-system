import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import { DemoGestosHibridos, ResumenGestos, instruccionesPractica } from "../demo-gestos-hibridos";
import { AuroraGuide, OPEN_GUIDE_EVENT } from "../aurora-guide";
import { decidirPaso } from "@/hooks/use-deslizar-pasos";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => "/escritorios",
}));
vi.mock("next/image", () => ({
    // eslint-disable-next-line @next/next/no-img-element
    default: (p: { alt: string; src: string }) => <img alt={p.alt} src={p.src} />,
}));
const setActiveEdge = vi.fn();
vi.mock("@/context/perimeter-context", () => ({
    usePerimeter: () => ({ activeEdge: null, setActiveEdge }),
}));

let reloj = 1000;

/** Dispositivo simulado: qué punteros hay y si se pidió menos movimiento. */
function dispositivo(tipo: "tactil" | "raton", reducido = true) {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockImplementation((q: string) => ({
            matches: q.includes("reduced-motion")
                ? reducido
                : tipo === "tactil"
                    ? q.includes("coarse")
                    : q.includes("fine") || q.includes("hover"),
            media: q,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
        })),
    });
}

beforeEach(() => {
    cleanup();
    reloj = 1000;
    setActiveEdge.mockClear();
    vi.spyOn(performance, "now").mockImplementation(() => reloj);
    try { window.localStorage.clear(); } catch { /* */ }
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, writable: true, value: vi.fn() });
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("guía · paso «Gestos naturales en cualquier pantalla»", () => {
    it("las instrucciones cambian según el dispositivo", () => {
        expect(instruccionesPractica("tactil").abrir).toMatch(/dedo/);
        expect(instruccionesPractica("raton").abrir).toMatch(/ratón/);
        expect(instruccionesPractica("hibrido").abrir).toMatch(/dedo.*ratón/);
    });

    it("práctica real: abrir tirando desde el borde y cerrar con la X marca los dos logros", () => {
        dispositivo("tactil");
        render(<DemoGestosHibridos accent="#6FE6D6" reduce />);
        expect(screen.getByText(/Desliza el dedo desde el borde izquierdo/)).toBeTruthy();
        const escenario = screen.getByTestId("practica-gestos");
        vi.spyOn(escenario, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 300, bottom: 144, width: 300, height: 144, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
        const p = (x: number) => ({ pointerId: 1, pointerType: "touch", isPrimary: true, clientX: x, clientY: 70 });
        fireEvent.pointerDown(escenario, p(8));
        for (let i = 1; i <= 8; i++) {
            reloj += 16;
            fireEvent.pointerMove(escenario, p(8 + i * 20));
        }
        reloj += 16;
        fireEvent.pointerUp(escenario, p(168));
        expect(screen.getByText("Abierto desde el borde").className).toContain("emerald");
        fireEvent.click(screen.getByRole("button", { name: "Cerrar el panel de práctica" }));
        expect(screen.getByText("Cerrado").className).toContain("emerald");
        expect(screen.getByText(/¡Perfecto!/)).toBeTruthy();
    });

    it("el resumen del asistente de alta explica el gesto de ESTE dispositivo", () => {
        dispositivo("tactil");
        const { unmount } = render(<ResumenGestos />);
        expect(screen.getByTestId("resumen-gestos").textContent).toMatch(/deslizando el dedo/);
        unmount();
        dispositivo("raton");
        render(<ResumenGestos />);
        expect(screen.getByTestId("resumen-gestos").textContent).toMatch(/cursor/);
        expect(screen.getByTestId("resumen-gestos").textContent).toMatch(/Escape/);
    });

    it("un arrastre que no nace en el borde no abre (como en el OS)", () => {
        dispositivo("raton");
        render(<DemoGestosHibridos accent="#6FE6D6" reduce />);
        expect(screen.getByText(/Tira del borde izquierdo con el ratón/)).toBeTruthy();
        const escenario = screen.getByTestId("practica-gestos");
        vi.spyOn(escenario, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 300, bottom: 144, width: 300, height: 144, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
        const p = (x: number) => ({ pointerId: 2, pointerType: "mouse", isPrimary: true, button: 0, clientX: x, clientY: 70 });
        fireEvent.pointerDown(escenario, p(150));
        for (let i = 1; i <= 6; i++) { reloj += 16; fireEvent.pointerMove(escenario, p(150 + i * 20)); }
        fireEvent.pointerUp(escenario, p(270));
        expect(screen.getByText("Abierto desde el borde").className).not.toContain("emerald");
        // Clic en el borde (o Intro con el teclado) también lo abre.
        fireEvent.click(screen.getByRole("button", { name: "Abrir el panel de práctica" }));
        expect(screen.getByRole("button", { name: "Cerrar el panel de práctica" }).tabIndex).toBe(0);
    });
});

describe("guía · deslizar la tarjeta para pasar de paso", () => {
    it("decidirPaso: izquierda avanza, derecha retrocede, poco movimiento no hace nada", () => {
        expect(decidirPaso(-90, 0)).toBe("siguiente");
        expect(decidirPaso(90, 0)).toBe("anterior");
        expect(decidirPaso(-30, -0.8)).toBe("siguiente");
        expect(decidirPaso(20, 0.1)).toBeNull();
    });

    it("el paso híbrido aparece con el texto de ESTE dispositivo, la X común cierra y se pasa de paso deslizando", async () => {
        // Reloj real: las salidas de framer-motion necesitan que el tiempo avance.
        vi.mocked(performance.now).mockRestore();
        dispositivo("raton");
        render(<AuroraGuide />);
        act(() => { window.dispatchEvent(new CustomEvent(OPEN_GUIDE_EVENT, { detail: { step: 5 } })); });
        fireEvent.click(await screen.findByRole("button", { name: /Solo la guía, sin voz/ }));
        expect(await screen.findByText("Gestos naturales en cualquier pantalla")).toBeTruthy();
        expect(screen.getByText(/Deja el cursor un instante en un borde/)).toBeTruthy();

        // Deslizar a la derecha: vuelve al paso anterior (Anchor).
        const tarjeta = screen.getByTestId("guia-tarjeta");
        const p = (x: number) => ({ pointerId: 5, pointerType: "mouse", isPrimary: true, button: 0, clientX: x, clientY: 300 });
        fireEvent.pointerDown(tarjeta, p(100));
        for (let i = 1; i <= 6; i++) { reloj += 16; fireEvent.pointerMove(tarjeta, p(100 + i * 20)); }
        reloj += 16;
        fireEvent.pointerUp(tarjeta, p(220));
        await waitFor(() => expect(screen.getByText("Trinity · Anchor (abajo)")).toBeTruthy());

        // La X común de la guía la cierra.
        const cerrar = screen.getAllByRole("button", { name: "Cerrar la guía" }).find((b) => b.hasAttribute("data-boton-cerrar"));
        expect(cerrar).toBeTruthy();
        // Pulsación real (pointerdown → click) justo después de deslizar: no se pierde.
        fireEvent.pointerDown(cerrar as HTMLElement, p(400));
        fireEvent.pointerUp(cerrar as HTMLElement, p(400));
        fireEvent.click(cerrar as HTMLElement);
        await waitFor(() => expect(screen.queryByText("Trinity · Anchor (abajo)")).toBeNull());
    });
});
