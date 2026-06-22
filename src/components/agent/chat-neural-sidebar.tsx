"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Folder, MessageSquare, Network } from "lucide-react";
import { cn } from "@/lib/utils";
import { TelegramChatsFolder } from "@/components/exocortex/telegram-chats-folder";

const NEXUS_FOLDERS = [
  { id: "f1", name: "Proyectos Personales", chats: ["Planificación Ciudadela"] },
  { id: "f2", name: "Investigación Política", chats: ["Análisis de Constitución"] },
  { id: "f3", name: "Desarrollo Sistema", chats: ["Refactorización Core"] },
  { id: "f0", name: "Sin carpeta", chats: ["Ideas Sueltas"] },
];

export function ChatNeuralSidebar() {
  const [open, setOpen] = useState<Record<string, boolean>>({ f1: true });
  return (
    <div className="hidden lg:flex w-64 shrink-0 flex-col rounded-xl border bg-background/40 overflow-hidden">
      <div className="px-3 py-3 border-b flex items-center gap-2 text-sm font-semibold text-cyan-100">
        <Network className="w-4 h-4 text-cyan-400" /> Chats del Nexus
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {NEXUS_FOLDERS.map((f) => (
          <div key={f.id} className="space-y-0.5">
            <button
              onClick={() => setOpen((o) => ({ ...o, [f.id]: !o[f.id] }))}
              className="w-full flex items-center px-2 py-1.5 text-xs font-semibold text-cyan-300/80 hover:text-cyan-200"
            >
              {open[f.id] ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
              <Folder className="w-3 h-3 mr-2 text-cyan-400/70" />
              {f.name}
            </button>
            {open[f.id] && (
              <div className="ml-2 space-y-0.5 border-l border-cyan-500/10 pl-2">
                {f.chats.map((c) => (
                  <div key={c} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 text-xs text-cyan-100/80">
                    <MessageSquare className="w-3 h-3 text-cyan-500/50" />
                    {c}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="pt-2 mt-2 border-t border-cyan-500/10">
          <TelegramChatsFolder defaultOpen={true} />
        </div>
      </div>
    </div>
  );
}

export default ChatNeuralSidebar;
