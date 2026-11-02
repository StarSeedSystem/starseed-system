// Rescate de la rama nube/40126871156 (tarea RLB1020N) · casos adaptados a la API de hoy.
// Main resolvió el contrato la rama por otro camino: la ventana SIEMPRE abre centrada
// (os-window.tsx:114-116); la hoja con data-hoja y el anclaje por viewport se descartan.
// Cubierto ya con otro nombre: Escape apilado (os-window-escape.test.tsx).

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
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

describe("OSWindow · composición por aparato", () => {
    const anchoOriginal = window.innerWidth;
    const altoOriginal = window.innerHeight;

    function fijarViewport(ancho: number, alto: number) {
        Object.defineProperty(window, "innerWidth", { configurable: true, value: ancho });
        Object.defineProperty(window, "innerHeight", { configurable: true, value: alto });
    }

    afterEach(() => {
        cleanup();
        fijarViewport(anchoOriginal, altoOriginal);
    });

    it("en teléfono abre como hoja centrada apoyada abajo y sube con entrada cardinal", async () => {
        fijarViewport(390, 800);
        render(<Ventana />);
        const dialogo = screen.getByRole("dialog");
        const envoltorio = dialogo.querySelector("div.relative") as HTMLElement;
        // Nace por debajo de su sitio (entrada cardinal de 24 px) y con el fundido.
        const marco = dialogo.querySelector(".rounded-2xl") as HTMLElement;
        expect(marco.style.opacity).toBe("0");
        expect(marco.style.transform).toContain("translateY(24px)");
        expect(marco.style.transform).toContain("scale(0.96)");
        // Alto por defecto de OSWindow en jsdom: min(86vh, 760) = 688.
        // Baja desde el centro (56 px) hasta apoyar su borde inferior en el viewport.
        await waitFor(() => expect(envoltorio.style.transform).toBe("translate(0px, 56px)"));
    });

    it("en escritorio abre centrada, sin desplazamiento inicial", async () => {
        fijarViewport(1440, 900);
        render(<Ventana />);
        const marco = screen.getByRole("dialog").querySelector(".rounded-2xl") as HTMLElement;
        expect(marco.style.transform).toContain("translateY(24px)");
        const envoltorio = screen.getByRole("dialog").querySelector("div.relative") as HTMLElement;
        await waitFor(() => expect(envoltorio.style.transform).toBe("translate(0px, 0px)"));
    });

    it("el arrastre en teléfono suma sobre la posición de hoja", async () => {
        fijarViewport(390, 800);
        render(<Ventana />);
        const dialogo = screen.getByRole("dialog");
        const envoltorio = dialogo.querySelector("div.relative") as HTMLElement;
        await waitFor(() => expect(envoltorio.style.transform).toBe("translate(0px, 56px)"));
        const cabecera = screen.getByText("Muestra").closest("header") as HTMLElement;
        fireEvent.pointerDown(cabecera, { clientX: 100, clientY: 100 });
        fireEvent(window, new MouseEvent("pointermove", { clientX: 128, clientY: 60, bubbles: true }));
        fireEvent(window, new MouseEvent("pointerup", { bubbles: true }));
        expect(envoltorio.style.transform).toBe("translate(28px, 16px)");
    });
});
