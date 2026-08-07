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

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { listBrains, saveBrain, type Brain } from "@/lib/brains/brains";
import { useRealtimeRows } from "@/lib/realtime/realtime";
import MemoryViews, { type MemoryViewId, type MemoryListSub } from "@/components/cerebro/memory-views";
import HabilidadesPanel from "@/components/cerebro/habilidades-panel";
import ContextoPanel from "@/components/cerebro/contexto-panel";
import NeuronasPanel from "@/components/cerebro/neuronas-panel";
import { PersonalitiesPanel } from "@/components/aurora/personalities-panel";
import {
  icons as lucideIcons,
  Brain as BrainIcon,
  FileText,
  Wand2,
  Sparkles,
  Plus,
  Loader2,
  ChevronRight,
  ExternalLink,
  Network,
  Cpu,
  Share2,
  Send,
  BrainCog,
  type LucideIcon,
} from "lucide-react";
// Adenda 149 · qué personalidades usan el cerebro activo: el dato ya viaja en
// `Brain.includes.personalities` (lo escribe `toggleBrainConnection` en
// personalities-panel) y aquí solo se pinta — cero red, cero cálculo nuevo.
import { listPersonalityProfiles, PERSONALITY_CHANGED_EVENT } from "@/lib/aurora/personalities";
// Adenda 149 · ventana «Configuración/actualización de sistemas de Astraura en
// esta neurona» → pestaña «Cerebro» (memoria por personalidad, local).
import { openAstrauraConfig } from "@/lib/astraura/config-ui";
// Permisos universales (Adenda 63 §5): compartir un cerebro por ámbito y rol,
// con acceso PARCIAL por ramas (memoria / habilidades / contexto / egos).
import { ShareAccessDialog } from "@/components/sharing/share-access-dialog";
// Enviar a… (DESTINOS · Adenda 66 §5): distinto de permisos.
import { ShareToDialog } from "@/components/sharing/share-to-dialog";

