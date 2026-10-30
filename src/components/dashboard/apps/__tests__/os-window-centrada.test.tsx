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

// ── DSN1019B · la ventana abre centrada por aparato ──
// En escritorio sigue centrada por el flex del padre (sin anclaje).
// En teléfono abre como HOJA centrada: su posición la fija geometriaVentana
// (src/lib/design/composicion.ts) y sube desde abajo con entrada cardinal sur.
// jsdom arranca a 1024 × 768 (escritorio); cada caso fija su viewport y lo restaura.
describe("OSWindow · hoja de teléfono centrada (DSN1019B)", () => {
    afterEach(() => {
        cleanup();
        window.innerWidth = 1024;
        window.innerHeight = 768;
    });

    it("en escritorio no hay hoja: centrada por flex, sin posición absoluta", () => {
        window.innerWidth = 1280;
        window.innerHeight = 800;
        render(<Ventana />);
        const dialogo = screen.getByRole("dialog");
        expect(dialogo.getAttribute("data-hoja")).toBeNull();
        const envoltorio = dialogo.querySelector("div.relative") as HTMLElement;
        expect(envoltorio.style.position).toBe("");
        expect(envoltorio.style.left).toBe("");
        expect(envoltorio.style.transform).toBe("translate(0px, 0px)");
    });

    it("en teléfono abre como hoja: ancho con margen de 16 px y anclada abajo por geometriaVentana", () => {
        // 390 × 800 → hoja de 358 px (390 − 2·16), alto 86 % de 800 = 688, abajo del todo.
        window.innerWidth = 390;
        window.innerHeight = 800;
        render(<Ventana />);
        const dialogo = screen.getByRole("dialog");
        expect(dialogo.getAttribute("data-hoja")).toBe("true");
        const envoltorio = dialogo.querySelector("div.relative") as HTMLElement;
        expect(envoltorio.style.position).toBe("absolute");
        expect(envoltorio.style.left).toBe("16px");
        expect(envoltorio.style.top).toBe("112px"); // 800 − 688
        expect(envoltorio.style.width).toBe("358px");
        expect(envoltorio.style.height).toBe("688px");
        // La capa de arrastre nace sin desplazamiento: la geometría es la base.
        expect(envoltorio.style.transform).toBe("translate(0px, 0px)");
    });

    it("la hoja sube desde abajo: entrada cardinal sur (solo transform y opacity)", () => {
        window.innerWidth = 390;
        window.innerHeight = 800;
        render(<Ventana />);
        const marco = screen.getByRole("dialog").querySelector(".rounded-2xl") as HTMLElement;
        expect(marco.style.opacity).toBe("0");
        expect(marco.style.transform).toContain("translateY(100%)");
        // La escala del fundido de escritorio no interviene en la hoja.
        expect(marco.style.transform).not.toContain("scale");
    });

    it("cambiando a escritorio en caliente, la hoja vuelve a ventana centrada", () => {
        window.innerWidth = 390;
        window.innerHeight = 800;
        render(<Ventana />);
        expect(screen.getByRole("dialog").getAttribute("data-hoja")).toBe("true");
        window.innerWidth = 1280;
        fireEvent(window, new Event("resize"));
        const dialogo = screen.getByRole("dialog");
        expect(dialogo.getAttribute("data-hoja")).toBeNull();
        const envoltorio = dialogo.querySelector("div.relative") as HTMLElement;
        expect(envoltorio.style.position).toBe("");
        expect(envoltorio.style.transform).toBe("translate(0px, 0px)");
    });
});
