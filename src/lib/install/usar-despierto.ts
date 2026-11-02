"use client";

/**
 * KAL1101E · Gancho de la Wake Lock del navegador, conectado a la lógica PURA
 * ─────────────────────────────────────────────────────────────────────────────
 * `decidirDespierto` (despierto-web.ts, probado aparte) decide; este gancho
 * solo ejecuta lo decidido: pide `navigator.wakeLock.request("screen")` mientras
 * `proceso` esté en marcha y la pestaña sea visible, lo suelta al acabar o al
 * ocultarse y reintenta al volver (el propio navegador reavisa con su evento
 * «release» al ocultarla). Las decisiones pasan SIEMPRE por la función pura.
 *
 * Aviso honesto (regla de Alex, texto de `avisoDespierto`): esto mantiene la
 * PANTALLA, no el equipo despierto con la tapa cerrada; para procesos que deben
 * seguir sin mirar la pantalla están la app nativa o `keepalive`, y si la
 * neurona va a dormir igual, sus tareas pasan al A1 (colmena).
 */

import { useEffect, useRef, useState } from "react";
import { decidirDespierto } from "./despierto-web";

export interface SentinelaDespierto {
    release(): Promise<void>;
    addEventListener(tipo: string, oyente: () => void): void;
}

/** El estado devuelto, derivado de lo que la lógica pura haya mandado. */
export type EstadoDespierto = "activo" | "suelto" | "sin-soporte" | "oculta" | "proceso-inactivo";

function wakeLockDelNavegador(): ((t: "screen") => Promise<SentinelaDespierto>) | null {
    if (typeof navigator === "undefined") return null;
    const wl = (navigator as Navigator & { wakeLock?: unknown }).wakeLock;
    return wl
        ? (wl as { request(t: "screen"): Promise<SentinelaDespierto> }).request.bind(wl)
        : null;
}

/**
 * Mantiene la Screen Wake Lock según `decidirDespierto` mientras `proceso`.
 * Devuelve el estado para que la interfaz sea honesta con quien mira.
 */
export function useDespierto(proceso: boolean): EstadoDespierto {
    const [bloqueoActivo, setBloqueoActivo] = useState(false);
    const [visible, setVisible] = useState(true);
    const [soportado, setSoportado] = useState(false);
    const senal = useRef<SentinelaDespierto | null>(null);

    // Soporte y visibilidad: la única medición real que hace este gancho.
    useEffect(() => {
        const pedirPantalla = wakeLockDelNavegador();
        if (!pedirPantalla) return;
        setSoportado(true);
        const alVisibilidad = () => setVisible(document.visibilityState === "visible");
        document.addEventListener("visibilitychange", alVisibilidad);
        window.addEventListener("focus", alVisibilidad);
        return () => {
            document.removeEventListener("visibilitychange", alVisibilidad);
            window.removeEventListener("focus", alVisibilidad);
            const s = senal.current;
            senal.current = null;
            setBloqueoActivo(false);
            if (s) void s.release().catch(() => undefined);
        };
    }, []);

    // El efecto DECISOR: cada cambio de situación pasa por decidirDespierto.
    useEffect(() => {
        if (!soportado) return;
        const pedirPantalla = wakeLockDelNavegador();
        if (!pedirPantalla) return;
        const accion = decidirDespierto({ proceso, visible, soportado, bloqueoActivo });
        if (accion === "pedir") {
            pedirPantalla("screen").then(
                (s) => {
                    senal.current = s;
                    setBloqueoActivo(true);
                    // El navegador suelta el suyo al ocultar la pestaña: al
                    // reavivarlo aquí, la decisión vuelve a pasar por la pura.
                    s.addEventListener("release", () => {
                        senal.current = null;
                        setBloqueoActivo(false);
                    });
                },
                () => setBloqueoActivo(false),
            );
        } else if (accion === "soltar") {
            const s = senal.current;
            senal.current = null;
            setBloqueoActivo(false);
            if (s) void s.release().catch(() => undefined);
        }
    }, [proceso, visible, soportado, bloqueoActivo]);

    if (!soportado) return "sin-soporte";
    if (!proceso) return "proceso-inactivo";
    if (!visible) return "oculta";
    return bloqueoActivo ? "activo" : "suelto";
}
