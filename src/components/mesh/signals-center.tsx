"use client";

/**
 * SignalsCenter — PÁGINA "SEÑALES" del hub de conexiones (Adenda 99b).
 * ============================================================================
 * Un único lugar para VER y CONFIGURAR todas las antenas de emisión/recepción
 * de la neurona, autodetectadas en tiempo real, más el RADAR de señales (nodos
 * reales de la malla por RF). Desde aquí se accede a la Red Mesh y a las
 * configuraciones de cada tipo de conexión.
 *
 * Honestidad radical: cada antena muestra su estado REAL y si el OS la controla
 * de verdad o es solo informativa (Wi-Fi/celular/telefonía). SSR-safe.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  RadioTower, Wifi, Signal, Bluetooth, MapPin, Nfc, Usb, Phone,
  ExternalLink, Antenna, Smartphone, Download, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SignalsRadar } from "./signals-radar";
import { RedMeshCenter } from "./red-mesh-center";
import { ConnectivityConfigPanel } from "@/components/connectivity/connectivity-config-panel";
import {
  useMeshState, detectSignals, connectMesh, connectWifiNode, getConnectivitySettings,
  subscribeConnectivity, setNeuronPosition, detectPlatform, recommendNative, hasAccountSession,
  startMeshSubsystem, useNetworkInbox,
  type SignalSource, type SignalKind, type NativeRecommendation,
} from "@/ai/astraura/mesh";

const ICON: Record<SignalKind, LucideIcon> = {
  mesh: RadioTower, wifi: Wifi, cellular: Signal, bluetooth: Bluetooth,
  gps: MapPin, nfc: Nfc, serial: Usb, telephony: Phone,
};

const STATUS_META: Record<SignalSource["status"], { label: string; cls: string; dot: string }> = {
  active: { label: "activa", cls: "text-emerald-300 bg-emerald-500/15", dot: "bg-emerald-400" },
  available: { label: "lista", cls: "text-sky-300 bg-sky-500/15", dot: "bg-sky-400" },
  off: { label: "apagada", cls: "text-amber-300 bg-amber-500/15", dot: "bg-amber-400" },
  unsupported: { label: "sin API", cls: "text-white/40 bg-white/[0.05]", dot: "bg-zinc-500" },
  info: { label: "informativa", cls: "text-violet-300 bg-violet-500/15", dot: "bg-violet-400" },
};

/** Resumen legible del cuerpo de un mensaje recibido de la red. */
function summarizeInbound(body: unknown): string {
  if (body == null) return "";
  if (typeof body !== "object") return String(body);
  const b = body as Record<string, unknown>;
  if (typeof b.text === "string") return b.text;
  if (typeof b.body === "string") return b.body;
  if (typeof b.name === "string") return String(b.name);
  if (typeof b.kind === "string") return String(b.kind);
  return "contenido de red";
}

export interface SignalsCenterProps {
  embedded?: boolean;
  compact?: boolean;
}

