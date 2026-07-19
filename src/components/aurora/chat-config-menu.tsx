"use client";

/**
 * ChatConfigMenu — MENÚ UNIFICADO de configuración de chat de Astraura AI
 * (Adenda 71-bis · 2026-07-17, mejorado fix-11).
 *
 * 7 botones principales con estilo del contexto del OS:
 *   Memorias · Personalidad · Sentidos · Motor de modelos · Capacidades ·
 *   Habilidades · Conexiones.
 * Cada uno despliega opciones y ajustes modulables POR CHAT, recordadas e
 * interconectadas vía la cuenta (aurora_conversations.meta.config, sincronizado
 * en tiempo real). Las secciones reflejan el estado VIVO del sistema:
 *   · Sentidos   → SENSES[] + getActiveSenses()  (lib/senses/senses.ts)
 *   · Conexiones → getOssServices()              (lib/services/oss-connections.ts)
 *   · Capacidades→ getCapabilities()             (lib/aurora/capabilities.ts)
 *   · Personalidad/Modelos → setActivePersonality / setActiveProviderId
 * Diseño adaptado por contexto (exocortex / orbe / astraura) y responsive.
 */

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import {
  Brain, UserRound, Eye, Cpu, Boxes, Zap, Network,
  Check, ChevronRight, X, Plus, Search,
} from "lucide-react";
import {
  listPersonalityProfiles, setActivePersonality, resolvePersonalityForContext,
  getPersonalityAssignments,
} from "@/lib/aurora/personalities";
import { insertConfigChangeMessage } from "@/lib/aurora/config-change";
import { loadConfigs, getActiveProviderId, setActiveProviderId } from "@/ai/client/providerStore";
import { PROVIDERS } from "@/ai/providers";
import { SENSES, getActiveSenses, setActiveSenses } from "@/lib/senses/senses";
import { getOssServices } from "@/lib/services/oss-services";
import { readConnections } from "@/lib/services/oss-connections";
import { getCapabilities } from "@/lib/aurora/capabilities";

export type ChatConfigContext = "exocortex" | "orbe" | "astraura";
/** Alias mantenido para ChatHeaderOptions (antes venía de personality-options-window). */
export type PersonalityOptionContext = ChatConfigContext;

export interface ChatConfig {
  personalityId?: string | null;
  provider?: string | null;
  capabilities?: Record<string, boolean>;
  skills?: string[];
  connections?: string[];
  memoryScope?: string;
  senses?: Record<string, boolean>;
  /** Voz (Aurora habla) por chat — Adenda 71-bis. */
  voice?: boolean;
  /** Registro (historial persistente) por chat — Adenda 71-bis. */
  log?: boolean;
}

/** Etiqueta legible del proveedor/modelo guardado por chat (Adenda 71-bis fix-21). */
export function providerLabel(id?: string | null): string | null {
  if (!id) return null;
  try {
    const cfgs = loadConfigs() as Array<{ id: string; label?: string }>;
    const hit = cfgs.find((c) => c.id === id);
    if (hit?.label) return hit.label;
  } catch { /* noop */ }
  try {
    const p = (PROVIDERS as Record<string, { label?: string }>)[id];
    if (p?.label) return p.label;
  } catch { /* noop */ }
  return id;
}

const THEMES: Record<ChatConfigContext, { ring: string; grad: string; accent: string; btn: string }> = {
  exocortex: {
    ring: "border-violet-400/40",
    grad: "from-violet-600/25 via-fuchsia-600/10 to-black/70",
    accent: "text-violet-200",
    btn: "border-violet-400/30 text-violet-100 hover:bg-violet-500/15",
  },
  orbe: {
    ring: "border-cyan-400/40",
    grad: "from-cyan-600/25 via-sky-600/10 to-black/70",
    accent: "text-cyan-200",
    btn: "border-cyan-400/30 text-cyan-100 hover:bg-cyan-500/15",
  },
  astraura: {
    ring: "border-fuchsia-400/40",
    grad: "from-fuchsia-600/25 via-pink-600/10 to-black/70",
    accent: "text-fuchsia-200",
    btn: "border-fuchsia-400/30 text-fuchsia-100 hover:bg-fuchsia-500/15",
  },
};

