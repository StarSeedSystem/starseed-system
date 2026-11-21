import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PanelConversacion } from "../panel-conversacion";
import type { DependenciasConversacion, EstadoConversacion, TurnoCompleto, Hablante } from "@/lib/traductor/conversacion";
import type { ParIdiomas } from "@/lib/traductor/tipos";
import type { ResultadoTraductor } from "@/lib/traductor/tipos";

const parA: ParIdiomas = { origen: "es", destino: "en" };
const parB: ParIdiomas = { origen: "en", destino: "es" };

function crearDepsMock(overrides: Partial<DependenciasConversacion> = {}): DependenciasConversacion {
    const turnosCompletos: TurnoCompleto[] = [];
    const cambiosEstado: EstadoConversacion[] = [];

    return {
        reloj: () => 1000,
        reconocimiento: {
            disponible: (idioma: string) => ({ ok: true, audioSaleDelAparato: true }),
            iniciar: vi.fn(),
            detener: vi.fn(),
        },
        traducir: vi.fn().mockResolvedValue({
            texto: "translated",
            origenDetectado: "es",
            motor: "paquete-local",
            local: true,
            ms: 100,
        } as ResultadoTraductor),
        voz: {
            disponible: (idioma: string) => ({ ok: true, motivo: undefined }),
            hablar: vi.fn().mockReturnValue({ ok: true }),
            detener: vi.fn(),
            cuandoTermine: vi.fn((cb) => cb(true)),
        },
        parIdiomas: (quien: Hablante) => (quien === "A" ? parA : parB),
        alTurnoCompleto: (turno: TurnoCompleto) => turnosCompletos.push(turno),
        alCambioEstado: (estado: EstadoConversacion) => cambiosEstado.push(estado),
        ...overrides,
    };
}

function renderPanel(deps: DependenciasConversacion) {
    return render(<PanelConversacion deps={deps} />);
}

describe("PanelConversacion", () => {
    it("muestra dos mitades con sus idiomas y botones de micrófono", () => {
        const deps = crearDepsMock();
        renderPanel(deps);

        expect(screen.getByText(/persona a/i)).toBeInTheDocument();
        expect(screen.getByText(/persona b/i)).toBeInTheDocument();
        expect(screen.getByText(/español/i)).toBeInTheDocument();
        expect(screen.getByText(/inglés/i)).toBeInTheDocument();
        expect(screen.getAllByRole("button", { name: /micrófono/i })).toHaveLength(2);
    });

    it("botón de micrófono desactivado cuando no hay reconocimiento", () => {
        const deps = crearDepsMock({
            reconocimiento: {
                disponible: () => ({ ok: false, motivo: "No hay reconocimiento", audioSaleDelAparato: false }),
                iniciar: vi.fn(),
                detener: vi.fn(),
            },
        });
        renderPanel(deps);

        const botonesMic = screen.getAllByRole("button", { name: /micrófono/i });
        botonesMic.forEach((boton) => {
            expect(boton).toBeDisabled();
        });
    });

    it("aviso fijo: traducción no simultánea y audioSaleDelAparato", () => {
        const deps = crearDepsMock();
        renderPanel(deps);

        expect(screen.getByText(/la traducción en tiempo real no es simultánea/i)).toBeInTheDocument();
        expect(screen.getByText(/el audio sale del aparato/i)).toBeInTheDocument();
    });

    it("ofrece escribir cuando no hay reconocimiento ni voz", () => {
        const deps = crearDepsMock({
            reconocimiento: {
                disponible: () => ({ ok: false, motivo: "Sin micrófono", audioSaleDelAparato: false }),
                iniciar: vi.fn(),
                detener: vi.fn(),
            },
            voz: {
                disponible: () => ({ ok: false, motivo: "Sin voz" }),
                hablar: vi.fn(),
                detener: vi.fn(),
                cuandoTermine: vi.fn(),
            },
        });
        renderPanel(deps);

        expect(screen.getByText(/escribe tu turno/i)).toBeInTheDocument();
        expect(screen.getByRole("textbox", { name: /turno persona a/i })).toBeInTheDocument();
        expect(screen.getByRole("textbox", { name: /turno persona b/i })).toBeInTheDocument();
    });

    it("mitad B girada 180° opcional", () => {
        const deps = crearDepsMock();
        render(<PanelConversacion deps={deps} girarB />);

        const mitadB = screen.getByTestId("mitad-b");
        expect(mitadB).toHaveStyle({ transform: "rotate(180deg)" });
    });
});