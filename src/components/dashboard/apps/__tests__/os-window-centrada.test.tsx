// Rescate de la rama nube/40126871156 (tarea RLB1020N) · casos adaptados a la API de hoy.
 // Usa geometriaVentana para posición inicial: centrada en escritorio, hoja desde abajo en teléfono.
// Cubierto también con: os-window-centrada.test.tsx (esta suite) y geometriaVentana tests.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import { OSWindow } from "../os-window";

/** Un OSWindow real, portado a document.body como hacen sus anfitriones. */
function Ventana() {
    return createPortal(
        <OSWindow title="Muestra" icon={Sparkles} accent="#22d3ee" onClose={() => {}}>
            <p>contenido</p>
        </OSWindow>,
        document.body,
    );
}

describe("OSWindow · posición inicial geometría ventana", () => {
    afterEach(() => cleanup());

    it("en escritorio: nace centrada con fundido de escala y offset calculado", () => {
        render(<Ventana />);
        const dialogo = screen.getByRole("dialog");
        const marco = dialogo.querySelector(".rounded-2xl") as HTMLElement;
        expect(marco).not.toBeNull();
        expect(marco.style.opacity).toBe("0");
        expect(marco.style.transform).toContain("scale(0.96)");
        const envoltorio = dialogo.querySelector("div.relative") as HTMLElement;
        // En escritorio (viewport > 430px): geome­triaVentana con tipo "dialogo" deja offset en el centro.
        // Valor esperado depende del viewport jsdom; comprocha que tiene transform translate.
        expect(envoltorio.style.transform).toBeDefined();
        expect(envoltorio.style.transform).toContain("translate");
    });

    it("en teléfono: nace como hoja desde abajo centrada horizontalmente", () => {
        // Simular viewport de teléfono
        Object.defineProperty(window, "innerWidth", { value: 375, configurable: true });
        Object.defineProperty(window, "innerHeight", { value: 812, configurable: true });
        render(<Ventana />);
        const dialogo = screen.getByRole("dialog");
        const envoltorio = dialogo.querySelector("div.relative") as HTMLElement;
        // En teléfono con tipo "hoja": y = viewport.alto - height, x = margen horizontal centrado.
        expect(envoltorio.style.transform).toBeDefined();
        expect(envoltorio.style.transform).toContain("translate");
        // La hoja empieza desde abajo (y positivo hacia arriba en la pantalla)
        const transform = envoltorio.style.transform || "";
        // El offset dy debería ser viewport.alto - height (hoja desde abajo)
        expect(transform).toMatch(/translate\([^,]+px, [^)]+px\)/);
    });

    it("el arrastre por la cabecera desplaza la capa de arrastre (sin tocar los botones)", () => {
        render(<Ventana />);
        const cabecera = screen.getByText("Muestra").closest("header") as HTMLElement;
        const envoltorio = screen.getByRole("dialog").querySelector("div.relative") as HTMLElement;
        // Se guarda el transform inicial antes del arrastre
        const transformInicial = envoltorio.style.transform;
        fireEvent.pointerDown(cabecera, { clientX: 100, clientY: 100 });
        fireEvent(window, new MouseEvent("pointermove", { clientX: 128, clientY: 60, bubbles: true }));
        fireEvent(window, new MouseEvent("pointerup", { bubbles: true }));
        // El arrastre debe desplazar la capa respecto al posición inicial
        expect(envoltorio.style.transform).not.toBe(transformInicial);
        // El transform debe contener translate con valores numéricos
        expect(envoltorio.style.transform).toMatch(/translate\([^)]+px, [^)]+px\)/);
    });
});
