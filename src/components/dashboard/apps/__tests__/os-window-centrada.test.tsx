import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Sparkles } from "lucide-react";
import { OSWindow } from "../os-window";

// RTRLB1020N · la ventana del OS abre centrada y su arrastre no rompe el centrado.
// El escritorio de main NO tiene hoja en teléfono (decisión de diseño: siempre
// centrada), así que aquí se rescatan solo los dos contratos que main conserva.

function abrir() {
    return render(
        <OSWindow title="Muestra" icon={Sparkles} accent="#22d3ee" onClose={() => {}}>
            <p>contenido</p>
        </OSWindow>,
    );
}

function marcoCentrado(vista: ReturnType<typeof abrir>): HTMLElement {
    const dialogo = vista.container.querySelector('[role="dialog"]') as HTMLElement;
    return dialogo.querySelector("div.relative") as HTMLElement;
}

describe("OSWindow · centrado y arrastre (RTRLB1020N)", () => {
    afterEach(() => cleanup());

    it("en escritorio la ventana abre centrada y nace con el fundido de escala", () => {
        const vista = abrir();
        const dialogo = screen.getByRole("dialog");
        expect(dialogo.className).toContain("items-center");
        expect(dialogo.className).toContain("justify-center");
        expect(dialogo.getAttribute("data-hoja")).toBeNull();

        const envoltorio = marcoCentrado(vista);
        expect(envoltorio.style.transform).toBe("translate(0px, 0px)");

        const marco = envoltorio.firstElementChild as HTMLElement;
        expect(marco.style.opacity).toBe("0");
        expect(marco.style.transform).toContain("scale(0.96)");
        expect(marco.style.transform).not.toMatch(/translateY\((?!0px)/);
    });

    it("el arrastre por la cabecera mueve el envoltorio y no el marco animado", () => {
        const vista = abrir();
        const cabecera = screen.getByText("Muestra").closest("header") as HTMLElement;
        const envoltorio = marcoCentrado(vista);

        fireEvent.pointerDown(cabecera, { clientX: 100, clientY: 100 });
        fireEvent.pointerMove(window, { clientX: 128, clientY: 60 });
        fireEvent.pointerUp(window);

        expect(envoltorio.style.transform).toBe("translate(28px, -40px)");
    });
});
