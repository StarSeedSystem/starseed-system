"use client";

/**
 * CerebroHub — el Cerebro como 3 PILARES interconectados:
 *
 *   1. MEMORIA      → ficheros .md + sus fuentes/servidores (entradas/salidas).
 *   2. HABILIDADES  → programa de soul.md/dream.md: skills, plugins, claves,
 *                     permisos, agentes (ability_links atados al cerebro).
 *   3. CONTEXTO     → sentidos de Aurora, configurables por proveedor (incl.
 *                     Sakana Fugu) + modo "emociones".
 *
 * Las TRES interconexiones administran las fuentes/configs de cada sistema y se
 * enlazan por el cerebro seleccionado: la Memoria escribe el "programa", las
 * Habilidades lo ejecutan, y el Contexto alimenta a la IA con percepción real.
 *
 * Todo Supabase-backed + realtime + estados vacíos en español. Reutiliza el
 * sistema de cerebros existente (brains) sin romper /cerebros.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { listBrains, saveBrain, type Brain } from "@/lib/brains/brains";
import { useRealtimeRows } from "@/lib/realtime/realtime";
import MemoriaPanel from "@/components/cerebro/memoria-panel";
import HabilidadesPanel from "@/components/cerebro/habilidades-panel";
import ContextoPanel from "@/components/cerebro/contexto-panel";
import EgoBrainPanel from "@/components/aurora/ego-brain-panel";
import {
  Brain as BrainIcon,
  FileText,
  Wand2,
  Sparkles,
  Plus,
  Loader2,
  ChevronRight,
  ExternalLink,
  Network,
} from "lucide-react";

type Pillar = "memoria" | "habilidades" | "contexto" | "egos";

const PILLARS: {
  id: Pillar;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  blurb: string;
  accent: string;
}[] = [
  {
    id: "memoria",
    label: "Memoria",
    icon: FileText,
    blurb: "Archivos .md y sus fuentes/servidores: dónde se guardan y sincronizan.",
    accent: "cyan",
  },
  {
    id: "habilidades",
    label: "Habilidades",
    icon: Wand2,
    blurb: "El programa de soul.md: skills, plugins, claves, permisos y agentes.",
    accent: "violet",
  },
  {
    id: "contexto",
    label: "Contexto",
    icon: Sparkles,
    blurb: "Los sentidos de Aurora: proveedor por sentido, externos y emociones.",
    accent: "amber",
  },
  {
    id: "egos",
    label: "Egos de Aurora",
    icon: Sparkles,
    blurb: "Agentes ego.md: conecta identidades portables de Aurora a este cerebro.",
    accent: "fuchsia",
  },
];

export default function CerebroHub() {
  const { rows: brains, loading, reload } = useRealtimeRows<Brain>(
    "brains",
    () => listBrains(),
    { idKey: "id" },
  );

  const [activeBrainId, setActiveBrainId] = useState<string | null>(null);
  const [pillar, setPillar] = useState<Pillar>("memoria");
  const [creating, setCreating] = useState(false);

  // Selecciona el primer cerebro al cargar.
  useEffect(() => {
    if (!activeBrainId && brains.length) setActiveBrainId(brains[0].id);
  }, [brains, activeBrainId]);

  const activeBrain = brains.find((b) => b.id === activeBrainId) ?? null;

  const onCreateBrain = async () => {
    setCreating(true);
    const b = await saveBrain({
      name: "Mi Cerebro",
      scope: "account",
      description:
        "Cerebro personal: memoria (.md), habilidades (soul.md) y contexto (sentidos de Aurora).",
      config: { pillar3: true },
    });
    setCreating(false);
    if (b) {
      await reload();
      setActiveBrainId(b.id);
      toast.success("Cerebro creado. Empieza por su Memoria.");
    } else {
      toast.error("No se pudo crear el cerebro. ¿Has iniciado sesión?");
    }
  };

  return (
    <div className="space-y-5">
      {/* ── Selector de cerebro ─────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <BrainIcon className="w-5 h-5 text-cyan-300" />
          <h2 className="text-lg font-semibold text-cyan-50">Cerebro</h2>
          <span className="text-sm text-white/45">— Memoria · Habilidades · Contexto</span>
          <span className="ml-auto flex items-center gap-3">
            <a
              href="/cerebro/mapa"
              className="inline-flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200 hover:underline"
            >
              <Network className="w-3 h-3" /> Mapa mental 3D
            </a>
            <a
              href="/cerebros"
              className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200 hover:underline"
            >
              <ExternalLink className="w-3 h-3" /> Gestión avanzada de cerebros
            </a>
          </span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-white/50 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando cerebros…
          </div>
        ) : brains.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-white/15 p-6 text-center">
            <BrainIcon className="w-8 h-8 text-white/25 mx-auto mb-2" />
            <p className="text-sm text-white/55">
              Aún no tienes ningún cerebro. Crea el primero para empezar.
            </p>
            <Button className="mt-3 gap-1.5" disabled={creating} onClick={onCreateBrain}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Crear mi primer cerebro
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {brains.map((b) => (
              <button
                key={b.id}
                onClick={() => setActiveBrainId(b.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                  b.id === activeBrainId
                    ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-100"
                    : "border-white/10 text-white/70 hover:bg-white/5",
                )}
              >
                <BrainIcon className="w-3.5 h-3.5" />
                {b.name}
              </button>
            ))}
            <Button size="sm" variant="outline" className="gap-1.5" disabled={creating} onClick={onCreateBrain}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Nuevo
            </Button>
          </div>
        )}
      </div>

      {/* ── Pilares (3 interconexiones) ─────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PILLARS.map((p) => {
          const Icon = p.icon;
          const active = pillar === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPillar(p.id)}
              className={cn(
                "group rounded-xl border p-4 text-left transition-all",
                active
                  ? "border-white/25 bg-white/[0.06]"
                  : "border-white/10 bg-black/20 hover:bg-white/[0.03]",
              )}
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "rounded-lg p-2",
                    p.accent === "cyan" && "bg-cyan-500/15 text-cyan-300",
                    p.accent === "violet" && "bg-violet-500/15 text-violet-300",
                    p.accent === "amber" && "bg-amber-500/15 text-amber-300",
                    p.accent === "fuchsia" && "bg-fuchsia-500/15 text-fuchsia-300",
                  )}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className="font-semibold text-white/90">{p.label}</span>
                <ChevronRight
                  className={cn(
                    "ml-auto w-4 h-4 transition-transform",
                    active ? "text-white/60 translate-x-0.5" : "text-white/25",
                  )}
                />
              </div>
              <p className="mt-2 text-xs text-white/50">{p.blurb}</p>
            </button>
          );
        })}
      </div>

      {/* Mapa de interconexión */}
      <div className="rounded-xl border border-white/10 bg-gradient-to-br from-cyan-500/[0.04] via-violet-500/[0.04] to-amber-500/[0.04] p-3">
        <p className="text-[11px] text-white/45 text-center">
          <span className="text-cyan-300">Memoria</span> escribe el programa →{" "}
          <span className="text-violet-300">Habilidades</span> lo ejecutan →{" "}
          <span className="text-amber-300">Contexto</span> aporta percepción real. Las tres se enlazan por el cerebro
          seleccionado.
        </p>
      </div>

      {/* ── Panel del pilar activo ──────────────────────────── */}
      {brains.length > 0 && (
        <div className="pt-1">
          {pillar === "memoria" && <MemoriaPanel brainId={activeBrainId} />}
          {pillar === "habilidades" && (
            <HabilidadesPanel brainId={activeBrainId} brainName={activeBrain?.name} />
          )}
          {pillar === "contexto" && <ContextoPanel />}
          {pillar === "egos" && (
            <EgoBrainPanel brainId={activeBrainId} brainName={activeBrain?.name} />
          )}
        </div>
      )}
    </div>
  );
}
