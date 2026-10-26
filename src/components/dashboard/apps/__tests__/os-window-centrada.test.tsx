import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import { OSWindow } from "../os-window";

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));

// DSN1019B: la ventana abre centrada (escritorio) o como hoja que sube desde
// abajo (teléfono), con la posición inicial dada por geometriaVentana.
// En jsdom no hay layout: offsetWidth/offsetHeight son 0, así que se comprueba
// el COMPORTAMIENTO (centrado / apoyada en el borde inferior), no los píxeles.

const VW = { escritorio: 1024, telefono: 390 };
const VH = 800;

function Ventana({ texto }: { texto: string }) {
    return createPortal(
        <OSWindow title={texto} icon={Sparkles} accent="#22d3ee" onClose={() => {}}>
            <p>{`contenido ${texto}`}</p>
        </OSWindow>,
        document.body,
    );
}

function ponerViewport(ancho: number) {
    Object.defineProperty(window, "innerWidth", { value: ancho, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: VH, configurable: true });
}

const marco = () =>
    screen.getByRole("dialog", { name: "prueba" }).firstElementChild!.nextElementSibling as HTMLElement;

afterEach(() => {
    cleanup();
    ponerViewport(VW.escritorio);
});

describe("OSWindow · posición inicial con geometriaVentana (DSN1019B)", () => {
    it("escritorio: la ventana queda centrada en la pantalla", () => {
        ponerViewport(VW.escritorio);
        render(<Ventana texto="prueba" />);
        const capa = marco();
        // Con ancho medido 0 (jsdom), el centrado deja left = vw/2 y top = vh/2.
        expect(parseFloat(capa.style.left)).toBe(VW.escritorio / 2);
        expect(parseFloat(capa.style.top)).toBe(VH / 2);
    });

    it("teléfono: hoja centrada en horizontal y apoyada en el borde inferior", () => {
        ponerViewport(VW.telefono);
        render(<Ventana texto="prueba" />);
        const capa = marco();
        // Hoja: y = alto - alturaMedida(0) → borde inferior exacto, y márgenes de 16 px.
        expect(parseFloat(capa.style.top)).toBe(VH);
        expect(parseFloat(capa.style.left)).toBeGreaterThanOrEqual(16);
        expect(parseFloat(capa.style.left)).toBeLessThanOrEqual(VW.telefono / 2);
    });

    it("la entrada en teléfono es cardinal sur (sube desde abajo), no escala", () => {
        ponerViewport(VW.telefono);
        render(<Ventana texto="prueba" />);
        const hoja = screen.getByRole("dialog", { name: "prueba" })
            .firstElementChild!.nextElementSibling!.firstElementChild as HTMLElement;
        expect(hoja.style.opacity).toBe("0");
        expect(hoja.style.transform).toContain("translateY");
    });

    it("la entrada en escritorio mantiene el centrado con escala suave", () => {
        ponerViewport(VW.escritorio);
        render(<Ventana texto="prueba" />);
        const marcoAnimado = screen.getByRole("dialog", { name: "prueba" })
            .firstElementChild!.nextElementSibling!.firstElementChild as HTMLElement;
        expect(marcoAnimado.style.opacity).toBe("0");
        expect(marcoAnimado.style.transform).toContain("scale");
    });

    it("la posición se recalcula cuando cambia el viewport (no bucle, no bloqueo)", () => {
        ponerViewport(VW.escritorio);
        render(<Ventana texto="prueba" />);
        act(() => {
            ponerViewport(VW.telefono);
            fireEvent(window, new Event("resize"));
        });
        expect(parseFloat(marco().style.top)).toBe(VH);
    });
});