const SECTION_DEFS = [
  { key: "memorias", label: "Memorias", Icon: Brain },
  { key: "personalidad", label: "Personalidad", Icon: UserRound },
  { key: "sentidos", label: "Sentidos", Icon: Eye },
  { key: "modelos", label: "Motor de modelos", Icon: Cpu },
  { key: "capacidades", label: "Capacidades", Icon: Boxes },
  { key: "habilidades", label: "Habilidades", Icon: Zap },
  { key: "conexiones", label: "Conexiones", Icon: Network },
] as const;

// Etiquetas legibles de categoría de conexiones (Adenda 71-bis fix-22).
const CATEGORY_LABELS: Record<string, string> = {
  llm: "Modelos / Chat",
  stt: "Voz → Texto",
  tts: "Texto → Voz",
  image: "Imagen",
  video: "Vídeo",
  workflow: "Automatización",
  calendar: "Agenda",
  docs: "Documentos",
  design: "Diseño",
  website: "Web / Sitios",
};
// Orden de grupo al renderizar la sección Conexiones.
const CATEGORY_ORDER = ["llm", "stt", "tts", "image", "video", "workflow", "calendar", "docs", "design", "website"];

// Filtro de búsqueda para la sección Conexiones (Adenda 71-bis fix-23).
function matchesConn(c: { label: string; purpose: string; category: string }, q: string): boolean {
  if (!q.trim()) return true;
  const t = q.trim().toLowerCase();
  return (
    c.label.toLowerCase().includes(t) ||
    c.purpose.toLowerCase().includes(t) ||
    c.category.toLowerCase().includes(t)
  );
}

// Abre el panel de conexiones OSS preseleccionando un servicio (Adenda 71-bis fix-23).
function openConnect(serviceId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.open(`/servicios?connect=${encodeURIComponent(serviceId)}`, "_blank", "noopener");
  } catch {
    window.location.href = `/servicios?connect=${encodeURIComponent(serviceId)}`;
  }
}

type SectionKey = (typeof SECTION_DEFS)[number]["key"];

const SKILL_KEYS = ["taste", "pm", "web-senses", "research", "vision", "voice", "planning", "memory"] as const;
const SKILL_LABELS: Record<string, string> = {
  taste: "Gusto / preferencia", pm: "Project manager", "web-senses": "Sentidos web",
  research: "Investigación", vision: "Visión", voice: "Voz", planning: "Planificación", memory: "Memoria",
};
const CAP_LABELS: Record<string, string> = {
  mic: "Micrófono", voice: "Voz", vision: "Visión", web: "Web", file: "Archivos",
  memory: "Memoria", cron: "Cron", location: "Ubicación",
};
const MEM_SCOPES = ["personal", "compartida", "cerebro-activo", "todas"] as const;

