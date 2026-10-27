/**
 * Imágenes de Astraura · punto de montaje (IMG1011J). Contrato: architecture/astraura-imagenes.md §6.
 *
 * Un solo lugar para encontrar lo del área:
 * - `TarjetaOpcionesImagen`: la tarjeta de la Protomolécula con todas las opciones del plan
 *   (elegir, variar, licencia y atribución visibles; la generación real va por el chat y el servicio local).
 * - `SugerenciasInstalacion`: la tarjeta de «Astraura te sugiere instalar…» (ya montada en ajustes
 *   de la neurona, página de habilidades).
 * - `planImagen`/`paqueteBase`/`cabe`: el núcleo puro reexportado para quien lo consuma desde UI.
 */
export { default as TarjetaOpcionesImagen } from "./tarjeta-opciones";
export { default as SugerenciasInstalacion } from "./sugerencias-instalacion";
export { planImagen, cabe, type PeticionImagen, type NeuronaImg, type OpcionImagen } from "@/lib/imagenes/plan";
export { paqueteBase } from "@/lib/imagenes/sugerencias";
export { MODELOS_IMAGEN, MOTORES_IMG, type ModeloImagen } from "@/lib/imagenes/modelos";
