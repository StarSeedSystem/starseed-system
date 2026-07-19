"use client";

/**
 * CEREBRO · GESTIÓN INTELIGENTE DE MEMORIA ("Organizar con IA").
 * ============================================================================
 * Tres acciones sobre las memorias de un cerebro, apoyadas en la inteligencia
 * que YA existe en el OS (no reimplementa el router de IA):
 *
 *   1. summarizeToMemory  → resume un chat/archivo a una memoria (título + md),
 *      usando astrauraChat con taskHint "summary" (mismo patrón que
 *      memory-intelligence.ts draftSummary). Con respaldo local si no hay IA.
 *   2. classifyCognitiveKind → sugiere el cognitiveKind (taxonomía de 8) de una
 *      memoria sin tipo; cae a la inferencia local (memory-types).
 *   3. detectDuplicates → agrupa memorias probablemente duplicadas por similitud
 *      de título (levenshtein) y solape de enlaces [[wiki]] (Jaccard). 100% local.
 *
 * Todo defensivo: nunca lanza; degrada a heurística local si la IA no responde.
 */

import { astrauraChat } from "@/ai/astraura/router";
import { levenshtein } from "@/lib/aurora/term-normalizer";
import { parseWikilinks } from "@/lib/okf";
import {
  COGNITIVE_KIND_IDS,
  cognitiveKindOf,
  inferMemoryType,
  type CognitiveKind,
} from "@/lib/brains/memory-types";

/* ------------------------------------------------------------------ */
/* 1 · Resumir a memoria                                               */
/* ------------------------------------------------------------------ */

export interface SummaryResult {
  ok: boolean;
  title: string;
  content: string;
  usedAi: boolean;
  error?: string;
}

