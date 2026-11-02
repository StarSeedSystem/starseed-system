// Rescate de la rama nube/40126871156 (tarea RLB1020N) · casos adaptados a la API de hoy.
// Main resolvió el contrato la rama por otro camino: la ventana SIEMPRE abre centrada
// (os-window.tsx:114-116); la hoja con data-hoja y el anclaje por viewport se descartan.
// Cubierto ya con otro nombre: Escape apilado (os-window-escape.test.tsx).

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import { OSWindow, desplazamientoInicial } from "../os-window";

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

describe("OSWindow · ventana centrada (ramas de la nube)", () => {
    afterEach(() => cleanup());

    it("abre centrada: nace con el fundido de escala de siempre y sin desfase", () => {
        render(<Ventana />);
        const dialogo = screen.getByRole("dialog");
        // Sin hoja ni anclaje: main decidió ventana siempre centrada (contrato actual).
        expect(dialogo.getAttribute("data-hoja")).toBeNull();
        const marco = dialogo.querySelector(".rounded-2xl") as HTMLElement;
        expect(marco).not.toBeNull();
        expect(marco.style.opacity).toBe("0");
        expect(marco.style.transform).toContain("scale(0.96)");
        // La capa de arrastre nace sin desplazamiento: el fundido no suma desfase.
        const envoltorio = dialogo.querySelector("div.relative") as HTMLElement;
        expect(envoltorio.style.transform).toBe("translate(0px, 0px)");
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

describe("desplazamientoInicial · composición por aparato (ADN §7b)", () => {
    it("en escritorio no desplaza: el flex ya deja la ventana centrada", () => {
        const viewport = { ancho: 1440, alto: 900 };
        const marco = { izquierda: 420, arriba: 200, ancho: 600, alto: 500 };
        expect(desplazamientoInicial(viewport, marco)).toEqual({ dx: 0, dy: 0 });
    });

    it("en teléfono baja el marco hasta anclar su borde inferior al viewport", () => {
        const viewport = { ancho: 400, alto: 800 };
        const marco = { izquierda: 16, arriba: 56, ancho: 368, alto: 688 };
        const { dx, dy } = desplazamientoInicial(viewport, marco);
        expect(dx).toBe(0);
        // centro actual (arriba 56) → hoja anclada abajo (arriba 112)
        expect(dy).toBe(56);
        expect(marco.arriba + dy + marco.alto).toBe(viewport.alto);
    });

    it("en teléfono también centra en horizontal cuando el marco no lo estaba", () => {
        const viewport = { ancho: 400, alto: 800 };
        const marco = { izquierda: 0, arriba: 0, ancho: 320, alto: 600 };
        const { dx } = desplazamientoInicial(viewport, marco);
        // geometriaVentana: x = 16 + (368 - 320) / 2 = 40; antes estaba en 0
        expect(dx).toBe(40);
    });
});

describe("OSWindow · hoja en teléfono", () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("se desplaza hasta quedar como hoja centrada anclada abajo", () => {
        vi.stubGlobal("innerWidth", 400);
        vi.stubGlobal("innerHeight", 800);
        vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(368);
        vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(688);
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
            left: 16, top: 56, right: 384, bottom: 744, width: 368, height: 688, x: 16, y: 56,
            toJSON: () => ({}),
        } as DOMRect);

        render(<Ventana />);
        const envoltorio = screen.getByRole("dialog").querySelector("div.relative") as HTMLElement;
        expect(envoltorio.style.transform).toBe("translate(0px, 56px)");
    });
});
