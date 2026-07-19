"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA · PANEL GRÁFICO DE USO — pestaña «Nexus» (Adenda 76 · G1)
 * ---------------------------------------------------------------------------
 * Muestra, de forma gráfica y por perfil de la cuenta, el uso REAL de cada
 * parte del sistema Astraura: modelos/proveedores (peticiones, tokens, límites
 * gratis y reinicio de cuota), personalidades, memoria, habilidades, conexiones
 * y almacenamiento (local con su cuota + nube).
 *
 * NO inventa datos: lo que aún no se registra se muestra como «sin datos aún»
 * con una nota de cómo se llenará. Todas las gráficas son SVG/CSS puro con la
 * estética Crystal Liquid Glass (mismos primitivos que AiStudioDashboard).
 *
 * `UsageSummaryMini` es la versión compacta reutilizable para el orbe.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Cpu, Sparkles, Database, Wrench, Server, Activity, Brain, HardDrive, Cloud,
  Timer, AlertCircle, Gauge, Layers, ChevronRight, Bot, User as UserIcon,
} from "lucide-react";
import { AiStudioDashboard } from "@/components/hermes/ai-studio-dashboard";
import { USAGE_EVENT } from "@/ai/astraura/usage";
import {
  providerUsageRows, coolingRows, nextDailyResetUTC, modelUsageFromRoutes,
  personalitySummaries, ecosystemCounts, brainsSummary, localStorageEstimate,
  cloudBackendsSummary, usageSnapshot,
  type ProviderUsageRow, type ModelUsageRow, type PersonalitySummary,
  type EcosystemCounts, type BrainSummary, type LocalStorageEstimate,
  type CloudBackendSummary, type UsageSnapshot,
} from "@/lib/aurora/usage-stats";
import { useActiveProfile } from "@/lib/profiles/profiles";

const KIND_COLORS: Record<string, string> = {
  self: "#fbbf24", memory: "#38bdf8", sense: "#fb7185", skill: "#a78bfa",
  tool: "#39FF14", agent: "#FFBF00", mcp: "#34d399", provider: "#f472b6",
  discovery: "#fbbf24", conversation: "#818cf8",
};
const PALETTE = ["#22d3ee", "#a78bfa", "#f472b6", "#fbbf24", "#34d399", "#60a5fa", "#fb923c", "#f87171"];

/* ═══════════════════════════ PANEL COMPLETO ═══════════════════════════ */

