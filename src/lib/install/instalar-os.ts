"use client";

/**
 * «Instalar StarSeed OS» con un toque — la parte del NAVEGADOR.
 * ═══════════════════════════════════════════════════════════════════════════
 * Un solo camino para todos los botones de instalar el OS: este módulo detecta el
 * dispositivo, trae la última versión publicada en GitHub (con la caché de 6 h y el
 * respaldo de `ultima-version.ts`), decide con `planInstalarOS` (puro, probado aparte) y
 * lanza la descarga AL MOMENTO.
 *
 * Por qué la descarga es un enlace y no un fetch: los archivos de GitHub Releases no
 * admiten CORS, así que una web no puede leerlos; lo que sí puede es navegar al enlace
 * directo, y GitHub responde «descárgalo» (Content-Disposition: attachment): el
 * navegador lo guarda en Descargas sin salir de la página. Si el navegador bloquea el
 * enlace, se abre la dirección en otra pestaña, y la interfaz siempre deja visible un
 * enlace «Descargar de nuevo» por si ninguna de las dos cosas funcionó.
 *
 * Gesto de la persona: los navegadores solo dejan lanzar descargas, ventanas y el diálogo
 * de instalar la web DENTRO de su clic. Por eso el hook pide la versión al montar y, al
 * pulsar, casi siempre tiene ya todo listo y actúa sin esperar.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import type { DispositivoParaInstalar } from "@/lib/apps-oficiales/apps-oficiales";
import { esAppNativa, useDispositivoActual } from "@/lib/apps-oficiales/dispositivo-actual";
import { obtenerUltimaVersion, useUltimaVersion, type OrigenVersion } from "@/lib/apps-oficiales/ultima-version";
import { canInstallPWA, initPwaCapture, isRunningStandalone, promptInstallPWA, PWA_STATE_EVENT } from "@/lib/install/device-install";

import { OS_APP_ID, planInstalarOS, type PlanInstalarOS } from "./instalar-os-logica";

/**
 * Lanza la descarga de un archivo. `via: "enlace"` (navegador): un `<a download>` pulsado
 * por código; si falla, la dirección en otra pestaña. `via: "ventana"` (app nativa): el
 * sistema resuelve la descarga con su propio gestor. true si se pudo lanzar.
 */
export function lanzarDescarga(url: string, archivo: string, via: "enlace" | "ventana" = "enlace"): boolean {
    if (typeof window === "undefined" || typeof document === "undefined") return false;
    // Con «noopener» window.open devuelve null aunque abra: solo una excepción dice que falló.
    const abrirVentana = (): boolean => {
        try {
            window.open(url, "_blank", "noopener,noreferrer");
            return true;
        } catch {
            return false;
        }
    };
    if (via === "ventana") return abrirVentana();
    try {
        const a = document.createElement("a");
        a.href = url;
        a.download = archivo;
        a.rel = "noopener noreferrer";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        a.remove();
        return true;
    } catch {
        return abrirVentana();
    }
}

export interface ResultadoInstalarOS {
    plan: PlanInstalarOS;
    /** La descarga del archivo arrancó. */
    descargaIniciada: boolean;
    /** Resultado del diálogo de instalar la web, si se lanzó. */
    pwa?: "accepted" | "dismissed" | "unavailable";
}

/**
 * Ejecuta un plan ya decidido. Síncrono hasta el diálogo de la web (que es asíncrono por
 * naturaleza): así la descarga sale dentro del clic de la persona.
 */
export function ejecutarPlanOS(plan: PlanInstalarOS): { resultado: ResultadoInstalarOS; pwa?: Promise<ResultadoInstalarOS> } {
    if (plan.tipo === "descargar") {
        const ok = lanzarDescarga(plan.asset.url, plan.asset.nombre, "enlace");
        return { resultado: { plan, descargaIniciada: ok } };
    }
    if (plan.tipo === "web" && plan.usarPwa) {
        const pwa = promptInstallPWA().then((r) => ({ plan, descargaIniciada: false, pwa: r }));
        return { resultado: { plan, descargaIniciada: false }, pwa };
    }
    return { resultado: { plan, descargaIniciada: false } };
}

export interface EstadoInstalarOS {
    plan: PlanInstalarOS;
    dispositivo: DispositivoParaInstalar;
    /** Aún no llegó la respuesta de GitHub (el plan usa la caché o el respaldo). */
    cargando: boolean;
    origen: OrigenVersion;
    release: ReturnType<typeof useUltimaVersion>["release"];
    /** Pulsar «Instalar»: decide y lanza. Úsalo DENTRO del manejador del clic. */
    instalar: () => Promise<ResultadoInstalarOS>;
}

/**
 * Hook del botón «Instalar StarSeed OS». `activo = false` no pide nada a GitHub (sirve
 * para componentes que lo montan siempre pero solo lo usan con el OS).
 */
export function useInstalarOS(activo = true): EstadoInstalarOS {
    const version = useUltimaVersion(activo ? OS_APP_ID : "");
    const dispositivo = useDispositivoActual();
    const [entorno, setEntorno] = useState({ esNativa: false, esStandalone: false, puedePwa: false });

    useEffect(() => {
        if (!activo || typeof window === "undefined") return;
        initPwaCapture();
        const leer = () =>
            setEntorno({ esNativa: esAppNativa(), esStandalone: isRunningStandalone(), puedePwa: canInstallPWA() });
        leer();
        window.addEventListener(PWA_STATE_EVENT, leer);
        return () => window.removeEventListener(PWA_STATE_EVENT, leer);
    }, [activo]);

    const plan = useMemo(
        () =>
            planInstalarOS({
                release: version.release,
                origen: version.origen,
                dispositivo,
                ...entorno,
            }),
        [version.release, version.origen, dispositivo, entorno],
    );

    const instalar = useCallback(async (): Promise<ResultadoInstalarOS> => {
        let elegido = plan;
        // Sin respuesta de GitHub todavía: se espera un poco (4 s como mucho) para no bajar
        // una versión vieja. Casi nunca pasa: la petición salió al montar el botón.
        if (version.cargando) {
            const r = await obtenerUltimaVersion(OS_APP_ID, { timeoutMs: 4000 });
            if (r) elegido = planInstalarOS({ release: r.release, origen: r.origen, dispositivo, ...entorno });
        }
        const { resultado, pwa } = ejecutarPlanOS(elegido);
        return pwa ? pwa : resultado;
    }, [plan, version.cargando, dispositivo, entorno]);

    return { plan, dispositivo, cargando: version.cargando, origen: version.origen, release: version.release, instalar };
}
