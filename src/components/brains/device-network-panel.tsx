"use client";

/**
 * DeviceNetworkPanel — "Dispositivos y red" (Crystal Liquid Glass).
 * ---------------------------------------------------------------------------
 * Muestra, de forma HONESTA:
 *   - ESTE dispositivo (id, plataforma, IP pública si se detectó).
 *   - La lista de dispositivos de la CUENTA (Supabase user_settings.prefs.devices).
 *   - Cuáles se infieren "en tu red" (misma IP pública) con badge.
 *   - Un switch "Detección automática (predeterminado)" (persistente).
 *   - Un botón "Sincronizar por red directa" (usa el andamiaje lan-sync;
 *     si no está configurado, muestra estado honesto).
 *
 * Nota honesta clave (una línea en la UI): agrupamos por CUENTA + IP PÚBLICA
 * porque el navegador NO puede escanear la LAN ni leer tu IP privada.
 *
 * Estilo: Crystal Liquid Glass, claro, responsive, reduced-motion. Defensivo:
 * sin sesión Supabase degrada a localStorage y lo dice.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Radar,
  RefreshCw,
  Wifi,
  WifiOff,
  MonitorSmartphone,
  Laptop,
  Globe,
  ShieldQuestion,
  Link2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";
import { useDeviceNetwork, type DeviceInfo } from "@/lib/network/device-registry";
import { beginDirectSync, lanSyncStatus, describeLanSync, type LanSyncResult } from "@/lib/network/lan-sync";

/* ------------------------------------------------------------------ */
/* Utilidades de presentación                                        */
/* ------------------------------------------------------------------ */

function timeAgo(ts: number): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "hace un momento";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

function platformIcon(platform: string) {
  const p = (platform || "").toLowerCase();
  if (p.includes("android") || p.includes("iphone") || p.includes("ipad") || p.includes("mobile")) {
    return MonitorSmartphone;
  }
  return Laptop;
}

