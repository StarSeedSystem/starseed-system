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
import { useRouter } from "next/navigation";
import {
  RadioTower, Wifi, Signal, Bluetooth, MapPin, Nfc, Usb, Phone,
  ExternalLink, Settings2, ShieldCheck, Antenna, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SignalsRadar } from "./signals-radar";
import {
  useMeshState, detectSignals, connectMesh, getConnectivitySettings,
  subscribeConnectivity, setNeuronPosition,
  type SignalSource, type SignalKind,
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

export interface SignalsCenterProps {
  embedded?: boolean;
  compact?: boolean;
}

export function SignalsCenter({ embedded = false, compact = false }: SignalsCenterProps) {
  const mesh = useMeshState();
  const router = useRouter();
  const [signals, setSignals] = useState<SignalSource[]>([]);
  const [busy, setBusy] = useState<SignalKind | null>(null);
  const meshRef = useRef(mesh);
  meshRef.current = mesh;

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

  const runAction = async (sig: SignalSource, action: string) => {
    try {
      if (action === "Abrir Red Mesh") { router.push("/red-mesh"); return; }
      setBusy(sig.kind);
      if (sig.kind === "mesh" || sig.kind === "serial" || sig.kind === "bluetooth") {
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

      {/* Radar de señales (nodos reales de la malla) */}
      <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
        <SignalsRadar height={compact ? 200 : 260} showLegend />
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

      {/* Accesos a configuración */}
      <div className="flex flex-wrap gap-2">
        <Link href="/red-mesh" className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/80 transition-colors hover:border-emerald-400/40">
          <RadioTower className="h-3.5 w-3.5 text-emerald-300" /> Configurar la Red Mesh P2P
        </Link>
        <Link href="/red-mesh" className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/80 transition-colors hover:border-sky-400/40">
          <Settings2 className="h-3.5 w-3.5 text-sky-300" /> Antenas y bandas (preset inteligente)
        </Link>
        <Link href="/red-mesh" className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/80 transition-colors hover:border-fuchsia-400/40">
          <ShieldCheck className="h-3.5 w-3.5 text-fuchsia-300" /> Privacidad y permisos
        </Link>
      </div>

      <p className="flex items-start gap-1.5 text-[10px] leading-snug text-white/35">
        <Wifi className="mt-0.5 h-3 w-3 shrink-0" />
        Honesto: el radio LoRa emite y recibe de verdad sin operadores; GPS, Bluetooth, Serie y NFC se
        controlan con tu permiso; Wi-Fi, datos celulares y telefonía solo se informan — el navegador no
        controla esas antenas ni escanea redes (sería vigilancia y la plataforma lo impide).
      </p>
    </div>
  );
}

export default SignalsCenter;
