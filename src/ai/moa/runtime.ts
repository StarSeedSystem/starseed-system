/**
 * Mixture-of-Agents (MoA) runtime — OPT-IN orchestration layer on top of the
 * existing single-provider `chat()` path.
 *
 * ⚠️ SAFETY CONTRACT (read before touching):
 *   - This module NEVER throws to its callers. Every step is wrapped in
 *     try/catch and ALWAYS degrades to the existing single-provider answer
 *     (the very same `chat()` the rest of the app already uses).
 *   - It only does anything "extra" when an active MoA mode is != 'single'
 *     AND there are >= 2 usable providers. Otherwise it is a verbatim
 *     pass-through to `chat()`, so current single-provider users are
 *     completely unaffected.
 *   - "Usable provider" is determined by REUSING exactly the mechanism
 *     `chat.ts` already relies on (loadConfigs + enabled + key availability),
 *     so we never invent a second source of truth.
 *
 * Return shape is the same `ChatResponse` that `chat()` returns, so callers
 * (Aurora engine, brains, governance, etc.) need no changes.
 */

"use client";

import { chat, type ChatRequest, type ChatProviderOverride } from "../client/chat";
import { getProvider, type ChatMessage, type ChatResponse, type ProviderId } from "../providers";
import { loadConfigs, getActiveProviderId } from "../client/providerStore";

// ── MoA configuration shapes (kept structurally identical to the settings panel
//    at src/components/settings/ai/mixture-of-agents-panel.tsx so we read the
//    same localStorage payloads without importing the React component). ────────

export type MoaMode = "single" | "router" | "moa" | "crew";

export interface MoaConfig {
  mode: MoaMode;
  autoSelect: boolean;
  engineId: string | null;
  layers: number;
}

/** Per-brain override payload at `starseed.brain.<id>.moa`. */
interface BrainMoaOverride {
  useGlobal?: boolean;
  mode?: MoaMode;
  autoSelect?: boolean;
  engineId?: string | null;
}

const GLOBAL_MOA_KEY = "starseed.moa.config.v1";
const DEFAULT_MOA_CFG: MoaConfig = {
  mode: "single", // Conservative default: behave EXACTLY like today unless told otherwise.
  autoSelect: true,
  engineId: null,
  layers: 2,
};

/** Options accepted by runMoA — a thin superset of what chat() needs. */
export interface RunMoaOptions {
  /** When set, look for a per-brain MoA override before the global config. */
  brainId?: string;
  /** Model override forwarded to the single-provider path / proposers. */
  model?: string;
  maxTokens?: number;
  /** Sampling temperature forwarded verbatim to chat(). */
  temperature?: number;
  /** Passphrase to decrypt provider keys (forwarded verbatim to chat()). */
  passphrase?: string;
  /** AbortSignal forwarded to every underlying chat() call. */
  signal?: AbortSignal;
  /** Streaming callback — only wired to the FINAL answer to keep UX identical. */
  onChunk?: (delta: string) => void;
  /** Optional progress breadcrumbs for debugging/telemetry (never user-facing). */
  onProgress?: (stage: string, detail?: string) => void;
  /**
   * OPTIONAL ad-hoc provider+endpoint+key. When present AND the effective mode
   * is 'single' (or no MoA is applicable), we route the single-provider answer
   * through this exact provider via chat()'s own override path. This is how a
   * per-chat session pins a specific provider (custom Ollama / custom API).
   */
  providerOverride?: ChatProviderOverride;
  /**
   * OPTIONAL explicit mode that takes precedence over the resolved config for
   * THIS call only. Absent → resolve from brain/global config as before.
   */
  moaModeOverride?: MoaMode;
  /**
   * OPTIONAL explicit memory-root ids to inject as context, independent of any
   * brain. Reuses the same compact injection as brains' linked memory.
   */
  memoryRootIds?: string[];
}

// ── Config resolution ────────────────────────────────────────────────────────

