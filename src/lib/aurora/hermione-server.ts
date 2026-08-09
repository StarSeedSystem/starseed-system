// ═══════════════════════════════════════════════════════════════════════════
// HERMIONE SERVER LOGIC — módulo SIN "use client" (usable desde API routes).
// ---------------------------------------------------------------------------
// Contiene la lógica pesada que las rutas /api/neurons/hermione/* necesitan en
// el servidor: selección del mejor modelo :free y enumeración/sync de chats de
// Hermione. NO importa módulos client (free-catalog/skills/router son client).
import { createClient as createSbClient } from "@supabase/supabase-js";
import { listOpenRouterFreeModels } from "@/ai/providers/openrouter";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const HERMIONE_PERSONALITY_ID = "c9fe7030-fc68-49c6-a705-58f7900887f9";

// Carga las variables de servidor desde .env.local (el runtime de Next no siempre
// inyecta SUPABASE_SERVICE_ROLE_KEY al server). Server-only (usa fs).
function loadServerEnv() {
  const out: Record<string, string> = {};
  try {
    const p = resolve(process.cwd(), ".env.local");
    const raw = readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* no .env.local */ }
  return out;
}
const SERVER_ENV = loadServerEnv();

// Cliente con service role para ESCRITURAS server-side (bypass RLS). Usa
// @supabase/supabase-js directo (no el wrapper singleton del cliente, que
// ignora url/key) para garantizar un client fresco con service role.
function serverWriteClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || SERVER_ENV.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || SERVER_ENV.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return createSbClient(url, key, { auth: { persistSession: false } });
  // Fallback: client público del OS (bajo RLS) — solo si no hay service role.
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || SERVER_ENV.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || SERVER_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  );
}

export type HermioneModelTask = "chat" | "code" | "reasoning" | "vision" | "fast" | "long";

// ── Scoring puro (replica la lógica de free-catalog.scoreModelForTask) ──────

export interface HermioneModelChoice {
  id: string;
  source: string;
  label: string;
  free: boolean;
}

// ── Scoring puro (replica la lógica de free-catalog.scoreModelForTask) ──────
interface CatalogModel {
  id: string;
  label?: string;
  strengths?: string[];
  quality?: number;
  context?: number;
  vision?: boolean;
}
interface CatalogSource {
  id: string;
  preferFreeModels?: boolean;
  weight?: number;
}

function isFreeModelId(modelId: string): boolean {
  const id = String(modelId ?? "");
  return id.endsWith(":free") || id === "openrouter/free";
}

function scoreModelForTask(source: CatalogSource, model: CatalogModel, task: string, needsVision: boolean): number {
  if (needsVision && !model.vision) return -1;
  let score = model.quality ?? 5;
  if (model.strengths?.includes(task)) score += 3;
  if (task === "long" && (model.context ?? 0) >= 200000) score += 2;
  if (task === "fast" && source.id.startsWith("groq")) score += 2;
  if (source.preferFreeModels) {
    if (isFreeModelId(model.id)) score += 4;
    else score -= 5;
  }
  return score * (source.weight ?? 1);
}

// ── Lectura de overrides (cuenta + pin de Hermione) desde Supabase ──────────
async function getAccountIntelligence(): Promise<any | null> {
  try {
    const sb = serverWriteClient();
    const { data } = await sb.from("user_settings").select("intelligence").maybeSingle();
    return (data as any)?.intelligence ?? null;
  } catch { return null; }
}

async function getHermioneIntelligencePin(): Promise<any | null> {
  try {
    const sb = serverWriteClient();
    const { data } = await sb
      .from("aurora_personalities")
      .select("intelligence")
      .eq("id", HERMIONE_PERSONALITY_ID)
      .maybeSingle();
    return (data as any)?.intelligence ?? null;
  } catch { return null; }
}

