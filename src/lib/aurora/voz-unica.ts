// Definimos los tipos aquí para simplicidad.
export interface VozRT {
  disponible: () => boolean;
  decirRT: (texto: string) => void;
}

export interface Motores {
  vozRT: VozRT;
  speakWithConfiguredEngine: (texto: string) => void;
  callarVozRT: () => void;
  callarCola: () => void;
  callarMezclador: () => void;
  callarMotorLocal: () => void;
}

export interface OpcionesHablar {
  contexto?: 'conversacion' | 'aviso' | 'ventana' | 'guia' | 'rito' | 'lectura' | 'mando' | 'llamada';
  persona?: string;
  prioridad?: number; // or maybe string? We'll use number for now.
}

export function crearVozUnica(motores: Motores) {
  let cola: string[] = [];
  let procesandoCola = false;
  let intervaloAviso: NodeJS.Timeout | null = null;

  const hablar = (texto: string, opciones: OpcionesHablar = {}) => {
    const { contexto = 'conversacion', persona, prioridad } = opciones;

    // Clear any existing aviso interval
    if (intervaloAviso) {
      clearInterval(intervaloAviso);
      intervaloAviso = null;
    }

    switch (contexto) {
      case 'conversacion':
        if (motores.vozRT.disponible()) {
          motores.vozRT.decirRT(texto);
        } else {
          motores.speakWithConfiguredEngine(texto);
        }
        break;

      case 'aviso':
        if (motores.vozRT.disponible()) {
          // Wait for silence up to 8s
          let transcurrido = 0;
          intervaloAviso = setInterval(() => {
            transcurrido += 100;
            if (!motores.vozRT.disponible()) {
              clearInterval(intervaloAviso);
              intervaloAviso = null;
              motores.speakWithConfiguredEngine(texto);
            } else if (transcurrido >= 8000) {
              clearInterval(intervaloAviso);
              intervaloAviso = null;
              // Discard with log (we'll just log to console for now)
              console.log('Aviso descartado: conversación activa después de 8s');
            }
          }, 100);
        } else {
          motores.speakWithConfiguredEngine(texto);
        }
        break;

      case 'guia':
      case 'rito':
        cola.push(texto);
        if (!procesandoCola) {
          procesarCola();
        }
        break;

      case 'ventana':
      case 'lectura':
      case 'mando':
      case 'llamada':
        motores.speakWithConfiguredEngine(texto);
        break;

      default:
        motores.speakWithConfiguredEngine(texto);
    }
  };

  const procesarCola = () => {
    if (cola.length === 0) {
      procesandoCola = false;
      return;
    }
    // We are processing the queue, so set the flag
    procesandoCola = true;
    // Process the first item in the next tick
    setTimeout(() => {
      const texto = cola.shift()!;
      motores.speakWithConfiguredEngine(texto);
      // After processing, process the next item
      procesarCola();
    }, 0);
  };

  const callar = () => {
    // Clear aviso interval
    if (intervaloAviso) {
      clearInterval(intervaloAviso);
      intervaloAviso = null;
    }
    // Clear queue
    cola = [];
    procesandoCola = false;
    // Callar everything
    motores.callarVozRT();
    motores.callarCola();
    motores.callarMezclador();
    motores.callarMotorLocal();
  };

  return { hablar, callar };
}