/** Read & parse the GLOBAL MoA config. Any failure → safe 'single' default. */
function loadGlobalMoa(): MoaConfig {
  if (typeof window === "undefined") return DEFAULT_MOA_CFG;
  try {
    const raw = window.localStorage.getItem(GLOBAL_MOA_KEY);
    if (!raw) return DEFAULT_MOA_CFG;
    const parsed = JSON.parse(raw) as Partial<MoaConfig>;
    return { ...DEFAULT_MOA_CFG, ...parsed } as MoaConfig;
  } catch {
    return DEFAULT_MOA_CFG;
  }
}

/** Read a per-brain override, if present and valid. */
function loadBrainOverride(brainId: string): BrainMoaOverride | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`starseed.brain.${brainId}.moa`);
    if (!raw) return null;
    return JSON.parse(raw) as BrainMoaOverride;
  } catch {
    return null;
  }
}

/**
 * Resolve the effective MoaConfig:
 *   - per-brain override when brainId set AND override.useGlobal === false
 *   - else the global config
 *   - else the conservative 'single' default
 * Always returns a fully-populated config; never throws.
 */
export function resolveMoaConfig(brainId?: string): MoaConfig {
  try {
    const global = loadGlobalMoa();
    if (brainId) {
      const ov = loadBrainOverride(brainId);
      if (ov && ov.useGlobal === false) {
        return {
          mode: ov.mode ?? global.mode,
          autoSelect: ov.autoSelect ?? global.autoSelect,
          engineId: ov.engineId ?? global.engineId,
          // layers are global-only in the override shape; inherit global.
          layers: global.layers,
        };
      }
    }
    return global;
  } catch {
    return DEFAULT_MOA_CFG;
  }
}

// ── Memory context injection (account-DISCONNECTED local preview) ─────────────
//
// PURELY LOCAL. When runMoA is called WITH a brainId, we may prepend a tiny
// "memory context" system message summarizing the memory roots the user linked
// to that brain, so every provider call below sees it. This reads ONLY from
// localStorage (the same preview keys the memory-sync UI writes) and NEVER
// contacts any account/network. If anything is missing, empty, or fails, we
// inject NOTHING and the message array is returned UNCHANGED — so brains with
// no linked memory behave byte-for-byte as before.

/** Max length of the injected memory-context system message (hard cap). */
const MEMORY_CONTEXT_MAX_CHARS = 1500;

/** localStorage key holding the array of connected memory roots (preview). */
const MEMORY_ROOTS_KEY = "starseed.memory.roots.v1";

/** Per-brain key holding the linked root ids (a JSON string[]). */
function brainMemoryRootsKey(brainId: string): string {
  return `starseed.brain.${brainId}.memoryRoots`;
}

/** Per-brain key holding the channels selection (optional, JSON object). */
function brainChannelsKey(brainId: string): string {
  return `starseed.brain.${brainId}.channels`;
}

/** A linked memory root, read defensively from localStorage (subset we use). */
interface LinkedRoot {
  id?: string;
  name?: string;
  branches?: Array<{ rama?: string; tipo?: string; scope?: string; archivo?: string }>;
}

/** Read+parse a JSON localStorage value; null on any miss/error. */
function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Summarize a root's branches as a short, de-duplicated list of tipos/ramas. */
function summarizeBranches(root: LinkedRoot): string {
  try {
    const branches = Array.isArray(root.branches) ? root.branches : [];
    const labels: string[] = [];
    const seen = new Set<string>();
    for (const b of branches) {
      const label = String(b?.tipo || b?.rama || "").trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      labels.push(label);
    }
    return labels.join(", ");
  } catch {
    return "";
  }
}

/**
 * Build the compact memory-context system message for a brain (or for an
 * explicit list of memory-root ids), or null.
 *
 * Returns null (→ inject nothing) when: no brainId AND no explicit ids, the
 * keys are absent/empty, no roots are linked, or any error occurs. NEVER
 * throws. NEVER hits network.
 */
