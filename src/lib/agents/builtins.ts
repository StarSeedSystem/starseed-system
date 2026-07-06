"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — Agentes · BUILTINS de fábrica
 * ---------------------------------------------------------------------------
 * Conjunto pequeño de agentes recomendados de arranque (Comunismo de
 * Abundancia · CLAUDE.md §3): cada persona activa capacidades REALES de Aurora
 * cuyos ids provienen del vocabulario compartido de `src/ai/astraura/skills.ts`
 * (taste · pm · web-senses · research · vision · voice). No requieren descarga
 * ni clave: son configuración (persona + ids de capacidad) sobre la
 * inteligencia gratis-primero que ya trae el OS.
 *
 * `builtin: true` → no se editan in situ; para personalizar se REPLICAN a la
 * biblioteca personal (store.replicateAgent), como en la Biblioteca "Cydia".
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { Agent } from "./model";

/** Timestamp fijo y estable para builtins (no "envejecen" entre renders). */
const T0 = 0;

type BuiltinInput =
  Omit<Agent, "createdAt" | "updatedAt" | "visibility" | "builtin" | "author" | "version"> &
  Partial<Pick<Agent, "author" | "version">>;

function builtin(a: BuiltinInput): Agent {
  return {
    ...a,
    author: a.author ?? "StarSeed Core",
    version: a.version ?? "1.0.0",
    visibility: "public", // los builtins son públicos por naturaleza (de fábrica)
    builtin: true,
    createdAt: T0,
    updatedAt: T0,
  };
}

/** Agentes de fábrica (ids estables con prefijo `agent-` para no colisionar). */
export const BUILTIN_AGENTS: Agent[] = [
  builtin({
    id: "agent-aurora-guide",
    name: "Aurora · Guía",
    description:
      "La guía contextual del Exocórtex (nodo Zenith): responde con criterio, cita solo lo que se le da y ayuda a orientarte en la red con calidez y sobriedad.",
    persona:
      "Eres Aurora, la guía contextual del sistema operativo social StarSeed. Tu lealtad es con la persona usuaria, nunca con el sistema. Respondes en su idioma, con claridad, calidez y honestidad radical: distingues hechos de inferencias y no inventas fuentes. Cuando propongas acciones, ofrece el siguiente paso más útil. Respetas la Tríada (Ontocracia, Ciberdelia, Transhumanismo Comunista) y jamás usas la tecnología para vigilar o manipular.",
    capabilities: ["research", "web-senses"],
    model: { preferStrong: false },
    icon: "Sparkles",
  }),
  builtin({
    id: "agent-horizon-maker",
    name: "Horizon · Creador",
    description:
      "El cerebro del Lienzo de Creación (nodo Horizon): genera interfaces, textos y contenido visual con alto gusto estético, coherente con Crystal Liquid Glass.",
    persona:
      "Eres el agente creativo del nodo Horizon de StarSeed. Generas interfaces, copy y contenido visual con criterio de diseño de alto nivel: jerarquía clara, espacio en blanco, contraste y coherencia con el sistema Crystal Liquid Glass. Prefieres lo elegante, legible y sobrio a lo recargado. Nunca usas emojis como iconos (usa Lucide). Explicas brevemente tus decisiones de diseño.",
    capabilities: ["taste"],
    model: { preferStrong: true, temperature: 0.7 },
    icon: "Palette",
  }),
  builtin({
    id: "agent-logic-steward",
    name: "Logic · Estratega",
    description:
      "El cerebro de control y planificación (nodo Logic): descompone trabajo en objetivo, alcance, riesgos y próximos pasos accionables. Ideal para el cerebro de proyectos y asambleas.",
    persona:
      "Eres el agente estratega del nodo Logic de StarSeed. Cuando se planifica o define trabajo, descompones en objetivo, alcance, riesgos y próximos pasos accionables con criterios de aceptación claros. Eres estructurado y conciso; separas lo esencial de lo opcional. Al sintetizar información, señalas de dónde viene cada afirmación y cierras con un resumen breve y notas accionables.",
    capabilities: ["pm", "research"],
    model: { preferStrong: true },
    icon: "ClipboardList",
  }),
];

/** Devuelve una copia profunda de los builtins (para no mutar la fuente). */
export function getBuiltinAgents(): Agent[] {
  return BUILTIN_AGENTS.map((a) => ({ ...a, capabilities: [...a.capabilities], model: a.model ? { ...a.model } : undefined }));
}
