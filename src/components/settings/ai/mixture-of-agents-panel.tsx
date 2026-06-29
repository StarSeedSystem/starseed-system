"use client";

// ════════════════════════════════════════════════════════════════
// MixtureOfAgentsPanel — Sistemas multi-agente de Aurora (Hermes +
// Astraura). Aurora orquesta y SELECCIONA inteligentemente, por cada
// solicitud, la combinación de IA + skills + memorias + contexto.
// Modos: Único · Router inteligente · Mixture of Agents · Crew.
// El motor multi-agente se elige del catálogo de CÓDIGO ABIERTO.
// Aplica a Aurora globalmente y, por defecto, a cada cerebro.
// ════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layers, Sparkles, GitBranch, Workflow, Bot, Cpu } from "lucide-react";
import { toast } from "sonner";
import { OssLibraryBrowser } from "./oss-library-browser";
import { findOption } from "@/lib/oss-library";

export type MoaMode = "single" | "router" | "moa" | "crew";

export interface MoaConfig {
  mode: MoaMode;
  autoSelect: boolean;     // Aurora elige por contexto (skills/memorias/IA)
  engineId: string | null; // framework OSS del catálogo (id de oss-library)
  layers: number;          // capas de proponentes (modo moa)
}

const STORAGE_KEY = "starseed.moa.config.v1";
const DEFAULT_CFG: MoaConfig = { mode: "router", autoSelect: true, engineId: "together-moa", layers: 2 };

function loadCfg(): MoaConfig {
  if (typeof window === "undefined") return DEFAULT_CFG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_CFG, ...JSON.parse(raw) } as MoaConfig;
  } catch { /* noop */ }
  return DEFAULT_CFG;
}
function saveCfg(c: MoaConfig) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch { /* noop */ }
}

const MODES: { id: MoaMode; label: string; desc: string; icon: typeof Layers }[] = [
  { id: "single", label: "Único", desc: "Un solo modelo/agente. Lo más simple.", icon: Cpu },
  { id: "router", label: "Router inteligente", desc: "Aurora elige el mejor agente/modelo por cada solicitud.", icon: GitBranch },
  { id: "moa", label: "Mixture of Agents", desc: "Capas de agentes proponentes + un agregador que sintetiza la mejor respuesta.", icon: Layers },
  { id: "crew", label: "Crew / Pipeline", desc: "Equipo de agentes con roles que colaboran en secuencia.", icon: Workflow },
];

export function MixtureOfAgentsPanel() {
  const [cfg, setCfg] = useState<MoaConfig>(DEFAULT_CFG);
  useEffect(() => { setCfg(loadCfg()); }, []);

  function update(patch: Partial<MoaConfig>) {
    const next = { ...cfg, ...patch };
    setCfg(next); saveCfg(next);
  }

  const engine = cfg.engineId ? findOption(cfg.engineId) : undefined;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="bg-gradient-to-br from-cyan-500/10 via-background/40 to-primary/10 border-cyan-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Layers className="h-5 w-5 text-cyan-400" /> Sistemas multi-agente (Mixture of Agents)</CardTitle>
          <CardDescription className="leading-relaxed">
            Aurora orquesta varias inteligencias a la vez (integrado con <strong>Hermes</strong> + <strong>Astraura</strong>).
            Por defecto, <strong>selecciona inteligentemente</strong> —por cada solicitud y contexto— qué IA, skills, memorias
            y conexiones usar. Empiezas simple y, cuando quieras, activas combinaciones más potentes. El motor es de
            <strong> código abierto</strong>, elegible del catálogo.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Auto-select */}
      <Card className="bg-background/40 backdrop-blur-sm">
        <CardContent className="pt-6 flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Selección inteligente por contexto (recomendado)</p>
              <p className="text-[11px] text-muted-foreground">Aurora decide automáticamente la IA, skills, memorias y contexto adecuados para cada solicitud desde cualquier chat.</p>
            </div>
          </div>
          <Switch checked={cfg.autoSelect} onCheckedChange={(v) => update({ autoSelect: v })} />
        </CardContent>
      </Card>

      {/* Modos */}
      <Card className="bg-background/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Bot className="h-4 w-4 text-cyan-400" /> Modo de combinación</CardTitle>
          <CardDescription>Define cómo cooperan los agentes. Por defecto: <strong>Router inteligente</strong>.</CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-2">
          {MODES.map((m) => {
            const active = cfg.mode === m.id;
            const Icon = m.icon;
            return (
              <button key={m.id} onClick={() => { update({ mode: m.id }); toast.success(`Modo: ${m.label}`); }}
                className={`text-left rounded-lg border p-3 transition cursor-pointer ${active ? "border-cyan-400/50 bg-cyan-400/5 ring-1 ring-cyan-400/30" : "border-white/5 bg-black/20 hover:border-cyan-400/30"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="h-4 w-4 text-cyan-300" />
                  <span className="text-sm font-semibold">{m.label}</span>
                  {active && <Badge className="bg-cyan-500/20 text-cyan-200 border-cyan-400/30 text-[9px]">Activo</Badge>}
                </div>
                <p className="text-[11px] text-muted-foreground">{m.desc}</p>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {/* Parámetros MoA */}
      {cfg.mode === "moa" && (
        <Card className="bg-background/40 backdrop-blur-sm">
          <CardHeader><CardTitle className="text-base">Capas de proponentes</CardTitle>
            <CardDescription>Más capas = más deliberación entre agentes antes de agregar la respuesta.</CardDescription></CardHeader>
          <CardContent className="max-w-xs">
            <Select value={String(cfg.layers)} onValueChange={(v) => update({ layers: Number(v) })}>
              <SelectTrigger className="bg-background/60 border-white/10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>{n} capa{n > 1 ? "s" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* Motor OSS del catálogo */}
      <Card className="bg-background/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-emerald-400" /> Motor multi-agente</CardTitle>
          <CardDescription>
            {engine ? <>Seleccionado: <strong>{engine.name}</strong> · {engine.license}</> : "Elige un motor del catálogo de código abierto."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OssLibraryBrowser category="moa" onAdd={(o) => { update({ engineId: o.id }); toast.success(`Motor: ${o.name}`); }} addedIds={cfg.engineId ? [cfg.engineId] : []} />
        </CardContent>
      </Card>

      {/* Footer */}
      <Card className="bg-background/20 border-white/5">
        <CardContent className="pt-6 text-xs text-muted-foreground space-y-2">
          <p className="flex items-start gap-2"><Layers className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>Esta configuración es el <strong>predeterminado</strong> de Aurora y de cada <strong>cerebro</strong>; cada cerebro puede sobrescribirla con su propia combinación, memorias y canales.</span></p>
          <p className="flex items-start gap-2"><Bot className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>Los motores y modelos provienen de la <strong>Librería de Código Abierto</strong>, que se actualiza con nuevas fuentes y mantiene el catálogo al día en todos los paneles.</span></p>
        </CardContent>
      </Card>
    </div>
  );
}