/**
 * ── Adenda 149 · pendientes: pago = AND (la cuenta manda; la persona solo niega) ──
 *
 * Espejo SERVIDOR de `personalities.ts::personaAllowsPaid` para el pin de
 * Hermione leído de `aurora_personalities.intelligence`. Mismo CONTRATO: el
 * resultado es una restricción AND que solo puede NEGAR (`false` ⇒ esta
 * personalidad no gasta; `true`/`null` ⇒ manda la cuenta, jamás afloja).
 *
 * ÁMBITO del campo (idéntico al del cliente y al del router): `permitirPago`
 * SOLO cuenta en `modo: "fija"`. En `modo: "auto"` ese campo se materializa
 * SIEMPRE con default `false` (`defaultPersonalityIntelligence()`), así que
 * tratarlo como veto apagaría las fuentes de pago de toda cuenta sin overrides
 * (CRÍTICO cazado en la revisión adversarial de la tanda «3 olas»).
 *
 * DIFERENCIA CON EL CLIENTE (documentada a propósito): aquí NO existe el paso 1
 * de `personaAllowsPaid` — el override por neurona × personalidad de la ventana
 * «Sistemas de Astraura en esta neurona» vive en localStorage del dispositivo y
 * es inalcanzable desde el servidor. El servidor aplica solo el veto del PERFIL;
 * el veto por neurona lo aplica el camino cliente (`hermione-bridge.ts`).
 * Nunca lanza: cualquier forma rara ⇒ `null` (sin opinión).
 */
function personaPaidVerdictFromPin(pin: any): boolean | null {
  try {
    if (!pin || typeof pin !== "object") return null;
    if (pin.modo !== "fija") return null;
    return typeof pin.permitirPago === "boolean" ? pin.permitirPago : null;
  } catch {
    return null;
  }
}

/**
 * Elige el mejor modelo :free combinando OpenRouter :free vivos + fuentes sin
 * clave del OS + defaults de Astraura + IntelligenceSettings de la cuenta +
 * el pin de Hermione. Server-safe.
 */
export async function selectBestFreeModelForHermione(
  task: HermioneModelTask = "chat",
  needsVision = false,
): Promise<HermioneModelChoice | null> {
  try {
    const freeOrIds = await listOpenRouterFreeModels();
    const openrouterSource: CatalogSource = { id: "openrouter-free", preferFreeModels: true, weight: 1.2 };
    const openrouterModels: CatalogModel[] = (freeOrIds.length ? freeOrIds : ["openrouter/free"]).map((id) => ({
      id,
      label: id,
      strengths: ["chat", "code", "reasoning", "vision", "fast", "long"],
      quality: 7,
      vision: true,
    }));

    let best: { score: number; m: CatalogModel } | null = null;
    for (const m of openrouterModels) {
      const sc = scoreModelForTask(openrouterSource, m, task, needsVision);
      if (sc < 0) continue;
      if (!best || sc > best.score) best = { score: sc, m };
    }

    // Override por tarea de la CUENTA y del PIN de Hermione (gratis siempre).
    const account = await getAccountIntelligence();
    const pin = await getHermioneIntelligencePin();
    const overrideId =
      account?.perTask?.[task] ||
      pin?.porSentido?.[task]?.modelo ||
      pin?.global?.modelo;
    if (overrideId) {
      const isFree = isFreeModelId(overrideId) || overrideId === "openrouter/free";
      // ── Adenda 149 · pendientes: pago = AND (la cuenta manda; la persona solo niega) ──
      // Unificado con `router.ts::rankCandidates` (§9 del SOP). Antes era un OR
      // que AFLOJABA (un pin con `permitirPago: true` habilitaba gasto con la
      // cuenta apagada); ahora el permiso lo da la CUENTA y el pin solo puede
      // vetar. Ver `personaPaidVerdictFromPin` para el ámbito del campo.
      const allowPaid =
        account?.allowConfiguredPaid === true && personaPaidVerdictFromPin(pin) !== false;
      if (isFree || allowPaid) {
        return { id: overrideId, source: "override", label: overrideId, free: isFree };
      }
    }

    if (best) return { id: best.m.id, source: "openrouter-free", label: best.m.label ?? best.m.id, free: true };
    return null;
  } catch {
    return null;
  }
}

/**
 * Capacidades de Astraura que se instalan en cada Hermes/neurona. Server-safe:
 * describe el conjunto de capacidades del OS (sin importar skills.ts client).
 */
export interface HermioneCapabilities {
  skillsSystemPrompt: string;
  senses: string[];
  connections: string[];
  generatedAt: string;
}

