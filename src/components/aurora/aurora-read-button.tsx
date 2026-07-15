"use client";

import { Volume2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAurora } from "./aurora-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSavedLibrary } from "@/lib/library-store";
import type { PersonalityProfile } from "@/lib/aurora/personalities";

interface AuroraReadButtonProps {
  text: string;
  defaultPersonalityId?: string; // Si el mensaje fue enviado con una personalidad específica
  className?: string;
}

export function AuroraReadButton({ text, defaultPersonalityId, className }: AuroraReadButtonProps) {
  const aurora = useAurora();
  const { items } = useSavedLibrary();

  const personalities = items
    .filter((it) => it.kind === "personality" && (it as any).content)
    .map((it) => {
      try { return JSON.parse((it as any).content || "{}") as PersonalityProfile; }
      catch { return null; }
    })
    .filter(Boolean) as PersonalityProfile[];

  const defaultPersonality = defaultPersonalityId
    ? personalities.find((p) => p.id === defaultPersonalityId) || aurora?.activePersonality
    : aurora?.activePersonality;

  const handleRead = (p?: PersonalityProfile) => {
    aurora?.speak(text, p);
  };

  return (
    <div className={`flex items-center rounded-lg border border-white/5 bg-black/20 backdrop-blur-md shadow-sm opacity-0 group-hover:opacity-100 transition-opacity ${className || ""}`}>
      <Button 
        variant="ghost" 
        size="sm" 
        className="h-7 rounded-r-none px-2 text-white/70 hover:text-white" 
        onClick={() => handleRead(defaultPersonality)}
        title="Leer en voz alta con Aurora"
      >
        <Volume2 className="h-3.5 w-3.5" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 w-5 rounded-l-none border-l border-white/5 px-0.5 text-white/50 hover:text-white" title="Elegir personalidad">
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-black/90 border-white/10 backdrop-blur-xl z-[9999]">
          <DropdownMenuItem className="text-xs text-white cursor-pointer" onClick={() => handleRead(defaultPersonality)}>
            {defaultPersonality?.name || "Predeterminada"} (Actual)
          </DropdownMenuItem>
          {personalities.map((p) => (
            <DropdownMenuItem key={p.id} className="text-xs text-white cursor-pointer" onClick={() => handleRead(p)}>
              {p.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
