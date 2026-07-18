"use client";

/**
 * ChatFolders — barra de CARPETAS de chat de Astraura (Adenda 71-bis).
 * Los chats se adjuntan a folders; se ven en todas las secciones porque
 * comparten el almacén unificado (aurora_conversations.folder). RLS por owner.
 * Sincronizado en tiempo real (tabla en supabase_realtime).
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FolderPlus, Folder, Check } from "lucide-react";

export function ChatFolders({
  activeConvId,
  folder,
  onPick,
}: {
  activeConvId?: string | null;
  folder?: string | null;
  onPick: (folder: string | null) => void;
}) {
  const [folders, setFolders] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    try {
      const sb = createClient();
      const { data } = await sb.from("aurora_chat_folders").select("name").order("position");
      setFolders((data || []).map((f: any) => f.name));
    } catch { /* */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    const n = name.trim();
    if (!n) return;
    try {
      const sb = createClient();
      const { data: u } = await sb.auth.getUser();
      if (!u.user) return;
      await sb.from("aurora_chat_folders").insert({ user_id: u.user.id, name: n, position: folders.length });
      setName(""); setCreating(false); await load();
    } catch { /* */ }
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
      {folders.map((f) => (
        <button
          key={f}
          onClick={() => assign(f)}
          className={cn(
            "text-[11px] px-2 py-1 rounded-full border transition flex items-center gap-1",
            folder === f ? "border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-100" : "border-white/10 text-white/50 hover:border-white/30",
          )}
        >
          <Folder className="w-3 h-3" /> {f}
          {folder === f && <Check className="w-3 h-3" />}
        </button>
      ))}
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
          title="Nueva carpeta"
        >
          <FolderPlus className="w-3 h-3 inline mr-1" /> Carpeta
        </button>
      )}
    </div>
  );
}
