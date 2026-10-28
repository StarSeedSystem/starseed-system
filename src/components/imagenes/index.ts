/**
 * Imágenes locales de Astraura · INTERFAZ PÚBLICA de componentes (IMG1011J).
 * Contrato: architecture/astraura-imagenes.md §6.
 *
 * Un solo sitio desde el que el chat, los ajustes de la neurona, los bots y la Protomolécula
 * montan lo mismo: la tarjeta con las opciones reales y el paquete base sugerido. Sin duplicar
 * el núcleo puro (`src/lib/imagenes/*`), que se reexporta solo para quien lo consuma desde UI.
 */
export { default as TarjetaImagenes } from "./tarjeta-imagenes";
export type { TarjetaImagenesProps } from "./tarjeta-imagenes";
export { default as SugerenciasInstalacion } from "./sugerencias-instalacion";
export { planImagen, cabe, type PeticionImagen, type NeuronaImg, type OpcionImagen } from "@/lib/imagenes/plan";
export { paqueteBase, type HierroImg, type Sugerencia } from "@/lib/imagenes/sugerencias";
export { MODELOS_IMAGEN, MOTORES, type ModeloImagen } from "@/lib/imagenes/modelos";
export {
  galeriaPresentable, etiquetaUso, nombreCapa, type GaleriaPresentable, type OpcionPresentable,
} from "@/lib/imagenes/presentacion";
