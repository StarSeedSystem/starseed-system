"use client";

/**
 * IntegrationSourcesPanel — FUENTES E INTEGRACIONES RECOMENDADAS (Adenda 110).
 * ============================================================================
 * Muestra, por cada servicio de TODOS los sistemas del OS (IA, voz, red, datos,
 * identidad, gobernanza, medios), la MEJOR opción open-source/gratuita vetada y
 * sus alternativas, con licencia (clasificada), tipo de acceso, madurez, nota de
 * seguridad, enlace y por qué es relevante. Filtros: solo licencias integrables ·
 * preferir local. Investigado con subagentes (estado 2026), curado a mano.
 * SSR-safe y defensivo.
 */

import { useMemo, useState } from "react";
import {
  Blocks, ExternalLink, ShieldCheck, Check, Search, ChevronDown, Sparkles, Info, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  OS_SYSTEMS, REGISTRY_REVIEWED, INTEGRATIONS, type Integration, type LicenseClass, type IntegrationAccess,
} from "@/lib/integrations/integration-registry";
import {
  recommendBySystem, summarizeRegistry, type IntegrationPrefs, type CategoryPick,
} from "@/lib/integrations/integration-recommend";

const LICENSE_META: Record<LicenseClass, { label: string; cls: string }> = {
  permissive: { label: "permisiva", cls: "text-emerald-300 bg-emerald-500/15 border-emerald-400/30" },
  "public-domain": { label: "dominio público", cls: "text-emerald-300 bg-emerald-500/15 border-emerald-400/30" },
  copyleft: { label: "copyleft", cls: "text-amber-300 bg-amber-500/15 border-amber-400/30" },
  "network-copyleft": { label: "AGPL (red)", cls: "text-orange-300 bg-orange-500/15 border-orange-400/30" },
  "non-commercial": { label: "no comercial", cls: "text-rose-300 bg-rose-500/15 border-rose-400/30" },
  "proprietary-free": { label: "gratis (propietaria)", cls: "text-sky-300 bg-sky-500/15 border-sky-400/30" },
  "open-data": { label: "datos abiertos", cls: "text-cyan-300 bg-cyan-500/15 border-cyan-400/30" },
};

const ACCESS_META: Record<IntegrationAccess, { label: string; cls: string }> = {
  local: { label: "local", cls: "text-violet-300 bg-violet-500/15" },
  browser: { label: "navegador", cls: "text-violet-300 bg-violet-500/15" },
  "self-host": { label: "auto-hospedable", cls: "text-cyan-300 bg-cyan-500/15" },
  "free-api": { label: "API gratis", cls: "text-sky-300 bg-sky-500/15" },
  library: { label: "librería", cls: "text-slate-300 bg-slate-500/15" },
  protocol: { label: "protocolo", cls: "text-fuchsia-300 bg-fuchsia-500/15" },
  mcp: { label: "MCP", cls: "text-amber-300 bg-amber-500/15" },
};

function Badges({ i }: { i: Integration }) {
  const lm = LICENSE_META[i.licenseClass];
  const am = ACCESS_META[i.access];
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px] font-medium", lm.cls)} title={i.license}>{lm.label}</span>
      <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-medium", am.cls)}>{am.label}</span>
      <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-white/50">{i.maturity === "large" ? "consolidado" : i.maturity === "active" ? "activo" : "nicho"}</span>
      {i.usedInStarSeed && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-300"><Check className="h-2.5 w-2.5" /> en StarSeed</span>
      )}
    </span>
  );
}

function OptionRow({ i, pick = false }: { i: Integration; pick?: boolean }) {
  return (
    <div className={cn("rounded-xl border px-3 py-2.5", pick ? "border-cyan-400/30 bg-cyan-500/[0.06]" : "border-white/10 bg-white/[0.03]")}>
      <div className="flex flex-wrap items-center gap-2">
        <a href={i.url} target="_blank" rel="noopener noreferrer" className="inline-flex cursor-pointer items-center gap-1 text-[12px] font-semibold text-white/90 hover:text-cyan-200">
          {i.name} <ExternalLink className="h-3 w-3 text-white/40" />
        </a>
        {pick && <span className="rounded-full bg-cyan-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan-100">Recomendado</span>}
        <span className="ml-auto" />
        <Badges i={i} />
      </div>
      <p className="mt-1 text-[11px] leading-snug text-white/70">{i.purpose}</p>
      <p className="mt-0.5 text-[10px] leading-snug text-white/45">{i.why} · <span className="text-white/35">{i.security}</span></p>
      {i.caveat && (
        <p className="mt-1 flex items-start gap-1 rounded-lg border border-amber-400/20 bg-amber-500/[0.06] px-2 py-1 text-[10px] leading-snug text-amber-100/80">
          <Info className="mt-0.5 h-3 w-3 shrink-0" /> {i.caveat}
        </p>
      )}
    </div>
  );
}

