/**
 * PROCEDENCIA DE UN PROCESO ONÍRICO — lectura defensiva + etiquetado honesto
 * de los campos nuevos que el backend empieza a mandar por proceso:
 * `personality` (bajo qué personalidad corrió), `agents` (qué agentes
 * participaron) y `memory_items` (qué memoria REAL lo alimentó, con su
 * procedencia — mem0 / documento / grafo, y el cerebro o servidor de origen
 * cuando el backend lo manda). Complementa a `generated_by`, que ya existe
 * hoy en las ramas (`branches-modal.tsx`) y ahora también llega por proceso.
 *
 * El cliente tipado (`astraura-158-client.ts`) NO declara estos 4 campos en
 * `Astraura158ProcessType` todavía — se leen aquí con el MISMO idioma
 * defensivo que ya usan `astraura-158-window.tsx` y `s158/imaginacion-tab.tsx`
 * para leer `generated_by` en las ramas: cast a `Record<string, unknown>` +
 * narrowing manual, nunca `any`, nunca lanza.
 *
 * HONESTIDAD (requisito duro del proyecto): un campo que el backend nunca
 * mandó (`undefined`) no pinta nada — la tarjeta debe verse EXACTAMENTE como
 * hoy contra un backend viejo. Un campo que el backend SÍ mandó pero vacío
 * (`[]`) sí se pinta, como ausencia real — nunca se disimula con relleno.
 *
 * Sin JSX ni imports de React/DOM a propósito, para poder probarse con
 * Vitest en entorno `node` sin arrastrar el árbol de componentes.
 */

import type { Astraura158ProcessType } from "@/lib/astraura/astraura-158-client";

export interface ProcessParticipant {
  id?: string;
  name?: string;
  color?: string;
}

export interface ProcessMemoryItem {
  id?: string;
  title?: string;
  content?: string;
  /** Fuente real: "mem0" / "document" / "graph" (u otro valor del backend,
   *  que se muestra TAL CUAL — nunca se oculta ni se reetiqueta como una de
   *  las conocidas). */
  source?: string;
  brain?: { id?: string; name?: string };
  server?: { id?: string; name?: string };
}

