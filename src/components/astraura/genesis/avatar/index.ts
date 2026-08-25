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
 *
 * OLA 2 (búsqueda de avatar en línea, ver `avatar-busqueda-*.ts`): dos
 * puertas nuevas, en el mismo espíritu que las de arriba —
 * `AvatarConFuente` para pintar UN ser suelto sea cual sea su
 * `avatarFuente` (con la garantía de "nunca se rompe el cuerpo": cae solo
 * al procedural si la imagen falla), y `SelectorCuerpoSer` para la
 * interfaz completa donde una persona (o el propio ser, "cuando quiera")
 * elige entre procedural/en línea/subido. La lógica pura y el cliente de
 * `/api/avatar-search` se reexportan también, para quien quiera componer
 * su propio flujo sin la interfaz completa.
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

// ── OLA 2 · avatar en línea ────────────────────────────────────────────────
export { AvatarConFuente, type AvatarConFuenteProps } from "./avatar-con-fuente";
export { SelectorCuerpoSer, type SelectorCuerpoSerProps } from "./selector-cuerpo";
export { buscarAvataresEnLinea } from "./avatar-busqueda-cliente";
export {
  avatarFuenteProcedural,
  avatarFuenteSubido,
  candidatoDesdeOpenverse,
  codigoDesdeEstadoHttp,
  componerConsultaAvatar,
  confirmarEleccionAvatar,
  decidirModoEfectivo,
  elegirCandidatoDeterminista,
  filtrarCandidatosLibres,
  licenciaEsLibre,
  LICENCIAS_LIBRES,
  type CandidatoCrudoProveedor,
  type CodigoFalloBusqueda,
  type LicenciaLibre,
  type RespuestaBusquedaAvatar,
  type SemillaBusquedaAvatar,
} from "./avatar-busqueda-logica";
