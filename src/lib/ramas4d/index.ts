export * from './modelo';
export * from './agrupar';
export * from './capas';
export * from './alcance';
export * from './fuentes/tipos';
export { fuenteCerebros, crearFuenteCerebros } from './fuentes/cerebros';
export { fuenteConocimiento, crearFuenteConocimiento } from './fuentes/conocimiento';
export { fuenteEducacion, crearFuenteEducacion } from './fuentes/educacion';
export {
  crearBusRamas4D,
  obtenerBusGlobal,
  destruirBusGlobal,
  type BusConfig,
  type EstadoBus,
  type BusRamas4D,
} from './bus';
export {
  crearEstadoFuerza,
  pasoFuerza,
  disposicionFuerza,
  energiaDisposicion,
  disposicionRadial,
  disposicionEspiralTemporal,
  disposicionPlanosPorCapa,
} from './disposicion';
export {
  PROFUNDIDAD_MAX_OCTREE,
  indiceOctante,
  construirOctree,
  contarNodosOctree,
  fuerzasBarnesHut,
  fuerzaSobre,
} from './octree';
export { calcularPeticion } from './disposicion.worker';
export {
  useDisposicion,
  calcularDisposicion,
  tipoDisposicionValido,
  type EstadoDisposicionHook,
  type TipoDisposicion,
} from './use-disposicion';