export function SignalsCenter({ embedded = false, compact = false }: SignalsCenterProps) {
  const mesh = useMeshState();
  const [signals, setSignals] = useState<SignalSource[]>([]);
  const [busy, setBusy] = useState<SignalKind | null>(null);
  const [webMeshOn, setWebMeshOn] = useState(false);
  const meshRef = useRef(mesh);
  meshRef.current = mesh;

  // Señales unifica TODO en pestañas (Adenda 101): «Antenas y señales» + «Red
  // Mesh» (la página Red Mesh integrada como pestaña, sin duplicar ajustes).
  const [tab, setTab] = useState<"antenas" | "redmesh">("antenas");

  // Arranca la malla en cualquier superficie donde aparezca Señales (página,
  // barra superior, Centro de Control) — antes lo hacía la pestaña «Internet».
  useEffect(() => { startMeshSubsystem(); }, []);

  // Contenido RECIBIDO de otras neuronas por la red sináptica (bucle cerrado).
  const inbox = useNetworkInbox();

  useEffect(() => {
    let alive = true;
    void hasAccountSession().then((v) => alive && setWebMeshOn(v));
    return () => { alive = false; };
  }, [mesh.status]);

  const onlineCount = useMemo(
    () => mesh.nodes.filter((n) => !n.isSelf && n.presence === "online").length,
    [mesh.nodes],
  );

  // Re-detecta SOLO ante cambios significativos (estado/región/vecinos) o eventos
  // de conectividad — NO en cada tick del store (evitaría re-suscribir y llamar a
  // navigator.serial/permissions en bucle). Un contador de secuencia descarta
  // resultados asíncronos fuera de orden; `alive` evita setState tras desmontar.
  useEffect(() => {
    let alive = true;
    const seq = { n: 0 };
    const run = () => {
      const my = ++seq.n;
      void detectSignals(meshRef.current).then((r) => {
        if (alive && my === seq.n) setSignals(r);
      });
    };
    run();
    const off = subscribeConnectivity(run);
    return () => {
      alive = false;
      off();
    };
  }, [mesh.status, mesh.region, onlineCount]);

  const activeCtrl = signals.filter((s) => s.controllable && (s.status === "active" || s.status === "available")).length;

  // Recomendación de app nativa para acceso completo al hardware (según el SO).
  const native = useMemo<NativeRecommendation>(() => recommendNative(detectPlatform()), []);

  const runAction = async (sig: SignalSource, action: string) => {
    try {
      if (action === "Abrir Red Mesh") { setTab("redmesh"); return; }
      if (action === "App nativa") {
        window.open(native.links[0]?.url ?? "https://meshtastic.org/download/", "_blank", "noopener,noreferrer");
        return;
      }
      setBusy(sig.kind);
      if (action === "Conectar nodo Wi-Fi") {
        const host = window.prompt("IP o host del nodo Meshtastic en tu red (Wi-Fi/LAN):", "192.168.1.");
        if (host && host.trim()) {
          await connectWifiNode(host.trim());
          toast.success("Conectando a la malla por Wi-Fi (nodo de tu red)…");
        }
      } else if (sig.kind === "mesh" || sig.kind === "serial" || sig.kind === "bluetooth") {
        const radio = sig.kind === "bluetooth" ? "ble" : sig.kind === "serial" ? "serial" : getConnectivitySettings().defaultRadio;
        await connectMesh(radio);
        toast.success("Conectando la malla…");
      } else if (sig.kind === "gps") {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const ok = setNeuronPosition(pos.coords.latitude, pos.coords.longitude);
              toast.success(ok ? "Ubicación fijada en esta neurona" : "Ubicación obtenida (conecta un radio para situarla en el radar)");
              resolve();
            },
            () => { toast.error("No se pudo obtener la ubicación"); resolve(); },
            { enableHighAccuracy: true, timeout: 8000 },
          );
        });
      } else if (sig.kind === "nfc") {
        const R = (window as unknown as { NDEFReader?: new () => { scan: () => Promise<void> } }).NDEFReader;
        if (R) { await new R().scan(); toast("Acerca una etiqueta NFC…"); }
        else toast.error("Web NFC no disponible en este dispositivo");
      }
      setTimeout(() => void detectSignals(meshRef.current).then(setSignals), 600);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar la acción");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Cabecera */}
      {embedded ? (
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white/85">
            <Antenna className="h-4 w-4 text-sky-300" /> Señales · antenas de la neurona
          </h2>
          <span className="text-[11px] text-white/45">{activeCtrl} controlables activas</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-sky-50">
              <Antenna className="h-6 w-6 text-sky-300" /> Señales
            </h1>
            <p className="mt-1 text-sm text-white/50">
              Todas las antenas de emisión y recepción de esta neurona, autodetectadas en tiempo real,
              con el radar de los nodos reales de la malla. Desde aquí llegas a la Red Mesh y a cada configuración.
            </p>
          </div>
          <Link href="/red-mesh" className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200 transition-colors duration-200 hover:bg-emerald-500/20">
            <ExternalLink className="h-3 w-3" /> Red Mesh (mapa 3D)
          </Link>
        </div>
      )}

      {/* Pestañas: «Antenas y señales» · «Red Mesh» (Red Mesh integrada como
          pestaña dentro de Señales, con todas sus funciones · Adenda 101). */}
      <div className="flex gap-1.5">
        {([
          ["antenas", "Antenas y señales", Antenna],
          ["redmesh", "Red Mesh", RadioTower],
        ] as const).map(([k, label, Ic]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-medium transition-colors duration-200",
              tab === k
                ? "border-sky-400/40 bg-sky-500/15 text-sky-100"
                : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/25 hover:text-white/85",
            )}
          >
            <Ic className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === "antenas" && (
      <>
      {/* Radar unificado de señales + neuronas (nodos reales de la malla por RF) */}
      <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
        <SignalsRadar height={compact ? 200 : 260} showLegend />
      </div>

      {/* Controles maestros: antena de malla local + internet público StarSeed +
          servidor activo + privacidad del radar público. Encendidos por defecto. */}
      <ConnectivityConfigPanel mode="account" compact={compact} title="Estado de señales de esta neurona" />

      {/* Estado de la malla web (funciona desde el navegador, sin hardware) */}
      <div className={cn("flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2",
        webMeshOn ? "border-emerald-400/25 bg-emerald-500/[0.06]" : "border-amber-400/25 bg-amber-500/[0.06]")}>
        <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-semibold", webMeshOn ? "text-emerald-200" : "text-amber-200")}>
          <span className={cn("size-2 rounded-full", webMeshOn ? "bg-emerald-400 animate-pulse" : "bg-amber-400")} />
          {webMeshOn ? "Malla web activa" : "Malla web · inicia sesión"}
        </span>
        <span className="text-[10px] text-white/50">
          {webMeshOn ? "relé por servidor · funciona sin radio" : "con sesión, el relé web transmite sin radio"}
        </span>
        <span className="ml-auto rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-200">
          relé siempre on
        </span>
      </div>

      {/* Actividad de RED RECIBIDA de otras neuronas (bucle cerrado: publicar →
          almacenar → recibir por el feed público / relé de la red sináptica). */}
      {inbox.length > 0 && (
        <div className="rounded-xl border border-violet-400/25 bg-violet-500/[0.05] px-3 py-2.5">
          <p className="flex items-center gap-2 text-[12px] font-medium text-white/90">
            <Signal className="h-4 w-4 text-violet-300" /> Actividad de red recibida
            <span className="ml-auto rounded-full bg-violet-500/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-violet-200">
              {inbox.length}
            </span>
          </p>
          <div className="mt-1.5 space-y-1">
            {inbox.slice(0, 4).map((it) => (
              <div key={it.id} className="flex items-center gap-2 text-[10px] text-white/55">
                <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono uppercase text-white/70">{it.type}</span>
                <span className="truncate">{summarizeInbound(it.body)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Acceso completo con la app nativa (según el SO de esta neurona): lo que
          el navegador no permite (Wi-Fi/datos directos, BLE/serie en iOS/Firefox,
          antenas externas) lo desbloquea la app nativa de Meshtastic. */}
      <div className={cn("rounded-2xl border px-3 py-3",
        native.needed ? "border-emerald-400/30 bg-emerald-500/[0.06]" : "border-white/10 bg-white/[0.03]")}>
        <div className="flex items-start gap-2">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-white/90">
              {native.title}{native.needed ? " · recomendado" : ""}
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-white/55">{native.reason}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {native.links.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-200 transition-colors cursor-pointer hover:bg-emerald-500/20">
                  <Download className="h-3 w-3" />{l.label}
                </a>
              ))}
            </div>
            <p className="mt-1 text-[9px] text-white/40">Desbloquea: {native.unlocks.join(" · ")}</p>
          </div>
        </div>
      </div>

      {/* Rejilla de antenas autodetectadas */}
      <div className={cn("grid gap-2", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
        {signals.map((sig) => {
          const Icon = ICON[sig.kind];
          const st = STATUS_META[sig.status];
          const disabled = sig.status === "unsupported" || sig.status === "off";
          return (
            <div key={sig.kind} className={cn("rounded-xl border px-3 py-2.5 transition-colors",
              sig.status === "active" ? "border-emerald-500/25 bg-emerald-500/[0.05]"
                : disabled ? "border-white/8 bg-white/[0.02] opacity-70" : "border-white/10 bg-white/[0.03]")}>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Icon className={cn("h-4 w-4 shrink-0", sig.controllable ? "text-sky-300" : "text-white/40")} />
                  <span className="truncate text-[12px] font-semibold text-white/90">{sig.label}</span>
                </span>
                <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider", st.cls)}>
                  <span className={cn("size-1.5 rounded-full", st.dot)} /> {st.label}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-snug text-white/55">{sig.detail}</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-[9px] text-white/40">{sig.bands}</span>
                <span className={cn("text-[8px] font-bold uppercase tracking-wider", sig.controllable ? "text-emerald-300/80" : "text-white/35")}>
                  {sig.controllable ? "emite/recibe" : "solo informa"}
                </span>
              </div>
              {sig.actions.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {sig.actions.map((a) => (
                    <button key={a} type="button" disabled={busy === sig.kind} onClick={() => void runAction(sig, a)}
                      className={cn("inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[9px] font-bold text-sky-200 transition-colors cursor-pointer hover:bg-sky-500/20",
                        busy === sig.kind && "opacity-50 cursor-wait")}>
                      {a}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="flex items-start gap-1.5 text-[10px] leading-snug text-white/35">
        <Wifi className="mt-0.5 h-3 w-3 shrink-0" />
        La malla corre DENTRO del OS (protocolo Meshtastic embebido) y funciona desde la web: el relé por
        servidor está SIEMPRE activo (dar y recibir justo para toda la red) y lleva tu tráfico aunque no
        tengas radio. El radio LoRa, GPS, Bluetooth, Serie y NFC se usan con tu permiso; Wi-Fi/datos llevan
        la malla por IP. Para radios directos y múltiples antenas simultáneas con permisos incluidos,
        instala la app de StarSeed OS (arriba) — sin apps externas.
      </p>
      </>
      )}

      {/* Pestaña Red Mesh — la página completa integrada aquí (mapa 3D, conexiones
          de radio, antenas/bandas, peers). La privacidad y el servidor viven en el
          panel maestro de la pestaña «Antenas» → sin ajustes duplicados. */}
      {tab === "redmesh" && <RedMeshCenter embedded showMap={!compact} showPrivacy={false} hideHeader />}
    </div>
  );
}

export default SignalsCenter;
