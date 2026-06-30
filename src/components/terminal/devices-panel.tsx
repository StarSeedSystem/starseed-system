"use client";

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Dispositivos como servidores (presencia en vivo)
// ----------------------------------------------------------------
// Muestra los dispositivos/sesiones online como "servidores" con:
//   • presencia (online/offline) vía Supabase Realtime Presence,
//   • capacidades (terminal, memoria, archivos, IA),
//   • enlaces a sus memorias / archivos.
//
// PRESENCIA: se une a un canal `starseed:devices`, «trackea» ESTE
// navegador/dispositivo con su payload de capacidades al montar y
// renderiza el estado de presencia (este + los demás online). Si la
// presencia no está disponible (sin sesión, error de red, dummy keys),
// DEGRADA con elegancia mostrando sólo "este dispositivo".
//
// Sigue los patrones de styling de servers-panel.tsx / brains-panel.tsx
// (glass, badges, lucide, cn). SSR-safe + defensivo en todo I/O.
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Server,
  RefreshCw,
  MonitorSmartphone,
  Wifi,
  WifiOff,
  TerminalSquare,
  Brain as BrainIcon,
  FolderTree,
  Sparkles,
  Radio,
  ShieldCheck,
} from "lucide-react";
import {
  DEVICE_CAPABILITIES,
  buildSelfPresence,
  getDeviceId,
  listDevices,
  presenceToDevice,
  type DeviceCapability,
  type DeviceServer,
  type DevicePresencePayload,
} from "@/lib/terminal/devices";

/** Nombre del canal de presencia de dispositivos. */
const DEVICES_CHANNEL = "starseed:devices";

/** Icono lucide por capacidad (no se reutiliza ninguno entre capacidades). */
const CAP_ICON: Record<DeviceCapability, React.ComponentType<{ className?: string }>> = {
  terminal: TerminalSquare,
  memoria: BrainIcon,
  archivos: FolderTree,
  ia: Sparkles,
};

function capLabel(id: DeviceCapability): string {
  return DEVICE_CAPABILITIES.find((c) => c.id === id)?.label ?? id;
}

