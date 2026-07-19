"use client";

/**
 * StarSeed OS — Barra lateral de CHATS de Astraura AI (`/agent`)
 * ----------------------------------------------------------------------------
 * (Adenda 69 · I-1) Antes esto era una lista FALSA: cuatro folders hardcodeados
 * ("Proyectos Personales", "Investigación Política"…) con chats inventados que
 * no abrían nada. Ahora es la lista REAL de la CONVERSACIÓN UNIFICADA
 * (`aurora_conversations` en la nube), la MISMA que alimenta a Aurora (orbe,
 * mini-reproductor, Exocórtex). Lo que hables por voz con Aurora aparece aquí,
 * y lo que escribas aquí aparece en el Exocórtex de Astraura IA. En tiempo real.
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
  Folder,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TelegramChatsFolder } from "@/components/exocortex/telegram-chats-folder";
import { useAiConversations, type AiConversation } from "@/lib/aurora/conversations";
import { useChatFolders } from "@/lib/aurora/chat-folders-store";
import { ChatFolders } from "@/components/aurora/chat-folders";

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
  // Carpetas EN VIVO (Adenda 71-ter · I1): las conversaciones se agrupan por su
  // carpeta (aurora_conversations.folder), no por origen. Orden estable por la
  // posición de la tabla de carpetas; "Sin carpeta" al final.
  const { folders } = useChatFolders();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const byFolder = new Map<string, AiConversation[]>();
  for (const c of conversations) {
    const key = c.folder || "";
    const arr = byFolder.get(key) ?? [];
    arr.push(c);
    byFolder.set(key, arr);
  }
  const knownNames = new Set(folders.map((f) => f.name));
  const groups: {
    id: string;
    name: string;
    Icon: typeof Orbit;
    items: AiConversation[];
  }[] = [
    ...folders
      .filter((f) => (byFolder.get(f.name)?.length ?? 0) > 0)
      .map((f) => ({ id: `f:${f.name}`, name: f.name, Icon: Folder, items: byFolder.get(f.name) ?? [] })),
    // Carpetas referenciadas por chats pero aún no en la tabla (defensivo).
    ...[...byFolder.keys()]
      .filter((k) => k && !knownNames.has(k))
      .map((k) => ({ id: `f:${k}`, name: k, Icon: Folder, items: byFolder.get(k) ?? [] })),
    // Chats sin carpeta al final.
    ...((byFolder.get("")?.length ?? 0) > 0
      ? [{ id: "__none__", name: "Sin carpeta", Icon: MessageSquare, items: byFolder.get("") ?? [] }]
      : []),
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

      {/* Carpetas de chat (Adenda 71-bis): los chats se adjuntan a folders y
          se ven en todas las secciones porque comparten el almacén unificado. */}
      <ChatFolders
        activeConvId={activeId}
        folder={conversations.find((c) => c.id === activeId)?.folder ?? null}
        onPick={async (f) => {
          if (!activeId) return;
          try {
            const sb = (await import("@/utils/supabase/client")).createClient();
            await sb.from("aurora_conversations").update({ folder: f }).eq("id", activeId);
          } catch { /* */ }
        }}
      />

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
                onClick={() => setOpen((o) => ({ ...o, [g.id]: o[g.id] === false ? true : false }))}
                className="flex w-full cursor-pointer items-center px-2 py-1.5 text-xs font-semibold text-cyan-300/80 transition-colors duration-150 hover:text-cyan-200"
              >
                {open[g.id] !== false ? (
                  <ChevronDown className="w-3 h-3 mr-1" />
                ) : (
                  <ChevronRight className="w-3 h-3 mr-1" />
                )}
                <g.Icon className="w-3 h-3 mr-2 text-cyan-400/70" />
                <span className="min-w-0 flex-1 truncate text-left">{g.name}</span>
                <span className="text-[10px] font-normal text-cyan-100/40">{g.items.length}</span>
              </button>

              {open[g.id] !== false && (
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
