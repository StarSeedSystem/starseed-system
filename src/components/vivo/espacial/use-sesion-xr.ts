"use client";

/**
 * Sesión WebXR de la escena compartida (L5 · 2026-09-28).
 *
 * Misma idea que `useWebXR` (`@/components/dashboard/apps/immersive/use-webxr`, el que usa el hub
 * `/xr`): la sesión se conecta al renderer de R3F y R3F pasa solo a `setAnimationLoop`. Cambia en
 * dos cosas que la sala compartida necesita:
 *   · las funciones (VR/AR) salen de `funcionesAPedir` (`@/components/xr/shell/aplicar-perfil`)
 *     sobre lo que el navegador dice; en AR de mano se conserva `dom-overlay` con la raíz de
 *     interfaz, y una vez concedidas quedan en `funcionesConcedidas` (§2.2 del contrato XR);
 *   · en AR limpia en transparente (la escena se ve sobre tu habitación) y lo restaura al salir.
 *
 * `entrar` debe llamarse desde un clic: el navegador solo abre XR con un gesto de la persona.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as THREE from "three";
import type { DatosNavegador } from "@/lib/xr/capacidades";
import { evaluarCapacidades, refinarFunciones } from "@/lib/xr/capacidades";
import { funcionesAPedir } from "@/components/xr/shell/aplicar-perfil";
import { entornoReal, type EntornoNavegador } from "@/components/xr/shell/sondeo-navegador";

export type ModoSesionXR = "immersive-vr" | "immersive-ar";

export interface EstadoXR {
    vr: boolean | null;
    ar: boolean | null;
    activa: boolean;
    modo: ModoSesionXR | null;
    error: string | null;
    entrar: (modo: ModoSesionXR) => Promise<void>;
    salir: () => Promise<void>;
    /** Lo que el navegador CONCEDIÓ (`session.enabledFeatures`); indefinido si no hay sesión o no lo informa. */
    funcionesConcedidas?: string[];
}

export interface OpcionesUseSesionXR {
    /** Funcciones esperadas (una `CapacidadesXR` ya refinada); si no, se deducen del navegador. */
    funciones?: readonly string[];
    /** Mundo AR que quiere la habitación: sólo entonces se pide `plane-detection` requerida (§3 k). */
    habitacion?: boolean;
}

const OPCIONES_NULA: OpcionesUseSesionXR = {};

function xrDelNavegador(): XRSystem | undefined {
    if (typeof navigator === "undefined") return undefined;
    return (navigator as Navigator & { xr?: XRSystem }).xr ?? undefined;
}

/**
 * Los `DatosNavegador` que el núcleo espera, desde el entorno inyectable de `sondeo-navegador.ts` y lo
 * que este hook YA sondeó (`vr`/`ar`: no se vuelve a preguntar a `isSessionSupported`). Puro.
 */
export function datosDeEntorno(
    e: EntornoNavegador,
    tieneXR: boolean,
    vr: boolean | null,
    ar: boolean | null,
): DatosNavegador {
    return {
        ua: typeof e.ua === "string" ? e.ua : "",
        seguro: e.seguro === true,
        tieneXR,
        vr,
        ar,
        ofreceSesion: !!e.xr && typeof e.xr.offerSession === "function",
        tactil: e.maxTouchPoints > 1,
        webgl2: e.webgl2() === true,
        webgpu: e.webgpu === true,
        instalada: e.standalone === true || e.digitalGoods === true,
    };
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
    opciones: OpcionesUseSesionXR = OPCIONES_NULA,
): EstadoXR {
    const [vr, setVr] = useState<boolean | null>(null);
    const [ar, setAr] = useState<boolean | null>(null);
    const [activa, setActiva] = useState(false);
    const [modo, setModo] = useState<ModoSesionXR | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [funcionesConcedidas, setFuncionesConcedidas] = useState<string[] | undefined>(undefined);
    const sesionRef = useRef<XRSession | null>(null);
    // Primitivas y no el objeto: la identidad de `opciones` cambia en cada render, la de estas no.
    const funcionesInyectadas = opciones.funciones;
    const habitacionPedida = opciones.habitacion;

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
        setFuncionesConcedidas(undefined);
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

            // Las funciones ya no son una lista suelta: salen de `funcionesAPedir` sobre la
            // `CapacidadesXR` del núcleo (plataforma del navegador) y, si el quien llama trae ya
            // lo concedido, se refina igual que hace `refinarFunciones`.
            let capacidades = evaluarCapacidades(
                datosDeEntorno(entornoReal(), typeof xr.isSessionSupported === "function", vr, ar),
            );
            if (funcionesInyectadas) capacidades = refinarFunciones(capacidades, funcionesInyectadas);
            const pedidas = funcionesAPedir(capacidades, { habitacion: habitacionPedida === true });
            const opcionales = [...pedidas.opcionales];
            // En AR de mano la capa de interfaz sigue a mano encima de la cámara: si el quien
            // llama no la pidió, se pide igual (opcional: se concede si el aparato puede).
            if (m === "immersive-ar" && raizOverlay && !opcionales.includes("dom-overlay")) opcionales.push("dom-overlay");
            const init: XRSessionInit & { domOverlay?: { root: Element } } = {
                optionalFeatures: opcionales,
                requiredFeatures: pedidas.requeridas,
            };
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
                // Lo concedido queda en el estado (§2.2): solo lo que el navegador informa.
                setFuncionesConcedidas(sesion.enabledFeatures ? [...sesion.enabledFeatures] : undefined);
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
                setFuncionesConcedidas(undefined);
            }
        },
        [gl, raizOverlay, salir, vr, ar, funcionesInyectadas, habitacionPedida],
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
    return useMemo(() => ({ vr, ar, activa, modo, error, entrar, salir, funcionesConcedidas }), [vr, ar, activa, modo, error, entrar, salir, funcionesConcedidas]);
}
