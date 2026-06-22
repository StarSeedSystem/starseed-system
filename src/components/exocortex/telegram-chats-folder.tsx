"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { ChevronRight, ChevronDown, Folder, ExternalLink, RefreshCw } from "lucide-react";
import { TG_SPACES } from "@/lib/telegram-spaces";
import { cn } from "@/lib/utils";

type Msg = { id: string; chat_id: string | null; role: string | null; content: string | null; created_at: string };

export function TelegramChatsFolder({ defaultOpen = true }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [sel, setSel] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [byChat, setByChat] = useState<Record<string, Msg[]>>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        const { data: m } = await supabase
          .from("astraura_messages")
          .select("id,chat_id,role,content,created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(300);
        const g: Record<string, Msg[]> = {};
        ((m as Msg[]) || []).forEach((x) => {
          const k = x.chat_id || "dm";
          (g[k] = g[k] || []).push(x);
        });
        setByChat(g);
      }
    } catch {
      /* sin sesión / sin permisos */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const spaceIds = new Set(TG_SPACES.map((s) => s.chatId));
  const dmMsgs = Object.entries(byChat)
    .filter(([k]) => !spaceIds.has(k))
    .flatMap(([, v]) => v)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const connectUrl = userId
    ? `https://t.me/starseed_nexus_bot?start=acc_${userId}`
    : `https://t.me/starseed_nexus_bot?start=connect`;

  const chats = [
    { key: "dm", emoji: "🤖", name: "Chatbot personal", kind: "Privado", url: "https://t.me/starseed_nexus_bot", msgs: dmMsgs },
    ...TG_SPACES.map((s) => ({ key: s.chatId, emoji: s.emoji, name: s.name, kind: s.kind, url: s.url, msgs: byChat[s.chatId] || [] })),
  ];

  return (
    <div className="space-y-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center px-2 py-1.5 text-xs font-semibold text-cyan-300/80 hover:text-cyan-200"
      >
        {open ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
        <Folder className="w-3 h-3 mr-2 text-cyan-400" /> Telegram
        <RefreshCw
          onClick={(e) => {
            e.stopPropagation();
            load();
          }}
          className={cn("w-3 h-3 ml-auto text-cyan-500/40 hover:text-cyan-300", loading && "animate-spin")}
        />
      </button>
      {open && (
        <div className="ml-2 space-y-0.5 border-l border-cyan-500/10 pl-2">
          {!userId && (
            <a href={connectUrl} target="_blank" rel="noopener noreferrer" className="block text-[11px] text-cyan-400/70 hover:text-cyan-200 px-2 py-1">
              Conecta tu Telegram con el bot →
            </a>
          )}
          {chats.map((c) => (
            <div key={c.key}>
              <button
                onClick={() => setSel((s) => (s === c.key ? null : c.key))}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition",
                  sel === c.key ? "bg-cyan-500/15" : "hover:bg-white/5",
                )}
              >
                <span className="text-sm">{c.emoji}</span>
                <span className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-medium text-cyan-100 truncate">{c.name}</span>
                  <span className="text-[9px] text-cyan-500/50">
                    {c.kind}
                    {c.msgs.length ? ` · ${c.msgs.length} msg` : ""}
                  </span>
                </span>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-cyan-500/40 hover:text-cyan-300"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </button>
              {sel === c.key && (
                <div className="ml-6 my-1 space-y-1 max-h-56 overflow-y-auto pr-1">
                  {c.msgs.length === 0 ? (
                    <div className="text-[10px] text-cyan-500/40 px-2 py-1">
                      {c.key === "dm" ? "Habla con el bot y tus mensajes aparecerán aquí." : "Abre el espacio en Telegram ↗"}
                    </div>
                  ) : (
                    c.msgs.slice(0, 40).map((m) => (
                      <div
                        key={m.id}
                        className={cn("rounded px-2 py-1 text-[11px]", m.role === "user" ? "bg-cyan-600/15 text-cyan-50" : "bg-white/5 text-white/75")}
                      >
                        <span className="block whitespace-pre-wrap line-clamp-3">{m.content}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TelegramChatsFolder;
