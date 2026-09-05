"use client";

/**
 * Indicador de carga GLOBAL, ligero y adaptativo (2026-09-05)
 * ─────────────────────────────────────────────────────────────────────────────
 * Una línea de 2 px en el borde superior que se enciende cuando el sistema está
 * cargando ALGO —un cambio de ruta o peticiones `fetch` en vuelo— y se apaga sola.
 * Diseñado para NO frenar lo que mide:
 *
 *   · Un solo nodo fijo, animado solo con `transform`/`opacity` (capa del
 *     compositor: ni layout ni pintura del resto de la página).
 *   · Se enciende tras un umbral (250 ms): una carga corta no parpadea nada.
 *   · Cuenta las peticiones con un envoltorio de `window.fetch` que solo suma y
 *     resta un entero; el sondeo periódico (estado del Mando, salud de voz,
 *     latidos, telemetría…) queda fuera para que la barra hable de lo que el
 *     usuario espera, no de lo que el OS vigila en segundo plano.
 *   · Adaptativo: con `prefers-reduced-motion`, `saveData` o poca memoria
 *     (`deviceMemory` ≤ 4) la línea se muestra fija, sin desplazamiento.
 *   · Las actualizaciones de estado van por `requestAnimationFrame` y solo
 *     cuando cambia visible/oculto: nada de re-render por cada petición.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/** Peticiones de vigilancia que no cuentan como «cargando». */
const IGNORADAS = [
    /\/api\/mando\/(estado|ramificacion|agentes|latidos)/,
    /\/api\/voz(-local)?\/(salud|status)/,
    /\/api\/ai\/astraura-158\/api\/(starseed\/events|notifications|starseed\/health)/,
    /\/_next\//,
    /\/rest\/v1\/relevo_eventos/,
    /\/realtime\/v1/,
    /\/api\/(sync|salud|health|ping|heartbeat)/,
];

const UMBRAL_MS = 250;      // no se enciende para cargas más cortas
const MINIMO_VISIBLE_MS = 350;

type Fetch = typeof window.fetch;

let enVuelo = 0;
let envuelto = false;
const oyentes = new Set<() => void>();

function avisar(): void {
    for (const o of oyentes) o();
}

/** ¿Esta petición cuenta como «el sistema está cargando algo para el usuario»? */
export function cuentaComoCarga(url: string): boolean {
    return !IGNORADAS.some((re) => re.test(url));
}

function urlDe(entrada: RequestInfo | URL): string {
    try {
        if (typeof entrada === "string") return entrada;
        if (entrada instanceof URL) return entrada.href;
        return entrada.url;
    } catch {
        return "";
    }
}

/** Envuelve `window.fetch` una sola vez por página. Nunca cambia el resultado. */
function envolverFetch(): void {
    if (envuelto || typeof window === "undefined" || typeof window.fetch !== "function") return;
    envuelto = true;
    const original: Fetch = window.fetch.bind(window);
    const conContador: Fetch = (entrada, init) => {
        const url = urlDe(entrada);
        const cuenta = cuentaComoCarga(url);
        if (cuenta) {
            enVuelo += 1;
            avisar();
        }
        const p = original(entrada, init);
        if (cuenta) {
            const cerrar = () => {
                enVuelo = Math.max(0, enVuelo - 1);
                avisar();
            };
            p.then(cerrar, cerrar);
        }
        return p;
    };
    window.fetch = conContador;
}

export function IndicadorCargaGlobal() {
    const pathname = usePathname();
    const [visible, setVisible] = useState(false);
    const [suave, setSuave] = useState(false);
    const rutaPendiente = useRef(false);
    const desde = useRef(0);
    const temporizador = useRef<number | null>(null);
    const cuadro = useRef<number | null>(null);
    const visibleRef = useRef(false);

    // Modo suave: sin desplazamiento si el equipo o el usuario lo piden.
    useEffect(() => {
        try {
            const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
            const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            setSuave(reducido || nav.connection?.saveData === true || (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4));
        } catch {
            setSuave(false);
        }
    }, []);

    // Cambio de ruta: un clic en un enlace interno enciende la espera; el cambio
    // real de `pathname` la apaga.
    useEffect(() => {
        rutaPendiente.current = false;
        avisar();
    }, [pathname]);

    useEffect(() => {
        envolverFetch();
        const alClic = (e: MouseEvent) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
            if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
            const href = a.getAttribute("href") ?? "";
            if (!href.startsWith("/") || href.startsWith("//")) return;
            const destino = href.split("#")[0];
            if (destino === window.location.pathname + window.location.search) return;
            rutaPendiente.current = true;
            avisar();
            // Si la navegación no llega (enlace interceptado, misma página…), no
            // se queda encendida: 8 s de cortesía.
            window.setTimeout(() => {
                if (rutaPendiente.current) {
                    rutaPendiente.current = false;
                    avisar();
                }
            }, 8000);
        };
        document.addEventListener("click", alClic, true);

        const evaluar = () => {
            cuadro.current = null;
            const cargando = enVuelo > 0 || rutaPendiente.current;
            if (cargando && !visibleRef.current) {
                if (temporizador.current == null) {
                    temporizador.current = window.setTimeout(() => {
                        temporizador.current = null;
                        if (enVuelo > 0 || rutaPendiente.current) {
                            visibleRef.current = true;
                            desde.current = Date.now();
                            setVisible(true);
                        }
                    }, UMBRAL_MS);
                }
                return;
            }
            if (!cargando) {
                if (temporizador.current != null) {
                    window.clearTimeout(temporizador.current);
                    temporizador.current = null;
                }
                if (visibleRef.current) {
                    const resta = Math.max(0, MINIMO_VISIBLE_MS - (Date.now() - desde.current));
                    window.setTimeout(() => {
                        if (enVuelo === 0 && !rutaPendiente.current) {
                            visibleRef.current = false;
                            setVisible(false);
                        }
                    }, resta);
                }
            }
        };
        const oyente = () => {
            if (cuadro.current == null) cuadro.current = window.requestAnimationFrame(evaluar);
        };
        oyentes.add(oyente);
        oyente();
        return () => {
            oyentes.delete(oyente);
            document.removeEventListener("click", alClic, true);
            if (temporizador.current != null) window.clearTimeout(temporizador.current);
            if (cuadro.current != null) window.cancelAnimationFrame(cuadro.current);
        };
    }, []);

    return (
        <div
            aria-hidden={!visible}
            role="progressbar"
            aria-label="Cargando"
            aria-busy={visible}
            data-testid="indicador-carga-global"
            data-visible={visible ? "1" : "0"}
            className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-0.5 overflow-hidden"
            style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms ease" }}
        >
            <div
                className="h-full w-full bg-gradient-to-r from-cyan-400/0 via-cyan-300 to-violet-400/0"
                style={{
                    transformOrigin: "left",
                    willChange: visible ? "transform" : undefined,
                    animation: visible && !suave ? "starseed-carga-global 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite" : undefined,
                    transform: suave ? "scaleX(1)" : undefined,
                }}
            />
            <style>{`@keyframes starseed-carga-global{0%{transform:translateX(-100%) scaleX(0.4)}50%{transform:translateX(20%) scaleX(0.6)}100%{transform:translateX(100%) scaleX(0.4)}}`}</style>
        </div>
    );
}
