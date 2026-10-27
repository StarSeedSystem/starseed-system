export interface EstadoSentidos {
  encendidos: boolean;
  siempreEscuchando: boolean;
}

export interface FragmentoAudio {
  id: string;
  contieneVoz: boolean;
  energia: number;
  timestamp: number;
}

export interface DecisionOido {
  enviarAlServicio: boolean;
  razon?: string;
}

export function decidirEnvioAlOido(
  estado: EstadoSentidos,
  fragmento: FragmentoAudio,
  ultimoEnvio: number | null,
  umbralEnergia: number,
  intervaloMinimoMs: number
): DecisionOido {
  if (!estado.encendidos) {
    return { enviarAlServicio: false, razon: "Sentidos apagados" };
  }
  if (fragmento.contieneVoz) {
    return { enviarAlServicio: false, razon: "Contiene voz" };
  }
  if (fragmento.energia < umbralEnergia) {
    return { enviarAlServicio: false, razon: "Energía insuficiente" };
  }
  if (ultimoEnvio !== null && fragmento.timestamp - ultimoEnvio < intervaloMinimoMs) {
    return { enviarAlServicio: false, razon: "Intervalo demasiado corto" };
  }
  return { enviarAlServicio: true };
}
