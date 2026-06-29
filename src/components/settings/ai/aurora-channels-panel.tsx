"use client";

// ════════════════════════════════════════════════════════════════
// AuroraChannelsPanel — Canales de Aurora / Astraura (Ajustes → IA)
// ----------------------------------------------------------------
// Configura POR DÓNDE habla Aurora: el chat interno del OS + canales
// externos (Telegram, Google Chat o cualquier API). Uno o varios,
// sincronizados con todas las funciones de Aurora. Defaults simples
// (chat interno activo); el resto se añade de forma progresiva.
//
// Cada canal tiene un PERMISO en el cerebro: lectura / notificar /
// acceso total. "Acceso total" = el chat puede usar TODO el cerebro
// conectado: memorias (memory root), terminales de servidores y
// servicios de IA. Los SECRETOS (bot token, OAuth) NO se guardan aquí
// en claro; se configuran de forma segura al activar la conexión real.
// Diseño: architecture/cerebros-chat-outputs.md
// ════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Radio, Send, Plus, Trash2, ShieldCheck, MessageSquare, Globe, Lock, Sparkles, Bot } from "lucide-react";
import { toast } from "sonner";
import { TG_SPACES } from "@/lib/telegram-spaces";
import { OssLibraryBrowser } from "./oss-library-browser";

export type ChannelPermission = "read" | "notify" | "full";
export type ChannelKind = "aurora" | "telegram" | "googlechat" | "custom";

export interface AuroraChannel {
  id: string;
  kind: ChannelKind;
  label: string;
  enabled: boolean;
  permission: ChannelPermission;
  /** chatId (telegram) | webhook/space URL (googlechat/custom) */
  target?: string;
}

const STORAGE_KEY = "starseed.aurora.channels.v1";

const DEFAULT_CHANNELS: AuroraChannel[] = [
  { id: "aurora-internal", kind: "aurora", label: "Aurora · Chat del OS", enabled: true, permission: "full" },
];

export function loadAuroraChannels(): AuroraChannel[] {
  if (typeof window === "undefined") return DEFAULT_CHANNELS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AuroraChannel[];
  } catch { /* noop */ }
  return DEFAULT_CHANNELS;
}

export function saveAuroraChannels(items: AuroraChannel[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* noop */ }
}

function kindIcon(kind: ChannelKind) {
  if (kind === "aurora") return <Sparkles className="h-4 w-4 text-primary" />;
  if (kind === "telegram") return <Send className="h-4 w-4 text-sky-400" />;
  if (kind === "googlechat") return <MessageSquare className="h-4 w-4 text-emerald-400" />;
  return <Globe className="h-4 w-4 text-amber-400" />;
}

