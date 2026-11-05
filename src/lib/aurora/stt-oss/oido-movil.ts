export type MotorOidoMovil = 'nube' | 'whisper-web' | 'navegador-por-voz' | 'navegador';

export interface ElegirOidoMovilInput {
  nube: boolean;
  whisperDescargado: boolean;
  navegador: boolean;
}

export interface ElegirOidoMovilOutput {
  motor: MotorOidoMovil;
  motivo: string;
}

export function elegirOidoMovil(input: ElegirOidoMovilInput): ElegirOidoMovilOutput {
  const { nube, whisperDescargado, navegador } = input;
  if (nube) {
    return { motor: 'nube', motivo: 'oído en la nube disponible' };
  }
  if (whisperDescargado) {
    return { motor: 'whisper-web', motivo: 'whisper disponible localmente en el navegador' };
  }
  if (navegador) {
    return { motor: 'navegador-por-voz', motivo: 'reconocedor del navegador por voz (pitido por turno)' };
  }
  return { motor: 'navegador', motivo: 'navegador sin reconocimiento por voz' };
}

export interface DebeReiniciarInput {
  ciclosEnSilencio: number;
  enTurno: boolean;
}

export function debeReiniciarNavegador(input: DebeReiniciarInput): boolean {
  const { ciclosEnSilencio, enTurno } = input;
  if (ciclosEnSilencio >= 2 && !enTurno) {
    return false;
  }
  return true;
}
