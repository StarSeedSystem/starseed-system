"use client";

// Página del AI Studio de un grupo/página. Lee el id de la ruta y renderiza el Studio.
// Client component + useParams para evitar el constraint de tipos de `params` (Promise)
// del App Router de Next 15 y mantener el build verde.

import { useParams } from "next/navigation";
import { GroupAIStudio } from "@/components/group/group-ai-studio";
import { Network } from "lucide-react";

export default function GrupoAIPage() {
  const params = useParams<{ id: string }>();
  const raw = params?.id;
  const id = Array.isArray(raw) ? raw[0] : (raw ?? "");

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto w-full">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-fuchsia-300 to-emerald-300 flex items-center gap-3">
          <Network className="w-7 h-7 text-cyan-300" />
          AI Studio · Grupo/Página
        </h1>
        {id && (
          <span className="text-[11px] font-mono text-white/40 px-2 py-0.5 rounded bg-white/5 border border-white/10">
            id: {id}
          </span>
        )}
      </div>

      {id ? (
        <GroupAIStudio groupId={id} />
      ) : (
        <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-center text-sm text-white/50">
          No se ha indicado ningún grupo en la ruta.
        </div>
      )}
    </div>
  );
}
