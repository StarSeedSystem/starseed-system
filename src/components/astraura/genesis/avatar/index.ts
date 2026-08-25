/**
 * index.ts — punto de entrada público de `genesis/avatar/`.
 *
 * `AvatarSer` (sin Canvas propio, para el mundo compartido) y
 * `AvatarAutonomo` (con Canvas + respaldo, para un ser suelto — así lo usa
 * ya `../ser-avatar-slot.tsx`) son las dos puertas de entrada normales; ver
 * la cabecera de cada fichero para cuál usar cuándo. El resto se expone
 * para quien necesite componer algo a medida (p. ej. `genesis/mundo/`, que
 * probablemente quiera un único `<Canvas>` propio con muchos `<AvatarSer>`
 * dentro).
 */

export { AvatarSer, type AvatarSerProps } from "./avatar-ser";
export { AvatarAutonomo, type AvatarAutonomoProps } from "./avatar-autonomo";
export { AvatarFallbackSvg, type AvatarFallbackSvgProps } from "./avatar-fallback-svg";
export { LimiteErrorWebGL } from "./webgl-error-boundary";
export { useTieneWebGL, usePrefiereMovimientoReducido } from "./hooks";
export type { NivelDetalle } from "./geometria";
export {
  colorDesdeHsl,
  geometriaBaseNucleo,
  construirGeometriaNucleo,
  escalaPorSimetria,
  geometriaAnilloUnidad,
  inclinacionOrbita,
  geometriaHalo,
  materialNucleo,
  materialOrbita,
  materialHalo,
  liberarGeometriaInstancia,
} from "./geometria";
