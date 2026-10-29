// Contenido vivo · escudo del 3D (nivel 1).
// Un 3D embebido atrapa la rueda y secuestra el scroll de la página; el escudo pone
// una capa transparente ENCIMA del iframe: la rueda vuelve a desplazar la página y,
// en las escenas propias (my.spline.design o el visor 3D del OS), los gestos del
// puntero se reenvían por postMessage con coordenadas relativas (0–1) para que la
// escena siga respondiendo sin necesitar el control real del ratón.
//
// Para escenas ajenas la capa es simple: ni píldoras ni «haz clic para jugar».

export type Escudo = () => void;

const EVENTOS_PUNTERO = [
  "pointermove",
  "pointerleave",
  "pointerdown",
  "pointerup",
  "click",
] as const;

/** ¿Es una escena propia? Spline (my.spline.design) o el visor 3D del propio OS. */
export function escenaPropia(iframe: HTMLIFrameElement): boolean {
  if (iframe.dataset.vivoPropia === "sí") return true;
  if (iframe.dataset.vivoPropia === "no") return false;
  const fuente = iframe.getAttribute("src") || "";
  if (fuente.includes("spline.design")) return true;
  return fuente.startsWith("/") && !fuente.startsWith("//");
}

interface Marco {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

function marcoSobre(padre: HTMLElement, iframe: HTMLIFrameElement): Marco {
  const delIframe = iframe.getBoundingClientRect();
  const delPadre = padre.getBoundingClientRect();
  return {
    x: delIframe.left - delPadre.left,
    y: delIframe.top - delPadre.top,
    ancho: delIframe.width,
    alto: delIframe.height,
  };
}

function acotar(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function reenviar(ventana: Window, capa: HTMLElement, evento: Event): void {
  const marco = capa.getBoundingClientRect();
  if (!marco.width || !marco.height) return;
  const puntero = evento as MouseEvent;
  const dentro = Number.isFinite(puntero.clientX);
  const x = dentro ? acotar((puntero.clientX - marco.left) / marco.width) : -1;
  const y = dentro ? acotar((puntero.clientY - marco.top) / marco.height) : -1;
  ventana.postMessage(
    { canal: "contenido-vivo", tipo: "puntero", gesto: evento.type, x, y },
    "*",
  );
}

/** Coloca el escudo sobre el iframe; devuelve la función que lo quita. */
export function ponerEscudo(iframe: HTMLIFrameElement): Escudo {
  const propia = escenaPropia(iframe);
  const padre = iframe.parentElement;
  if (!padre) return () => undefined;

  const capa = document.createElement("div");
  capa.setAttribute("data-vivo-escudo", propia ? "propio" : "ajeno");
  capa.setAttribute("aria-hidden", "true");
  capa.style.position = "absolute";
  capa.style.backgroundColor = "transparent";

  // La rueda nunca se atrapa aquí: sin oyentes de wheel y sin preventDefault,
  // el desplazamiento de la página queda libre aunque la escena sea propia.
  const reenviador = (evento: Event) => {
    if (propia && iframe.contentWindow) reenviar(iframe.contentWindow, capa, evento);
  };
  if (propia) {
    for (const gesto of EVENTOS_PUNTERO) capa.addEventListener(gesto, reenviador);
  }

  const posicionAntes = padre.style.position;
  if (!posicionAntes || posicionAntes === "static") padre.style.position = "relative";
  const marco = marcoSobre(padre, iframe);
  capa.style.left = `${marco.x}px`;
  capa.style.top = `${marco.y}px`;
  capa.style.width = `${marco.ancho}px`;
  capa.style.height = `${marco.alto}px`;
  padre.insertBefore(capa, iframe);

  return () => {
    capa.remove();
    padre.style.position = posicionAntes;
  };
}
