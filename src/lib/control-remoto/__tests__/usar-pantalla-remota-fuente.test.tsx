/**
 * RST1116A · el gancho de la pantalla remota acepta la fuente pedida y la cambia sin perder la sesión sin avisar.
 * Pruebas con `crearPantallaDestino` simulado.
 * NOTA: 191 líneas (excede 120) por cobertura completa de 9 casos: sin neurona, auto/proyección, cambio bidireccional,
 * veredicto con aviso, auto siempre cumplida, sin llamada a crearPantallaDestino, y null cierra sesión.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usarPantallaRemota } from "../usar-pantalla-remota";
import type { FuentePedida, FuenteReal, InstantaneaPantalla, PantallaDestino } from "../pantalla-destino";
import type { VeredictoFuente } from "../fuente-pantalla";

const VACIA: InstantaneaPantalla = {
    estado: "cerrada",
    motivo: "sin-neurona",
    desde: 0,
    flujo: null,
    pantalla: null,
    nivel: "ver",
    capacidades: { gestos: false, maxDedos: 0, teclas: [], volumen: false, brillo: false, texto: false },
    aparato: null,
};

const mockFactoryRef = { current: (neurona: string, opciones: { fuente: FuentePedida }) => {
    throw new Error("crearPantallaDestino no configurado");
} };

vi.mock("../pantalla-destino", () => ({
    crearPantallaDestino: (neurona: string, opciones: { fuente: FuentePedida }) => mockFactoryRef.current(neurona, opciones),
}));

import { crearPantallaDestino } from "../pantalla-destino";

function crearPantallaDestinoMock(config: {
    fuenteInicial?: FuentePedida;
    fuenteRespuesta?: FuenteReal | null;
    estadoInicial?: InstantaneaPantalla["estado"];
}): { mock: PantallaDestino; actualizarFuente: (f: FuenteReal | null) => void } {
    let fuenteActual = config.fuenteRespuesta ?? "accesibilidad";
    let estado = config.estadoInicial ?? "en-vivo";
    const oyentes = new Set<() => void>();

    const snap: InstantaneaPantalla = {
        ...VACIA,
        estado,
        desde: Date.now(),
        fuente: fuenteActual,
    };

    const mock: PantallaDestino = {
        instantanea: () => snap,
        suscribir: (cb) => {
            oyentes.add(cb);
            return () => oyentes.delete(cb);
        },
        enviar: vi.fn(() => true),
        cerrar: vi.fn(),
        reintentar: vi.fn(),
        pedirFluida: vi.fn(() => Promise.resolve(false)),
        iniciar: vi.fn(),
    } as unknown as PantallaDestino;

    return {
        mock,
        actualizarFuente: (f: FuenteReal | null) => {
            fuenteActual = f ?? "accesibilidad";
            snap.fuente = fuenteActual;
            for (const o of [...oyentes]) o();
        },
    };
}

describe("RST1116A · usarPantallaRemota con fuente pedida", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("sin neurona no abre nada y devuelve estado vacío", () => {
        const { result } = renderHook(() => usarPantallaRemota(null));
        expect(result.current).toMatchObject(VACIA);
        expect(result.current.fuentePedida).toBe("auto");
        expect(result.current.veredicto).toEqual({ cumplida: true, aviso: null });
    });

    it("abre con la fuente pedida (auto por defecto)", () => {
        const { mock } = crearPantallaDestinoMock({ fuenteInicial: "auto", fuenteRespuesta: "accesibilidad" });
        mockFactoryRef.current = () => mock;
        const { result } = renderHook(() => usarPantallaRemota("tableta", { fuente: "auto" }));

        expect(crearPantallaDestino).toHaveBeenCalledWith("tableta", { fuente: "auto" });
        expect(result.current.fuentePedida).toBe("auto");
        expect(result.current.veredicto.cumplida).toBe(true);
    });

    it("abre con «proyeccion» cuando se pide", () => {
        const { mock } = crearPantallaDestinoMock({ fuenteInicial: "proyeccion", fuenteRespuesta: "proyeccion" });
        mockFactoryRef.current = () => mock;
        const { result } = renderHook(() => usarPantallaRemota("tableta", { fuente: "proyeccion" }));

        expect(crearPantallaDestino).toHaveBeenCalledWith("tableta", { fuente: "proyeccion" });
        expect(result.current.fuentePedida).toBe("proyeccion");
    });

    it("cambiar de «auto» a «proyeccion» cierra la anterior y abre otra con «proyeccion»", () => {
        const { mock: mock1 } = crearPantallaDestinoMock({ fuenteInicial: "auto", fuenteRespuesta: "accesibilidad" });
        const { mock: mock2 } = crearPantallaDestinoMock({ fuenteInicial: "proyeccion", fuenteRespuesta: "proyeccion" });
        mockFactoryRef.current = () => mock1;
        const { result, rerender } = renderHook(
            ({ neurona, opciones }) => usarPantallaRemota(neurona, opciones),
            { initialProps: { neurona: "tableta", opciones: { fuente: "auto" } } }
        );

        expect(crearPantallaDestino).toHaveBeenCalledTimes(1);
        expect(mock1.cerrar).not.toHaveBeenCalled();

        mockFactoryRef.current = () => mock2;
        rerender({ neurona: "tableta", opciones: { fuente: "proyeccion" } });

        expect(mock1.cerrar).toHaveBeenCalledWith("fuente-cambiada", true);
        expect(crearPantallaDestino).toHaveBeenCalledTimes(2);
        expect(crearPantallaDestino).toHaveBeenNthCalledWith(2, "tableta", { fuente: "proyeccion" });
        expect(result.current.fuentePedida).toBe("proyeccion");
    });

    it("cambiar de «proyeccion» a «auto» cierra la anterior y abre otra con «auto»", () => {
        const { mock: mock1 } = crearPantallaDestinoMock({ fuenteInicial: "proyeccion", fuenteRespuesta: "proyeccion" });
        const { mock: mock2 } = crearPantallaDestinoMock({ fuenteInicial: "auto", fuenteRespuesta: "accesibilidad" });
        mockFactoryRef.current = () => mock1;
        const { result, rerender } = renderHook(
            ({ neurona, opciones }) => usarPantallaRemota(neurona, opciones),
            { initialProps: { neurona: "tableta", opciones: { fuente: "proyeccion" } } }
        );

        mockFactoryRef.current = () => mock2;
        rerender({ neurona: "tableta", opciones: { fuente: "auto" } });

        expect(mock1.cerrar).toHaveBeenCalledWith("fuente-cambiada", true);
        expect(crearPantallaDestino).toHaveBeenNthCalledWith(2, "tableta", { fuente: "auto" });
        expect(result.current.fuentePedida).toBe("auto");
    });

    it("si la instantánea dice «accesibilidad» tras pedir «proyeccion», el veredicto trae el aviso", async () => {
        const { mock, actualizarFuente } = crearPantallaDestinoMock({
            fuenteInicial: "proyeccion",
            fuenteRespuesta: "accesibilidad",
        });
        mockFactoryRef.current = () => mock;
        const { result } = renderHook(() => usarPantallaRemota("tableta", { fuente: "proyeccion" }));

        expect(result.current.veredicto.cumplida).toBe(false);
        expect(result.current.veredicto.aviso).toBe(
            "Pediste la pantalla fluida, pero este aparato la está mandando por accesibilidad (menos fluida). Hace falta la proyección de pantalla en ese aparato."
        );

        // Cambia la fuente real a proyección
        await act(async () => {
            actualizarFuente("proyeccion");
        });

        await waitFor(() => {
            expect(result.current.veredicto.cumplida).toBe(true);
            expect(result.current.veredicto.aviso).toBeNull();
        });
    });

    it("con «auto» el veredicto siempre es cumplida sin aviso", () => {
        for (const real of ["accesibilidad", "proyeccion", null] as const) {
            const { mock } = crearPantallaDestinoMock({ fuenteInicial: "auto", fuenteRespuesta: real });
            mockFactoryRef.current = () => mock;
            const { result } = renderHook(() => usarPantallaRemota("tableta", { fuente: "auto" }));
            expect(result.current.veredicto).toEqual({ cumplida: true, aviso: null });
        }
    });

    it("sin neurona no llama a crearPantallaDestino", () => {
        renderHook(() => usarPantallaRemota(null, { fuente: "proyeccion" }));
        expect(crearPantallaDestino).not.toHaveBeenCalled();
    });

    it("cambiar neurona a null cierra la pantalla y devuelve estado vacío", () => {
        const { mock } = crearPantallaDestinoMock({ fuenteInicial: "proyeccion", fuenteRespuesta: "proyeccion" });
        mockFactoryRef.current = () => mock;
        const { result, rerender } = renderHook(
            ({ neurona, opciones }) => usarPantallaRemota(neurona, opciones),
            { initialProps: { neurona: "tableta", opciones: { fuente: "proyeccion" } } }
        );

        rerender({ neurona: null, opciones: { fuente: "proyeccion" } });

        expect(mock.cerrar).toHaveBeenCalledWith("desmontada", true);
        expect(result.current).toMatchObject(VACIA);
    });
});