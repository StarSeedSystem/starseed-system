import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import type * as THREE from "three";

// Mocking next/dynamic to avoid R3F dependencies
vi.mock("next/dynamic", () => ({
    default: () =>
        function SimuladorR3D(props: Record<string, unknown>) {
            return <div data-testid="lienzo-3d" {...props} />;
        },
}));

// Mocking use-sesion-escena to control its behavior
vi.mock("../../../vivo/espacial/use-sesion-escena", () => ({
    useSesionEscena: () => ({
        sesion: null,
        estado: null,
        avatares: { yo: null, otros: [] },
    }),
}));

// Importing the actual hooks to test
import { funcionesAPedir } from "../aplicar-perfil";
import { useSesionXR, mensajeErrorXR, type EstadoXR, type OpcionesUseSesionXR } from "../../../vivo/espacial/use-sesion-xr";
import type { ModoSesionXR } from "../../../vivo/espacial/use-sesion-xr";
import type { XRInyectable } from "../sondeo-navegador";

vi.mock("window", () => ({
    isSecureContext: true,
}));

const h = vi.hoisted(() => ({
    gl: vi.mocked({
        xr: {
            enabled: false,
            setReferenceSpaceType: vi.fn(),
            setSession: vi.fn(async () => undefined),
        },
    }),
    raizOverlay: null,
}));

// Track whether mock has been set up
let xrMockSetup = false;

// Mock XR API for jsdom
vi.mocked(() => {
    if (typeof globalThis.window !== "undefined") {
        globalThis.window.XRSession = vi.fn();
        globalThis.window.XRSystem = vi.fn();
        globalThis.window.XRReferenceSpaceType = vi.fn();
    }
})();

beforeEach(() => {
    // Reset mock state
    h.gl.xr.enabled = false;
    h.gl.xr.setReferenceSpaceType.mockClear();
    h.gl.xr.setSession.mockClear();
});

afterEach(cleanup);

function mockXRSystem(vr: boolean, ar: boolean): void {
    const mockXR: XRInyectable = {
        isSessionSupported: async (modo: string) => (modo === "immersive-vr" ? vr : ar),
        requestSession: async (modo: string, init?: XRSessionInit) => {
            const sesion = {
                end: vi.fn(async () => undefined),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                enabledFeatures: (init?.requiredFeatures || []) as string[],
            };
            return sesion as XRSession;
        },
    };
    vi.mocked(() => {
        if (typeof globalThis.navigator !== "undefined") {
            (globalThis.navigator as Navigator & { xr?: typeof mockXR }).xr = mockXR as XRSystem;
        }
    })();
}

describe("useSesionXR", () => {
    it("mensajeErrorXR keeps its five messages", () => {
        const testCases = [
            { error: { name: "NotSupportedError", message: "NotSupportedError" }, expected: "Este dispositivo no admite ese modo." },
            { error: { name: "SecurityError", message: "SecurityError" }, expected: "El navegador bloqueó la entrada: hace falta https y tocar el botón." },
            { error: { name: "NotAllowedError", message: "NotAllowedError" }, expected: "Permiso denegado para entrar en realidad virtual o aumentada." },
            { error: { name: "InvalidStateError", message: "InvalidStateError" }, expected: "Ya hay otra sesión inmersiva abierta." },
            { error: { name: "Invalid", message: "Otro" }, expected: "No se pudo entrar en VR/AR." },
        ];

        testCases.forEach(({ error, expected }) => {
            const result = mensajeErrorXR(error);
            expect(result).toBe(expected);
        });
    });
});