// Rescate de la rama nube/40126871156 (tarea RLB1020N) · casos adaptados a la API de hoy.
// DSN1019Bb: en escritorio la ventana sigue abriendo centrada; en teléfono se
// convierte en hoja centrada que sube desde abajo con entrada cardinal.
// Cubierto ya con otro nombre: Escape apilado (os-window-escape.test.tsx).

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import { OSWindow } from "../os-window";

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));

// Controla la versión de movimiento reducido sin depender del sistema que
// ejecuta la prueba; el resto de framer-motion sigue siendo el real.
let reducirMovimiento = false;
vi.mock("framer-motion", async (importOriginal) => {
    const actual = await importOriginal<typeof import("framer-motion")>();
    return { ...actual, useReducedMotion: () => reducirMovimiento };
});

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

// DSN1019Bb · En teléfono la ventana abre como hoja centrada que sube desde
// abajo (entrada cardinal), sin cambiar la API ni el arrastre.
describe("OSWindow · hoja en teléfono", () => {
    const anchoOriginal = window.innerWidth;
    const altoOriginal = window.innerHeight;

    afterEach(() => {
        Object.defineProperty(window, "innerWidth", { value: anchoOriginal, configurable: true, writable: true });
        Object.defineProperty(window, "innerHeight", { value: altoOriginal, configurable: true, writable: true });
        cleanup();
    });

    function conViewport(ancho: number, alto: number) {
        Object.defineProperty(window, "innerWidth", { value: ancho, configurable: true, writable: true });
        Object.defineProperty(window, "innerHeight", { value: alto, configurable: true, writable: true });
    }

    it("marca la ventana como hoja y la baja hasta el borde inferior", () => {
        conViewport(390, 844);
        render(<Ventana />);

        const dialogo = screen.getByRole("dialog");
        expect(dialogo.getAttribute("data-hoja")).toBe("true");

        // El flex centra en (844 - alto) / 2; la hoja va al fondo, así que el
        // desplazamiento es la mitad de lo que queda libre.
        const envoltorio = dialogo.querySelector("div.relative") as HTMLElement;
        const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(envoltorio.style.transform);
        expect(m).not.toBeNull();
        expect(Number(m![1])).toBeCloseTo(0);
        const altoMarco = Math.min(844 * 0.86, 760);
        expect(Number(m![2])).toBeCloseTo((844 - altoMarco) / 2);
    });

    it("entra desde abajo con la entrada cardinal (24 px) y el fundido", () => {
        conViewport(390, 844);
        render(<Ventana />);

        const marco = screen.getByRole("dialog").querySelector(".rounded-2xl") as HTMLElement;
        expect(marco.style.opacity).toBe("0");
        expect(marco.style.transform).toContain("translateY(24px)");
    });

    it("en escritorio sigue centrada y sin marca de hoja", () => {
        conViewport(1440, 900);
        render(<Ventana />);

        const dialogo = screen.getByRole("dialog");
        expect(dialogo.getAttribute("data-hoja")).toBeNull();
        const envoltorio = dialogo.querySelector("div.relative") as HTMLElement;
        expect(envoltorio.style.transform).toBe("translate(0px, 0px)");
    });

    it("con movimiento reducido solo funde: sin entrada cardinal ni escala", () => {
        conViewport(390, 844);
        reducirMovimiento = true;
        try {
            render(<Ventana />);

            const dialogo = screen.getByRole("dialog");
            const marco = dialogo.querySelector(".rounded-2xl") as HTMLElement;
            expect(marco.style.opacity).toBe("0");
            expect(marco.style.transform).not.toContain("translateY(24px)");
            expect(marco.style.transform).not.toContain("scale(0.96)");
        } finally {
            reducirMovimiento = false;
        }
    });
});
