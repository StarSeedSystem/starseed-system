import * as React from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as THREE from "three";
import type { DatosNavegador, EntornoNavegador, XRInyectable } from "../sondeo-navegador";
import { datosDeEntorno, mensajeErrorXR, useSesionXR, type OpcionesUseSesionXR } from "../../../vivo/espacial/use-sesion-xr";

/**
 * Compatibilidad de `useSesionXR` al migrar al núcleo XR (contrato §2.2): las funciones ya no
 * son una lista suelta, salen de `funcionesAPedir` y lo concedido queda en `funcionesConcedidas`.
 * `navigator.xr` es falso (XRInyectable) y lo demás se inyecta: sin red, sin visor, sin WebGL.
 */

interface InitCapturado {
    optionalFeatures?: readonly string[];
    requiredFeatures?: readonly string[];
    domOverlay?: unknown;
}

let initCapturado: InitCapturado | undefined;

function xrFalso(opciones: { vr?: boolean; ar?: boolean; concedidas?: string[]; falla?: Error } = {}): XRInyectable {
    return {
        isSessionSupported: async (modo: string) => (modo === "immersive-vr" ? opciones.vr === true : opciones.ar === true),
        requestSession: async (_modo: string, init?: XRSessionInit) => {
            initCapturado = (init ?? {}) as InitCapturado;
            if (opciones.falla) throw opciones.falla;
            return {
                enabledFeatures: opciones.concedidas ? [...opciones.concedidas] : undefined,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                end: vi.fn(async () => undefined),
            } as unknown as XRSession;
        },
    };
}

function glFalso() {
    return {
        xr: { enabled: false, setReferenceSpaceType: vi.fn(), setSession: vi.fn(async () => undefined) },
        setClearAlpha: vi.fn(),
    } as unknown as THREE.WebGLRenderer;
}

const UA_QUEST = "OculusBrowser/39.0 Chrome/136 Quest 3";
const ORIGINAL_UA = navigator.userAgent;

const NADA: string = "";

beforeEach(() => {
    initCapturado = undefined;
});

afterEach(() => {
    cleanup();
});

describe("compatibilidad de la sesión XR", () => {
    it("mensajeErrorXR conserva sus cinco mensajes (NotAllowedError incluido)", () => {
        expect(mensajeErrorXR({ name: "NotSupportedError", message: "" })).toBe("Este dispositivo no admite ese modo.");
        expect(mensajeErrorXR({ name: "SecurityError", message: "" })).toBe(
            "El navegador bloqueó la entrada: hace falta https y tocar el botón.",
        );
        expect(mensajeErrorXR({ name: "NotAllowedError", message: "" })).toBe(
            "Permiso denegado para entrar en realidad virtual o aumentada.",
        );
        expect(mensajeErrorXR({ name: "InvalidStateError", message: "" })).toBe("Ya hay otra sesión inmersiva abierta.");
        expect(mensajeErrorXR(NADA)).toBe("No se pudo entrar en VR/AR.");
    });
});
