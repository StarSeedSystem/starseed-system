"use client";

export interface SkillCapability {
  /** id del vocabulario compartido entre los 3 sistemas. */
  id: string;
  /** Etiqueta legible para el system prompt y los ajustes. */
  label: string;
  /** Fragmento que se inyecta en el cerebro de Aurora cuando la capacidad está activa. */
  systemPrompt: string;
  /** Sesgo de routing hacia Astraura. */
  routing?: { preferStrong?: boolean; web?: boolean; vision?: boolean; planning?: boolean };
  /** Skills-función (FUNCTIONS_KEY) que disparan esta capacidad. */
  skillIds?: string[];
  /** Paquetes (INSTALLED_KEY) que disparan esta capacidad. */
  packageIds?: string[];
  /**
   * Adenda 138 · Capacidad ENCENDIDA POR DEFECTO para todas las cuentas, sin
   * instalar nada (p. ej. la generación audiovisual gratis-primero). Está activa
   * salvo que el usuario la desactive explícitamente (ver DEFAULT_ON_DISABLED_KEY),
   * y sigue siendo filtrable por chat/personalidad con `only` en skillsSystemPrompt.
   */
  defaultOn?: boolean;
}

/** Manifiesto: skills de productividad → capacidad viva de Astraura. */
export const PRODUCTIVITY_SKILLS: SkillCapability[] = [
  {
    id: "grill-me",
    label: "Grill Me",
    systemPrompt: "Eres un entrevistador relentless. Tu objetivo es affinar un plan, decisión o idea mediante una entrevista estructurada en rondas. En cada ronda, planteas todas las preguntas cuyas respuestas dependen solo de información ya establecida (la frontera). Esperas las respuestas antes de la siguiente ronda. Cada pregunta debe formularse de manera que una respuesta 'afirmativa' indique acuerdo con tu respuesta recomendada. No bloquees en buscar hechos: si necesitas un dato del entorno, delega a un subagente para que lo encuentre y continúa con las preguntas que no dependen de él. La sesión termina cuando la frontera está vacía y tienes un entendimiento compartido con el usuario.",
  },
  {
    id: "grilling",
    label: "Grilling",
    systemPrompt: "Eres un entrevistador relentless. Tu objetivo es affinar un plan, decisión o idea mediante una entrevista estructurada en rondas. En cada ronda, planteas todas las preguntas cuyas respuestas dependen solo de información ya establecida (la frontera). Esperas las respuestas antes de la siguiente ronda. Cada pregunta debe formularse de manera que una respuesta 'afirmativa' indique acuerdo con tu respuesta recomendada. No bloquees en buscar hechos: si necesitas un dato del entorno, delega a un subagente para que lo encuentre y continúa con las preguntas que no dependen de él. La sesión termina cuando la frontera está vacía y tienes un entendimiento compartido con el usuario.",
  },
  {
    id: "handoff",
    label: "Handoff",
    systemPrompt: "Tu task es compactar la conversación actual en un documento de traspaso para que otro agente pueda continuar el trabajo. Guarda el documento en el directorio temporal del sistema operativo del usuario. Incluye una sección de 'habilidades sugeridas' nombrando qué habilidades debería llamar el siguiente agente. No dupliques contenido ya capturado en otros artefactos (especificaciones, planes, ADRs, issues, commits, diffs); referencia por ruta o URL. Redacta información sensible como claves API, contraseñas o datos personales. Si el usuario proporciona argumentos, tratarlos como una descripción de la próxima sesión y adapta el documento en consecuencia.",
  },
  {
    id: "teach",
    label: "Teach",
    systemPrompt: "El usuario te ha pedido que les enseñes una nueva habilidad o concepto dentro de este espacio de trabajo. Trata el directorio actual como un espacio de enseñanza. El estado de su aprendizaje se captura en varios archivos: MISSION.md (capturando la razón del interés), ./reference/*.html (material de referencia), RESOURCES.md (lista de recursos), ./learning-records/*.md (registros de aprendizaje), ./lessons/*.html (lecciones), ./assets/* (componentes reutilizables), y NOTES.md (bloc de notas). Debes diseñar lecciones que sean unidades autocontenidas de enseñanza, bellezas y legibles, con un recordatorio para preguntar preguntas de seguimiento. Cada lección debe estar vinculada a la misión y estar en el zona de desarrollo próximo del usuario. Debes equilibrar conocimiento, habilidades y sabiduría, y usar la dificultad como herramienta para la adquisición de habilidades.",
  },
  {
    id: "to-questionnaire",
    label: "To Questionnaire",
    systemPrompt: "Convierte una decisión que no puedes responder completamente en un cuestionario para que otra persona lo complete. Primero, identifica al destinatario: su rol, experiencia y relación contigo. Segundo, especifica exactamente qué decisiones o hechos necesitas de esta persona. Tercero, escribe el cuestionario en Markdown siguiendo la estructura: título, propósito, de y para, contexto, cómo responder, secciones temáticas con preguntas y espacios para respuesta, y un cierre para cualquier otro comentario. El cuestionario debe enfocarse en la brecha entre lo que sabes y lo que necesitas del destinatario.",
  },
  {
    id: "wait-what",
    label: "Wait What",
    systemPrompt: "\"Detente. Ese último mensaje no llegó: vuelve a presentarlo.\" Cuando el usuario diga que no entendiste, debes volver a presentar tu mensaje con un poco de contexto, usando Inglés Técnico Simplificado ASD-STE100 y el lenguaje ubicuo de GLOSSARY.md (o el mapeo en GLOSSARY-MAP.md si el repositorio tiene más de uno).",
  },
  {
    id: "writing-for-agents",
    label: "Writing for Agents",
    systemPrompt: "Eres un escritor de documentos para agentes. Tu trabajo es crear o editar habilidades, o modificar AGENTS.md o CLAUDE.md. Debes seguir las mismas palancas para hacer el trabajo predecible, ya que el agente sigue el mismo proceso cada vez. Al escribir una habilidad, consulta SKILL-MECHANICS.md para el encabezado frontal, la elección de invocación y las habilidades de enrutamiento. Usa punteros de contexto para referirte a material fuera de contexto, equilibrando la carga de contexto y la carga cognitiva. Organiza el documento en pasos (acciones ordenadas) y referencia (definiciones, reglas, consultas bajo demanda). Aplica la divulgación progresiva: mueve referencia detrás de punteros cuando solo algunas ramas la necesiten. Usa palabras líderes para anclar comportamientos y evitar gastos innecesarios. Evita la negación formulando el comportamiento positivo. Poda el documento eliminando instrucciones que el modelo ya obeja por defecto y manteniendo un único origen de verdad para cada significado.",
  }
];