export function AstrauraUsagePanel() {
  const tick = useLiveTick();
  const { profile, profiles, setActive } = useActiveProfile();

  // Instantáneas sincrónicas (localStorage) — se recalculan con cada tick.
  const providers = useMemo(() => providerUsageRows(), [tick]);
  const cooling = useMemo(() => coolingRows(), [tick]);
  const models = useMemo(() => modelUsageFromRoutes(), [tick]);
  const personalities = useMemo(() => personalitySummaries(), [tick]);
  const eco = useMemo<EcosystemCounts>(() => ecosystemCounts(), [tick]);
  const resetAt = useMemo(() => nextDailyResetUTC(), [tick]);

  // Datos asíncronos (cerebros, almacenes, cuota local).
  const [brains, setBrains] = useState<BrainSummary[] | null>(null);
  const [backends, setBackends] = useState<CloudBackendSummary[] | null>(null);
  const [local, setLocal] = useState<LocalStorageEstimate | null>(null);
  useEffect(() => {
    let alive = true;
    void brainsSummary().then((b) => alive && setBrains(b));
    void cloudBackendsSummary().then((b) => alive && setBackends(b));
    void localStorageEstimate().then((l) => alive && setLocal(l));
    return () => { alive = false; };
  }, [tick]);

  const totalRequests = providers.reduce((a, r) => a + r.requests, 0);
  const totalTokens = providers.reduce((a, r) => a + r.inputTokens + r.outputTokens, 0);
  const activeProviders = providers.filter((r) => r.requests > 0).length;

  return (
    <div className="space-y-4">
      {/* Cabecera + selector de perfil */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <Gauge className="h-5 w-5 text-cyan-300" /> Uso del sistema Astraura
          </h2>
          <p className="text-xs text-white/50">
            Consumo real por parte del sistema. Los datos que aún no se registran aparecen como «sin datos aún».
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-white/40">Perfil</span>
          {profiles.length > 0 ? (
            <Select value={profile?.id ?? undefined} onValueChange={(v) => setActive(v)}>
              <SelectTrigger className="h-8 w-[190px] max-w-[52vw] bg-black/30 border-white/10 text-xs">
                <SelectValue placeholder="Perfil activo" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.isDefault ? " · principal" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="outline" className="border-white/10 text-white/50 text-[11px]">Perfil único</Badge>
          )}
        </div>
      </div>

      {/* Nota de atribución honesta */}
      <div className="flex items-start gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] px-3 py-2 text-[11px] text-cyan-100/80">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
        <span>
          El consumo de proveedores y tokens se registra por dispositivo (almacenamiento local seguro). La
          atribución por perfil se irá afinando a medida que uses la cuenta con
          {profile ? ` «${profile.name}»` : " cada perfil"}.
        </span>
      </div>

      {/* KPIs globales */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi icon={Activity} label="Peticiones hoy" value={totalRequests} color="text-cyan-300" />
        <Kpi icon={Cpu} label="Proveedores activos" value={activeProviders} color="text-emerald-300" />
        <Kpi icon={Layers} label="Tokens (reportados)" value={fmt(totalTokens)} color="text-blue-300" />
        <Kpi icon={Sparkles} label="Personalidades" value={personalities.length} color="text-fuchsia-300" />
        <Kpi icon={Database} label="Memoria (nodos)" value={eco.memoryNodes} color="text-sky-300" />
        <Kpi icon={Wrench} label="Habilidades" value={`${eco.skillsEnabled}/${eco.skillsTotal}`} color="text-purple-300" />
      </div>

      {/* Modelos & Proveedores */}
      <SectionCard icon={Cpu} title="Modelos y proveedores" accent="text-emerald-300"
        hint="Peticiones y tokens de hoy, límite gratis y reinicio de cuota.">
        {providers.length === 0 ? (
          <EmptyState
            title="Sin uso registrado hoy"
            detail="Se llenará automáticamente cuando converses con Astraura: cada respuesta anota qué fuente respondió, sus peticiones y tokens." />
        ) : (
          <div className="space-y-2.5">
            {providers.map((p) => <ProviderRow key={p.sourceId} row={p} />)}
          </div>
        )}

        {/* Uso por modelo (del registro de ruteo) */}
        <div className="mt-4">
          <SubTitle>Uso por modelo (ruteo reciente)</SubTitle>
          {models.length === 0 ? (
            <EmptyState title="Sin ruteo aún" detail="El registro de ruteo guarda qué modelo ganó cada turno; aparece aquí tras las primeras conversaciones." compact />
          ) : (
            <Bars bars={models.slice(0, 8).map((m, i) => ({
              label: `${m.model}`, sub: m.provider, value: m.count, color: PALETTE[i % PALETTE.length],
              badge: m.free ? "gratis" : undefined,
            }))} unit="turnos" />
          )}
        </div>

        {/* Reinicio de cuota */}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/50">
              <Timer className="h-3.5 w-3.5" /> Reinicio de cuotas diarias
            </div>
            <p className="mt-1 text-sm font-mono text-cyan-200">{fmtDateTime(resetAt)}</p>
            <p className="text-[11px] text-white/40">Las cuotas gratis diarias se reinician a las 00:00 UTC.</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/50">
              <AlertCircle className="h-3.5 w-3.5" /> Fuentes en enfriamiento
            </div>
            {cooling.length === 0 ? (
              <p className="mt-1 text-[11px] text-white/40">Ninguna fuente agotada ahora mismo.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {cooling.map((c) => (
                  <li key={c.sourceId} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate text-amber-200">{c.label}</span>
                    <span className="shrink-0 font-mono text-white/50">
                      {c.minutesLeft} min · {fmtTime(c.resetAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Personalidades */}
      <SectionCard icon={Sparkles} title="Personalidades" accent="text-fuchsia-300"
        hint="Cuáles existen y en cuántos contextos están asignadas.">
        {personalities.length === 0 ? (
          <EmptyState title="Sin personalidades" detail="Crea personalidades en Estudio Aurora; aparecerán aquí con su nivel de uso." />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {personalities.map((p) => <PersonalityChip key={p.id} p={p} />)}
          </div>
        )}
        {personalities.every((p) => p.assignmentCount === 0) && personalities.length > 0 && (
          <p className="mt-2 text-[11px] text-white/40">
            El conteo de uso por personalidad se llena al asignarlas a un chat, sección o cerebro.
          </p>
        )}
      </SectionCard>

      {/* Cerebros · Memoria · Habilidades · Conexiones */}
      <div className="grid gap-3 lg:grid-cols-2">
        <SectionCard icon={Brain} title="Cerebros" accent="text-fuchsia-300" hint="Núcleos cognitivos y su contenido.">
          {brains === null ? (
            <EmptyState title="Cargando…" detail="Leyendo tus cerebros." compact />
          ) : brains.length === 0 ? (
            <EmptyState title="Sin cerebros" detail="Crea un cerebro en Infraestructura → Cerebros para agrupar memorias, personalidades y conexiones." compact />
          ) : (
            <div className="space-y-1.5">
              {brains.map((b) => (
                <div key={b.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-[11px]">
                  <Brain className="h-3.5 w-3.5 shrink-0 text-fuchsia-300" />
                  <span className="min-w-0 flex-1 truncate font-medium text-white/80">{b.name}</span>
                  <span className="shrink-0 font-mono text-white/45">
                    {b.memories}m · {b.personalities}p · {b.connections}c · {b.servers}s
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard icon={Database} title="Memoria" accent="text-sky-300" hint="Nodos del grafo vivo por tipo.">
          {eco.memoryNodes === 0 ? (
            <EmptyState title="Memoria vacía" detail="Los nodos aparecen al conversar, adjuntar y conectar herramientas." compact />
          ) : (
            <Bars bars={Object.entries(eco.nodesByKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({
              label: k, value: v, color: KIND_COLORS[k] ?? "#38bdf8",
            }))} unit="nodos" />
          )}
        </SectionCard>

        <SectionCard icon={Wrench} title="Habilidades" accent="text-purple-300" hint="Skills por origen e invocaciones.">
          {eco.skillsTotal === 0 ? (
            <EmptyState title="Sin skills" detail="Instala skills desde Habilidades → Skills." compact />
          ) : (
            <>
              <Bars bars={Object.entries(eco.skillsByOrigin).sort((a, b) => b[1] - a[1]).map(([k, v], i) => ({
                label: k, value: v, color: PALETTE[i % PALETTE.length],
              }))} unit="skills" />
              <p className="mt-2 text-[11px] text-white/45">
                {eco.skillsEnabled}/{eco.skillsTotal} activas · {fmt(eco.skillInvocations)} invocaciones totales
              </p>
            </>
          )}
        </SectionCard>

        <SectionCard icon={Wrench} title="Conexiones" accent="text-amber-300" hint="Aristas del grafo y almacenes conectados.">
          <div className="grid grid-cols-2 gap-2">
            <MiniStat icon={Wrench} label="Aristas de grafo" value={eco.memoryEdges} color="text-amber-300" />
            <MiniStat icon={Cloud} label="Almacenes" value={backends?.length ?? "…"} color="text-cyan-300" />
          </div>
          {eco.memoryEdges === 0 && (backends?.length ?? 0) === 0 && (
            <p className="mt-2 text-[11px] text-white/40">Sin conexiones aún — se crean al vincular herramientas, cerebros y almacenes.</p>
          )}
        </SectionCard>
      </div>

      {/* Almacenamiento */}
      <SectionCard icon={HardDrive} title="Almacenamiento" accent="text-cyan-300" hint="Local (cuota del dispositivo) y nube.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-4 rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <Ring percent={local?.percent ?? null} color="#22d3ee" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">Local (dispositivo)</div>
              {local && local.usedBytes != null && local.quotaBytes != null ? (
                <div className="text-[11px] text-white/55">
                  {fmtBytes(local.usedBytes)} de {fmtBytes(local.quotaBytes)}
                  {local.percent != null ? ` · ${local.percent}%` : ""}
                </div>
              ) : (
                <div className="text-[11px] text-white/40">Cuota no disponible en este navegador.</div>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <div className="mb-1.5 text-sm font-semibold text-white">Nube</div>
            {backends === null ? (
              <p className="text-[11px] text-white/40">Cargando almacenes…</p>
            ) : backends.length === 0 ? (
              <p className="text-[11px] text-white/40">Sin almacenes en la nube configurados.</p>
            ) : (
              <div className="space-y-1.5">
                {backends.map((b) => (
                  <div key={b.id} className="text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-white/75">{b.name}</span>
                      <span className="shrink-0 font-mono text-white/45">
                        {b.unlimited ? "ilimitado" : `${Math.round(b.usedMb)}/${b.quotaMb ?? "?"} MB`}
                      </span>
                    </div>
                    {!b.unlimited && b.pct != null && (
                      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full rounded-full bg-cyan-400/70" style={{ width: `${Math.min(100, b.pct)}%` }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Resumen del ecosistema (reutiliza el dashboard existente) */}
      <div>
        <SubTitle>Resumen del ecosistema IA</SubTitle>
        <AiStudioDashboard />
      </div>
    </div>
  );
}

/* ═══════════════════════════ RESUMEN COMPACTO (ORBE) ═══════════════════════════ */

export function UsageSummaryMini({ onNavigate }: { onNavigate?: () => void }) {
  const tick = useLiveTick();
  const snap = useMemo<UsageSnapshot>(() => usageSnapshot(), [tick]);
  return (
    <div className="w-[19rem] max-w-[92vw] rounded-2xl border border-cyan-400/40 bg-gradient-to-b from-cyan-600/20 via-sky-600/10 to-black/85 backdrop-blur-2xl text-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5">
        <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-cyan-200">
          <Gauge className="h-3.5 w-3.5" /> Nexus · uso del sistema
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 p-2.5">
        <MiniStat icon={Activity} label="Peticiones hoy" value={snap.requestsToday} color="text-cyan-300" />
        <MiniStat icon={Cpu} label="Proveedores" value={snap.activeProviders} color="text-emerald-300" />
        <MiniStat icon={Database} label="Memoria" value={snap.memoryNodes} color="text-sky-300" />
        <MiniStat icon={Sparkles} label="Personalidades" value={snap.personalities} color="text-fuchsia-300" />
      </div>
      <div className="px-2.5 pb-2">
        {snap.topModel ? (
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px]">
            <Bot className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
            <span className="min-w-0 flex-1 truncate">
              <span className="text-white/80">{snap.topModel.model}</span>
              <span className="text-white/40"> · {snap.topModel.provider}</span>
            </span>
            <span className="shrink-0 font-mono text-white/45">{snap.topModel.count}×</span>
          </div>
        ) : (
          <p className="px-1 py-1 text-[11px] text-white/40">Sin ruteo aún — habla con Astraura para ver tu uso.</p>
        )}
      </div>
      <div className="border-t border-white/10 p-2">
        <Link
          href="/agent?tab=nexus"
          onClick={onNavigate}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-100 transition hover:bg-cyan-500/25"
        >
          Ver todo el panel <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

/* ═══════════════════════════ PRIMITIVOS ═══════════════════════════ */

/** Refresco vivo: tick al montar, con evento de uso y cada 20 s. */
function useLiveTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const id = window.setInterval(bump, 20_000);
    window.addEventListener(USAGE_EVENT, bump);
    return () => { window.clearInterval(id); window.removeEventListener(USAGE_EVENT, bump); };
  }, []);
  return tick;
}

function Kpi({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; color: string }) {
  return (
    <Card className="bg-black/20 border-white/5">
      <CardContent className="flex items-center gap-2 p-3">
        <Icon className={cn("h-4 w-4 shrink-0", color)} />
        <div className="min-w-0">
          <div className={cn("font-mono text-base font-bold", color)}>{value}</div>
          <div className="truncate text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; color: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5">
      <Icon className={cn("h-4 w-4 shrink-0", color)} />
      <div className="min-w-0">
        <div className={cn("font-mono text-sm font-bold leading-tight", color)}>{value}</div>
        <div className="truncate text-[9px] uppercase tracking-wider text-white/45">{label}</div>
      </div>
    </div>
  );
}

function SectionCard({ icon: Icon, title, accent, hint, children }: {
  icon: React.ComponentType<{ className?: string }>; title: string; accent: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <Card className="liquid-glass-panel border-white/10">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Icon className={cn("h-4 w-4 shrink-0", accent)} />
          <h3 className="text-sm font-bold uppercase tracking-wider text-white/80">{title}</h3>
          {hint && <span className="hidden truncate text-[11px] text-muted-foreground/70 md:inline">— {hint}</span>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{children}</h4>;
}

function EmptyState({ title, detail, compact }: { title: string; detail: string; compact?: boolean }) {
  return (
    <div className={cn("rounded-lg border border-dashed border-white/12 bg-white/[0.02] text-center", compact ? "px-3 py-3" : "px-4 py-6")}>
      <p className="text-sm font-medium text-white/70">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-[11px] text-white/40">{detail}</p>
    </div>
  );
}

function ProviderRow({ row }: { row: ProviderUsageRow }) {
  const tokens = row.inputTokens + row.outputTokens;
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
      <div className="flex items-center gap-2">
        <Cpu className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/85">{row.label}</span>
        {row.coolingMinutes != null && (
          <Badge variant="outline" className="shrink-0 border-amber-500/40 text-[9px] text-amber-200">enfriando {row.coolingMinutes}m</Badge>
        )}
        <span className="shrink-0 font-mono text-[11px] text-white/55">{row.requests} pet.</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[11px]">
        {row.percent != null ? (
          <>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
              <div className={cn("h-full rounded-full", row.percent > 85 ? "bg-red-400/70" : "bg-emerald-400/70")} style={{ width: `${row.percent}%` }} />
            </div>
            <span className="shrink-0 font-mono text-white/45">{row.percent}% límite{row.limit ? ` (${fmt(row.limit)}/día)` : ""}</span>
          </>
        ) : (
          <span className="text-white/40">{row.note ?? "Sin límite diario declarado"}</span>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-white/40">
        <span>{tokens > 0 ? `${fmt(tokens)} tokens` : "tokens no reportados por la fuente"}</span>
        {row.lastModel && <span className="truncate font-mono">último: {row.lastModel}</span>}
      </div>
    </div>
  );
}

function PersonalityChip({ p }: { p: PersonalitySummary }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px]", p.active ? "border-fuchsia-400/40 bg-fuchsia-500/[0.08]" : "border-white/10 bg-white/[0.02]")}>
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-fuchsia-500/15 text-fuchsia-200">
        {p.icon ? <span className="text-xs">{p.icon}</span> : <UserIcon className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-white/80">{p.name}</span>
      {p.active && <Badge variant="outline" className="shrink-0 border-fuchsia-400/50 text-[9px] text-fuchsia-200">activa</Badge>}
      <span className="shrink-0 font-mono text-white/40">{p.assignmentCount > 0 ? `${p.assignmentCount}×` : "—"}</span>
    </div>
  );
}

function Bars({ bars, unit }: { bars: { label: string; sub?: string; value: number; color: string; badge?: string }[]; unit?: string }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="space-y-1.5">
      {bars.length === 0 && <p className="text-xs italic text-muted-foreground">Sin datos.</p>}
      {bars.map((b, i) => (
        <div key={`${b.label}-${i}`} className="flex items-center gap-2 text-[11px]">
          <span className="w-24 shrink-0 truncate capitalize text-white/70" title={b.sub ? `${b.label} · ${b.sub}` : b.label}>{b.label}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full" style={{ width: `${(b.value / max) * 100}%`, background: b.color }} />
          </div>
          {b.badge && <span className="shrink-0 rounded bg-emerald-500/15 px-1 text-[9px] text-emerald-200">{b.badge}</span>}
          <span className="w-10 shrink-0 text-right font-mono text-foreground/80">{b.value}{unit ? "" : ""}</span>
        </div>
      ))}
    </div>
  );
}

function Ring({ percent, color }: { percent: number | null; color: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = percent == null ? 0 : Math.min(100, Math.max(0, percent));
  const len = (pct / 100) * c;
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0">
      <circle cx={32} cy={32} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={7} />
      {percent != null && (
        <circle cx={32} cy={32} r={r} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round"
          strokeDasharray={`${len} ${c - len}`} transform="rotate(-90 32 32)" />
      )}
      <text x={32} y={32} textAnchor="middle" dy="0.35em" fill="rgba(255,255,255,0.85)" fontSize="14" fontWeight="700">
        {percent == null ? "—" : `${pct}%`}
      </text>
    </svg>
  );
}

/* ═══════════════════════════ formato ═══════════════════════════ */

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
function fmtBytes(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)} MB`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(0)} KB`;
  return `${b} B`;
}
function fmtDateTime(ms: number): string {
  try { return new Date(ms).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}
function fmtTime(ms: number): string {
  try { return new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}

export default AstrauraUsagePanel;
