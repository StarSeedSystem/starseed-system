"use client";

import { useEffect, useState, useRef } from "react";
import { Volume2, MessageSquare, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAurora } from "./aurora/aurora-provider";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { useSavedLibrary } from "@/lib/library-store";
import type { PersonalityProfile } from "@/lib/aurora/personalities";

export function SystemSelectionProvider({ children }: { children: React.ReactNode }) {
  const aurora = useAurora();
  const { items } = useSavedLibrary();
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const personalities = items
    .filter((it) => it.kind === "personality" && (it as any).content)
    .map((it) => {
      try { return JSON.parse((it as any).content || "{}") as PersonalityProfile; }
      catch { return null; }
    })
    .filter(Boolean) as PersonalityProfile[];

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      // Ignorar si el clic fue dentro de nuestro propio menú flotante
      if (containerRef.current?.contains(e.target as Node)) return;

      setTimeout(() => {
        const activeSelection = window.getSelection();
        if (!activeSelection || activeSelection.isCollapsed) {
          setSelection(null);
          return;
        }

        const text = activeSelection.toString().trim();
        if (text.length === 0) {
          setSelection(null);
          return;
        }

        // Obtener posición
        const range = activeSelection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        setSelection({
          text,
          x: rect.left + rect.width / 2,
          y: rect.top - 10,
        });
      }, 50);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelection(null);
    };

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleRead = (p?: PersonalityProfile) => {
    if (!selection) return;
    aurora?.speak(selection.text, p);
    setSelection(null);
  };

  const handleCopyToChat = () => {
    if (!selection) return;
    // Disparar evento para inyectar al chat y abrir el Exocórtex
    window.dispatchEvent(
      new CustomEvent("starseed:inject-chat", {
        detail: { text: `Aquí tienes un fragmento seleccionado:\n\n"\${selection.text}"\n\n` }
      })
    );
    window.dispatchEvent(new CustomEvent("starseed:open-aurora-exocortex"));
    setSelection(null);
    toast.success("Copiado al chat de Aurora");
  };

  const handleCopy = () => {
    if (!selection) return;
    navigator.clipboard.writeText(selection.text);
    setSelection(null);
    toast.success("Texto copiado al portapapeles");
  };

  return (
    <>
      {children}
      {selection && (
        <div
          ref={containerRef}
          className="fixed z-[9999] bg-black/90 border border-white/10 backdrop-blur-xl rounded-lg shadow-2xl flex items-center p-1 gap-1 animate-in fade-in zoom-in-95 duration-200"
          style={{
            left: Math.max(10, selection.x - 70), // Center roughly
            top: Math.max(10, selection.y - 45), // Above selection
          }}
        >
          {/* Leer en Voz Alta */}
          <div className="flex items-center">
            <Button variant="ghost" size="sm" className="h-8 rounded-r-none px-2 text-white/80 hover:text-white" onClick={() => handleRead(aurora?.activePersonality)}>
              <Volume2 className="h-4 w-4 mr-2" /> Leer
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-6 rounded-l-none border-l border-white/5 px-1 hover:text-white" title="Elegir personalidad">
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="bg-black/90 border-white/10 backdrop-blur-xl z-[10000]">
                <DropdownMenuItem className="text-xs text-white" onClick={() => handleRead(aurora?.activePersonality)}>
                  {aurora?.activePersonality?.name} (Actual)
                </DropdownMenuItem>
                {personalities.map((p) => (
                  <DropdownMenuItem key={p.id} className="text-xs text-white" onClick={() => handleRead(p)}>
                    {p.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="w-px h-4 bg-white/10" />

          {/* Copiar al Chat */}
          <Button variant="ghost" size="sm" className="h-8 px-2 text-blue-300 hover:text-blue-200 hover:bg-blue-500/10" onClick={handleCopyToChat}>
            <MessageSquare className="h-4 w-4 mr-2" /> Al chat
          </Button>

          <div className="w-px h-4 bg-white/10" />

          {/* Copiar normal */}
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-white/80 hover:text-white" onClick={handleCopy} title="Copiar al portapapeles">
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      )}
    </>
  );
}
