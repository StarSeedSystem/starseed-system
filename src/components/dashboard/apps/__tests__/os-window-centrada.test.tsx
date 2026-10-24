import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Sparkles } from "lucide-react";
import { OSWindow, modoApertura, prefiereMovimientoReducido } from "../os-window";

// DSN1019B · la ventana del OS abre centrada por aparato: en escritorio se
// centra en la pantalla (composición centrada §7b) y en teléfono es una hoja
// centrada que sube desde abajo (entrada cardinal desde el punto Anchor); con
// movimiento reducido solo desvanece, sin transform.
function simularViewport(ancho: number, alto: number) {
    Object.defineProperty(window, "innerWidth", { value: ancho, configurable: true, writable: true });
    Object.defineProperty(window, "innerHeight", { value: alto, configurable: true, writable: true });
}

/** matchMedia del sistema fijo a «prefiere movimiento reducido» si `reducido`. */
function simularMovimientoReducido(reducido: boolean) {
    Object.defineProperty(window, "matchMedia", {
        value: (consulta: string) => ({
            matches: reducido && consulta === "(prefers-reduced-motion: reduce)",
            media: consulta,
            addEventListener() { /* sin oyentes en la prueba */ },
            removeEventListener() { /* sin oyentes en la prueba */ },
        }),
        configurable: true,
        writable: true,
    });
}

function abrir(titulo: string) {
    return render(
        <OSWindow title={titulo} icon={Sparkles} accent="#22d3ee" onClose={() => {}}>
            <p>{`contenido ${titulo}`}</p>
        </OSWindow>,
    );
}

afterEach(() => {
    cleanup();
    simularViewport(1024, 768);
});

describe("modoApertura · geometría pura (DSN1019B)", () => {
    it("en teléfono eliges hoja: la hoja ancla su borde inferior y sube desde abajo", () => {
        const modo = modoApertura({ ancho: 390, alto: 844 });
        expect(modo).toBe("hoja");
    });
    it("en escritorio eliges ventana centrada en la pantalla", () => {
        const modo = modoApertura({ ancho: 1440, alto: 900 });
        expect(modo).toBe("centrada");
    });

    it("en el borde: 429 es teléfono, 430 ya es ventana centrada", () => {
        expect(modoApertura({ ancho: 429, alto: 900 })).toBe("hoja");
        expect(modoApertura({ ancho: 430, alto: 900 })).toBe("centrada");
    });
});

describe("prefiereMovimientoReducido · preferencia del sistema", () => {
    it("si la consulta del sistema coincide, reduce el movimiento", () => {
        simularMovimientoReducido(true);
        expect(prefiereMovimientoReducido()).toBe(true);
        simularMovimientoReducido(false);
        expect(prefiereMovimientoReducido()).toBe(false);
    });

    it("sin matchMedia (entornos reducidos) no reduce de más", () => {
        Object.defineProperty(window, "matchMedia", { value: undefined, configurable: true, writable: true });
        expect(prefiereMovimientoReducido()).toBe(false);
    });
});

describe("OSWindow · apertura centrada por aparato (DSN1019B)", () => {
    it("escritorio: ventana centrada (items-center) con la entrada anterior", () => {
        simularViewport(1440, 900);
        abrir("escritorio");
        const dialogo = screen.getByRole("dialog", { name: "escritorio" });
        expect(dialogo.className).toContain("items-center");
        expect(dialogo.className).not.toContain("items-end");
        const tarjeta = dialogo.querySelector<HTMLElement>("[data-apertura='centrada']");
        expect(tarjeta).not.toBeNull();
        expect(tarjeta?.className).toContain("rounded-2xl");
        expect(tarjeta?.className).not.toContain("rounded-t-2xl");
        // La entrada anterior se mantiene: spring con escala inicial 0,96.
        expect(tarjeta?.style.transform).toContain("scale(0.96)");
    });

    it("teléfono: hoja centrada anclada abajo con entrada cardinal bajo", () => {
        simularViewport(390, 844);
        abrir("telefono");
        const dialogo = screen.getByRole("dialog", { name: "telefono" });
        expect(dialogo.className).toContain("items-end");
        expect(dialogo.className).toContain("pb-0");
        expect(dialogo.className).not.toContain("items-center");
        const tarjeta = dialogo.querySelector<HTMLElement>("[data-apertura='hoja']");
        expect(tarjeta).not.toBeNull();
        expect(tarjeta?.className).toContain("rounded-t-2xl");
        // Sube desde abajo: arranque fuera del borde inferior (entrada cardinal).
        expect(tarjeta?.style.transform).toContain("translateY(100%)");
    });

    it("teléfono con movimiento reducido: solo desvanece, sin transform", () => {
        simularViewport(390, 844);
        simularMovimientoReducido(true);
        abrir("reducido");
        const dialogo = screen.getByRole("dialog", { name: "reducido" });
        expect(dialogo.className).toContain("items-end");
        const tarjeta = dialogo.querySelector<HTMLElement>("[data-apertura='hoja']");
        expect(tarjeta?.style.transform).not.toContain("translateY");
    });

    it("centrada con movimiento reducido: solo desvanece, sin escala", () => {
        simularViewport(1440, 900);
        simularMovimientoReducido(true);
        abrir("reducida");
        const dialogo = screen.getByRole("dialog", { name: "reducida" });
        const tarjeta = dialogo.querySelector<HTMLElement>("[data-apertura='centrada']");
        expect(tarjeta?.style.transform).not.toContain("scale");
        expect(tarjeta?.style.opacity).toBe("0");
    });
});
