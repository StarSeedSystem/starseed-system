"use client";

/**
 * Guardián de «pantalla siempre encendida» (Ola 1005P · PA1005D)
 * ─────────────────────────────────────────────────────────────────────────
 * Una vez montado en Genesis: sondea `GET /api/mando/pantalla` (cada 60 s y
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
import type { OsId } from "@/lib/install/device-install";

export interface EstadoPantallaMando {
    activa: boolean;
    desde: number | null;
    mac: { servicio_vivo: boolean; pid: number | null };
    /** Modo del ajuste en el latido (KAL1101C): «sistema» o «pantalla». */
    modo: ModoPantalla;
}

export type EstadoBloqueo = "activo" | "suelto" | "sin-soporte" | "oculta";

/** «Seguir trabajando con la pantalla apagada» (KAL1101C), por ajuste: */
export type ModoPantalla = "sistema" | "pantalla";

/** Encendido por defecto: antes de la primera lectura, vale activa. */
export const PANTALLA_DEFECTO: EstadoPantallaMando = {
    activa: true,
    desde: null,
    mac: { servicio_vivo: false, pid: null },
    modo: "pantalla",
};

/* ══ KAL1101C · keepalive: «Seguir trabajando con la pantalla apagada» ══
 * Modo «sistema»: solo el aparato sigue despierto y la pantalla se apaga
 * sola (keepalive `--keep-display=false`). Modo «pantalla»: además la
 * pantalla se queda encendida (Wake Lock del navegador y servicio local). */

/** PURA: modo leído del ajuste del latido (field `modo`); solo «sistema» cambia la costumbre. */
export function modoDesdeValor(valor: unknown): ModoPantalla {
    return valor === "sistema" ? "sistema" : "pantalla";
}

/** PURA: qué hace cada modo, en una línea honesta. */
export function textoModo(modo: ModoPantalla): string {
    return modo === "sistema"
        ? "Sistema: el aparato sigue despierto y la pantalla se apaga sola."
        : "Pantalla: el aparato y la pantalla se quedan encendidos.";
}

/** PURA: la orden keepalive equivalente a cada modo (la ejecuta el servicio local del aparato, nunca el OS por su cuenta). */
export function ordenKeepalive(modo: ModoPantalla): string {
    return modo === "sistema" ? "keepalive --keep-display=false" : "keepalive";
}

/** PURA: la verdad por sistema sobre cerrar la tapa (el sistema manda, no la app). */
export function textoTapa(os: OsId): string {
    if (os === "macos") {
        return "En un portátil Mac, cerrar la tapa duerme el equipo salvo con corriente y pantalla externa; si la neurona duerme igual, sus tareas siguen en el A1 de la colmena.";
    }
    if (os === "windows" || os === "linux") {
        const medio =
            os === "windows"
                ? "pide al sistema de energía que no se suspenda"
                : "inhibe systemd-logind (tapa, inactividad y suspensión)";
        return `KeepAlive ${medio}; si se duerme igual, sus tareas siguen en el A1 de la colmena.`;
    }
    if (os === "android" || os === "ios") {
        return "Los sistemas móviles no permiten seguir trabajando con la pantalla apagada; si hace falta, sus tareas siguen en el A1 de la colmena.";
    }
    return "Si el aparato se duerme aunque se pidiera lo contrario, sus tareas siguen en el A1 de la colmena.";
}

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

/** Pide y mantiene la Screen Wake Lock mientras el ajuste esté activo Y sea modo «pantalla»; en modo «sistema» la pantalla se apaga sola. */
export function useMantenerPantalla(activa: boolean, modo: ModoPantalla = "pantalla"): EstadoBloqueo {
    const [estado, setEstado] = useState<EstadoBloqueo>("suelto");
    const senal = useRef<WakeLockSentinela | null>(null);

    useEffect(() => {
        const wl = wakeLockDelNavegador();
        if (!wl) {
            setEstado("sin-soporte");
            return;
        }
        const mantener = activa && modo === "pantalla";
        let vivo = true;
        const soltar = () => {
            const s = senal.current;
            senal.current = null;
            if (s) void s.release().catch(() => undefined);
            if (vivo) setEstado("suelto");
        };
        if (!mantener) {
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
    }, [activa, modo]);

    return estado;
}

/** Sanea el cuerpo del GET/POST (y el `modo` del latido); cualquier cosa rara devuelve null. */
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
        modo: modoDesdeValor(obj.modo),
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

/** Cambia el ajuste (y, si se dice, el modo) y devuelve el estado resultante; null = fallo.
 *  El ajuste se guarda en `~/.starseed/pantalla.json` vía POST; el estado que vuelva
 *  (también el que traiga el latido) se interpreta con `modoDesdeValor`. */
export async function guardarEstadoPantalla(
    activa: boolean,
    modo?: ModoPantalla,
): Promise<EstadoPantallaMando | null> {
    try {
        const r = await fetch("/api/mando/pantalla", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(modo ? { activa, modo } : { activa }),
        });
        if (!r.ok) return null;
        return parsearEstadoPantalla(await r.json());
    } catch {
        return null;
    }
}
