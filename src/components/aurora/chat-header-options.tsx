"use client";

import { useEffect, useState } from "react";
import { loadConfigs, getActiveProviderId, setActiveProviderId } from "@/ai/client/providerStore";
import { PROVIDERS } from "@/ai/providers";
import type { ProviderConfig, ProviderId } from "@/ai/providers/types";
import { toast } from "sonner";
import { Zap, BrainCircuit, Activity, Wrench, Settings, Settings2, ChevronRight, Bot, Server, Shield, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listPersonalityProfiles, setActivePersonality, getActivePersonality, PERSONALITY_CHANGED_EVENT } from "@/lib/aurora/personalities";
import { useAurora } from "@/components/aurora/aurora-provider";
import { useSavedLibrary } from "@/lib/library-store";
import { getHermioneNeuron, HERMIONE_PERSONALITY_ID } from "@/lib/aurora/hermione-bridge";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";

export function ChatHeaderOptions() {
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [activeProviderIdState, setActiveProviderIdState] = useState<ProviderId | null>(null);

  const aurora = useAurora();
  const { items } = useSavedLibrary();

  // Fetch real personalities on render
  const realPersonalities = items
    .filter((it) => it.kind === "personality" && (it as any).content)
    .map((it) => {
      try { return JSON.parse((it as any).content || "{}"); }
      catch { return null; }
    })
    .filter(Boolean);
  
  const defaultPersonalities = listPersonalityProfiles();
  const allPersonalities = [
    ...defaultPersonalities.map(p => ({ id: p.id, name: p.name, isGlobal: true })),
    ...realPersonalities.map(p => ({ id: p.id, name: p.name, isGlobal: false }))
  ];

  // Adenda 70 · El indicador debe reflejar el PERFIL activo (fuente de verdad),
  // no el sistema legacy `aurora.activePersonality` (que no se sincroniza con
  // el perfil y por eso "se quedaba en Hermione" aunque eligieras otra).
  const [selectedAgentId, setSelectedAgentIdState] = useState<string>(
    () => getActivePersonality()?.id || "aurora"
  );
  useEffect(() => {
    const sync = () => setSelectedAgentIdState(getActivePersonality()?.id || "aurora");
    sync();
    window.addEventListener(PERSONALITY_CHANGED_EVENT, sync);
    return () => window.removeEventListener(PERSONALITY_CHANGED_EVENT, sync);
  }, []);
  const setSelectedAgentId = (id: string) => {
    setActivePersonality({ scope: "global" }, id);
    setSelectedAgentIdState(id);
  };

  useEffect(() => {
    setConfigs(loadConfigs());
    setActiveProviderIdState(getActiveProviderId());
  }, []);

  function setProvider(id: ProviderId) {
    setActiveProviderId(id);
    setActiveProviderIdState(id);
    toast.success(`Modelo activo: ${PROVIDERS[id].info.label}`);
  }

  const activeAgentName = allPersonalities.find(a => a.id === selectedAgentId)?.name || "Personalidad";

  // Adenda 70 · Estado de la neurona servidor de Hermione (esta Mac / Hermes).
  // Muestra en el menú si el puente a Hermes está vivo cuando Hermione es activa.
  const [hermioneOnline, setHermioneOnline] = useState<boolean | null>(null);
  const isHermione = selectedAgentId === HERMIONE_PERSONALITY_ID;
  useEffect(() => {
    let alive = true;
    if (isHermione) {
      getHermioneNeuron().then((n) => { if (alive) setHermioneOnline(!!n?.online); }).catch(() => {});
    } else {
      setHermioneOnline(null);
    }
    return () => { alive = false; };
  }, [isHermione]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="bg-card/60 backdrop-blur border-border/50 shadow-sm text-xs rounded-full">
          <Settings2 className="w-3.5 h-3.5 mr-2" />
          Ajustes de Aurora
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 bg-black/90 backdrop-blur-xl border border-cyan-500/20 text-cyan-50 z-[200]">
        
        {/* Personalidades */}
        <DropdownMenuLabel className="text-xs text-cyan-500/70 font-mono">Personalidad Activa</DropdownMenuLabel>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs cursor-pointer hover:bg-cyan-500/20">
            <BrainCircuit className="w-3.5 h-3.5 mr-2 text-cyan-400" />
            <span className="truncate">{activeAgentName}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="w-56 bg-black/95 backdrop-blur-xl border border-cyan-500/20 z-[201]">
              <DropdownMenuLabel className="text-[10px] uppercase text-cyan-500/50">Globales (Aurora)</DropdownMenuLabel>
              {defaultPersonalities.map((p) => (
                <DropdownMenuItem 
                  key={p.id} 
                  className="text-xs cursor-pointer hover:bg-cyan-500/20"
                  onClick={() => setSelectedAgentId(p.id)}
                >
                  <Bot className="w-3.5 h-3.5 mr-2 text-cyan-400" />
                  {p.name}
                  {p.id === selectedAgentId && <span className="ml-auto text-cyan-400 text-[10px]">Activo</span>}
                </DropdownMenuItem>
              ))}
              {realPersonalities.length > 0 && (
                <>
                  <DropdownMenuSeparator className="bg-cyan-500/20" />
                  <DropdownMenuLabel className="text-[10px] uppercase text-cyan-500/50">Locales (Studio)</DropdownMenuLabel>
                  {realPersonalities.map(a => (
                    <DropdownMenuItem 
                      key={a.id} 
                      className="text-xs cursor-pointer hover:bg-cyan-500/20"
                      onClick={() => setSelectedAgentId(a.id)}
                    >
                      <BrainCircuit className="w-3.5 h-3.5 mr-2 text-primary" />
                      {a.name}
                      {a.id === selectedAgentId && <span className="ml-auto text-cyan-400 text-[10px]">Activo</span>}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        
        {/* Adenda 70 · Puente Hermione → neurona servidor (Hermes / esta Mac) */}
        {isHermione && (
          <div className="px-2 py-1.5 text-[10px] rounded-md border border-cyan-500/20 bg-cyan-500/5 mx-1 my-1">
            <div className="flex items-center gap-1.5 text-cyan-300">
              <Server className="w-3 h-3" />
              <span className="font-medium">Hermione · puente Hermes</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-white/60">
              {hermioneOnline === null ? (
                <span className="text-white/40">Comprobando servidor…</span>
              ) : hermioneOnline ? (
                <span className="text-emerald-300">● Neurona servidor ONLINE (esta computadora)</span>
              ) : (
                <span className="text-amber-300">○ Neurona OFFLINE — Astraura responde normalmente</span>
              )}
            </div>
          </div>
        )}

        <DropdownMenuSeparator className="bg-cyan-500/20" />

        {/* Modelos */}
        <DropdownMenuLabel className="text-xs text-cyan-500/70 font-mono">Motor de Inferencia</DropdownMenuLabel>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs cursor-pointer hover:bg-cyan-500/20">
            <Zap className="w-3.5 h-3.5 mr-2 text-yellow-400" />
            <span className="truncate">
              {activeProviderIdState && PROVIDERS[activeProviderIdState] 
                ? PROVIDERS[activeProviderIdState].info.label 
                : "Seleccionar modelo..."}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="w-56 bg-black/95 backdrop-blur-xl border border-cyan-500/20 z-[201]">
              {configs.filter(c => c.enabled).length === 0 ? (
                <DropdownMenuItem disabled className="text-xs text-white/40">No hay modelos activos</DropdownMenuItem>
              ) : (
                configs.filter(c => c.enabled).map(c => (
                  <DropdownMenuItem 
                    key={c.id} 
                    className="text-xs cursor-pointer hover:bg-cyan-500/20"
                    onClick={() => setProvider(c.id as ProviderId)}
                  >
                    <span className="mr-2 opacity-50">{PROVIDERS[c.id as ProviderId]?.info.local ? "🖥" : "☁"}</span>
                    {c.label}
                    {c.id === activeProviderIdState && <span className="ml-auto text-yellow-400 text-[10px]">Activo</span>}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuSeparator className="bg-cyan-500/20" />

        {/* Sentidos y Habilidades */}
        <DropdownMenuLabel className="text-xs text-cyan-500/70 font-mono">Capacidades del Sistema</DropdownMenuLabel>
        <DropdownMenuItem className="text-xs cursor-pointer hover:bg-cyan-500/20" onClick={() => toast.info("Sentidos activos: Todos")}>
          <Activity className="w-3.5 h-3.5 mr-2 text-pink-400" />
          Sentidos y Memoria (100%)
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs cursor-pointer hover:bg-cyan-500/20" onClick={() => toast.info("Habilidades activas: Búsqueda, Archivos, OS")}>
          <Wrench className="w-3.5 h-3.5 mr-2 text-blue-400" />
          Skills Activas (OS)
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs cursor-pointer hover:bg-cyan-500/20" onClick={() => toast.info("Conexiones: Base")}>
          <Network className="w-3.5 h-3.5 mr-2 text-emerald-400" />
          Conexiones Base
        </DropdownMenuItem>
        
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
