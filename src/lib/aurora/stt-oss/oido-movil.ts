/**
 * StarSeed OS — Módulo puro de selección de oído móvil.
 * Sin DOM, sin fetch, sin localStorage. Solo lógica de decisión.
 * Contrato: architecture/voz-estable-1105.md §3.
 */
export type MotorOidoId = 'phonon-2'|'parakeet-v3'|'vibeasr-158'|'whisper-web'|'navegador'|'nube'|'navegador-por-voz'|'malla'|'moonshine';

export interface MotorOido { id: MotorOidoId; idiomas: string[]; tipo: 'navegador'|'local'|'endpoint'|'malla'; flujo: boolean; licencia: string; atribucion?: boolean; tamanoMB?: number; }

export interface OidoMovilInfo {
  motor: MotorOidoId;
  motivo: string;
}

export interface OpcionesOidoParaReconocer {
  esMovil: boolean;
  nube: boolean;
  whisperListo: boolean;
}

export interface OpcionesElegirOidoMovil {
  nube: boolean;
  whisperDescargado: boolean;
  navegador: boolean;
}

export interface OpcionesDebeReiniciarNavegador {
  ciclosEnSilencio: number;
  enTurno: boolean;
}

export interface OpcionesWhisperListo {
  /** La persona activó el oído open-source (opt-in persistido). */
  optIn: boolean;
  /** El modelo ya está cargado en el navegador. */
  modeloListo: boolean;
}

export function elegirOidoMovil(opts: OpcionesElegirOidoMovil): OidoMovilInfo {
  const { nube, whisperDescargado, navegador } = opts;
  if (nube) {
    return { motor: 'nube', motivo: 'oído en la nube activado' };
  }
  if (whisperDescargado) {
    return { motor: 'whisper-web', motivo: 'Whisper descargado en navegador' };
  }
  if (navegador) {
    return { motor: 'navegador-por-voz', motivo: 'reconocedor por voz en navegador' };
  }
  return { motor: 'navegador', motivo: 'oído navegador por defecto' };
}

export function oidoParaReconocer({ esMovil, nube, whisperListo }: { esMovil: boolean; nube: boolean; whisperListo: boolean }): "nube" | "whisper-web" | "navegador" {
  if (esMovil) {
    if (nube) return "nube";
    if (whisperListo) return "whisper-web";
  }
  return "navegador";
}

/**
 * El oído Whisper del navegador SOLO cuenta si la persona lo activó (opt-in) Y
 * el modelo está ya cargado: sin modelo, el tramo se perdería en silencio.
 */
export function whisperListoParaOido(opts: OpcionesWhisperListo): boolean {
  return opts.optIn && opts.modeloListo;
}

export function debeReiniciarNavegador(opts: OpcionesDebeReiniciarNavegador): boolean {
  const { ciclosEnSilencio, enTurno } = opts;
  // En móvil: tras 2 ciclos seguidos en silencio Y sin turno pendiente,
  // NO se reinicia el reconocedor (se espera a la voz).
  if (ciclosEnSilencio >= 2 && !enTurno) {
    return false;
  }
  return true;
}