function CategoryBlock({ p }: { p: CategoryPick }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-1">
        <p className="text-[12px] font-semibold text-white/90">{p.category.label}</p>
        <p className="text-[10px] text-white/40">{p.category.serves}</p>
      </div>
      <OptionRow i={p.pick} pick />
      {p.note && <p className="mt-1 px-0.5 text-[10px] leading-snug text-white/45">{p.note}</p>}
      {p.alternatives.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-1.5 inline-flex cursor-pointer items-center gap-1 text-[10px] text-white/45 transition-colors hover:text-white/75"
          >
            <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} /> {open ? "Ocultar alternativas" : `Alternativas (${p.alternatives.length})`}
          </button>
          {open && <div className="mt-1.5 space-y-1.5">{p.alternatives.map((a) => <OptionRow key={a.id} i={a} />)}</div>}
        </>
      )}
    </div>
  );
}

export function IntegrationSourcesPanel({ embedded = false }: { embedded?: boolean }) {
  const [preferPermissive, setPreferPermissive] = useState(false);
  const [preferLocal, setPreferLocal] = useState(false);
  const [q, setQ] = useState("");
  const summary = useMemo(() => summarizeRegistry(), []);

  const query = q.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!query) return [];
    return INTEGRATIONS.filter((i) =>
      i.name.toLowerCase().includes(query) || i.purpose.toLowerCase().includes(query) ||
      i.why.toLowerCase().includes(query) || i.license.toLowerCase().includes(query) || i.category.includes(query),
    ).slice(0, 40);
  }, [query]);

  const bySystem = useMemo(
    () => OS_SYSTEMS.map((s) => ({ system: s, picks: recommendBySystem(s.id, { preferPermissive, preferLocal } as IntegrationPrefs) })),
    [preferPermissive, preferLocal],
  );

  const body = (
    <div className="space-y-3">
      {/* Resumen + filtros */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-500/[0.07] to-transparent p-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/70">
          <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1"><b className="text-white/90">{summary.total}</b> opciones vetadas</span>
          <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1"><b className="text-white/90">{summary.categories}</b> servicios · {summary.systems} sistemas</span>
          <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1"><b className="text-emerald-300">{Math.round(summary.permissiveShare * 100)}%</b> licencia integrable</span>
          <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1"><b className="text-cyan-300">{summary.usedInStarSeed}</b> ya en StarSeed</span>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-white/40"><RefreshCw className="h-3 w-3" /> revisado {REGISTRY_REVIEWED}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPreferPermissive((v) => !v)}
            className={cn("cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors", preferPermissive ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100" : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/25")}
          >
            <ShieldCheck className="mr-1 inline h-3 w-3" /> Solo licencias integrables
          </button>
          <button
            type="button"
            onClick={() => setPreferLocal((v) => !v)}
            className={cn("cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors", preferLocal ? "border-violet-400/40 bg-violet-500/15 text-violet-100" : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/25")}
          >
            <Sparkles className="mr-1 inline h-3 w-3" /> Preferir local / on-device
          </button>
          <div className="relative ml-auto min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar programa o servicio…"
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-1.5 pl-7 pr-2 text-[11px] text-white/85 outline-none placeholder:text-white/35 focus:border-cyan-400/40"
            />
          </div>
        </div>
      </div>

      {query ? (
        <div className="space-y-1.5">
          <p className="px-0.5 text-[11px] text-white/50">{searchResults.length} resultados para «{q}»</p>
          {searchResults.map((i) => <OptionRow key={i.id} i={i} />)}
          {!searchResults.length && <p className="px-0.5 text-[11px] text-white/40">Sin coincidencias. Prueba otro término.</p>}
        </div>
      ) : (
        bySystem.map(({ system, picks }) => (
          <div key={system.id} className="space-y-2">
            <div>
              <h3 className="flex items-center gap-2 text-[13px] font-bold text-white/90"><Blocks className="h-4 w-4 text-fuchsia-300" /> {system.label}</h3>
              <p className="text-[10px] text-white/45">{system.hint}</p>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {picks.map((p) => <CategoryBlock key={p.category.id} p={p} />)}
            </div>
          </div>
        ))
      )}

      <p className="px-0.5 text-[10px] leading-snug text-white/35">
        Selección curada de fuentes open-source y servicios gratuitos, vetados por licencia, madurez y seguridad. Las
        licencias AGPL/no-comerciales se integran como servicio federado aparte, no dentro del código del OS. Se refresca
        re-ejecutando la investigación multi-agente.
      </p>
    </div>
  );

  if (embedded) return body;

  return (
    <Card className="border-white/10 bg-black/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Blocks className="h-4 w-4 text-fuchsia-300" /> Integraciones y fuentes recomendadas
        </CardTitle>
        <CardDescription>
          Las mejores opciones open-source/gratuitas para cada servicio del OS, con su licencia, acceso y por qué —
          sugeridas automáticamente y filtrables por soberanía de licencia o ejecución local.
        </CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

export default IntegrationSourcesPanel;
