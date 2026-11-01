/**
 * Imágenes locales de Astraura · punto de entrada de componentes (IMG1011J).
 * Contrato: architecture/astraura-imagenes.md §6.
 *
 * Todo lo que muestra imágenes por capas vive aquí: la tarjeta de opciones
 * (chat de Astraura, agentes, bots, Protomolécula) y las sugerencias de
 * instalación (ajustes de la neurona y apps). Nada de lógica pura: esa está
 * en `src/lib/imagenes/` y sus adaptadores.
 */
export { TarjetaImagenes, default as TarjetaImagenesDefecto, type OpcionTarjeta, type TarjetaImagenesProps } from "./tarjeta-imagenes";
export { default as TarjetaEnChat, NOMBRE_EVENTO_IMAGENES, peticionDeEvento } from "./tarjeta-en-chat";
export { default as SugerenciasInstalacion } from "./sugerencias-instalacion";
