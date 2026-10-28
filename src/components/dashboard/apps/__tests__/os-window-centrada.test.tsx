// Rescate de la rama nube/40126871156 (tarea RLB1020N) · casos adaptados a la API de hoy.
// Main resolvió el contrato la rama por otro camino: la ventana SIEMPRE abre centrada
// (os-window.tsx:114-116); la hoja con data-hoja y el anclaje por viewport se descartan.
// Cubierto ya con otro nombre: Escape apilado (os-window-escape.test.tsx).

import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
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

// ════════════════════════════════════════════════════════════════════
// DSN1019B · Composición centrada por aparato (decisión de Alex 2026-10-19,
// adn-y-tokens §7b y §5): la ventana nace centrada según `geometriaVentana`;
// en teléfono lo hace como hoja a la parte inferior que sube desde abajo
// con entrada cardinal. En escritorio no cambia el contrato de arriba.
// ════════════════════════════════════════════════════════════════════

describe("OSWindow · geometría de entrada por viewport (DSN1019B)", () => {
    const original = { ancho: 0, alto: 0 };
    const originalMatchMedia = window.matchMedia;

    beforeAll(() => {
        original.ancho = window.innerWidth;
        original.alto = window.innerHeight;
    });

    /** Fija viewport y medida del marco; en jsdom la medida hay que dársela. */
    function aparato(opts: { ancho: number; alto: number; rect?: { ancho: number; alto: number }; reducir?: boolean }) {
        Object.defineProperty(window, "innerWidth", { configurable: true, value: opts.ancho });
        Object.defineProperty(window, "innerHeight", { configurable: true, value: opts.alto });
        if (opts.rect) {
            vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
                width: opts.rect.ancho,
                height: opts.rect.alto,
            } as DOMRect);
        }
        if (opts.reducir) {
            Object.defineProperty(window, "matchMedia", {
                configurable: true,
                value: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
            });
        }
    }

    afterEach(() => {
        Object.defineProperty(window, "innerWidth", { configurable: true, value: original.ancho });
        Object.defineProperty(window, "innerHeight", { configurable: true, value: original.alto });
        Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
        vi.restoreAllMocks();
        cleanup();
    });

    it("escritorio 1920×1080: nace centrada por geometriaVentana, sin hoja", () => {
        aparato({ ancho: 1920, alto: 1080, rect: { ancho: 1100, alto: 700 } });
        render(<Ventana />);
        const dialogo = screen.getByRole("dialog");
        const envoltorio = dialogo.querySelector("div.relative") as HTMLElement;
        expect(envoltorio.getAttribute("data-hoja")).toBeNull();
        expect(envoltorio.style.position).toBe("absolute");
        expect(envoltorio.style.left).toBe("410px"); // (1920 − 1100) / 2
        expect(envoltorio.style.top).toBe("190px"); // (1080 − 700) / 2
        const marco = dialogo.querySelector(".rounded-2xl") as HTMLElement;
        expect(marco.style.transform).toContain("scale(0.96)");
    });

    it("escritorio sin medida del marco: queda el centrado flex de siempre", () => {
        aparato({ ancho: 1920, alto: 1080, rect: { ancho: 0, alto: 0 } });
        render(<Ventana />);
        const envoltorio = screen.getByRole("dialog").querySelector("div.relative") as HTMLElement;
        expect(envoltorio.style.position).not.toBe("absolute");
        expect(envoltorio.style.left).toBe("");
    });

    it("teléfono 390×844: hoja centrada anclada abajo, con entrada cardinal desde abajo", () => {
        aparato({ ancho: 390, alto: 844, rect: { ancho: 358, alto: 506 } });
        render(<Ventana />);
        const dialogo = screen.getByRole("dialog");
        const envoltorio = dialogo.querySelector("div.relative") as HTMLElement;
        expect(envoltorio.getAttribute("data-hoja")).toBe("true");
        expect(envoltorio.style.position).toBe("absolute");
        expect(envoltorio.style.left).toBe("16px"); // margen mínimo del aparato
        expect(envoltorio.style.top).toBe("338px"); // 844 − 506, la hoja nace en el fondo
        expect(envoltorio.style.width).toBe("358px"); // ancho útil con margen de 16 px
        const marco = dialogo.querySelector(".rounded-2xl") as HTMLElement;
        expect(marco.style.transform).toContain("translateY(100%)"); // sube desde el borde sur
        expect(marco.style.opacity).toBe("0");
    });

    it("teléfono con movimiento reducido: la hoja nace en su sitio, sin recorrido", () => {
        aparato({ ancho: 390, alto: 844, rect: { ancho: 358, alto: 506 }, reducir: true });
        render(<Ventana />);
        const marco = screen.getByRole("dialog").querySelector(".rounded-2xl") as HTMLElement;
        expect(marco.style.opacity).toBe("1");
        expect(marco.style.transform.includes("translateY(100%)")).toBe(false);
    });
});
