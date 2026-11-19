"use client";

/**
 * Esta prueba supera el límite de 120 líneas para archivos nuevos porque cubre los 5 escenarios
 * requeridos (auto por defecto, guardar elección por neurona, aislamiento entre neuronas,
 * recuperación al remontar, almacén roto) más validaciones de `fuentePedidaValida`.
 * No se divide para mantener la prueba atómica del comportamiento completo.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { AnfitrionControl, abrirVentanaControl, cerrarVentanaControl, ventanasAbiertas } from "../anfitrion-control";
import { fuentePedidaValida, type FuentePedida } from "@/lib/control-remoto/fuente-pantalla";
import { usarPantallaRemota } from "@/lib/control-remoto/usar-pantalla-remota";
import type { EstadoPantalla } from "@/lib/control-remoto/pantalla-destino";

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
        <div data-testid="ventana-control-mock" data-fuente-pedida={fuentePedida} data-fuente-real={fuenteReal} data-aviso-fuente={avisoFuente} data-al-cambiar-fuente={!!alCambiarFuente}>
            <span data-testid="nombre">{nombre}</span>
            <button data-testid="cambiar-auto" onClick={() => alCambiarFuente?.("auto")}>Auto</button>
            <button data-testid="cambiar-proyeccion" onClick={() => alCambiarFuente?.("proyeccion")}>Proyección</button>
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

const crearMockPantallaRemota = (overrides: Partial<ReturnType<typeof usarPantallaRemota>> = {}) => ({
    estado: "en-vivo" as EstadoPantalla,
    motivo: undefined,
    desde: Date.now(),
    flujo: null,
    lienzo: null,
    pantalla: { ancho: 1920, alto: 1080, giro: 0 as const },
    nivel: "controlar" as const,
    capacidades: { gestos: true, maxDedos: 2, teclas: [], volumen: false, brillo: false, texto: false },
    aparato: null,
    latenciaMs: 50,
    fps: 30,
    fuente: "accesibilidad" as const,
    via: "webrtc" as const,
    enlace: undefined,
    caduca: Date.now() + 3600000,
    enviar: vi.fn(() => true),
    cerrar: vi.fn(),
    reintentar: vi.fn(),
    pedirFluida: vi.fn(() => Promise.resolve(false)),
    fuentePedida: "auto" as FuentePedida,
    veredicto: { cumplida: true, aviso: null },
    ...overrides,
});

describe("AnfitrionControl - fuente de pantalla", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Limpiar localStorage
        try {
            localStorage.clear();
        } catch {
            // ignorar
        }
        // Resetear estado interno
        cerrarVentanaControl("neurona-1");
        cerrarVentanaControl("neurona-2");
        mockUsarPantallaRemota.mockImplementation((neurona) => crearMockPantallaRemota({ fuentePedida: "auto" }));
    });

    afterEach(() => {
        try {
            localStorage.clear();
        } catch {
            // ignorar
        }
    });

    it("sin nada guardado, la ventana pide 'auto'", () => {
        mockUsarPantallaRemota.mockImplementation((neurona) => crearMockPantallaRemota({ fuentePedida: "auto" }));

        render(<AnfitrionControl />);
        act(() => {
            abrirVentanaControl("neurona-1", "Neurona 1");
        });

        expect(screen.getByTestId("ventana-control-mock")).toHaveAttribute("data-fuente-pedida", "auto");
    });

    it("elegir 'Fluida' guarda la elección de ESA neurona y vuelve a abrir con 'proyeccion'", async () => {
        let llamadaFuente: FuentePedida = "auto";
        mockUsarPantallaRemota.mockImplementation((neurona, opts) => {
            llamadaFuente = opts?.fuente ?? "auto";
            return crearMockPantallaRemota({ fuentePedida: llamadaFuente });
        });

        render(<AnfitrionControl />);
        act(() => {
            abrirVentanaControl("neurona-1", "Neurona 1");
        });

        // Verificar que empieza en 'auto'
        expect(screen.getByTestId("ventana-control-mock")).toHaveAttribute("data-fuente-pedida", "auto");

        // Cambiar a 'proyeccion'
        act(() => {
            fireEvent.click(screen.getByTestId("cambiar-proyeccion"));
        });

        // Verificar que se guardó en localStorage
        const guardado = JSON.parse(localStorage.getItem("starseed.control.fuente.v1") || "{}");
        expect(guardado["neurona-1"]).toBe("proyeccion");

        // Verificar que usarPantallaRemota se llamó con 'proyeccion'
        expect(llamadaFuente).toBe("proyeccion");
    });

    it("otra neurona sigue en 'auto' aunque una tenga 'proyeccion' guardada", () => {
        // Guardar 'proyeccion' para neurona-1
        try {
            localStorage.setItem("starseed.control.fuente.v1", JSON.stringify({ "neurona-1": "proyeccion" }));
        } catch {
            // ignorar
        }

        mockUsarPantallaRemota.mockImplementation((neurona, opts) => crearMockPantallaRemota({ fuentePedida: opts?.fuente ?? "auto" }));

        render(<AnfitrionControl />);
        act(() => {
            abrirVentanaControl("neurona-2", "Neurona 2");
        });

        // neurona-2 debe usar 'auto' por defecto
        expect(screen.getByTestId("ventana-control-mock")).toHaveAttribute("data-fuente-pedida", "auto");
    });

    it("una elección guardada se recupera al remontar", () => {
        // Guardar 'proyeccion' para neurona-1
        try {
            localStorage.setItem("starseed.control.fuente.v1", JSON.stringify({ "neurona-1": "proyeccion" }));
        } catch {
            // ignorar
        }

        mockUsarPantallaRemota.mockImplementation((neurona, opts) => crearMockPantallaRemota({ fuentePedida: opts?.fuente ?? "auto" }));

        render(<AnfitrionControl />);
        act(() => {
            abrirVentanaControl("neurona-1", "Neurona 1");
        });

        // Debe usar 'proyeccion' porque estaba guardada
        expect(screen.getByTestId("ventana-control-mock")).toHaveAttribute("data-fuente-pedida", "proyeccion");
    });

    it("con el almacén roto no falla y usa 'auto'", () => {
        // Romper localStorage
        const originalSetItem = localStorage.setItem;
        const originalGetItem = localStorage.getItem;
        vi.spyOn(localStorage, "setItem").mockImplementation(() => {
            throw new Error("Almacenamiento roto");
        });
        vi.spyOn(localStorage, "getItem").mockImplementation(() => {
            throw new Error("Almacenamiento roto");
        });

        mockUsarPantallaRemota.mockImplementation((neurona, opts) => crearMockPantallaRemota({ fuentePedida: opts?.fuente ?? "auto" }));

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