// StarSeed · Ontocracia / Comandos Democráticos — tipos y constantes base.
// Motor de decisiones democráticas para cualquier modificación colectiva del sistema.

// Área de pericia de las insignias (meritocracia del entendimiento). Import de
// SÓLO-TIPO: se borra por completo en compilación (isolatedModules), así que no
// crea ningún acoplamiento en runtime con la capa cliente de insignias.
import type { BadgeArea } from "@/lib/badges/badges";

export type GovernanceMode = "democratic" | "hierarchical";

export type Urgency = "low" | "normal" | "high" | "critical";

export type ProposalStatus =
  | "open"
  | "passed"
  | "rejected"
  | "expired"
  | "executed"
  | "failed";

// Ámbitos donde puede vivir una decisión: cualquier sistema político/publicación.
export type Scope =
  | "message"
  | "group"
  | "page"
  | "community"
  | "account"
  | "global";

export type AttachmentType =
  | "text"
  | "file"
  | "app"
  | "link"
  | "post"
  | "program";

export type Attachment = {
  type: AttachmentType;
  value: string;
  label?: string;
};

export type ProposalOption = {
  id: string;
  label: string;
  description?: string;
};

// Comando procedimental que se ejecuta si la decisión se aprueba.
export type CommandSpec = {
  type: string;
  payload: Record<string, unknown>;
};

// Meritocracia del entendimiento (OPT-IN, ADITIVA). Cuando `enabled` es true,
// las insignias verificadas de cada votante añaden un BONUS ACOTADO a cuánto
// PESA su voto hacia la opción ganadora — NUNCA al censo ni al quórum (una
// persona sigue contando como UNA para participación). Por defecto DESACTIVADA:
// todo contexto es "una persona, un voto" salvo que se habilite explícitamente.
export type MeritParams = {
  enabled: boolean; // OFF por defecto — nada cambia respecto al voto igualitario.
  maxBonus?: number; // tope del bonus (por defecto 1 → multiplicador máx. 2×).
  area?: BadgeArea | "auto"; // área de pericia; "auto"/ausente ⇒ se deduce del tema.
};

// Parámetros configurables de la decisión por contexto.
export type DecisionParams = {
  votingMinutes: number; // tiempo de votación en minutos
  minParticipants: number; // mínimo de participantes (conteo)
  minPercent: number; // participación mínima en % (0 = ignorar)
  threshold: number; // umbral de victoria de la opción líder (%) p.ej. 50
  urgency: Urgency;
  votingEndsAt?: string; // calculado al crear (ISO)
  // Ponderación por mérito OPCIONAL. Ausente o `{enabled:false}` ⇒ voto igualitario.
  meritWeighting?: MeritParams;
};

export type Proposal = {
  id: string;
  scope: string;
  scope_ref: string | null;
  author: string;
  title: string;
  description: string | null;
  kind: string;
  options: ProposalOption[];
  attachments: Attachment[];
  command: CommandSpec | null;
  params: DecisionParams;
  status: ProposalStatus | string;
  result: Record<string, unknown> | null;
  created_at: string;
  resolved_at?: string | null;
  executed_at?: string | null;
};

export type ProposalVote = {
  proposal_id: string;
  voter: string;
  choice: string; // id de opción, o 'yes'|'no'|'abstain'
  weight: number;
  comment: string | null;
  created_at: string;
  // enriquecido en la UI (voto público):
  display_name?: string | null;
  handle?: string | null;
  avatar_url?: string | null;
};

export type ProposalNotification = {
  id: string;
  proposal_id: string;
  user_id: string;
  kind: string; // 'vote_request' | 'affected' | 'result'
  message: string | null;
  seen: boolean;
  created_at: string;
};

export type GovernanceConfig = {
  id?: string;
  scope: string;
  scope_ref: string | null;
  mode: GovernanceMode;
  params: Record<string, unknown>;
  owner?: string | null;
  updated_at?: string;
};

// Presets de urgencia: cada uno define un tiempo de votación por defecto.
export const URGENCY: Record<
  Urgency,
  { label: string; votingMinutes: number; color: string }
> = {
  low: { label: "Baja", votingMinutes: 7 * 24 * 60, color: "text-sky-300 border-sky-400/40 bg-sky-500/10" },
  normal: { label: "Normal", votingMinutes: 2 * 24 * 60, color: "text-emerald-300 border-emerald-400/40 bg-emerald-500/10" },
  high: { label: "Alta", votingMinutes: 6 * 60, color: "text-amber-300 border-amber-400/40 bg-amber-500/10" },
  critical: { label: "Crítica", votingMinutes: 60, color: "text-red-300 border-red-400/40 bg-red-500/10" },
};

export const DEFAULT_PARAMS: DecisionParams = {
  votingMinutes: URGENCY.normal.votingMinutes,
  minParticipants: 1,
  minPercent: 0,
  threshold: 50,
  urgency: "normal",
  // Meritocracia del entendimiento DESACTIVADA por defecto (una persona, un voto).
  meritWeighting: { enabled: false },
};

// Parámetros por defecto de un contexto de gobernanza.
export const DEFAULT_GOV_PARAMS: Record<string, unknown> = {
  votingMinutes: DEFAULT_PARAMS.votingMinutes,
  minParticipants: DEFAULT_PARAMS.minParticipants,
  minPercent: DEFAULT_PARAMS.minPercent,
  threshold: DEFAULT_PARAMS.threshold,
  urgency: DEFAULT_PARAMS.urgency,
  // Meritocracia del entendimiento DESACTIVADA por defecto en todo contexto.
  meritWeighting: { enabled: false },
  // siempre debe existir la opción democrática, incluso en grupos jerárquicos:
  allowDemocraticOverride: true,
  config: {},
  permissions: {},
};

export const SCOPES: { id: Scope; label: string }[] = [
  { id: "message", label: "Mensaje" },
  { id: "group", label: "Grupo" },
  { id: "page", label: "Página" },
  { id: "community", label: "Comunidad" },
  { id: "account", label: "Cuenta" },
  { id: "global", label: "Global" },
];

// Opciones implícitas cuando una propuesta no define variantes.
export const YESNO_OPTIONS: ProposalOption[] = [
  { id: "yes", label: "Sí" },
  { id: "no", label: "No" },
  { id: "abstain", label: "Abstención" },
];

export function uid(prefix = "opt"): string {
  return prefix + "_" + Math.random().toString(36).slice(2, 9);
}
