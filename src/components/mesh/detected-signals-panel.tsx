"use client";

/**
 * DetectedSignalsPanel — INVENTARIO VIVO de todas las señales detectadas
 * (Adenda 150).
 * ============================================================================
 * La lista completa de lo que esta neurona OYE ahora mismo, agrupada por familia
 * de antena, con su tipo de señal, calidad numérica real, rango de precisión,
 * cuenta StarSeed vinculada (si la hay) y las acciones de interconexión /
 * sincronización que de verdad existen para cada una — incluidas las señales NO
 * compatibles, que también aparecen con lo que sí se puede hacer con ellas.
 *
 * Cada antena sin señales tiene un ESTADO VACÍO PROFESIONAL: qué falta y qué
 * botón real lo resuelve. Lo que el navegador no permite se declara tal cual.
 * SSR-safe. Nunca lanza.
 */

import { useMemo, useState } from "react";
import {
  Bluetooth, ChevronDown, CircleAlert, Info, Loader2, RadioTower, RefreshCw,
  Router, Satellite, ScanLine, Server, Usb, Cpu, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePrompt } from "@/components/ui/confirm-dialog";
import { connectMesh, connectWifiNode, getConnectivitySettings, useMeshState } from "@/ai/astraura/mesh";
import {
  ANTENNA_COLOR, ANTENNA_LABEL, startBleScan, stopBleScan, summarizeByAntenna,
  type AntennaKind, type DetectedSignal,
} from "@/ai/astraura/mesh/signals";
import { useDetectedSignals } from "./use-detected-signals";
import { SignalDetailCard } from "./signal-detail";

const ANTENNA_ICON: Record<AntennaKind, LucideIcon> = {
  lora: RadioTower,
  relay: Satellite,
  account: Cpu,
  ip: Router,
  ble: Bluetooth,
  serial: Usb,
};

const ANTENNA_ORDER: AntennaKind[] = ["lora", "relay", "account", "ip", "ble", "serial"];

/** Qué se puede hacer cuando una antena no oye nada — con botones REALES. */
interface EmptyAction { id: string; label: string; run: () => Promise<void> | void }

