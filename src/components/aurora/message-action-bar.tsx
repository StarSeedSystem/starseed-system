"use client";

import { Volume2, Info, Copy, GitBranch, RotateCcw, ChevronDown, Check } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useSavedLibrary } from "@/lib/library-store";
import { useAurora } from "./aurora-provider";
import type { ChatMessagePayload } from "./message-context-menu";
import type { PersonalityProfile } from "@/lib/aurora/personalities";
import { announceLine } from "@/ai/astraura/router";

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
  const [infoOpen, setInfoOpen] = useState(false);

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
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { if (onViewProcess) onViewProcess(payload.meta); setInfoOpen(true); }} title="Ver información del proceso">
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
    

      {/* Modal de Información (Datos del Modelo y Alternativas) */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="bg-black/95 border-white/10 text-white sm:max-w-md backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-light text-blue-300">Información de la Respuesta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-gray-300 mt-2">
            {payload.meta ? (
              <>
                <div className="p-3 bg-white/5 rounded-md border border-white/10">
                  <h4 className="font-semibold text-white mb-1">Metadatos de IA</h4>
                  <ul className="list-disc pl-4 space-y-1">
                    {payload.meta.route?.sourceId && <li><strong>Proveedor:</strong> {payload.meta.route.sourceLabel || payload.meta.route.sourceId}</li>}
                    {payload.meta.route?.modelId && <li><strong>Modelo:</strong> {payload.meta.route.modelLabel || payload.meta.route.modelId}</li>}
                    {payload.meta.tokens && <li><strong>Tokens:</strong> {payload.meta.tokens}</li>}
                  </ul>
                </div>
                {payload.meta.route && (
                  <div className="p-3 bg-blue-500/10 rounded-md border border-blue-500/20 text-blue-200">
                    <h4 className="font-semibold text-blue-100 mb-1">Transparencia y Alternativas</h4>
                    <p className="whitespace-pre-wrap">{announceLine(payload.meta.route) || "No hay información adicional de alternativas para esta ruta."}</p>
                    <p className="mt-2 text-xs opacity-70">Puedes cambiar estas opciones en los ajustes de Astraura AI.</p>
                  </div>
                )}
              </>
            ) : (
              <p>No hay datos técnicos disponibles para este mensaje.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
