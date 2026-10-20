"use client";

import { SkillCapability } from '@/ai/astraura/skills';

/**
 * Productividad · Habilidades de productividad de Matt Pocock
 * ----------------------------------------------------------
 * Las skills de productividad de Matt Pocock convertidas en capacidades vivas de Aurora.
 * Cada habilidad se representa como una SkillCapability que puede ser activada
 * mediante la instalación de la skill correspondiente desde la Biblioteca.
 */

export const PRODUCTIVITY_SKILLS: SkillCapability[] = [
  {
    id: "grill-me",
    label: "Grill-me · Entrevista relentless",
    systemPrompt:
      "Una entrevista relentless para afilar un plan o diseño. Llama a la skill 'grilling'.",
  },
  {
    id: "grilling",
    label: "Grilling · Entrevista de diseño",
    systemPrompt:
      "Entrevista al usuario incessantemente sobre un plan, decisión o idea. Mapea esto como un árbol de diseño: cada decisión se ramifica en las decisiones que dependen de ella. Trabaja el árbol en rondas: el frente es toda decisión cuyos prerequisitos ya están resueltos: las preguntas que puedes hacer ahora sin adivinar respuestas que aún no has escuchado. Pregunta todo el frente en una ronda: numera cada pregunta y da tu respuesta recomendada. Luego espera las respuestas del usuario antes de la próxima ronda.",
  },
  {
    id: "handoff",
    label: "Handoff · Documento de transferencia",
    systemPrompt:
      "Compacta la conversación actual en un documento de handoff para que otro agente lo continúe. Guarda en el directorio temporal del OS del usuario. Incluye una sección 'skills sugeridas' nombrando qué skills debería llamar el próximo agente. No dupliques contenido ya capturado en otros artefactos (especificaciones, planes, ADRs, issues, commits, diffs). Referenciarlos por ruta o URL en su lugar. Redacta cualquier información sensible, como claves API, contraseñas o información personalmente identificable.",
  },
  {
    id: "teach",
    label: "Teach · Enseñar una habilidad",
    systemPrompt:
      "Enseña al usuario una nueva habilidad o concepto dentro de este espacio de trabajo. El usuario te ha pedido que les enseñes algo. Esta es una solicitud stateful: pretenden aprender el tema en múltiples sesiones. Trata el directorio actual como un espacio de trabajo de enseñanza. Las rutas del espacio de trabajo (`./lessons/` y el resto) se resuelven desde el directorio donde se ejecutó `/teach`; solo los enlaces `*-FORMAT.md` se resuelven desde la carpeta de esta skill. El estado de su aprendizaje se captura en este directorio en varios archivos: `MISSION.md`, `./reference/*.html`, `RESOURCES.md`, `./learning-records/*.md`, `./lessons/*.html`, `./assets/*`, `NOTES.md`.",
  },
  {
    id: "to-questionnaire",
    label: "To-questionnaire · Convertir decisión en cuestionario",
    systemPrompt:
      "Convierte una decisión que no puedes responder completamente en un cuestionario para que alguien más lo complete. Convierte algo que el usuario no puede responder solo en un cuestionario: un documento Markdown que le dan a una persona para completar de forma asíncrona o completar juntos en una reunión. El destinatario posee conocimiento que el usuario le falta; el cuestionario lo saca de ellos. Asunta el remitente, no el tema. Interroga al usuario solo sobre el _remitente_, que siempre pueden responder: a quién va y qué necesitan de vuelta. Las preguntas en el documento luego apuntan al **hueco** entre lo que el destinatario sabe y lo que el usuario necesita.",
  },
  {
    id: "wait-what",
    label: "Wait-what · Repetir mensaje",
    systemPrompt:
      '"Detente. Ese último mensaje no llegó: vuelve a presentarlo." Espera, no entiendo dónde has llegado con eso. Vuelve a presentar eso: dándome un poco de contexto, hablando en ASD-STE100 Inglés Técnico Simplificado, y usando el lenguaje ubicuo de `GLOSSARY.md` (sigue `GLOSSARY-MAP.md` a la correcta si el repo tiene más de uno).',
  },
  {
    id: "writing-for-agents",
    label: "Writing-for-agents · Escribir para agentes",
    systemPrompt:
      "Escribiendo documentos para agentes. Usa al crear o editar skills, o modificando AGENTS.md o CLAUDE.md. Referencia para escribir cualquier documento que consuma un agente: una skill, un `AGENTS.md` / `CLAUDE.md`, un documento alcanzado por un puntero. El empaquetado difiere; la escritura no es: las mismas palancas hacen cada uno predecible, ya que el agente toma el mismo _proceso_ cada ejecución en lugar de producir la misma salida.",
  },
];
