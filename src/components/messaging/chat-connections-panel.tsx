"use client";

/**
 * <ChatConnectionsPanel /> — "Conexiones de chat de Astraura/Aurora".
 *
 * Panel real del modelo TRI-FUENTE aplicado a los chats de Aurora/Astraura.
 * Reutiliza la estética de `components/services/tri-source-config.tsx`: una
 * cabecera con gradiente + TRES tarjetas de canal seleccionables a la vez:
 *
 *   • Terminal (dispositivo)  — chat local directo en la app/dispositivo.
 *   • Servidor StarSeed       — chat guardado en StarSeed (Supabase) con Astraura.
 *   • Externo                 — mensajero externo: Telegram (@starseed_nexus_bot),
 *                               Google Chat, WhatsApp o servicio integrable.
 *
 * Cada tarjeta tiene: interruptor de activación, configuración por canal y un
 * interruptor de MEMORIAS/CONTEXTO (qué cerebro/memorias alimentan ese chat).
 * Para Externo→Telegram hay un botón "Conectar Telegram" que abre el deep-link
 * `https://t.me/starseed_nexus_bot?start=acc_<uid>`, registra la intención en
 * `messaging_channels.config` y lee `telegram_links` para mostrar el estado.
 *
 * Persistencia: `@/lib/messaging/messaging-channels` (tabla `messaging_channels`,
 * RLS por owner, Realtime). Los tres canales conviven y se integran con Astraura
 * + Aurora y sus memorias de forma automática.
 *
 * GEN1113E (contrato `architecture/astraura-chats-genesis.md` §2.2): debajo de
 * las tres fuentes, cuatro opciones más, en este orden:
 *   • Telegram (`conexion-telegram.tsx`): TODO lo que tenía la pestaña Telegram
 *     de `/agent` (que desaparece) + dónde se ve cada chat + los puentes.
 *   • Agentes de Genesis, de PoliGenesis y de MetaGenesis (`conexiones-genesis.tsx`),
 *     guardados en `user_settings.prefs.chatsGenesis` (no en esta tabla, D3).
 * `foco` abre y lleva a la vista una opción (lo pasa `/agent` para `?tab=telegram`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  MessagesSquare,
  MonitorSmartphone,
  Sparkles,
  Globe,
  Send,
  Link2,
  KeyRound,
  BrainCircuit,
  Loader2,
  Info,
  CheckCircle2,
  Save,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import {
  loadChannels,
  saveChannel,
  onChannelsChange,
  defaultChannels,
  telegramDeepLink,
  getTelegramLink,
  type MessagingChannel,
  type ChannelScope,
  type TelegramLink,
} from "@/lib/messaging/messaging-channels";
import { ConexionTelegram } from "@/components/messaging/conexion-telegram";
import { ConexionesGenesis, type AccesoMeta } from "@/components/messaging/conexiones-genesis";
import { leerPrefsChatsGenesis, guardarPrefsChatsGenesis } from "@/lib/chats-genesis/vinculos";
import type { PrefsChatsGenesis } from "@/lib/chats-genesis/tipos";
import type { ClienteChatsGenesis } from "@/lib/chats-genesis/puerta-chats";
import { miAccesoMetaGenesis } from "@/lib/metagenesis/accesos";

// ── Metadatos de presentación por canal ──────────────────────────────────────

const SCOPE_META: Record<
  ChannelScope,
  {
    label: string;
    blurb: string;
    icon: React.ComponentType<{ className?: string }>;
    accent: string;
    chip: string;
  }
> = {
  terminal: {
    label: "Terminal (dispositivo)",
    blurb:
      "Chat directo y local en esta app/dispositivo. Respuestas inmediatas de Aurora (con el cerebro Astraura) sin pasar por un servidor.",
    icon: MonitorSmartphone,
    accent: "border-emerald-500/30 bg-emerald-950/15",
    chip: "text-emerald-300 border-emerald-400/40",
  },
  starseed: {
    label: "Servidor StarSeed",
    blurb:
      "Chat guardado en la red StarSeed (conversaciones y mensajes en Supabase) con Astraura. Sincronizado entre tus dispositivos. Activado por defecto.",
    icon: Sparkles,
    accent: "border-violet-500/30 bg-violet-950/15",
    chip: "text-violet-300 border-violet-400/40",
  },
  external: {
    label: "Externo",
    blurb:
      "Conecta un mensajero externo: Telegram (@starseed_nexus_bot), Google Chat, WhatsApp o cualquier servicio integrable con endpoint/webhook.",
    icon: Globe,
    accent: "border-cyan-500/30 bg-cyan-950/15",
    chip: "text-cyan-300 border-cyan-400/40",
  },
};

const SCOPE_ORDER: ChannelScope[] = ["terminal", "starseed", "external"];

const EXTERNAL_PROVIDERS: { value: string; label: string }[] = [
  { value: "telegram", label: "Telegram" },
  { value: "google_chat", label: "Google Chat" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "custom", label: "Otro (endpoint/webhook)" },
];

// ── Props ────────────────────────────────────────────────────────────────────

export interface ChatConnectionsPanelProps {
  className?: string;
  /** Opción que se abre y se lleva a la vista al entrar (contrato §7.4). */
  foco?: "telegram" | "genesis" | "poligenesis" | "metagenesis";
  /** Solo para pruebas: cliente de la puerta del A1 para los puentes. */
  clienteChatsGenesis?: ClienteChatsGenesis;
}

