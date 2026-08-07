"use client";

/**
 * PersonalitiesHub — pestaña GLOBAL «Personalidades» de Astraura IA
 * (Adenda 97 · SOP §7.1-7.2). Reemplaza a la antigua pestaña única «Aurora»
 * como CENTRO escalable y centralizado de las personalidades del sistema.
 *
 * Estructura:
 *   1. PANEL DE CONTROL — KPIs vivos: personalidades, personalidad global
 *      activa, motor de voz REAL (OmniVoice), nodos de la malla, memoria local.
 *   2. PERSONALIDADES — el PersonalitiesPanel completo (los mismos archivos de
 *      personalidad de Exocórtex/Cerebros: una sola fuente de verdad, ahora
 *      montada globalmente).
 *   3. RED MESH POR NEURONA — reglas de malla POR personalidad (rol, prioridad
 *      de ancho de banda, voz y sync descentralizados) + la neurona-dispositivo.
 *   4. MEMORIA LOCAL — historial de conversaciones/memoria de ESTA neurona.
 *
 * Diseño Crystal Liquid Glass · iconos Lucide · cursor-pointer · 200 ms.
 * SSR-safe y defensivo. Nunca lanza.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  icons as lucideIcons,
  Brain,
  Clock,
  Cpu,
  Drama,
  MessagesSquare,
  Mic,
  RadioTower,
  Sparkles,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PersonalitiesPanel } from "@/components/aurora/personalities-panel";
import { MeshStatusChip } from "@/components/mesh/mesh-status-chip";
import {
  listPersonalityProfiles,
  getPersonalityAssignments,
  PERSONALITY_CHANGED_EVENT,
  type PersonalityProfile,
} from "@/lib/aurora/personalities";
import {
  resolveActiveVoiceEngine,
  VOICE_ENGINE_REGISTRY,
} from "@/lib/aurora/tts-oss/engine-registry";
import { cachedConversations, AI_CONV_CHANGE_EVENT, type AiConversation } from "@/lib/aurora/conversations";
// (Adenda 149) KPI agregado: cuántas personalidades tienen sistemas de Astraura
// ajustados a mano EN ESTA neurona (el resto sigue en automático).
import { getRawOverrides, subscribeNeuronPersona } from "@/lib/astraura/neuron-persona-systems";
import { thisDeviceId } from "@/lib/neurons/neurons";
import {
  DEVICE_RULES_ID,
  MESH_PRIORITY_LABELS,
  MESH_ROLE_LABELS,
  startMeshSubsystem,
  useMeshState,
  useNeuronMeshRules,
  type NeuronMeshPriority,
  type NeuronMeshRole,
} from "@/ai/astraura/mesh";

/* ── Utilidades ────────────────────────────────────────────────────────────── */

function iconFor(name: string | undefined): LucideIcon {
  if (name && name in lucideIcons) return lucideIcons[name as keyof typeof lucideIcons] as LucideIcon;
  return Sparkles;
}

