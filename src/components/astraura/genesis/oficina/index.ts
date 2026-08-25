/**
 * index.ts — Superficie pública de `genesis/oficina/`. El resto del OS
 * importa desde aquí, no de los ficheros internos — mismo contrato que ya
 * documenta `genesis/mundo/index.ts` (la escena 3D/2D internas, por ejemplo,
 * se quedan fuera a propósito: son detalle de implementación de
 * `OficinaSeres`, no algo que nadie más deba montar suelto).
 */
export { OficinaSeres, default } from "./oficina-seres";
export type {
  OficinaSeresProps,
  PosicionOficina,
  SalaDispuesta,
  DisposicionOficina,
  ParametrosAnimacionOcupante,
  OcupanteResuelto,
} from "./oficina-tipos";
export { disponerSalas, colorSala, radioSala } from "./oficina-salas";
export {
  agruparPorSala,
  contarPorSala,
  posicionEnPatron,
  posicionOcupante,
  parametrosActividad,
  formatoTranscurrido,
  describirOcupante,
} from "./oficina-ocupantes";
export { debeAnimarOficina, actividadVisible, mensajeHonestidad } from "./oficina-honestidad";
export { useOficinaPantallaCompleta, type ApiPantallaCompletaOficina, type ModoPantallaOficina } from "./oficina-fullscreen";