export function AuroraChannelsPanel() {
  const [channels, setChannels] = useState<AuroraChannel[]>(DEFAULT_CHANNELS);

  useEffect(() => { setChannels(loadAuroraChannels()); }, []);

  function persist(next: AuroraChannel[]) { setChannels(next); saveAuroraChannels(next); }
  function update(id: string, patch: Partial<AuroraChannel>) {
    persist(channels.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function remove(id: string) { persist(channels.filter((c) => c.id !== id)); }

  function addTelegram(space: (typeof TG_SPACES)[number]) {
    if (channels.some((c) => c.kind === "telegram" && c.target === space.chatId)) {
      toast.message("Ese canal de Telegram ya está añadido."); return;
    }
    persist([...channels, {
      id: `tg-${space.chatId}`, kind: "telegram", label: `${space.emoji} ${space.name}`,
      enabled: false, permission: "notify", target: space.chatId,
    }]);
    toast.success(`Canal añadido: ${space.name}`);
  }
  function addGoogleChat() {
    persist([...channels, { id: `gc-${Date.now()}`, kind: "googlechat", label: "Google Chat · Espacio", enabled: false, permission: "notify", target: "" }]);
  }
  function addCustom() {
    persist([...channels, { id: `custom-${Date.now()}`, kind: "custom", label: "Canal personalizado (API)", enabled: false, permission: "notify", target: "" }]);
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="bg-gradient-to-br from-sky-500/10 via-background/40 to-primary/10 border-sky-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Radio className="h-5 w-5 text-sky-400" /> Canales de Aurora</CardTitle>
          <CardDescription className="leading-relaxed">
            Elige por dónde habla <strong>Aurora</strong>: el chat interno del OS y, opcionalmente, canales externos
            (<strong>Telegram</strong>, <strong>Google Chat</strong> o cualquier servicio con API). Activa
            <strong> uno o varios</strong>, sincronizados con todas las funciones de Aurora. Empiezas simple
            (solo el chat del OS) y añades canales cuando quieras.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Añadir canal */}
      <Card className="bg-background/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4 text-emerald-400" /> Añadir un canal</CardTitle>
          <CardDescription>Telegram (canales StarSeed), Google Chat o un canal por API.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Telegram · canales StarSeed</p>
            <div className="flex flex-wrap gap-2">
              {TG_SPACES.map((s) => (
                <button key={s.chatId} onClick={() => addTelegram(s)}
                  className="text-xs rounded-full border border-white/10 bg-black/20 hover:border-sky-400/50 hover:bg-sky-400/5 px-3 py-1.5 transition cursor-pointer">
                  {s.emoji} {s.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={addGoogleChat} className="gap-2"><MessageSquare className="h-3.5 w-3.5" /> Google Chat</Button>
            <Button variant="outline" size="sm" onClick={addCustom} className="gap-2"><Globe className="h-3.5 w-3.5" /> Canal por API</Button>
          </div>
        </CardContent>
      </Card>

      {/* Canales configurados */}
      <div className="space-y-3">
        {channels.map((c) => (
          <Card key={c.id} className={`bg-background/40 backdrop-blur-sm border ${c.enabled ? "border-sky-400/40" : "border-white/5"}`}>
            <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {kindIcon(c.kind)}
                  <CardTitle className="text-base">{c.label}</CardTitle>
                  {c.kind === "aurora" && <Badge variant="outline" className="text-primary border-primary/40">Predeterminado</Badge>}
                  {c.permission === "full" && <Badge variant="outline" className="text-amber-300 border-amber-300/40 gap-1"><Lock className="h-3 w-3" /> Acceso total</Badge>}
                </div>
                <CardDescription className="text-xs">
                  {c.kind === "aurora" && "El chat de Aurora dentro del OS. Siempre disponible."}
                  {c.kind === "telegram" && "Aurora lee y responde en este canal de Telegram (mismo cuerpo, mismas memorias)."}
                  {c.kind === "googlechat" && "Aurora habla en un espacio de Google Chat vía webhook."}
                  {c.kind === "custom" && "Conecta cualquier servicio de chat por su API/webhook."}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={c.enabled} onCheckedChange={(v) => update(c.id, { enabled: v })} />
                {c.kind !== "aurora" && (
                  <Button variant="ghost" size="icon" onClick={() => remove(c.id)} title="Quitar"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {c.kind !== "aurora" && (
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase text-muted-foreground">Etiqueta</label>
                    <Input value={c.label} onChange={(e) => update(c.id, { label: e.target.value })} className="bg-background/60 border-white/10" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase text-muted-foreground">
                      {c.kind === "telegram" ? "Chat ID" : c.kind === "googlechat" ? "Webhook del espacio" : "Endpoint / Webhook (API)"}
                    </label>
                    <Input value={c.target ?? ""} onChange={(e) => update(c.id, { target: e.target.value })}
                      className="bg-background/60 border-white/10 font-mono text-xs"
                      placeholder={c.kind === "telegram" ? "-100..." : "https://..."} />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <div className="space-y-1 max-w-xs">
                  <label className="text-[10px] uppercase text-muted-foreground">Permiso en el cerebro</label>
                  <Select value={c.permission} onValueChange={(v) => update(c.id, { permission: v as ChannelPermission })}>
                    <SelectTrigger className="bg-background/60 border-white/10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="read">Solo lectura</SelectItem>
                      <SelectItem value="notify">Notificar</SelectItem>
                      <SelectItem value="full">Acceso total (memorias · terminales · IA)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {c.permission === "full" && (
                  <p className="text-[11px] text-amber-300/80 flex items-start gap-1.5">
                    <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    Acceso total: este chat podrá usar todo el cerebro conectado — memorias, terminales de servidores y servicios de IA.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Catálogo de código abierto: plataformas de chat self-host */}
      <Card className="bg-background/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-base">Plataformas de chat de código abierto</CardTitle>
          <CardDescription>Self-host para tus propios canales (además de Telegram / Google Chat).</CardDescription>
        </CardHeader>
        <CardContent>
          <OssLibraryBrowser category="chat-channel" />
        </CardContent>
      </Card>

      {/* Footer */}
      <Card className="bg-background/20 border-white/5">
        <CardContent className="pt-6 text-xs text-muted-foreground space-y-2">
          <p className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>Los <strong>secretos</strong> (bot token, OAuth) no se guardan aquí en claro; se configuran de forma segura al activar la conexión real en el cerebro/servidor.</span></p>
          <p className="flex items-start gap-2"><Bot className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
            <span>Aurora es la base de todos los canales: usa tus proveedores de IA y elige inteligentemente según el contexto de cada chat. Aún <strong>no</strong> está conectado a tu cuenta StarSeed.</span></p>
        </CardContent>
      </Card>
    </div>
  );
}
