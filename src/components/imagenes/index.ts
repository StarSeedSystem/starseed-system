/**
 * Imágenes locales de Astraura · BARRIL del paquete visual (IMG1011J).
 * Contrato: architecture/astraura-imagenes.md §6. Un solo sitio desde donde importar
 * la tarjeta de opciones (chat de Astraura, agentes, bots, Protomolécula, ajustes de
 * la neurona) y las sugerencias de instalación, sin acoplar cada superficie al
 * archivo concreto: si la pieza se mueve, aquí se reexporta y nadie se rompe.
 */

/** La tarjeta de opciones por capas (IMG1011C): rejilla, procedencia, licencia y acciones. */
export {
  TarjetaImagenes,
  default as TarjetaImagenesPorDefecto,
  type OpcionTarjeta,
  type TarjetaImagenesProps,
} from "./tarjeta-imagenes";

/** Tarjeta «Astraura te sugiere instalar…» (IMG1011E): paquete base por hierro real. */
export { default as SugerenciasInstalacion } from "./sugerencias-instalacion";
