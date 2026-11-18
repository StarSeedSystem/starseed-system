/**
 * RST1116A · el gancho de la pantalla remota acepta la fuente pedida y la cambia sin perder la sesión sin avisar.
 * Pruebas con `crearPantallaDestino` simulado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { FuentePedida, FuenteReal, VeredictoFuente } from "../fuente-pantalla";
import type { InstantaneaPantalla, PantallaDestino } from "../pantalla-destino";

// Mock de crearPantallaDestino usando vi.hoisted
const { mockCrearPantallaDestino } = vi.hoisted(() => ({
    mockCrearPantallaDestino: vi.fn(),
}));

vi.mock("../pantalla-destino", () => ({
    crearPantallaDestino: mockCrearPantallaDestino,
}));

import { usarPantallaRemota } from "../usar-pantalla-remota";

let destinosCreados: Array<PantallaDestino & {
    instantaneaMock: InstantaneaPantalla;
    cerrarMock: ReturnType<typeof vi.fn>;
    iniciarMock: ReturnType<typeof vi.fn>;
    suscribirMock: ReturnType<typeof vi.fn>;
    enviarMock: ReturnType<typeof vi.fn>;
    pedirFluidaMock: ReturnType<typeof vi.fn>;
}> = [];

function crearDestinoMock(fuenteReal: FuenteReal | undefined = "accesibilidad") {
    const instantaneaMock: InstantaneaPantalla = {
        estado: "en-vivo",
        motivo: undefined,
        desde: 1,
        flujo: null,
        pantalla: { ancho: 800, alto: 1280, giro: 0 },
        nivel: "controlar",
        capacidades: { gestos: true, maxDedos: 10, teclas: ["atras", "inicio"], volumen: true, brillo: true, texto: true },
        aparato: { brillo: 0.5 },
        fuente: fuenteReal,
        latenciaMs: 50,
        fps: 30,
    };

    const cerrarMock = vi.fn().mockResolvedValue(undefined);
    const iniciarMock = vi.fn().mockResolvedValue(undefined);
    const suscribirMock = vi.fn((cb: () => void) => {
        // Notify immediately so useSyncExternalStore picks up the snapshot
        setTimeout(cb, 0);
        return () => {};
    });
    const enviarMock = vi.fn().mockReturnValue(true);
    const pedirFluidaMock = vi.fn().mockResolvedValue(false);

    const destino = {
        instantanea: () => instantaneaMock,
        suscribir: suscribirMock,
        cerrar: cerrarMock,
        iniciar: iniciarMock,
        enviar: enviarMock,
        pedirFluida: pedirFluidaMock,
        instantaneaMock,
        cerrarMock,
        iniciarMock,
        suscribirMock,
        enviarMock,
        pedirFluidaMock,
    } as unknown as PantallaDestino & {
        instantaneaMock: InstantaneaPantalla;
        cerrarMock: ReturnType<typeof vi.fn>;
        iniciarMock: ReturnType<typeof vi.fn>;
        suscribirMock: ReturnType<typeof vi.fn>;
        enviarMock: ReturnType<typeof vi.fn>;
        pedirFluidaMock: ReturnType<typeof vi.fn>;
    };

    return destino;
}

beforeEach(() => {
    destinosCreados = [];
    mockCrearPantallaDestino.mockImplementation((_neurona: string, _opciones?: { fuente?: FuentePedida }) => {
        const destino = crearDestinoMock("accesibilidad");
        destinosCreados.push(destino);
        return destino;
    });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe("RST1116A · usarPantallaRemota con fuente pedida", () => {
    it("abre con la fuente pedida (auto por defecto)", async () => {
        const opciones = { fuente: "auto" as FuentePedida };
        const { result } = renderHook(() => usarPantallaRemota("tableta", opciones));
        await waitFor(() => expect(result.current.estado).toBe("en-vivo"), { timeout: 5000 });
        expect(mockCrearPantallaDestino).toHaveBeenCalledWith("tableta", opciones);
    });

    it("abre con la fuente pedida (proyeccion)", async () => {
        const opciones = { fuente: "proyeccion" as FuentePedida };
        const { result } = renderHook(() => usarPantallaRemota("tableta", opciones));
        await waitFor(() => expect(result.current.estado).toBe("en-vivo"), { timeout: 5000 });
        expect(mockCrearPantallaDestino).toHaveBeenCalledWith("tableta", opciones);
    });

    it("cambiar de auto a proyeccion cierra la anterior y abre otra con proyeccion", async () => {
        let opciones = { fuente: "auto" as FuentePedida };
        const { result, rerender } = renderHook(
            ({ opts }) => usarPantallaRemota("tableta", opts),
            { initialProps: { opts: opciones } }
        );
        await waitFor(() => expect(result.current.estado).toBe("en-vivo"), { timeout: 5000 });
        const primera = destinosCreados[0];
        expect(primera.iniciarMock).toHaveBeenCalled();

        opciones = { fuente: "proyeccion" as FuentePedida };
        rerender({ opts: opciones });
        await waitFor(() => expect(destinosCreados.length).toBe(2), { timeout: 5000 });
        expect(primera.cerrarMock).toHaveBeenCalled();
        const segunda = destinosCreados[1];
        expect(segunda.iniciarMock).toHaveBeenCalled();
        expect(mockCrearPantallaDestino).toHaveBeenLastCalledWith("tableta", opciones);
    });

    it("si la instantánea dice accesibilidad tras pedir proyeccion, el veredicto trae el aviso", async () => {
        const destinoConAccesibilidad = crearDestinoMock("accesibilidad");
        mockCrearPantallaDestino.mockImplementationOnce(() => destinoConAccesibilidad);
        const opciones = { fuente: "proyeccion" as FuentePedida };

        const { result } = renderHook(() => usarPantallaRemota("tableta", opciones));
        await waitFor(() => expect(result.current.estado).toBe("en-vivo"), { timeout: 5000 });

        const veredicto = result.current.veredicto as VeredictoFuente;
        expect(veredicto.cumplida).toBe(false);
        expect(veredicto.aviso).toContain("Pediste la pantalla fluida");
        expect(veredicto.aviso).toContain("accesibilidad");
    });

    it("si la instantánea dice proyeccion tras pedir proyeccion, el veredicto es cumplida sin aviso", async () => {
        const destinoConProyeccion = crearDestinoMock("proyeccion");
        mockCrearPantallaDestino.mockImplementationOnce(() => destinoConProyeccion);
        const opciones = { fuente: "proyeccion" as FuentePedida };

        const { result } = renderHook(() => usarPantallaRemota("tableta", opciones));
        await waitFor(() => expect(result.current.estado).toBe("en-vivo"), { timeout: 5000 });

        const veredicto = result.current.veredicto as VeredictoFuente;
        expect(veredicto.cumplida).toBe(true);
        expect(veredicto.aviso).toBeNull();
    });

    it("con auto el veredicto siempre es cumplida sin aviso", async () => {
        const opciones = { fuente: "auto" as FuentePedida };
        const { result } = renderHook(() => usarPantallaRemota("tableta", opciones));
        await waitFor(() => expect(result.current.estado).toBe("en-vivo"), { timeout: 5000 });

        const veredicto = result.current.veredicto as VeredictoFuente;
        expect(veredicto.cumplida).toBe(true);
        expect(veredicto.aviso).toBeNull();
    });

    it("devuelve fuentePedida igual a la que se pidió", async () => {
        let opciones = { fuente: "auto" as FuentePedida };
        const { result, rerender } = renderHook(
            ({ opts }) => usarPantallaRemota("tableta", opts),
            { initialProps: { opts: opciones } }
        );
        await waitFor(() => expect(result.current.estado).toBe("en-vivo"), { timeout: 5000 });
        expect(result.current.fuentePedida).toBe("auto");

        opciones = { fuente: "proyeccion" as FuentePedida };
        rerender({ opts: opciones });
        await waitFor(() => expect(result.current.fuentePedida).toBe("proyeccion"), { timeout: 5000 });
    });

    it("sin neurona no abre nada y devuelve estado cerrada", async () => {
        const opciones = { fuente: "proyeccion" as FuentePedida };
        const { result } = renderHook(() => usarPantallaRemota(null, opciones));
        expect(result.current.estado).toBe("cerrada");
        expect(result.current.motivo).toBe("sin-neurona");
        expect(mockCrearPantallaDestino).not.toHaveBeenCalled();
    });

    it("cambiar la fuente con neurona null sigue sin abrir nada", async () => {
        let opciones = { fuente: "auto" as FuentePedida };
        const { result, rerender } = renderHook(
            ({ neurona, opts }) => usarPantallaRemota(neurona, opts),
            { initialProps: { neurona: null, opts: opciones } }
        );
        expect(result.current.estado).toBe("cerrada");
        expect(mockCrearPantallaDestino).not.toHaveBeenCalled();

        opciones = { fuente: "proyeccion" as FuentePedida };
        rerender({ neurona: null, opts: opciones });
        expect(result.current.estado).toBe("cerrada");
        expect(mockCrearPantallaDestino).not.toHaveBeenCalled();
    });
});