function timeAgo(ms: number): string {
  if (!ms) return "—";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

/* ── KPI ───────────────────────────────────────────────────────────────────── */

function Kpi({
  icon: Icon,
  label,
  value,
  detail,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  detail?: string;
  accent: string;
}) {
  return (
    <Card className="border-white/10 bg-black/20">
      <CardContent className="p-3.5">
        <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/40">
          <Icon className={cn("h-3.5 w-3.5", accent)} /> {label}
        </p>
        <p className="mt-1 truncate text-lg font-semibold text-white/90">{value}</p>
        {detail && <p className="mt-0.5 truncate text-[11px] text-white/45">{detail}</p>}
      </CardContent>
    </Card>
  );
}

/* ── Reglas mesh de UNA neurona/personalidad ───────────────────────────────── */

function MeshRulesRow({
  id,
  name,
  icon: Icon,
  isDevice,
}: {
  id: string | null;
  name: string;
  icon: LucideIcon;
  isDevice?: boolean;
}) {
  const { rules, update } = useNeuronMeshRules(id);
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-3 transition-colors duration-200 hover:border-emerald-400/25 md:flex-row md:items-center",
        isDevice && "border-emerald-400/25 bg-emerald-500/[0.05]",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
          <Icon className="h-4 w-4 text-emerald-200" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm text-white/90">{name}</p>
          <p className="truncate text-[11px] text-white/40">
            {MESH_ROLE_LABELS[rules.role].hint}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Select value={rules.role} onValueChange={(v) => update({ role: v as NeuronMeshRole })}>
          <SelectTrigger className="h-8 w-[150px] cursor-pointer border-white/10 bg-white/5 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(MESH_ROLE_LABELS) as NeuronMeshRole[]).map((r) => (
              <SelectItem key={r} value={r} className="cursor-pointer text-xs">
                {MESH_ROLE_LABELS[r].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={rules.priority}
          onValueChange={(v) => update({ priority: v as NeuronMeshPriority })}
        >
          <SelectTrigger className="h-8 w-[110px] cursor-pointer border-white/10 bg-white/5 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(MESH_PRIORITY_LABELS) as NeuronMeshPriority[]).map((p) => (
              <SelectItem key={p} value={p} className="cursor-pointer text-xs">
                Prioridad {MESH_PRIORITY_LABELS[p].toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-white/55">
          <Switch
            checked={rules.voiceAnnounce}
            onCheckedChange={(v) => update({ voiceAnnounce: v })}
          />
          <Volume2 className="h-3.5 w-3.5" /> Anuncia por voz
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-white/55">
          <Switch
            checked={rules.allowStateSync}
            onCheckedChange={(v) => update({ allowStateSync: v })}
          />
          Sync de estado
        </label>
      </div>
    </div>
  );
}

/* ── Hub principal ─────────────────────────────────────────────────────────── */

export function PersonalitiesHub() {
  const mesh = useMeshState();
  const [profiles, setProfiles] = useState<PersonalityProfile[]>([]);
  const [globalId, setGlobalId] = useState<string | null>(null);
  const [convs, setConvs] = useState<AiConversation[]>([]);
  const [voiceEngine, setVoiceEngine] = useState<string>("browser");

  useEffect(() => {
    startMeshSubsystem(); // monitores pasivos (coste ~0 sin radio)
    const refresh = () => {
      try {
        setProfiles(listPersonalityProfiles());
        setGlobalId(getPersonalityAssignments().global);
        setVoiceEngine(resolveActiveVoiceEngine());
      } catch {
        /* */
      }
    };
    const refreshConvs = () => {
      try {
        setConvs(cachedConversations().slice(0, 8));
      } catch {
        /* */
      }
    };
    refresh();
    refreshConvs();
    if (typeof window === "undefined") return;
    window.addEventListener(PERSONALITY_CHANGED_EVENT, refresh);
    window.addEventListener(AI_CONV_CHANGE_EVENT, refreshConvs);
    return () => {
      window.removeEventListener(PERSONALITY_CHANGED_EVENT, refresh);
      window.removeEventListener(AI_CONV_CHANGE_EVENT, refreshConvs);
    };
  }, []);

  // (Adenda 149) Personalidades con overrides propios en esta neurona + total
  // de sistemas ajustados. Lectura local del store, viva vía suscripción.
  const [tuned, setTuned] = useState<{ personas: number; sistemas: number }>({ personas: 0, sistemas: 0 });
  useEffect(() => {
    const recount = () => {
      try {
        const deviceId = thisDeviceId();
        if (!deviceId) return setTuned({ personas: 0, sistemas: 0 });
        let personas = 0;
        let sistemas = 0;
        for (const p of profiles) {
          const raw = getRawOverrides(deviceId, p.id) as Record<string, unknown>;
          const n = Object.values(raw).filter(
            (v) => v && typeof v === "object" && Object.keys(v as object).length > 0,
          ).length;
          if (n > 0) {
            personas += 1;
            sistemas += n;
          }
        }
        setTuned({ personas, sistemas });
      } catch {
        setTuned({ personas: 0, sistemas: 0 });
      }
    };
    recount();
    return subscribeNeuronPersona(recount);
  }, [profiles]);

  const globalProfile = useMemo(
    () => profiles.find((p) => p.id === globalId) ?? null,
    [profiles, globalId],
  );
  const engineLabel =
    VOICE_ENGINE_REGISTRY[voiceEngine as keyof typeof VOICE_ENGINE_REGISTRY]?.label ??
    "Navegador (mejor voz del dispositivo)";
  const meshOnline = mesh.nodes.filter((n) => !n.isSelf && n.presence === "online").length;

  return (
    <div className="space-y-4">
      {/* 1 · Panel de control */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-emerald-50">
            <Drama className="h-5 w-5 text-emerald-300" /> Personalidades de Astraura
          </h2>
          <p className="text-xs text-white/50">
            Centro global: identidad, voz OmniVoice, memoria y participación en la Red Mesh de cada
            personalidad — el mismo sistema que usan el orbe, el Exocórtex y los Cerebros.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              try {
                void import("@/lib/aurora/tts-oss/neuron-voice-constants").then((m) =>
                  m.forceReopenNeuronVoiceWindow(),
                );
              } catch {
                /* */
              }
            }}
            title="Reabrir el selector de voz OmniVoice de esta neurona"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70 transition-colors duration-200 hover:border-sky-400/40 hover:text-white"
          >
            <Mic className="h-3 w-3" /> Selector de voz
          </button>
          <MeshStatusChip />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi
          icon={Sparkles}
          label="Personalidades"
          value={profiles.length}
          detail={globalProfile ? `Global: ${globalProfile.name}` : "Sin personalidad global"}
          accent="text-fuchsia-300"
        />
        <Kpi
          icon={Mic}
          label="Voz activa (OmniVoice)"
          value={engineLabel.split("(")[0].trim()}
          detail={engineLabel}
          accent="text-emerald-300"
        />
        <Kpi
          icon={RadioTower}
          label="Red Mesh"
          value={mesh.status === "ready" ? `${meshOnline} nodos` : "—"}
          detail={mesh.meshHealth.detail}
          accent="text-emerald-300"
        />
        <Kpi
          icon={Brain}
          label="Memoria local"
          value={convs.length ? `${convs.length}+ hilos` : "0 hilos"}
          detail="conversaciones de esta neurona"
          accent="text-sky-300"
        />
        {/* (Adenda 149) Sistemas de Astraura ajustados a mano en ESTA neurona. */}
        <Kpi
          icon={Cpu}
          label="Ajustes en esta neurona"
          value={tuned.personas}
          detail={
            tuned.personas === 0
              ? "todas en automático"
              : `${tuned.personas} de ${profiles.length} personalidades · ${tuned.sistemas} ${tuned.sistemas === 1 ? "sistema" : "sistemas"}`
          }
          accent="text-fuchsia-300"
        />
      </div>

      {/* 2 · Personalidades (fuente única de verdad, montada globalmente) */}
      <Card className="border-white/10 bg-black/20">
        <CardContent className="p-4">
          <PersonalitiesPanel />
        </CardContent>
      </Card>

      {/* 3 · Reglas mesh por neurona */}
      <Card className="border-white/10 bg-black/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <RadioTower className="h-4 w-4 text-emerald-300" /> Red Mesh por neurona
          </CardTitle>
          <CardDescription>
            Cada personalidad decide su papel en la malla LoRa: interactiva, relé exclusivo de
            alertas críticas, solo escucha o apagada — con su prioridad de ancho de banda y sus
            permisos de voz y sincronización descentralizadas. La conexión física del radio vive en
            la pestaña <Link href="/agent?tab=mesh" className="cursor-pointer text-emerald-300 underline-offset-2 transition-colors duration-200 hover:underline">Red Mesh</Link>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <MeshRulesRow
            id={DEVICE_RULES_ID}
            name="Esta neurona (dispositivo)"
            icon={Brain}
            isDevice
          />
          {profiles.map((p) => (
            <MeshRulesRow key={p.id} id={p.id} name={p.name} icon={iconFor(p.icon)} />
          ))}
          {profiles.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-center text-sm text-white/40">
              Crea personalidades arriba y aparecerán aquí con sus reglas de malla.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 4 · Historial de memoria local */}
      <Card className="border-white/10 bg-black/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <MessagesSquare className="h-4 w-4 text-sky-300" /> Memoria local reciente
          </CardTitle>
          <CardDescription>
            Los últimos hilos de conversación cacheados en ESTA neurona (la memoria profunda y los
            baúles viven en <Link href="/agent?tab=memorias" className="cursor-pointer text-sky-300 underline-offset-2 transition-colors duration-200 hover:underline">Cerebro &amp; Memorias</Link>).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {convs.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-center text-sm text-white/40">
              Aún no hay conversaciones locales. Habla con Astraura y aparecerán aquí.
            </p>
          ) : (
            convs.map((c) => (
              <Link
                key={c.id}
                href="/agent?tab=chat"
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 transition-colors duration-200 hover:border-sky-400/30"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-white/80">{c.title || "Conversación"}</span>
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-white/40">
                  <Clock className="h-3 w-3" /> {timeAgo(c.updatedAt)}
                </span>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default PersonalitiesHub;
