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
 *   2) Tapones visuales garantizados — degradados pequeños fijos en AMBAS
 *      esquinas inferiores (izquierda y derecha), con pointer-events:none,
 *      que se funden con el fondo. Cubren el caso en que el logo se dibuje en
 *      el <canvas> y no sea un nodo del DOM eliminable, aparezca en la esquina
 *      que aparezca. No estorban: el dock vive abajo-centro y los clics pasan.
 */

import React, { useEffect } from "react";

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

// Normaliza texto para comparar: colapsa espacios/nbsp y pasa a minúsculas.
function norm(s: string | null | undefined): string {
    return (s || "").replace(/\s+/g, " ").trim().toLowerCase();
}

// ¿El texto corresponde al rótulo del watermark? Cubre "Built with Spline" y
// variantes con espaciados/nodos partidos ("built with" + "spline").
function isWatermarkText(t: string): boolean {
    if (!t) return false;
    return t.includes("built with spline") || (t.includes("spline") && t.includes("built"));
}

function purge(root: ParentNode) {
    // 1) Selectores directos del watermark del runtime de Spline: por href,
    //    aria y clase/id, todos case-insensitive (flag `i`).
    const sels = [
        'a[href*="spline.design" i]',
        'a[href*="spline" i]',
        '[aria-label*="spline" i]',
        '[aria-label*="built" i]',
        '[class*="spline-watermark" i]',
        '#spline-watermark',
    ];
    sels.forEach((sel) => {
        try { root.querySelectorAll(sel).forEach(hide); } catch { /* selector no soportado */ }
    });

    // 2) CUALQUIER elemento (no solo <a>) cuyo texto normalizado delate el
    //    rótulo. El runtime lo inyecta como <a>/<div>/<span> con un SVG +
    //    texto, en CUALQUIERA de las esquinas inferiores. Buscamos el nodo
    //    pequeño que contiene la frase y subimos hasta el contenedor de la
    //    píldora (pocos hijos) para retirarla entera.
    try {
        root.querySelectorAll("a,div,span,button,p,small").forEach((el) => {
            const t = norm(el.textContent);
            if (!isWatermarkText(t) || t.length > 60) return;
            // Sube al ancestro "píldora": el último ancestro cuyo texto sigue siendo
            // solo el watermark (pocos hijos) → así retiramos el fondo redondeado.
            let target: HTMLElement = el as HTMLElement;
            for (let i = 0; i < 4; i++) {
                const p = target.parentElement;
                if (!p) break;
                const pt = norm(p.textContent);
                if (isWatermarkText(pt) && pt.length < 40 && p.childElementCount <= 3) {
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
    useEffect(() => {
        purgeDeep();
        [200, 700, 1500, 3000, 6000].forEach((ms) => window.setTimeout(purgeDeep, ms));
        const obs = new MutationObserver(() => purgeDeep());
        try { obs.observe(document.documentElement, { childList: true, subtree: true }); } catch { /* noop */ }
        const iv = window.setInterval(purgeDeep, 2500);
        return () => { obs.disconnect(); clearInterval(iv); };
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
