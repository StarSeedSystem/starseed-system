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
 * 3) (PER1108A) En la APP NATIVA nunca se pide pantalla completa de ELEMENTO: WKWebView la deja en otro Space con
 *    un marcador borroso en la ventana y, tras relanzar, un clic ahí la congelaba. Allí se usa la pantalla
 *    completa de la VENTANA (comando `ventana_pantalla_completa`). Además se sale siempre de la de elemento
 *    al ocultarse o descargarse la página, si quedó obsoleta o si la app abre con una restaurada.
 *    Lógica y razones: src/lib/nativa/pantalla-completa.ts.
 * No renderiza nada.
 */

import { useEffect } from "react";
import { esAppNativa, puenteNativo } from "@/lib/nativa/puente";
import {
    COMANDO_PANTALLA_VENTANA,
    crearVigilante,
    decidirPantalla,
    pedirEnPrimerGesto,
    type DocumentoMinimo,
    type VentanaMinima,
} from "@/lib/nativa/pantalla-completa";

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

// Pantalla completa de la ventana nativa (solo la app de escritorio la cambia, y solo por este módulo).
let ventanaCompleta = false;

async function aplicarEnVentana(activo: boolean): Promise<void> {
    try {
        const r = await puenteNativo().llamar<unknown>(COMANDO_PANTALLA_VENTANA, { activo });
        if (r.ok) ventanaCompleta = activo;
    } catch { /* sin ventana que ampliar (Android): silencio */ }
}

function pedirPantalla(activo?: boolean): void {
    const nativa = esAppNativa();
    const accion = decidirPantalla({ nativa, elementoCompleto: !!document.fullscreenElement, ventanaCompleta, activo });
    if (accion === "ventana-entrar") void aplicarEnVentana(true);
    else if (accion === "ventana-salir") void aplicarEnVentana(false);
    else if (accion === "elemento-entrar") enterFullscreen();
    else if (accion === "elemento-salir") exitFullscreen();
}

export function SystemChrome(): null {
    useEffect(() => {
        if (typeof window === "undefined" || typeof document === "undefined") return;
        if (inIframe()) return; // jamás dentro de previews/iframes embebidos

        // (PER1108A) Vigilante: sale de la pantalla completa de elemento al ocultar/descargar, si está obsoleta
        // o (app nativa) si había una restaurada al abrir. Barato: eventos, y un repaso cada 4 s solo en la nativa.
        const nativa = esAppNativa();
        const quitarVigilante = crearVigilante({
            doc: document as unknown as DocumentoMinimo,
            ventana: window as unknown as VentanaMinima,
            nativa,
            registrar: (m) => console.warn(m),
            cadaMs: nativa ? 4000 : 0,
            temporizador: { set: (f, ms) => window.setInterval(f, ms), clear: (id) => window.clearInterval(id as number) },
        });

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
            if (!pedirEnPrimerGesto({ nativa, iframe: false, instalada: false, yaIntentado: false, elementoCompleto: false })) return;
            enterFullscreen();
        }

        if (pedirEnPrimerGesto({ nativa, iframe: false, instalada: isStandaloneDisplay(), yaIntentado: alreadyTried, elementoCompleto: !!document.fullscreenElement })) {
            window.addEventListener("pointerdown", onFirstGesture, { passive: true });
            window.addEventListener("keydown", onFirstGesture);
        }

        // ── Alternador global: CustomEvent 'starseed:toggle-fullscreen' ──
        const onToggle = (e: Event) => {
            const active = (e as CustomEvent).detail?.active as boolean | undefined;
            pedirPantalla(typeof active === "boolean" ? active : undefined);
        };
        window.addEventListener("starseed:toggle-fullscreen", onToggle as EventListener);

        return () => {
            quitarVigilante();
            removeGestureListeners();
            window.removeEventListener("starseed:toggle-fullscreen", onToggle as EventListener);
        };
    }, []);

    return null;
}
