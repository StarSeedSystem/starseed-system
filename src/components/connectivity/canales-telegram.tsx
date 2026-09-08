"use client";

/**
 * CanalesTelegram — pestaña «Canales» del Hub de Conexiones (Adenda 281 · E7).
 * ============================================================================
 * Muestra los canales y grupos de Telegram de la cuenta (DM con el bot, grupos
 * y canales descubiertos), cada uno con su enlace t.me y los últimos mensajes
 * (de `astraura_messages` y, para canales públicos, de la vista previa
 * `t.me/s/<canal>` vía la ruta de servidor /api/telegram/canales).
 *
 * Reglas del área: el contenido es una entidad única — al compartir se
 * referencia, no se duplica (aquí solo se ENLAZA a t.me). Nunca se muestran
 * tokens. `compact` = versión del popover de la barra superior del escritorio.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Bot,
  ExternalLink,
  Hash,
  Megaphone,
  MessageSquare,
  RefreshCw,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import { loadTelegramUserConfig } from "@/lib/channels/telegram";
import { telegramDeepLink } from "@/lib/messaging/messaging-channels";
import { formatRelativeTime } from "@/lib/social-posts";

/** Un canal/grupo de Telegram (espejo del tipo de la ruta de servidor). */
interface CanalTelegram {
  id: string;
  tipo: "dm" | "grupo" | "canal" | "chat";
  titulo: string;
  username?: string;
  enlace: string;
  ultimos: Array<{ de: string; texto: string; t: string }>;
}

interface CanalesRespuesta {
  ok: boolean;
  canales: CanalTelegram[];
  bot?: { username?: string };
}

const ICONO_TIPO: Record<CanalTelegram["tipo"], LucideIcon> = {
  dm: Bot,
  grupo: Users,
  canal: Megaphone,
  chat: Hash,
};

const ETIQUETA_TIPO: Record<CanalTelegram["tipo"], string> = {
  dm: "Chat privado",
  grupo: "Grupo",
  canal: "Canal",
  chat: "Chat",
};

export function CanalesTelegram({ compact = false }: { compact?: boolean }) {
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [datos, setDatos] = useState<CanalesRespuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      // El token del bot se lee del almacén LOCAL del usuario (nunca se expone
      // al cliente de la ruta); /api/telegram/canales no lo devuelve jamás.
      const token = loadTelegramUserConfig().botToken || undefined;
      const res = await fetch("/api/telegram/canales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: token }),
      });
      const data = (await res.json().catch(() => null)) as CanalesRespuesta | null;
      if (!data) throw new Error("Respuesta inválida del servidor.");
      setDatos(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los canales.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (vivo) setCuenta(data?.user?.id ?? null);
    });
    cargar();
    return () => {
      vivo = false;
    };
  }, [cargar]);

  const canales = datos?.canales ?? [];
  const botUsername = datos?.bot?.username;

  return (
    <div className={cn("space-y-2.5", compact && "text-[12px]")}>
      {/* Cabecera: identidad del bot + botón de refresco */}
      <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
        <span className="flex min-w-0 items-center gap-2">
          <MessageSquare className="h-4 w-4 shrink-0 text-cyan-300" />
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-medium text-white/90">Canales de Telegram</span>
            <span className="block truncate text-[10px] text-white/45">
              {botUsername ? `bot @${botUsername}` : "vínculo de la cuenta"}
            </span>
          </span>
        </span>
        <button
          type="button"
          onClick={() => void cargar()}
          disabled={cargando}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-medium text-cyan-100 transition-colors duration-200 hover:bg-cyan-500/20 disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", cargando && "animate-spin")} />
          Actualizar
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
          {error}
        </p>
      )}

      {canales.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center">
          <MessageSquare className="mx-auto h-5 w-5 text-cyan-400/50" />
          <p className="mt-2 text-[12px] font-medium text-white/80">Aún no hay canales sincronizados</p>
          <p className="mt-1 text-[10px] text-white/45">
            Vincula tu Telegram con el bot para ver aquí tus chats, grupos y canales.
          </p>
          <a
            href={telegramDeepLink(cuenta)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-[11px] font-medium text-cyan-100 transition-colors duration-200 hover:bg-cyan-500/25"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Vincular Telegram
          </a>
        </div>
      ) : (
        <div className="space-y-2.5">
          {canales.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
            >
              {/* Fila del canal: icono, título y enlace */}
              <div className="flex items-center gap-2">
                <IconoTipo tipo={c.tipo} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-white/90">{c.titulo}</span>
                  <span className="block text-[10px] text-white/45">{ETIQUETA_TIPO[c.tipo]}</span>
                </span>
                <a
                  href={c.enlace}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-white/12 bg-white/[0.04] px-2 py-1 text-[10px] text-white/60 transition-colors duration-200 hover:border-cyan-400/40 hover:text-cyan-200"
                >
                  <ExternalLink className="h-3 w-3" /> Abrir en Telegram
                </a>
              </div>

              {/* Últimos mensajes */}
              {c.ultimos.length > 0 && (
                <div className="mt-2 space-y-1">
                  {c.ultimos.map((m, i) => (
                    <div key={i} className="rounded-lg bg-white/[0.04] px-2 py-1">
                      <p className="text-[9px] text-white/40">
                        <span className="font-medium text-cyan-300/80">{m.de}</span>
                        {m.t ? ` · hace ${formatRelativeTime(m.t)}` : ""}
                      </p>
                      <p className="line-clamp-2 whitespace-pre-wrap text-[11px] text-white/75">{m.texto}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Ver todos: el DM del bot abre el chat; los demás, el enlace */}
              {c.tipo === "dm" ? (
                <Link
                  href="/agent/chat"
                  className="mt-2 inline-flex cursor-pointer items-center gap-1 text-[10px] font-medium text-cyan-300/80 transition-colors duration-200 hover:text-cyan-200"
                >
                  Ver todos en el chat →
                </Link>
              ) : (
                <a
                  href={c.enlace}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex cursor-pointer items-center gap-1 text-[10px] font-medium text-cyan-300/80 transition-colors duration-200 hover:text-cyan-200"
                >
                  Ver todos en Telegram →
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Icono según el tipo de canal (color asociado a cada categoría). */
function IconoTipo({ tipo }: { tipo: CanalTelegram["tipo"] }) {
  const Ic = ICONO_TIPO[tipo];
  const color =
    tipo === "dm"
      ? "text-cyan-300"
      : tipo === "grupo"
        ? "text-emerald-300"
        : tipo === "canal"
          ? "text-fuchsia-300"
          : "text-white/50";
  return <Ic className={cn("h-4 w-4 shrink-0", color)} />;
}

export default CanalesTelegram;