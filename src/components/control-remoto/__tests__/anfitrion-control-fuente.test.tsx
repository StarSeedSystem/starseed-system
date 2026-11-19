/**
 * RST1116A · pruebas del anfitrión de control: la fuente elegida se pide y se acuerda por neurona.
 * Cubre: auto por defecto, guardar elección por neurona, aislamiento entre neuronas,
 * recuperación al remontar, almacén roto, y validaciones de `fuentePedidaValida`.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AnfitrionControl, abrirVentanaControl, cerrarVentanaControl } from "../anfitrion-control";
import { fuentePedidaValida, type FuentePedida } from "@/lib/control-remoto/fuente-pantalla";
import { usarPantallaRemota } from "@/lib/control-remoto/usar-pantalla-remota";
import type { PantallaRemota } from "@/lib/control-remoto/usar-pantalla-remota";

// Mock usarPantallaRemota
vi.mock("@/lib/control-remoto/usar-pantalla-remota", () => ({
    usarPantallaRemota: vi.fn(),
}));

// Mock usarColoresControl
vi.mock("../usar-colores-control", () => ({
    usarColoresControl: vi.fn(() => ({ otro: "#ffffff", mio: "#ffffff" })),
}));

// Mock VentanaControl
vi.mock("../ventana-control/ventana-control", () => ({
    VentanaControl: vi.fn(({ nombre, fuentePedida, fuenteReal, avisoFuente, alCambiarFuente, ...props }) => (
        <div
            data-testid="ventana-control-mock"
            data-fuente-pedida={fuentePedida}
            data-fuente-real={fuenteReal}
            data-aviso-fuente={avisoFuente}
            data-al-cambiar-fuente={!!alCambiarFuente}
        >
            <span data-testid="nombre">{nombre}</span>
            <button data-testid="cambiar-auto" onClick={() => alCambiarFuente?.("auto")}>
                Auto
            </button>
            <button data-testid="cambiar-proyeccion" onClick={() => alCambiarFuente?.("proyeccion")}>
                Proyección
            </button>
        </div>
    )),
}));

// Mock AvisoPeticionControl
vi.mock("../aviso-peticion-control", () => ({
    AvisoPeticionControl: () => <div data-testid="aviso-peticion" />,
}));

// Mock MedioControl
vi.mock("../ventana-control/medio", () => ({
    MedioControl: () => <div data-testid="medio-control" />,
}));

const mockUsarPantallaRemota = vi.mocked(usarPantallaRemota);

const crearMockPantallaRemota = (overrides: Partial<PantallaRemota> = {}): PantallaRemota => ({
    estado: "en-vivo",
    motivo: undefined,
    desde: Date.now(),
    flujo: null,
    lienzo: null,
    pantalla: { ancho: 1920, alto: 1080, giro: 0 },
    nivel: "controlar",
    capacidades: { gestos: true, maxDedos: 2, teclas: [], volumen: false, brillo: false, texto: false },
    aparato: null,
    latenciaMs: 50,
    fps: 30,
    fuente: "accesibilidad",
    via: "webrtc",
    enlace: undefined,
    caduca: Date.now() + 3600000,
    enviar: vi.fn(() => true),
    cerrar: vi.fn(),
    reintentar: vi.fn(),
    pedirFluida: vi.fn(() => Promise.resolve(false)),
    fuentePedida: "auto",
    veredicto: { cumplida: true, aviso: null },
    ...overrides,
});

describe("AnfitrionControl - fuente de pantalla", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        try {
            localStorage.clear();
        } catch {
            // ignorar
        }
        cerrarVentanaControl("neurona-1");
        cerrarVentanaControl("neurona-2");
        mockUsarPantallaRemota.mockImplementation((neurona: string | null, _opciones?: { fuente?: FuentePedida }) =>
            crearMockPantallaRemota({ fuentePedida: "auto" })
        );
    });

    afterEach(() => {
        try {
            localStorage.clear();
        } catch {
            // ignorar
        }
    });

    it("sin nada guardado, la ventana pide 'auto'", () => {
        mockUsarPantallaRemota.mockImplementation((neurona: string | null, _opciones?: { fuente?: FuentePedida }) =>
            crearMockPantallaRemota({ fuentePedida: "auto" })
        );

        render(<AnfitrionControl />);
        act(() => {
            abrirVentanaControl("neurona-1", "Neurona 1");
        });

        expect(screen.getByTestId("ventana-control-mock")).toHaveAttribute("data-fuente-pedida", "auto");
    });

    it("elegir 'Fluida' guarda la elección de ESA neurona y vuelve a abrir con 'proyeccion'", async () => {
        let llamadaFuente: FuentePedida = "auto";
        mockUsarPantallaRemota.mockImplementation(
            (neurona: string | null, opciones?: { fuente?: FuentePedida }) => {
                llamadaFuente = opciones?.fuente ?? "auto";
                return crearMockPantallaRemota({ fuentePedida: llamadaFuente });
            }
        );

        render(<AnfitrionControl />);
        act(() => {
            abrirVentanaControl("neurona-1", "Neurona 1");
        });

        expect(screen.getByTestId("ventana-control-mock")).toHaveAttribute("data-fuente-pedida", "auto");

        act(() => {
            fireEvent.click(screen.getByTestId("cambiar-proyeccion"));
        });

        const guardado = JSON.parse(localStorage.getItem("starseed.control.fuente.v1") || "{}");
        expect(guardado["neurona-1"]).toBe("proyeccion");

        expect(llamadaFuente).toBe("proyeccion");
    });

    it("otra neurona sigue en 'auto' aunque una tenga 'proyeccion' guardada", () => {
        try {
            localStorage.setItem("starseed.control.fuente.v1", JSON.stringify({ "neurona-1": "proyeccion" }));
        } catch {
            // ignorar
        }

        mockUsarPantallaRemota.mockImplementation(
            (neurona: string | null, opciones?: { fuente?: FuentePedida }) =>
                crearMockPantallaRemota({ fuentePedida: opciones?.fuente ?? "auto" })
        );

        render(<AnfitrionControl />);
        act(() => {
            abrirVentanaControl("neurona-2", "Neurona 2");
        });

        expect(screen.getByTestId("ventana-control-mock")).toHaveAttribute("data-fuente-pedida", "auto");
    });

    it("una elección guardada se recupera al remontar", () => {
        try {
            localStorage.setItem("starseed.control.fuente.v1", JSON.stringify({ "neurona-1": "proyeccion" }));
        } catch {
            // ignorar
        }

        mockUsarPantallaRemota.mockImplementation(
            (neurona: string | null, opciones?: { fuente?: FuentePedida }) =>
                crearMockPantallaRemota({ fuentePedida: opciones?.fuente ?? "auto" })
        );

        render(<AnfitrionControl />);
        act(() => {
            abrirVentanaControl("neurona-1", "Neurona 1");
        });

        expect(screen.getByTestId("ventana-control-mock")).toHaveAttribute("data-fuente-pedida", "proyeccion");
    });

    it("con el almacén roto no falla y usa 'auto'", () => {
        vi.spyOn(localStorage, "setItem").mockImplementation(() => {
            throw new Error("Almacenamiento roto");
        });
        vi.spyOn(localStorage, "getItem").mockImplementation(() => {
            throw new Error("Almacenamiento roto");
        });

        mockUsarPantallaRemota.mockImplementation(
            (neurona: string | null, opciones?: { fuente?: FuentePedida }) =>
                crearMockPantallaRemota({ fuentePedida: opciones?.fuente ?? "auto" })
        );

        expect(() => {
            render(<AnfitrionControl />);
            act(() => {
                abrirVentanaControl("neurona-1", "Neurona 1");
            });
        }).not.toThrow();

        expect(screen.getByTestId("ventana-control-mock")).toHaveAttribute("data-fuente-pedida", "auto");

        vi.restoreAllMocks();
    });
});

describe("fuentePedidaValida", () => {
    it("devuelve 'proyeccion' para 'proyeccion'", () => {
        expect(fuentePedidaValida("proyeccion")).toBe("proyeccion");
    });

    it("devuelve 'auto' para 'auto'", () => {
        expect(fuentePedidaValida("auto")).toBe("auto");
    });

    it("devuelve 'auto' para valores inválidos", () => {
        expect(fuentePedidaValida("invalido")).toBe("auto");
        expect(fuentePedidaValida(null)).toBe("auto");
        expect(fuentePedidaValida(undefined)).toBe("auto");
        expect(fuentePedidaValida(123)).toBe("auto");
        expect(fuentePedidaValida({})).toBe("auto");
    });
});