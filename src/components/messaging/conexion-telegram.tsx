"use client";

/**
 * <ConexionTelegram /> — la opción «Telegram» de «Conexiones de chat» (GEN1113E, contrato
 * `architecture/astraura-chats-genesis.md` §2.2). Recoge TODO lo que tenía la pestaña Telegram de
 * `/agent`, que desaparece:
 *
 *   1. Vinculación de la cuenta: «Conectar Telegram» / «Reconectar Telegram», el estado de
 *      `telegram_links` y el registro en `messaging_channels.external.config` (lo hace el panel,
 *      igual que antes; aquí solo se pinta).
 *   2. `TelegramSpacesPanel` montado SIN cambios: bot, «Conectar mi cuenta», «Chatbot», los siete
 *      canales y grupos de StarSeed y los mensajes sincronizados en tiempo real.
 *   3. Nuevo: por cada chat sincronizado, «Mostrar en Chats» y «Mostrar en Genesis» (vínculos, §2.4).
 *   4. Nuevo, solo con acceso a MetaGenesis: los tres puentes de Telegram con su último aviso,
 *      leído del espejo de la puerta del A1, y «Abrir en Genesis». Los tokens nunca se ven ni viajan.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Send, Link2, ExternalLink, CheckCircle2, ChevronDown, ChevronRight, Loader2, RadioTower, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AvisoSesion } from "@/components/auth/aviso-sesion";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { TelegramSpacesPanel } from "@/components/exocortex/telegram-spaces-panel";
import type { TelegramLink } from "@/lib/messaging/messaging-channels";
import type { Bandeja, PrefsChatsGenesis, PuenteTelegram, FuenteChat } from "@/lib/chats-genesis/tipos";
import { idDeVinculo, vincular, cambiarBandejas } from "@/lib/chats-genesis/vinculos";
import { crearClienteChatsGenesis, estadoEspejo, type ClienteChatsGenesis } from "@/lib/chats-genesis/puerta-chats";
import type { AccesoMeta } from "./conexiones-genesis";

/** Los tres puentes de §1.5 (decisión D1). Sus nombres siguen la guardia de `nombre-genesis.test.ts`. */
export const PUENTES: { id: PuenteTelegram; nombre: string; que: string; soloDueno: boolean }[] = [
  { id: "hermes-avisos", nombre: "Hermes y avisos", que: "Conversación con Hermes y las órdenes del puente.", soloDueno: true },
  { id: "peticiones", nombre: "Peticiones y encargos", que: "Peticiones a NotebookLM y encargos largos; lo atiende el A1.", soloDueno: true },
  { id: "avisos-directores", nombre: "Avisos de los directores", que: "Solo lectura: los avisos de los directores.", soloDueno: false },
];

export interface ConexionTelegramProps {
  abierto: boolean;
  onAlternar: () => void;
  accountId: string | null;
  tgLink: TelegramLink | null;
  /** Registra la intención en `messaging_channels.external.config` y abre el bot (como antes). */
  onConectar: () => void;
  prefs: PrefsChatsGenesis | null;
  acceso: AccesoMeta;
  onGuardar: (siguiente: PrefsChatsGenesis) => Promise<boolean>;
  /** Para pruebas; por defecto, el cliente de la puerta del A1. */
  cliente?: ClienteChatsGenesis;
}

export function ConexionTelegram(props: ConexionTelegramProps) {
  const { abierto, onAlternar, accountId, tgLink, onConectar } = props;
  const Chevron = abierto ? ChevronDown : ChevronRight;
  return (
    <Card id="conexion-telegram" data-abierta={abierto ? "si" : "no"} className={cn("scroll-mt-4 backdrop-blur-sm transition", abierto ? "border-cyan-500/30 bg-cyan-950/15" : "border-white/10 bg-background/40")}>
      <CardHeader className="pb-3">
        <button type="button" onClick={onAlternar} aria-expanded={abierto} aria-controls="conexion-telegram-cuerpo" className="flex w-full min-w-0 items-center gap-2 text-left">
          <Send className="h-4 w-4 shrink-0 text-cyan-300" />
          <CardTitle className="min-w-0 flex-1 text-sm">Telegram</CardTitle>
          <span className="hidden min-w-0 truncate text-[11px] text-cyan-200/70 sm:inline">
            {tgLink ? `Vinculado: ${tgLink.display_name || tgLink.handle || tgLink.telegram_id}` : "Sin vincular"}
          </span>
          <Chevron className="h-4 w-4 shrink-0 text-cyan-300/70" />
        </button>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          El bot de Astraura en Telegram, los canales y grupos de StarSeed, los chats que llegan desde Telegram
          {props.acceso?.miembro ? " y los puentes de Telegram de MetaGenesis" : ""}.
        </p>
      </CardHeader>
      {abierto && (
        <CardContent id="conexion-telegram-cuerpo" className="space-y-5">
          <div className="space-y-2 rounded-lg border border-cyan-500/20 bg-cyan-950/15 p-3">
            <div className="flex items-start gap-2 text-[11px] text-cyan-100/85">
              <Send className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
              <span>Vincula tu cuenta StarSeed con el bot de Telegram <span className="font-mono">@starseed_nexus_bot</span>.</span>
            </div>
            {tgLink ? (
              <div className="flex items-center gap-2 text-[11px] text-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5" /> Conectado:{" "}
                <span className="font-medium">{tgLink.display_name || tgLink.handle || tgLink.telegram_id}</span>
              </div>
            ) : (
              <div className="text-[10px] text-cyan-300/70">
                {accountId
                  ? "Aún no vinculado. Pulsa el botón y envía /start al bot."
                  : "Inicia sesión en StarSeed para vincular tu cuenta. Puedes abrir el bot igualmente."}
              </div>
            )}
            <Button size="sm" onClick={onConectar} className="w-full gap-2 bg-cyan-600 text-white hover:bg-cyan-500 sm:w-auto">
              <Link2 className="h-4 w-4" />
              {tgLink ? "Reconectar Telegram" : "Conectar Telegram"}
              <ExternalLink className="h-3 w-3 opacity-70" />
            </Button>
          </div>

          <TelegramSpacesPanel />

          <ChatsSincronizados accountId={accountId} prefs={props.prefs} onGuardar={props.onGuardar} />

          {props.acceso?.miembro && <PuentesTelegram dueno={props.acceso.dueno} cliente={props.cliente} />}
        </CardContent>
      )}
    </Card>
  );
}

