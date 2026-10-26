import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Sparkles } from "lucide-react";
import { OSWindow } from "../os-window";

// Rescate de la rama nube/40126871156 (RLB1020N): casos que main aún no cubre,
// adaptados al contrato actual de OSWindow. Main abra la ventana SIEMPRE
// centrada y en cascada de flex; los casos de «hoja» del móvil se descartaron
// (contrato cambiado a propósito).

/** Elemento animado (marco) de una ventana renderizada: primer hijo del envoltorio de arrastre. */
const marco = (anfitrion: HTMLElement): HTMLElement =>
    (anfitrion.querySelector('[role="dialog"]') as HTMLElement).querySelector(".relative")!
        .firstElementChild as HTMLElement;

describe("OSWindow · ventana centrada (main)", () => {
    afterEach(() => cleanup());

    it("en escritorio la ventana abre centrada, opaca por fundido, sin desfase de entrada", () => {
        const vista = render(
            <OSWindow title="Muestra" icon={Sparkles} accent="#22d3ee" onClose={() => {}}>
                <p>contenido</p>
            </OSWindow>,
        );
        const dialogo = screen.getByRole("dialog");
        // El contrato actual no conoce modo «hoja».
        expect(dialogo.getAttribute("data-hoja")).toBeNull();
        // Primer fotograma: fundido de escala de siempre, sin translateY.
        const m = marco(vista.container);
        expect(m.style.opacity).toBe("0");
        expect(m.style.transform).toContain("scale(0.96)");
        expect(m.style.transform).not.toMatch(/translateY\((?!0px)/);
    });

    it("el arrastre por la cabecera sigue funcionando y mueve el envoltorio", () => {
        const vista = render(
            <OSWindow title="Muestra" icon={Sparkles} accent="#22d3ee" onClose={() => {}}>
                <p>contenido</p>
            </OSWindow>,
        );
        const cabecera = screen.getByText("Muestra").closest("header") as HTMLElement;
        const envoltorio = vista.container.querySelector('[role="dialog"] .relative') as HTMLElement;
        fireEvent.pointerDown(cabecera, { clientX: 100, clientY: 100 });
        fireEvent(window, new MouseEvent("pointermove", { clientX: 128, clientY: 60, bubbles: true }));
        fireEvent(window, new MouseEvent("pointerup", { bubbles: true }));
        expect(envoltorio.style.transform).toContain("translate(28px, -40px)");
    });
});
