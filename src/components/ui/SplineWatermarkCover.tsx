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
 *
 *   2) Tapón visual garantizado — un degradado pequeño fijo en la esquina
 *      inferior derecha, con z-index alto y pointer-events:none, que se funde
 *      con el fondo. Cubre el caso en que el logo se dibuje en el <canvas> y no
 *      sea un nodo del DOM eliminable. No estorba: el dock vive abajo-centro.
 */

import React, { useEffect, useState } from "react";

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

function hide(el: Element | null) {
    if (!el) return;
    const h = el as HTMLElement;
    try {
        h.style.setProperty("display", "none", "important");
        h.style.setProperty("opacity", "0", "important");
        h.style.setProperty("visibility", "hidden", "important");
        h.style.setProperty("pointer-events", "none", "important");
    } catch { /* noop */ }
    try { h.parentNode?.removeChild(h); } catch { /* noop */ }
}

function purge(root: ParentNode) {
    // 1) Selectores directos del watermark del runtime de Spline.
    const sels = [
        'a[href*="spline.design"]',
        'a[href*="spline"]',
        '[aria-label*="Spline" i]',
        '[class*="spline-watermark" i]',
        '#spline-watermark',
    ];
    sels.forEach((sel) => {
        try { root.querySelectorAll(sel).forEach(hide); } catch { /* selector no soportado */ }
    });

    // 2) CUALQUIER elemento (no solo <a>) cuyo texto incluya "built with spline".
    //    El runtime lo inyecta como <a>/<div>/<span> con un SVG + texto, por eso
    //    el intento anterior (solo <a> exacto) no lo alcanzaba. Buscamos el nodo
    //    pequeño que contiene la frase y subimos hasta el contenedor de la píldora
    //    (pocos hijos) para retirarla entera.
    try {
        root.querySelectorAll("a,div,span,button,p,small").forEach((el) => {
            const t = (el.textContent || "").trim().toLowerCase();
            if (!t.includes("built with spline")) return;
            // Sube al ancestro "píldora": el último ancestro cuyo texto sigue siendo
            // solo el watermark (pocos hijos) → así retiramos el fondo redondeado.
            let target: HTMLElement = el as HTMLElement;
            for (let i = 0; i < 4; i++) {
                const p = target.parentElement;
                if (!p) break;
                const pt = (p.textContent || "").trim().toLowerCase();
                if (pt.includes("built with spline") && pt.length < 40 && p.childElementCount <= 3) {
                    target = p;
                } else break;
            }
            hide(target);
        });
    } catch { /* noop */ }
}

// Recorre el documento y todos los shadow roots accesibles.
function purgeDeep() {
    purge(document);
    try {
        const all = document.querySelectorAll("*");
        all.forEach((el) => {
            const sr = (el as HTMLElement).shadowRoot;
            if (sr) purge(sr);
        });
    } catch { /* noop */ }
}

export function SplineWatermarkCover() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        purgeDeep();
        [200, 700, 1500, 3000, 6000].forEach((ms) => window.setTimeout(purgeDeep, ms));
        const obs = new MutationObserver(() => purgeDeep());
        try { obs.observe(document.documentElement, { childList: true, subtree: true }); } catch { /* noop */ }
        const iv = window.setInterval(purgeDeep, 2500);
        return () => { obs.disconnect(); clearInterval(iv); };
    }, []);

    if (!mounted) return null;

    // Capa de respaldo GARANTIZADA: un cubre-esquina con desenfoque (no un bloque
    // sólido). Si el purgado del DOM no alcanzara el watermark (p.ej. dibujado en
    // canvas o shadow DOM cerrado no abierto a tiempo), este desenfoque difumina
    // la esquina inferior derecha y vuelve ilegible el logo, fundiéndose con los
    // colores del fondo en vez de dejar un recuadro duro. pointer-events:none.
    return (
        <div
            aria-hidden
            className="fixed bottom-0 right-0 pointer-events-none select-none"
            style={{
                width: 196,
                height: 56,
                zIndex: 2147483647,
                backdropFilter: "blur(16px) saturate(1.05)",
                WebkitBackdropFilter: "blur(16px) saturate(1.05)",
                background: "rgba(0,0,0,0.04)",
                borderTopLeftRadius: 24,
                maskImage: "radial-gradient(150% 150% at 100% 100%, #000 60%, transparent 92%)",
                WebkitMaskImage: "radial-gradient(150% 150% at 100% 100%, #000 60%, transparent 92%)",
            }}
        />
    );
}
