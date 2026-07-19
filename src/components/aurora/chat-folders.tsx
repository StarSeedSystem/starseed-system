"use client";

/**
 * ChatFolders — barra de CARPETAS de chat de Astraura (Adenda 71-bis).
 * Los chats se adjuntan a folders; se ven en todas las secciones porque
 * comparten el almacén unificado (aurora_conversations.folder). RLS por owner.
 * Sincronizado en tiempo real (tabla en supabase_realtime).
 */

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FolderPlus, Folder, Check, Pencil, Trash2, X } from "lucide-react";
import { useChatFolders } from "@/lib/aurora/chat-folders-store";
import { useChatContextMenu } from "@/components/aurora/chat-context-menu";

export function ChatFolders({
  activeConvId,
  folder,
  onPick,
}: {
  activeConvId?: string | null;
  folder?: string | null;
  onPick: (folder: string | null) => void;
}) {
  // Almacén compartido y EN VIVO (Adenda 71-ter · I1): las carpetas creadas en
  // cualquier superficie aparecen aquí al instante (postgres_changes + broadcast).
  // (Agente B1) Ahora también RENOMBRAR y BORRAR folders (nube primero), con
  // storage degradado tolerado por el almacén (safe-storage bajo el caché).
  const { folders: folderObjs, create: createFolder, rename: renameFolder, remove: removeFolder } = useChatFolders();
  // Menú contextual (clic derecho + pulsación larga) sobre las carpetas (Adenda 76).
  const { bind: ctxBind, menu: ctxMenu } = useChatContextMenu({ surface: "agent" });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const create = async () => {
    const n = name.trim();
    if (!n) return;
    await createFolder(n);
    setName(""); setCreating(false);
  };

  const startEdit = (id: string, current: string) => {
    setEditingId(id);
    setEditName(current);
  };
  const commitEdit = async () => {
    const n = editName.trim();
    const id = editingId;
    setEditingId(null);
    if (id && n) await renameFolder(id, n);
  };
  const removeF = async (id: string, fname: string) => {
    // Confirmación mínima: borrar un folder NO borra sus chats (quedan sin folder).
    if (typeof window !== "undefined" && !window.confirm(`¿Borrar el folder «${fname}»? Sus chats no se borran; quedan sin folder.`)) return;
    if (folder === fname) onPick(null);
    await removeFolder(id);
  };

  const assign = async (f: string | null) => {
    onPick(f);
    if (activeConvId) {
      try {
        const sb = createClient();
        await sb.from("aurora_conversations").update({ folder: f }).eq("id", activeConvId);
      } catch { /* */ }
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 py-1.5 border-b border-white/5">
      <button
        onClick={() => assign(null)}
        className={cn(
          "text-[11px] px-2 py-1 rounded-full border transition",
          !folder ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100" : "border-white/10 text-white/50 hover:border-white/30",
        )}
      >
        Todos
      </button>
      {folderObjs.map((fo) =>
        editingId === fo.id ? (
          <span key={fo.id} className="flex items-center gap-1">
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitEdit();
                if (e.key === "Escape") setEditingId(null);
              }}
              className="text-[11px] bg-black/30 border border-white/20 rounded-full px-2 py-1 text-white w-24 outline-none"
            />
            <button onClick={() => void commitEdit()} className="cursor-pointer text-emerald-400 hover:text-emerald-300" title="Guardar">
              <Check className="w-3 h-3" />
            </button>
            <button onClick={() => setEditingId(null)} className="cursor-pointer text-white/50 hover:text-white" title="Cancelar">
              <X className="w-3 h-3" />
            </button>
          </span>
        ) : (
          <span
            key={fo.id}
            {...ctxBind({ kind: "folder", id: fo.name, name: fo.name, folderId: fo.id })}
            className={cn(
              "group text-[11px] px-2 py-1 rounded-full border transition flex items-center gap-1",
              folder === fo.name ? "border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-100" : "border-white/10 text-white/50 hover:border-white/30",
            )}
          >
            <button onClick={() => assign(fo.name)} className="flex items-center gap-1 cursor-pointer" title={`Asignar el chat a «${fo.name}»`}>
              <Folder className="w-3 h-3" /> {fo.name}
              {folder === fo.name && <Check className="w-3 h-3" />}
            </button>
            <button
              onClick={() => startEdit(fo.id, fo.name)}
              className="hidden group-hover:inline cursor-pointer text-white/40 hover:text-white"
              title="Renombrar folder"
            >
              <Pencil className="w-2.5 h-2.5" />
            </button>
            <button
              onClick={() => void removeF(fo.id, fo.name)}
              className="hidden group-hover:inline cursor-pointer text-white/40 hover:text-rose-400"
              title="Borrar folder"
            >
              <Trash2 className="w-2.5 h-2.5" />
            </button>
          </span>
        ),
      )}
      {creating ? (
        <span className="flex items-center gap-1">
          <input
            autoFocus value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") create(); }}
            placeholder="Nombre…"
            className="text-[11px] bg-black/30 border border-white/20 rounded-full px-2 py-1 text-white w-24 outline-none"
          />
          <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={create}>OK</Button>
        </span>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="text-[11px] px-2 py-1 rounded-full border border-dashed border-white/20 text-white/40 hover:text-white/70 hover:border-white/40"
          title="Nuevo folder"
        >
          <FolderPlus className="w-3 h-3 inline mr-1" /> Folder
        </button>
      )}
      {ctxMenu}
    </div>
  );
}
