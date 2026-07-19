"use client";

/**
 * ChatNavPanel — panel de navegación de chats reutilizable (Adenda 76 · G1).
 * ----------------------------------------------------------------------------
 * Agrupa, en un solo panel, la navegación completa del chat de Astraura:
 *   · Espacios de trabajo (useWorkspaces de G2, defensivo).
 *   · Folders y Chats (la barra existente `ChatNeuralSidebar`, con su
 *     agrupación Folders | Personalidad y el almacén unificado).
 *
 * Se usa en el drawer lateral móvil del tab «Chats» y en la barra colapsable de
 * la página de chat a pantalla completa (`/agent/chat`).
 */

import Link from "next/link";
import { Layers, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAiConversations } from "@/lib/aurora/conversations";
import { useWorkspaces, type Workspace } from "@/lib/workspaces/workspaces";
import { ChatNeuralSidebar } from "./chat-neural-sidebar";

export function ChatNavPanel({ onNavigate }: { onNavigate?: () => void }) {
  const conv = useAiConversations();
  const ws = useWorkspaces();
  const workspaces = ws?.workspaces ?? [];

  const openWorkspace = (w: Workspace) => {
    const first = w.chatIds?.[0];
    if (first) {
      conv.setActive(first);
      onNavigate?.();
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2">
      {/* ── Espacios de trabajo (G2) ── */}
      <div className="shrink-0">
        <div className="flex items-center justify-between px-1 pb-1">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/45">
            <Layers className="h-3.5 w-3.5" /> Espacios de trabajo
          </span>
          <Link
            href="/agent?tab=espacios"
            onClick={onNavigate}
            className="flex items-center gap-0.5 text-[10px] font-medium text-cyan-300 transition-colors hover:text-cyan-200"
          >
            Ver todos <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        {workspaces.length === 0 ? (
          <p className="px-1 pb-1 text-[11px] leading-relaxed text-white/35">
            Sin espacios aún. Créalos en la pestaña «Espacios de trabajo».
          </p>
        ) : (
          <div className="ss-hscroll flex gap-1.5 overflow-x-auto pb-1">
            {workspaces.slice(0, 10).map((w) => (
              <button
                key={w.id}
                onClick={() => openWorkspace(w)}
                title={`Abrir «${w.name}»`}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/75 transition-colors hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-white cursor-pointer"
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-cyan-500/15 text-cyan-200">
                  {w.icon ? <span className="text-xs leading-none">{w.icon}</span> : <Layers className="h-3 w-3" />}
                </span>
                <span className="max-w-[8rem] truncate font-medium">{w.name}</span>
                <span className="font-mono text-white/40">{w.chatIds?.length ?? 0}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Folders + Chats (barra existente, ancho completo) ── */}
      <div className="min-h-0 flex-1">
        <ChatNeuralSidebar variant="panel" onPick={onNavigate} />
      </div>
    </div>
  );
}

export default ChatNavPanel;
