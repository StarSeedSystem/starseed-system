/**
 * PUNTOS DE DECISION DE LAYA (Ola 1018L · Laya en todas las capas de Astraura)
 * ─────────────────────────────────────────────────────────────────────────────
 * Cataloga los puntos donde Laya puede intervenir en la toma de decisiones
 * de Astraura. Cada punto tiene un ID único, pertenece a una capa específica,
 * define preguntas tipadas para Laya y especifica qué hacer en caso de duda.
 */

import type { PreguntaLaya } from "./types";

// Capas donde Laya puede intervenir
export type CapaLaya = 
  | "reflejo"
  | "planificador" 
  | "respuesta-modelo"
  | "decision-basica"
  | "habilidad"
  | "moderacion"
  | "privacidad"
  | "voz-video"
  | "enjambre";

// Acciones posibles cuando Laya duda o no llega a tiempo
export type AccionSiDuda = 
  | "escalar"
  | "confirmar" 
  | "regla"
  | "revisar"
  | "orden-deterministico";

// Niveles de privacidad según las reglas de Laya
export type NivelPrivacidadLaya = 
  | "puede-salir"
  | "solo-propias";

/**
 * Definición de un punto de decisión de Laya
 */
export interface PuntoDecision {
  /** Identificador único del punto de decisión */
  id: string;
  /** Capa donde se aplica este punto de decisión */
  capa: CapaLaya;
  /** Preguntas que se le hacen a Laya en este punto */
  preguntas: Record<string, PreguntaLaya>;
  /** Umbral de confianza para aceptar la decisión de Laya (0-1, default 0.6) */
  umbral?: number;
  /** Plazos en milisegundos por medio de ejecución */
  plazoMsPorMedio: {
    a1: number;    // Astraura 1.58-bit local
    mac: number;   // Máquina Mac
    navegador: number; // Navegador web
    malla: number; // Por malla P2P
  };
  /** Qué hacer si Laya duda o no responde a tiempo */
  siDuda: AccionSiDuda;
  /** Restricción de privacidad según Laya */
  privacidad: NivelPrivacidadLaya;
}

/**
 * Resultado de validar los puntos de decisión
 */
export interface ValidacionPuntos {
  /** Si la validación pasó exitosamente */
  valido: boolean;
  /** Errores encontrados durante la validación */
  errores: string[];
}

/* 
 * CATÁLOGO DE PUNTOS DE DECISION DE LAYA
 * Cada punto representa una oportunidad para que Laya intervenga en la toma de decisiones
 */

