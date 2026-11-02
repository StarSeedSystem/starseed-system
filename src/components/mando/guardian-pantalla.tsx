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

/* ═════════ Seguir trabajando con la pantalla apagada (KAL1101C) ═════════ */

/** Modos del guardián: pantalla es el Wake Lock; sistema es keepalive. */
export type ModoVela = "pantalla" | "sistema";

/** PURA: alterna entre pantalla (Wake Lock) y sistema (keepalive). */
export function alternarModoVela(modo: ModoVela): ModoVela {
    return modo === "pantalla" ? "sistema" : "pantalla";
}

/** Capacidad `despierto` que el nodo publica en su latido (KAL1101B). */
export interface EstadoDespiertoLatido {
    despierta: boolean;
    herramienta: string | null;
    bateria: number | null;
    enchufada: boolean;
    tapa: typeof TAPAS[number] | null;
    vaADormir: boolean | null;
    seVaADormir: boolean | null;
}

/** Valores de `tapa` que publica el latido (despierto_logica.py). */
const TAPAS = ["desactivada", "sin-tapa", "clamshell", "duerme"] as const;

function booleano(u: unknown): boolean | null {
    return typeof u === "boolean" ? u : null;
}

function numero(u: unknown): number | null {
    return typeof u === "number" && Number.isFinite(u) ? u : null;
}

/** PURA: el estado despierto del latido de la neurona; null si no llega o es raro. */
export function parsearDespiertoLatido(bruto: unknown): EstadoDespiertoLatido | null {
    if (!bruto || typeof bruto !== "object") return null;
    const d = bruto as Record<string, unknown>;
    if (typeof d.despierta !== "boolean") return null;
    if (d.tapa !== undefined && d.tapa !== null &&
        !(typeof d.tapa === "string" && (TAPAS as readonly string[]).includes(d.tapa))) {
        return null;
    }
    const tapa = typeof d.tapa === "string" && (TAPAS as readonly string[]).includes(d.tapa)
        ? (d.tapa as EstadoDespiertoLatido["tapa"]) : null;
    return {
        despierta: d.despierta,
        herramienta: typeof d.herramienta === "string" && d.herramienta !== "" ? d.herramienta : null,
        bateria: numero(d.bateria),
        enchufada: booleano(d.enchufada) ?? false,
        tapa,
        vaADormir: booleano(d.vaADormir),
        seVaADormir: booleano(d.seVaADormir),
    };
}

/** PURA: la verdad sobre la tapa, en español, sin suponer nada. */
export function textoTapa(tapa: EstadoDespiertoLatido["tapa"]): string {
    switch (tapa) {
        case "duerme":
            return "En un portátil, cerrar la tapa duerme el equipo salvo con corriente y pantalla externa; si duerme, sus tareas siguen en el A1.";
        case "clamshell":
            return "Con corriente y pantalla externa: puede seguir despierta con la tapa cerrada.";
        case "sin-tapa":
            return "Este equipo no tiene tapa: cerrarla no lo duerme.";
        case "desactivada":
            return "Reposo desactivado en el sistema (ajuste que exige administrador).";
        default:
            return "El latido de esta neurona todavía no publica su estado de tapa.";
    }
}
