import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Sparkles } from "lucide-react";
import { OSWindow } from "../os-window";

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));

// DSN1019B · Posición inicial de OSWindow mediante `geometriaVentana`:
// centrada en la pantalla en escritorio y, en teléfono (< 430 px), hoja pegada
// abajo que sube desde abajo (entrada cardinal, solo transform + opacity).

const dialogo = () => screen.getByRole("dialog", { name: "Prueba" });
const hoja = () => document.querySelector<HTMLElement>("[data-hoja-telefono]");

function renderVentana() {
    render(
        <OSWindow title="Prueba" icon={Sparkles} accent="#22d3ee" onClose={() => {}}>
            <p>contenido</p>
        </OSWindow>,
    );
}

function fijarViewport(ancho: number, alto: number) {
    window.innerWidth = ancho;
    window.innerHeight = alto;
    window.dispatchEvent(new Event("resize"));
}

describe("OSWindow centrada por aparato (DSN1019B)", () => {
    beforeAll(() => {
        // jsdom no implementa matchMedia: apostamos como mensaje «sin reducir».
        window.matchMedia = vi.fn().mockReturnValue({ matches: false } as MediaQueryList);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        cleanup();
    });

    it("en teléfono abre como hoja pegada abajo, centrada y con margen de 16 px", () => {
        fijarViewport(390, 844);
        renderVentana();
        const laHoja = hoja();
        expect(laHoja).not.toBeNull();
        // 390 − 2·16 px de margen = 358 px de ancho (geometriaVentana, tipo «hoja»)
        expect(laHoja!.style.width).toBe("358px");
        expect(laHoja!.style.height).toBeTruthy();
        // El contenedor ya no centra verticalmente: la hoja llega al borde inferior
        expect(dialogo().className).toContain("items-end");
    });

    it("en escritorio abre centrada en pantalla, sin modo hoja", () => {
        fijarViewport(1440, 900);
        renderVentana();
        expect(hoja()).toBeNull();
        const raiz = dialogo();
        expect(raiz.className).toContain("items-center");
        expect(raiz.className).not.toContain("items-end");
    });
});
