import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { Sparkles } from "lucide-react";
import { OSWindow } from "../os-window";
import { geometriaVentana, type Viewport } from "@/lib/design/composicion";

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));

// DSN1019B: la ventana abre centrada por aparato, con posición de geometriaVentana.
// En escritorio queda el centrado de siempre; en teléfono es hoja anclada abajo
// con entrada cardinal desde abajo, y el arrastre de la cabecera sigue intacto.

/** Fija el viewport del entorno (jsdom no lo cambia solo). */
function fijarViewport(ancho: number, alto: number) {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: ancho });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: alto });
}

/** matchMedia falso para decidir movimiento reducido sin depender del entorno. */
function simularMenosMovimiento(reducido: boolean) {
    const consulta = { matches: reducido, addEventListener: () => {}, removeEventListener: () => {} };
    Object.defineProperty(window, "matchMedia", {
        configurable: true, writable: true,
        value: (q: string) => (q.includes("reduce") ? consulta : { ...consulta, matches: false }),
    });
}

function abrir() {
    return render(
        <OSWindow title="Muestra" icon={Sparkles} accent="#22d3ee" onClose={() => {}}>
            <p>contenido</p>
        </OSWindow>,
    );
}

/** La tarjeta animada: el hijo del envoltorio de arrastre dentro del cuadro. */
function tarjeta(vista: ReturnType<typeof abrir>): HTMLElement {
    return vista.container.querySelector('[role="dialog"] div.relative > div') as HTMLElement;
}

describe("OSWindow · composición centrada por aparato (DSN1019B)", () => {
    afterEach(() => {
        cleanup();
        delete (window as { matchMedia?: unknown }).matchMedia;
        fijarViewport(1024, 768);
    });

    it("en escritorio la ventana abre centrada, sin anclaje de hoja", () => {
        fijarViewport(1280, 800);
        const vista = abrir();
        const dialogo = screen.getByRole("dialog");
        expect(dialogo.getAttribute("data-hoja")).toBeNull();
        // Nace con el fundido de escala de siempre: y sin desfase.
        const marco = tarjeta(vista);
        expect(marco.style.opacity).toBe("0");
        expect(marco.style.transform).toContain("scale(0.96)");
        expect(marco.style.transform).not.toMatch(/translateY\((?!0px)/);
    });

    it("en teléfono la ventana es hoja: nace bajo el borde inferior y asciende a su anclaje", () => {
        fijarViewport(390, 844);
        const vista = abrir();
        const dialogo = screen.getByRole("dialog");
        expect(dialogo.getAttribute("data-hoja")).toBe("true");
        // Estampa la misma cuenta que geometriaVentana: desfase al fondo + entrada bajo el borde.
        const mirilla: Viewport = { ancho: 390, alto: 844 };
        // jsdom no tiene layout: en el componente manda la altura por defecto de hoja.
        const altoCompone = geometriaVentana(mirilla, { tipo: "hoja" }).alto;
        const anclaje = geometriaVentana(mirilla, { tipo: "hoja", alto: altoCompone }).y
            - geometriaVentana(mirilla, { tipo: "ventana", alto: altoCompone }).y;
        const entrada = anclaje + altoCompone + 16;
        const marco = tarjeta(vista);
        expect(marco.style.transform).toContain(`translateY(${entrada}px)`);
        expect(marco.style.opacity).toBe("0");
    });

    it("en teléfono con movimiento reducido la hoja está en su anclaje y solo funde", () => {
        fijarViewport(390, 844);
        simularMenosMovimiento(true);
        const vista = abrir();
        expect(screen.getByRole("dialog").getAttribute("data-hoja")).toBe("true");
        const mirilla: Viewport = { ancho: 390, alto: 844 };
        const altoCompone = geometriaVentana(mirilla, { tipo: "hoja" }).alto;
        const anclaje = geometriaVentana(mirilla, { tipo: "hoja", alto: altoCompone }).y
            - geometriaVentana(mirilla, { tipo: "ventana", alto: altoCompone }).y;
        const marco = tarjeta(vista);
        expect(marco.style.transform).toContain(`translateY(${anclaje}px)`);
        expect(marco.style.transform).not.toContain("scale(0.96)");
        expect(marco.style.opacity).toBe("0");
    });

    it("el arrastre por la cabecera sigue funcionando tras el anclaje", () => {
        fijarViewport(1280, 800);
        const vista = abrir();
        const cabecera = screen.getByText("Muestra").closest("header") as HTMLElement;
        const envoltorio = vista.container.querySelector('[role="dialog"] div.relative') as HTMLElement;
        fireEvent.pointerDown(cabecera, { clientX: 100, clientY: 100 });
        fireEvent(window, new MouseEvent("pointermove", { clientX: 128, clientY: 60, bubbles: true }));
        fireEvent(window, new MouseEvent("pointerup", { bubbles: true }));
        expect(envoltorio.style.transform).toContain("translate(28px, -40px)");
    });
});
