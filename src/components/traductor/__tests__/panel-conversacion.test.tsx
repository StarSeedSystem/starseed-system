import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PanelConversacion } from "../panel-conversacion";
import type { DependenciasConversacion, EstadoConversacion, TurnoCompleto, Hablante, ParIdiomas } from "@/lib/traductor/conversacion";
import type { ResultadoTraductor } from "@/lib/traductor/tipos";

const parA: ParIdiomas = { origen: "es", destino: "en" };
const parB: ParIdiomas = { origen: "en", destino: "es" };

const traduccionOk: ResultadoTraductor = {
    texto: "Hello",
    origenDetectado: "es",
    motor: "paquete-local",
    local: true,
    ms: 50,
};

function crearDepsMock(overrides: Partial<DependenciasConversacion> = {}): DependenciasConversacion {
    const turnosCompletos: TurnoCompleto[] = [];
    const cambiosEstado: EstadoConversacion[] = [];

    const iniciarMock = vi.fn();
    const detenerMock = vi.fn();
    const traducirMock = vi.fn().mockResolvedValue(traduccionOk);
    const hablarMock = vi.fn().mockReturnValue({ ok: true });
    const detenerVozMock = vi.fn();
    const cuandoTermineMock = vi.fn((cb) => cb(true));

    const baseDeps: DependenciasConversacion = {
        reloj: () => Date.now(),
        reconocimiento: {
            disponible: (idioma: string) => ({ ok: true, audioSaleDelAparato: true }),
            iniciar: iniciarMock,
            detener: detenerMock,
        },
        traducir: traducirMock,
        voz: {
            disponible: (idioma: string) => ({ ok: true, motivo: undefined }),
            hablar: hablarMock,
            detener: detenerVozMock,
            cuandoTermine: cuandoTermineMock,
        },
        parIdiomas: (quien: Hablante) => (quien === "A" ? parA : parB),
        alTurnoCompleto: (turno: TurnoCompleto) => turnosCompletos.push(turno),
        alCambioEstado: (estado: EstadoConversacion) => cambiosEstado.push(estado),
    };

    const deps = { ...baseDeps, ...overrides } as DependenciasConversacion;
    if (overrides.reconocimiento) {
        deps.reconocimiento = { ...baseDeps.reconocimiento, ...overrides.reconocimiento };
    }
    if (overrides.voz) {
        deps.voz = { ...baseDeps.voz, ...overrides.voz };
    }
    return deps;
}

describe("PanelConversacion", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("renderiza dos mitades con sus idiomas y botones de micrófono", () => {
        const deps = crearDepsMock();
        render(<PanelConversacion deps={deps} audioSaleDelAparato={true} />);

        expect(screen.getByText("Persona A")).toBeInTheDocument();
        expect(screen.getByText("Persona B")).toBeInTheDocument();
        expect(screen.getByText("es → en")).toBeInTheDocument();
        expect(screen.getByText("en → es")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /micrófono persona a/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /micrófono persona b/i })).toBeInTheDocument();
    });

    it("muestra aviso fijo de traducción no simultánea y audioSaleDelAparato", () => {
        const deps = crearDepsMock();
        render(<PanelConversacion deps={deps} audioSaleDelAparato={true} />);

        expect(screen.getByText(/la traducción en tiempo real no es simultánea/i)).toBeInTheDocument();
        expect(screen.getByText(/el audio sale del aparato/i)).toBeInTheDocument();
    });

    it("muestra aviso de audio NO sale del aparato cuando audioSaleDelAparato es false", () => {
        const deps = crearDepsMock();
        render(<PanelConversacion deps={deps} audioSaleDelAparato={false} />);

        expect(screen.getByText(/el audio no sale del aparato/i)).toBeInTheDocument();
    });

    it("no muestra micrófono cuando reconocimiento no está disponible", () => {
        const deps = crearDepsMock({
            reconocimiento: {
                disponible: () => ({ ok: false, motivo: "Sin micrófono", audioSaleDelAparato: false }),
                iniciar: vi.fn(),
                detener: vi.fn(),
            },
        });
        render(<PanelConversacion deps={deps} audioSaleDelAparato={true} />);

        expect(screen.queryByRole("button", { name: /micrófono persona a/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /micrófono persona b/i })).not.toBeInTheDocument();
        expect(screen.getAllByText(/reconocimiento no disponible/i)).toHaveLength(2);
    });

    it("ofrece escribir cuando no hay reconocimiento", () => {
        const deps = crearDepsMock({
            reconocimiento: {
                disponible: () => ({ ok: false, motivo: "Sin micrófono", audioSaleDelAparato: false }),
                iniciar: vi.fn(),
                detener: vi.fn(),
            },
        });
        render(<PanelConversacion deps={deps} audioSaleDelAparato={true} />);

        expect(screen.getByPlaceholderText(/escribe lo que dice persona a/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/escribe lo que dice persona b/i)).toBeInTheDocument();
        expect(screen.getAllByRole("button", { name: /enviar/i })).toHaveLength(2);
    });

    it("envía texto escrito cuando no hay reconocimiento", async () => {
        vi.useRealTimers();
        const traducirMock = vi.fn().mockResolvedValue(traduccionOk);
        const deps = crearDepsMock({
            reconocimiento: {
                disponible: () => ({ ok: false, motivo: "Sin micrófono", audioSaleDelAparato: false }),
                iniciar: vi.fn(),
                detener: vi.fn(),
            },
            traducir: traducirMock,
        });
        render(<PanelConversacion deps={deps} audioSaleDelAparato={true} />);

        const inputA = screen.getByPlaceholderText(/escribe lo que dice persona a/i);
        await userEvent.type(inputA, "Hola mundo");
        const botonesEnviar = screen.getAllByRole("button", { name: /enviar/i });
        await userEvent.click(botonesEnviar[0]);

        await waitFor(() => expect(traducirMock).toHaveBeenCalledWith("Hola mundo", parA), { timeout: 5000 });
        vi.useFakeTimers();
    });

    it("muestra estado inicial 'Esperando' en ambas mitades", () => {
        const deps = crearDepsMock();
        render(<PanelConversacion deps={deps} audioSaleDelAparato={true} />);

        expect(screen.getAllByText(/esperando/i)).toHaveLength(2);
    });

    it("gira la mitad B cuando mitadBGirada es true", () => {
        const deps = crearDepsMock();
        render(<PanelConversacion deps={deps} audioSaleDelAparato={true} mitadBGirada={true} />);

        const mitadB = screen.getByTestId("mitad-B");
        expect(mitadB).toHaveStyle({ transform: "rotate(180deg)" });
    });
});