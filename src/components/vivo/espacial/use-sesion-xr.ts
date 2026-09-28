"use client";

/**
 * Sesión WebXR de la escena compartida (L5 · 2026-09-28).
 *
 * Misma idea que `useWebXR` (`@/components/dashboard/apps/immersive/use-webxr`, el que usa el hub
 * `/xr`): la sesión se conecta al renderer de R3F y R3F pasa solo a `setAnimationLoop`. Cambia en
 * dos cosas que la sala compartida necesita:
 *   · en AR pide `dom-overlay` con la capa de interfaz, para que en el móvil sigan a mano
 *     «Salir», «Añadir» y la lista de personas encima de la cámara;
 *   · en AR limpia en transparente (la escena se ve sobre tu habitación) y lo restaura al salir.
 *
 * `entrar` debe llamarse desde un clic: el navegador solo abre XR con un gesto de la persona.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as THREE from "three";

export type ModoSesionXR = "immersive-vr" | "immersive-ar";

export interface EstadoXR {
    vr: boolean | null;
    ar: boolean | null;
    activa: boolean;
    modo: ModoSesionXR | null;
    error: string | null;
    entrar: (modo: ModoSesionXR) => Promise<void>;
    salir: () => Promise<void>;
}

function xrDelNavegador(): XRSystem | undefined {
    if (typeof navigator === "undefined") return undefined;
    return (navigator as Navigator & { xr?: XRSystem }).xr ?? undefined;
}

export function mensajeErrorXR(e: unknown): string {
    const nombre = e && typeof e === "object" && "name" in e ? String((e as { name?: unknown }).name) : "";
    if (nombre === "NotSupportedError") return "Este dispositivo no admite ese modo.";
    if (nombre === "SecurityError") return "El navegador bloqueó la entrada: hace falta https y tocar el botón.";
    if (nombre === "NotAllowedError") return "Permiso denegado para entrar en realidad virtual o aumentada.";
    if (nombre === "InvalidStateError") return "Ya hay otra sesión inmersiva abierta.";
    return e instanceof Error && e.message ? e.message : "No se pudo entrar en VR/AR.";
}

export function useSesionXR(
    gl: THREE.WebGLRenderer | null | undefined,
    raizOverlay: HTMLElement | null,
): EstadoXR {
    const [vr, setVr] = useState<boolean | null>(null);
    const [ar, setAr] = useState<boolean | null>(null);
    const [activa, setActiva] = useState(false);
    const [modo, setModo] = useState<ModoSesionXR | null>(null);
    const [error, setError] = useState<string | null>(null);
    const sesionRef = useRef<XRSession | null>(null);

    useEffect(() => {
        let cancelado = false;
        const xr = xrDelNavegador();
        if (!xr || typeof xr.isSessionSupported !== "function" || !window.isSecureContext) {
            setVr(false);
            setAr(false);
            return;
        }
        xr.isSessionSupported("immersive-vr")
            .then((ok) => !cancelado && setVr(ok))
            .catch(() => !cancelado && setVr(false));
        xr.isSessionSupported("immersive-ar")
            .then((ok) => !cancelado && setAr(ok))
            .catch(() => !cancelado && setAr(false));
        return () => {
            cancelado = true;
        };
    }, []);

    const salir = useCallback(async () => {
        const s = sesionRef.current;
        if (!s) return;
        try {
            await s.end();
        } catch {
            /* ya había terminado */
        }
    }, []);

    const entrar = useCallback(
        async (m: ModoSesionXR) => {
            setError(null);
            const xr = xrDelNavegador();
            if (!xr || !gl) {
                setError("WebXR no está disponible en este dispositivo.");
                return;
            }
            if (sesionRef.current) await salir();
            const init: XRSessionInit & { domOverlay?: { root: Element } } =
                m === "immersive-ar"
                    ? { optionalFeatures: ["local-floor", "hit-test", ...(raizOverlay ? ["dom-overlay"] : [])] }
                    : { optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"] };
            if (m === "immersive-ar" && raizOverlay) init.domOverlay = { root: raizOverlay };
            try {
                const sesion = await xr.requestSession(m, init);
                sesionRef.current = sesion;
                gl.xr.enabled = true;
                try {
                    gl.xr.setReferenceSpaceType("local-floor");
                } catch {
                    /* el navegador elegirá */
                }
                await gl.xr.setSession(sesion);
                // En AR el fondo lo pone la cámara: se limpia en transparente (el componente del
                // fondo quita además el color de la escena mientras dure).
                if (m === "immersive-ar") gl.setClearAlpha(0);
                const alTerminar = () => {
                    sesion.removeEventListener("end", alTerminar);
                    if (sesionRef.current === sesion) sesionRef.current = null;
                    try {
                        gl.xr.enabled = false;
                        gl.setClearAlpha(1);
                    } catch {
                        /* el renderer pudo desmontarse antes */
                    }
                    setActiva(false);
                    setModo(null);
                };
                sesion.addEventListener("end", alTerminar);
                setActiva(true);
                setModo(m);
            } catch (e) {
                sesionRef.current = null;
                try {
                    gl.xr.enabled = false;
                } catch {
                    /* noop */
                }
                setError(mensajeErrorXR(e));
                setActiva(false);
                setModo(null);
            }
        },
        [gl, raizOverlay, salir],
    );

    useEffect(
        () => () => {
            const s = sesionRef.current;
            sesionRef.current = null;
            s?.end().catch(() => undefined);
        },
        [],
    );

    // Referencia estable mientras nada cambie: quien lo recibe en un efecto no entra en bucle.
    return useMemo(() => ({ vr, ar, activa, modo, error, entrar, salir }), [vr, ar, activa, modo, error, entrar, salir]);
}
