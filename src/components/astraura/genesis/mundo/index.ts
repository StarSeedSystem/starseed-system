/**
 * index.ts — Superficie pública de `genesis/mundo/`. El resto del OS
 * (en particular la sección que compone Génesis) importa desde aquí, no de
 * los ficheros internos — así el reordenamiento interno de este directorio
 * nunca es un cambio disruptivo para quien lo consume.
 */
export { MundoSeres, default } from "./mundo-seres";
export type {
  MundoSeresProps,
  PosicionMundo,
  RegionDispuesta,
  RegionVisible,
  DisposicionMundo,
  AristaVisible,
  DisposicionLinaje,
  PosicionLinaje,
  VistaMundo,
  SeleccionMundo,
} from "./mundo-tipos";
export {
  calcularDisposicionMundo,
  construirGrafoMundo,
  agruparPorComunidad,
  agruparPorEspacio,
  vinculosAAristasVisibles,
  type OpcionesDisposicionMundo,
} from "./mundo-layout";
export { calcularDisposicionLinaje, construirArbolLinaje, type OpcionesDisposicionLinaje, type ArbolLinaje } from "./mundo-linaje";
export { contornoEspacio } from "./mundo-espacio-forma";
export { adnEfectivo } from "./mundo-adn";