/** IP pública enmascarada para no exponerla entera en pantalla. */
function maskIp(ip: string | null): string {
  if (!ip) return "sin IP pública";
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.•.•`;
  // IPv6 u otro: muestra prefijo corto.
  return ip.length > 12 ? `${ip.slice(0, 10)}…` : ip;
}

/* ------------------------------------------------------------------ */
/* Fila de dispositivo                                               */
/* ------------------------------------------------------------------ */

function DeviceRow({
  device,
  isSelf,
  sameNet,
}: {
  device: DeviceInfo;
  isSelf: boolean;
  sameNet: boolean;
}) {
  const Icon = platformIcon(device.platform);
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border p-2.5 transition-colors",
        isSelf
          ? "border-sky-400/40 bg-sky-400/[0.06]"
          : sameNet
            ? "border-emerald-400/30 bg-emerald-400/[0.05]"
            : "border-foreground/10 bg-foreground/[0.03]",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          isSelf ? "bg-sky-400/15 text-sky-300" : "bg-foreground/10 text-foreground/70",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">{device.label}</span>
          {isSelf && (
            <Badge variant="outline" className="border-sky-400/40 text-[9px] text-sky-300">
              este dispositivo
            </Badge>
          )}
          {sameNet && !isSelf && (
            <Badge variant="outline" className="gap-1 border-emerald-400/40 text-[9px] text-emerald-300">
              <Wifi className="h-3 w-3" /> en tu red
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-foreground/45">
          <span className="truncate">{device.platform || "plataforma desconocida"}</span>
          <span className="inline-flex items-center gap-1">
            <Globe className="h-3 w-3" /> {maskIp(device.publicIp)}
          </span>
          <span>· visto {timeAgo(device.lastSeen)}</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel principal                                                   */
/* ------------------------------------------------------------------ */

export default function DeviceNetworkPanel() {
  const {
    thisDevice,
    devices,
    sameNetwork,
    hasSession,
    hasPublicIp,
    loading,
    autoDetect,
    setAutoDetect,
    refresh,
  } = useDeviceNetwork();

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<LanSyncResult | null>(null);

  const sameNetIds = useMemo(() => new Set(sameNetwork.map((d) => d.id)), [sameNetwork]);
  const lanStatus = useMemo(() => lanSyncStatus(), []);

  // Otros dispositivos (excluye este) ordenados: primero los de tu red.
  const others = useMemo(() => {
    const rest = devices.filter((d) => !thisDevice || d.id !== thisDevice.id);
    return rest.sort((a, b) => {
      const an = sameNetIds.has(a.id) ? 0 : 1;
      const bn = sameNetIds.has(b.id) ? 0 : 1;
      if (an !== bn) return an - bn;
      return (b.lastSeen || 0) - (a.lastSeen || 0);
    });
  }, [devices, thisDevice, sameNetIds]);

  const onDirectSync = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      // Toma el primer dispositivo de tu red como destino (contrato listo).
      const target = sameNetwork[0] ?? null;
      const res = await beginDirectSync(thisDevice, target);
      setSyncResult(res);
    } catch {
      setSyncResult({ ok: false, status: "error", detail: "No se pudo iniciar la sincronización directa." });
    } finally {
      setSyncing(false);
    }
  }, [sameNetwork, thisDevice]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-foreground/[0.12] p-4",
        // Crystal Liquid Glass claro: capa translúcida + blur + resplandor sutil.
        "bg-gradient-to-br from-sky-400/[0.07] via-white/[0.02] to-emerald-400/[0.05]",
        "shadow-[0_8px_32px_rgba(0,0,0,0.10)] backdrop-blur-xl",
      )}
    >
      {/* Halo decorativo (desactivado con reduce-motion mediante utilidades base) */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-sky-400/10 blur-3xl motion-reduce:hidden" />

      {/* Cabecera */}
      <div className="relative flex flex-wrap items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-sky-500 to-emerald-500 text-white shadow-lg">
          <Radar className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Dispositivos y red</span>
            <Badge variant="outline" className="border-sky-400/30 text-[9px] text-sky-300">
              detección automática
            </Badge>
          </div>
          <p className="mt-0.5 max-w-2xl text-[11px] leading-snug text-foreground/55">
            Agrupamos por tu <strong className="font-semibold text-foreground/75">cuenta</strong> y por{" "}
            <strong className="font-semibold text-foreground/75">IP pública compartida</strong>, porque el navegador no
            puede escanear la red local ni leer tu IP privada.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-2 border-foreground/15 text-foreground/80"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Actualizar
        </Button>
      </div>

      {/* Switch de detección automática */}
      <div className="relative mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.03] p-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="autodetect" className="cursor-pointer text-xs font-medium text-foreground">
            Detección automática <span className="text-foreground/45">(predeterminado)</span>
          </label>
          <p className="text-[10px] text-foreground/45">
            Registra este dispositivo en tu cuenta y refresca la lista para inferir cuáles comparten tu red.
          </p>
        </div>
        <Switch
          id="autodetect"
          checked={autoDetect}
          onCheckedChange={(v) => setAutoDetect(v)}
          aria-label="Detección automática de dispositivos"
        />
      </div>

      {/* Estado de sesión / IP pública */}
      {!hasSession && (
        <div className="relative mt-3 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-2.5 text-[11px] text-amber-200/90">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Inicia sesión para sincronizar entre dispositivos. Ahora mismo solo se guarda este dispositivo en el
            almacenamiento local del navegador.
          </span>
        </div>
      )}

      {/* Este dispositivo */}
      <div className="relative mt-3">
        <span className="text-[10px] uppercase tracking-widest text-foreground/40">Este dispositivo</span>
        <div className="mt-1.5">
          {thisDevice ? (
            <DeviceRow device={thisDevice} isSelf sameNet={false} />
          ) : (
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-2.5 text-[11px] text-foreground/45">
              {loading ? "Detectando este dispositivo…" : "Activa la detección automática para registrar este dispositivo."}
            </div>
          )}
        </div>
        {thisDevice && !hasPublicIp && (
          <p className="mt-1 flex items-center gap-1 text-[10px] text-foreground/40">
            <WifiOff className="h-3 w-3" />
            No se pudo detectar tu IP pública; sin ella no se puede inferir "misma red".
          </p>
        )}
      </div>

      {/* Otros dispositivos de la cuenta */}
      <div className="relative mt-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-foreground/40">
            Dispositivos de tu cuenta
          </span>
          <Badge variant="outline" className="border-foreground/15 text-[9px] text-foreground/50">
            {others.length}
          </Badge>
          {sameNetwork.length > 0 && (
            <Badge variant="outline" className="gap-1 border-emerald-400/30 text-[9px] text-emerald-300">
              <Wifi className="h-3 w-3" /> {sameNetwork.length} en tu red
            </Badge>
          )}
        </div>
        <div className="mt-1.5 space-y-1.5">
          {others.length === 0 ? (
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-2.5 text-[11px] text-foreground/45">
              {hasSession
                ? "Aún no hay otros dispositivos en tu cuenta. Abre StarSeed en otro equipo con la misma sesión para verlo aquí."
                : "Inicia sesión para ver y sincronizar tus otros dispositivos."}
            </div>
          ) : (
            others.map((d) => (
              <DeviceRow key={d.id} device={d} isSelf={false} sameNet={sameNetIds.has(d.id)} />
            ))
          )}
        </div>
      </div>

      {/* Sincronización por red directa (WebRTC, andamiaje honesto) */}
      <div className="relative mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldQuestion className="h-4 w-4 text-emerald-300" />
          <span className="text-xs font-semibold text-foreground">Sincronización por red directa</span>
          <Badge
            variant="outline"
            className={cn(
              "text-[9px]",
              lanStatus === "unsupported"
                ? "border-red-400/30 text-red-300"
                : "border-emerald-400/30 text-emerald-300",
            )}
          >
            {lanStatus === "unsupported" ? "no soportado" : "preparado"}
          </Badge>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-foreground/50">{describeLanSync(lanStatus)}</p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500"
            onClick={() => void onDirectSync()}
            disabled={syncing || lanStatus === "unsupported"}
            title="Intentará una conexión P2P directa (WebRTC) con un dispositivo de tu red. Señalización por tu cuenta."
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            Sincronizar por red directa
          </Button>
          {sameNetwork.length === 0 && lanStatus !== "unsupported" && (
            <span className="text-[10px] text-foreground/40">
              (sin dispositivos en tu red detectados; el andamiaje queda listo igualmente)
            </span>
          )}
        </div>

        {syncResult && (
          <div
            className={cn(
              "mt-2 flex items-start gap-1.5 rounded-lg border p-2 text-[10px]",
              syncResult.ok
                ? "border-emerald-400/30 bg-emerald-400/[0.06] text-emerald-200"
                : "border-amber-400/25 bg-amber-400/[0.06] text-amber-200/90",
            )}
          >
            {syncResult.ok ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            <span>{syncResult.detail}</span>
          </div>
        )}

        <p className="mt-2 text-[9px] leading-snug text-foreground/35">
          La conexión real será P2P (WebRTC) directa entre dispositivos; la señalización (oferta/respuesta) viaja por tu
          cuenta soberana, sin servidor de terceros.
        </p>
      </div>
    </div>
  );
}
