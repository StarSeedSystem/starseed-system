'use client';

// ════════════════════════════════════════════════════════════════
// useWebXR — fundación WebXR del SOSD (VR/AR nativo, sin @react-three/xr)
// ----------------------------------------------------------------
// Maneja la sesión inmersiva directamente sobre el renderer de three que
// expone React-Three-Fiber (`gl: THREE.WebGLRenderer`). Filosofía StarSeed:
//   • Ciberdelia: la tecnología expande la consciencia, jamás vigila. La
//     cámara (AR) la gestiona el navegador con permiso explícito del usuario.
//   • Degradación elegante: si el dispositivo no soporta XR, no se fuerza
//     nada — los botones de entrada simplemente no se ofrecen.
//
// API:
//   const { vrSupported, arSupported, inSession, mode, enter, exit } = useWebXR(gl);
//   - vrSupported / arSupported: boolean | null (null = aún comprobando)
//   - enter('immersive-vr' | 'immersive-ar'): inicia la sesión
//   - exit(): termina la sesión activa
//
// SSR-safe: todo acceso a `navigator.xr` se hace en el cliente y bajo guardas.
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';

/** Modo de sesión inmersiva soportado por el OS. */
export type XRMode = 'immersive-vr' | 'immersive-ar';

export interface WebXRState {
    /** true/false/null — null mientras se comprueba el soporte. */
    vrSupported: boolean | null;
    arSupported: boolean | null;
    /** Hay una sesión XR activa. */
    inSession: boolean;
    /** Modo de la sesión activa (o null). */
    mode: XRMode | null;
    /** Último error legible (o null). */
    error: string | null;
    /** Entra en una sesión inmersiva. No-op si el modo no está soportado. */
    enter: (mode: XRMode) => Promise<void>;
    /** Termina la sesión activa. */
    exit: () => Promise<void>;
}

/** Acceso seguro al sistema XR del navegador (undefined en SSR o sin soporte). */
function getXR(): XRSystem | undefined {
    if (typeof navigator === 'undefined') return undefined;
    return navigator.xr ?? undefined;
}

/**
 * Hook de sesión WebXR sobre el renderer de R3F.
 * @param gl El `THREE.WebGLRenderer` de R3F (de `useThree(s => s.gl)`), o null
 *           mientras la escena aún no montó.
 */
export function useWebXR(gl: THREE.WebGLRenderer | null | undefined): WebXRState {
    const [vrSupported, setVrSupported] = useState<boolean | null>(null);
    const [arSupported, setArSupported] = useState<boolean | null>(null);
    const [inSession, setInSession] = useState(false);
    const [mode, setMode] = useState<XRMode | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Sesión activa (ref para limpiar en unmount sin re-renders).
    const sessionRef = useRef<XRSession | null>(null);

    // ── Feature-detection (una vez, en el cliente) ───────────────────
    useEffect(() => {
        let cancelled = false;
        const xr = getXR();
        if (!xr || typeof xr.isSessionSupported !== 'function') {
            // No hay WebXR: degradación elegante (sin VR ni AR).
            setVrSupported(false);
            setArSupported(false);
            return;
        }

        // Comprobamos VR y AR de forma independiente; cualquier rechazo
        // (p. ej. contexto no seguro) se interpreta como "no soportado".
        xr.isSessionSupported('immersive-vr')
            .then((ok) => { if (!cancelled) setVrSupported(ok); })
            .catch(() => { if (!cancelled) setVrSupported(false); });

        xr.isSessionSupported('immersive-ar')
            .then((ok) => { if (!cancelled) setArSupported(ok); })
            .catch(() => { if (!cancelled) setArSupported(false); });

        return () => { cancelled = true; };
    }, []);

    // ── Salir de la sesión ───────────────────────────────────────────
    const exit = useCallback(async () => {
        const session = sessionRef.current;
        if (!session) return;
        try {
            await session.end();
        } catch {
            // Si ya terminó, el evento 'end' habrá limpiado el estado.
        }
    }, []);

    // ── Entrar en una sesión inmersiva ───────────────────────────────
    const enter = useCallback(
        async (target: XRMode) => {
            setError(null);
            const xr = getXR();
            if (!xr || !gl) {
                setError('WebXR no disponible en este dispositivo.');
                return;
            }
            // Si ya hay sesión, primero la cerramos limpiamente.
            if (sessionRef.current) {
                await exit();
            }

            // Características opcionales: el navegador concede las que pueda.
            // 'hit-test' es útil en AR; 'hand-tracking' / suelos en VR.
            const sessionInit: XRSessionInit = {
                optionalFeatures: [
                    'local-floor',
                    'bounded-floor',
                    'hand-tracking',
                    'layers',
                    ...(target === 'immersive-ar' ? (['hit-test'] as string[]) : []),
                ],
            };

            try {
                const session = await xr.requestSession(target, sessionInit);
                sessionRef.current = session;

                // Conectamos la sesión al renderer de three (vía R3F).
                gl.xr.enabled = true;
                await gl.xr.setSession(session);

                // Limpieza cuando el usuario/navegador termina la sesión.
                const handleEnd = () => {
                    session.removeEventListener('end', handleEnd);
                    if (sessionRef.current === session) sessionRef.current = null;
                    try {
                        gl.xr.enabled = false;
                    } catch {
                        /* renderer pudo desmontarse antes que la sesión */
                    }
                    setInSession(false);
                    setMode(null);
                };
                session.addEventListener('end', handleEnd);

                setInSession(true);
                setMode(target);
            } catch (e) {
                sessionRef.current = null;
                try {
                    gl.xr.enabled = false;
                } catch {
                    /* noop */
                }
                const msg =
                    e instanceof Error ? e.message : 'No se pudo iniciar la sesión XR.';
                setError(msg);
                setInSession(false);
                setMode(null);
            }
        },
        [gl, exit]
    );

    // ── Limpieza al desmontar: cerrar cualquier sesión viva ──────────
    useEffect(() => {
        return () => {
            const session = sessionRef.current;
            if (session) {
                session.end().catch(() => { /* noop */ });
                sessionRef.current = null;
            }
        };
    }, []);

    return { vrSupported, arSupported, inSession, mode, error, enter, exit };
}
