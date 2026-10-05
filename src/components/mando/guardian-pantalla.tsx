"use client";

/**
 * Guardián de «pantalla siempre encendida» (Ola 1005P · PA1005D)
 * ─────────────────────────────────────────────────────────────────────────
 * Una vez montado en el Mando: sondea `GET /api/mando/pantalla` (cada 60 s y
 * al recuperar el foco; si falla conserva el último valor, y por defecto
 * está activa) y, si el ajuste está encendido, pide la Screen Wake Lock del
 * navegador. El navegador la suelta al ocultar la pestaña: se vuelve a pedir
 * en `visibilitychange` y `focus`, y se suelta si el ajuste pasa a inactivo.
 *
 * Límite honesto, que la tarjeta de Ajustes enseña: con la pestaña en
 * segundo plano, el navegador de móvil o tablet NO permite mantener la
 * pantalla; en la Mac sí, por el servicio `com.starseed.pantalla`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { MonitorCheck, MonitorOff, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export interface EstadoPantallaMando {
    activa: boolean;
    desde: number | null;
    mac: { servicio_vivo: boolean; pid: number | null };
}

export type EstadoBloqueo = "activo" | "suelto" | "sin-soporte" | "oculta";

/** Encendido por defecto: antes de la primera lectura, vale activa. */
export const PANTALLA_DEFECTO: EstadoPantallaMando = {
    activa: true,
    desde: null,
    mac: { servicio_vivo: false, pid: null },
};

interface WakeLockSentinela {
    release(): Promise<void>;
    addEventListener(tipo: string, oyente: () => void): void;
}

/** PURA: el wakeLock del navegador si existe, tipado, o null. */
function wakeLockDelNavegador(): { request(t: "screen"): Promise<WakeLockSentinela> } | null {
    if (typeof navigator === "undefined") return null;
    const wl = (navigator as Navigator & { wakeLock?: unknown }).wakeLock;
    return wl as { request(t: "screen"): Promise<WakeLockSentinela> } | undefined ?? null;
}

/** PURA: texto del estado de ESTE dispositivo para la tarjeta de Ajustes. */
export function estadoPantalla(bloqueo: EstadoBloqueo): string {
    switch (bloqueo) {
        case "activo":
            return "Este dispositivo mantiene la pantalla encendida.";
        case "oculta":
            return "Pestaña en segundo plano: el navegador suelta el bloqueo hasta volver.";
        case "sin-soporte":
            return "Este navegador no permite mantener la pantalla (sin Wake Lock).";
        default:
            return "Bloqueo de pantalla suelto en este dispositivo.";
    }
}

/** PURA: texto del servicio de la Mac (caffeinate) para la tarjeta. */
export function estadoMac(mac: EstadoPantallaMando["mac"]): string {
    return mac.servicio_vivo && mac.pid
        ? `Mac: servicio activo (PID ${mac.pid})`
        : "Mac: servicio apagado";
}

/** Pide y mantiene la Screen Wake Lock mientras el ajuste esté activo. */
export function useMantenerPantalla(activa: boolean): EstadoBloqueo {
    const [estado, setEstado] = useState<EstadoBloqueo>("suelto");
    const senal = useRef<WakeLockSentinela | null>(null);

    useEffect(() => {
        const wl = wakeLockDelNavegador();
        if (!wl) {
            setEstado("sin-soporte");
            return;
        }
        let vivo = true;
        const soltar = () => {
            const s = senal.current;
            senal.current = null;
            if (s) void s.release().catch(() => undefined);
            if (vivo) setEstado("suelto");
        };
        if (!activa) {
            soltar();
            return;
        }
        const pedir = () => {
            if (document.visibilityState !== "visible") {
                if (vivo) setEstado("oculta");
                return;
            }
            wl.request("screen").then(
                (s) => {
                    if (!vivo) {
                        void s.release().catch(() => undefined);
                        return;
                    }
                    senal.current = s;
                    setEstado("activo");
                    s.addEventListener("release", () => {
                        if (senal.current === s) senal.current = null;
                        if (vivo) setEstado("suelto");
                    });
                },
                () => {
                    if (vivo) setEstado("suelto");
                },
            );
        };
        pedir();
        const alCambiarVisibilidad = () => {
            if (document.visibilityState === "visible") pedir();
            else if (vivo) setEstado("oculta");
        };
        document.addEventListener("visibilitychange", alCambiarVisibilidad);
        window.addEventListener("focus", pedir);
        return () => {
            vivo = false;
            document.removeEventListener("visibilitychange", alCambiarVisibilidad);
            window.removeEventListener("focus", pedir);
            const s = senal.current;
            senal.current = null;
            if (s) void s.release().catch(() => undefined);
        };
    }, [activa]);

    return estado;
}

/** Sanea el cuerpo del GET/POST; cualquier cosa rara devuelve null. */
export function parsearEstadoPantalla(bruto: unknown): EstadoPantallaMando | null {
    if (!bruto || typeof bruto !== "object") return null;
    const obj = bruto as Record<string, unknown>;
    if (typeof obj.activa !== "boolean") return null;
    const macBruto = (obj.mac ?? {}) as Record<string, unknown>;
    const pidBruto = macBruto.pid;
    return {
        activa: obj.activa,
        desde: typeof obj.desde === "number" && Number.isFinite(obj.desde) ? obj.desde : null,
        mac: {
            servicio_vivo: Boolean(macBruto.servicio_vivo),
            pid: typeof pidBruto === "number" && Number.isFinite(pidBruto) ? pidBruto : null,
        },
    };
}

/** Lee el ajuste del servicio local; null = lectura fallida. */
export async function leerEstadoPantalla(): Promise<EstadoPantallaMando | null> {
    try {
        const r = await fetch("/api/mando/pantalla", { cache: "no-store" });
        if (!r.ok) return null;
        return parsearEstadoPantalla(await r.json());
    } catch {
        return null;
    }
}

/** Cambia el ajuste y devuelve el estado resultante; null = fallo. */
export async function guardarEstadoPantalla(activa: boolean): Promise<EstadoPantallaMando | null> {
    try {
        const r = await fetch("/api/mando/pantalla", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ activa }),
        });
        if (!r.ok) return null;
        return parsearEstadoPantalla(await r.json());
    } catch {
        return null;
    }
}
