import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SelectorPar, SelectorParProps, Par, intercambiarPar } from "../selector-par";
import type { EstadoPar } from "@/lib/traductor/tipos";

function TestComponent(props: Partial<SelectorParProps>) {
    const defaultProps: SelectorParProps = {
        idiomas: [
            { codigo: "es", nombre: "Español" },
            { codigo: "en", nombre: "English" },
            { codigo: "fr", nombre: "Français" },
            { codigo: "de", nombre: "Deutsch" },
        ],
        par: { origen: "es", destino: "en" },
        onCambiar: vi.fn(),
        estadoDePar: vi.fn().mockReturnValue("solo-internet"),
    };
    return render(<SelectorPar {...defaultProps} {...props} />);
}

describe("intercambiarPar", () => {
    it("debe intercambiar idiomas cuando el origen no es detectar", () => {
        const par: Par = { origen: "es", destino: "en" };
        const esperado: Par = { origen: "en", destino: "es" };
        expect(intercambiarPar(par)).toEqual(esperado);
    });

    it("no debe intercambiar si el origen es detectar", () => {
        const par: Par = { origen: "detectar", destino: "en" };
        expect(intercambiarPar(par)).toEqual(par);
    });

    it("debe funcionar con otros pares de idiomas", () => {
        const par: Par = { origen: "fr", destino: "pt" };
        const esperado: Par = { origen: "pt", destino: "fr" };
        expect(intercambiarPar(par)).toEqual(esperado);
    });

    it("debe mantener inmutabilidad (no mutar el original)", () => {
        const par: Par = { origen: "es", destino: "en" };
        const original = { ...par };
        intercambiarPar(par);
        expect(par).toEqual(original);
    });
});

describe("tipo EstadoPar (de tipos.ts)", () => {
    it("debe aceptar los tres valores válidos", () => {
        const estados: EstadoPar[] = ["sin-internet", "descarga", "solo-internet"];
        expect(estados).toHaveLength(3);
    });
});

describe("selector-par: estado del botón de intercambio", () => {
    it("el botón de intercambio está deshabilitado cuando el origen es 'detectar'", () => {
        const estadoMock = vi.fn().mockReturnValue("solo-internet");
        const result = TestComponent({
            par: { origen: "detectar", destino: "en" },
            estadoDePar: estadoMock,
        });

        const boton = result.container.querySelector('[data-testid="boton-intercambiar"]');
        expect(boton).toBeDisabled();
        expect(boton).toHaveAttribute("aria-disabled", "true");
    });

    it("el botón de intercambio está habilitado cuando el origen no es 'detectar'", () => {
        const estadoMock = vi.fn().mockReturnValue("descarga");
        const result = TestComponent({
            par: { origen: "es", destino: "en" },
            estadoDePar: estadoMock,
        });

        const boton = result.container.querySelector('[data-testid="boton-intercambiar"]');
        expect(boton).not.toBeDisabled();
        expect(boton).not.toHaveAttribute("aria-disabled", "true");
    });
});

describe("selector-par: insignias de estado por idioma", () => {
    it("muestra 'Sin internet' para idioma con estado 'sin-internet' cuando se abre el desplegable de destino", () => {
        const estadoMock = vi.fn().mockImplementation((codigo: string): EstadoPar => {
            if (codigo === "en") return "sin-internet";
            return "solo-internet";
        });

        const par: Par = { origen: "es", destino: "en" };
        const result = TestComponent({ par, estadoDePar: estadoMock });

        // Abrir el desplegable de destino
        const botonDestino = result.container.querySelector('[id$="-destino"]');
        expect(botonDestino).not.toBeNull();
        fireEvent.click(botonDestino!);

        const insignia = result.getByText("Sin internet");
        expect(insignia).toBeInTheDocument();
    });

    it("muestra 'Con descarga' para idioma con estado 'descarga' cuando se abre el desplegable de destino", () => {
        const estadoMock = vi.fn().mockImplementation((codigo: string): EstadoPar => {
            if (codigo === "en") return "descarga";
            return "solo-internet";
        });

        const par: Par = { origen: "es", destino: "en" };
        const result = TestComponent({ par, estadoDePar: estadoMock });

        const botonDestino = result.container.querySelector('[id$="-destino"]');
        fireEvent.click(botonDestino!);

        const insignia = result.getByText("Con descarga");
        expect(insignia).toBeInTheDocument();
    });

    it("muestra 'Solo con internet' para idioma con estado 'solo-internet' cuando se abre el desplegable de destino", () => {
        const estadoMock = vi.fn().mockImplementation((codigo: string): EstadoPar => {
            return "solo-internet";
        });

        const par: Par = { origen: "es", destino: "en" };
        const result = TestComponent({ par, estadoDePar: estadoMock });

        const botonDestino = result.container.querySelector('[id$="-destino"]');
        fireEvent.click(botonDestino!);

        const insignia = result.getByText("Solo con internet");
        expect(insignia).toBeInTheDocument();
    });
});