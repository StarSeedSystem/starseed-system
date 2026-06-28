"use client";

import { useState } from "react";
import { Sparkles, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import AuroraStudio from "@/components/aurora/aurora-studio";
import AuroraEgoPanel from "@/components/aurora/ego-panel";
import AuroraImaginePanel from "@/components/aurora/imagine-panel";
import ChatConnectionsPanel from "@/components/messaging/chat-connections-panel";
import { MessageSquare } from "lucide-react";

type Section = "estudio" | "ego" | "chats" | "imagine";

export default function AuroraPage() {
  const [section, setSection] = useState<Section>("estudio");

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-fuchsia-50">Aurora · Voz de Astraura</h1>
        <p className="text-sm text-white/50 mt-1 mb-5">
          Control por voz en tiempo real de todos tus sistemas StarSeed. Configura voz, carácter, personalidad y
          emociones — o crea y comparte un <span className="text-fuchsia-200">Ego (ego.md)</span>: la identidad
          portable de Aurora, integrable en cualquier contexto.
        </p>

        {/* Secciones */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setSection("estudio")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border",
              section === "estudio"
                ? "bg-fuchsia-600/30 border-fuchsia-400/50 text-white"
                : "bg-white/5 border-white/10 text-white/60 hover:border-fuchsia-400/30",
            )}
          >
            <Mic className="w-3.5 h-3.5" /> Estudio (voz & personalidad)
          </button>
          <button
            onClick={() => setSection("ego")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border",
              section === "ego"
                ? "bg-fuchsia-600/30 border-fuchsia-400/50 text-white"
                : "bg-white/5 border-white/10 text-white/60 hover:border-fuchsia-400/30",
            )}
          >
            <Sparkles className="w-3.5 h-3.5" /> Ego (ego.md)
          </button>
          <button
            onClick={() => setSection("chats")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border",
              section === "chats"
                ? "bg-fuchsia-600/30 border-fuchsia-400/50 text-white"
                : "bg-white/5 border-white/10 text-white/60 hover:border-fuchsia-400/30",
            )}
          >
            <MessageSquare className="w-3.5 h-3.5" /> Conexiones de chat
          </button>
        <button
            onClick={() => setSection("imagine")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border",
              section === "imagine"
                ? "bg-fuchsia-600/30 border-fuchsia-400/50 text-white"
                : "bg-white/5 border-white/10 text-white/60 hover:border-fuchsia-400/30",
            )}
          >
            <Sparkles className="w-3.5 h-3.5" /> Imagine (imagine.md)
          </button>
          </div>

        {section === "estudio" ? <AuroraStudio /> : section === "ego" ? <AuroraEgoPanel /> : section === "chats" ? <ChatConnectionsPanel /> : <AuroraImaginePanel />}
      </div>
    </main>
  );
}
