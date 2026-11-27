// Punto único de entrada a los tipos y constantes públicos del NFC de neuronas
// (contrato: architecture/nfc-neuronas.md). Solo reexporta: sin lógica, sin Node.

export type {
  ModoCuenta,
  MotivoRechazo,
  ResultadoDecodificar,
  ResultadoVerificar,
  TarjetaNeurona,
  TipoTransporte,
  VerificadorFirma,
} from "./tarjeta";
export { MAX_BYTES_TARJETA, TIPO_MIME_NDEF, VALIDEZ_MS, VERSION_TARJETA } from "./tarjeta";

export type {
  Accion,
  AvisoEncuentro,
  PerfilVisible,
  PreferenciasNfc,
  PreferenciasRelacion,
  Relacion,
  UbicacionEncuentro,
} from "./preferencias";
export { ACCIONES, ACCIONES_SENSIBLES, ACCIONES_SOLO_PROPIAS, RELACIONES } from "./preferencias";

export type { DecisionEncuentro, EntradaDecision, PerfilMostrado } from "./decidir";

export type {
  TipoAudio,
  ModoReproduccion,
  ConfigAudioNodo,
  PreferenciasAudioVisitante,
  PreferenciasAudioResueltas,
  AudioDisponible,
  ResultadoConfigAudio,
} from "./nodo-audio";
export {
  TIPO_AUDIO,
  MODO_REPRODUCCION,
  VOLUMEN_DEFECTO,
  IDIOMA_DEFECTO,
  configAudioPorDefecto,
  validarConfigAudio,
  resolverPreferenciasAudio,
  audioDisponibleOffline,
  filtrarAudioPorIdioma,
  tipoAudioValido,
  modoReproduccionValido,
} from "./nodo-audio";
