"use client";

/**
 * StarSeed XR · ENTRADA GLOBAL (XR1010F · contrato `architecture/starseed-xr.md` §0.6 y §3 c).
 *
 * Pinta el botón «Entrar en VR/AR» en la esquina inferior izquierda, por encima del dock y
 * lejos del orbe de Aurora (que vive a la derecha), SOLO cuando el aparato ofrece algún modo
 * inmersivo. Al pulsar NO abre la sesión aquí: navega a `/xr/os?modo=vr|ar` y allí (XR1010G)
 * se carga el motor 3D. Este archivo y lo que importa no traen Three, uikit, rapier, vrm ni
 * spark: solo React, Next, lucide y los módulos XR1010B/E.
 */

import { useCallback, useState, type MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BotonEntradaXR } from "./boton-entrada-xr";
import { textoEntrada } from "./texto-entrada";
import { useCapacidadesXR } from "./use-capacidades-xr";
import {
    CLAVE_SUGERENCIA_XR,
    CLAVE_SUGERENCIA_XR_LEGADA,
    descartarSugerencia,
    leerDescarte,
    sugerirEntradaXR,
    type DescartadaHasta,
} from "./sugerencia-entrada";

/** Clave antigua (v1), solo de lectura: «1» se respeta como «No volver a sugerir». */
export const CLAVE_BOTON_OCULTO = CLAVE_SUGERENCIA_XR_LEGADA;

/** Lee lo que la persona cerró, sin romperse cuando el navegador bloquea el almacenamiento. */
export function leerSugerenciaCerrada(): DescartadaHasta {
    try {
        if (typeof localStorage === "undefined") return null;
        return leerDescarte(localStorage.getItem(CLAVE_SUGERENCIA_XR), localStorage.getItem(CLAVE_SUGERENCIA_XR_LEGADA));
    } catch {
        return null;
    }
}

/** Guarda el cierre con try/catch: un `localStorage` que lanza no rompe la vista. */
export function guardarSugerenciaCerrada(ahora: number, siempre: boolean): void {
    try {
        if (typeof localStorage === "undefined") return;
        localStorage.setItem(CLAVE_SUGERENCIA_XR, descartarSugerencia(ahora, siempre));
    } catch {
        // Sin almacenamiento el cierre dura lo que esta vista.
    }
}

/** Rutas donde la entrada flotante no se pinta: la consola y la propia sesión inmersiva. */
export function esRutaSinEntradaGlobal(ruta: string | null): boolean {
    if (!ruta) return false;
    return (
        ruta === "/genesis" ||
        ruta.startsWith("/genesis/") ||
        ruta === "/xr/os" ||
        ruta.startsWith("/xr/os/")
    );
}

/** De la etiqueta honesta del botón al parámetro que entiende `/xr/os`. */
export function modoDeEntrada(etiqueta: string): "vr" | "ar" {
    return etiqueta.includes("VR") ? "vr" : "ar";
}

export function EntradaGlobalXR() {
    const ruta = usePathname();
    const router = useRouter();
    const { estado, datos, capacidades, plan } = useCapacidadesXR();
    const [cerrada, setCerrada] = useState<DescartadaHasta>(leerSugerenciaCerrada);
    // Solo se sugiere con soporte REAL confirmado por `isSessionSupported`; sondeando no se pinta.
    const sugerencia = sugerirEntradaXR({
        soporte: { tieneXR: datos.tieneXR, vr: datos.vr, ar: datos.ar },
        descartadaHasta: cerrada,
        ahora: Date.now(),
    });
    const cerrar = (siempre: boolean) => {
        const ahora = Date.now();
        guardarSugerenciaCerrada(ahora, siempre);
        setCerrada(leerDescarte(descartarSugerencia(ahora, siempre)));
    };

    const alPulsar = useCallback(
        (evento: MouseEvent<HTMLDivElement>) => {
            const boton = (evento.target as HTMLElement).closest("button");
            if (!boton) return;
            evento.preventDefault();
            evento.stopPropagation();
            const etiqueta = boton.getAttribute("aria-label") ?? boton.textContent ?? "";
            router.push(`/xr/os?modo=${modoDeEntrada(etiqueta)}`);
        },
        [router],
    );

    const texto = textoEntrada(capacidades, plan, estado === "sondeando", !datos.seguro);
    if (!sugerencia.mostrar || esRutaSinEntradaGlobal(ruta) || texto.botones.length === 0) return null;

    return (
        <div data-testid="entrada-global-xr">
            <div className="fixed bottom-40 left-24 z-50 flex items-center gap-1.5">
                <button
                    type="button"
                    aria-label="Cerrar la sugerencia de entrar en VR o AR"
                    title="Cerrar la sugerencia (volverá a sugerirse en unas semanas)"
                    onClick={() => cerrar(false)}
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-[#0E101E] text-base leading-none text-[#F5F7FF] shadow transition hover:bg-[#060814] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]/70"
                >
                    ×
                </button>
                <button
                    type="button"
                    onClick={() => cerrar(true)}
                    title="No volver a sugerir; sigue disponible en el Centro de Control"
                    className="inline-flex h-8 cursor-pointer items-center rounded-full border border-white/15 bg-[#0E101E] px-3 text-xs text-[#B9C0D8] shadow transition hover:bg-[#060814] hover:text-[#F5F7FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]/70"
                >
                    No volver a sugerir
                </button>
            </div>
            {/* El botón de XR1010E es `fixed`; se ancla a 96 px de la izquierda y del pie
                (bottom-24/left-24) y se desactiva su `right-4` para no tapar el orbe de Aurora. */}
            <div
                onClickCapture={alPulsar}
                className="[&_[data-testid=boton-entrada-xr]]:!bottom-24 [&_[data-testid=boton-entrada-xr]]:!left-24 [&_[data-testid=boton-entrada-xr]]:!right-auto"
            >
                <BotonEntradaXR variante="flotante" />
            </div>
        </div>
    );
}
