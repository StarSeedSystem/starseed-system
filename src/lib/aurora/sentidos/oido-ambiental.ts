export interface EstadoSentidos {
  encendidos: boolean;
  siempreEscuchando: boolean;
}

export interface DecisionOido {
  enviar: boolean;
  motivo: string;
}

export interface EntradaOido {
  sentidos: EstadoSentidos;
  hayVoz: boolean;
  energia: number;
  umbralEnergia: number;
  tiempoDesdeUltimoEnvio: number;
  intervaloMinimoSegundos: number;
}

export function decidirEnvioOido(entrada: EntradaOido): DecisionOido {
  if (!entrada.sentidos.encendidos) {
    return { enviar: false, motivo: "sentidos apagados" };
  }
  if (!entrada.sentidos.siempreEscuchando) {
    return { enviar: false, motivo: "sin escucha activa" };
  }
  if (entrada.hayVoz) {
    return { enviar: false, motivo: "el tramo lleva voz: va por el reconocimiento de habla" };
  }
  if (!Number.isFinite(entrada.energia) || entrada.energia < entrada.umbralEnergia) {
    return { enviar: false, motivo: "por debajo del umbral de energía (silencio)" };
  }
  if (entrada.tiempoDesdeUltimoEnvio < entrada.intervaloMinimoSegundos) {
    return {
      enviar: false,
      motivo: `aún no pasan ${entrada.intervaloMinimoSegundos} s desde el último envío`,
    };
  }
  return { enviar: true, motivo: "tramo sin voz, con energía suficiente y a separación regulada" };
}
