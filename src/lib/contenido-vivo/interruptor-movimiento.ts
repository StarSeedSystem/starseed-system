/** Interruptor de movimiento del contenido vivo (CVV1028D): «apagado», «encendido» y «rayos-x». */
export const EVENTO_MODO = "contenido-vivo:modo";
export const PARAMETRO_MOVIMIENTO = "movimiento";
export const ATRIBUTO_INTERRUPTOR = "data-vivo-interruptor-movimiento";
export const ATRIBUTO_ETIQUETA = "data-vivo-etiqueta";
export type ModoVivo = "apagado" | "encendido" | "rayos-x";
export const MODOS_VIVO: readonly ModoVivo[] = ["apagado", "encendido", "rayos-x"];
export const ETIQUETAS_MODO: Record<ModoVivo, string> = {
  apagado: "Apagado", encendido: "Encendido", "rayos-x": "Rayos X",
};
export interface OpcionesInterruptor {
  raiz?: HTMLElement; ventana?: Window; documento?: Document; reducirMovimiento?: boolean;
}
export interface InterruptorMovimiento {
  boton: HTMLButtonElement; modo: () => ModoVivo; desmontar: () => void;
}
export function normalizarModo(valor: string | null): ModoVivo | null {
  const v = (valor ?? "").trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "");
  if (v === "apagado" || v === "off") return "apagado";
  if (v === "encendido" || v === "on") return "encendido";
  if (v === "rayos-x" || v === "rayosx" || v === "x-ray" || v === "xray") return "rayos-x";
  return null;
}
/** El parámetro manda; con movimiento reducido solo se permite «rayos-x». */
export function modoDesdeUrl(busqueda: string, reducirMovimiento: boolean): ModoVivo {
  let pedido: string | null = null;
  try { pedido = new URLSearchParams(busqueda).get(PARAMETRO_MOVIMIENTO); } catch { pedido = null; }
  const modo = normalizarModo(pedido);
  if (modo === "rayos-x") return "rayos-x";
  return reducirMovimiento ? "apagado" : (modo ?? "encendido");
}
export function urlConModo(href: string, modo: ModoVivo): string {
  try {
    const url = new URL(href, "https://starseed.invalid/");
    url.searchParams.set(PARAMETRO_MOVIMIENTO, modo);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return href; }
}
export function leerPreferenciaReducida(ventana?: Window | null): boolean {
  try { return ventana?.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true; }
  catch { return false; }
}
const quitarEtiquetas = (raiz: HTMLElement): void => {
  for (const etiqueta of Array.from(raiz.querySelectorAll(`[${ATRIBUTO_ETIQUETA}]`))) etiqueta.remove();
};
function pintarEtiquetas(raiz: HTMLElement): void {
  for (const pieza of Array.from(raiz.querySelectorAll<HTMLElement>("[data-vivo]"))) {
    const que = (pieza.getAttribute("data-vivo") ?? "").trim();
    if (!que) continue;
    const herramienta = (pieza.getAttribute("data-vivo-herramienta") ?? "").trim();
    const etiqueta = raiz.ownerDocument.createElement("span");
    etiqueta.setAttribute(ATRIBUTO_ETIQUETA, "");
    etiqueta.textContent = herramienta ? `${que} · ${herramienta}` : que;
    Object.assign(etiqueta.style, {
      position: "absolute", left: "0.5rem", bottom: "0.5rem",
      zIndex: "2", pointerEvents: "none",
    });
    pieza.appendChild(etiqueta);
  }
}
export function aplicarModo(modo: ModoVivo, raiz?: HTMLElement): void {
  const doc = raiz?.ownerDocument ?? (typeof document !== "undefined" ? document : null);
  const destino = raiz ?? doc?.documentElement ?? null;
  if (!destino) return;
  destino.setAttribute("data-movimiento", modo);
  quitarEtiquetas(destino);
  if (modo === "rayos-x") pintarEtiquetas(destino);
  doc?.defaultView?.dispatchEvent(new CustomEvent(EVENTO_MODO, { detail: { modo } }));
}
export function montarInterruptor(opciones: OpcionesInterruptor = {}): InterruptorMovimiento | null {
  const ventana = opciones.ventana ?? (typeof window !== "undefined" ? window : null);
  const documento = opciones.documento ?? ventana?.document ?? null;
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
  const aplicar = (siguiente: ModoVivo) => {
    modo = siguiente;
    aplicarModo(modo, raiz);
    pintarBoton();
  };
  const alPulsar = () => {
    const i = MODOS_VIVO.indexOf(modo);
    const siguiente = MODOS_VIVO[(i + 1) % MODOS_VIVO.length] ?? "encendido";
    aplicar(siguiente);
    try { ventana.history.replaceState(ventana.history.state, "", urlConModo(ventana.location.href, siguiente)); }
    catch { /* URL no escribible */ }
  };
  const alCambiarPreferencia = (evento: MediaQueryListEvent) => {
    if (evento.matches && modo === "encendido") aplicar("apagado");
  };
  boton.addEventListener("click", alPulsar);
  const consulta = typeof ventana.matchMedia === "function"
    ? ventana.matchMedia("(prefers-reduced-motion: reduce)") : null;
  consulta?.addEventListener?.("change", alCambiarPreferencia);
  pintarBoton();
  aplicarModo(modo, raiz);
  raiz.appendChild(boton);
  return {
    boton, modo: () => modo,
    desmontar: () => {
      boton.removeEventListener("click", alPulsar);
      consulta?.removeEventListener?.("change", alCambiarPreferencia);
      boton.remove();
      raiz.removeAttribute("data-movimiento");
      quitarEtiquetas(raiz);
    },
  };
}
