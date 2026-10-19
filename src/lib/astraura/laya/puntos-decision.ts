// src/lib/astraura/laya/puntos-decision.ts
// Catálogo de puntos de decisión de Astraura (Laya)
// Ola 1018L · Laya en todas las capas de Astraura y habilidades de ingeniería para su IA

import type { PreguntaLaya } from "./tipos-laya";

export interface PuntoDecision {
  id: string;
  capa: string;
  preguntas: Record<string, PreguntaLaya>;
  umbral?: number;
  plazoMsPorMedio?: {
    a1: number;
    mac: number;
    navegador: number;
    malla: number;
  };
  siDuda?: "escalar" | "confirmar" | "regla" | "revisar";
  privacidad?: "puede-salir" | "solo-propias";
}

// Tabla §4: Catálogo de puntos de decisión
export const PUNTOS_DECISION: PuntoDecision[] = [
  {
    id: "reflejo.herramienta",
    capa: "reflejo",
    preguntas: {
      herramienta: {
        type: "choice",
        instructions: "¿Qué herramienta debe usar el reflejo para esta tarea?",
        criteria: {
          "gitnexus context": "Obtener contexto de un símbolo en el código",
          "gitnexus impact": "Analizar el impacto de cambios en un símbolo",
          "gitnexus query": "Buscar conceptos en el códigobase",
          "gitnexus detect-changes": "Detectar cambios en el código",
          "starseed-fuentes buscar": "Buscar en fuentes externas de APIs y herramientas",
        },
      },
    },
    umbral: 0.6,
    plazoMsPorMedio: {
      a1: 500,
      mac: 500,
      navegador: 500,
      malla: 1000,
    },
    siDuda: "escalar",
    privacidad: "solo-propias",
  },
  {
    id: "plan.dificultad",
    capa: "planificador",
    preguntas: {
      dificultad: {
        type: "score",
        instructions: "¿Cuál es la dificultad de esta tarea en una escala del 0 al 1?",
      },
      basta: {
        type: "noul",
        instructions: "¿Basta un modelo pequeño para resolver esta tarea?",
      },
    },
    umbral: 0.6,
    plazoMsPorMedio: {
      a1: 1000,
      mac: 1000,
      navegador: 1000,
      malla: 2000,
    },
    siDuda: "confirmar",
    privacidad: "solo-propias",
  },
  {
    id: "respuesta.basta",
    capa: "respuesta",
    preguntas: {
      basta: {
        type: "noul",
        instructions: "¿La respuesta resuelve completamente lo pedido?",
      },
    },
    umbral: 0.6,
    plazoMsPorMedio: {
      a1: 800,
      mac: 800,
      navegador: 800,
      malla: 1500,
    },
    siDuda: "escalar",
    privacidad: "solo-propias",
  },
  {
    id: "basico.consenso",
    capa: "basico",
    preguntas: {
      consenso: {
        type: "choice",
        instructions: "¿Hay consenso entre los modelos básicos sobre la respuesta?",
        criteria: {
          si: "Sí, hay consenso entre los modelos básicos",
          no: "No, hay desacuerdo entre los modelos básicos",
        },
      },
    },
    umbral: 0.6,
    plazoMsPorMedio: {
      a1: 1200,
      mac: 1200,
      navegador: 1200,
      malla: 2000,
    },
    siDuda: "revisar",
    privacidad: "solo-propias",
  },
  {
    id: "habilidad.elegir",
    capa: "habilidad",
    preguntas: {
      elegir: {
        type: "choice",
        instructions: "¿Qué habilidad de ingeniería debe aplicar Astraura para esta tarea?",
        criteria: {
          "grill-me": "Interrogar un plan para verificar su solidez",
          "to-spec": "Especificar y trocear requisitos en tickets accionables",
          "tdd": "Desarrollo guiado por pruebas",
          "diagnóstico": "Diagnóstico de errores y fallos en el sistema",
          "modelo-dominio": "Crear modelos de dominio del problema",
          "diseño-modulos": "Diseñar módulos profundos y bien estructurados",
          "revisión-código": "Revisar código para mejorar calidad y seguridad",
          "prototipos": "Crear prototipos rápidos para validar ideas",
          "investigación": "Investigar con fuentes externas y documentación",
          "handoff": "Traspaso entre sesiones de trabajo",
          "enseñar": "Enseñar conocimientos a otros miembros del equipo",
          "escribir-agentes": "Escribir documentación y guiones para agentes de IA",
        },
      },
    },
    umbral: 0.6,
    plazoMsPorMedio: {
      a1: 1500,
      mac: 1500,
      navegador: 1500,
      malla: 2500,
    },
    siDuda: "regla",
    privacidad: "solo-propias",
  },
  {
    id: "publicar.moderar",
    capa: "publicacion",
    preguntas: {
      moderar: {
        type: "choice",
        instructions: "¿Debe publicar, revisar o rechazar este contenido?",
        criteria: {
          publicar: "Publicar directamente el contenido",
          revisar: "Revisar el contenido antes de publicar",
          rechazar: "Rechazar el contenido y no publicar",
        },
      },
    },
    umbral: 0.6,
    plazoMsPorMedio: {
      a1: 1000,
      mac: 1000,
      navegador: 1000,
      malla: 2000,
    },
    siDuda: "revisar",
    privacidad: "solo-propias",
  },
  {
    id: "privacidad.subir",
    capa: "privacidad",
    preguntas: {
      subir: {
        type: "noul",
        instructions: "¿Contiene datos privados que puedan salir de las neuronas de la persona?",
      },
    },
    umbral: 0.6,
    plazoMsPorMedio: {
      a1: 2000,
      mac: 2000,
      navegador: 2000,
      malla: 3000,
    },
    siDuda: "escalar",
    privacidad: "solo-propias",
    // Nota: Laya solo puede SUBIR la privacidad, nunca bajarla
  },
  {
    id: "voz.tono",
    capa: "voz",
    preguntas: {
      tono: {
        type: "choice",
        instructions: "¿Qué tono de voz debe usar Astraura para esta comunicación?",
        criteria: {
          alegre: "Tono alegre y optimista",
          serena: "Tono sereno y tranquilo",
          dulce: "Tono dulce y afectuoso",
          seria: "Tono serio y formal",
          entusiasta: "Tono entusiasta y energético",
          empatica: "Tono empático y comprensivo",
          misteriosa: "Tono misterioso e intrigante",
          juguetona: "Tono juguetón y divertido",
        },
      },
    },
    umbral: 0.6,
    plazoMsPorMedio: {
      a1: 800,
      mac: 800,
      navegador: 800,
      malla: 1500,
    },
    siDuda: "regla",
    privacidad: "solo-propias",
  },
  {
    id: "video.intencion",
    capa: "video",
    preguntas: {
      intencion: {
        type: "choice",
        instructions: "¿Cuál es la intención detrás de este video?",
        criteria: {
          informativo: "Video informativo o educativo",
          entretenimiento: "Video de entretenimiento o recreación",
          promocional: "Video promocional o publicitario",
          tutorial: "Video tutorial o instructivo",
          testimonial: "Video testimonial o de experiencia personal",
        },
      },
    },
    umbral: 0.6,
    plazoMsPorMedio: {
      a1: 1200,
      mac: 1200,
      navegador: 1200,
      malla: 2000,
    },
    siDuda: "confirmar",
    privacidad: "solo-propias",
  },
  {
    id: "enjambre.medio",
    capa: "enjambre",
    preguntas: {
      medio: {
        type: "choice",
        instructions: "¿Qué medio debe usar el enjambre para esta tarea?",
        criteria: {
          a1: "Dispositivo Apple Silicon (Mac)",
          mac: "Máquina de escritorio estándar",
          navegador: "Navegador web en cualquier dispositivo",
          malla: "Red mesh P2P de neuronas",
        },
      },
      escritor: {
        type: "choice",
        instructions: "¿Qué escritor de código debe asignar el enjambre para esta tarea?",
        criteria: {
          opencode: "Agente OpenCode para escritura de código",
          codex: "Agente Codex para tareas complejas de razonamiento",
          hermes: "Agente Hermes para gestión y coordinación",
          antigravity: "Agente Antigravity para tareas de frontend",
        },
      },
    },
    umbral: 0.6,
    plazoMsPorMedio: {
      a1: 1500,
      mac: 1500,
      navegador: 1500,
      malla: 2500,
    },
    siDuda: "jev_enrutado",
    privacidad: "solo-propias",
  },
];

/**
 * Valida el catálogo de puntos de decisión
 * Comprueba:
 * 1. IDs únicos
 * 2. Umbrales en rango [0, 1]
 * 3. Que los questions de tipo "choice" tengan criteria definidos
 */
export function validarPuntos(): boolean {
  const ids = new Set<string>();
  
  for (const punto of PUNTOS_DECISION) {
    // Verificar ID único
    if (ids.has(punto.id)) {
      console.error(`ID duplicado encontrado: ${punto.id}`);
      return false;
    }
    ids.add(punto.id);
    
    // Verificar umbral en rango
    const umbral = punto.umbral ?? 0.6;
    if (umbral < 0 || umbral > 1) {
      console.error(`Umbral fuera de rango [0,1] para ${punto.id}: ${umbral}`);
      return false;
    }
    
    // Verificar que los questions de tipo "choice" tengan criteria
    for (const [key, pregunta] of Object.entries(punto.preguntas)) {
      if (pregunta.type === "choice" && !pregunta.criteria) {
        console.error(`Falta criteria en question de tipo choice: ${punto.id}.${key}`);
        return false;
      }
    }
  }
  
  return true;
}

