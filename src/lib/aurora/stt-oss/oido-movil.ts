
export type OidoDestino = 'nube' | 'whisper-web' | 'navegador-por-voz' | 'navegador';

export interface OidoDecision {
  destino: OidoDestino;
  motivo: string;
}

export interface ElegirOidoParams {
  nubeDisponible: boolean;
  whisperDescargado: boolean;
  navegadorSoportado: boolean;
}

export function elegirOidoMovil(params: ElegirOidoParams): OidoDecision {
  if (params.nubeDisponible) {
    return { destino: 'nube', motivo: 'Nube disponible' };
  }
  if (params.whisperDescargado) {
    return { destino: 'whisper-web', motivo: 'Whisper descargado localmente' };
  }
  if (params.navegadorSoportado) {
    return { destino: 'navegador-por-voz', motivo: 'Navegador con soporte de voz' };
  }
  return { destino: 'navegador', motivo: 'Fallback a navegador básico' };
}

export function debeReiniciarNavegador(params: { ciclosEnSilencio: number, enTurno: boolean }): boolean {
  if (params.enTurno) {
    return false;
  }
  if (params.ciclosEnSilencio >= 2) {
    return false;
  }
  return true;
}
