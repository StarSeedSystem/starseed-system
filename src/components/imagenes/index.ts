/**
 * Imágenes locales de Astraura · PUNTO ÚNICO de las tarjetas (IMG1011J). Contrato: architecture/astraura-imagenes.md §5–§6.
 *
 * Reexporta lo que ya existe para que una sola ruta monte las dos tarjetas en los
 * sitios donde la gente las encuentra, sin duplicar componentes ni lógica:
 *   · `TarjetaImagenes` — la rejilla de opciones de una generación (chat de
 *     Astraura, respuesta de agente o bot, resultado de la Protomolécula).
 *   · `SugerenciasInstalacion` — «Astraura te sugiere instalar…» (habilidades,
 *     ajustes de la neurona: Configuración & Preferencias del Studio 1.58).
 */
export { TarjetaImagenes, default } from "./tarjeta-imagenes";
export type { TarjetaImagenesProps, OpcionTarjeta } from "./tarjeta-imagenes";
export { default as SugerenciasInstalacion } from "./sugerencias-instalacion";
