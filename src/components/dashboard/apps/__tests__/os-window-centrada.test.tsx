// Rescate de la rama nube/40126871156 (tarea RLB1020N) · casos adaptados a la API de hoy.
// Main resolvió el contrato la rama por otro camino: la ventana SIEMPRE abre centrada
// (os-window.tsx:114-116); la hoja con data-hoja y el anclaje por viewport se descartan.
// Cubierto ya con otro nombre: Escape apilado (os-window-escape.test.tsx).

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import { OSWindow, arranqueOSWindow, entradaOSWindow } from "../os-window";

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

/* ── DSN1019B · Composición centrada por aparato ──
   La posición inicial sale de `arranqueOSWindow`, que léela de `geometriaVentana`
   (composicion.ts, la misma fuente que openWindow del Escritorio): centrada en
   escritorio y hoja que sube desde abajo en teléfono. */

describe("arranqueOSWindow · geometría inicial leyenda de geometriaVentana", () => {
    const escritorio = { ancho: 1280, alto: 800 };
    const telefono = { ancho: 390, alto: 844 };

    it("en escritorio abre centrada en la pantalla (tipo «ventana»)", () => {
        const a = arranqueOSWindow(escritorio);
        expect(a.modo).toBe("centrada");
        // Centrado horizontal: x es la mitad del espacio sobrante.
        expect(a.x).toBeCloseTo((escritorio.ancho - a.ancho) / 2);
        // Y el centrado vertical también cae en el punto medio.
        expect(a.y).toBeCloseTo((escritorio.alto - a.alto) / 2);
        expect(a.origen).toBe("top-left");
    });

    it("en teléfono abre como hoja: centrada horizontal y anclada abajo (tipo «hoja»)", () => {
        const a = arranqueOSWindow(telefono);
        expect(a.modo).toBe("hoja");
        // Centrada horizontal con el margen de 16 px del teléfono.
        expect(a.x).toBeCloseTo((telefono.ancho - a.ancho) / 2);
        // Anclada abajo: la hoja termina justo en el borde inferior.
        expect(a.y).toBeCloseTo(telefono.alto - a.alto);
        expect(a.y).toBeGreaterThan(0);
    });

    it("la hoja no se sale del viewport (márgenes respetados en 320 px)", () => {
        const pequeña = { ancho: 320, alto: 568 };
        const a = arranqueOSWindow(pequeña);
        expect(a.modo).toBe("hoja");
        expect(a.ancho).toBeLessThanOrEqual(pequeña.ancho);
        expect(a.alto).toBeLessThanOrEqual(pequeña.alto);
        expect(a.x).toBeGreaterThanOrEqual(0);
    });
});

describe("entradaOSWindow · entrada cardinal y movimiento reducido", () => {
    it("la hoja sube desde abajo: entrada cardinal solo con transform", () => {
        const e = entradaOSWindow("hoja", false);
        expect(e.initial.y).toBe("100%");
        expect(e.animate.y).toBe(0);
    });

    it("la hoja con movimiento reducido solo funde la opacidad", () => {
        const e = entradaOSWindow("hoja", true);
        expect(e.initial).toEqual({ opacity: 0 });
        expect(e.animate).toEqual({ opacity: 1 });
        expect(e.initial.y).toBeUndefined();
    });

    it("la ventana centrada conserva el fundido de escala de siempre", () => {
        const e = entradaOSWindow("centrada", false);
        expect(e.initial.scale).toBe(0.96);
        expect(e.initial.opacity).toBe(0);
    });

    it("la ventana centrada con movimiento reducido solo funde la opacidad", () => {
        const e = entradaOSWindow("centrada", true);
        expect(e.initial).toEqual({ opacity: 0 });
        expect(e.animate).toEqual({ opacity: 1 });
    });
});

describe("OSWindow en teléfono · hoja centrada que sube desde abajo", () => {
    afterEach(() => {
        cleanup();
        // Restaurar el viewport de jsdom para no filtrar el tamaño al resto de suites.
        window.innerWidth = 1024;
        window.innerHeight = 768;
    });

    it("en viewport de teléfono marca data-modo «hoja» y nace abajo, fuera de la pantalla", () => {
        window.innerWidth = 390;
        window.innerHeight = 844;
        render(<Ventana />);
        const dialogo = screen.getByRole("dialog");
        expect(dialogo.getAttribute("data-modo")).toBe("hoja");
        // Contenedor anclado abajo (la hoja sube desde el borde inferior).
        expect(dialogo.className).toContain("items-end");
        const marco = dialogo.querySelector(".rounded-2xl") as HTMLElement;
        expect(marco).not.toBeNull();
        // Entrada cardinal: nace desplazada una hoja entera hacia abajo.
        expect(marco.style.transform).toContain("translateY(100%)");
        // La capa de arrastre sigue naciendo sin desfase: el arrastre no cambió.
        const envoltorio = dialogo.querySelector("div.relative") as HTMLElement;
        expect(envoltorio.style.transform).toBe("translate(0px, 0px)");
    });

    it("en viewport de escritorio marca data-modo «centrada» y conserva el fundido de escala", () => {
        window.innerWidth = 1280;
        window.innerHeight = 800;
        render(<Ventana />);
        const dialogo = screen.getByRole("dialog");
        expect(dialogo.getAttribute("data-modo")).toBe("centrada");
        expect(dialogo.className).toContain("items-center");
        const marco = dialogo.querySelector(".rounded-2xl") as HTMLElement;
        expect(marco.style.opacity).toBe("0");
        expect(marco.style.transform).toContain("scale(0.96)");
    });
});
