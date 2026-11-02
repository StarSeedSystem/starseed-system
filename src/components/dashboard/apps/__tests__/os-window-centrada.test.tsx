// Rescate de la rama nube/40126871156 (tarea RLB1020N) · casos adaptados a la API de hoy.
// Contrato actual (Ola 1019D): la ventana siempre abre centrada; en teléfono
// (< 430 px) se abre como hoja anclada al borde inferior y entra desde abajo.
// Cubierto ya con otro nombre: Escape apilado (os-window-escape.test.tsx).

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import { OSWindow } from "../os-window";

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));

/** Un OSWindow real, portado a document.body como hacen sus anfitriones. */
function Ventana() {
    return createPortal(
        <OSWindow title="Muestra" icon={Sparkles} accent="#22d3ee" onClose={() => {}}>
            <p>contenido</p>
        </OSWindow>,
        document.body,
    );
}

/** Fija el viewport de jsdom (no hay layout real) y devuelve cómo restaurarlo. */
function conViewport(ancho: number, alto: number): () => void {
    const anchoOriginal = window.innerWidth;
    const altoOriginal = window.innerHeight;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: ancho });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: alto });
    return () => {
        Object.defineProperty(window, "innerWidth", { configurable: true, value: anchoOriginal });
        Object.defineProperty(window, "innerHeight", { configurable: true, value: altoOriginal });
    };
}

describe("OSWindow · ventana centrada (ramas de la nube)", () => {
    afterEach(() => cleanup());

    it("en escritorio abre centrada: fundido de escala y capa de arrastre sin desfase", () => {
        render(<Ventana />);
        const dialogo = screen.getByRole("dialog");
        // En escritorio no es hoja: el flex la centra (contrato actual).
        expect(dialogo.querySelector("[data-hoja='true']")).toBeNull();
        const marco = dialogo.querySelector(".rounded-2xl") as HTMLElement;
        expect(marco).not.toBeNull();
        expect(marco.style.opacity).toBe("0");
        expect(marco.style.transform).toContain("scale(0.96)");
        expect(marco.style.transform).not.toContain("translateY(24px)");
        // La capa de arrastre nace sin desplazamiento: el fundido no suma desfase.
        const envoltorio = dialogo.querySelector("div.relative") as HTMLElement;
        expect(envoltorio.style.transform).toBe("translate(0px, 0px)");
    });

    it("en teléfono abre como hoja anclada abajo y entra desde abajo", () => {
        const restaurar = conViewport(390, 844);
        // jsdom no calcula layout: el marco centrado mediría 0. Simulamos el
        // rectángulo que tendría un marco de 688 px de alto centrado en 844.
        const rectOriginal = Element.prototype.getBoundingClientRect;
        const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
            if (this.classList?.contains("max-w-full")) {
                return {
                    x: 18.75, y: 78, top: 78, left: 18.75,
                    width: 352.5, height: 688, right: 371.25, bottom: 766,
                    toJSON: () => ({}),
                } as DOMRect;
            }
            return rectOriginal.call(this);
        });

        try {
            render(<Ventana />);
            const dialogo = screen.getByRole("dialog");
            expect(dialogo.querySelector("[data-hoja='true']")).not.toBeNull();
            // 156 (borde inferior de la hoja) - 78 (centro) = 78 px de bajada.
            const envoltorio = dialogo.querySelector("div.relative") as HTMLElement;
            expect(envoltorio.style.transform).toBe("translate(0px, 78px)");
            // Entrada cardinal: 24 px de recorrido desde abajo, opacidad 0 → 1.
            const marco = dialogo.querySelector(".rounded-2xl") as HTMLElement;
            expect(marco.style.opacity).toBe("0");
            expect(marco.style.transform).toContain("translateY(24px)");
        } finally {
            rectSpy.mockRestore();
            restaurar();
        }
    });

    it("el arrastre por la cabecera desplaza la capa de arrastre (sin tocar los botones)", () => {
        render(<Ventana />);
        const cabecera = screen.getByText("Muestra").closest("header") as HTMLElement;
        const envoltorio = screen.getByRole("dialog").querySelector("div.relative") as HTMLElement;
        fireEvent.pointerDown(cabecera, { clientX: 100, clientY: 100 });
        fireEvent(window, new MouseEvent("pointermove", { clientX: 128, clientY: 60, bubbles: true }));
        fireEvent(window, new MouseEvent("pointerup", { bubbles: true }));
        expect(envoltorio.style.transform).toBe("translate(28px, -40px)");
    });
});