function buildMemoryContextMessage(brainId?: string, explicitIds?: string[]): ChatMessage | null {
  try {
    if (typeof window === "undefined") return null;

    // 1) Which root ids? Explicit ids (per-chat) take precedence; otherwise the
    //    brain's linked ids (JSON string[]).
    let linkedIds: unknown =
      Array.isArray(explicitIds) && explicitIds.length > 0
        ? explicitIds
        : brainId
          ? readJson<unknown>(brainMemoryRootsKey(brainId))
          : null;
    if (!Array.isArray(linkedIds) || linkedIds.length === 0) return null;
    const idSet = new Set(linkedIds.filter((x): x is string => typeof x === "string"));
    if (idSet.size === 0) return null;

    // 2) The connected roots payload (JSON array of roots).
    const allRoots = readJson<unknown>(MEMORY_ROOTS_KEY);
    if (!Array.isArray(allRoots) || allRoots.length === 0) return null;

    // 3) Keep only the linked roots, in the order they appear in the store.
    const linkedRoots: LinkedRoot[] = [];
    for (const r of allRoots) {
      if (!r || typeof r !== "object") continue;
      const root = r as LinkedRoot;
      if (typeof root.id === "string" && idSet.has(root.id)) linkedRoots.push(root);
    }
    if (linkedRoots.length === 0) return null;

    // 4) Build the lines: "- <name>: ramas <a, b, c>".
    const lines: string[] = [];
    for (const root of linkedRoots) {
      const name = String(root.name || root.id || "").trim();
      if (!name) continue;
      const branchSummary = summarizeBranches(root);
      lines.push(branchSummary ? `- ${name}: ramas ${branchSummary}` : `- ${name}`);
    }
    if (lines.length === 0) return null;

    let content = "Contexto de memorias del cerebro:\n" + lines.join("\n");

    // 5) Optional one-line note about active channels (purely informational).
    //    Only meaningful for a brain; skipped for the per-chat explicit path.
    try {
      const channels = brainId
        ? readJson<{ useGlobal?: boolean; channelIds?: unknown }>(brainChannelsKey(brainId))
        : null;
      if (channels) {
        const ids = Array.isArray(channels.channelIds)
          ? channels.channelIds.filter((x): x is string => typeof x === "string")
          : [];
        if (channels.useGlobal) {
          content += `\nCanales activos: globales${ids.length ? ` + ${ids.length}` : ""}.`;
        } else if (ids.length > 0) {
          content += `\nCanales activos: ${ids.length}.`;
        }
      }
    } catch {
      /* channels are optional — ignore any failure */
    }

    // 6) Hard length cap (keep the head, mark truncation succinctly).
    if (content.length > MEMORY_CONTEXT_MAX_CHARS) {
      content = content.slice(0, MEMORY_CONTEXT_MAX_CHARS - 1).trimEnd() + "…";
    }

    return { role: "system", content };
  } catch {
    return null; // ANY failure → inject nothing.
  }
}

/**
 * Return `messages` with the memory-context system message PREPENDED when a
 * brain has linked memory, otherwise return the SAME array reference unchanged.
 * This keeps the no-memory / no-brain path byte-for-byte identical to before.
 */
function withMemoryContext(messages: ChatMessage[], opts: RunMoaOptions): ChatMessage[] {
  try {
    const memMsg = buildMemoryContextMessage(opts.brainId, opts.memoryRootIds);
    if (!memMsg) return messages; // unchanged: zero behaviour change.
    return [memMsg, ...messages];
  } catch {
    return messages;
  }
}

// ── Usable-provider detection (single source of truth = what chat.ts uses) ────

/** A provider config we have verified is usable as-is by chat(). */
interface UsableProvider {
  id: ProviderId;
  /** The model chat() would use for this provider by default. */
  defaultModel: string;
}

