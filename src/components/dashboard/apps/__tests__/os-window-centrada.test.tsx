import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Sparkles } from "lucide-react";
import { OSWindow, desvioGeometrico } from "../os-window";

// Sin red; solo geometría pura y render en jsdom.
function definirViewport(ancho: number, alto: number) {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: ancho });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: alto });
}

function espiarRect(left: number, top: number, width: number, height: number) {
    const rect: DOMRect = {
        x: left, y: top, left, top, width, height,
        right: left + width, bottom: top + height,
        toJSON: () => ({}),
    } as DOMRect;
    return vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(rect);
}

describe("desvioGeometrico (función pura)", () => {
    it("centra una ventana en escritorio: desvío nulo si el flex ya la centró", () => {
        const desvio = desvioGeometrico(
            { ancho: 1280, alto: 800 },
            { left: 140, top: 50, width: 1000, height: 700 },
        );
        expect(desvio.dx).toBeCloseTo(0);
        expect(desvio.dy).toBeCloseTo(0);
    });

    it("corre la ventana al centro exacto si el flex la dejó desviada", () => {
        const desvio = desvioGeometrico(
            { ancho: 1280, alto: 800 },
            { left: 60, top: 10, width: 1000, height: 700 },
        );
        expect(desvio.dx).toBe(80);
        expect(desvio.dy).toBe(40);
    });

    it("en teléfono ajusta la hoja hasta el borde inferior (entrada cardinal sur)", () => {
        const desvio = desvioGeometrico(
            { ancho: 400, alto: 800 },
            { left: 15, top: 55, width: 370, height: 690 },
        );
        expect(desvio.dx).toBeCloseTo(1);
        expect(desvio.dy).toBe(55);
        // bottom de la hoja: top medido + desvío + alto = alto del viewport
        expect(55 + desvio.dy + 690).toBe(800);
    });
});

describe("OSWindow — posición inicial centrada", () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        definirViewport(1024, 768);
    });

    it("en escritorio abre centrada según geometriaVentana y sin animación cardinal", async () => {
        definirViewport(1280, 800);
        espiarRect(60, 10, 1000, 700);
        render(
            <OSWindow title="Centro" icon={Sparkles} accent="#007FFF" onClose={() => {}}>
                contenido
            </OSWindow>,
        );
        const marco = screen.getByRole("dialog").querySelector("[data-modo]");
        expect(marco).toBeTruthy();
        await waitFor(() => expect(marco?.getAttribute("style") ?? "").toContain("translate(80px, 40px)"));
        expect(marco?.getAttribute("data-modo")).toBe("centro");
    });

    it("en teléfono es hoja centrada que sube desde abajo", async () => {
        definirViewport(400, 800);
        espiarRect(15, 55, 370, 690);
        render(
            <OSWindow title="Hoja" icon={Sparkles} accent="#007FFF" onClose={() => {}}>
                contenido
            </OSWindow>,
        );
        const marco = screen.getByRole("dialog").querySelector("[data-modo]");
        await waitFor(() => expect(marco?.getAttribute("data-modo")).toBe("hoja"));
        await waitFor(() => expect(marco?.getAttribute("style") ?? "").toContain("translate(1px, 55px)"));
    });

    it("con movimiento reducido la hoja entra sin desplazamiento cardinal", async () => {
        definirViewport(400, 800);
        espiarRect(15, 55, 370, 690);
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            value: (consulta: string) => ({ matches: consulta.includes("reduce") }),
        });
        render(
            <OSWindow title="Hoja" icon={Sparkles} accent="#007FFF" onClose={() => {}}>
                contenido
            </OSWindow>,
        );
        const marco = screen.getByRole("dialog").querySelector("[data-modo]");
        await waitFor(() => expect(marco?.getAttribute("data-modo")).toBe("hoja-reducido"));
    });
});