/** Extrae el primer encabezado H1 de un markdown como título (o vacío). */
function firstHeading(md: string): string {
  const m = (md || "").match(/^\s*#\s+(.+)$/m);
  return m ? m[1].trim() : "";
}

/**
 * Resume un texto (chat, archivo, notas) a una memoria del cerebro. Devuelve un
 * `title` y un `content` markdown. Si no hay IA disponible, hace un respaldo
 * local (recorte + título derivado) y marca `usedAi:false` con honestidad.
 */
export async function summarizeToMemory(
  text: string,
  opts?: { hintTitle?: string; language?: string },
): Promise<SummaryResult> {
  const src = (text || "").trim();
  if (!src) return { ok: false, title: "", content: "", usedAi: false, error: "No hay texto que resumir." };

  const prompt =
    "Resume el siguiente contenido como una MEMORIA de largo plazo para un cerebro personal. " +
    "Devuelve markdown en español que empiece con un encabezado `# ` de 3-8 palabras (el título) " +
    "y siga con viñetas concisas de los HECHOS, DECISIONES y PREFERENCIAS clave. No inventes nada. " +
    (opts?.hintTitle ? `Sugerencia de título: ${opts.hintTitle}.\n\n` : "\n\n") +
    "=== CONTENIDO ===\n" +
    src.slice(0, 12000);

  try {
    const res = await astrauraChat({
      taskHint: "summary",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });
    const md = (res?.text || "").trim();
    if (md) {
      const title = firstHeading(md) || opts?.hintTitle || "Resumen";
      return { ok: true, title, content: md, usedAi: true };
    }
  } catch {
    /* cae al respaldo local */
  }

  // Respaldo local: sin IA no fingimos un resumen — recortamos y avisamos.
  const title = opts?.hintTitle || firstHeading(src) || src.split(/\s+/).slice(0, 6).join(" ");
  const body = `# ${title}\n\n> Resumen local (sin IA disponible): primeras líneas del contenido.\n\n${src.slice(0, 1200)}`;
  return { ok: true, title, content: body, usedAi: false };
}

/* ------------------------------------------------------------------ */
/* 2 · Clasificar cognitiveKind                                        */
/* ------------------------------------------------------------------ */

export interface ClassifyResult {
  kind: CognitiveKind;
  usedAi: boolean;
}

/**
 * Sugiere el cognitiveKind de una memoria. Intenta la IA (elige uno de los 8
 * ids); si falla o responde algo inválido, cae a la inferencia LOCAL por tipo
 * (memory-types). Nunca lanza.
 */
export async function classifyCognitiveKind(
  name: string,
  content: string,
  hintKinds?: string[],
): Promise<ClassifyResult> {
  const localFallback = (): CognitiveKind => {
    if (hintKinds && hintKinds.length) return cognitiveKindOf(hintKinds[0]);
    const t = inferMemoryType(name || "", null);
    return cognitiveKindOf(t.id);
  };

  const list = COGNITIVE_KIND_IDS.join(", ");
  const prompt =
    `Clasifica esta memoria en UNA sola categoría cognitiva. Responde SOLO con una palabra de esta lista: ${list}.\n\n` +
    `Título: ${name || "(sin título)"}\n` +
    `Contenido:\n${(content || "").slice(0, 2000)}`;

  try {
    const res = await astrauraChat({
      taskHint: "chat",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      maxTokens: 12,
    });
    const raw = (res?.text || "").toLowerCase();
    const hit = COGNITIVE_KIND_IDS.find((k) => raw.includes(k));
    if (hit) return { kind: hit, usedAi: true };
  } catch {
    /* cae al respaldo local */
  }
  return { kind: localFallback(), usedAi: false };
}

/* ------------------------------------------------------------------ */
/* 3 · Detectar duplicados (100% local)                                */
/* ------------------------------------------------------------------ */

export interface DupItem {
  id: string;
  title: string;
  content?: string | null;
}

export interface DuplicateCluster {
  /** Ids de las memorias del grupo (>= 2). */
  ids: string[];
  /** Títulos (para mostrar). */
  titles: string[];
  /** Motivo dominante detectado. */
  reason: "titulo" | "enlaces" | "titulo+enlaces";
  /** Puntuación 0..1 (máxima del grupo). */
  score: number;
}

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\.md$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Similitud de título 0..1 (1 = idénticos) por distancia de edición normalizada. */
export function titleSimilarity(a: string, b: string): number {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const d = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return maxLen === 0 ? 0 : 1 - d / maxLen;
}

/** Jaccard 0..1 del solape de enlaces [[wiki]] de dos contenidos. */
function wikilinkJaccard(a: string, b: string): number {
  const la = new Set(parseWikilinks(a || "").map((x) => x.toLowerCase()));
  const lb = new Set(parseWikilinks(b || "").map((x) => x.toLowerCase()));
  if (la.size === 0 || lb.size === 0) return 0;
  let inter = 0;
  for (const x of la) if (lb.has(x)) inter++;
  const union = la.size + lb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Agrupa memorias probablemente duplicadas. Une por transitividad: si A~B y B~C,
 * quedan en el mismo grupo. Umbrales conservadores para no marcar falsos
 * positivos. Devuelve solo los grupos de tamaño >= 2, ordenados por score.
 */
export function detectDuplicates(
  items: DupItem[],
  opts?: { titleThreshold?: number; linkThreshold?: number },
): DuplicateCluster[] {
  const titleTh = opts?.titleThreshold ?? 0.82;
  const linkTh = opts?.linkThreshold ?? 0.5;
  const n = items.length;
  if (n < 2) return [];

  // Union-Find.
  const parent = items.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  const pairScore = new Map<string, { score: number; reason: DuplicateCluster["reason"] }>();
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const ts = titleSimilarity(items[i].title, items[j].title);
      const ls = wikilinkJaccard(items[i].content ?? "", items[j].content ?? "");
      let matched = false;
      let reason: DuplicateCluster["reason"] = "titulo";
      let score = 0;
      if (ts >= titleTh && ls >= linkTh) {
        matched = true;
        reason = "titulo+enlaces";
        score = Math.max(ts, ls);
      } else if (ts >= titleTh) {
        matched = true;
        reason = "titulo";
        score = ts;
      } else if (ls >= linkTh && ts >= 0.55) {
        matched = true;
        reason = "enlaces";
        score = ls;
      }
      if (matched) {
        union(i, j);
        pairScore.set(`${i}:${j}`, { score, reason });
      }
    }
  }

  // Reúne los grupos.
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const arr = groups.get(r) ?? [];
    arr.push(i);
    groups.set(r, arr);
  }

  const clusters: DuplicateCluster[] = [];
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue;
    let best = 0;
    const reasons = new Set<DuplicateCluster["reason"]>();
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const key = `${Math.min(idxs[a], idxs[b])}:${Math.max(idxs[a], idxs[b])}`;
        const ps = pairScore.get(key);
        if (ps) {
          best = Math.max(best, ps.score);
          reasons.add(ps.reason);
        }
      }
    }
    const reason: DuplicateCluster["reason"] = reasons.has("titulo+enlaces")
      ? "titulo+enlaces"
      : reasons.has("enlaces")
        ? "enlaces"
        : "titulo";
    clusters.push({
      ids: idxs.map((i) => items[i].id),
      titles: idxs.map((i) => items[i].title),
      reason,
      score: Number(best.toFixed(2)),
    });
  }
  return clusters.sort((a, b) => b.score - a.score);
}
