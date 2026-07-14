"use client";

/**
 * StarSeed OS — Barra lateral de CHATS de Astraura AI (`/agent`)
 * ----------------------------------------------------------------------------
 * (Adenda 69 · I-1) Antes esto era una lista FALSA: cuatro folders hardcodeados
 * ("Proyectos Personales", "Investigación Política"…) con chats inventados que
 * no abrían nada. Ahora es la lista REAL de la CONVERSACIÓN UNIFICADA
 * (`aurora_conversations` en la nube), la MISMA que alimenta a Aurora (orbe,
 * mini-reproductor, Exocórtex). Lo que hables por voz con Aurora aparece aquí,
 * y lo que escribas aquí aparece en el Exocórtex de Aurora. En tiempo real.
 */

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Network,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Orbit,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TelegramChatsFolder } from "@/components/exocortex/telegram-chats-folder";
import { useAiConversations, type AiConversation } from "@/lib/aurora/conversations";

function whenLabel(ts: number): string {
  try {
    const d = new Date(ts);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

/** Agrupa por origen: lo hablado con Aurora vs. lo escrito aquí, en Astraura AI. */
function groupOf(c: AiConversation): "aurora" | "astraura" {
  return c.kind === "astraura" || c.surface === "agent" ? "astraura" : "aurora";
}

export function ChatNeuralSidebar() {
  const { conversations, activeId, setActive, create, rename, remove } = useAiConversations();
  const [open, setOpen] = useState<Record<string, boolean>>({ aurora: true, astraura: true });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const groups: {
    id: "aurora" | "astraura";
    name: string;
    Icon: typeof Orbit;
    items: AiConversation[];
  }[] = [
    {
      id: "astraura",
      name: "Astraura AI (aquí)",
      Icon: Bot,
      items: conversations.filter((c) => groupOf(c) === "astraura"),
    },
    {
      id: "aurora",
      name: "Aurora (voz y orbe)",
      Icon: Orbit,
      items: conversations.filter((c) => groupOf(c) === "aurora"),
    },
  ];

  return (
    <div className="hidden lg:flex w-64 shrink-0 flex-col rounded-xl border bg-background/40 overflow-hidden">
      <div className="px-3 py-3 border-b flex items-center gap-2 text-sm font-semibold text-cyan-100">
        <Network className="w-4 h-4 text-cyan-400" />
        <span className="flex-1 min-w-0 truncate">Conversaciones</span>
        <button
          onClick={() => void create({ kind: "astraura", surface: "agent" })}
          title="Nueva conversación"
          className="cursor-pointer rounded-md p-1 text-cyan-300/80 transition-colors duration-150 hover:bg-white/10 hover:text-cyan-100"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {conversations.length === 0 && (
          <p className="px-2 py-6 text-center text-[11px] leading-relaxed text-cyan-100/40">
            Aún no hay conversaciones. Escribe aquí, o háblale a Aurora desde el orbe: el
            historial es el mismo.
          </p>
        )}

        {groups.map((g) =>
          g.items.length === 0 ? null : (
            <div key={g.id} className="space-y-0.5">
              <button
                onClick={() => setOpen((o) => ({ ...o, [g.id]: !o[g.id] }))}
                className="flex w-full cursor-pointer items-center px-2 py-1.5 text-xs font-semibold text-cyan-300/80 transition-colors duration-150 hover:text-cyan-200"
              >
                {open[g.id] ? (
                  <ChevronDown className="w-3 h-3 mr-1" />
                ) : (
                  <ChevronRight className="w-3 h-3 mr-1" />
                )}
                <g.Icon className="w-3 h-3 mr-2 text-cyan-400/70" />
                <span className="min-w-0 flex-1 truncate text-left">{g.name}</span>
                <span className="text-[10px] font-normal text-cyan-100/40">{g.items.length}</span>
              </button>

              {open[g.id] && (
                <div className="ml-2 space-y-0.5 border-l border-cyan-500/10 pl-2">
                  {g.items.map((c) => (
                    <div
                      key={c.id}
                      className={cn(
                        "group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors duration-150",
                        c.id === activeId
                          ? "bg-cyan-500/15 text-cyan-100"
                          : "text-cyan-100/80 hover:bg-white/5",
                      )}
                    >
                      {editing === c.id ? (
                        <>
                          <input
                            autoFocus
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                void rename(c.id, draft);
                                setEditing(null);
                              }
                              if (e.key === "Escape") setEditing(null);
                            }}
                            className="min-w-0 flex-1 rounded bg-black/40 px-1.5 py-0.5 text-xs outline-none ring-1 ring-cyan-500/30"
                          />
                          <button
                            onClick={() => {
                              void rename(c.id, draft);
                              setEditing(null);
                            }}
                            className="cursor-pointer text-emerald-400 hover:text-emerald-300"
                            title="Guardar"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setEditing(null)}
                            className="cursor-pointer text-white/50 hover:text-white"
                            title="Cancelar"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setActive(c.id)}
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                            title={`Abrir «${c.title}»`}
                          >
                            <MessageSquare className="w-3 h-3 shrink-0 text-cyan-500/50" />
                            <span className="min-w-0 flex-1 truncate">{c.title}</span>
                            <span className="shrink-0 text-[9px] text-cyan-100/35">
                              {whenLabel(c.updatedAt)}
                            </span>
                          </button>
                          <button
                            onClick={() => {
                              setEditing(c.id);
                              setDraft(c.title);
                            }}
                            className="hidden cursor-pointer text-white/40 hover:text-white group-hover:block"
                            title="Renombrar"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => void remove(c.id)}
                            className="hidden cursor-pointer text-white/40 hover:text-rose-400 group-hover:block"
                            title="Eliminar conversación"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ),
        )}

        <div className="mt-2 border-t border-cyan-500/10 pt-2">
          <TelegramChatsFolder defaultOpen={false} />
        </div>
      </div>
    </div>
  );
}

export default ChatNeuralSidebar;
