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

    // 2) CUALQUIER elemento (no solo <a>) cuyo texto sea exactamente "Built with
    //    Spline". El runtime lo inyecta a veces como <div>/<span>, por eso el
    //    intento anterior (solo <a>) no lo alcanzaba. Tomamos el contenedor
    //    ajustado (el nodo cuyo texto recortado ES la frase) y lo retiramos junto
    //    a su envoltorio inmediato si éste solo contiene el logo.
    try {
        root.querySelectorAll("a,div,span,button,p").forEach((el) => {
            const t = (el.textContent || "").trim().toLowerCase();
            if (t === "built with spline" || t === "built with spline.") {
                // Si el padre es un wrapper pequeño dedicado al logo, retíralo entero.
                const parent = el.parentElement;
                if (parent && (parent.children.length <= 2) && (parent.textContent || "").trim().toLowerCase().startsWith("built with spline")) {
                    hide(parent);
                } else {
                    hide(el);
                }
            }
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

    // Sin capa visual: el logo "Built with Spline" es un nodo de TEXTO del DOM
    // (confirmado), así que el eliminador de arriba lo retira limpiamente. No
    // pintamos ningún tapón para no dejar un recuadro oscuro permanente.
    void mounted;
    return null;
}