function fmtDistance(m: number | null): string {
  if (m == null) return "—";
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

const MODE_BADGE: Record<DetectedSignal["placement"]["mode"], { label: string; cls: string }> = {
  gps: { label: "GPS", cls: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200" },
  rf: { label: "est. RF", cls: "border-sky-400/35 bg-sky-500/10 text-sky-200" },
  sector: { label: "sin posición", cls: "border-amber-400/35 bg-amber-500/10 text-amber-200" },
};

export interface DetectedSignalsPanelProps {
  compact?: boolean;
  /** Abrir la Red Mesh (pestaña del contenedor o navegación). */
  onOpenMesh?: () => void;
  className?: string;
}

export function DetectedSignalsPanel({ compact = false, onOpenMesh, className }: DetectedSignalsPanelProps) {
  const prompt = usePrompt();
  const mesh = useMeshState();
  const { signals, ble, loadingNeurons, unavailable, refresh } = useDetectedSignals();
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<AntennaKind | "todas">("todas");
  const [busy, setBusy] = useState<string | null>(null);

  const summary = useMemo(() => summarizeByAntenna(signals), [signals]);
  const totals = useMemo(
    () => ({
      total: signals.length,
      compatible: signals.filter((s) => s.compatible).length,
      starseed: signals.filter((s) => s.starseed).length,
      gps: signals.filter((s) => s.placement.mode === "gps").length,
    }),
    [signals],
  );

  const guard = async (id: string, fn: () => Promise<void> | void) => {
    setBusy(id);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar la acción");
    } finally {
      setBusy(null);
    }
  };

  const emptyActions = (antenna: AntennaKind): { text: string; actions: EmptyAction[] } => {
    switch (antenna) {
      case "lora":
        return {
          text: mesh.status === "ready" || mesh.status === "degraded"
            ? "La malla está conectada pero aún no ha oído a ningún vecino. Los nodos aparecen en cuanto emiten (NodeInfo o cualquier paquete)."
            : "No hay radio LoRa conectado, así que no se oye ningún nodo por radiofrecuencia. Conéctalo por USB, por Bluetooth o apunta al daemon meshtasticd de tu red.",
          actions: [
            { id: "serial", label: "Conectar radio USB", run: async () => { await connectMesh("serial"); toast.success("Abriendo el radio por serie…"); } },
            { id: "ble", label: "Conectar radio BLE", run: async () => { await connectMesh("ble"); toast.success("Buscando el radio por Bluetooth…"); } },
            {
              id: "daemon", label: "Conectar daemon meshtasticd",
              run: async () => {
                const url = await prompt({
                  title: "Daemon meshtasticd",
                  label: "URL del daemon (meshtasticd o nodo con API HTTP):",
                  defaultValue: getConnectivitySettings().daemonUrl,
                });
                if (url?.trim()) {
                  await connectMesh("daemon", { daemonUrl: url.trim() });
                  toast.success("Conectando al daemon…");
                }
              },
            },
          ],
        };
      case "ble":
        return {
          text: ble.detail,
          actions: ble.support === "unsupported"
            ? []
            : [{
                id: "scan",
                label: ble.scanning ? "Detener escaneo BLE" : "Escanear BLE",
                run: async () => {
                  if (ble.scanning) { stopBleScan(); return; }
                  const st = await startBleScan();
                  if (st.error) toast.error(st.error);
                  else if (!st.scanning && st.detections.length === 0) toast.message("Sin resultados", { description: st.detail });
                },
              }],
        };
      case "serial":
        return {
          text: typeof navigator !== "undefined" && "serial" in navigator
            ? "No hay ningún puerto serie autorizado todavía. El navegador solo revela un puerto después de que tú lo elijas en su diálogo."
            : "Web Serial no existe en este navegador: usa Chrome o Edge de escritorio para radios USB.",
          actions: typeof navigator !== "undefined" && "serial" in navigator
            ? [{ id: "serial", label: "Autorizar radio USB", run: async () => { await connectMesh("serial"); toast.success("Elige el puerto del radio…"); } }]
            : [],
        };
      case "relay":
        return {
          text: "Ninguna neurona StarSeed ha emitido un faro reciente alcanzable desde aquí. Los faros caducan a los 5 minutos y solo se emiten con el internet público encendido.",
          actions: [{ id: "refresh", label: "Volver a sondear", run: () => { refresh(); toast.message("Sondeando faros…"); } }],
        };
      case "account":
        return {
          text: "El registro de la cuenta no devuelve otras neuronas: o esta es tu única neurona, o no hay sesión iniciada.",
          actions: [{ id: "refresh", label: "Refrescar registro", run: () => { refresh(); } }],
        };
      case "ip":
      default:
        return {
          text: "Sin portadora IP activa: el navegador reporta que no hay red externa. La malla LoRa directa sigue funcionando sin ella.",
          actions: [{
            id: "wifi-node", label: "Conectar nodo por IP",
            run: async () => {
              const host = await prompt({ title: "Conectar nodo Wi-Fi", label: "IP o host del nodo Meshtastic:", defaultValue: "192.168.1." });
              if (host?.trim()) { await connectWifiNode(host.trim()); toast.success("Conectando por IP…"); }
            },
          }],
        };
    }
  };

  const visible = filter === "todas" ? ANTENNA_ORDER : [filter];

  return (
    <div className={cn("rounded-2xl border border-white/10 bg-black/30 p-3", className)}>
      {/* Cabecera + totales reales */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-white/90">
            <ScanLine className="h-4 w-4 text-sky-300" /> Señales detectadas
            <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-sky-200">
              {totals.total}
            </span>
          </h3>
          <p className="mt-0.5 text-[10px] text-white/45">
            {totals.compatible} compatibles · {totals.starseed} con cuenta StarSeed · {totals.gps} con posición GPS real
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {ble.support !== "unsupported" && (
            <button
              type="button"
              disabled={busy === "ble-top"}
              onClick={() => void guard("ble-top", async () => {
                if (ble.scanning) { stopBleScan(); return; }
                const st = await startBleScan();
                if (st.error) toast.error(st.error);
              })}
              title={ble.detail}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-medium transition-colors duration-200",
                ble.scanning
                  ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
                  : "border-blue-400/30 bg-blue-500/10 text-blue-100 hover:bg-blue-500/20",
              )}
            >
              <Bluetooth className="h-3.5 w-3.5" />
              {ble.scanning ? "Detener escaneo BLE" : "Escanear BLE"}
            </button>
          )}
          <button
            type="button"
            onClick={refresh}
            aria-label="Volver a sondear todas las fuentes"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/65 transition-colors duration-200 hover:border-white/25 hover:text-white/90"
          >
            {loadingNeurons ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sondear
          </button>
        </div>
      </div>

      {/* Aviso INEQUÍVOCO cuando la malla corre sobre el simulador */}
      {mesh.transport === "simulator" && (
        <p className="mt-2 flex items-start gap-1.5 rounded-xl border border-amber-400/35 bg-amber-500/10 px-2.5 py-1.5 text-[10px] leading-snug text-amber-100">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-black uppercase tracking-wider">Simulador activo</span> — los nodos LoRa de esta lista los genera el
            simulador de la malla: NO existen en el aire. Conecta un radio real para ver señales verdaderas.
          </span>
        </p>
      )}

      {/* Filtros por familia de antena (con su recuento real) */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setFilter("todas")}
          className={cn(
            "cursor-pointer rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors duration-200",
            filter === "todas" ? "border-sky-400/40 bg-sky-500/15 text-sky-100" : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white/85",
          )}
        >
          Todas ({totals.total})
        </button>
        {summary.map((s) => {
          const Icon = ANTENNA_ICON[s.antenna];
          return (
            <button
              key={s.antenna}
              type="button"
              onClick={() => setFilter(s.antenna)}
              title={s.label}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors duration-200",
                filter === s.antenna ? "border-sky-400/40 bg-sky-500/15 text-sky-100" : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white/85",
              )}
            >
              <Icon className="h-3 w-3" style={{ color: s.count > 0 ? s.color : undefined }} />
              {s.label.split(" ")[0]} ({s.count})
            </button>
          );
        })}
      </div>

      {/* Grupos por antena */}
      <div className="mt-2 space-y-2">
        {visible.map((antenna) => {
          const items = signals.filter((s) => s.antenna === antenna);
          const Icon = ANTENNA_ICON[antenna];
          const color = ANTENNA_COLOR[antenna];
          const empty = emptyActions(antenna);
          return (
            <section key={antenna} className="rounded-xl border border-white/8 bg-white/[0.02] p-2">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white/80">
                <Icon className="h-3.5 w-3.5" style={{ color }} />
                {ANTENNA_LABEL[antenna]}
                <span className="rounded-full border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-white/55">
                  {items.length}
                </span>
              </p>

              {items.length === 0 ? (
                <div className="mt-1.5 rounded-lg border border-dashed border-white/10 px-2.5 py-2">
                  <p className="text-[10px] leading-snug text-white/45">{empty.text}</p>
                  {empty.actions.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {empty.actions.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          disabled={busy === `${antenna}-${a.id}`}
                          onClick={() => void guard(`${antenna}-${a.id}`, a.run)}
                          className={cn(
                            "inline-flex cursor-pointer items-center gap-1 rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 text-[9px] font-bold text-sky-100 transition-colors duration-200 hover:bg-sky-500/20",
                            busy === `${antenna}-${a.id}` && "cursor-wait opacity-60",
                          )}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-1.5 space-y-1">
                  {items.map((s) => {
                    const isOpen = open === s.id;
                    const mode = MODE_BADGE[s.placement.mode];
                    return (
                      <div key={s.id}>
                        <button
                          type="button"
                          onClick={() => setOpen(isOpen ? null : s.id)}
                          aria-expanded={isOpen}
                          className={cn(
                            "flex w-full cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors duration-200",
                            isOpen ? "border-sky-400/35 bg-sky-500/[0.08]" : "border-white/5 bg-white/[0.02] hover:border-white/20",
                          )}
                        >
                          <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate text-[11px] font-semibold text-white/90">{s.label}</span>
                              {s.starseed && (
                                <span className="shrink-0 rounded-full border border-violet-400/30 bg-violet-500/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-violet-200">
                                  {s.starseed.ownAccount ? "tu cuenta" : "StarSeed"}
                                </span>
                              )}
                              {!s.compatible && (
                                <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-500/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-amber-200">
                                  no compatible
                                </span>
                              )}
                              {s.simulated && (
                                <span className="shrink-0 rounded-full border border-amber-400/40 bg-amber-500/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-amber-200">
                                  simulador
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block truncate text-[9px] text-white/45">{s.signalType}</span>
                          </span>
                          <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                            <span className={cn("rounded-full border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider", mode.cls)}>
                              {mode.label}
                            </span>
                            <span className="w-12 text-right text-[10px] tabular-nums text-white/60">
                              {fmtDistance(s.placement.distanceM)}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <span className="h-1.5 w-10 overflow-hidden rounded-full bg-white/[0.07]">
                              <span
                                className="block h-full rounded-full"
                                style={{ width: `${Math.round((s.quality ?? 0) * 100)}%`, background: s.color }}
                              />
                            </span>
                            <span className="w-8 text-right text-[10px] tabular-nums text-white/70">
                              {s.quality == null ? "—" : Math.round(s.quality * 100)}
                            </span>
                            <ChevronDown className={cn("h-3.5 w-3.5 text-white/40 transition-transform duration-200", isOpen && "rotate-180")} />
                          </span>
                        </button>
                        {isOpen && (
                          <SignalDetailCard className="mt-1" signal={s} onClose={() => setOpen(null)} onOpenMesh={onOpenMesh} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Fuentes NO disponibles, con su razón exacta (honestidad radical) */}
      {!compact && unavailable.length > 0 && (
        <details className="group mt-2 rounded-xl border border-white/8 bg-white/[0.02] px-2.5 py-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold text-white/70">
            <Info className="h-3.5 w-3.5 text-white/45" />
            Qué NO se puede detectar aquí y por qué
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-white/50">
              {unavailable.length}
            </span>
            <ChevronDown className="ml-auto h-3.5 w-3.5 text-white/40 transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <ul className="mt-1.5 space-y-1.5">
            {unavailable.map((u) => (
              <li key={u.id} className="text-[10px] leading-snug text-white/50">
                <span className="font-semibold text-white/75">{u.label}:</span> {u.reason}
                {u.fix && <span className="block text-white/40">→ {u.fix}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="mt-2 flex items-start gap-1.5 text-[9px] leading-snug text-white/35">
        <Server className="mt-0.5 h-3 w-3 shrink-0" />
        Todo lo listado sale de fuentes REALES del navegador y del subsistema mesh: el radio LoRa mide SNR/RSSI,
        el relé publica faros con TTL, el registro de la cuenta guarda el latido de cada neurona, la Network
        Information API mide la portadora IP y Web Bluetooth entrega el RSSI de cada anuncio. Nada se estima
        sin decirlo: cada señal declara su rango de precisión.
      </p>
    </div>
  );
}

export default DetectedSignalsPanel;