export interface BadgeMeta {
  label: string;
  tone: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/* ── Lectura defensiva de los campos sin tipar en `Astraura158ProcessType` ── */

/** `pt.generated_by` — mismo campo/significado que ya usan las ramas (spec:
 *  "ya existe hoy, vale 'llm' o 'template'"). Cualquier otro valor (o
 *  ausente) ⇒ `undefined`: sin insignia: nunca se etiqueta como "plantilla"
 *  algo que el backend no dijo. */
export function processGeneratedBy(pt: Astraura158ProcessType): "llm" | "template" | undefined {
  const v = (pt as unknown as Record<string, unknown>).generated_by;
  return v === "llm" ? "llm" : v === "template" ? "template" : undefined;
}

/** `pt.personality` — objeto o ausente; si el backend manda algo que no es
 *  un objeto (string suelto, número, array…) se trata como ausente en vez
 *  de reventar aguas abajo. */
export function processPersonality(pt: Astraura158ProcessType): ProcessParticipant | undefined {
  const v = (pt as unknown as Record<string, unknown>).personality;
  return isRecord(v) ? (v as ProcessParticipant) : undefined;
}

/**
 * Normaliza una lista opcional del backend (`agents` / `memory_items`):
 *  - el CAMPO no vino (`undefined`/`null`/no-array) ⇒ `undefined` — no se
 *    pinta nada, compatibilidad con un backend más viejo que el frontend.
 *  - el campo vino como array (incluso `[]`, incluso con elementos que no
 *    son objetos reales) ⇒ se filtra a solo objetos y se devuelve — el
 *    backend SÍ contestó, aunque sea con la lista vacía, y eso se muestra.
 */
function processListField<T>(pt: Astraura158ProcessType, key: string): T[] | undefined {
  const v = (pt as unknown as Record<string, unknown>)[key];
  if (!Array.isArray(v)) return undefined;
  return v.filter(isRecord) as T[];
}

export function processAgents(pt: Astraura158ProcessType): ProcessParticipant[] | undefined {
  return processListField<ProcessParticipant>(pt, "agents");
}

export function processMemoryItems(pt: Astraura158ProcessType): ProcessMemoryItem[] | undefined {
  return processListField<ProcessMemoryItem>(pt, "memory_items");
}

/* ── Etiquetado honesto (label + tono) ─────────────────────────────────── */

/** Insignia de honestidad de la última activación — MISMO texto/color que
 *  `generated_by` ya usa `BranchCard` en `branches-modal.tsx`: el mismo
 *  campo debe leerse igual en toda la carpeta. `null` ⇒ no pintar nada. */
export function generatedByBadgeMeta(gen: "llm" | "template" | undefined): BadgeMeta | null {
  if (gen === "llm") return { label: "Generado por: modelo real", tone: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" };
  if (gen === "template") return { label: "Plantilla", tone: "border-amber-400/30 bg-amber-500/10 text-amber-200" };
  return null;
}

/** Paleta de fuentes de memoria — deliberadamente SIN ámbar ni esmeralda:
 *  esos dos tonos ya significan "plantilla" y "modelo real" en la insignia
 *  de arriba; reutilizarlos aquí mezclaría dos escalas de honestidad
 *  distintas (una fuente real por documento no es "menos de fiar" que mem0). */
const MEMORY_SOURCE_TONE = {
  mem0: "border-cyan-400/30 bg-cyan-500/10 text-cyan-200",
  document: "border-indigo-400/30 bg-indigo-500/10 text-indigo-200",
  graph: "border-violet-400/30 bg-violet-500/10 text-violet-200",
  unknown: "border-white/15 bg-white/[0.04] text-white/60",
} as const;

/** Etiqueta + tono de la FUENTE de un ítem de memoria real (spec: "mem0 /
 *  documento / grafo"). Un valor que el backend mande y el frontend no
 *  reconozca se muestra TAL CUAL (nunca se oculta ni se hace pasar por otra
 *  fuente); sin fuente en absoluto, se dice explícitamente. */
export function memorySourceMeta(source?: string): BadgeMeta {
  const raw = typeof source === "string" ? source.trim() : "";
  if (!raw) return { label: "Fuente sin especificar", tone: MEMORY_SOURCE_TONE.unknown };
  const v = raw.toLowerCase();
  if (v.includes("mem0")) return { label: "mem0", tone: MEMORY_SOURCE_TONE.mem0 };
  if (/doc|vector|indexer/.test(v)) return { label: "Documento indexado", tone: MEMORY_SOURCE_TONE.document };
  if (/graf|graph/.test(v)) return { label: "Grafo de conocimiento", tone: MEMORY_SOURCE_TONE.graph };
  return { label: raw, tone: MEMORY_SOURCE_TONE.unknown };
}

/** "Cerebro o servidor de origen" de un ítem de memoria, cuando el backend
 *  lo manda. `undefined` cuando no hay nada usable — no se inventa origen. */
export function memoryOriginLabel(item: ProcessMemoryItem): string | undefined {
  const brainName = typeof item.brain?.name === "string" ? item.brain.name.trim() : "";
  if (brainName) return `Cerebro: ${brainName}`;
  const serverName = typeof item.server?.name === "string" ? item.server.name.trim() : "";
  if (serverName) return `Servidor: ${serverName}`;
  return undefined;
}

/** Texto visible de un participante (personalidad/agente): nombre → id →
 *  aviso honesto de que el backend no mandó identificador alguno. Nunca
 *  cadena vacía (dejaría un chip mudo). */
export function participantLabel(p: ProcessParticipant | undefined, fallback: string): string {
  const name = typeof p?.name === "string" ? p.name.trim() : "";
  if (name) return name;
  const id = typeof p?.id === "string" ? p.id.trim() : "";
  if (id) return id;
  return fallback;
}
