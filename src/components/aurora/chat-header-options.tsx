"use client";

import { useEffect, useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { loadConfigs, getActiveProviderId, setActiveProviderId } from "@/ai/client/providerStore";
import { PROVIDERS } from "@/ai/providers";

import type { ProviderConfig, ProviderId } from "@/ai/providers/types";
import { toast } from "sonner";
import { Zap, BrainCircuit, Activity, Wrench, Settings } from "lucide-react";

export function ChatHeaderOptions({
  selectedAgentId,
  setSelectedAgentId,
  agents = [
    { id: "1", name: "Núcleo StarSeed" },
    { id: "2", name: "Musa Creativa" }
  ]
}: {
  selectedAgentId: string;
  setSelectedAgentId: (id: string) => void;
  agents?: { id: string, name: string }[];
}) {
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [activeProviderIdState, setActiveProviderIdState] = useState<ProviderId | null>(null);

  // Additional mock states for new options
  const [sentidos, setSentidos] = useState<string[]>(['todos']);
  const [habilidades, setHabilidades] = useState<string[]>(['search', 'files']);
  const [conexiones, setConexiones] = useState<string[]>(['core']);

  useEffect(() => {
    setConfigs(loadConfigs());
    setActiveProviderIdState(getActiveProviderId());
  }, []);

  function setProvider(id: ProviderId) {
    setActiveProviderId(id);
    setActiveProviderIdState(id);
    toast.success(`Modelo activo: ${PROVIDERS[id].info.label}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 overflow-x-auto scrollbar-hide py-1">
      {/* 1. Personalidad (Agente) */}
      <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
        <SelectTrigger className="h-8 min-w-[140px] bg-card/60 backdrop-blur border-border/50 text-xs shadow-sm">
          <BrainCircuit className="w-3.5 h-3.5 mr-1.5 text-primary" />
          <SelectValue placeholder="Personalidad" />
        </SelectTrigger>
        <SelectContent>
          {agents.map((agent: any) => (
            <SelectItem key={agent.id} value={agent.id} className="text-xs">
              {agent.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 2. Modelos de IA (Provider) */}
      {configs.filter(c => c.enabled).length > 0 && (
        <Select
          value={activeProviderIdState ?? configs[0]?.id}
          onValueChange={(v) => setProvider(v as ProviderId)}
        >
          <SelectTrigger className="h-8 min-w-[140px] bg-card/60 backdrop-blur border-border/50 text-xs shadow-sm">
            <Zap className="w-3.5 h-3.5 mr-1.5 text-yellow-400" />
            <SelectValue placeholder="Modelo IA" />
          </SelectTrigger>
          <SelectContent>
            {configs.filter(c => c.enabled).map(c => (
              <SelectItem key={c.id} value={c.id} className="text-xs">
                {PROVIDERS[c.id as ProviderId]?.info.local ? "🖥 " : "☁ "}{c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* 3. Sentidos */}
      <Select value="todos" onValueChange={() => toast.info("Edición de Sentidos próximamente")}>
        <SelectTrigger className="h-8 min-w-[120px] bg-card/60 backdrop-blur border-border/50 text-xs shadow-sm">
          <Activity className="w-3.5 h-3.5 mr-1.5 text-pink-400" />
          <SelectValue placeholder="Sentidos" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos" className="text-xs">Todos los sentidos</SelectItem>
          <SelectItem value="solo_texto" className="text-xs">Solo texto</SelectItem>
          <SelectItem value="texto_voz" className="text-xs">Texto y voz</SelectItem>
        </SelectContent>
      </Select>

      {/* 4. Habilidades (Skills) */}
      <Select value="activas" onValueChange={() => toast.info("Edición de Habilidades próximamente")}>
        <SelectTrigger className="h-8 min-w-[120px] bg-card/60 backdrop-blur border-border/50 text-xs shadow-sm">
          <Wrench className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
          <SelectValue placeholder="Habilidades" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="activas" className="text-xs">Skills activas</SelectItem>
          <SelectItem value="ninguna" className="text-xs">Ninguna</SelectItem>
        </SelectContent>
      </Select>

      {/* 5. Conexiones (Plugins, MCPs) */}
      <Select value="basicas" onValueChange={() => toast.info("Edición de Conexiones próximamente")}>
        <SelectTrigger className="h-8 min-w-[120px] bg-card/60 backdrop-blur border-border/50 text-xs shadow-sm">
          <Settings className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
          <SelectValue placeholder="Conexiones" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="basicas" className="text-xs">Conexiones base</SelectItem>
          <SelectItem value="todas" className="text-xs">Todas las extensiones</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
