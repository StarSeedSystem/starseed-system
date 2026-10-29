/**
 * Escudo 3D del contenido vivo (CVV1028, tarea D · contrato §1 nivel 3D y §5).
 *
 * Nivel 3D vivo: la pieza reacciona, pero NUNCA atrapa el scroll. `ponerEscudo`
 * coloca una capa transparente encima de un iframe 3D: la rueda sigue
 * desplazando la página y, en las escenas propias (`my.spline.design` o el
 * visor 3D del OS), reenvía el apuntador por `postMessage` con coordenadas
 * relativas de 0 a 1. Con escenas ajenas queda la capa simple: sin píldoras
 * ni mensajes tipo «haz clic para jugar».
 *
 * Módulo del navegador: sin `node:*`, sin red y sin React. Las funciones de
 * puro cálculo van exportadas para poder probarse aparte.
 */

/** Evento que el escudo reenvía al `contentWindow` del iframe propio. */
export const EVENTO_APUNTADOR = "contenido-vivo:apuntador" as const;

/** Qué hizo el apuntador encima de la escena. */
export type eventoApuntador = "mover" | "salir" | "bajar" | "soltar" | "clic";

/** Mensaje que recibe la escena propia por `postMessage`. */
export interface MensajeApuntador {
  tipo: typeof EVENTO_APUNTADOR;
  evento: eventoApuntador;
  /** Posición relativa horizontal, de 0 a 1. */
  x: number;
  /** Posición relativa vertical, de 0 a 1. */
  y: number;
}

/** Anfitrión de escenas Spline embebidas que el OS considera propias. */
const ANFITRION_SPLINE = "my.spline.design";

/**
 * Decide si bajo el escudo hay una escena que entiende el apuntador: el
 * visor 3D del OS (marcado con su atributo) o una escena de Spline embebida.
 */
export function esEscenaPropia(src: string | null, esVisorPropio: boolean): boolean {
  return esVisorPropio || Boolean(src && src.includes(ANFITRION_SPLINE));
}

/**
 * Apuntador sobre el marco en coordenadas de 0 a 1, bordes clavados.
 */
export function normalizarCoordenadas(
  rect: { left: number; top: number; width: number; height: number },
  clienteX: number,
  clienteY: number,
): { x: number; y: number } {
  const ancho = rect.width > 0 ? rect.width : 1;
  const alto = rect.height > 0 ? rect.height : 1;
  const x = Math.min(1, Math.max(0, (clienteX - rect.left) / ancho));
  const y = Math.min(1, Math.max(0, (clienteY - rect.top) / alto));
  return { x, y };
}

/** Armado del mensaje: un solo objeto plano, listo para `postMessage`. */
export function mensajeApuntador(evento: eventoApuntador, x: number, y: number): MensajeApuntador {
  return { tipo: EVENTO_APUNTADOR, evento, x, y };
}

/** Pareja de evento DOM y nombre de evento que llega a la escena. */
const ENCADENADOS: [string, eventoApuntador][] = [
  ["pointermove", "mover"],
  ["pointerleave", "salir"],
  ["pointerdown", "bajar"],
  ["pointerup", "soltar"],
  ["click", "clic"],
];

/**
 * Coloca el escudo encima de un iframe 3D y devuelve la función para quitarlo
 * (retira su escucho de eventos y la capa, y devuelve al padre su posición).
 * Colocar dos veces es inofensivo: la segunda llamada ya no hace nada.
 */
export function ponerEscudo(marco: HTMLIFrameElement): () => void {
  const padre = marco.parentElement;
  if (!padre || padre.querySelector("[data-escudo-vivo]")) return () => {};

  const posicionAntes = padre.style.position;
  if (!posicionAntes) padre.style.position = "relative";

  const capa = document.createElement("div");
  capa.setAttribute("data-escudo-vivo", "");
  capa.style.cssText =
    "position:absolute;left:0;top:0;width:100%;height:100%;" +
    "background:transparent;z-index:20;pointer-events:auto;cursor:default;";
  // Sin oyente de `wheel`: la rueda desplaza la página, el escudo no la toca.

  const propia = esEscenaPropia(marco.getAttribute("src"), marco.hasAttribute("data-visor-3d"));
  const oyentes: { tipo: string; llamar: (ev: PointerEvent) => void }[] = [];
  if (propia) {
    for (const [tipoDom, nombre] of ENCADENADOS) {
      const llamar = (ev: PointerEvent) => {
        const destino = marco.contentWindow;
        if (!destino) return;
        const punto = normalizarCoordenadas(
          marco.getBoundingClientRect(),
          ev.clientX,
          ev.clientY,
        );
        destino.postMessage(mensajeApuntador(nombre, punto.x, punto.y), "*");
      };
      oyentes.push({ tipo: tipoDom, llamar });
      capa.addEventListener(tipoDom, llamar as EventListener);
    }
  }
  padre.appendChild(capa);

  return () => {
    for (const { tipo, llamar } of oyentes) capa.removeEventListener(tipo, llamar as EventListener);
    capa.remove();
    if (!posicionAntes) padre.style.position = "";
  };
}