export default function DevicesPanel() {
  const [devices, setDevices] = useState<DeviceServer[]>([]);
  const [presenceOk, setPresenceOk] = useState(false);
  const [loading, setLoading] = useState(true);
  const selfId = useMemo(() => getDeviceId(), []);

  // Guardamos el canal y su cliente para limpiar al desmontar / re-suscribir.
  // `removeChannel` debe llamarse en el MISMO cliente que creó el canal.
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const clientRef = useRef<ReturnType<typeof createClient> | null>(null);

  /** Degradación: snapshot con sólo este dispositivo. */
  const loadFallback = useCallback(async () => {
    try {
      const list = await listDevices();
      setDevices(list);
    } catch {
      setDevices([]);
    }
  }, []);

  /** Lee el estado de presencia del canal y lo mapea a DeviceServer[]. */
  const syncPresence = useCallback(
    (channel: NonNullable<typeof channelRef.current>) => {
      try {
        const state = channel.presenceState() as Record<string, Array<Record<string, unknown>>>;
        const seen = new Map<string, DeviceServer>();
        for (const key of Object.keys(state)) {
          const metas = state[key] || [];
          for (const meta of metas) {
            const p = meta as unknown as DevicePresencePayload;
            if (!p || typeof p.deviceId !== "string") continue;
            const dev = presenceToDevice(p, selfId);
            // Dedup por deviceId (varias pestañas del mismo dispositivo).
            const prev = seen.get(dev.id);
            if (!prev || dev.lastSeen >= prev.lastSeen) seen.set(dev.id, dev);
          }
        }
        const list = Array.from(seen.values());
        if (list.length > 0) {
          // Este dispositivo primero, luego por nombre.
          list.sort((a, b) => (a.isSelf === b.isSelf ? a.name.localeCompare(b.name) : a.isSelf ? -1 : 1));
          setDevices(list);
        } else {
          void loadFallback();
        }
      } catch {
        void loadFallback();
      }
    },
    [selfId, loadFallback],
  );

  /* ---- montaje: suscribir presencia + trackear este dispositivo ---- */

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Mostramos al menos este dispositivo desde el principio.
    void loadFallback().finally(() => {
      if (!cancelled) setLoading(false);
    });

    let channel: typeof channelRef.current = null;
    try {
      const sb = createClient();
      clientRef.current = sb;
      channel = sb.channel(DEVICES_CHANNEL, {
        config: { presence: { key: selfId } },
      });
      channelRef.current = channel;

      channel
        .on("presence", { event: "sync" }, () => {
          if (!cancelled && channel) syncPresence(channel);
        })
        .on("presence", { event: "join" }, () => {
          if (!cancelled && channel) syncPresence(channel);
        })
        .on("presence", { event: "leave" }, () => {
          if (!cancelled && channel) syncPresence(channel);
        })
        .subscribe(async (status) => {
          if (cancelled) return;
          // `status` es un enum string-backed del SDK; comparamos por valor.
          const s = String(status);
          if (s === "SUBSCRIBED") {
            setPresenceOk(true);
            try {
              await channel?.track(buildSelfPresence() as unknown as Record<string, unknown>);
            } catch {
              /* track best-effort: si falla, seguimos con fallback */
            }
          } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
            setPresenceOk(false);
            void loadFallback();
          }
        });
    } catch {
      // Sin realtime (dummy keys / sin red): degradamos a este dispositivo.
      setPresenceOk(false);
      void loadFallback();
    }

    return () => {
      cancelled = true;
      try {
        const sb = clientRef.current;
        if (channelRef.current) {
          void channelRef.current.untrack().catch(() => {});
          if (sb) void sb.removeChannel(channelRef.current);
        }
      } catch {
        /* limpieza best-effort */
      }
      channelRef.current = null;
      clientRef.current = null;
    };
  }, [selfId, syncPresence, loadFallback]);

  /** Re-trackea el payload (p.ej. tras conectar nuevas memorias). */
  const refresh = useCallback(() => {
    const channel = channelRef.current;
    if (channel && presenceOk) {
      try {
        void channel.track(buildSelfPresence() as unknown as Record<string, unknown>);
        syncPresence(channel);
        return;
      } catch {
        /* cae al fallback */
      }
    }
    void loadFallback();
  }, [presenceOk, syncPresence, loadFallback]);

  const onlineCount = devices.filter((d) => d.online).length;

  return (
    <div className="space-y-4">
      {/* Header / concepto */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-500 to-cyan-500">
            <MonitorSmartphone className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-emerald-50">Dispositivos online · como servidores</span>
            <span className="max-w-2xl text-[11px] text-emerald-300/70">
              Cada dispositivo/sesión conectado se muestra como un «servidor» con su presencia y capacidades (terminal,
              memoria, archivos, IA) y enlaces a sus memorias y ficheros. Presencia en vivo vía Supabase Realtime.
            </span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "gap-1 text-[10px]",
                presenceOk ? "border-emerald-400/40 text-emerald-200" : "border-amber-400/40 text-amber-200",
              )}
            >
              <Radio className={cn("h-3 w-3", presenceOk && "animate-pulse")} />
              {presenceOk ? "Presencia en vivo" : "Sólo este dispositivo"}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 border-emerald-500/30 text-emerald-100"
              onClick={refresh}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Actualizar
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="gap-1 border-emerald-400/30 text-[10px] text-emerald-200">
            <Wifi className="h-3 w-3" /> {onlineCount} online
          </Badge>
          {DEVICE_CAPABILITIES.map((c) => (
            <Badge key={c.id} variant="outline" className="text-[10px] border-white/15 text-white/55" title={c.blurb}>
              {c.icon} {c.label}
            </Badge>
          ))}
        </div>
      </div>

      {/* Aviso de degradación (sin presencia) */}
      {!presenceOk && !loading && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-3 text-[11px] text-amber-200/80">
          <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
          La presencia en tiempo real no está disponible ahora mismo (sin sesión o sin conexión). Se muestra únicamente
          este dispositivo; los demás aparecerán automáticamente cuando la presencia esté activa.
        </div>
      )}

      {/* Rejilla de dispositivos */}
      {devices.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/50">
          No hay dispositivos visibles. Abre StarSeed en otro equipo o pestaña para verlos aquí como servidores.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {devices.map((d) => (
            <DeviceCard key={d.id} device={d} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tarjeta de un dispositivo-servidor                                  */
/* ------------------------------------------------------------------ */

function DeviceCard({ device }: { device: DeviceServer }) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-white/5 p-3",
        device.isSelf ? "border-emerald-400/40" : "border-white/10",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-emerald-500/30 to-cyan-500/30">
          <Server className="h-4 w-4 text-emerald-200" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-white">{device.name}</span>
            {device.isSelf && (
              <Badge variant="outline" className="border-emerald-400/40 text-[9px] text-emerald-200">
                este dispositivo
              </Badge>
            )}
            {device.online ? (
              <Badge variant="outline" className="gap-1 border-emerald-400/40 text-[9px] text-emerald-300">
                <Wifi className="h-3 w-3" /> online
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 border-white/30 text-[9px] text-white/50">
                <WifiOff className="h-3 w-3" /> offline
              </Badge>
            )}
          </div>
          <p className="mt-0.5 truncate text-[10px] text-white/35">id: {device.id}</p>
        </div>
      </div>

      {/* Capacidades */}
      <div className="mt-2">
        <div className="mb-1 text-[9px] uppercase tracking-widest text-emerald-300/50">Capacidades</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {device.capabilities.length === 0 ? (
            <span className="text-[10px] text-white/35">—</span>
          ) : (
            device.capabilities.map((c) => {
              const Icon = CAP_ICON[c] ?? Server;
              return (
                <Badge key={c} variant="outline" className="gap-1 border-cyan-400/30 text-[9px] text-cyan-200">
                  <Icon className="h-3 w-3" /> {capLabel(c)}
                </Badge>
              );
            })
          )}
        </div>
      </div>

      {/* Memorias enlazadas */}
      <div className="mt-2">
        <div className="mb-1 flex items-center gap-1 text-[9px] uppercase tracking-widest text-emerald-300/50">
          <BrainIcon className="h-3 w-3" /> Memorias ({device.memories.length})
        </div>
        {device.memories.length === 0 ? (
          <span className="text-[10px] text-white/35">Sin raíces de memoria conectadas.</span>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {device.memories.slice(0, 6).map((m) => (
              <Badge key={m.id} variant="outline" className="gap-1 border-white/15 text-[9px] text-white/60" title={`${m.branches} rama(s)`}>
                {m.name} · {m.branches}
              </Badge>
            ))}
            {device.memories.length > 6 && (
              <span className="text-[9px] text-white/35">+{device.memories.length - 6} más</span>
            )}
          </div>
        )}
      </div>

      {/* Pie: archivos + accesos */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-2">
        <Badge variant="outline" className="gap-1 border-white/15 text-[10px] text-white/60">
          <FolderTree className="h-3 w-3" /> {device.files} archivo(s)
        </Badge>
        {device.capabilities.includes("memoria") && (
          <Link
            href="/memorias"
            className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/60 hover:border-emerald-400/30 hover:text-emerald-100"
          >
            <BrainIcon className="h-3 w-3" /> Memorias
          </Link>
        )}
        {device.isSelf && (
          <Link
            href="/servidores"
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/60 hover:border-emerald-400/30 hover:text-emerald-100"
          >
            <Server className="h-3 w-3" /> Servidores
          </Link>
        )}
      </div>
    </div>
  );
}
