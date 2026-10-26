/**
 * Imágenes locales de Astraura · punto de acceso único de las tarjetas de la relación con la persona
 * (IMG1011 · contrato architecture/astraura-imagenes.md §5 y §6). Desde aquí importa quién las monta
 * (chat/panel de media, ajustes de la neurona, Protomolécula, bots).
 */
export { default as SugerenciasInstalacion } from "./sugerencias-instalacion";
export { default as TarjetaImagenes, type TarjetaImagenesProps } from "./tarjeta-imagenes";
export type { HierroImg, Sugerencia } from "@/lib/imagenes/sugerencias";
export type { PlanImagen, OpcionImagen, PeticionImagen, NeuronaImg } from "@/lib/imagenes/plan";
export { planImagen, cabe } from "@/lib/imagenes/plan";