export const PUNTOS_DECISION_LAYA: PuntoDecision[] = [
  {
    id: "reflejo.herramienta",
    capa: "reflejo",
    preguntas: {
      "herramienta": {
        type: "choice",
        instructions: "Selecciona la herramienta más adecuada para resolver la tarea actual basada en el contexto disponible",
        criteria: {
          "buscar": "Cuando se necesita información externa o datos adicionales",
          "calcular": "Cuando se requiere realizar operaciones matemáticas o lógicas",
          "clasificar": "Cuando se necesita organizar o categorizar información",
          "transformar": "Cuando se requiere cambiar el formato o estructura de los datos",
          "comunicar": "Cuando se necesita enviar información a otro sistema o usuario",
          "almacenar": "Cuando se requiere guardar información para uso futuro",
          "recuperar": "Cuando se necesita acceder a información previamente almacenada",
          "notificar": "Cuando se debe alertar o informar sobre un evento o estado"
        }
      }
    },
    umbral: 0.7,
    plazoMsPorMedio: {
      a1: 500,    // Astraura 1.58-bit local - respuesta rápida esperada
      mac: 200,   // Máquina Mac - acceso directo
      navegador: 1000, // Navegador web - incluye latencia de red
      malla: 2000 // Por malla P2P - mayor latencia esperada
    },
    siDuda: "escalar",
    privacidad: "solo-propias"
  },
  {
    id: "plan.dificultad",
    capa: "planificador",
    preguntas: {
      "dificultad": {
        type: "score",
        instructions: "Evalúa la dificultad computacional de la tarea en una escala del 0 al 1",
        criteria: undefined
      },
      "bastaModeloPequeno": {
        type: "noul",
        instructions: "Determina si un modelo pequeño (como Needle 3) es suficiente para resolver esta tarea",
        criteria: undefined
      }
    },
    umbral: 0.65,
    plazoMsPorMedio: {
      a1: 800,
      mac: 400,
      navegador: 1500,
      malla: 3000
    },
    siDuda: "regla",
    privacidad: "solo-propias"
  },
  {
    id: "respuesta.basta",
    capa: "respuesta-modelo",
    preguntas: {
      "respuestaAdecuada": {
        type: "noul",
        instructions: "Evalúa si la respuesta generada por el modelo resuelve adecuadamente lo que se le pidió",
        criteria: undefined
      }
    },
    umbral: 0.75,
    plazoMsPorMedio: {
      a1: 1000,
      mac: 600,
      navegador: 2000,
      malla: 4000
    },
    siDuda: "escalar",
    privacidad: "solo-propias"
  },
  {
    id: "basico.consenso",
    capa: "decision-basica",
    preguntas: {
      "consensoModeloLaya": {
        type: "choice",
        instructions: "Compara la decisión del modelo pequeño (1.58 bits) con la de Laya y determina el curso de acción",
        criteria: {
          "valorarModelo": "Cuando ambos coinciden en su decisión",
          "confiarEnLaya": "Cuando Laya tiene alta confianza (≥ umbral) y el modelo pequeño podría estar equivocado",
          "subirCapa": "Cuando hay desacuerdo y se necesita un modelo más capaz para resolver"
        }
      }
    },
    umbral: 0.7,
    plazoMsPorMedio: {
      a1: 600,
      mac: 300,
      navegador: 1200,
      malla: 2500
    },
    siDuda: "regla",
    privacidad: "solo-propias"
  },
  {
    id: "habilidad.elegir",
    capa: "habilidad",
    preguntas: {
      "habilidadAplicable": {
        type: "choice",
        instructions: "Selecciona la habilidad de ingeniería que mejor se aplica al contexto actual",
        criteria: {
          "tdd": "Desarrollo dirigido por tests - cuando se necesita asegurar la calidad del código",
          "diagnosticoErrores": "Identificación y resolución de fallos en el sistema",
          "diseñoModulosProfundos": "Diseño de sistemas complejos y bien estructurados",
          "revisionCodigo": "Revisión sistemática de código para mejorar calidad y seguridad",
          "prototipos": "Creación rápida de versiones preliminares para validar conceptos",
          "investigacionFuentes": "Búsqueda y síntesis de información de fuentes confiables",
          "traspasoSesiones": "Transferencia efectiva de conocimiento entre diferentes contextos",
          "enseñar": "Comunicación clara de conceptos complejos a otros",
          "escribirParaAgentes": "Documentación y guías específicamente diseñados para agentes de IA",
          "ninguna": "Cuando ninguna de las habilidades aplicables es relevante para el contexto"
        }
      }
    },
    umbral: 0.6,
    plazoMsPorMedio: {
      a1: 1200,
      mac: 700,
      navegador: 2500,
      malla: 5000
    },
    siDuda: "confirmar",
    privacidad: "solo-propias"
  },
  {
    id: "publicar.moderar",
    capa: "moderacion",
    preguntas: {
      "accionPublicacion": {
        type: "choice",
        instructions: "Determina la acción adecuada para un elemento listo para publicación",
        criteria: {
          "publicar": "Cuando el contenido cumple todos los estándares de calidad y seguridad",
          "revisar": "Cuando el contenido necesita mejoras menores antes de publicar",
          "rechazar": "Cuando el contenido tiene problemas graves que impiden su publicación"
        }
      }
    },
    umbral: 0.8,
    plazoMsPorMedio: {
      a1: 1500,
      mac: 800,
      navegador: 3000,
      malla: 6000
    },
    siDuda: "revisar", // Nunca publicar en caso de duda - regla de privacidad
    privacidad: "solo-propias"
  },
  {
    id: "privacidad.subir",
    capa: "privacidad",
    preguntas: {
      "contieneDatosPrivados": {
        type: "noul",
        instructions: "Evalúa si el contenido proporcionado contiene información privada o sensible",
        criteria: undefined
      }
    },
    umbral: 0.8, // Alto umbral para privacidad - preferir falsos negativos sobre falsos positivos
    plazoMsPorMedio: {
      a1: 1000,
      mac: 500,
      navegador: 2000,
      malla: 4000
    },
    siDuda: "regla", // En caso de duda, seguir las reglas establecidas (solo subir privacidad, nunca bajarla)
    privacidad: "solo-propias" // Laya solo puede subir el nivel de privacidad, nunca bajarlo
  },
  {
    id: "voz.tono",
    capa: "voz-video",
    preguntas: {
      "tonoAdecuado": {
        type: "choice",
        instructions: "Selecciona el tono de voz más adecuado para el contexto comunicativo",
        criteria: {
          "formal": "Comunicación profesional, oficial o de naturaleza seria",
          "amigable": "Interacción cercana, cordial y de confianza",
          "entusiasta": "Expresión de energía, emoción y motivación positiva",
          "calmado": "Transmisión de tranquilidad, paz y serenidad",
          "serio": "Comunicación de importancia, gravedad o necesidad de atención",
          "informativo": "Enfoque claro en la transmisión de datos y conocimientos"
        }
      }
    },
    umbral: 0.65,
    plazoMsPorMedio: {
      a1: 800,
      mac: 400,
      navegador: 1600,
      malla: 3200
    },
    siDuda: "regla",
    privacidad: "solo-propias"
  },
  {
    id: "video.intencion",
    capa: "voz-video",
    preguntas: {
      "intencionVideo": {
        type: "choice",
        instructions: "Determina la intención principal detrás de una solicitud de creación o procesamiento de video",
        criteria: {
          "educativo": "Contenido diseñado para enseñar, explicar o instruir",
          "entretenimiento": "Material creado para disfrute, diversión y esparcimiento",
          "informativo": "Presentación objetiva de hechos, datos o aconteceres",
          "promocional": "Contenido destinado a publicitar, promover o dar a conocer algo",
          "artistico": "Expresión creativa mediante medios visuales y sonoros",
          "documental": "Registro fiel de realidad para conservación histórica o testimonial"
        }
      }
    },
    umbral: 0.6,
    plazoMsPorMedio: {
      a1: 1000,
      mac: 500,
      navegador: 2000,
      malla: 4000
    },
    siDuda: "regla",
    privacidad: "solo-propias"
  },
  {
    id: "enjambre.medio",
    capa: "enjambre",
    preguntas: {
      "medioAsignado": {
        type: "choice",
        instructions: "Selecciona el medio óptimo para ejecutar una tarea del enjambre considerando recursos y restricciones",
        criteria: {
          "local": "Ejecución directa en el dispositivo donde se originó la tarea",
          "malla": "Utilización de la red P2P de neuronas compartidas",
          "nube": "Recurso computacional proporcionado por servicios en la nube gratuita",
          "servidorPropio": "Infraestructura dedicada perteneciente a la cuenta o grupo"
        }
      }
    },
    umbral: 0.7,
    plazoMsPorMedio: {
      a1: 600,
      mac: 300,
      navegador: 1200,
      malla: 2500
    },
    siDuda: "orden-deterministico",
    privacidad: "solo-propias"
  }
];

/**
 * Valida el catálogo completo de puntos de decisión
 * - IDs únicos
 * - Umbrales en rango [0,1]
 * - Preguntas de tipo 'choice' deben tener criterios definidos
 */
export function validarPuntos(puntos: PuntoDecision[] = PUNTOS_DECISION_LAYA): ValidacionPuntos {
  const errores: string[] = [];
  const ids = new Set<string>();

  for (const punto of puntos) {
    // Verificar ID único
    if (ids.has(punto.id)) {
      errores.push(`ID duplicado: ${punto.id}`);
    }
    ids.add(punto.id);

    // Verificar umbral en rango
    if (punto.umbral !== undefined && (punto.umbral < 0 || punto.umbral > 1)) {
      errores.push(`Umbral fuera de rango [0,1] para ${punto.id}: ${punto.umbral}`);
    }

    // Verificar que preguntas de tipo 'choice' tengan criterios
    for (const [nombre, pregunta] of Object.entries(punto.preguntas)) {
      if (pregunta.type === "choice" && !pregunta.criteria) {
        errores.push(`Pregunta 'choice' sin criterios: ${punto.id}.${nombre}`);
      }
    }
  }

  return {
    valido: errores.length === 0,
    errores
  };
}