/**
 * Determine the providers that are usable RIGHT NOW, applying the same rules
 * chat() applies: the config must be enabled, and either the provider does not
 * require a key (local / starseed) or the user has stored an encrypted key.
 * We do NOT decrypt here (chat() does that per call) — we only gate on whether
 * a key exists, which is exactly the precondition chat() needs to succeed.
 */
export function getUsableProviders(): UsableProvider[] {
  try {
    const configs = loadConfigs();
    const usable: UsableProvider[] = [];
    for (const c of configs) {
      if (!c?.enabled) continue;
      let requiresKey = true;
      try {
        requiresKey = getProvider(c.id).info.requiresKey;
      } catch {
        // Unknown provider id → treat as unusable, skip it.
        continue;
      }
      const hasKey = Boolean(c.encryptedKey && c.encryptedKey.length > 0);
      if (requiresKey && !hasKey) continue; // would fail in chat() — exclude.
      usable.push({ id: c.id, defaultModel: c.defaultModel });
    }
    return usable;
  } catch {
    return [];
  }
}

/** Order usable providers so the user's active provider is first (primary). */
function orderByActiveFirst(list: UsableProvider[]): UsableProvider[] {
  try {
    const activeId = getActiveProviderId();
    if (!activeId) return list;
    const idx = list.findIndex((p) => p.id === activeId);
    if (idx <= 0) return list;
    const copy = list.slice();
    const [active] = copy.splice(idx, 1);
    copy.unshift(active);
    return copy;
  } catch {
    return list;
  }
}

// ── Primitive: answer with ONE specific provider via the existing chat() ──────

/**
 * Ask a single provider for a completion by delegating to the EXISTING chat()
 * entry point. This is the only way MoA ever reaches a model — we never talk to
 * provider adapters directly, so key decryption / base URLs / streaming all
 * behave identically to production.
 *
 * @param stream when true, forwards onChunk so the caller sees live tokens.
 */
async function askProvider(
  messages: ChatMessage[],
  providerId: ProviderId | undefined,
  opts: RunMoaOptions,
  model?: string,
  stream = false
): Promise<ChatResponse> {
  // When the caller pinned an ad-hoc provider override AND this call is for the
  // "default" provider (no explicit providerId chosen by MoA internals), route
  // through chat()'s override path. Explicit MoA picks (providerId set) still
  // resolve from stored configs so multi-provider modes behave as designed.
  const useOverride = !!opts.providerOverride && providerId === undefined;
  const req: ChatRequest = {
    messages,
    providerId, // undefined → chat() uses the active provider (same as today).
    model: model ?? opts.model,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    passphrase: opts.passphrase,
    signal: opts.signal,
    onChunk: stream ? opts.onChunk : undefined,
    providerOverride: useOverride ? opts.providerOverride : undefined,
  };
  return chat(req);
}

/**
 * The guaranteed fallback: the EXACT single-provider behaviour the app has
 * today. Used both as the default mode and as the catch-all on ANY error.
 * Streams to opts.onChunk so the user experience is unchanged.
 */
function singleProviderAnswer(messages: ChatMessage[], opts: RunMoaOptions): Promise<ChatResponse> {
  // providerId left undefined on purpose → chat() resolves the active provider
  // precisely as it does for every existing call site.
  return askProvider(messages, undefined, opts, opts.model, true);
}

/** Extract trimmed text from a ChatResponse defensively. */
function textOf(res: ChatResponse | null | undefined): string {
  return (res?.text || "").trim();
}

/** First user message content (for routing heuristics). */
function lastUserContent(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return messages[i].content || "";
  }
  return "";
}

// ── Mode: ROUTER ─────────────────────────────────────────────────────────────