export function gatherAuroraCapabilitiesForHermes(): HermioneCapabilities {
  const caps = [
    "Biblioteca StarSeed (habilidades de la Biblioteca como capacidades vivas)",
    "Sentidos (voz, visión, contexto del usuario)",
    "Conexiones y sincronización (Telegram, neuronas, cuentas)",
    "Memoria viva del OS y de la cuenta (sincronizada entre perfiles)",
    "Operación del sistema StarSeed OS (archivos, configuración, acciones)",
    "Razonamiento y código con modelos gratuitos (OpenRouter :free, Ollama local)",
  ];
  return {
    skillsSystemPrompt:
      "Capacidades activas de Aurora (Biblioteca StarSeed) — Hermione las tiene en cada Hermes:\n" +
      caps.map((c) => `• ${c}`).join("\n"),
    senses: ["voice", "vision", "user-context"],
    connections: ["telegram", "neurons", "accounts"],
    generatedAt: new Date().toISOString(),
  };
}

/** Instala capacidades en la neurona (capabilities.hermesCapabilities). */
export async function installCapabilitiesOnNeuron(neuronId: string, caps: HermioneCapabilities): Promise<boolean> {
  try {
    const sb = serverWriteClient();
    const { data } = await sb.from("neuron_devices").select("capabilities").eq("id", neuronId).maybeSingle();
    const cur = ((data?.capabilities as object) || {}) as Record<string, unknown>;
    cur.hermesCapabilities = caps;
    cur.hermesInstalled = true;
    const { error } = await sb.from("neuron_devices").update({ capabilities: cur }).eq("id", neuronId);
    return !error;
  } catch { return false; }
}

/**
 * Enumera las conversaciones de la cuenta donde se ha usado Hermione.
 * Fuente de verdad: astraura_messages con source='hermione-bridge' o
 * meta.hermione=true (distintos chat_id). Devuelve {convId, name}.
 */
export async function listHermioneConversations(): Promise<Array<{ convId: string; name: string }>> {
  try {
    const sb = serverWriteClient();
    // Distintos chat_id donde hubo mensajes de Hermione.
    const { data: msgs } = await sb
      .from("astraura_messages")
      .select("chat_id")
      .or("source.eq.hermione-bridge,meta->>hermione.eq.true")
      .limit(200);
    const ids = Array.from(new Set(((msgs as any[]) || []).map((m) => m.chat_id).filter(Boolean)));
    if (!ids.length) return [];

    // Nombres desde aurora_conversations (tolera columna title/name).
    const { data: convs } = await sb.from("aurora_conversations").select("id,title,name").in("id", ids);
    const byId = new Map<string, string>();
    for (const c of (convs as any[]) || []) {
      byId.set(c.id, c.title || c.name || c.id);
    }
    return ids.map((id) => ({ convId: id, name: byId.get(id) || id }));
  } catch {
    return [];
  }
}

