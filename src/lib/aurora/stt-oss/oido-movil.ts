export type MotorOidoMovil = "nube" | "whisper-web" | "navegador-por-voz" | "navegador";

export interface ElegirOidoMovilInput {
  nube: boolean;
  whisperDescargado: boolean;
  navegador: boolean;
}

export interface ElegirOidoMovilResultado {
  motor: MotorOidoMovil;
  motivo: string;
}

export function elegirOidoMovil(input: ElegirOidoMovilInput): ElegirOidoMovilResultado {
  if (input.nube) {
    return { motor: "nube", motivo: "oído en la nube disponible" };
  }
  if (input.whisperDescargado) {
    return { motor: "whisper-web", motivo: "Whisper web descargado, línea estable sin nube" };
  }
  if (input.navegador) {
    return { motor: "navegador-por-voz", motivo: "reconocedor del navegador solo al detectar voz, un pitido por turno" };
  }
  return { motor: "navegador", motivo: "suelo: navegador sin activación por voz" };
}

export interface DebeReiniciarInput {
  ciclosEnSilencio: number;
  enTurno: boolean;
}

export function debeReiniciarNavegador(input: DebeReiniciarInput): boolean {
  const silencioso = input.ciclosEnSilencio >= 2 && !input.enTurno;
  return !silencioso;
}
