"use client";
/**
 * Escudo de las escenas 3D del contenido vivo (CVV1028D). La capa reenvía los
 * gestos de las escenas propias por `postMessage` (coordenadas 0–1) y en las
 * ajenas solo protege el scroll. La rueda siempre desplaza la página.
 */
export const ATRIBUTO_ESCUDO = "data-vivo-escudo";

export type EventoReenviado = "pointermove" | "pointerleave" | "pointerdown" | "pointerup" | "click";

const EVENTOS: readonly EventoReenviado[] = [
  "pointermove", "pointerleave", "pointerdown", "pointerup", "click",
];
const HOSTS_PROPIOS = new Set(["my.spline.design"]);

function urlDe(iframe: HTMLIFrameElement): URL | null {
  const src = iframe.getAttribute("src") ?? "";
  if (!src) return null;
  try {
    return new URL(src, iframe.ownerDocument?.baseURI || "https://starseed.invalid/");
  } catch {
    return null;
  }
}

const acotar = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** ¿La escena es del OS o de nuestro estudio de Spline? */
export function esEscenaPropia(iframe: HTMLIFrameElement): boolean {
  const url = urlDe(iframe);
  if (!url) return false;
  if (HOSTS_PROPIOS.has(url.hostname)) return true;
  const origen = iframe.ownerDocument?.defaultView?.location?.origin;
  return Boolean(origen) && url.origin === origen;
}

/** Coordenadas del puntero dentro del iframe, siempre entre 0 y 1. */
export function coordenadasRelativas(
  evento: Pick<MouseEvent, "clientX" | "clientY">,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
): { x: number; y: number } {
  if (!(rect.width > 0) || !(rect.height > 0)) return { x: 0, y: 0 };
  return {
    x: acotar((evento.clientX - rect.left) / rect.width),
    y: acotar((evento.clientY - rect.top) / rect.height),
  };
}

/** Coloca el escudo y devuelve la función que lo retira. */
export function ponerEscudo(iframe: HTMLIFrameElement): () => void {
  const doc = iframe.ownerDocument;
  const padre = iframe.parentElement;
  if (!doc || !padre) return () => {};
  const propia = esEscenaPropia(iframe);
  const capa = doc.createElement("div");
  capa.setAttribute("data-vivo-escudo-capa", propia ? "propia" : "ajena");
  capa.setAttribute("aria-hidden", "true");
  Object.assign(capa.style, {
    position: "absolute", background: "transparent", touchAction: "pan-y",
    pointerEvents: "auto", zIndex: "2",
  });
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
      width: `${caja.width}px`, height: `${caja.height}px`,
    });
  };
  colocar();
  const ventana = doc.defaultView;
  let pendiente = 0;
  const recolocar = () => {
    if (pendiente) return;
    if (ventana?.requestAnimationFrame) {
      pendiente = ventana.requestAnimationFrame(() => { pendiente = 0; colocar(); });
    } else colocar();
  };
  ventana?.addEventListener("resize", recolocar, { passive: true });
  ventana?.addEventListener("scroll", recolocar, { passive: true });

  const reenviar = (tipo: EventoReenviado) => (evento: Event) => {
    const url = urlDe(iframe);
    const destino = iframe.contentWindow;
    if (!url || !destino) return;
    const gesto = evento as PointerEvent;
    destino.postMessage({
      origen: "contenido-vivo", v: 1, tipo,
      ...coordenadasRelativas(gesto, iframe.getBoundingClientRect()),
      boton: gesto.button ?? 0, punteroId: gesto.pointerId ?? 0,
    }, url.origin);
  };
  const oyentes: Array<{ tipo: EventoReenviado; fn: EventListener }> = [];
  if (propia) {
    for (const tipo of EVENTOS) {
      const fn = reenviar(tipo);
      capa.addEventListener(tipo, fn);
      oyentes.push({ tipo, fn });
    }
  }
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
