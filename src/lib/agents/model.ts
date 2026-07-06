"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — Agentes · MODELO (tipos)  [P5 + P4]
 * ---------------------------------------------------------------------------
 * Un AGENTE es un item guardable/instalable de la Biblioteca (como cualquier
 * app/función/diseño): una configuración de Aurora+Astraura con persona
 * (system-prompt), un conjunto de CAPACIDADES (ids del vocabulario compartido
 * de `src/ai/astraura/skills.ts` — taste · pm · web-senses · research · vision
 * · voice), preferencias de modelo opcionales y metadatos de autoría/versión.
 *
 * Encaja en las Invariantes de CLAUDE.md §6:
 *   · Identidad Soberana → el agente es dato del usuario; vive en localStorage
 *     y se refleja (unión, nunca resta) en la cuenta soberana (Supabase
 *     `user_settings.prefs`), igual que la Biblioteca (library-sync).
 *   · Dualidad Cuenta/Perfil → `visibility` distingue lo PRIVADO (biblioteca
 *     personal) de lo PÚBLICO (compartido a un entorno social). La autoría y la
 *     responsabilidad quedan firmadas en `author`.
 *   · Singularidad del contenido → replicar/ramificar crea Entidades con id
 *     propio y `parentId` que referencia al origen (no se pierde el linaje).
 *
 * Un BINDING [P4] ata un agente a cualquier "cerebro"/ubicación del OS (página,
 * grupo, publicación, mensaje, widget, app, perfil), en ámbito público o
 * privado. Así un mismo agente Aurora+Astraura puede alimentar el cerebro de
 * distintas superficies.
 *
 * Solo TIPOS aquí (sin efectos): SSR-safe por construcción.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Id de capacidad del vocabulario compartido OS · Nexus · Café
 * (`SKILL_CAPABILITIES` en src/ai/astraura/skills.ts). Se deja como `string`
 * a propósito (no un union cerrado) para no acoplar en compilación con ese
 * módulo ni romper si la lista crece; la UI valida contra el manifiesto vivo.
 */
export type CapabilityId = string;

/** Visibilidad de un agente (Dualidad Cuenta/Perfil de CLAUDE.md §6). */
export type AgentVisibility = "private" | "public";

/**
 * Preferencias de modelo (opcionales). Guían a Astraura sin obligar: si algo
 * no está disponible/gratis, el router sigue eligiendo gratis-primero.
 */
export interface AgentModelPrefs {
  /** Sesga hacia modelos fuertes para tareas difíciles. */
  preferStrong?: boolean;
  /** Id de fuente preferida del catálogo Astraura (p.ej. "groq-free"). */
  preferredSourceId?: string;
  /** Nombre de modelo concreto si la fuente lo admite (p.ej. "llama-3.3-70b"). */
  preferredModel?: string;
  /** Creatividad 0..1 (la UI la interpreta como temperatura sugerida). */
  temperature?: number;
}

/** Un Agente: item guardable/instalable = "cerebro configurable" de Aurora. */
export interface Agent {
  id: string;
  name: string;
  description: string;
  /** La PERSONA: texto de system-prompt que define voz, rol y límites. */
  persona: string;
  /** Capacidades activas (ids del manifiesto de skills.ts). */
  capabilities: CapabilityId[];
  /** Preferencias de modelo (opcional). */
  model?: AgentModelPrefs;
  /** Nombre de icono lucide (la UI resuelve con fallback a Bot). */
  icon: string;
  /** Autoría soberana (responsabilidad recae aquí). */
  author: string;
  /** Privado (biblioteca personal) o público (compartido a la red social). */
  visibility: AgentVisibility;
  /** SemVer-ish; se incrementa al ACTUALIZAR. */
  version: string;
  /** Si es una RAMA (fork): id del agente padre. */
  parentId?: string;
  /** Builtin de fábrica (no editable in situ; se replica para editar). */
  builtin?: boolean;
  /** Marca de tiempo de creación. */
  createdAt: number;
  /** Marca de tiempo de última modificación. */
  updatedAt: number;
}

/** Tipos de "cerebro"/ubicación a los que se puede atar un agente [P4]. */
export type BindingTargetType =
  | "page"
  | "group"
  | "post"
  | "message"
  | "widget"
  | "app"
  | "profile";

export const BINDING_TARGET_TYPES: BindingTargetType[] = [
  "page", "group", "post", "message", "widget", "app", "profile",
];

/** Ámbito del binding: público (cerebro visible en lo público) o privado. */
export type BindingScope = "public" | "private";

/** Un vínculo agente → ubicación (cerebro). */
export interface AgentBinding {
  agentId: string;
  targetType: BindingTargetType;
  targetId: string;
  scope: BindingScope;
  /** Marca de tiempo del vínculo. */
  at: number;
}

/** Registro "stub" de compartición pública (sin backend real todavía). */
export interface PublicAgentRecord {
  agent: Agent;
  /** Cuándo se compartió a lo público. */
  sharedAt: number;
  /** Autoría de quien comparte (firma soberana). */
  sharedBy: string;
}

/** Categoría de la Biblioteca donde viven los agentes. */
export const AGENTS_CATEGORY_ID = "agent";
export const AGENTS_CATEGORY_LABEL = "Agentes";