export function ChatConfigMenu({
  convId, context = "astraura", onClose,
}: {
  convId?: string | null;
  context?: ChatConfigContext;
  onClose?: () => void;
}) {
  const theme = THEMES[context];
  const [cfg, setCfg] = useState<ChatConfig>({});
  const [open, setOpen] = useState<SectionKey | null>(null);
  const [personalities, setPersonalities] = useState<{ id: string; name: string }[]>([]);
  const [providers, setProviders] = useState<{ id: string; label: string }[]>([]);
  const [senses, setSenses] = useState<{ id: string; label: string }[]>([]);
  const [sensesActive, setSensesActive] = useState<string[]>([]);
  const [connections, setConnections] = useState<{ id: string; label: string; category: string; purpose: string; connected: boolean }[]>([]);
  const [capsEnv, setCapsEnv] = useState<Record<string, boolean>>({});
  const [connQuery, setConnQuery] = useState("");
  // Estado EFECTIVO global (Adenda 71-ter · fix convId): cuando el chat no fijó
  // un valor, el menú muestra el estado REAL del sistema (personalidad activa,
  // proveedor activo, sentidos activos) en vez de "sin selección".
  const [effPersonalityId, setEffPersonalityId] = useState<string | null>(null);
  const [effProvider, setEffProvider] = useState<string | null>(null);

  const load = useCallback(async () => {
    let initial: ChatConfig = {};
    if (convId) {
      try {
        const sb = createClient();
        const { data } = await sb.from("aurora_conversations").select("meta").eq("id", convId).maybeSingle();
        const meta = (data?.meta as any) || {};
        initial = meta.config || {};
      } catch { /* */ }
    }
    setCfg(initial);
    // (Adenda 71-ter · Task 10) Nube → local: si el chat fijó una personalidad en
    // meta.config (fuente de verdad en la nube), la reflejamos en la asignación
    // POR CHAT de localStorage para que resolvePersonalityForContext la respete en
    // ESTE dispositivo (compat cross-device). Sólo si difiere (idempotente).
    if (convId && initial.personalityId) {
      try {
        const cur = getPersonalityAssignments().porChat[convId];
        if (cur !== initial.personalityId) setActivePersonality({ scope: "chat", chatId: convId }, initial.personalityId);
      } catch { /* */ }
    }
    // Personalidad/proveedor EFECTIVOS (para hidratar el estado mostrado).
    try { setEffPersonalityId(resolvePersonalityForContext({ chatId: convId ?? undefined })?.id ?? null); } catch { setEffPersonalityId(null); }
    try { setEffProvider(getActiveProviderId() ?? null); } catch { setEffProvider(null); }
    try { setPersonalities(listPersonalityProfiles().map((p) => ({ id: p.id, name: p.name }))); } catch { /* */ }
    try {
      const cfgs = loadConfigs();
      const provs = PROVIDERS as Record<string, unknown>;
      setProviders(cfgs.map((c: any) => ({ id: c.id, label: c.label || c.id })).filter((p: any) => provs[p.id]));
    } catch { /* */ }
    try { setSenses(SENSES.map((s) => ({ id: s.id, label: s.label }))); } catch { /* */ }
    try { setSensesActive(getActiveSenses()); } catch { /* */ }
    try {
      const connectedIds = new Set(readConnections().map((c) => c.serviceId));
      setConnections(
        getOssServices().map((s: any) => ({
          id: s.id,
          label: s.name || s.id,
          category: s.category || "other",
          purpose: s.purpose || "",
          connected: connectedIds.has(s.id),
        })),
      );
    } catch { /* */ }
    try {
      const c = getCapabilities();
      setCapsEnv({
        mic: c.micPermission === "granted",
        voice: c.hasTTS,
        vision: c.hasMediaDevices,
        web: true, file: true, memory: true, cron: true, location: c.isMobile !== undefined,
      });
    } catch { /* */ }
  }, [convId]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (next: ChatConfig) => {
    setCfg(next);
    if (!convId) return;
    try {
      const sb = createClient();
      const { data } = await sb.from("aurora_conversations").select("meta").eq("id", convId).maybeSingle();
      const meta = (data?.meta as any) || {};
      const prevCfg = (meta.config as ChatConfig) || {};
      meta.config = next;
      await sb.from("aurora_conversations").update({ meta }).eq("id", convId);
      // Divisor sutil "⚙️ Ajustes del chat actualizados: …" en el hilo, con SÓLO
      // los campos que cambiaron. Idempotente; aparece en todas las superficies.
      void insertConfigChangeMessage(convId, prevCfg, next);
    } catch { /* */ }
  }, [convId]);

  const patch = (p: Partial<ChatConfig>) => save({ ...cfg, ...p });

  const toggleCap = (k: string) => {
    const caps = { ...(cfg.capabilities || {}) };
    caps[k] = !caps[k];
    patch({ capabilities: caps });
  };
  const toggleSense = (k: string) => {
    const s = { ...(cfg.senses || {}) };
    s[k] = !s[k];
    patch({ senses: s });
    // Hace el toggle REAL en el sistema: recalcula el set activo y persiste.
    try {
      const live = SENSES.map((x) => x.id).filter((id) => (id === k ? s[k] : (cfg.senses?.[id] ?? sensesActive.includes(id))));
      void setActiveSenses(live);
    } catch { /* */ }
  };
  const toggleVoice = () => patch({ voice: !cfg.voice });
  const toggleLog = () => patch({ log: !cfg.log });
  const toggleSkill = (k: string) => {
    const arr = cfg.skills ? [...cfg.skills] : [];
    const i = arr.indexOf(k);
    if (i >= 0) arr.splice(i, 1); else arr.push(k);
    patch({ skills: arr });
  };
  const toggleConn = (k: string) => {
    const arr = cfg.connections ? [...cfg.connections] : [];
    const i = arr.indexOf(k);
    if (i >= 0) arr.splice(i, 1); else arr.push(k);
    patch({ connections: arr });
  };

  const setPersonality = (id: string) => {
    patch({ personalityId: id });
    try { setActivePersonality({ scope: "chat", chatId: convId || "" }, id); } catch { /* */ }
  };
  const setProvider = (id: string) => {
    patch({ provider: id });
    try { setActiveProviderId(id as any); } catch { /* */ }
  };

  return (
    <div className={cn("w-[22rem] sm:w-[24rem] max-w-[92vw] rounded-2xl border backdrop-blur-2xl text-white shadow-2xl", theme.ring, theme.grad)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className={cn("text-sm font-light tracking-wide", theme.accent)}>Configuración del chat · Astraura IA</div>
        {onClose && (
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="px-4 pt-2 pb-1 flex flex-wrap gap-1.5 text-[10px] text-white/45">
        <span className="rounded-full bg-white/5 px-2 py-0.5">🔗 {cfg.connections?.length || 0} conexiones</span>
        <span className="rounded-full bg-white/5 px-2 py-0.5">⚡ {cfg.skills?.length || 0} habilidades</span>
        <span className="rounded-full bg-white/5 px-2 py-0.5">👁 {Object.values(cfg.senses || {}).filter(Boolean).length} sentidos</span>
        <span className="rounded-full bg-white/5 px-2 py-0.5">{cfg.voice === false ? "🔇 sin voz" : "🔊 voz"}</span>
        <span className="rounded-full bg-white/5 px-2 py-0.5">{cfg.log === false ? "🚫 sin registro" : "📝 registro"}</span>
      </div>

      <div className="grid grid-cols-1 gap-2 p-3">
        {SECTION_DEFS.map((s) => (
          <button
            key={s.key}
            onClick={() => setOpen(open === s.key ? null : s.key)}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition text-left",
              theme.btn,
              open === s.key && "ring-1 ring-white/40",
            )}
          >
            <s.Icon className="w-4 h-4 shrink-0" />
            <span className="flex-1 min-w-0 truncate">{s.label}</span>
            <ChevronRight className={cn("w-4 h-4 transition shrink-0", open === s.key && "rotate-90")} />
          </button>
        ))}
      </div>

      {open && (
        <div className="px-3 pb-3 max-h-[55vh] overflow-y-auto">
          {open === "personalidad" && (
            <Section title="Personalidad de este chat">
              {personalities.map((p) => (
                <Row
                  key={p.id}
                  label={p.name}
                  hint={!cfg.personalityId && effPersonalityId === p.id ? "activa (global)" : undefined}
                  active={(cfg.personalityId ?? effPersonalityId) === p.id}
                  onClick={() => setPersonality(p.id)}
                />
              ))}
            </Section>
          )}
          {open === "modelos" && (
            <Section title="Motor de modelos">
              {providers.map((p) => (
                <Row
                  key={p.id}
                  label={p.label}
                  hint={!cfg.provider && effProvider === p.id ? "activo (global)" : undefined}
                  active={(cfg.provider ?? effProvider) === p.id}
                  onClick={() => setProvider(p.id)}
                />
              ))}
            </Section>
          )}
          {open === "capacidades" && (
            <Section title="Capacidades del entorno (estado real del dispositivo)">
              {Object.keys(CAP_LABELS).map((k) => (
                <Row
                  key={k}
                  label={CAP_LABELS[k]}
                  hint={capsEnv[k] === false ? "no disponible en este dispositivo" : undefined}
                  active={capsEnv[k] !== false && !!cfg.capabilities?.[k]}
                  onClick={() => toggleCap(k)}
                />
              ))}
              <Row label="Voz (Aurora habla)" active={cfg.voice !== false} onClick={toggleVoice} />
              <Row label="Registro (historial persistente)" active={cfg.log !== false} onClick={toggleLog} />
            </Section>
          )}
          {open === "sentidos" && (
            <Section title="Sentidos activos (sistema)">
              {senses.map((s) => (
                <Row
                  key={s.id}
                  label={s.label}
                  hint={sensesActive.includes(s.id) ? "activo en el sistema" : undefined}
                  active={cfg.senses?.[s.id] ?? sensesActive.includes(s.id)}
                  onClick={() => toggleSense(s.id)}
                />
              ))}
            </Section>
          )}
          {open === "habilidades" && (
            <Section title="Habilidades (skills de Astraura)">
              {SKILL_KEYS.map((k) => (
                <Row key={k} label={SKILL_LABELS[k] || k} active={cfg.skills?.includes(k)} onClick={() => toggleSkill(k)} />
              ))}
            </Section>
          )}
          {open === "conexiones" && (
            <Section title="Conexiones (servicios del ecosistema)">
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                <input
                  value={connQuery}
                  onChange={(e) => setConnQuery(e.target.value)}
                  placeholder="Buscar conexión…"
                  className="w-full rounded-lg border border-white/10 bg-black/30 pl-8 pr-2.5 py-1.5 text-xs text-white placeholder:text-white/30 outline-none focus:border-white/30"
                />
              </div>
              <div className="space-y-3">
                {CATEGORY_ORDER.filter((cat) => connections.some((c) => c.category === cat && matchesConn(c, connQuery))).map((cat) => (
                  <div key={cat}>
                    <div className="text-[10px] uppercase tracking-wider text-white/35 mb-1">{CATEGORY_LABELS[cat] || cat}</div>
                    <div className="space-y-1">
                      {connections.filter((c) => c.category === cat && matchesConn(c, connQuery)).map((c) => (
                        <Row
                          key={c.id}
                          label={c.label}
                          hint={c.connected ? `conectado · ${c.purpose}` : c.purpose}
                          connected={c.connected}
                          active={cfg.connections?.includes(c.id)}
                          onClick={() => toggleConn(c.id)}
                          action={
                            !c.connected ? (
                              <button
                                title={`Conectar ${c.label}`}
                                onClick={(e) => { e.stopPropagation(); openConnect(c.id); }}
                                className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 px-1.5 py-0.5 text-[10px] text-emerald-200 hover:bg-emerald-500/15"
                              >
                                <Plus className="w-3 h-3" /> Conectar
                              </button>
                            ) : undefined
                          }
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {CATEGORY_ORDER.every((cat) => !connections.some((c) => c.category === cat && matchesConn(c, connQuery))) && (
                  <div className="text-[11px] text-white/30 px-1 py-2">Sin resultados para “{connQuery}”.</div>
                )}
              </div>
            </Section>
          )}
          {open === "memorias" && (
            <Section title="Memorias accesibles por este chat">
              {MEM_SCOPES.map((k) => (
                <Row key={k} label={k} active={cfg.memoryScope === k} onClick={() => patch({ memoryScope: k })} />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="text-[11px] uppercase tracking-wider text-white/40 mb-2">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, active, onClick, hint, connected, action }: {
  label: string;
  active?: boolean;
  onClick: () => void;
  hint?: string;
  /** Muestra un punto verde "conectado" (sección Conexiones). */
  connected?: boolean;
  /** Slot de acción a la derecha (p.ej. botón "Conectar"). */
  action?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition text-left",
        active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5",
      )}
    >
      <span className="min-w-0 flex items-center gap-2">
        {connected && <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400/70 shrink-0" title="conectado" />}
        <span className="min-w-0">
          <span className="capitalize truncate block">{label}</span>
          {hint && <span className="text-[10px] text-white/30 truncate block">{hint}</span>}
        </span>
      </span>
      <span className="flex items-center gap-1.5 shrink-0">
        {action}
        {active && !action && <Check className="w-3.5 h-3.5 text-emerald-300" />}
      </span>
    </button>
  );
}
