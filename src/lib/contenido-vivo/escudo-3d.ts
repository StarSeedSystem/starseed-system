/**
 * ESCUDO 3D (CVV1028 · tarea D). Capa transparente sobre cada escena: la rueda
 * SIEMPRE desplaza la página. En escenas propias (my.spline.design o el visor
 * del OS) los gestos se reenvían por postMessage con coordenadas 0–1; en las
 * ajenas la capa solo protege el scroll, sin píldoras ni llamadas a jugar.
 */

export const EVENTO_ESCUDO = "contenido-vivo:escudo";
export const ATRIBUTO_ESCUDO = "data-vivo-escudo";

export type TipoGesto = "pointermove" | "pointerleave" | "pointerdown" | "pointerup" | "click";

export interface MensajeEscudo {
    origen: "contenido-vivo"; v: 1; tipo: TipoGesto; x: number; y: number; boton: number; punteroId: number;
}

export interface Rectangulo { left: number; top: number; width: number; height: number; }

const HOST_SPLINE_PROPIO = "my.spline.design";
const GESTOS: TipoGesto[] = ["pointermove", "pointerleave", "pointerdown", "pointerup", "click"];

function acotar(n: number): number { return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0; }

function urlDe(iframe: HTMLIFrameElement): URL | null {
    const src = iframe.getAttribute("src") ?? "";
    if (!src) return null;
    try { return new URL(src, iframe.ownerDocument?.baseURI || "https://starseed.invalid/"); } catch { return null; }
}

/** Propias: estudio propio de Spline o mismo origen del OS. Las de la comunidad (`prod.spline.design`) son ajenas. */
export function esEscenaPropia(iframe: HTMLIFrameElement): boolean {
    const url = urlDe(iframe);
    if (!url) return false;
    if (url.hostname === HOST_SPLINE_PROPIO) return true;
    const origen = iframe.ownerDocument?.defaultView?.location?.origin;
    return Boolean(origen) && url.origin === origen;
}

export function coordenadasRelativas(rect: Rectangulo, clientX: number, clientY: number): { x: number; y: number } {
    if (!(rect.width > 0) || !(rect.height > 0)) return { x: 0, y: 0 };
    return { x: acotar((clientX - rect.left) / rect.width), y: acotar((clientY - rect.top) / rect.height) };
}

export function mensajeDesdeEvento(
    tipo: TipoGesto,
    rect: Rectangulo,
    evento: { clientX: number; clientY: number; button?: number; pointerId?: number },
): MensajeEscudo {
    const { x, y } = coordenadasRelativas(rect, evento.clientX, evento.clientY);
    return { origen: "contenido-vivo", v: 1, tipo, x, y, boton: evento.button ?? 0, punteroId: evento.pointerId ?? 0 };
}

export function ponerEscudo(iframe: HTMLIFrameElement): () => void {
    const doc = iframe.ownerDocument;
    const padre = iframe.parentElement;
    if (!doc || !padre) return () => {};
    const propia = esEscenaPropia(iframe);
    const capa = doc.createElement("div");
    capa.setAttribute("data-vivo-escudo-capa", propia ? "propia" : "ajena");
    capa.setAttribute("aria-hidden", "true");
    Object.assign(capa.style, { position: "absolute", background: "transparent", touchAction: "pan-y", pointerEvents: "auto", zIndex: "1" });
    const posicionOriginal = padre.style.position;
    const estilo = doc.defaultView?.getComputedStyle(padre);
    const cambioPosicion = !estilo || !estilo.position || estilo.position === "static";
    if (cambioPosicion) padre.style.position = "relative";
    padre.appendChild(capa);
    iframe.setAttribute(ATRIBUTO_ESCUDO, propia ? "propia" : "ajena");

    const colocar = () => {
        const marco = padre.getBoundingClientRect();
        const caja = iframe.getBoundingClientRect();
        Object.assign(capa.style, {
            left: `${caja.left - marco.left + padre.clientLeft}px`,
            top: `${caja.top - marco.top + padre.clientTop}px`,
            width: `${caja.width}px`,
            height: `${caja.height}px`,
        });
    };
    colocar();
    const ventana = doc.defaultView;
    let pendiente = 0;
    const recolocar = () => {
        if (pendiente) return;
        if (ventana?.requestAnimationFrame) pendiente = ventana.requestAnimationFrame(() => { pendiente = 0; colocar(); });
        else colocar();
    };
    ventana?.addEventListener("resize", recolocar, { passive: true });
    ventana?.addEventListener("scroll", recolocar, { passive: true });

    const reenviar = (tipo: TipoGesto) => (evento: Event) => {
        const url = urlDe(iframe);
        const destino = iframe.contentWindow;
        if (!url || !destino) return;
        const gesto = evento as PointerEvent;
        destino.postMessage(mensajeDesdeEvento(tipo, iframe.getBoundingClientRect(), gesto), url.origin);
    };
    const oyentes: Array<{ tipo: TipoGesto; fn: EventListener }> = [];
    if (propia) for (const tipo of GESTOS) { const fn = reenviar(tipo); capa.addEventListener(tipo, fn); oyentes.push({ tipo, fn }); }
    // Sin oyente de `wheel`: la capa no se desplaza, así que la rueda sube a la página.
    doc.dispatchEvent(new CustomEvent(EVENTO_ESCUDO, { detail: { modo: propia ? "propia" : "ajena", capa, iframe } }));

    return () => {
        for (const { tipo, fn } of oyentes) capa.removeEventListener(tipo, fn);
        ventana?.removeEventListener("resize", recolocar);
        ventana?.removeEventListener("scroll", recolocar);
        if (pendiente && ventana) ventana.cancelAnimationFrame(pendiente);
        capa.remove();
        iframe.removeAttribute(ATRIBUTO_ESCUDO);
        if (cambioPosicion) padre.style.position = posicionOriginal;
    };
}
