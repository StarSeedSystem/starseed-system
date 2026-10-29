// Rescate de la rama nube/40126871156 (tarea RLB1020N) · casos adaptados a la API de hoy.
// Main resolvió el contrato la rama por otro camino: la ventana SIEMPRE abre centrada
// (os-window.tsx:114-116); la hoja con data-hoja y el anclaje por viewport se descartan.
// Cubierto ya con otro nombre: Escape apilado (os-window-escape.test.tsx).

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import { OSWindow } from "../os-window";
import { geometriaVentana } from "@/lib/design/composicion";

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

/** Fija el viewport que lee OSWindow al montar (jsdom no lo cambia solo). */
function verEn(ancho: number, alto: number) {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: ancho });
    Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: alto });
}

describe("OSWindow · composición por aparato", () => {
    afterEach(() => {
        cleanup();
        verEn(1024, 768);
    });

    it("en teléfono abre como hoja: ancho de pantalla, sube desde abajo y deja el centro libre", () => {
        const ancho = 390;
        const alto = 844;
        verEn(ancho, alto);
        render(<Ventana />);

        const dialogo = screen.getByRole("dialog");
        expect(dialogo.getAttribute("data-composicion")).toBe("hoja");

        const geo = geometriaVentana({ ancho, alto }, { tipo: "hoja" });
        const marco = dialogo.querySelector(".rounded-2xl") as HTMLElement;
        expect(marco.style.width).toBe(`${geo.ancho}px`);
        expect(marco.style.height).toBe(`${geo.alto}px`);
        // Entrada cardinal: nace 32 px por debajo de su sitio y sube.
        expect(marco.style.transform).toContain("translateY(32px)");

        const partidaY = geo.y - (alto - geo.alto) / 2;
        const envoltorio = dialogo.querySelector("div.relative") as HTMLElement;
        expect(envoltorio.style.transform).toBe(`translate(0px, ${partidaY}px)`);
    });

    it("en escritorio abre centrada y conserva la talla de siempre (sizeClass)", () => {
        verEn(1280, 800);
        render(<Ventana />);

        const dialogo = screen.getByRole("dialog");
        expect(dialogo.getAttribute("data-composicion")).toBe("ventana");

        const marco = dialogo.querySelector(".rounded-2xl") as HTMLElement;
        // Sin talla en línea: manda la clase por defecto (w-[min(94vw,1100px)]…).
        expect(marco.style.width).toBe("");
        expect(marco.style.height).toBe("");
        expect(marco.style.transform).toContain("scale(0.96)");

        const envoltorio = dialogo.querySelector("div.relative") as HTMLElement;
        expect(envoltorio.style.transform).toBe("translate(0px, 0px)");
    });
});
