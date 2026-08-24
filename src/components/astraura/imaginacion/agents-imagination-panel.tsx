"use client";

/**
 * PESTAÑA "🧠 AGENTES & IMAGINACIÓN EN 2DO PLANO" — spec §3.2 / §3.2.1.
 * ----------------------------------------------------------------------------
 * Banner "Crear Nuevo Agente" + grid de tarjetas de agente (`agentsList` de
 * la bóveda, `fetchAstraura158VaultAgents`), cada una con su interruptor de
 * imaginación, nivel de permisos de ensueño, tronco de cómputo, cuotas de
 * CPU/RAM, y sus insignias de personalidades/cerebros/interconexiones.
 *
 * `AgentEditorModal` / `AgentApiManagerModal` del original son componentes
 * EXTERNOS que la propia spec marca "fuera de alcance" (§3.2.1) — aquí sus
 * puntos de entrada ("Crear Nuevo Agente", "Configurar & Ramas", "API
 * Soberana") enlazan al Studio 1.58 (`/agent?tab=astraura-158`), que sí trae
 * el editor de agentes completo, en vez de fingir que existe un modal aquí.
 */

import { useState } from "react";
import Link from "next/link";
import { Brain, Cpu, Edit3, ExternalLink, Key, Network, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  toggleAstraura158AgentImagination, updateAstraura158AgentImaginationConfig,
  type Astraura158Agent, type Astraura158Target, type Astraura158VaultAgentImagination,
} from "@/lib/astraura/astraura-158-client";
import { Slider } from "@/components/ui/slider";
import { BTN, BTN_PRIMARY, Badge, BusyIcon, Empty, LABEL, MONO, PILL, PILL_OFF, PILL_ON, SELECT, useBusy } from "@/components/astraura/s158/shared";

/** El cliente tipa `used_personalities` sin color propio y no tipa `is_custom` /
 *  `linked_cerebros` / `interconnections` — todos reales en el original (§3.2.1). */
export interface Astraura158AgentFull extends Astraura158Agent, Astraura158VaultAgentImagination {
  is_custom?: boolean;
  linked_cerebros?: { id?: string; name: string }[];
  interconnections?: { target_agent_id: string; relationship: string }[];
}

/** Orden y textos literales EXACTOS de la tarjeta de agente (distintos de los de la tarjeta de proceso, spec §5.3). */
const AGENT_PERMISSION_OPTIONS: { id: string; label: string }[] = [
  { id: "autonomous_sovereign", label: "Soberano (Auto-Aplica Todo)" },
  { id: "auto_apply_safe", label: "Seguro (Auto-Aplica Leves/Seguros)" },
  { id: "auto_apply_minor", label: "Mínimo (Solo Cosméticos/Doc)" },
  { id: "always_ask", label: "Siempre Preguntar" },
];

/** `used_personalities` no tipa `color` por elemento; se lee de forma defensiva
 *  (parámetro `unknown` a propósito — un tipo `{color?:string}` "débil" contra
 *  una unión sin campos en común dispara la regla de TS de tipos débiles). */
function personalityColor(p: unknown, fallback: string): string {
  if (p && typeof p === "object" && typeof (p as { color?: unknown }).color === "string") return (p as { color: string }).color;
  return fallback;
}

export interface AgentsImaginationPanelProps {
  target: Astraura158Target;
  agents: Astraura158AgentFull[];
  onReload: () => void | Promise<void>;
}

export function AgentsImaginationPanel({ target, agents, onReload }: AgentsImaginationPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
        <p className="text-[11px] text-white/60">{agents.length} agente{agents.length === 1 ? "" : "s"} con imaginación de fondo configurable.</p>
        <Link href="/agent?tab=astraura-158" className={BTN_PRIMARY} title="Se crea y edita en el Studio 1.58 completo" aria-label="Crear nuevo agente">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Crear Nuevo Agente
        </Link>
      </div>

      {agents.length === 0 && <Empty text="Sin agentes en la bóveda todavía." />}

      <div className="grid gap-2.5 lg:grid-cols-2">
        {agents.map((ag) => <AgentCard key={ag.id} target={target} ag={ag} onReload={onReload} />)}
      </div>
    </div>
  );
}

