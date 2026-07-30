"use client";

/**
 * ConnectionsCenter — ADMINISTRACIÓN DE CONEXIONES de la neurona (Adenda 98).
 * ============================================================================
 * El hub único de TODAS las vías de conexión del dispositivo, montado en el
 * Centro de Control (pestaña «Conexiones») y en el menú de la barra superior
 * del escritorio (popover compacto):
 *
 *   · Red externa (Wi-Fi/Ethernet/datos): estado, tipo, velocidad, RTT reales.
 *   · Red Mesh P2P: estado + conexión rápida del radio por el transporte
 *     preferido + enlace a la página completa /red-mesh (mapa 3D, antenas…).
 *   · MODO DUAL: malla y router externo operando A LA VEZ + ruta preferida.
 *   · Bluetooth y antenas/puertos serie: soporte real y dispositivos autorizados.
 *
 * `compact` = versión del popover (menos detalle, mismas acciones).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Antenna,
  ArrowLeftRight,
  Bluetooth,
  Cable,
  ExternalLink,
  Globe,
  Radar,
  RadioTower,
  Router,
  Wifi,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { InternetRadarWidget } from "@/components/dashboard/widgets/internet-radar-widget";
import { RedMeshCenter } from "@/components/mesh/red-mesh-center";
import { SignalsCenter } from "@/components/mesh/signals-center";
import { ConnectivityConfigPanel } from "@/components/connectivity/connectivity-config-panel";
import {
  bluetoothLink,
  connectMesh,
  DEFAULT_CONNECTIVITY,
  disconnectMesh,
  externalLink,
  getConnectivitySettings,
  serialLink,
  setConnectivitySettings,
  startMeshSubsystem,
  subscribeConnectivity,
  useMeshState,
  type ConnectivityLink,
  type ConnectivitySettings,
  type PreferredRoute,
} from "@/ai/astraura/mesh";

const ROUTE_OPTIONS: Array<{ id: PreferredRoute; label: string; hint: string }> = [
  { id: "auto", label: "Auto", hint: "el router inteligente decide por clase de tráfico" },
  { id: "wifi", label: "Router externo", hint: "prioriza la red convencional" },
  { id: "mesh", label: "Malla P2P", hint: "prioriza la radio libre (clases permitidas)" },
];

/** Pestañas del hub de conexiones (menú superior, centrado y responsive). */
type HubTab = "conexiones" | "senales" | "internet";
const HUB_TABS: Array<{ id: HubTab; label: string; icon: typeof RadioTower }> = [
  { id: "conexiones", label: "Conexiones", icon: RadioTower },
  { id: "senales", label: "Señales", icon: Antenna },
  { id: "internet", label: "Internet", icon: Radar },
];

function Dot({ state }: { state: "ok" | "warn" | "off" }) {
  return (
    <span
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        state === "ok" ? "bg-emerald-400" : state === "warn" ? "bg-amber-400" : "bg-zinc-500",
      )}
    />
  );
}

