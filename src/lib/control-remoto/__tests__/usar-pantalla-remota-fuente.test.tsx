/**
 * RST1116A · el gancho de la pantalla remota acepta la fuente pedida y la cambia sin perder la sesión sin avisar.
 * Pruebas con `crearPantallaDestino` simulado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usarPantallaRemota } from "../usar-pantalla-remota";
import { crearPantallaDestino, type PantallaDestino } from "../pantalla-destino";
import type { FuentePedida, FuenteReal, VeredictoFuente } from "../fuente-pantalla";
import type { InstantaneaPantalla } from "../pantalla-destino";

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

const instancias: PantallaDestino[] = [];
const snapshots: InstantaneaPantalla[] = [];

vi.mock("../pantalla-destino", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../pantalla-destino")>();
    return {
        ...actual,
        crearPantallaDestino: vi.fn((_neurona: string, _opciones: { fuente?: FuentePedida }) => {
            const obj = {
                iniciar: vi.fn(async () => {
                    snapshots.push({ ...VACIA, estado: "en-vivo", desde: Date.now(), fuente: "accesibilidad" as FuenteReal });
                }),
                cerrar: vi.fn(async () => {}),
                instantanea: vi.fn(() => snapshots[snapshots.length - 1] ?? VACIA),
                suscribir: vi.fn((cb: () => void) => {
                    return () => {};
                }),
                enviar: vi.fn(() => false),
                pedirFluida: vi.fn(async () => false),
            };
            instancias.push(obj as unknown as PantallaDestino);
            return obj;
        }),
    };
});

beforeEach(() => {
    vi.clearAllMocks();
    snapshots.length = 0;
    instancias.length = 0;
});

afterEach(() => {
    vi.resetModules();
});

describe("RST1116A · usarPantallaRemota con fuente pedida", () => {
    it("abre con la fuente pedida", async () => {
        const { result } = renderHook(() =>
            usarPantallaRemota("tableta-1", { fuente: "proyeccion" })
        );
        await act(async () => {
            await new Promise((r) => setTimeout(r, 50));
        });
        expect(crearPantallaDestino).toHaveBeenCalledWith("tableta-1", { fuente: "proyeccion" });
        expect(result.current.fuentePedida).toBe("proyeccion");
    });

    it("cambiar de auto a proyeccion cierra la anterior y abre otra con proyeccion", async () => {
        const { result, rerender } = renderHook(
            ({ f }: { f: FuentePedida }) => usarPantallaRemota("tableta-1", { fuente: f }),
            { initialProps: { f: "auto" as FuentePedida } }
        );
        await act(async () => {
            await new Promise((r) => setTimeout(r, 50));
        });
        expect(crearPantallaDestino).toHaveBeenCalledTimes(1);
        expect(crearPantallaDestino).toHaveBeenCalledWith("tableta-1", { fuente: "auto" });

        rerender({ f: "proyeccion" });
        await act(async () => {
            await new Promise((r) => setTimeout(r, 50));
        });
        expect(crearPantallaDestino).toHaveBeenCalledTimes(2);
        expect(crearPantallaDestino).toHaveBeenLastCalledWith("tableta-1", { fuente: "proyeccion" });
        expect(instancias[0].cerrar).toHaveBeenCalled();
        expect(result.current.fuentePedida).toBe("proyeccion");
    });

    it("si la instantánea dice accesibilidad tras pedir proyeccion, el veredicto trae el aviso", async () => {
        const { result } = renderHook(() =>
            usarPantallaRemota("tableta-1", { fuente: "proyeccion" })
        );
        await act(async () => {
            await new Promise((r) => setTimeout(r, 50));
        });
        const veredicto = result.current.veredicto as VeredictoFuente;
        expect(veredicto.cumplida).toBe(false);
        expect(veredicto.aviso).toContain("Pediste la pantalla fluida");
    });

    it("sin neurona no abre nada", async () => {
        const { result } = renderHook(() =>
            usarPantallaRemota(null, { fuente: "proyeccion" })
        );
        await act(async () => {
            await new Promise((r) => setTimeout(r, 50));
        });
        expect(crearPantallaDestino).not.toHaveBeenCalled();
        expect(result.current.estado).toBe("cerrada");
        expect(result.current.fuentePedida).toBe("proyeccion");
    });
});