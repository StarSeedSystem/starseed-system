"use client";

import { Volume2, Info, Copy, GitBranch, RotateCcw, ChevronDown, Check } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useSavedLibrary } from "@/lib/library-store";
import { useAurora } from "./aurora-provider";
import type { ChatMessagePayload } from "./message-context-menu";
import type { PersonalityProfile } from "@/lib/aurora/personalities";

export interface MessageActionBarProps {
  payload: ChatMessagePayload;
  onBranchFromMessage?: (history: ChatMessagePayload["history"], label: string) => void;
  onRetryMessage?: (userText: string, forceSource?: { sourceId: string; modelId: string }) => void;
  onViewProcess?: (meta: ChatMessagePayload["meta"]) => void;
}

export function MessageActionBar({ payload, onBranchFromMessage, onRetryMessage, onViewProcess }: MessageActionBarProps) {
  const aurora = useAurora();
  const speak = aurora?.speak;
  const personality = aurora?.activePersonality;
  const { items } = useSavedLibrary();
  const [copied, setCopied] = useState(false);
  const isAurora = payload.role === "aurora";

  // Buscar personalidades guardadas en la biblioteca
  const personalities = items
    .filter((it) => it.kind === "personality" && (it as any).content)
    .map((it) => {
      try {
        return JSON.parse((it as any).content || "{}") as PersonalityProfile;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as PersonalityProfile[];

  const handleCopy = () => {
    if (!navigator?.clipboard) return;
    navigator.clipboard.writeText(payload.text);
    setCopied(true);
    toast.success("Mensaje copiado");
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePlay = (p?: PersonalityProfile) => {
    speak?.(payload.text, p);
  };

  const handleBranch = () => {
    if (!onBranchFromMessage) return;
    onBranchFromMessage(payload.history, "Nueva rama desde el mensaje");
  };

  const handleRetry = () => {
    if (!onRetryMessage) return;
    // Buscamos el último mensaje de usuario antes de este
    const upto = payload.history.slice(0, -1);
    let userText = "";
    for (let i = upto.length - 1; i >= 0; i--) {
      if (upto[i].role === "user") {
        userText = upto[i].text;
        break;
      }
    }
    if (userText) onRetryMessage(userText);
  };

  return (
    <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
      {/* Botón de Leer en Voz Alta (con selector de personalidad) */}
      <div className="flex items-center">
        <Button variant="ghost" size="icon" className="h-6 w-6 rounded-r-none" onClick={() => handlePlay(personality)} title="Leer en voz alta">
          <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-4 rounded-l-none border-l border-white/5" title="Elegir personalidad para leer">
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="bg-black/90 border-white/10 backdrop-blur-xl">
            <DropdownMenuItem className="text-xs" onClick={() => handlePlay(personality)}>
              {personality.name} (Actual)
            </DropdownMenuItem>
            {personalities.map((p) => (
              <DropdownMenuItem key={p.id} className="text-xs" onClick={() => handlePlay(p)}>
                {p.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy} title="Copiar mensaje">
        {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
      </Button>

      {isAurora && onViewProcess && (
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onViewProcess(payload.meta)} title="Ver información del proceso">
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      )}

      {onBranchFromMessage && (
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleBranch} title="Ramificar chat desde aquí">
          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      )}

      {isAurora && onRetryMessage && (
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleRetry} title="Reintentar respuesta">
          <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      )}
    </div>
  );
}
