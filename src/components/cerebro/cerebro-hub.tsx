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
 *
 * CB1013A (architecture/cerebros-fusion-telepatia.md): pestañas Privados/Públicos,
 * 7 pilares sin texto cortado (+ Conectores y Procesos activos) y, por cerebro,
 * Fusionar, Telepatía y Ajustes.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { listBrains, saveBrain, type Brain, uid } from "@/lib/brains/brains";
import { useRealtimeRows } from "@/lib/realtime/realtime";
import MemoryViews, { type MemoryViewId, type MemoryListSub } from "@/components/cerebro/memory-views";
import HabilidadesPanel from "@/components/cerebro/habilidades-panel";
import ContextoPanel from "@/components/cerebro/contexto-panel";
import NeuronasPanel from "@/components/cerebro/neuronas-panel";
import { PersonalitiesPanel } from "@/components/aurora/personalities-panel";
import ConectoresPanel from "@/components/cerebro/conectores-panel";
import ProcesosPanel from "@/components/cerebro/procesos-panel";
import FusionarDialog from "@/components/cerebro/fusionar-dialog";
import TelepatiaDialog from "@/components/cerebro/telepatia-dialog";
import AjustesCerebroDialog from "@/components/cerebro/ajustes-cerebro-dialog";
import { NuevoCerebroPublico } from "@/components/cerebro/nuevo-cerebro-publico";
import { RejillaPilares, pilarDesdeUrl, type Pilar } from "@/components/cerebro/pilares";
import { SectionTabs } from "@/components/ui/section-tabs";
import {
  AYUDA_PESTANA,
  cerebrosDePestana,
  cuentaPorPestana,
  pestanaDeCerebro,
  pestanaDesdeUrl,
  pestanaInicial,
  type PestanaCerebros,
} from "@/lib/cerebros/pestanas";
import {
  icons as lucideIcons,
  Brain as BrainIcon,
  Sparkles,
  Plus,
  Loader2,
  ExternalLink,
  Network,
  Share2,
  Send,
  BrainCog,
  GitMerge,
  Orbit,
  SlidersHorizontal,
  Lock,
  Globe,
  Users,
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

export default function CerebroHub() {
  const { rows: brains, loading, reload } = useRealtimeRows<Brain>(
    "brains",
    () => listBrains(),
    { idKey: "id" },
  );

  const [activeBrainId, setActiveBrainId] = useState<string | null>(null);
  const [pillar, setPillar] = useState<Pilar>("memoria");
  // CB1013A · pestañas Privados/Públicos (null = aún sin decidir: se decide al cargar).
  const [pestana, setPestana] = useState<PestanaCerebros | null>(null);
  const [nuevoPublico, setNuevoPublico] = useState(false);
  const [fusionOpen, setFusionOpen] = useState(false);
  const [telepatiaOpen, setTelepatiaOpen] = useState(false);
  const [ajustesOpen, setAjustesOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  // Compartir el cerebro activo (permisos universales por ramas).
  const [shareOpen, setShareOpen] = useState(false);
  // Enviar el cerebro activo a un destino (publicación/mensaje/entidad/librería/enlace).
  const [sendToOpen, setSendToOpen] = useState(false);
  // Deep-link de la vista de Memoria (?tab=memoria&mview=3d&msub=hub&brain=…).
   const [memView, setMemView] = useState<MemoryViewId>("lista");
   const [memSub, setMemSub] = useState<MemoryListSub>("archivos");
   const [currentUserId, setCurrentUserId] = useState<string | null>(null);
   useEffect(() => {
     uid().then(setCurrentUserId);
   }, []);

  // Pestaña inicial: la de la URL, la del cerebro pedido o la que tenga cerebros.
  useEffect(() => {
    if (pestana || loading) return;
    const busqueda = typeof window === "undefined" ? "" : window.location.search;
    const cerebroUrl = new URLSearchParams(busqueda).get("brain");
    setPestana(pestanaInicial(brains, pestanaDesdeUrl(busqueda), cerebroUrl));
  }, [brains, loading, pestana]);

  const vista: PestanaCerebros = pestana ?? "privados";
  const cuentas = useMemo(() => cuentaPorPestana(brains), [brains]);
  const visibles = useMemo(() => cerebrosDePestana(brains, vista), [brains, vista]);

  // Selecciona el primer cerebro de la pestaña (y cambia si el activo es de la otra).
  useEffect(() => {
    if (!visibles.length) return;
    if (!activeBrainId || !visibles.some((b) => b.id === activeBrainId)) {
      const pedido = activeBrainId ? brains.find((b) => b.id === activeBrainId) : undefined;
      if (pedido && pestana === null) return; // aún se está decidiendo la pestaña del cerebro pedido
      setActiveBrainId(visibles[0].id);
    }
  }, [visibles, activeBrainId, brains, pestana]);

  const cambiarPestana = useCallback((v: string) => {
    const nueva: PestanaCerebros = v === "publicos" ? "publicos" : "privados";
    setPestana(nueva);
    setNuevoPublico(false);
    if (typeof window === "undefined") return;
    try {
      const p = new URLSearchParams(window.location.search);
      p.set("vista", nueva);
      p.delete("brain");
      window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}`);
    } catch {
      /* noop */
    }
  }, []);

  // Lee los query params una vez en cliente (preserva enlaces desde /memorias y /memorias-3d).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const tab = p.get("tab");
    const pilarUrl = pilarDesdeUrl(tab);
    if (pilarUrl) setPillar(pilarUrl);
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

  const activeBrain = visibles.find((b) => b.id === activeBrainId) ?? null;

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
          <span className="text-sm text-white/45">— {AYUDA_PESTANA[vista]}</span>
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

        {/* CB1013A · pestañas principales: Privados (cuenta y perfiles) y Públicos (grupos, comunidades y páginas). */}
        <div className="mt-3">
          <SectionTabs
            ariaLabel="Cerebros privados o públicos"
            value={vista}
            onValueChange={cambiarPestana}
            items={[
              { value: "privados", label: "Privados", icon: Lock, accent: "cyan", badge: loading ? undefined : cuentas.privados, title: AYUDA_PESTANA.privados },
              { value: "publicos", label: "Públicos", icon: Globe, accent: "emerald", badge: loading ? undefined : cuentas.publicos, title: AYUDA_PESTANA.publicos },
            ]}
          />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-white/50 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando cerebros…
          </div>
        ) : visibles.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-white/15 p-6 text-center">
            <BrainIcon className="w-8 h-8 text-white/25 mx-auto mb-2" />
            <p className="text-sm text-white/55">
              {vista === "privados"
                ? "Aún no tienes ningún cerebro privado. Crea el primero para empezar."
                : "Aún no hay cerebros públicos. Un cerebro público pertenece a un grupo, comunidad o página que gestionas."}
            </p>
            {vista === "privados" ? (
              <Button className="mt-3 gap-1.5" disabled={creating} onClick={onCreateBrain}>
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Crear mi primer cerebro
              </Button>
            ) : nuevoPublico ? (
              <NuevoCerebroPublico
                onCerrar={() => setNuevoPublico(false)}
                onCreado={async (b) => {
                  setNuevoPublico(false);
                  await reload();
                  setActiveBrainId(b.id);
                }}
              />
            ) : (
              <Button className="mt-3 gap-1.5" onClick={() => setNuevoPublico(true)}>
                <Plus className="w-4 h-4" /> Crear un cerebro público
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {visibles.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setActiveBrainId(b.id)}
                  aria-pressed={b.id === activeBrainId}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-left text-sm transition-colors",
                    b.id === activeBrainId
                      ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-100"
                      : "border-white/10 text-white/70 hover:bg-white/5",
                  )}
                 title={currentUserId !== null && b.owner !== currentUserId && b.owner !== null ? "Compartido contigo" : undefined}
                 >
                   {currentUserId !== null && b.owner !== currentUserId && b.owner !== null ? (
                     <>
                       <Users className="w-3.5 h-3.5 shrink-0" />
                       {b.name}
                       <span className="ml-1 text-xs text-white/60">compartido contigo</span>
                     </>
                   ) : (
                     <>
                       {pestanaDeCerebro(b) === "publicos" ? <Globe className="w-3.5 h-3.5 shrink-0" /> : <BrainIcon className="w-3.5 h-3.5 shrink-0" />}
                       {b.name}
                     </>
                   )}
                 </button>
              ))}
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={creating}
                onClick={vista === "privados" ? onCreateBrain : () => setNuevoPublico((v) => !v)}
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Nuevo
              </Button>
            </div>
            {vista === "publicos" && nuevoPublico && (
              <NuevoCerebroPublico
                onCerrar={() => setNuevoPublico(false)}
                onCreado={async (b) => {
                  setNuevoPublico(false);
                  await reload();
                  setActiveBrainId(b.id);
                }}
              />
            )}
            {/* Opciones del cerebro activo: Fusionar y Telepatía (CB1013 §4-§5), Ajustes (§8), Compartir y Enviar. */}
             {activeBrain && (
               <div className="mt-3 flex flex-wrap items-center gap-2">
                 {currentUserId !== null && activeBrain.owner !== currentUserId && activeBrain.owner !== null ? (
                   <>
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
                     <span className="text-xs text-white/60">Solo lectura: es de otra cuenta; escribir sigue siendo de su dueño</span>
                   </>
                 ) : (
                   <>
                     <Button
                       size="sm"
                       variant="outline"
                       className="gap-1.5 border-amber-500/30 text-amber-100 cursor-pointer"
                       onClick={() => setFusionOpen(true)}
                       title={`Fusionar: mezcla en «${activeBrain.name}» las memorias y configuraciones de otros cerebros`}
                     >
                       <GitMerge className="w-4 h-4" />
                       Fusionar
                     </Button>
                     <Button
                       size="sm"
                       variant="outline"
                       className="gap-1.5 border-violet-500/30 text-violet-100 cursor-pointer"
                       onClick={() => setTelepatiaOpen(true)}
                       title={`Telepatía: vincula y sincroniza «${activeBrain.name}» sin mezclarlo (carpetas, configuraciones y accesos)`}
                     >
                       <Orbit className="w-4 h-4" />
                       Telepatía
                     </Button>
                     <Button
                       size="sm"
                       variant="outline"
                       className="gap-1.5 border-white/15 text-white/80 cursor-pointer"
                       onClick={() => setAjustesOpen(true)}
                       title={`Ajustes de «${activeBrain.name}»": medios, seguridad, privacidad, vinculación y sincronización`}
                     >
                       <SlidersHorizontal className="w-4 h-4" />
                       Ajustes
                     </Button>
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
                   </>
                 )}
               </div>
             )}
          </>
        )}

        {/* Adenda 149 · qué personalidades usan el cerebro activo
            (dato ya cargado en `includes.personalities`: no hay red aquí). */}
        {activeBrain && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-white/45">
              <Sparkles className="w-3 h-3 text-fuchsia-300" />
              Personalidades que usan «{activeBrain.name}»:
            </span>
            {brainPersonas.length === 0 ? (
              <span className="text-[11px] text-white/35">
                ninguna conectada todavía — conéctalas en el pilar «Personalidades».
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

      {/* ── Pilares: 7 botones sin texto cortado (CB1013A · contrato §3) ───── */}
      <RejillaPilares activo={pillar} onElegir={setPillar} hayCerebro={Boolean(activeBrain)} />

      {/* Mapa de interconexión */}
      <div className="rounded-xl border border-white/10 bg-gradient-to-br from-cyan-500/[0.04] via-violet-500/[0.04] to-amber-500/[0.04] p-3">
        <p className="text-[11px] text-white/45 text-center">
          <span className="text-cyan-300">Memorias</span> escriben el programa →{" "}
          <span className="text-violet-300">Habilidades</span> lo ejecutan →{" "}
          <span className="text-amber-300">Contexto</span> aporta percepción real. Las tres se enlazan por el cerebro
          seleccionado.
        </p>
      </div>

      {/* ── Panel del pilar activo ──────────────────────────── */}
      {/* Neuronas y Procesos activos son de la CUENTA: no requieren cerebro. */}
      <div className="pt-1">
        {pillar === "neuronas" && <NeuronasPanel brainId={activeBrain?.id ?? null} brainName={activeBrain?.name} />}
        {pillar === "procesos" && <ProcesosPanel brainId={activeBrain?.id ?? null} brainName={activeBrain?.name} />}
        {pillar !== "neuronas" && pillar !== "procesos" && !activeBrain && !loading && (
          <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-white/55">
            Elige o crea un cerebro en la pestaña {vista === "privados" ? "Privados" : "Públicos"} para ver esta sección.
          </p>
        )}
        {activeBrain && pillar === "memoria" && (
          <MemoryViews
            brainId={activeBrain.id}
            brainName={activeBrain.name}
            initialView={memView}
            initialSub={memSub}
            onViewChange={onMemViewChange}
          />
        )}
        {activeBrain && pillar === "habilidades" && <HabilidadesPanel brainId={activeBrain.id} brainName={activeBrain.name} />}
        {activeBrain && pillar === "contexto" && <ContextoPanel />}
        {activeBrain && pillar === "egos" && <PersonalitiesPanel brainId={activeBrain.id} brainName={activeBrain.name} />}
        {activeBrain && pillar === "conectores" && <ConectoresPanel brainId={activeBrain.id} brainName={activeBrain.name} />}
      </div>

      {/* ── Fusionar · Telepatía · Ajustes del cerebro activo (CB1013) ── */}
      {fusionOpen && activeBrain && (
        <FusionarDialog
          open
          onOpenChange={(o) => !o && setFusionOpen(false)}
          cerebro={activeBrain}
          cerebros={brains}
          onHecho={() => void reload()}
        />
      )}
      {telepatiaOpen && activeBrain && (
        <TelepatiaDialog
          open
          onOpenChange={(o) => !o && setTelepatiaOpen(false)}
          cerebro={activeBrain}
          cerebros={brains}
          onHecho={() => void reload()}
        />
      )}
      {ajustesOpen && activeBrain && (
        <AjustesCerebroDialog
          open
          onOpenChange={(o) => !o && setAjustesOpen(false)}
          cerebro={activeBrain}
          cerebros={brains}
          onHecho={() => void reload()}
        />
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
            { id: "egos", label: "Personalidades" },
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