/**
 * Pick the best provider for THIS request, then answer with it.
 *
 * Strategy: a tiny, cheap classification call asks the PRIMARY provider to
 * choose an index among the usable providers. If that classification fails or
 * returns something unparseable, we fall back to a simple length heuristic
 * (longer / code-ish prompts → a non-primary provider if available, else the
 * primary). Either way we then answer with the chosen provider, and if that
 * answer fails we fall back to the primary provider.
 */
async function runRouter(
  messages: ChatMessage[],
  usable: UsableProvider[],
  opts: RunMoaOptions
): Promise<ChatResponse> {
  const primary = usable[0];
  let chosen = primary;

  // 1) Try a short classification call (non-streaming, tiny token budget).
  try {
    opts.onProgress?.("router:classify");
    const menu = usable.map((p, i) => `${i}: ${p.id} (${p.defaultModel})`).join("\n");
    const classifyMessages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are a routing classifier. Given a user request and a numbered list of " +
          "available AI providers, reply with ONLY the single integer index of the provider " +
          "best suited to answer. No words, just the number.",
      },
      {
        role: "user",
        content: `Providers:\n${menu}\n\nRequest:\n${lastUserContent(messages).slice(0, 2000)}\n\nBest index:`,
      },
    ];
    const res = await askProvider(classifyMessages, primary.id, opts, primary.defaultModel, false);
    const m = textOf(res).match(/\d+/);
    if (m) {
      const idx = Number(m[0]);
      if (Number.isInteger(idx) && idx >= 0 && idx < usable.length) chosen = usable[idx];
    }
  } catch {
    // 2) Heuristic fallback: heavier prompts → second provider if we have one.
    try {
      const len = lastUserContent(messages).length;
      const codey = /```|function |class |select |import |def |const /i.test(lastUserContent(messages));
      if ((len > 600 || codey) && usable.length > 1) chosen = usable[1];
    } catch {
      chosen = primary;
    }
  }

  // 3) Answer with the chosen provider; on failure, retry with the primary.
  try {
    opts.onProgress?.("router:answer", chosen.id);
    return await askProvider(messages, chosen.id, opts, chosen.defaultModel, true);
  } catch {
    opts.onProgress?.("router:fallback-primary", primary.id);
    return askProvider(messages, primary.id, opts, primary.defaultModel, true);
  }
}

// ── Mode: MOA (classic Mixture-of-Agents) ────────────────────────────────────

/**
 * Classic MoA: over `layers` rounds (hard-capped at 2), up to 3 proposer
 * providers draft answers in parallel, then an aggregator provider synthesizes
 * a single final answer from the proposals. Between layers, proposals are fed
 * back so proposers can refine. The FINAL aggregation streams to onChunk.
 *
 * Robustness: failed proposers are simply dropped. If we end up with zero
 * proposals, or aggregation fails, we fall back to the single-provider answer.
 */
async function runMoaClassic(
  messages: ChatMessage[],
  usable: UsableProvider[],
  cfg: MoaConfig,
  opts: RunMoaOptions
): Promise<ChatResponse> {
  // Proposers draft answers; an aggregator synthesizes them. When we have >= 3
  // usable providers, dedicate the LAST one as a distinct aggregator (so it is
  // not also a proposer) for a cleaner mixture. With exactly 2 providers, both
  // propose and the stronger/primary (usable[0]) aggregates — still a real MoA.
  const distinctAggregator = usable.length >= 3;
  const proposers = distinctAggregator ? usable.slice(0, Math.min(3, usable.length - 1)) : usable.slice(0, 2);
  const aggregator = distinctAggregator ? usable[usable.length - 1] : usable[0];
  const rounds = Math.max(1, Math.min(2, Number(cfg.layers) || 1)); // cap <= 2

  opts.onProgress?.("moa:start", `${proposers.length} proponentes → 1 agregador (${aggregator.id})`);

  const originalUser = lastUserContent(messages);
  let proposals: string[] = [];

  for (let round = 0; round < rounds; round++) {
    opts.onProgress?.("moa:layer", String(round + 1));
    // Build the proposer prompt: include prior proposals from the last round.
    const aggregateContext =
      proposals.length > 0
        ? "\n\nPrevious draft answers from other agents (use them to improve, do not just copy):\n" +
          proposals.map((p, i) => `[Agent ${i + 1}]: ${p}`).join("\n\n")
        : "";

    const roundResults = await Promise.allSettled(
      proposers.map((p) => {
        const proposerMessages: ChatMessage[] = [
          ...messages,
          ...(aggregateContext
            ? [{ role: "system" as const, content: aggregateContext }]
            : []),
        ];
        return askProvider(proposerMessages, p.id, opts, p.defaultModel, false);
      })
    );

    const next: string[] = [];
    for (const r of roundResults) {
      if (r.status === "fulfilled") {
        const t = textOf(r.value);
        if (t) next.push(t);
      }
    }
    opts.onProgress?.("moa:proposals", `${next.length}/${proposers.length} ok (capa ${round + 1})`);
    if (next.length > 0) proposals = next; // keep last successful round only
  }

  // No proposal survived → degrade gracefully.
  if (proposals.length === 0) {
    opts.onProgress?.("moa:no-proposals-fallback");
    return singleProviderAnswer(messages, opts);
  }

  // Exactly one proposal → no synthesis needed. Stream it back verbatim so the
  // UX (onChunk) is preserved without paying for an extra aggregator round.
  if (proposals.length === 1) {
    opts.onProgress?.("moa:single-proposal", aggregator.id);
    try {
      opts.onChunk?.(proposals[0]);
    } catch {
      /* streaming is best-effort */
    }
    return { text: proposals[0] };
  }

  // Aggregation step — synthesize the final answer, streaming to the user.
  try {
    opts.onProgress?.("moa:aggregate", aggregator.id);
    const aggMessages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are an aggregator. You are given a user request and several candidate " +
          "answers from different AI models. Synthesize the single best, correct, and " +
          "complete answer. Resolve contradictions, keep the strongest reasoning, and " +
          "respond directly to the user in their language. Do not mention that multiple " +
          "drafts existed.",
      },
      {
        role: "user",
        content:
          `User request:\n${originalUser}\n\nCandidate answers:\n` +
          proposals.map((p, i) => `--- Candidate ${i + 1} ---\n${p}`).join("\n\n") +
          "\n\nFinal answer:",
      },
    ];
    return await askProvider(aggMessages, aggregator.id, opts, aggregator.defaultModel, true);
  } catch {
    // Aggregator failed → return the best single proposal as plain text, or
    // ultimately the single-provider answer.
    opts.onProgress?.("moa:aggregate-failed");
    if (proposals[0]) return { text: proposals[0] };
    return singleProviderAnswer(messages, opts);
  }
}

// ── Mode: CREW (sequential planner → solver → reviewer) ──────────────────────

/**
 * A simple sequential pipeline over available providers:
 *   1) planner  — outlines an approach for the request
 *   2) solver   — produces the answer following the plan
 *   3) reviewer — polishes / corrects the solver's answer (final, streamed)
 * Providers are assigned round-robin from the usable list. Any failing stage is
 * skipped (its input is passed through), and total failure → single-provider.
 */
async function runCrew(
  messages: ChatMessage[],
  usable: UsableProvider[],
  opts: RunMoaOptions
): Promise<ChatResponse> {
  const pick = (i: number) => usable[i % usable.length];
  const planner = pick(0);
  const solver = pick(1);
  const reviewer = pick(2);
  const userText = lastUserContent(messages);

  // 1) Planner (best-effort; empty plan is fine).
  let plan = "";
  try {
    opts.onProgress?.("crew:plan", planner.id);
    const planRes = await askProvider(
      [
        { role: "system", content: "You are a planner. Produce a short, concrete step-by-step plan to fulfill the user's request. Be terse." },
        { role: "user", content: userText.slice(0, 4000) },
      ],
      planner.id,
      opts,
      planner.defaultModel,
      false
    );
    plan = textOf(planRes);
  } catch {
    plan = "";
  }

  // 2) Solver — answer using the plan (falls back to raw messages if no plan).
  let solution = "";
  try {
    opts.onProgress?.("crew:solve", solver.id);
    const solverMessages: ChatMessage[] = plan
      ? [...messages, { role: "system", content: `Follow this plan when answering:\n${plan}` }]
      : messages;
    const solveRes = await askProvider(solverMessages, solver.id, opts, solver.defaultModel, false);
    solution = textOf(solveRes);
  } catch {
    solution = "";
  }

  // If the solver produced nothing, degrade to the single-provider answer.
  if (!solution) {
    opts.onProgress?.("crew:solver-empty-fallback");
    return singleProviderAnswer(messages, opts);
  }

  // 3) Reviewer — final polish, streamed to the user. On failure, return solver's text.
  try {
    opts.onProgress?.("crew:review", reviewer.id);
    return await askProvider(
      [
        { role: "system", content: "You are a reviewer. Improve the draft answer for correctness, clarity and completeness. Reply with ONLY the final improved answer, in the user's language." },
        { role: "user", content: `User request:\n${userText}\n\nDraft answer:\n${solution}\n\nFinal answer:` },
      ],
      reviewer.id,
      opts,
      reviewer.defaultModel,
      true
    );
  } catch {
    return { text: solution };
  }
}

// ── Public entry point ───────────────────────────────────────────────────────

/**
 * runMoA — opt-in multi-agent orchestration.
 *
 * GUARANTEE: this function never throws and never changes behaviour for users
 * with < 2 usable providers or mode 'single' — in those cases it is a verbatim
 * pass-through to the existing single-provider chat() path.
 */
export async function runMoA(messages: ChatMessage[], opts: RunMoaOptions = {}): Promise<ChatResponse> {
  // Everything below is defensive: ANY failure path returns the single-provider
  // answer, which itself is the unmodified production code path.
  try {
    // Prepend the brain's linked-memory context ONCE, here at the top, so it
    // flows into EVERY path below (single, router, moa, crew) and their
    // fallbacks. When the brain has no linked memory (or no brainId), this is
    // the SAME array reference — guaranteeing zero behaviour change.
    messages = withMemoryContext(messages, opts);

    const cfg = resolveMoaConfig(opts.brainId);

    // A per-call explicit mode (e.g. a per-chat selector) wins over the resolved
    // brain/global config for THIS request only. Absent → use the resolved cfg.
    const effectiveMode: MoaMode = opts.moaModeOverride ?? (cfg ? cfg.mode : "single");

    // Fast path: mode 'single' → no behaviour change whatsoever. If the caller
    // pinned a providerOverride, singleProviderAnswer routes through it.
    if (effectiveMode === "single") {
      return await singleProviderAnswer(messages, opts);
    }

    // Need >= 2 usable providers to do anything multi-agent; else behave single.
    const usable = orderByActiveFirst(getUsableProviders());
    if (usable.length < 2) {
      opts.onProgress?.("single-fallback", `modo ${effectiveMode}, ${usable.length} proveedor(es) usable(s)`);
      return await singleProviderAnswer(messages, opts);
    }

    opts.onProgress?.("mode", `${effectiveMode} · ${usable.length} proveedores`);

    switch (effectiveMode) {
      case "router":
        return await runRouter(messages, usable, opts);
      case "moa":
        return await runMoaClassic(messages, usable, cfg, opts);
      case "crew":
        return await runCrew(messages, usable, opts);
      default:
        return await singleProviderAnswer(messages, opts);
    }
  } catch {
    // Absolute last-resort guard. Try the single-provider path; if even that
    // throws (e.g. no provider configured), surface that error exactly as
    // chat() would have, so the existing UI error handling is unchanged.
    return singleProviderAnswer(messages, opts);
  }
}
