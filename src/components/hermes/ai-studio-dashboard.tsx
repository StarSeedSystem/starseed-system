// src/components/hermes/ai-studio-dashboard.tsx
'use client';

/**
 * Astraura AI Dashboard — gráficas dinámicas del ecosistema IA del usuario:
 *   - Uso por proveedor (donut)
 *   - Skills/agentes/tools/MCPs (barras)
 *   - Latencia y tasa de éxito de batch jobs
 *   - Disponibilidad y prioridad de capacidades
 *   - Memoria (nodos del cerebro × tipo)
 *
 * Junto a las gráficas, la IA aparece como guía: detecta huecos en la
 * configuración del usuario y sugiere mejoras concretas con un click.
 */

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Database, Wrench, Bot, Sparkles, Cpu, Server, Activity, AlertCircle, ChevronRight,
} from 'lucide-react';
import { getSkillStack } from '@/hermes-integration/skill-stack';
import { getBatchProcessor } from '@/hermes-integration/batch-processing';
import { detectCapabilities, loadPriority, type ProviderKey } from '@/hermes-integration/connection-priority';
import { getLivingGraphStore } from '@/hermes-integration/living-graph-store';

export function AiStudioDashboard() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const s1 = getSkillStack().subscribe(() => setTick((t) => t + 1));
    const s2 = getBatchProcessor().subscribe(() => setTick((t) => t + 1));
    return () => { s1(); s2(); };
  }, []);

  const skillStats = getSkillStack().stats();
  const batchStats = getBatchProcessor().stats();
  const capabilities = detectCapabilities();
  const priority = loadPriority();
  const graph = getLivingGraphStore();

  const availableProviders = capabilities.filter((c) => c.available).length;
  const totalProviders = capabilities.length;
  const nodesByKind: Record<string, number> = {};
  graph.getNodes().forEach((n) => {
    nodesByKind[n.kind] = (nodesByKind[n.kind] ?? 0) + 1;
  });

  // ── AI guide: sugerencias inteligentes ─────────────────────────────────
  const suggestions: { severity: 'info' | 'warn' | 'critical'; msg: string; action?: { label: string; href: string } }[] = [];
  if (availableProviders === 0) {
    suggestions.push({
      severity: 'critical',
      msg: 'No tienes ningún proveedor de IA configurado. Por defecto recomiendo instalar Ollama localmente (gratis y sin enviar datos a la nube).',
      action: { label: 'Configurar proveedor', href: '/settings?tab=ai' },
    });
  }
  if (skillStats.enabled < skillStats.total / 2) {
    suggestions.push({
      severity: 'warn',
      msg: `Solo tienes ${skillStats.enabled} skills activas de ${skillStats.total}. Revisa el stack para habilitar las más útiles.`,
      action: { label: 'Revisar skills', href: '/agent?tab=skills' },
    });
  }
  if (nodesByKind.mcp === undefined || nodesByKind.mcp === 0) {
    suggestions.push({
      severity: 'info',
      msg: 'Conecta al menos un MCP para que tu agente acceda a herramientas externas (memoria persistente, fediverso, etc.).',
      action: { label: 'Configurar MCPs', href: '/agent?tab=mcp' },
    });
  }
  if (!suggestions.length) {
    suggestions.push({ severity: 'info', msg: 'Tu ecosistema IA está en buen estado. Considera generar un batch job para reindexar tu memoria periódicamente.' });
  }

  return (
    <div className="space-y-4">
      {/* Sugerencias guiadas por la IA */}
      <Card className="liquid-glass-panel border-purple-500/20 bg-purple-500/[0.03]">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-purple-300">
              Guía IA — sugerencias para tu sistema
            </h3>
          </div>
          <div className="space-y-1.5">
            {suggestions.map((s, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-2 text-xs py-1.5 px-2 rounded border',
                  s.severity === 'critical' && 'border-red-500/30 bg-red-500/[0.06] text-red-200',
                  s.severity === 'warn'     && 'border-amber-500/30 bg-amber-500/[0.06] text-amber-200',
                  s.severity === 'info'     && 'border-cyan-500/20 bg-cyan-500/[0.04] text-cyan-100'
                )}
              >
                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                <span className="flex-1">{s.msg}</span>
                {s.action && (
                  <Button asChild variant="ghost" size="sm" className="h-6 text-[10px] shrink-0">
                    <a href={s.action.href}>{s.action.label} <ChevronRight className="w-3 h-3 ml-1" /></a>
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <KpiCard icon={Cpu}      label="Proveedores"  value={`${availableProviders}/${totalProviders}`} color="text-emerald-400" />
        <KpiCard icon={Sparkles} label="Skills"       value={`${skillStats.enabled}/${skillStats.total}`} color="text-purple-400" />
        <KpiCard icon={Database} label="Memoria"       value={graph.getNodes().length} color="text-cyan-400" />
        <KpiCard icon={Wrench}   label="Conexiones"    value={graph.getEdges().length} color="text-amber-400" />
        <KpiCard icon={Server}   label="Batch jobs"    value={batchStats.total} color="text-pink-400" />
        <KpiCard icon={Activity} label="Invocaciones"  value={skillStats.totalInvocations} color="text-indigo-400" />
      </div>

      {/* Gráficas */}
      <div className="grid lg:grid-cols-2 gap-3">
        <DonutChart
          title="Skills por origen"
          segments={Object.entries(skillStats.byOrigin).map(([k, v]) => ({
            label: k,
            value: v,
            color: ORIGIN_COLORS[k] ?? '#94a3b8',
          }))}
        />
        <BarsChart
          title="Cerebro por tipo de nodo"
          bars={Object.entries(nodesByKind).map(([k, v]) => ({
            label: k,
            value: v,
            color: KIND_COLORS[k] ?? '#38bdf8',
          }))}
        />
        <ProviderPriorityChart priority={priority} capabilities={capabilities} />
        <BatchJobsChart />
      </div>
    </div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────

const ORIGIN_COLORS: Record<string, string> = {
  hermes: '#a78bfa', openhuman: '#38bdf8', openclaw: '#39FF14',
  starseed: '#fbbf24', user: '#f472b6', external: '#fb923c',
};

const KIND_COLORS: Record<string, string> = {
  self: '#fbbf24', memory: '#38bdf8', sense: '#fb7185',
  skill: '#a78bfa', tool: '#39FF14', agent: '#FFBF00',
  mcp: '#34d399', provider: '#f472b6', discovery: '#fbbf24',
  conversation: '#818cf8',
};

function KpiCard({ icon: Icon, label, value, color }: { icon: React.ComponentType<any>; label: string; value: any; color: string }) {
  return (
    <Card className="bg-black/20 border-white/5">
      <CardContent className="p-3 flex items-center gap-2">
        <Icon className={cn('w-4 h-4 shrink-0', color)} />
        <div className="min-w-0">
          <div className={cn('text-base font-bold font-mono', color)}>{value}</div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider truncate">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function DonutChart({ title, segments }: { title: string; segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  let cum = 0;
  const radius = 60;
  const c = 2 * Math.PI * radius;
  return (
    <Card className="liquid-glass-panel border-white/10">
      <CardContent className="p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">{title}</h4>
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 160 160" className="w-32 h-32 shrink-0">
            <circle cx={80} cy={80} r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={18} />
            {segments.map((s, i) => {
              const frac = s.value / total;
              const len = frac * c;
              const offset = cum * c;
              cum += frac;
              return (
                <circle
                  key={i}
                  cx={80} cy={80} r={radius}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={18}
                  strokeDasharray={`${len} ${c - len}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 80 80)"
                />
              );
            })}
            <text x={80} y={80} textAnchor="middle" dy="0.35em" fill="rgba(255,255,255,0.85)" fontSize="22" fontWeight="700">{total}</text>
          </svg>
          <div className="flex-1 space-y-1 min-w-0">
            {segments.map((s) => (
              <div key={s.label} className="flex items-center gap-1.5 text-[11px]">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: s.color }} />
                <span className="truncate flex-1">{s.label}</span>
                <span className="text-muted-foreground font-mono">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BarsChart({ title, bars }: { title: string; bars: { label: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <Card className="liquid-glass-panel border-white/10">
      <CardContent className="p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">{title}</h4>
        <div className="space-y-1.5">
          {bars.length === 0 && <p className="text-xs text-muted-foreground italic">Sin datos.</p>}
          {bars.map((b) => (
            <div key={b.label} className="flex items-center gap-2 text-[11px]">
              <span className="w-20 truncate text-muted-foreground capitalize">{b.label}</span>
              <div className="flex-1 h-3 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(b.value / max) * 100}%`, background: b.color }} />
              </div>
              <span className="font-mono text-foreground/80 w-6 text-right">{b.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ProviderPriorityChart({ priority, capabilities }: { priority: ProviderKey[]; capabilities: ReturnType<typeof detectCapabilities> }) {
  return (
    <Card className="liquid-glass-panel border-white/10">
      <CardContent className="p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Prioridad de proveedores (top → bottom)
        </h4>
        <div className="space-y-1">
          {priority.map((key, i) => {
            const cap = capabilities.find((c) => c.key === key);
            if (!cap) return null;
            const tierLabel = {
              'local-free': 'Local gratis',
              'skill-free': 'Skill gratis',
              'byok': 'Tu API key',
              'free-tier': 'Free tier',
              'paid': 'Pago',
            }[cap.tier];
            return (
              <div
                key={key}
                className={cn(
                  'flex items-center gap-2 text-[11px] py-1 px-2 rounded border',
                  cap.available ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-white/10 opacity-60'
                )}
              >
                <span className="text-muted-foreground font-mono w-6">#{i + 1}</span>
                <span className="flex-1 truncate font-semibold">{cap.label}</span>
                <Badge variant="outline" className="text-[9px]">{tierLabel}</Badge>
                <Badge variant="outline" className={cn('text-[9px]', cap.available ? 'border-emerald-500/50 text-emerald-300' : 'border-white/10 text-muted-foreground')}>
                  {cap.available ? 'ok' : 'no'}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function BatchJobsChart() {
  const jobs = getBatchProcessor().all().slice(0, 8);
  return (
    <Card className="liquid-glass-panel border-white/10">
      <CardContent className="p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Batch jobs recientes
        </h4>
        {jobs.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No hay batch jobs todavía. Crea uno desde la pestaña Batch.</p>
        ) : (
          <div className="space-y-1.5">
            {jobs.map((j) => (
              <div key={j.id} className="flex items-center gap-2 text-[11px] py-1 px-2 rounded border border-white/10 bg-white/[0.02]">
                <Badge variant="outline" className="text-[9px] shrink-0">{j.status}</Badge>
                <span className="flex-1 truncate font-semibold">{j.label}</span>
                <span className="text-muted-foreground">{j.stats.success}/{j.requests.length}</span>
                <span className="font-mono text-foreground/70">{j.stats.avgMs}ms</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
