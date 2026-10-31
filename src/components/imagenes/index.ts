/**
 * index.ts — punto de entrada público de `components/imagenes/`.
 *
 * Contrato: `architecture/astraura-imagenes.md` §6. Las tres puertas normales:
 *
 * · `PanelImagenes` — la pieza que se monta tal cual en el chat de Astraura,
 *   en los ajustes de la neurona y en la Protomolécula: campo de petición +
 *   tarjeta de opciones y, si se pide, el paquete base sugerido.
 * · `TarjetaImagenes` — solo el mostrador de opciones. Si quien la monta ya
 *   planificó (chat, agente o bot), le pasa `opciones` y sus callbacks; si no,
 *   le pasa `peticion` y planifica aquí.
 * · `SugerenciasInstalacion` — solo el paquete base por hierro real. Se
 *   monta ya en Habilidades y se incrusta desde `PanelImagenes` con
 *   `sugerencias`.
 *
 * La lógica pura (`planImagen`, `cabe`, `paqueteBase`, catálogo) y el hook de
 * la tarjeta se reexportan para quien componga un flujo a medida sin repetir
 * reglas de licencia, capas ni cuantización.
 */
export { default as PanelImagenes, type PanelImagenesProps } from "./panel-imagenes";
export {
  TarjetaImagenes,
  type TarjetaImagenesProps,
  type OpcionTarjeta,
} from "./tarjeta-imagenes";
export { default as SugerenciasInstalacion } from "./sugerencias-instalacion";

export {
  useTarjetaImagenes,
  PETICION_DEFECTO,
  atribucionDe,
  urlDeResultado,
  opcionesConPrompt,
  semillasNuevas,
} from "@/lib/imagenes/adaptadores/use-tarjeta-imagenes";
export {
  MODELOS_IMAGEN,
  MOTORES,
  FECHA_VERIFICACION_IMAGENES,
  modeloPorId,
  memoriaNecesaria,
  type ModeloImagen,
  type MotorImg,
  type CapacidadImg,
  type Gama,
  type InfoMotorImg,
} from "@/lib/imagenes/modelos";
export {
  CAPAS_IMG,
  cabe,
  planImagen,
  type PeticionImagen,
  type NeuronaImg,
  type OpcionImagen,
  type PlanImagen,
  type CapaImg,
  type Cuantizacion,
} from "@/lib/imagenes/plan";
export {
  paqueteBase,
  motoresPosibles,
  type HierroImg,
  type Sugerencia,
  type PaqueteBase,
  type OpcionesPaquete,
  type SistemaNeurona,
} from "@/lib/imagenes/sugerencias";