export function ConnectionsCenter({ compact = false }: { compact?: boolean }) {
  const mesh = useMeshState();
  const [ext, setExt] = useState<ConnectivityLink | null>(null);
  const [bt, setBt] = useState<ConnectivityLink | null>(null);
  const [serial, setSerial] = useState<ConnectivityLink | null>(null);
  // Init con el DEFECTO estable → sin mismatch de hidratación; el valor real de
  // localStorage entra en el useEffect (solo cliente, tras hidratar).
  const [settings, setSettings] = useState<ConnectivitySettings>(DEFAULT_CONNECTIVITY);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<HubTab>("conexiones");

  useEffect(() => {
    startMeshSubsystem();
    const refresh = () => {
      setExt(externalLink());
      setBt(bluetoothLink());
      setSettings(getConnectivitySettings());
      void serialLink().then(setSerial);
    };
    refresh();
    return subscribeConnectivity(refresh);
  }, []);

  const meshConnected = mesh.status === "ready" || mesh.status === "degraded";
  const online = mesh.nodes.filter((n) => !n.isSelf && n.presence === "online").length;

  const update = useCallback((patch: Partial<ConnectivitySettings>) => {
    setSettings(setConnectivitySettings(patch));
  }, []);

  const quickMesh = useCallback(async () => {
    setBusy(true);
    try {
      if (meshConnected) {
        await disconnectMesh();
        toast("Radio de la malla desconectado.");
      } else {
        const s = getConnectivitySettings();
        await connectMesh(s.defaultRadio, s.defaultRadio === "daemon" ? { daemonUrl: s.daemonUrl } : undefined);
        toast.success("Malla conectada.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo conectar la malla.");
    } finally {
      setBusy(false);
    }
  }, [meshConnected]);

  const connectionsCards = (
    <div className="space-y-2.5">
      {/* Widget "sobre el internet" (Adenda 99): radar de conexiones cercanas en
          línea + bandas/antenas en uso con configuraciones rápidas e indicadores
          de transmisión. Bien acomodado como hero de la página principal del hub.
          Altura ≥ 340px en la vista amplia para que el widget entre en tier
          "regular" y MUESTRE bandas + configs rápidas + actividad (con menos alto
          se colapsaba a compacto y ocultaba justo eso). El popover compacto se
          queda en vista de vistazo (radar + último indicador). */}
      <div className={cn(compact ? "h-64" : "h-[26rem]")}>
        <InternetRadarWidget />
      </div>

      {/* Controles maestros de la neurona (Adenda 100): antena de malla local +
          internet público StarSeed + servidor activo + privacidad del radar. Se
          auto-persisten en esta neurona; integrados también en el Centro de Control. */}
      <ConnectivityConfigPanel mode="account" compact={compact} title="Señales de esta neurona" />

      {/* Red externa */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <Dot state={ext?.availability === "active" ? "ok" : "off"} />
            <Globe className="h-4 w-4 shrink-0 text-sky-300" />
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-medium text-white/90">
                {ext?.label ?? "Red externa"} (router)
              </span>
              <span className="block truncate text-[10px] text-white/45">{ext?.detail ?? "midiendo…"}</span>
            </span>
          </span>
          <span className="shrink-0 text-[10px] text-white/40">
            salud {(mesh.wifiHealth.score * 100).toFixed(0)}/100
          </span>
        </div>
      </div>

      {/* Malla P2P */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <Dot state={meshConnected ? "ok" : mesh.status === "error" ? "warn" : "off"} />
            <RadioTower className="h-4 w-4 shrink-0 text-emerald-300" />
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-medium text-white/90">Red Mesh P2P (LoRa)</span>
              <span className="block truncate text-[10px] text-white/45">
                {meshConnected ? `${online} nodos · ${mesh.meshHealth.detail}` : "sin radio conectado"}
              </span>
            </span>
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void quickMesh()}
            className="h-7 shrink-0 cursor-pointer gap-1 border-white/15 px-2 text-[11px] transition-colors duration-200 hover:border-emerald-400/40"
          >
            {meshConnected ? "Desconectar" : (
              <>
                {settings.defaultRadio === "ble" ? <Bluetooth className="h-3 w-3" /> : <Cable className="h-3 w-3" />}
                Conectar
              </>
            )}
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {(["serial", "ble", "daemon", "simulator"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => update({ defaultRadio: k })}
              className={cn(
                "cursor-pointer rounded-full border px-2 py-0.5 text-[10px] transition-colors duration-200",
                settings.defaultRadio === k
                  ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                  : "border-white/12 bg-white/[0.04] text-white/55 hover:border-emerald-400/30",
              )}
            >
              {k === "serial" ? "USB" : k === "ble" ? "Bluetooth" : k === "daemon" ? "Nodo WiFi" : "Simulador"}
            </button>
          ))}
          <Link
            href="/red-mesh"
            className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200 transition-colors duration-200 hover:bg-emerald-500/20"
          >
            <ExternalLink className="h-2.5 w-2.5" /> Centro Red Mesh (mapa 3D)
          </Link>
        </div>
      </div>

      {/* Modo dual + ruta preferida */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
        <label className="flex cursor-pointer items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-fuchsia-300" />
            <span>
              <span className="block text-[12px] font-medium text-white/90">Modo dual: malla + router a la vez</span>
              <span className="block text-[10px] text-white/45">
                ambas redes conviven; la presencia viaja por las dos y las alertas siempre por doble ruta
              </span>
            </span>
          </span>
          <Switch checked={settings.dualMode} onCheckedChange={(v) => update({ dualMode: v })} />
        </label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ROUTE_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => update({ preferred: o.id })}
              title={o.hint}
              className={cn(
                "cursor-pointer rounded-full border px-2.5 py-1 text-[10px] transition-colors duration-200",
                settings.preferred === o.id
                  ? "border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-100"
                  : "border-white/12 bg-white/[0.04] text-white/55 hover:border-fuchsia-400/30",
              )}
            >
              {o.label}
            </button>
          ))}
          <span className="w-full text-[10px] text-white/40">
            {ROUTE_OPTIONS.find((o) => o.id === settings.preferred)?.hint}
          </span>
        </div>
      </div>

      {/* Bluetooth + antenas (resumen) */}
      {!compact && (
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-white/85">
              <Bluetooth className="h-3.5 w-3.5 text-sky-300" /> Bluetooth
            </p>
            <p className="mt-0.5 text-[10px] text-white/45">{bt?.detail ?? "…"}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-white/85">
              <Router className="h-3.5 w-3.5 text-amber-300" /> Antenas / Serie
            </p>
            <p className="mt-0.5 text-[10px] text-white/45">{serial?.detail ?? "…"}</p>
          </div>
        </div>
      )}

      {compact && (
        <p className="flex items-center gap-1.5 text-[10px] text-white/40">
          <Zap className="h-3 w-3 text-emerald-300" />
          {bt?.availability === "unsupported" ? "BT no soportado" : "BT listo"} ·{" "}
          {serial?.detail ?? "serie…"}
        </p>
      )}

      <p className="flex items-center gap-1.5 text-[10px] leading-snug text-white/35">
        <Wifi className="h-3 w-3 shrink-0" />
        Honesto: el navegador no lista redes Wi-Fi cercanas ni controla la antena celular — muestra el
        estado real de la conexión activa y controla los radios que TÚ conectas (LoRa por USB/BLE/daemon).
      </p>
    </div>
  );

  // UNIFICADO (Adenda 101): una sola sección de «Señales» con sus propias
  // pestañas (Antenas y señales · Red Mesh). Antes había 3 pestañas
  // (Conexiones/Señales/Internet) que duplicaban el radar y los ajustes de la
  // neurona; ahora todo vive en SignalsCenter, sin duplicación.
  return (
    <div className={cn(compact ? "text-[12px]" : "text-sm")}>
      <SignalsCenter embedded compact={compact} />
    </div>
  );
}

export default ConnectionsCenter;
