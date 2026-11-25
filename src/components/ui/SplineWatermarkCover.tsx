"use client";

/*
 * SplineWatermarkCover — elimina el logotipo "Built with Spline" que el runtime
 * de @splinetool/runtime inyecta cuando la escena se carga desde la nube
 * (prod.spline.design). El intento anterior fallaba porque la máscara vivía
 * DENTRO del wrapper del fondo (z-index -10/-40) y no podía cubrir un elemento
 * que el runtime pinta por encima. Aquí actuamos a NIVEL RAÍZ con dos capas:
 *
 *   1) Eliminador JS robusto — recorre el DOM y TAMBIÉN los shadow roots (el
 *      runtime a veces aloja el logo dentro de un shadow DOM), ocultando y
 *      retirando cualquier <a>/elemento que apunte a spline o cuyo texto sea
 *      "Built with Spline". Observador permanente + intervalo de respaldo.
 *      (DIR1125A) La purga vive en `@/lib/perf/purga-marca-spline`: coste lineal y
 *      mutaciones agrupadas; antes saturaba el hilo principal en equipos modestos.
 *
 *   2) Tapones visuales garantizados — degradados pequeños fijos en AMBAS
 *      esquinas inferiores (izquierda y derecha), con pointer-events:none,
 *      que se funden con el fondo. Cubren el caso en que el logo se dibuje en
 *      el <canvas> y no sea un nodo del DOM eliminable, aparezca en la esquina
 *      que aparezca. No estorban: el dock vive abajo-centro y los clics pasan.
 */

import React, { useEffect } from "react";
import { RESPALDO_MS, crearPurgador } from "@/lib/perf/purga-marca-spline";

// Parche a NIVEL DE MÓDULO (se ejecuta al importar, antes de que monte Spline):
// fuerza que cualquier shadow root se cree en modo "open". El runtime de Spline
// aloja su watermark dentro de un shadow DOM CERRADO que querySelectorAll no
// puede atravesar; abriéndolo, el purgado de abajo sí lo alcanza.
if (typeof window !== "undefined" && !(window as any).__ssAttachShadowOpen) {
    try {
        (window as any).__ssAttachShadowOpen = true;
        const orig = Element.prototype.attachShadow;
        Element.prototype.attachShadow = function (init: ShadowRootInit) {
            return orig.call(this, { ...init, mode: "open" });
        };
    } catch { /* noop */ }
}

export function SplineWatermarkCover() {
    useEffect(() => {
        const purgador = crearPurgador(document);
        purgador.completa();
        const unaVez = [200, 700, 1500, 3000, 6000].map((ms) => window.setTimeout(() => purgador.completa(), ms));
        const obs = typeof MutationObserver === "undefined" ? null : new MutationObserver((registros) => purgador.alMutar(registros));
        try { obs?.observe(document.documentElement, { childList: true, subtree: true }); } catch { /* noop */ }
        // Respaldo lento, y solo si hay algún <canvas>: sin escena de Spline no hay marca que quitar.
        const iv = window.setInterval(() => {
            if (document.getElementsByTagName("canvas").length > 0) purgador.completa();
        }, RESPALDO_MS);
        return () => {
            obs?.disconnect();
            clearInterval(iv);
            unaVez.forEach((t) => clearTimeout(t));
            purgador.parar();
        };
    }, []);

    // Tres capas de defensa:
    //  a) El logo se elimina EN LA FUENTE desactivando el pase WebGL del
    //     watermark en SplineBackground (pipeline.logoOverlayPass).
    //  b) Purgado del DOM + shadow roots (arriba) por href/aria/texto.
    //  c) TAPONES visuales garantizados en AMBAS esquinas inferiores: degradados
    //     discretos del color del fondo que cubren cualquier rótulo dibujado
    //     dentro del <canvas> (no purgable como nodo). pointer-events-none:
    //     jamás bloquean clics; z bajo para no tapar dock/FAB/diálogos.
    return (
        <>
            <div
                aria-hidden
                className="pointer-events-none fixed bottom-0 left-0 z-[30] h-14 w-44 select-none"
                style={{ background: "radial-gradient(130% 150% at 0% 100%, hsl(var(--background-hsl) / 0.92) 0%, hsl(var(--background-hsl) / 0.5) 48%, transparent 74%)" }}
            />
            <div
                aria-hidden
                className="pointer-events-none fixed bottom-0 right-0 z-[30] h-14 w-44 select-none"
                style={{ background: "radial-gradient(130% 150% at 100% 100%, hsl(var(--background-hsl) / 0.92) 0%, hsl(var(--background-hsl) / 0.5) 48%, transparent 74%)" }}
            />
        </>
    );
}
