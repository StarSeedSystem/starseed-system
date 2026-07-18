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
  Check, ChevronRight, X,
} from "lucide-react";
import {
  listPersonalityProfiles, setActivePersonality,
} from "@/lib/aurora/personalities";
import { loadConfigs, getActiveProviderId, setActiveProviderId } from "@/ai/client/providerStore";
import { PROVIDERS } from "@/ai/providers";
import { SENSES, getActiveSenses } from "@/lib/senses/senses";
import { getOssServices } from "@/lib/services/oss-services";
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
  const [connections, setConnections] = useState<{ id: string; label: string }[]>([]);
  const [capsEnv, setCapsEnv] = useState<Record<string, boolean>>({});

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
    try { setPersonalities(listPersonalityProfiles().map((p) => ({ id: p.id, name: p.name }))); } catch { /* */ }
    try {
      const cfgs = loadConfigs();
      const provs = PROVIDERS as Record<string, unknown>;
      setProviders(cfgs.map((c: any) => ({ id: c.id, label: c.label || c.id })).filter((p: any) => provs[p.id]));
    } catch { /* */ }
    try { setSenses(SENSES.map((s) => ({ id: s.id, label: s.label }))); } catch { /* */ }
    try { setSensesActive(getActiveSenses()); } catch { /* */ }
    try { setConnections(getOssServices().map((s: any) => ({ id: s.id, label: s.name || s.id }))); } catch { /* */ }
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
      meta.config = next;
      await sb.from("aurora_conversations").update({ meta }).eq("id", convId);
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
  };
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
        <div className={cn("text-sm font-light tracking-wide", theme.accent)}>Configuración del chat · Astraura</div>
        {onClose && (
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        )}
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
                <Row key={p.id} label={p.name} active={cfg.personalityId === p.id} onClick={() => setPersonality(p.id)} />
              ))}
            </Section>
          )}
          {open === "modelos" && (
            <Section title="Motor de modelos">
              {providers.map((p) => (
                <Row key={p.id} label={p.label} active={cfg.provider === p.id} onClick={() => setProvider(p.id)} />
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
            </Section>
          )}
          {open === "sentidos" && (
            <Section title="Sentidos activos (sistema)">
              {senses.map((s) => (
                <Row
                  key={s.id}
                  label={s.label}
                  hint={sensesActive.includes(s.id) ? "activo en el sistema" : undefined}
                  active={!!cfg.senses?.[s.id]}
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
              {connections.map((c) => (
                <Row key={c.id} label={c.label} active={cfg.connections?.includes(c.id)} onClick={() => toggleConn(c.id)} />
              ))}
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

function Row({ label, active, onClick, hint }: { label: string; active?: boolean; onClick: () => void; hint?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition text-left",
        active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5",
      )}
    >
      <span className="min-w-0">
        <span className="capitalize truncate block">{label}</span>
        {hint && <span className="text-[10px] text-white/30 truncate block">{hint}</span>}
      </span>
      {active && <Check className="w-3.5 h-3.5 text-emerald-300 shrink-0 ml-2" />}
    </button>
  );
}
