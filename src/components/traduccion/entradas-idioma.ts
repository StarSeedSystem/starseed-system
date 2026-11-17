/**
 * Entradas de idioma del menú del clic derecho (Ola IMA17 · TRA1116).
 * Mismo patrón que `entradasTraduccion` de TRD1020E: la fábrica devuelve
 * `EntradaMenuTexto[]` y las acciones las inyecta el componente que registra
 * las entradas — aquí no hay red, ni almacenamiento, ni navegación propia.
 */
import type { EntradaMenuTexto } from "./menu-texto";

/** Tope de texto que entra por query al Traductor. */
export const TOPE_TEXTO_TRADUCTOR = 2000;

/** Lo que hace cada entrada; lo aporta quien la registra (componente de cableado). */
export interface AccionesIdioma {
  leerEnVozAlta: (texto: string) => void;
  añadirAlPaquete: (texto: string) => void;
  /** ¿Hay un paquete de idioma en edición en este momento? */
  hayEdicion: () => boolean;
  abrirTraductor: (url: string) => void;
}

/** URL del Traductor con el texto codificado y recortado al tope. Pura. */
export function urlTraductor(texto: string): string {
  const recortado = texto.slice(0, TOPE_TEXTO_TRADUCTOR);
  return `/traductor?texto=${encodeURIComponent(recortado)}`;
}

/** Las tres entradas de idioma del menú del texto; las acciones las trae el componente. */
export function entradasIdioma(acciones: AccionesIdioma): EntradaMenuTexto[] {
  return [
    {
      id: "leer-en-voz-alta",
      etiqueta: "Leer en voz alta",
      visible: (c) => c.seleccion.length > 0,
      ejecutar: (c) => acciones.leerEnVozAlta(c.seleccion),
    },
    {
      id: "anadir-al-paquete",
      etiqueta: "Añadir al paquete de idioma",
      visible: () => acciones.hayEdicion(),
      ejecutar: (c) => acciones.añadirAlPaquete(c.seleccion),
    },
    {
      id: "abrir-traductor",
      etiqueta: "Abrir en el Traductor",
      visible: (c) => c.seleccion.length > 0,
      ejecutar: (c) => acciones.abrirTraductor(urlTraductor(c.seleccion)),
    },
  ];
}