/** Sincroniza capacidades a TODAS las neuronas con Hermes de la cuenta. */
export async function syncCapabilitiesToAllHermesNeurons(): Promise<number> {
  try {
    const caps = gatherAuroraCapabilitiesForHermes();
    const sb = serverWriteClient();
    const { data } = await sb.from("neuron_devices").select("id, capabilities").limit(50);
    const rows = (data as Array<{ id: string; capabilities?: any }>) || [];
    let updated = 0;
    for (const row of rows) {
      const c = row.capabilities || {};
      const bridge = c.bridge;
      const hasHermes =
        (bridge && bridge.mode === "external-hermes") ||
        c.hermesInstalled === true ||
        (Array.isArray(c.servesPersonalities) && c.servesPersonalities.includes("hermione"));
      if (!hasHermes) continue;
      if (await installCapabilitiesOnNeuron(row.id, caps)) updated++;
    }
    return updated;
  } catch { return 0; }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SINCRONIZACIÓN POR CHAT (Adenda 70 · requisito del usuario)
 * ---------------------------------------------------------------------------
 * Cada conversación de Aurora que usa Hermione = una CARPETA/CHAT con el MISMO
 * nombre en TODAS las neuronas con Hermes, en tiempo real. Cuando una neurona
 * recupera señal o se instala Hermes en otra, se hace BACKFILL de TODOS los
 * chats donde se usó Hermione en la cuenta, manteniendo todo sincronizado.
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface HermioneChatRef {
  convId: string;
  name: string;
}

/** Obtiene el mapa de chats Hermione ya registrados en una neurona. */
async function getNeuronHermesChats(neuronId: string): Promise<Record<string, string>> {
  try {
    const sb = serverWriteClient();
    const { data } = await sb.from("neuron_devices").select("capabilities").eq("id", neuronId).maybeSingle();
    const c = (data?.capabilities as any) || {};
    return (c.hermesChats as Record<string, string>) || {};
  } catch { return {}; }
}

/** Registra/actualiza un chat de Hermione en TODAS las neuronas con Hermes. */
export async function registerHermioneChatEverywhere(convId: string, name: string): Promise<number> {
  try {
    const sb = serverWriteClient();
    const { data } = await sb.from("neuron_devices").select("id, capabilities").limit(50);
    const rows = (data as Array<{ id: string; capabilities?: any }>) || [];
    let updated = 0;
    for (const row of rows) {
      const c = row.capabilities || {};
      const bridge = c.bridge;
      const hasHermes =
        (bridge && bridge.mode === "external-hermes") ||
        c.hermesInstalled === true ||
        (Array.isArray(c.servesPersonalities) && c.servesPersonalities.includes("hermione"));
      // Adenda 74: respeta el toggle por neurona "Sincronizar chats de Hermione".
      if (!hasHermes || c.hermioneSync === false) continue;
      const chats = (c.hermesChats as Record<string, string>) || {};
      if (chats[convId] === name) { updated++; continue; }
      chats[convId] = name;
      const newCaps = { ...c, hermesChats: chats, hermesInstalled: true };
      const { error } = await sb.from("neuron_devices").update({ capabilities: newCaps }).eq("id", row.id);
      if (!error) updated++;
    }
    return updated;
  } catch { return 0; }
}

/** BACKFILL: sincroniza TODOS los chats de Hermione de la cuenta a UNA neurona. */
export async function backfillHermesChatsToNeuron(neuronId: string): Promise<number> {
  try {
    const convs = await listHermioneConversations();
    if (!convs.length) return 0;
    const sb = serverWriteClient();
    const { data } = await sb.from("neuron_devices").select("capabilities").eq("id", neuronId).maybeSingle();
    const c = (data?.capabilities as any) || {};
    // Adenda 74: si el usuario apagó la sync de Hermione en esta neurona, no backfilleamos.
    if (c.hermioneSync === false) return 0;
    const chats = (c.hermesChats as Record<string, string>) || {};
    let added = 0;
    for (const conv of convs) {
      if (chats[conv.convId] !== conv.name) { chats[conv.convId] = conv.name; added++; }
    }
    const newCaps = { ...c, hermesChats: chats, hermesInstalled: true };
    const { error } = await sb.from("neuron_devices").update({ capabilities: newCaps }).eq("id", neuronId);
    return error ? 0 : added;
  } catch { return 0; }
}

/** BACKFILL: sincroniza TODOS los chats de Hermione a TODAS las neuronas Hermes. */
export async function backfillAllHermesNeurons(): Promise<number> {
  try {
    const convs = await listHermioneConversations();
    const sb = serverWriteClient();
    const { data } = await sb.from("neuron_devices").select("id, capabilities").limit(50);
    const rows = (data as Array<{ id: string; capabilities?: any }>) || [];
    let total = 0;
    for (const row of rows) {
      const c = row.capabilities || {};
      const bridge = c.bridge;
      const hasHermes =
        (bridge && bridge.mode === "external-hermes") ||
        c.hermesInstalled === true ||
        (Array.isArray(c.servesPersonalities) && c.servesPersonalities.includes("hermione"));
      // Adenda 74: respeta el toggle por neurona "Sincronizar chats de Hermione".
      if (!hasHermes || c.hermioneSync === false) continue;
      const chats = (c.hermesChats as Record<string, string>) || {};
      for (const conv of convs) chats[conv.convId] = conv.name;
      const newCaps = { ...c, hermesChats: chats, hermesInstalled: true };
      const { error } = await sb.from("neuron_devices").update({ capabilities: newCaps }).eq("id", row.id);
      if (!error) total += convs.length;
    }
    return total;
  } catch { return 0; }
}
