"use client";

import { useEffect, useState, useRef } from "react";
import { Sparkles, Volume2, ChevronDown } from "lucide-react";
import { useAurora } from "@/components/aurora/aurora-provider";
import { useSavedLibrary } from "@/lib/library-store";
import type { PersonalityProfile } from "@/lib/aurora/personalities";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function GlobalSelectionMenu() {
  const [selection, setSelection] = useState<{ text: string; x: number; y: number; up: boolean } | null>(null);
  const aurora = useAurora();
  const speak = aurora?.speak;
  const personality = aurora?.activePersonality;
  const { items } = useSavedLibrary();

  const menuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const handleSelection = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelection(null);
        return;
      }
      
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      if (rect.width === 0 || rect.height === 0) {
         setSelection(null);
         return;
      }

      setSelection({
        text: sel.toString(),
        x: rect.left + rect.width / 2,
        y: rect.top,
        up: true
      });
    };

    document.addEventListener("selectionchange", handleSelection);
    return () => document.removeEventListener("selectionchange", handleSelection);
  }, []);

  if (!selection) return null;

  const askAurora = () => {
    try {
      window.dispatchEvent(new CustomEvent("starseed:open-aurora-exocortex"));
      window.dispatchEvent(new CustomEvent("aurora:suggest", { detail: { context: "text-selection", text: selection.text } }));
    } catch { /* noop */ }
    setSelection(null);
  };

  const handlePlay = (p?: PersonalityProfile) => {
    speak?.(selection.text, p);
    setSelection(null);
  };

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: selection.x,
        top: selection.y - 48,
        transform: "translateX(-50%)",
        zIndex: 9999,
      }}
      className="flex items-center gap-1 rounded-full border border-white/10 bg-black/90 p-1.5 text-white shadow-2xl backdrop-blur-2xl transition-all"
    >
      <Button variant="ghost" size="sm" className="h-8 rounded-full text-xs font-semibold hover:bg-white/10" onClick={askAurora}>
        <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Preguntar a Aurora
      </Button>

      <div className="mx-1 h-4 w-px bg-white/15" />

      <div className="flex items-center">
        <Button variant="ghost" size="sm" className="h-8 rounded-full rounded-r-none pl-3 pr-2 text-xs hover:bg-white/10" onClick={() => handlePlay(personality)}>
          <Volume2 className="h-3.5 w-3.5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 rounded-full rounded-l-none border-l border-white/5 pl-2 pr-3 hover:bg-white/10">
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="z-[10000] border-white/10 bg-black/95 text-white backdrop-blur-xl">
            <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => handlePlay(personality)}>
              {personality?.name || "Actual"} (Actual)
            </DropdownMenuItem>
            {personalities.map((p) => (
              <DropdownMenuItem key={p.id} className="text-xs cursor-pointer" onClick={() => handlePlay(p)}>
                {p.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
