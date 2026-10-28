/**
 * INTERRUPTOR DE MOVIMIENTO (CVV1028 · tarea D). Modos «apagado» (fotograma
 * final quieto), «encendido» y «rayos-x» (etiqueta cada pieza con
 * `data-vivo="qué · cómo"` y `data-vivo-herramienta`). Lee y escribe
 * `?movimiento=` en la URL, respeta `prefers-reduced-motion` y emite
 * `contenido-vivo:modo`.
 */
export const EVENTO_MODO = "contenido-vivo:modo";
export const PARAMETRO_MOVIMIENTO = "movimiento";
export const ATRIBUTO_INTERRUPTOR = "data-vivo-interruptor-movimiento";
export const ATRIBUTO_ETIQUETA = "data-vivo-etiqueta";

export type ModoVivo = "apagado" | "encendido" | "rayos-x";
export const MODOS_VIVO: ModoVivo[] = ["apagado", "encendido", "rayos-x"];
export const ETIQUETAS_MODO: Record<ModoVivo, string> = { apagado: "Apagado", encendido: "Encendido", "rayos-x": "Rayos X" };

export interface OpcionesInterruptor { raiz?: HTMLElement; ventana?: Window; documento?: Document; reducirMovimiento?: boolean; }
export interface InterruptorMovimiento { boton: HTMLButtonElement; modo: () => ModoVivo; desmontar: () => void; }

export function normalizarModo(valor: string | null): ModoVivo | null {
    const v = (valor ?? "").trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "");
    if (v === "apagado" || v === "off") return "apagado";
    if (v === "encendido" || v === "on") return "encendido";
    if (v === "rayos-x" || v === "rayosx" || v === "x-ray" || v === "xray") return "rayos-x";
    return null;
}

/** El parámetro manda; sin parámetro, `prefers-reduced-motion` deja «apagado». «Rayos-x» no anima y siempre se permite. */
export function modoDesdeUrl(busqueda: string, reducirMovimiento: boolean): ModoVivo {
    let pedido: string | null = null;
    try { pedido = new URLSearchParams(busqueda).get(PARAMETRO_MOVIMIENTO); } catch { pedido = null; }
    const modo = normalizarModo(pedido);
    if (modo === "rayos-x") return "rayos-x";
    if (reducirMovimiento) return "apagado";
    return modo ?? "encendido";
}

export function urlConModo(href: string, modo: ModoVivo): string {
    const base = typeof window !== "undefined" ? window.location.href : "https://starseed.invalid/";
    try {
        const url = new URL(href, base);
        url.searchParams.set(PARAMETRO_MOVIMIENTO, modo);
        return `${url.pathname}${url.search}${url.hash}`;
    } catch { return href; }
}

export function leerPreferenciaReducida(ventana?: Window | null): boolean {
    try { return ventana?.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true; } catch { return false; }
}

function quitarEtiquetas(raiz: HTMLElement): void {
    for (const etiqueta of Array.from(raiz.querySelectorAll(`[${ATRIBUTO_ETIQUETA}]`))) etiqueta.remove();
}

function pintarEtiquetas(raiz: HTMLElement): void {
    const documento = raiz.ownerDocument ?? (typeof document !== "undefined" ? document : null);
    if (!documento) return;
    for (const pieza of Array.from(raiz.querySelectorAll<HTMLElement>("[data-vivo]"))) {
        const que = (pieza.getAttribute("data-vivo") ?? "").trim();
        if (!que) continue;
        const herramienta = (pieza.getAttribute("data-vivo-herramienta") ?? "").trim();
        const etiqueta = documento.createElement("span");
        etiqueta.setAttribute(ATRIBUTO_ETIQUETA, "");
        etiqueta.textContent = herramienta ? `${que} · ${herramienta}` : que;
        Object.assign(etiqueta.style, { position: "absolute", left: "0.5rem", bottom: "0.5rem", zIndex: "2", pointerEvents: "none" });
        pieza.appendChild(etiqueta);
    }
}

export function aplicarModo(modo: ModoVivo, raiz?: HTMLElement): void {
    const documento = raiz?.ownerDocument ?? (typeof document !== "undefined" ? document : null);
    const destino = raiz ?? documento?.documentElement ?? null;
    if (!destino) return;
    destino.setAttribute("data-movimiento", modo);
    quitarEtiquetas(destino);
    if (modo === "rayos-x") pintarEtiquetas(destino);
    documento?.defaultView?.dispatchEvent(new CustomEvent(EVENTO_MODO, { detail: { modo } }));
}

export function montarInterruptor(opciones: OpcionesInterruptor = {}): InterruptorMovimiento | null {
    const ventana = opciones.ventana ?? (typeof window !== "undefined" ? window : null);
    const documento = opciones.documento ?? ventana?.document ?? (typeof document !== "undefined" ? document : null);
    const raiz = opciones.raiz ?? documento?.documentElement ?? null;
    if (!ventana || !documento || !raiz) return null;
    const reducir = opciones.reducirMovimiento ?? leerPreferenciaReducida(ventana);
    let modo = modoDesdeUrl(ventana.location?.search ?? "", reducir);
    const boton = documento.createElement("button");
    boton.type = "button";
    boton.setAttribute(ATRIBUTO_INTERRUPTOR, "");
    boton.className = "vivo-interruptor";
    boton.style.cursor = "pointer";
    const pintarBoton = () => {
        boton.setAttribute("data-modo", modo);
        boton.setAttribute("aria-label", `Movimiento: ${ETIQUETAS_MODO[modo]}`);
        boton.textContent = `Movimiento: ${ETIQUETAS_MODO[modo]}`;
    };
    const aplicar = (siguiente: ModoVivo) => { modo = siguiente; aplicarModo(modo, raiz); pintarBoton(); };
    const alPulsar = () => {
        const i = MODOS_VIVO.indexOf(modo);
        const siguiente = MODOS_VIVO[(i + 1) % MODOS_VIVO.length] ?? "encendido";
        aplicar(siguiente);
        try { ventana.history.replaceState(ventana.history.state, "", urlConModo(ventana.location.href, siguiente)); } catch { /* URL no escribible */ }
    };
    const alCambiarPreferencia = (evento: MediaQueryListEvent) => { if (evento.matches && modo === "encendido") aplicar("apagado"); };
    boton.addEventListener("click", alPulsar);
    const consulta = typeof ventana.matchMedia === "function" ? ventana.matchMedia("(prefers-reduced-motion: reduce)") : null;
    consulta?.addEventListener?.("change", alCambiarPreferencia);
    aplicar(modo);
    raiz.appendChild(boton);
    return {
        boton,
        modo: () => modo,
        desmontar: () => {
            boton.removeEventListener("click", alPulsar);
            consulta?.removeEventListener?.("change", alCambiarPreferencia);
            boton.remove();
            raiz.removeAttribute("data-movimiento");
            quitarEtiquetas(raiz);
        },
    };
}
