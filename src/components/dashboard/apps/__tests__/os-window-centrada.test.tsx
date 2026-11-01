// Rescate de la rama nube/40126871156 (tarea RLB1020N) · casos adaptados a la API de hoy.
// Main resolvió el contrato la rama por otro camino: la ventana SIEMPRE abre centrada
// (os-window.tsx:114-116); la hoja con data-hoja y el anclaje por viewport se descartan.
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

// ── Ola DSN1019B · hoja en teléfono ─────────────────────────────────
// Decisión de Alex (identidades.md §«Decisiones de Alex 2026-10-19» + adn-y-tokens §7b):
// en escritorio la ventana abre centrada; en teléfono (< 430 px, umbral de
// composicion.ts) abre como hoja centrada que sube desde abajo, posicionada por
// geometriaVentana, con entrada cardinal de 24 px (fundamentos-diseno.md §5) y
// versión de movimiento reducido (solo fundido).

/** Redefine el viewport de jsdom (innerWidth/innerHeight son getters sin setter). */
function conViewport(ancho: number, alto: number): () => void {
    const originalW = Object.getOwnPropertyDescriptor(window, "innerWidth");
    const originalH = Object.getOwnPropertyDescriptor(window, "innerHeight");
    Object.defineProperty(window, "innerWidth", { value: ancho, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: alto, configurable: true });
    return () => {
        if (originalW) Object.defineProperty(window, "innerWidth", originalW);
        if (originalH) Object.defineProperty(window, "innerHeight", originalH);
    };
}

/** Sustituye matchMedia (jsdom no lo trae) por uno que contesta sí al «reduce». */
function conMovimientoReducido(): () => void {
    const original = Object.getOwnPropertyDescriptor(window, "matchMedia");
    const medio = (query: string) => ({
        matches: query.includes("(prefers-reduced-motion: reduce)"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
    });
    Object.defineProperty(window, "matchMedia", { value: medio, configurable: true });
    return () => {
        if (original) Object.defineProperty(window, "matchMedia", original);
        else delete (window as { matchMedia?: unknown }).matchMedia;
    };
}

describe("OSWindow · hoja en teléfono (DSN1019B)", () => {
    afterEach(() => cleanup());

    it("en teléfono sitúa la hoja con geometriaVentana: centrada y anclada abajo (viewport 390×780)", () => {
        const restaurar = conViewport(390, 780);
        try {
            render(<Ventana />);
            const dialogo = screen.getByRole("dialog");
            const hoja = dialogo.querySelector(".rounded-2xl")?.parentElement as HTMLElement;
            expect(hoja).not.toBeNull();
            // composicion: margen mínimo 16 px en teléfono; hoja de 60 % del alto porque
            // jsdom mide el marco en 0 (en vivo mide el sizeClass real del llamador).
            // x = 16 + (358 − 358) / 2 = 16 · y = 780 − 468 = 312
            expect(hoja.style.left).toBe("16px");
            expect(hoja.style.top).toBe("312px");
        } finally {
            restaurar();
        }
    });

    it("la hoja entra por abajo: 24 px de recorrido (entrada cardinal) y fundido", () => {
        const restaurar = conViewport(390, 780);
        try {
            render(<Ventana />);
            const marco = screen.getByRole("dialog").querySelector(".rounded-2xl") as HTMLElement;
            expect(marco.style.opacity).toBe("0");
            expect(marco.style.transform).toContain("translateY(24px)");
        } finally {
            restaurar();
        }
    });

    it("con movimiento reducido la hoja no recorre: solo funde, sin desplazamiento", () => {
        const restaurarViewport = conViewport(390, 780);
        const restaurarMedia = conMovimientoReducido();
        try {
            render(<Ventana />);
            const marco = screen.getByRole("dialog").querySelector(".rounded-2xl") as HTMLElement;
            expect(marco.style.opacity).toBe("0");
            expect(marco.style.transform).not.toContain("translateY(24px)");
            expect(marco.style.transform).not.toContain("scale(0.96)");
        } finally {
            restaurarMedia();
            restaurarViewport();
        }
    });
});

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