const PREFS_VACIAS: PrefsChatsGenesis = { v: 1, vinculos: [], conexiones: {} };

// ── Componente ───────────────────────────────────────────────────────────────

export function ChatConnectionsPanel({ className, foco, clienteChatsGenesis }: ChatConnectionsPanelProps) {
  const [channels, setChannels] = useState<MessagingChannel[]>(() =>
    defaultChannels(),
  );
  const [loading, setLoading] = useState(true);
  const [savingScope, setSavingScope] = useState<ChannelScope | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [tgLink, setTgLink] = useState<TelegramLink | null>(null);
  // GEN1113E: la opción Telegram (abierta si se llega con `foco="telegram"`), las
  // preferencias de Chats de Genesis (una lectura para todas las opciones) y el
  // acceso a MetaGenesis (decide qué se pinta; quién puede qué lo dice el servidor).
  const [telegramAbierto, setTelegramAbierto] = useState(foco === "telegram");
  const [prefsCG, setPrefsCG] = useState<PrefsChatsGenesis | null>(null);
  const [acceso, setAcceso] = useState<AccesoMeta>(null);
  const prefsRef = useRef<PrefsChatsGenesis | null>(null);
  prefsRef.current = prefsCG;

  useEffect(() => {
    if (foco === "telegram") setTelegramAbierto(true);
  }, [foco]);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      leerPrefsChatsGenesis().catch(() => PREFS_VACIAS),
      miAccesoMetaGenesis().catch(() => null),
    ]).then(([p, a]) => {
      if (!alive) return;
      setPrefsCG(p);
      setAcceso(a);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Con `foco="telegram"`, la opción ya está abierta: al terminar de cargar se lleva a la vista.
  useEffect(() => {
    if (loading || foco !== "telegram") return;
    document.getElementById("conexion-telegram")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [loading, foco]);

  const guardarPrefsCG = useCallback(async (siguiente: PrefsChatsGenesis): Promise<boolean> => {
    const anterior = prefsRef.current;
    setPrefsCG(siguiente);
    try {
      await guardarPrefsChatsGenesis(siguiente);
      toast.success("Guardado en tu cuenta");
      return true;
    } catch {
      setPrefsCG(anterior);
      toast.error("No se pudo guardar; no ha cambiado nada");
      return false;
    }
  }, []);

  const verOpcionTelegram = useCallback(() => {
    setTelegramAbierto(true);
    setTimeout(() => document.getElementById("conexion-telegram")?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 0);
  }, []);

  // Evita pisar ediciones locales con un eco de Realtime de nuestro guardado.
  const dirtyRef = useRef(false);

  // Carga inicial + sesión + estado Telegram.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const sb = createClient();
        const { data } = await sb.auth.getUser();
        if (alive) setAccountId(data?.user?.id ?? null);
      } catch {
        /* sin sesión */
      }
      const [chs, link] = await Promise.all([loadChannels(), getTelegramLink()]);
      if (!alive) return;
      setChannels(chs);
      setTgLink(link);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Realtime: aplica cambios entrantes salvo edición local en curso.
  useEffect(() => {
    const unsub = onChannelsChange((chs) => {
      if (dirtyRef.current) return;
      setChannels(chs);
    });
    return unsub;
  }, []);

  const byScope = useMemo(() => {
    const m = new Map<ChannelScope, MessagingChannel>();
    channels.forEach((c) => m.set(c.scope, c));
    return m;
  }, [channels]);

  const enabledCount = useMemo(
    () => channels.filter((c) => c.enabled).length,
    [channels],
  );

  const patch = useCallback(
    (scope: ChannelScope, p: Partial<MessagingChannel>) => {
      dirtyRef.current = true;
      setChannels((prev) =>
        prev.map((c) => (c.scope === scope ? { ...c, ...p } : c)),
      );
    },
    [],
  );

  const patchConfig = useCallback(
    (scope: ChannelScope, key: string, value: unknown) => {
      dirtyRef.current = true;
      setChannels((prev) =>
        prev.map((c) =>
          c.scope === scope
            ? { ...c, config: { ...c.config, [key]: value } }
            : c,
        ),
      );
    },
    [],
  );

  const setContextNotes = useCallback((scope: ChannelScope, notes: string) => {
    dirtyRef.current = true;
    setChannels((prev) =>
      prev.map((c) =>
        c.scope === scope ? { ...c, context: { ...c.context, notes } } : c,
      ),
    );
  }, []);

  const persist = useCallback(
    async (scope: ChannelScope) => {
      const ch = channels.find((c) => c.scope === scope);
      if (!ch) return;
      setSavingScope(scope);
      try {
        const saved = await saveChannel(ch);
        setChannels((prev) => prev.map((c) => (c.scope === scope ? saved : c)));
        toast.success("Canal guardado");
      } catch {
        toast.error("No se pudo guardar el canal");
      } finally {
        setSavingScope(null);
        dirtyRef.current = false;
      }
    },
    [channels],
  );

  // Conectar Telegram: registra la intención en config, guarda y abre el bot.
  const connectTelegram = useCallback(async () => {
    const url = telegramDeepLink(accountId);
    const ext = channels.find((c) => c.scope === "external");
    const nextConfig = {
      ...(ext?.config ?? {}),
      telegram_intent: true,
      account_id: accountId ?? null,
      deep_link: url,
      requested_at: new Date().toISOString(),
    };
    const next: MessagingChannel = {
      ...(ext ?? { scope: "external", config: {}, context: {} }),
      scope: "external",
      provider: "telegram",
      enabled: true,
      memory_enabled: ext?.memory_enabled ?? true,
      context: ext?.context ?? {},
      config: nextConfig,
    };
    setChannels((prev) => prev.map((c) => (c.scope === "external" ? next : c)));
    try {
      await saveChannel(next);
    } catch {
      /* se reintentará al guardar manualmente */
    }
    try {
      window.open(url, "_blank", "noopener");
    } catch {
      window.location.href = url;
    }
    toast.success("Abriendo @starseed_nexus_bot para vincular tu cuenta");
  }, [accountId, channels]);

  return (
    <div className={cn("space-y-5", className)}>
      {/* Cabecera + explicación */}
      <Card className="bg-gradient-to-br from-primary/10 via-background/40 to-accent/10 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessagesSquare className="h-5 w-5 text-primary" />
            Conexiones de chat de Astraura/Aurora
            <Badge
              variant="outline"
              className="ml-auto border-primary/30 text-primary text-[10px]"
            >
              {enabledCount} de 3 activas
            </Badge>
          </CardTitle>
          <CardDescription className="leading-relaxed">
            Elige por dónde quieres conversar con Aurora (con el cerebro
            Astraura). Las <strong>tres fuentes</strong> pueden estar activas a la
            vez, cada una con su configuración y sus memorias/contexto. Aurora y
            Astraura se integran en todas de forma automática e inteligente.
          </CardDescription>
        </CardHeader>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando conexiones…
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {SCOPE_ORDER.map((scope) => {
            const c = byScope.get(scope)!;
            const meta = SCOPE_META[scope];
            const Icon = meta.icon;
            const isStarseed = scope === "starseed";
            const isExternal = scope === "external";
            // GEN1113E: el selector ya mostraba «Telegram» cuando el proveedor guardado no es
            // ninguno de la lista (p. ej. "none", el valor por defecto); ahora lo de debajo
            // corresponde a lo que se ve en el selector.
            const isTelegram =
              isExternal &&
              (EXTERNAL_PROVIDERS.some((p) => p.value === c.provider) ? c.provider : "telegram") === "telegram";
            const saving = savingScope === scope;
            return (
              <Card
                key={scope}
                className={cn(
                  "backdrop-blur-sm transition flex flex-col",
                  c.enabled
                    ? meta.accent
                    : "border-white/5 bg-background/40 opacity-80",
                )}
              >
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{meta.label}</span>
                    </CardTitle>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.enabled && (
                        <Badge
                          variant="outline"
                          className={cn("text-[9px]", meta.chip)}
                        >
                          Activa
                        </Badge>
                      )}
                      {isStarseed && (
                        <Badge
                          variant="outline"
                          className="text-[9px] text-violet-300/80 border-violet-400/30"
                        >
                          Por defecto
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Switch
                    checked={c.enabled}
                    onCheckedChange={(v) => patch(scope, { enabled: v })}
                  />
                </CardHeader>

                <CardContent className="space-y-3 flex-1">
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {meta.blurb}
                  </p>

                  {/* Servidor StarSeed: destino gestionado */}
                  {isStarseed && (
                    <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-muted-foreground">
                      Gestionado por StarSeed · tus chats se guardan en
                      <span className="font-mono"> conversations/messages</span> y
                      se sincronizan con tu cuenta soberana.
                    </div>
                  )}

                  {/* Terminal: nota local */}
                  {scope === "terminal" && (
                    <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-muted-foreground">
                      Conversación local en este dispositivo. No requiere
                      configuración.
                    </div>
                  )}

                  {/* Externo: selección de proveedor + config */}
                  {isExternal && (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                          <Globe className="h-3 w-3" /> Servicio
                        </label>
                        <select
                          value={
                            EXTERNAL_PROVIDERS.some((p) => p.value === c.provider)
                              ? c.provider
                              : "telegram"
                          }
                          onChange={(e) =>
                            patch(scope, { provider: e.target.value })
                          }
                          disabled={!c.enabled}
                          className="w-full rounded-md border border-white/10 bg-background/60 px-2 py-2 text-xs text-foreground disabled:opacity-50"
                        >
                          {EXTERNAL_PROVIDERS.map((p) => (
                            <option
                              key={p.value}
                              value={p.value}
                              className="bg-zinc-900"
                            >
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Telegram: su opción propia, más abajo (GEN1113E) */}
                      {isTelegram ? (
                        <div className="space-y-2 rounded-lg border border-cyan-500/20 bg-cyan-950/15 p-3">
                          <div className="flex items-center gap-2 text-[11px] text-cyan-100/85">
                            <Send className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                            <span>
                              {tgLink ? (
                                <>
                                  <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-emerald-300" />
                                  Conectado: {tgLink.display_name || tgLink.handle || tgLink.telegram_id}
                                </>
                              ) : (
                                "La vinculación, los canales y los chats de Telegram tienen su propia opción."
                              )}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={verOpcionTelegram}
                            className="w-full gap-2 border-cyan-500/30 text-cyan-100"
                          >
                            <Link2 className="h-4 w-4" />
                            Ver la opción Telegram
                          </Button>
                        </div>
                      ) : (
                        // Otros proveedores: endpoint/webhook + referencia de clave
                        <div className="space-y-2">
                          <div className="space-y-1">
                            <label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                              <Link2 className="h-3 w-3" /> Endpoint / Webhook
                            </label>
                            <Input
                              value={
                                (c.config?.endpoint as string | undefined) ?? ""
                              }
                              onChange={(e) =>
                                patchConfig(scope, "endpoint", e.target.value)
                              }
                              placeholder="https://servicio.ejemplo/webhook"
                              disabled={!c.enabled}
                              className="bg-background/60 border-white/10 font-mono text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                              <KeyRound className="h-3 w-3 text-amber-400" />
                              Referencia de clave
                            </label>
                            <Input
                              value={
                                (c.config?.key_ref as string | undefined) ?? ""
                              }
                              onChange={(e) =>
                                patchConfig(scope, "key_ref", e.target.value)
                              }
                              placeholder="alias en la bóveda (no el secreto)"
                              disabled={!c.enabled}
                              className="bg-background/60 border-white/10 font-mono text-xs"
                            />
                            <p className="text-[9px] leading-snug text-amber-300/60">
                              Sólo un alias. El secreto se cifra en tu navegador;
                              no se guarda aquí en claro.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Memorias / contexto — qué cerebro alimenta este chat */}
                  <div className="space-y-1 rounded-lg border border-fuchsia-500/15 bg-fuchsia-950/10 p-3">
                    <label className="flex items-center justify-between gap-2 text-[11px] text-fuchsia-100/85">
                      <span className="flex items-center gap-1.5">
                        <BrainCircuit className="h-3.5 w-3.5 text-fuchsia-300" />
                        Memorias / contexto
                      </span>
                      <Switch
                        checked={c.memory_enabled}
                        onCheckedChange={(v) =>
                          patch(scope, { memory_enabled: v })
                        }
                      />
                    </label>
                    <p className="text-[9px] leading-snug text-fuchsia-300/60">
                      {c.memory_enabled
                        ? "Astraura usará tus memorias y contexto en este chat."
                        : "Este chat no leerá tus memorias (sólo conversación directa)."}
                    </p>
                    {c.memory_enabled && (
                      <Textarea
                        value={(c.context?.notes as string | undefined) ?? ""}
                        onChange={(e) => setContextNotes(scope, e.target.value)}
                        placeholder="Qué memorias/cerebro priorizar en este chat (opcional)…"
                        className="min-h-[44px] bg-background/60 border-white/10 text-[11px]"
                      />
                    )}
                  </div>
                </CardContent>

                <div className="px-6 pb-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => persist(scope)}
                    disabled={saving}
                    className="w-full gap-2"
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Guardar
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* GEN1113E: Telegram y los agentes de Genesis, PoliGenesis y MetaGenesis */}
      {!loading && (
        <div className="space-y-3">
          <ConexionTelegram
            abierto={telegramAbierto}
            onAlternar={() => setTelegramAbierto((v) => !v)}
            accountId={accountId}
            tgLink={tgLink}
            onConectar={() => void connectTelegram()}
            prefs={prefsCG}
            acceso={acceso}
            onGuardar={guardarPrefsCG}
            cliente={clienteChatsGenesis}
          />
          <ConexionesGenesis
            foco={foco === "telegram" ? undefined : foco}
            prefs={prefsCG}
            acceso={acceso}
            onGuardar={guardarPrefsCG}
          />
        </div>
      )}

      {/* Aviso contextual */}
      {!loading && (
        <div className="flex items-start gap-2 rounded-lg border border-cyan-500/20 bg-cyan-950/15 px-3 py-2 text-[11px] leading-relaxed text-cyan-100/85">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
          <span>
            {enabledCount === 0
              ? "No hay canales activos: activa al menos uno para conversar con Aurora."
              : "Tus canales activos conviven. Aurora (con Astraura) responde en cada uno y, si la memoria está activada, comparte el mismo cerebro y memorias en todos."}
          </span>
        </div>
      )}
    </div>
  );
}

export default ChatConnectionsPanel;
