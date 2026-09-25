"use client";

/**
 * ¿Qué dispositivo es ESTE? (cliente) — para elegir el instalador correcto.
 *
 * El userAgent solo no basta: un Mac con chip Apple sigue diciendo «Intel Mac OS X» por
 * compatibilidad. Los navegadores Chromium exponen la arquitectura real por UA-CH
 * (`navigator.userAgentData.getHighEntropyValues`); Safari y Firefox no. Por eso se arranca
 * con el userAgent y se afina en cuanto UA-CH responde. Si no responde, la arquitectura
 * queda «desconocida» y la interfaz lo dice al lado del archivo (p. ej. «para Mac con chip
 * Apple»), en vez de fingir que lo sabe.
 */

import { useEffect, useState } from "react";

import { dispositivoDesdeUA, type DispositivoParaInstalar } from "./apps-oficiales";

interface UADataAltaEntropia {
    platform?: string;
    architecture?: string;
}

interface NavigatorConUAData {
    userAgentData?: {
        platform?: string;
        getHighEntropyValues?: (pistas: string[]) => Promise<UADataAltaEntropia>;
    };
}

function uaActual(): string {
    return typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
}

/**
 * iPadOS se hace pasar por un Mac («Macintosh» en el userAgent) desde 2019: sin esta
 * corrección, un iPad recibiría el .dmg. Lo delata la pantalla táctil (un Mac no tiene).
 */
export function corregirIPad(d: DispositivoParaInstalar, puntosTactiles: number): DispositivoParaInstalar {
    return d.sistema === "macos" && puntosTactiles > 1 ? { sistema: "ios", arquitectura: "arm64" } : d;
}

function puntosTactiles(): number {
    try {
        return typeof navigator !== "undefined" ? Number(navigator.maxTouchPoints) || 0 : 0;
    } catch {
        return 0;
    }
}

/** Detección inmediata, solo con el userAgent (y la plataforma de UA-CH si ya la hay). */
export function dispositivoInmediato(): DispositivoParaInstalar {
    if (typeof navigator === "undefined") return { sistema: "otro", arquitectura: "desconocida" };
    const plataforma = (navigator as unknown as NavigatorConUAData).userAgentData?.platform ?? "";
    return corregirIPad(dispositivoDesdeUA(uaActual(), plataforma), puntosTactiles());
}

/** Detección afinada con UA-CH (arquitectura real) cuando el navegador la ofrece. */
export async function dispositivoAfinado(): Promise<DispositivoParaInstalar> {
    const base = dispositivoInmediato();
    try {
        const uad = (navigator as unknown as NavigatorConUAData).userAgentData;
        if (!uad?.getHighEntropyValues) return base;
        const v = await uad.getHighEntropyValues(["architecture", "platform"]);
        return corregirIPad(dispositivoDesdeUA(uaActual(), v.platform ?? uad.platform ?? "", v.architecture ?? ""), puntosTactiles());
    } catch {
        return base;
    }
}

export function useDispositivoActual(): DispositivoParaInstalar {
    const [d, setD] = useState<DispositivoParaInstalar>({ sistema: "otro", arquitectura: "desconocida" });
    useEffect(() => {
        let vivo = true;
        setD(dispositivoInmediato());
        void dispositivoAfinado().then((x) => {
            if (vivo) setD(x);
        });
        return () => {
            vivo = false;
        };
    }, []);
    return d;
}

/**
 * ¿Estamos dentro de la app nativa de StarSeed OS (Tauri) y no en un navegador?
 * `__TAURI__` solo existe con `withGlobalTauri` (lo tiene native/); `__TAURI_INTERNALS__`
 * lo pone Tauri 2 siempre, así que sirve aunque esa opción cambie.
 */
export function esAppNativa(): boolean {
    return typeof window !== "undefined" && ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);
}
