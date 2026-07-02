"use client";

/*
 * SystemChrome — chrome global del sistema (montado UNA vez vía
 * SovereignSyncMount en el RootLayout).
 * ---------------------------------------------------------------------------
 * 1) PANTALLA COMPLETA AUTOMÁTICA: los navegadores solo permiten fullscreen
 *    con activación de usuario, así que en el PRIMER gesto (pointerdown o
 *    keydown) pedimos document.documentElement.requestFullscreen con la UI de
 *    navegación oculta. Solo UNA VEZ por pestaña (sessionStorage
 *    'starseed.fs.tried'): si el usuario sale después, se respeta su decisión.
 *    Defensivo por diseño — NO actúa:
 *      · dentro de iframes/previews (window.self !== window.top),
 *      · si ya está en fullscreen (document.fullscreenElement),
 *      · instalado como app (display-mode standalone/fullscreen o
 *        navigator.standalone en iOS), donde el SO ya retiró el chrome.
 * 2) CustomEvent 'starseed:toggle-fullscreen': alterna el fullscreen NATIVO
 *    del navegador (además del modo inmersivo interno que ya escucha el
 *    dashboard con el mismo evento). detail.active === true/false fuerza
 *    entrar/salir; sin detail, alterna.
 * No renderiza nada.
 */

import { useEffect } from "react";

const FS_TRIED_KEY = "starseed.fs.tried";

function inIframe(): boolean {
    try { return window.self !== window.top; } catch { return true; }
}

function isStandaloneDisplay(): boolean {
    try {
        return (
            window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
            window.matchMedia?.("(display-mode: fullscreen)")?.matches === true ||
            // iOS Safari instalado en la pantalla de inicio.
            (navigator as unknown as { standalone?: boolean }).standalone === true
        );
    } catch { return false; }
}

function enterFullscreen(): void {
    try {
        const el = document.documentElement as HTMLElement & {
            webkitRequestFullscreen?: () => Promise<void> | void;
        };
        if (typeof el.requestFullscreen === "function") {
            // navigationUI:'hide' → inmersión total (sin barras del navegador).
            const p = el.requestFullscreen({ navigationUI: "hide" });
            void p?.catch?.(() => { /* permiso denegado: silencio */ });
        } else if (typeof el.webkitRequestFullscreen === "function") {
            void el.webkitRequestFullscreen(); // Safari antiguo
        }
    } catch { /* API no soportada: silencio */ }
}

function exitFullscreen(): void {
    try {
        if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
            void document.exitFullscreen().catch(() => { /* noop */ });
        }
    } catch { /* noop */ }
}

export function SystemChrome(): null {
    useEffect(() => {
        if (typeof window === "undefined" || typeof document === "undefined") return;
        if (inIframe()) return; // jamás dentro de previews/iframes embebidos

        // ── Pantalla completa en el primer gesto (1 intento por pestaña) ──
        const alreadyTried = (() => {
            try { return sessionStorage.getItem(FS_TRIED_KEY) === "1"; } catch { return false; }
        })();

        const removeGestureListeners = () => {
            window.removeEventListener("pointerdown", onFirstGesture);
            window.removeEventListener("keydown", onFirstGesture);
        };

        function onFirstGesture() {
            removeGestureListeners();
            try { sessionStorage.setItem(FS_TRIED_KEY, "1"); } catch { /* noop */ }
            if (document.fullscreenElement || isStandaloneDisplay()) return;
            enterFullscreen();
        }

        if (!alreadyTried && !isStandaloneDisplay() && !document.fullscreenElement) {
            window.addEventListener("pointerdown", onFirstGesture, { passive: true });
            window.addEventListener("keydown", onFirstGesture);
        }

        // ── Alternador global: CustomEvent 'starseed:toggle-fullscreen' ──
        const onToggle = (e: Event) => {
            const active = (e as CustomEvent).detail?.active as boolean | undefined;
            if (active === true) {
                if (!document.fullscreenElement) enterFullscreen();
                return;
            }
            if (active === false) {
                exitFullscreen();
                return;
            }
            if (document.fullscreenElement) exitFullscreen();
            else enterFullscreen();
        };
        window.addEventListener("starseed:toggle-fullscreen", onToggle as EventListener);

        return () => {
            removeGestureListeners();
            window.removeEventListener("starseed:toggle-fullscreen", onToggle as EventListener);
        };
    }, []);

    return null;
}