function AgentCard({ target, ag, onReload }: { target: Astraura158Target; ag: Astraura158AgentFull; onReload: () => void | Promise<void> }) {
  const { busy, wrap } = useBusy();
  const color = ag.color ?? "#00f0ff";
  const on = !!ag.imagination_enabled;
  const level = ag.imagination_permission_level ?? "always_ask";
  const trunk = ag.compute_trunk ?? "trunk_a";
  const [cpu, setCpu] = useState(ag.cpu_quota_percent ?? 10);
  const [ram, setRam] = useState(ag.ram_limit_mb ?? 128);

  const personalities = (ag.used_personalities && ag.used_personalities.length > 0)
    ? ag.used_personalities
    : [{ id: ag.id, name: ag.name.split(" ")[0], color }];
  const brains = (ag.linked_cerebros && ag.linked_cerebros.length > 0) ? ag.linked_cerebros : [{ id: "brain_genesis", name: "Génesis" }];
  const interconnections = (ag.interconnections ?? []).slice(0, 2);

  const patch = (label: string, config: Astraura158VaultAgentImagination) => {
    void wrap(label, async () => {
      const r = await updateAstraura158AgentImaginationConfig(target, ag.id, config);
      if (r.ok) { toast.success(`${ag.name}: ${label}`); await onReload(); } else toast.error(`${ag.name}: ${r.error}`);
    });
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
      <div className="flex items-start gap-2.5">
        <Brain className="h-5 w-5 shrink-0" style={{ color }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-[13px] font-semibold text-white/90">{ag.name}</p>
            {ag.is_custom && <Badge tone="border-white/15 bg-white/[0.04] text-white/60">Custom</Badge>}
          </div>
          {ag.role && <p className="truncate text-[10px] text-white/50">{ag.role}</p>}
        </div>
      </div>

      <button
        type="button"
        className={cn(PILL, "mt-2.5 w-full justify-center", on ? PILL_ON : PILL_OFF)}
        disabled={busy !== ""}
        aria-pressed={on}
        aria-label={`Imaginación de ${ag.name} ${on ? "activa" : "apagada"}`}
        onClick={() => { void wrap("estado", async () => { const r = await toggleAstraura158AgentImagination(target, ag.id, !on); if (r.ok) { toast.success(`${ag.name}: ${!on ? "imaginación activada" : "imaginación apagada"}`); await onReload(); } else toast.error(`${ag.name}: ${r.error}`); }); }}
      >
        <BusyIcon busy={busy === "estado"} icon={Cpu} /> {on ? "● IMAGINACIÓN ON" : "○ APAGADA"}
      </button>

      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL}>Nivel de Permisos de Ensueño:</span>
          <select
            className={cn(SELECT, "mt-1 w-full py-1")} value={AGENT_PERMISSION_OPTIONS.some((o) => o.id === level) ? level : "always_ask"}
            disabled={busy !== ""} aria-label={`Nivel de permisos de ensueño de ${ag.name}`}
            onChange={(e) => patch("nivel de permisos actualizado", { imagination_permission_level: e.target.value })}
          >
            {AGENT_PERMISSION_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>Tronco de Cómputo:</span>
          <select
            className={cn(SELECT, "mt-1 w-full py-1")} value={trunk === "trunk_b" ? "trunk_b" : "trunk_a"}
            disabled={busy !== ""} aria-label={`Tronco de cómputo de ${ag.name}`}
            onChange={(e) => patch("tronco de cómputo actualizado", { compute_trunk: e.target.value })}
          >
            <option value="trunk_a">Tronco A (Ensueño &amp; Shaders 3D)</option>
            <option value="trunk_b">Tronco B (Sensorial &amp; Seguridad)</option>
          </select>
        </label>
      </div>

      <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
        <div>
          <p className={LABEL}>Cuota de CPU Asignada: {cpu}%</p>
          <Slider
            className="mt-2" min={5} max={60} step={5} value={[cpu]} disabled={busy !== ""}
            onValueChange={([v]) => setCpu(v)}
            onValueCommit={([v]) => patch(`${v}% de CPU`, { cpu_quota_percent: v })}
            aria-label={`Cuota de CPU de ${ag.name}`}
          />
        </div>
        <div>
          <p className={LABEL}>Límite de Memoria RAM: {ram} MB</p>
          <Slider
            className="mt-2" min={64} max={512} step={32} value={[ram]} disabled={busy !== ""}
            onValueChange={([v]) => setRam(v)}
            onValueCommit={([v]) => patch(`${v} MB de RAM`, { ram_limit_mb: v })}
            aria-label={`Límite de RAM de ${ag.name}`}
          />
        </div>
      </div>

      <div className="mt-2.5">
        <p className={LABEL}>Personalidades Habilitadas:</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {personalities.map((p, i) => (
            <Badge key={p.id ?? i} tone="border-white/15 bg-white/[0.04]" className="text-white/75">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: personalityColor(p, color) }} aria-hidden="true" /> {p.name}
            </Badge>
          ))}
        </div>
      </div>
      <div className="mt-2">
        <p className={LABEL}>Cerebros &amp; Memoria:</p>
        <div className="mt-1 flex flex-wrap gap-1">{brains.map((b, i) => <Badge key={b.id ?? i} tone="border-indigo-400/25 bg-indigo-500/10 text-indigo-200">{b.name}</Badge>)}</div>
      </div>

      {interconnections.length > 0 && (
        <div className="mt-2">
          <p className={LABEL}>Interconexiones con otros Agentes:</p>
          <div className="mt-1 space-y-0.5">
            {interconnections.map((ic, i) => (
              <p key={i} className="flex items-center gap-1 text-[10px] text-white/60"><Network className="h-3 w-3 text-white/35" aria-hidden="true" /> {ic.target_agent_id} <span className="text-white/35">·</span> {ic.relationship}</p>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex gap-1.5">
        <Link href="/agent?tab=astraura-158" className={BTN} title="Configuración y ramas completas en el Studio 1.58" aria-label={`Configurar y ver ramas de ${ag.name}`}>
          <Edit3 className="h-3.5 w-3.5" aria-hidden="true" /> Configurar &amp; Ramas <ExternalLink className="h-3 w-3 text-white/40" aria-hidden="true" />
        </Link>
        <Link href="/agent?tab=astraura-158" className={BTN} title="Gestión de claves API en el Studio 1.58" aria-label={`API soberana de ${ag.name}`}>
          <Key className="h-3.5 w-3.5" aria-hidden="true" /> API Soberana
        </Link>
      </div>
      <p className={cn(MONO, "mt-1.5")}>Editor de agente y claves API: fuera de alcance de esta pantalla (spec §3.2.1) — se abren en el Studio 1.58.</p>
    </div>
  );
}

export default AgentsImaginationPanel;
