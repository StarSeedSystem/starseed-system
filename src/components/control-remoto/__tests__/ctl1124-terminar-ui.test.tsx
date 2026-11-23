/**
 * CTL1124B · UI clara para terminar sesiones desde AMBAS neuronas sin quitar el permiso.
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const TAB = "11111111-2222-4333-8444-555555555555";
const MAC = "99999999-2222-4333-8444-555555555555";
const HUELLA = "abcdef0123456789abcdef0123456789";

const mockEstado = vi.hoisted(() => ({
    sesiones: [] as Array<{ token: string; de: string; nombre: string; nivel: "ver" | "controlar"; inicio: number; ultima: number; color?: string }>,
    terminadosTokens: [] as string[],
    terminarTodas: 0,
    quitarPermiso: 0,
    permiso: {
        encendido: true,
        nivel: "controlar" as const,
        controladores: [{ huella: "abcdef0123456789abcdef0123456789", nombre: "MaggaBox", cuenta: "c", desde: "2026-11-23T10:00:00Z" }],
        pendientes: [],
    },
}));

vi.mock("@/lib/control-remoto/canal", () => ({
    leerPermisoLocal: () => mockEstado.permiso,
    guardarPermisoLocal: () => undefined,
    puertaControl: () => ({
        sesionActiva: () => mockEstado.sesiones[0] ?? null,
        sesionesActivas: () => [...mockEstado.sesiones],
        terminarToken: (t: string) => {
            mockEstado.terminadosTokens.push(t);
            mockEstado.sesiones = mockEstado.sesiones.filter((s) => s.token !== t);
            return true;
        },
        terminar: () => {
            mockEstado.terminarTodas += 1;
            mockEstado.sesiones = [];
        },
        quitarPermiso: () => {
            mockEstado.quitarPermiso += 1;
            mockEstado.sesiones = [];
        },
        revocar: () => undefined,
    }),
    terminarControlHacia: vi.fn(async () => true),
    presentarmeA: async () => ({ ok: true }),
}));
vi.mock("@/lib/chats-genesis/firma-aparato", () => ({ aparatoLocal: async () => ({ codigo: "A1B2" }), codigoDe: async () => "E5F6" }));
vi.mock("@/lib/neurons/neurons", () => ({
    thisDeviceId: () => MAC,
    listNeurons: async () => [{ id: TAB, name: "Maggaboard", kind: "tablet", capabilities: { platform: "Android" }, online: true, isThisDevice: false }],
}));
vi.mock("@/lib/banco-llamadas/app", () => ({
    estadoBanco: () => null,
    ultimoInforme: () => ({ v: 1, t: 1, llave: true, objetivo: TAB, codigo: "A1B2", sesion: { estado: "aceptada", motivo: null, t: 1 }, armada: null }),
    informarBanco: () => undefined,
    armarBanco: () => true,
    apagarBanco: () => undefined,
}));

import { VentanaControl, olvidarLugarVentana } from "../ventana-control/ventana-control";
import type { PropsVentanaControl } from "../ventana-control/tipos";
import { ControlEntreNeuronasPanel } from "../banda-control";
import { abrirVentanaControl, cerrarVentanaControl } from "../anfitrion-control";

function propsVentana(extra: Partial<PropsVentanaControl> = {}): PropsVentanaControl {
    return {
        nombre: "MaggaBox",
        modo: "flotante",
        estado: "en-vivo",
        flujo: null,
        pantalla: { ancho: 1280, alto: 800, giro: 0 },
        nivel: "controlar",
        capacidades: { gestos: true, maxDedos: 2, teclas: ["escritorio"], volumen: false, brillo: false, texto: false },
        aparato: null,
        alEnviar: vi.fn(() => true),
        alCerrar: vi.fn(),
        ...extra,
    };
}

beforeEach(() => {
    olvidarLugarVentana();
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
    mockEstado.sesiones = [
        { token: "tok-box-1", de: HUELLA, nombre: "MaggaBox", nivel: "controlar", inicio: Date.parse("2026-11-23T12:00:00Z"), ultima: Date.parse("2026-11-23T12:00:00Z") },
    ];
    mockEstado.terminadosTokens = [];
    mockEstado.terminarTodas = 0;
    mockEstado.quitarPermiso = 0;
});

afterEach(() => {
    cleanup();
    cerrarVentanaControl(TAB);
    vi.restoreAllMocks();
});

describe("CTL1124B · opciones explícitas para terminar control desde VentanaControl", () => {
    it("enseña «Terminar control» en barra flotante, «Terminar» en pastilla y «Terminar sesión de control» en Controles", () => {
        const alCerrar = vi.fn();
        render(<VentanaControl {...propsVentana({ alCerrar })} />);

        fireEvent.click(screen.getByTestId("ventana-control-terminar"));
        expect(alCerrar).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole("button", { name: "Controles" }));
        fireEvent.click(screen.getByTestId("ventana-control-mandos-terminar"));
        expect(alCerrar).toHaveBeenCalledTimes(2);

        fireEvent.click(screen.getByRole("button", { name: /Reducir el control/ }));
        fireEvent.click(screen.getByTestId("ventana-control-pastilla-terminar"));
        expect(alCerrar).toHaveBeenCalledTimes(3);
    });
});

describe("CTL1124B · panel «Sesiones activas ahora» en ControlEntreNeuronasPanel", () => {
    it("muestra sesiones entrantes y salientes activas y termina una sesión SIN revocar permiso", async () => {
        act(() => {
            abrirVentanaControl(TAB, "Maggaboard");
        });
        render(<ControlEntreNeuronasPanel />);

        const tarjeta = await screen.findByTestId("sesiones-activas-ahora");
        expect(tarjeta).toHaveTextContent("MaggaBox");
        expect(tarjeta).toHaveTextContent("Maggaboard");
        expect(screen.getByTestId(`fila-terminar-sesion-${HUELLA.slice(0, 8)}`)).toBeInTheDocument();
        expect(screen.getByTestId("panel-terminar-control-saliente")).toBeInTheDocument();

        fireEvent.click(screen.getByTestId("terminar-sesion-entrante-tok-box-1"));
        await waitFor(() => expect(mockEstado.terminadosTokens).toEqual(["tok-box-1"]));
        expect(mockEstado.quitarPermiso).toBe(0);
    });
});
