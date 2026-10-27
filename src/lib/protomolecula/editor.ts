/**
 * Imágenes de Astraura · ADAPTADOR DE LA PROTOMOLÉCULA (IMG1011C). Contrato: architecture/astraura-imagenes.md §6.
 *
 * Abre una imagen en la Protomolécula por la MISMA puerta que la acción del agente (F0M,
 * `src/lib/protomolecula/accion-agente.ts`): el evento `starseed:protomolecula-abrir` de la
 * orbe y, si nadie lo atiende, su página `/protomolecula`. La URL de la imagen viaja en el
 * detalle del evento y en `?imagen=`: hoy el LIENZO aún no encaja la imagen en una molécula
 * (esa pieza viene en otro tramo); se abre la Protomolécula y la imagen queda a la vista.
 * Sin `node:*`: corredor de cliente. La lógica de «por dónde» es inyectable para pruebas.
 */
import { PROTO_ORB_ABRIR_EVENT, leerActivada, type AlmacenLocal } from "../orbe-bus";

/** Vista mínima de `window` que el adaptador necesita (inyectable en pruebas). */
export interface VentanaEditor {
  localStorage: AlmacenLocal;
  dispatchEvent(e: CustomEvent): boolean;
  location: { assign: (ruta: string) => void };
}

export interface ResultadoApertura {
  /** «orbe»: la orbe atendió el evento y se abrió. «pagina»: nadie lo atendió y abrimos su página. */
  via: "orbe" | "pagina";
  imagen: string;
}

/** Por dónde se abriría con esta ventana, sin tocar nada (PURO: para pruebas y avisos). */
export function formaDeAbrir(win: VentanaEditor): "orbe" | "pagina" {
  try {
    return leerActivada(win.localStorage) ? "orbe" : "pagina";
  } catch {
    return "pagina";
  }
}

/** Abre la imagen en la Protomolécula: orbe encendida → evento con `detail.imagen`; si nadie lo atiende,
 * su página con `?imagen=`. Nunca lanza: si la ventana falla, cae a la página a ciegas vía llamada. */
export function abrirImagenEnProtomolecula(url: string, win: VentanaEditor): ResultadoApertura {
  const porOrbe = formaDeAbrir(win) === "orbe"
    ? win.dispatchEvent
      ? !win.dispatchEvent(new CustomEvent(PROTO_ORB_ABRIR_EVENT, { detail: { imagen: url }, cancelable: true }))
      : false
    : false;
  if (porOrbe) return { via: "orbe", imagen: url };
  try {
    win.location.assign(`/protomolecula?imagen=${encodeURIComponent(url)}`);
  } catch {
    /* sin ventana navegable: quien llamó decide (el hook avisará honesto) */
  }
  return { via: "pagina", imagen: url };
}
