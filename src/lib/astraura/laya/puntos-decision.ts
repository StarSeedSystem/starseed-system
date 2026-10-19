export type PreguntaLaya = {
  type: 'choice' | 'score' | 'noul';
  instructions: string;
  criteria?: Record<string, string>;
};

export type PuntoDecision = {
  id: string;
  capa: string;
  preguntas: Record<string, PreguntaLaya>;
  umbral?: number;
  plazoMsPorMedio: {
    a1: number;
    mac: number;
    navegador: number;
    malla: number;
  };
  siDuda: 'escalar' | 'confirmar' | 'regla' | 'revisar';
  privacidad: 'puede-salir' | 'solo-propias';
};

export const puntosDeDecision: PuntoDecision[] = [
  {
    id: 'reflejo.herramienta',
    capa: 'reflejo',
    preguntas: {
      herramienta: {
        type: 'choice',
        instructions: 'Elige la herramienta más adecuada para resolver la consulta',
        criteria: { "herramienta-ficticia": "Descripción ficticia" },
      },
    },
    umbral: 0.6,
    plazoMsPorMedio: {
      a1: 0,
      mac: 0,
      navegador: 0,
      malla: 0,
    },
    siDuda: 'escalar',
    privacidad: 'puede-salir',
  },
  {
    id: 'plan.dificultad',
    capa: 'planificador',
    preguntas: {
      dificultad: {
        type: 'score',
        instructions: 'Evalúa la dificultad de la tarea en una escala',
        criteria: undefined,
      },
      bastaModeloPequeno: {
        type: 'noul',
        instructions: '¿Basta un modelo pequeño para resolver la tarea?',
        criteria: undefined,
      },
    },
    umbral: 0.6,
    plazoMsPorMedio: {
      a1: 0,
      mac: 0,
      navegador: 0,
      malla: 0,
    },
    siDuda: 'regla',
    privacidad: 'puede-salir',
  },
  {
    id: 'respuesta.basta',
    capa: 'respuesta',
    preguntas: {
      basta: {
        type: 'noul',
        instructions: '¿La respuesta resuelve lo pedido?',
        criteria: undefined,
      },
    },
    umbral: 0.6,
    plazoMsPorMedio: {
      a1: 0,
      mac: 0,
      navegador: 0,
      malla: 0,
    },
    siDuda: 'escalar',
    privacidad: 'puede-salir',
  },
  {
    id: 'basico.consenso',
    capa: 'basico',
    preguntas: {
      consenso: {
        type: 'noul',
        instructions: '¿La respuesta es correcta?',
        criteria: undefined,
      },
    },
    umbral: 0.6,
    plazoMsPorMedio: {
      a1: 0,
      mac: 0,
      navegador: 0,
      malla: 0,
    },
    siDuda: 'escalar',
    privacidad: 'puede-salir',
  },
  {
    id: 'habilidad.elegir',
    capa: 'habilidad',
    preguntas: {
      habilidad: {
        type: 'choice',
        instructions: 'Elige la habilidad que aplica',
        criteria: { "habilidad-ficticia": "Descripción ficticia", ninguna: "Ninguna habilidad" },
      },
    },
    umbral: 0.6,
    plazoMsPorMedio: {
      a1: 0,
      mac: 0,
      navegador: 0,
      malla: 0,
    },
    siDuda: 'regla',
    privacidad: 'puede-salir',
  },
  {
    id: 'publicar.moderar',
    capa: 'moderacion',
    preguntas: {
      accion: {
        type: 'choice',
        instructions: 'Elige la acción para la publicación',
        criteria: {
          publicar: 'Publicar directamente',
          revisar: 'Revisar antes de publicar',
          rechazar: 'Rechazar la publicación',
        },
      },
    },
    umbral: 0.6,
    plazoMsPorMedio: {
      a1: 0,
      mac: 0,
      navegador: 0,
      malla: 0,
    },
    siDuda: 'regla',
    privacidad: 'puede-salir',
  },
  {
    id: 'privacidad.subir',
    capa: 'privacidad',
    preguntas: {
      esPrivado: {
        type: 'noul',
        instructions: '¿Contiene datos privados?',
        criteria: undefined,
      },
    },
    umbral: 0.6,
    plazoMsPorMedio: {
      a1: 0,
      mac: 0,
      navegador: 0,
      malla: 0,
    },
    siDuda: 'regla',
    privacidad: 'solo-propias',
  },
  {
    id: 'voz.tono',
    capa: 'voz',
    preguntas: {
      tono: {
        type: 'choice',
        instructions: 'Elige el tono de voz para la respuesta',
        criteria: { "amigable": "Tono amigable", "profesional": "Tono profesional" },
      },
    },
    umbral: 0.6,
    plazoMsPorMedio: {
      a1: 0,
      mac: 0,
      navegador: 0,
      malla: 0,
    },
    siDuda: 'regla',
    privacidad: 'puede-salir',
  },
  {
    id: 'video.intencion',
    capa: 'video',
    preguntas: {
      intencion: {
        type: 'choice',
        instructions: 'Elige la intención del video para formato',
        criteria: { "educativo": "Video educativo", "entretenimiento": "Video de entretenimiento" },
      },
    },
    umbral: 0.6,
    plazoMsPorMedio: {
      a1: 0,
      mac: 0,
      navegador: 0,
      malla: 0,
    },
    siDuda: 'regla',
    privacidad: 'puede-salir',
  },
  {
    id: 'enjambre.medio',
    capa: 'enjambre',
    preguntas: {
      medio: {
        type: 'choice',
        instructions: 'Elige el medio para la tarea',
        criteria: { "local": "Ejecución local", "nube": "Ejecución en nube" },
      },
      escritor: {
        type: 'choice',
        instructions: 'Elige el escritor para la tarea',
        criteria: { "agente-a": "Agente A", "agente-b": "Agente B" },
      },
    },
    umbral: 0.6,
    plazoMsPorMedio: {
      a1: 0,
      mac: 0,
      navegador: 0,
      malla: 0,
    },
    siDuda: 'regla',
    privacidad: 'puede-salir',
  },
];
export function validarPuntos(puntos: PuntoDecision[]): boolean {
  // Check unique ids
  const ids = new Set<string>();
  for (const punto of puntos) {
    if (ids.has(punto.id)) {
      return false;
    }
    ids.add(punto.id);
  }
  // Check umbral in range [0,1] if present
  for (const punto of puntos) {
    if (punto.umbral !== undefined && (punto.umbral < 0 || punto.umbral > 1)) {
      return false;
    }
  }
  // For choice questions, criteria must be present
  for (const punto of puntos) {
    for (const [key, pregunta] of Object.entries(punto.preguntas)) {
      if (pregunta.type === 'choice') {
        if (!pregunta.criteria || Object.keys(pregunta.criteria).length === 0) {
          return false;
        }
      }
    }
  }
  return true;
}
