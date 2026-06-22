"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, ExternalLink, Link2, MessageSquare, RefreshCw } from "lucide-react";

type Space = { emoji: string; name: string; kind: "Canal" | "Grupo"; url: string };

const BOT = "https://t.me/starseed_nexus_bot";

const SPACES: Space[] = [
  { emoji: "📰", name: "StarSeed · Noticias", kind: "Canal", url: "https://t.me/+lDhIdAJQKvc1ODUx" },
  { emoji: "🧠", name: "Exocórtex & IA", kind: "Canal", url: "https://t.me/+E82hjlKSDCxhMWEx" },
  { emoji: "🏛️", name: "Constitución & Gobernanza", kind: "Canal", url: "https://t.me/+UTB_PNxc9AY2OTJh" },
  { emoji: "🎨", name: "Estudio & Audiomorphic", kind: "Canal", url: "https://t.me/+VIUqsUmMZWczZTYx" },
  { emoji: "🌱", name: "Fundación & Sanghas", kind: "Canal", url: "https://t.me/+PuWkeYCwFzowYmNh" },
  { emoji: "🌌", name: "StarSeed · Comunidad", kind: "Grupo", url: "https://t.me/+eWHmQmw5A5s3ODhh" },
  { emoji: "☕", name: "Café StarSeed", kind: "Grupo", url: "https://t.me/+2X7eBDbCblY4YTc5" },
];

type Msg = { id: string; chat_id: string | null; role: string | null; content: string | null; created_at: string; source: string | null };
type TgLink = { handle: string | null; display_name: string | null; telegram_id: number | null };

export function TelegramSpacesPanel() {
  const [userId, setUserId] = useState<string | null>(null);
  const [link, setLink] = useState<TgLink | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        const { data: tl } = await supabase
          .from("telegram_links")
          .select("handle,display_name,telegram_id")
          .eq("user_id", uid)
          .maybeSingle();
        setLink((tl as TgLink) ?? null);
        const { data: m } = await supabase
          .from("astraura_messages")
          .select("id,chat_id,role,content,created_at,source")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(40);
        setMsgs((m as Msg[]) ?? []);
      }
    } catch {
      /* sin sesión o sin permisos: se muestra el estado vacío */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const connectUrl = userId ? `${BOT}?start=acc_${userId}` : `${BOT}?start=connect`;

  return (
    <div className="space-y-6 p-1">
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-cyan-500 to-fuchsia-600 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-cyan-50">StarSeed Neurocortex · Telegram</span>
            <span className="text-[11px] text-cyan-400/70">El cuerpo de Astraura en Telegram · misma cuenta, mismas memorias</span>
          </div>
          <div className="ml-auto flex gap-2">
            <a href={connectUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="gap-2 bg-cyan-600 hover:bg-cyan-500 text-white">
                <Link2 className="w-4 h-4" /> {userId ? "Conectar mi cuenta" : "Abrir el bot"}
              </Button>
            </a>
            <a href={BOT} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="gap-2 border-cyan-500/30 text-cyan-100">
                <Bot className="w-4 h-4" /> Chatbot
              </Button>
            </a>
          </div>
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-widest text-cyan-400/60 mb-2">Canales y grupos</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {SPACES.map((s) => (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 hover:border-cyan-400/40 hover:bg-cyan-900/20 px-3 py-2.5 transition"
            >
              <span className="text-lg">{s.emoji}</span>
              <span className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-white truncate">{s.name}</span>
                <span className="text-[10px] text-white/40">{s.kind}</span>
              </span>
              <ExternalLink className="w-3.5 h-3.5 text-white/30 ml-auto group-hover:text-cyan-300" />
            </a>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="text-[11px] uppercase tracking-widest text-cyan-400/60">Chats sincronizados desde Telegram</div>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-cyan-300/70" onClick={load}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        {!userId ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
            Inicia sesión en StarSeed OS y conecta tu Telegram para ver aquí tus conversaciones con Astraura. Los chats del bot se
            sincronizan con tu cuenta soberana.
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            {link && (
              <div className="mb-2 text-xs text-cyan-200/70 flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5" /> Telegram vinculado:{" "}
                <span className="font-medium text-cyan-100">{link.display_name || link.handle || link.telegram_id}</span>
              </div>
            )}
            {msgs.length === 0 ? (
              <div className="text-sm text-white/50">
                Aún no hay mensajes sincronizados. Escríbele a{" "}
                <a className="underline text-cyan-300" href={BOT} target="_blank" rel="noopener noreferrer">
                  @starseed_nexus_bot
                </a>{" "}
                y aparecerán aquí.
              </div>
            ) : (
              <ScrollArea className="h-72 pr-3">
                <div className="space-y-2">
                  {msgs.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-lg px-3 py-2 text-sm ${
                        m.role === "user" ? "bg-cyan-600/15 border border-cyan-500/15" : "bg-white/5 border border-white/10"
                      }`}
                    >
                      <div className="flex items-center gap-2 text-[10px] text-white/40 mb-0.5">
                        <span>{m.role === "user" ? "Tú" : "Astraura"}</span>
                        {m.source && <span>· {m.source}</span>}
                        <span className="ml-auto">{new Date(m.created_at).toLocaleString()}</span>
                      </div>
                      <div className="text-white/80 whitespace-pre-wrap">{m.content}</div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default TelegramSpacesPanel;
