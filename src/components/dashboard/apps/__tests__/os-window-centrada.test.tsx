// OSWindow · apertura centrada por aparato (Ola 1019D).
// Escritorio: ventana centrada con el fundido de escala de siempre.
// Teléfono (< 430 px): hoja centrada anclada abajo que entra desde el borde inferior.
// La geometría sale de `geometriaVentana` (src/lib/design/composicion.ts) y se
// traduce a un desplazamiento relativo al centro del contenedor flex, sin tocar
// la API ni el arrastre.

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import { OSWindow, posicionInicialVentana } from "../os-window";

/** Un OSWindow real, portado a document.body como hacen sus anfitriones. */
function Ventana() {
    return createPortal(
        <OSWindow title="Muestra" icon={Sparkles} accent="var(--primary)" onClose={() => {}}>
            <p>contenido</p>
        </OSWindow>,
        document.body,
    );
}

function definirViewport(ancho: number, alto: number) {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: ancho });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: alto });
}

const anchoOriginal = window.innerWidth;
const altoOriginal = window.innerHeight;

afterEach(() => {
    cleanup();
    definirViewport(anchoOriginal, altoOriginal);
});

describe("OSWindow · ventana centrada en escritorio", () => {
    beforeEach(() => definirViewport(1024, 768));

    it("abre centrada: nace con el fundido de escala de siempre y sin desfase", () => {
        render(<Ventana />);
        const dialogo = screen.getByRole("dialog");
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

describe("OSWindow · hoja en teléfono", () => {
    beforeEach(() => definirViewport(375, 667));

    it("se marca como hoja y entra desde abajo con el fundido", () => {
        render(<Ventana />);
        const dialogo = screen.getByRole("dialog");
        expect(dialogo.getAttribute("data-hoja")).toBe("true");
        const marco = dialogo.querySelector(".rounded-2xl") as HTMLElement;
        expect(marco).not.toBeNull();
        expect(marco.style.opacity).toBe("0");
        expect(marco.style.transform).toContain("translateY(24px)");
    });
});

describe("posicionInicialVentana · geometría pura", () => {
    it("en escritorio centra y no desplaza", () => {
        const p = posicionInicialVentana({ ancho: 1280, alto: 800 }, { ancho: 760, alto: 520 });
        expect(p.tipo).toBe("ventana");
        expect(p.hoja).toBe(false);
        expect(p.desplazamientoX).toBe(0);
        expect(p.desplazamientoY).toBe(0);
        expect(p.entradaDesdeAbajo).toBe(0);
    });

    it("en teléfono ancla la hoja abajo y la centra horizontalmente", () => {
        const p = posicionInicialVentana({ ancho: 375, alto: 667 }, { ancho: 343, alto: 500 });
        expect(p.tipo).toBe("hoja");
        expect(p.hoja).toBe(true);
        expect(p.desplazamientoX).toBe(0);
        // y de la hoja = 667 - 500 = 167; centro del contenedor = 83.5.
        expect(p.desplazamientoY).toBe(83.5);
        expect(p.entradaDesdeAbajo).toBe(24);
    });

    it("sin medida todavía no desplaza pero conserva el tipo de aparato", () => {
        const p = posicionInicialVentana({ ancho: 375, alto: 667 });
        expect(p.hoja).toBe(true);
        expect(p.desplazamientoX).toBe(0);
        expect(p.desplazamientoY).toBe(0);
    });

    it("un ancho de tableta sigue siendo ventana, no hoja", () => {
        const p = posicionInicialVentana({ ancho: 768, alto: 1024 }, { ancho: 600, alto: 500 });
        expect(p.tipo).toBe("ventana");
        expect(p.entradaDesdeAbajo).toBe(0);
    });
});
