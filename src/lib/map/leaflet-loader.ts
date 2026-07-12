// src/lib/map/leaflet-loader.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cargador SSR-safe de LEAFLET 1.9.4 por CDN (unpkg) — SIN dependencia npm.
// SOP: architecture/centro-creacion-sync-permisos.md §12 (Mapas en el Hub).
//
// Por qué CDN y no npm: la regla de esta ola es "sin dependencias de build".
// Leaflet es un UMD clásico que expone `window.L`; inyectamos <link> + <script>
// UNA sola vez (idempotente, HMR-safe) y devolvemos una promesa de `window.L`.
//
// Tipado: `any` a propósito — no hay @types/leaflet en el repo y no vamos a
// añadirlo. Los consumidores usan `LeafletNS` (alias de any) para dejar claro
// en las firmas qué es "el namespace L".
// ─────────────────────────────────────────────────────────────────────────────

/** Namespace global de Leaflet (window.L). Tipado laxo a propósito (sin @types). */
export type LeafletNS = any;

const LEAFLET_VERSION = "1.9.4";
const CSS_URL = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const JS_URL = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
const CSS_ID = "starseed-leaflet-css";
const JS_ID = "starseed-leaflet-js";

let pending: Promise<LeafletNS> | null = null;

function injectCssOnce(): void {
    if (document.getElementById(CSS_ID)) return;
    const link = document.createElement("link");
    link.id = CSS_ID;
    link.rel = "stylesheet";
    link.href = CSS_URL;
    // SRI publicado por Leaflet 1.9.4 (mismo que su snippet oficial).
    link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
    link.crossOrigin = "";
    document.head.appendChild(link);
}

/**
 * Carga Leaflet 1.9.4 desde CDN y resuelve con `window.L`.
 *  · SSR-safe: en el servidor rechaza sin tocar nada (llámalo solo en efectos).
 *  · Idempotente: múltiples llamadas comparten la misma promesa; si ya está
 *    cargado, resuelve al instante.
 *  · Tolerante: si el <script> falla (sin red), la promesa se rechaza y se
 *    limpia el estado para permitir REINTENTAR en la próxima llamada.
 */
export function loadLeaflet(): Promise<LeafletNS> {
    if (typeof window === "undefined" || typeof document === "undefined") {
        return Promise.reject(new Error("Leaflet solo puede cargarse en el navegador."));
    }
    const w = window as unknown as { L?: LeafletNS };
    if (w.L && typeof w.L.map === "function") return Promise.resolve(w.L);
    if (pending) return pending;

    pending = new Promise<LeafletNS>((resolve, reject) => {
        try {
            injectCssOnce();

            const done = () => {
                const L = (window as unknown as { L?: LeafletNS }).L;
                if (L && typeof L.map === "function") resolve(L);
                else {
                    pending = null;
                    reject(new Error("Leaflet cargó pero window.L no está disponible."));
                }
            };
            const fail = () => {
                pending = null;
                // Retira el script roto para que un reintento pueda reinyectarlo.
                try { document.getElementById(JS_ID)?.remove(); } catch { /* noop */ }
                reject(new Error("No se pudo cargar Leaflet desde el CDN (¿sin conexión?)."));
            };

            const existing = document.getElementById(JS_ID) as HTMLScriptElement | null;
            if (existing) {
                // Otro consumidor ya lo inyectó: espera a que termine.
                existing.addEventListener("load", done, { once: true });
                existing.addEventListener("error", fail, { once: true });
                return;
            }

            const script = document.createElement("script");
            script.id = JS_ID;
            script.src = JS_URL;
            script.async = true;
            script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
            script.crossOrigin = "";
            script.addEventListener("load", done, { once: true });
            script.addEventListener("error", fail, { once: true });
            document.head.appendChild(script);
        } catch (e) {
            pending = null;
            reject(e instanceof Error ? e : new Error("Fallo inyectando Leaflet."));
        }
    });
    return pending;
}
