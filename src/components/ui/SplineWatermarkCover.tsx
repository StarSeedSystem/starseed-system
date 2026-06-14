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

function purge(root: ParentNode) {
    const sels = [
        'a[href*="spline.design"]',
        'a[href*="spline"]',
        '[aria-label*="Spline" i]',
        '[class*="spline-watermark" i]',
        '#spline-watermark',
        '#logo',
    ];
    sels.forEach((sel) => {
        try {
            root.querySelectorAll(sel).forEach((el) => {
                const h = el as HTMLElement;
                // No tocar el logo de la propia app (StarSeed) por si casa con #logo.
                const txt = (h.textContent || "").toLowerCase();
                const href = (h.getAttribute("href") || "").toLowerCase();
                if (sel === "#logo" && !href.includes("spline") && !txt.includes("spline")) return;
                h.style.setProperty("display", "none", "important");
                h.style.setProperty("opacity", "0", "important");
                try { h.parentNode?.removeChild(h); } catch { /* noop */ }
            });
        } catch { /* selector no soportado */ }
    });
    // Respaldo por texto.
    try {
        root.querySelectorAll("a").forEach((a) => {
            if ((a.textContent || "").toLowerCase().includes("built with spline")) {
                (a as HTMLElement).style.setProperty("display", "none", "important");
                try { a.parentNode?.removeChild(a); } catch { /* noop */ }
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

    if (!mounted) return null;

    return (
        <div
            aria-hidden
            className="fixed bottom-0 right-0 z-[2147483647] pointer-events-none select-none"
            style={{
                width: 240,
                height: 78,
                // Sólido al 100% en la esquina (donde vive el logo) y degradado solo
                // en el borde interior para fundir con el fondo. z-index máximo posible
                // para garantizar que queda por encima de cualquier capa.
                background:
                    "radial-gradient(150% 150% at 100% 100%, hsl(var(--background)) 0%, hsl(var(--background)) 55%, hsl(var(--background)/0.9) 70%, transparent 88%)",
            }}
        />
    );
}