type ChatTg = { chatId: string; ultimo: string; n: number; muestra: string };

/** Agrupa los mensajes que llegaron desde Telegram por chat (pura; probada aparte). */
export function agruparChatsTelegram(filas: { chat_id: string | null; content: string | null; created_at: string }[]): ChatTg[] {
  const m = new Map<string, ChatTg>();
  for (const f of filas) {
    if (!f.chat_id) continue;
    const prev = m.get(f.chat_id);
    if (!prev) m.set(f.chat_id, { chatId: f.chat_id, ultimo: f.created_at, n: 1, muestra: (f.content ?? "").slice(0, 80) });
    else {
      prev.n += 1;
      if (f.created_at > prev.ultimo) {
        prev.ultimo = f.created_at;
        prev.muestra = (f.content ?? "").slice(0, 80);
      }
    }
  }
  return [...m.values()].sort((a, b) => b.ultimo.localeCompare(a.ultimo));
}

function ChatsSincronizados({ accountId, prefs, onGuardar }: { accountId: string | null; prefs: PrefsChatsGenesis | null; onGuardar: (p: PrefsChatsGenesis) => Promise<boolean> }) {
  const [chats, setChats] = useState<ChatTg[] | null>(null);
  const [fallo, setFallo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    let vivo = true;
    void (async () => {
      try {
        const { data, error } = await createClient()
          .from("astraura_messages")
          .select("chat_id,content,created_at")
          .eq("user_id", accountId)
          .ilike("source", "%telegram%")
          .order("created_at", { ascending: false })
          .limit(300);
        if (!vivo) return;
        if (error) setFallo(true);
        setChats(agruparChatsTelegram((data ?? []) as { chat_id: string | null; content: string | null; created_at: string }[]));
      } catch {
        if (vivo) {
          setFallo(true);
          setChats([]);
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, [accountId]);

  const poner = useCallback(
    async (c: ChatTg, bandeja: Bandeja, si: boolean) => {
      if (!prefs) return;
      const fuente: FuenteChat = { tipo: "telegram-sincronizado", chatId: c.chatId };
      const id = idDeVinculo(fuente);
      const v = prefs.vinculos.find((x) => x.id === id);
      const antes: Bandeja[] = v ? v.en : ["chats"];
      const en = (["chats", "genesis"] as Bandeja[]).filter((b) => (b === bandeja ? si : antes.includes(b)));
      if (en.length === 0) return; // un chat siempre está en algún sitio; el interruptor ya lo impide
      const ahora = new Date().toISOString();
      setGuardando(true);
      try {
        const siguiente = v
          ? cambiarBandejas(prefs, id, en, ahora)
          : vincular(prefs, { fuente, nivel: "genesis", entidad: null, en, titulo: `Telegram · ${c.muestra || c.chatId}`.slice(0, 120) }, ahora);
        await onGuardar(siguiente);
      } catch {
        toast.error("No se pudo cambiar dónde se ve este chat (¿500 vínculos?); no ha cambiado nada");
      } finally {
        setGuardando(false);
      }
    },
    [prefs, onGuardar],
  );

  return (
    <section aria-labelledby="tg-sinc-titulo">
      <h3 id="tg-sinc-titulo" className="mb-2 text-[11px] uppercase tracking-widest text-cyan-400/60">Dónde se ven los chats de Telegram</h3>
      {!accountId ? (
        <AvisoSesion compacto texto="Inicia sesión para elegir dónde se ven tus chats de Telegram." />
      ) : chats === null || !prefs ? (
        <p className="flex items-center gap-2 text-[11px] text-white/50"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando chats de Telegram…</p>
      ) : chats.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-[11px] text-white/60">
          {fallo ? "No se pudieron leer tus chats de Telegram; vuelve a abrir esta opción en un rato." : "Aún no hay chats que hayan llegado desde Telegram a tu cuenta."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {chats.map((c) => {
            const v = prefs.vinculos.find((x) => x.id === idDeVinculo({ tipo: "telegram-sincronizado", chatId: c.chatId }));
            const enChats = v ? v.en.includes("chats") : true;
            const enGenesis = v ? v.en.includes("genesis") : false;
            return (
              <li key={c.chatId} className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="break-words text-xs text-white/85">{c.muestra || "Sin texto"}</div>
                  <div className="text-[10px] text-white/40">{c.n} mensajes · último {new Date(c.ultimo).toLocaleString("es-ES")}</div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-3 text-[11px] text-cyan-100/80">
                  <label className="flex items-center gap-1.5">
                    <Switch checked={enChats} disabled={guardando || (enChats && !enGenesis)} onCheckedChange={(s) => void poner(c, "chats", s)} aria-label="Mostrar en Chats" />
                    Mostrar en Chats
                  </label>
                  <label className="flex items-center gap-1.5">
                    <Switch checked={enGenesis} disabled={guardando || (enGenesis && !enChats)} onCheckedChange={(s) => void poner(c, "genesis", s)} aria-label="Mostrar en Genesis" />
                    Mostrar en Genesis
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

type EstadoPuente =
  | { tipo: "cargando" }
  | { tipo: "solo-dueno" }
  | { tipo: "ok"; ultimo: { de: string; t: string } | null; latido: { t: string } | null }
  | { tipo: "error"; texto: string };

function PuentesTelegram({ dueno, cliente }: { dueno: boolean; cliente?: ClienteChatsGenesis }) {
  const cli = useMemo(() => cliente ?? crearClienteChatsGenesis(), [cliente]);
  const [estados, setEstados] = useState<Record<string, EstadoPuente>>({});

  useEffect(() => {
    let vivo = true;
    for (const p of PUENTES) {
      if (p.soloDueno && !dueno) {
        setEstados((e) => ({ ...e, [p.id]: { tipo: "solo-dueno" } }));
        continue;
      }
      setEstados((e) => ({ ...e, [p.id]: { tipo: "cargando" } }));
      void cli
        .feed({ fuente: `puente:${p.id}`, limite: 1, esperar: 0 })
        .then((r): EstadoPuente => {
          if (r.ok) {
            const u = r.registros[r.registros.length - 1];
            return { tipo: "ok", ultimo: u ? { de: u.de, t: u.t } : null, latido: r.latido };
          }
          if (r.estado === 403) return { tipo: "solo-dueno" };
          if (r.estado === 401) return { tipo: "error", texto: "Inicia sesión de nuevo para ver este puente." };
          return { tipo: "error", texto: "La puerta de datos del A1 no responde; no se puede leer este puente ahora." };
        })
        .catch((): EstadoPuente => ({ tipo: "error", texto: "La puerta de datos del A1 no responde; no se puede leer este puente ahora." }))
        .then((est) => {
          if (vivo) setEstados((e) => ({ ...e, [p.id]: est }));
        });
    }
    return () => {
      vivo = false;
    };
  }, [cli, dueno]);

  return (
    <section aria-labelledby="tg-puentes-titulo">
      <h3 id="tg-puentes-titulo" className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-violet-300/70">
        <RadioTower className="h-3.5 w-3.5" /> Puentes de Telegram de MetaGenesis
      </h3>
      <ul className="space-y-1.5">
        {PUENTES.map((p) => (
          <li key={p.id} data-puente={p.id} className="flex flex-col gap-2 rounded-lg border border-violet-500/20 bg-violet-950/10 px-3 py-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-violet-100">{p.nombre}</div>
              <div className="text-[10px] text-white/45">{p.que}</div>
              <div className="mt-0.5 text-[11px] text-white/70">{textoEstado(estados[p.id])}</div>
            </div>
            <Link href="/agent?tab=chats-genesis" className="inline-flex shrink-0 items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200">
              <ExternalLink className="h-3 w-3" /> Abrir en Genesis
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function hora(t: string): string {
  try {
    return new Date(t).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return t;
  }
}

export function textoEstado(e: EstadoPuente | undefined, ahora = Date.now()): React.ReactNode {
  if (!e || e.tipo === "cargando") return "Leyendo la copia de la puerta del A1…";
  if (e.tipo === "solo-dueno") return <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Solo para dueños de MetaGenesis.</span>;
  if (e.tipo === "error") return e.texto;
  const vivo = estadoEspejo(e.latido, ahora);
  const copia = e.latido
    ? vivo.vivo ? "copia en vivo" : `sin copia nueva desde el ${hora(e.latido.t)}`
    : "la puerta aún no tiene copia de este puente";
  if (!e.ultimo) return `Ningún aviso todavía · ${copia}`;
  return `Último aviso de ${e.ultimo.de} el ${hora(e.ultimo.t)} · ${copia}`;
}

export default ConexionTelegram;
