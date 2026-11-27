/**
 * Almacenes — Modelo universal, modalidades y manifiesto portable .starseed/almacen.json
 *
 * Exporta todo el API público del módulo almacenes.
 */

export * from "./modelo";
export * from "./manifiesto";
export * from "./ubicaciones";
export * from "./sugerencias";
// Resolver ambigüedad: esFundamental se exporta desde ubicaciones
export { esFundamental } from "./ubicaciones";