type Pillar = "memoria" | "habilidades" | "contexto" | "neuronas" | "egos";

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
    id: "neuronas",
    label: "Neuronas",
    icon: Cpu,
    blurb: "Tus dispositivos como cerebro+servidor: presencia en vivo, permisos y CasaOS.",
    accent: "emerald",
  },
  {
    id: "egos",
    label: "Personalidades de Aurora",
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
  // Compartir el cerebro activo (permisos universales por ramas).
  const [shareOpen, setShareOpen] = useState(false);
  // Enviar el cerebro activo a un destino (publicación/mensaje/entidad/librería/enlace).
  const [sendToOpen, setSendToOpen] = useState(false);
  // Deep-link de la vista de Memoria (?tab=memoria&mview=3d&msub=hub&brain=…).
  const [memView, setMemView] = useState<MemoryViewId>("lista");
  const [memSub, setMemSub] = useState<MemoryListSub>("archivos");

  // Selecciona el primer cerebro al cargar.
  useEffect(() => {
    if (!activeBrainId && brains.length) setActiveBrainId(brains[0].id);
  }, [brains, activeBrainId]);

  // Lee los query params una vez en cliente (preserva enlaces desde /memorias y /memorias-3d).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const tab = p.get("tab");
    if (tab && (["memoria", "habilidades", "contexto", "neuronas", "egos"] as string[]).includes(tab)) setPillar(tab as Pillar);
    const mv = p.get("mview");
    if (mv && (["lista", "2d", "3d", "fuentes"] as string[]).includes(mv)) setMemView(mv as MemoryViewId);
    const ms = p.get("msub");
    if (ms && (["archivos", "hub"] as string[]).includes(ms)) setMemSub(ms as MemoryListSub);
    const b = p.get("brain");
    if (b) setActiveBrainId(b);
  }, []);

  // Actualiza los query params al cambiar de sub-vista de Memoria (sin recargar).
  const onMemViewChange = useCallback((view: MemoryViewId, sub: MemoryListSub) => {
    setMemView(view);
    setMemSub(sub);
    if (typeof window === "undefined") return;
    try {
      const p = new URLSearchParams(window.location.search);
      p.set("tab", "memoria");
      p.set("mview", view);
      p.set("msub", sub);
      window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}`);
    } catch {
      /* noop */
    }
  }, []);

  const activeBrain = brains.find((b) => b.id === activeBrainId) ?? null;

  // Adenda 149 · nombres/iconos de las personalidades conectadas al cerebro
  // activo. Los perfiles viven en localStorage (SSR-safe: solo en efecto).
  const [personaIndex, setPersonaIndex] = useState<Record<string, { name: string; icon: string }>>({});
  useEffect(() => {
    const refresh = () => {
      try {
        const map: Record<string, { name: string; icon: string }> = {};
        for (const p of listPersonalityProfiles()) map[p.id] = { name: p.name, icon: p.icon || "Sparkles" };
        setPersonaIndex(map);
      } catch { /* defensivo */ }
    };
    refresh();
    if (typeof window === "undefined") return;
    window.addEventListener(PERSONALITY_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PERSONALITY_CHANGED_EVENT, refresh);
  }, []);

  const brainPersonas = (activeBrain?.includes?.personalities ?? []).map((id) => ({
    id,
    name: personaIndex[id]?.name ?? id,
    icon: personaIndex[id]?.icon ?? "Sparkles",
  }));

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
          <span className="ml-auto flex flex-wrap items-center gap-3">
            {/* Adenda 149 · memoria/cerebro de CADA personalidad de Aurora en
                esta neurona (drawer de sistemas de Astraura → «Cerebro»). */}
            <button
              type="button"
              onClick={() => openAstrauraConfig("cerebro")}
              title="Configura la memoria (cerebro) de cada personalidad de Aurora en esta neurona"
              className="inline-flex cursor-pointer items-center gap-1 text-xs text-fuchsia-300 transition-colors hover:text-fuchsia-200 hover:underline"
            >
              <BrainCog className="w-3 h-3" /> Memoria por personalidad (esta neurona)
            </button>
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
            {activeBrain && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-cyan-500/30 text-cyan-100 cursor-pointer"
                onClick={() => setShareOpen(true)}
                title={`Compartir «${activeBrain.name}» (total o por ramas)`}
              >
                <Share2 className="w-4 h-4" />
                Compartir
              </Button>
            )}
            {activeBrain && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-white/15 text-white/80 cursor-pointer"
                onClick={() => setSendToOpen(true)}
                title={`Enviar «${activeBrain.name}» a un destino (publicación, mensaje, librería…)`}
              >
                <Send className="w-4 h-4" />
                Enviar a…
              </Button>
            )}
          </div>
        )}

        {/* Adenda 149 · qué personalidades de Aurora usan el cerebro activo
            (dato ya cargado en `includes.personalities`: no hay red aquí). */}
        {activeBrain && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-white/45">
              <Sparkles className="w-3 h-3 text-fuchsia-300" />
              Personalidades que usan «{activeBrain.name}»:
            </span>
            {brainPersonas.length === 0 ? (
              <span className="text-[11px] text-white/35">
                ninguna conectada todavía — conéctalas en el pilar «Personalidades de Aurora».
              </span>
            ) : (
              brainPersonas.map((p) => {
                const Ic = (lucideIcons as Record<string, LucideIcon>)[p.icon] ?? Sparkles;
                return (
                  <span
                    key={p.id}
                    title={`«${p.name}» está conectada a este cerebro`}
                    className="inline-flex items-center gap-1 rounded-full border border-fuchsia-400/25 bg-fuchsia-500/10 px-2 py-0.5 text-[11px] text-fuchsia-100"
                  >
                    <Ic className="w-3 h-3" /> {p.name}
                  </span>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ── Pilares (3 interconexiones + Neuronas + Egos) ───── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                    p.accent === "emerald" && "bg-emerald-500/15 text-emerald-300",
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
      {/* Neuronas son de la CUENTA (dispositivos), no requieren cerebro creado. */}
      {(brains.length > 0 || pillar === "neuronas") && (
        <div className="pt-1">
          {pillar === "memoria" && brains.length > 0 && (
            <MemoryViews
              brainId={activeBrainId}
              brainName={activeBrain?.name}
              initialView={memView}
              initialSub={memSub}
              onViewChange={onMemViewChange}
            />
          )}
          {pillar === "habilidades" && brains.length > 0 && (
            <HabilidadesPanel brainId={activeBrainId} brainName={activeBrain?.name} />
          )}
          {pillar === "contexto" && brains.length > 0 && <ContextoPanel />}
          {pillar === "neuronas" && (
            <NeuronasPanel brainId={activeBrainId} brainName={activeBrain?.name} />
          )}
          {pillar === "egos" && brains.length > 0 && (
            <PersonalitiesPanel brainId={activeBrainId} brainName={activeBrain?.name} />
          )}
        </div>
      )}

      {/* ── Compartir cerebro: modelo universal con acceso parcial por ramas ── */}
      {shareOpen && activeBrain && (
        <ShareAccessDialog
          open
          onOpenChange={(o) => !o && setShareOpen(false)}
          resource={{
            type: "brain",
            id: activeBrain.id,
            ownerId: activeBrain.owner,
            title: activeBrain.name,
          }}
          sections={[
            { id: "memoria", label: "Memoria" },
            { id: "habilidades", label: "Habilidades" },
            { id: "contexto", label: "Contexto" },
            { id: "egos", label: "Personalidades de Aurora" },
          ]}
          description="Comparte este cerebro completo o solo algunas de sus ramas. Privado en lo personal, transparente en lo público."
        />
      )}

      {/* ── Enviar cerebro a un destino (Adenda 66 §5) ── */}
      {sendToOpen && activeBrain && (
        <ShareToDialog
          open
          onOpenChange={(o) => !o && setSendToOpen(false)}
          resource={{
            kind: "cerebro",
            id: activeBrain.id,
            name: activeBrain.name,
            route: `/cerebro?brain=${encodeURIComponent(activeBrain.id)}`,
            note: activeBrain.description || undefined,
          }}
        />
      )}
    </div>
  );
}
