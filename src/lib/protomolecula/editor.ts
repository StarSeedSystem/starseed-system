/**
 * Protomolécula · ABRIR UNA IMAGEN PARA EDITAR (IMG1011C). Contrato: architecture/astraura-imagenes.md §6.
 *
 * Sigue la puerta que el OS ya usa para abrir la Protomolécula (`protomolecula/accion-agente.ts`):
 * si la orbe está encendida se avisa con `PROTO_ORB_ABRIR_EVENT` (la imagen viaja en el detalle del
 * evento para su lienzo); si nadie lo atiende se navega a su página. Meter la imagen como átomo de
 * una molécula nueva es cableado posterior: hoy se abre el lienzo con la referencia lista y se dice
 * con honestidad por dónde se abrió. PURO si vienen las puertas; por defecto solo toca `window`.
 */
import { PROTO_ORB_ABRIR_EVENT, leerActivada } from "./orbe-bus";

export interface ImagenProtomolecula {
  /** URL usable en la pestaña (http(s), data: o blob:). */
  url: string;
  titulo?: string;
  licencia?: string;
  atribucion?: string;
}
export type ViaProtomolecula = "orbe" | "pagina" | "ninguna";
export interface ResultadoAperturaImagen {
  ok: boolean;
  via: ViaProtomolecula;
  /** Frase en español, decible, con lo que pasó. */
  mensaje: string;
}
/** Puertas: cómo se hace por los dos posibles receptores; por defecto, `window`. */
export interface PuertasProtomolecula {
  /** true = la orbe atendió el aviso (preventDefault). Es la de `accion-agente.avisarEnNavegador`. */
  orbe?: (imagen: ImagenProtomolecula) => boolean;
  /** Navega a la ruta dada (router o location). */
  pagina?: (ruta: string) => void;
}

/** Puerta por defecto: window. Nunca lanza; sin navegador devuelve false. */
function orbePorDefecto(imagen: ImagenProtomolecula): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (!leerActivada(window.localStorage)) return false;
    return !window.dispatchEvent(
      new CustomEvent(PROTO_ORB_ABRIR_EVENT, { detail: { imagen }, cancelable: true }),
    );
  } catch {
    return false;
  }
}

/** Función principal: abre la Protomolécula para editar (o crear desde) esta imagen. Nunca lanza. */
export function abrirImagenEnProtomolecula(
  imagen: ImagenProtomolecula,
  puertas?: PuertasProtomolecula,
): ResultadoAperturaImagen {
  const verbo = textoSeguro(imagen.titulo) ? `«${textoSeguro(imagen.titulo).slice(0, 60)}»` : "la imagen";
  if ((puertas?.orbe ?? orbePorDefecto)(imagen)) {
    return { ok: true, via: "orbe", mensaje: `Abrí la Protomolécula con ${verbo} lista en su orbe.` };
  }
  if (puertas?.pagina) {
    puertas.pagina("/protomolecula");
    return {
      ok: true,
      via: "pagina",
      mensaje: `Abrí la Protomolécula en su página con ${verbo} a mano para editar.`,
    };
  }
  return {
    ok: false,
    via: "ninguna",
    mensaje: "Desde aquí no puedo abrir la Protomolécula (solo en el navegador).",
  };
}

/** Coerción amable a título limpio (nunca lanza). */
function textoSeguro(v: string | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}
