"use client";

/**
 * MiniPlayerOpenMenu — panel compacto (glass) del mini-reproductor de Aurora
 * (Adenda 71-ter · I1). Tres utilidades pedidas para el orbe:
 *   (a) ABRIR CUALQUIER chat de cualquier carpeta (carpetas → chats).
 *   (b) SELECTOR DE CEREBROS del perfil (lee/escribe brain_selections vía
 *       selectBrainForContext — sólo IMPORTA de brains.ts, no lo edita).
 *   (c) NUEVO chat con carpeta seleccionable o "automática".
 * Diseño compacto/translúcido alineado con ChatConfigMenu. Nunca lanza.
 */

import { useCallback, useEffect, useState } from "react";
import {
  FolderOpen, Brain as BrainIcon, Plus, MessageSquare, Check, X, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAiConversations, type AiConversation } from "@/lib/aurora/conversations";
import { useChatFolders } from "@/lib/aurora/chat-folders-store";
import { listBrains, getSelection, selectBrainForContext, type Brain } from "@/lib/brains/brains";

type SectionKey = "abrir" | "cerebro" | "nuevo";

export function MiniPlayerOpenMenu({ onClose }: { onClose?: () => void }) {
  const { conversations, setActive, create } = useAiConversations();
  const { folders } = useChatFolders();
  const [open, setOpen] = useState<SectionKey>("abrir");
  const [brains, setBrains] = useState<Brain[]>([]);
  const [brainId, setBrainId] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState<string>("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const bs = await listBrains();
        if (alive) setBrains(bs);
      } catch { /* */ }
      try {
        const sel = await getSelection("global", null);
        if (alive) setBrainId(sel?.brain_id ?? null);
      } catch { /* */ }
    })();
    return () => { alive = false; };
  }, []);

  const pickBrain = useCallback(async (b: Brain) => {
    setBrainId(b.id);
    try { await selectBrainForContext("global", null, b.id, (b.servers || []).map((s) => s.id)); } catch { /* */ }
  }, []);

  const openChat = useCallback((id: string) => {
    setActive(id);
    onClose?.();
  }, [setActive, onClose]);

  const makeChat = useCallback(async () => {
    await create({ surface: "orb", kind: "aurora", folder: newFolder || null });
    onClose?.();
  }, [create, newFolder, onClose]);

  // Agrupa conversaciones por carpeta para el selector "abrir".
  const byFolder = new Map<string, AiConversation[]>();
  for (const c of conversations) {
    const key = c.folder || "";
    const arr = byFolder.get(key) ?? [];
    arr.push(c);
    byFolder.set(key, arr);
  }
  const knownNames = new Set(folders.map((f) => f.name));
  const folderGroups = [
    ...folders.filter((f) => (byFolder.get(f.name)?.length ?? 0) > 0).map((f) => ({ name: f.name, items: byFolder.get(f.name) ?? [] })),
    ...[...byFolder.keys()].filter((k) => k && !knownNames.has(k)).map((k) => ({ name: k, items: byFolder.get(k) ?? [] })),
    ...((byFolder.get("")?.length ?? 0) > 0 ? [{ name: "Sin carpeta", items: byFolder.get("") ?? [] }] : []),
  ];

  const SECTIONS: { key: SectionKey; label: string; Icon: typeof FolderOpen }[] = [
    { key: "abrir", label: "Abrir chat", Icon: FolderOpen },
    { key: "cerebro", label: "Cerebro", Icon: BrainIcon },
    { key: "nuevo", label: "Nuevo chat", Icon: Plus },
  ];

  return (
    <div className="w-[20rem] max-w-[92vw] rounded-2xl border border-cyan-400/40 bg-gradient-to-b from-cyan-600/20 via-sky-600/10 to-black/80 backdrop-blur-2xl text-white shadow-2xl">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/10">
        <div className="text-xs font-light tracking-wide text-cyan-200">Chats y cerebros</div>
        {onClose && (
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="w-3.5 h-3.5" /></button>
        )}
      </div>

      <div className="flex gap-1 p-2">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setOpen(s.key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] transition",
              open === s.key ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100" : "border-white/10 text-white/55 hover:bg-white/5",
            )}
          >
            <s.Icon className="w-3.5 h-3.5" /> {s.label}
          </button>
        ))}
      </div>

      <div className="px-2.5 pb-3 max-h-[50vh] overflow-y-auto">
        {open === "abrir" && (
          <div className="space-y-2">
            {folderGroups.length === 0 && <div className="px-1 py-3 text-[11px] text-white/35">Aún no hay conversaciones.</div>}
            {folderGroups.map((g) => (
              <div key={g.name}>
                <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/35">
                  <FolderOpen className="w-3 h-3" /> {g.name}
                </div>
                <div className="space-y-0.5">
                  {g.items.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => openChat(c.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-white/70 transition hover:bg-white/5"
                    >
                      <MessageSquare className="w-3 h-3 shrink-0 text-cyan-500/50" />
                      <span className="min-w-0 flex-1 truncate">{c.title}</span>
                      <ChevronRight className="w-3 h-3 shrink-0 text-white/25" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {open === "cerebro" && (
          <div className="space-y-0.5">
            {brains.length === 0 && <div className="px-1 py-3 text-[11px] text-white/35">No hay cerebros en este perfil.</div>}
            {brains.map((b) => (
              <button
                key={b.id}
                onClick={() => void pickBrain(b)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition",
                  brainId === b.id ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5",
                )}
              >
                <BrainIcon className="w-3.5 h-3.5 shrink-0 text-cyan-400/70" />
                <span className="min-w-0 flex-1 truncate">{b.name}</span>
                {brainId === b.id && <Check className="w-3.5 h-3.5 text-emerald-300" />}
              </button>
            ))}
          </div>
        )}

        {open === "nuevo" && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-white/35">Carpeta del chat</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setNewFolder("")}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] transition",
                  !newFolder ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100" : "border-white/10 text-white/50 hover:border-white/30",
                )}
              >
                Automática
              </button>
              {folders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setNewFolder(f.name)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] transition",
                    newFolder === f.name ? "border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-100" : "border-white/10 text-white/50 hover:border-white/30",
                  )}
                >
                  {f.name}
                </button>
              ))}
            </div>
            <button
              onClick={() => void makeChat()}
              className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 py-2 text-xs font-medium text-cyan-100 transition hover:bg-cyan-500/25"
            >
              <Plus className="w-3.5 h-3.5" /> Crear chat {newFolder ? `en «${newFolder}»` : "(carpeta automática)"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default MiniPlayerOpenMenu;
