"use client";

/**
 * SignalDetailCard — FICHA COMPLETA de una señal detectada (Adenda 150).
 * ============================================================================
 * Todo lo que se sabe DE VERDAD de una señal, sin rellenos: tipo de antena y de
 * señal, calidad numérica real (dB/dBm/ms), última vez oída, posición con su
 * INCERTIDUMBRE declarada, los datos PÚBLICOS de la neurona StarSeed si la señal
 * está vinculada a una cuenta, y las ACCIONES que de verdad se pueden ejecutar
 * (o el motivo exacto de que no).
 *
 * Todas las acciones llaman a funciones REALES del subsistema mesh
 * (`connectMesh`, `connectWifiNode`, `transmit`, `addMeshServer`) — ninguna es
 * decorativa. SSR-safe. Nunca lanza.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity, BadgeCheck, CircleSlash2, Compass, ExternalLink, Gauge, Radar,
  RadioTower, Server, ShieldQuestion, Target, Waves, X, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePrompt } from "@/components/ui/confirm-dialog";
import {
  addMeshServer, connectMesh, connectWifiNode, getConnectivitySettings, transmit,
} from "@/ai/astraura/mesh";
import type { DetectedSignal, SignalActionKind } from "@/ai/astraura/mesh/signals";

function fmtAge(at: number | null): string {
  if (!at) return "sin dato";
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
}

function fmtDistance(m: number | null): string {
  if (m == null) return "no medible";
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m} m`;
}

const MODE_LABEL: Record<DetectedSignal["placement"]["mode"], string> = {
  gps: "posición GPS real",
  rf: "distancia por RF · rumbo desconocido",
  sector: "sin posición · sector de su antena",
};

const MODE_CLS: Record<DetectedSignal["placement"]["mode"], string> = {
  gps: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200",
  rf: "border-sky-400/35 bg-sky-500/10 text-sky-200",
  sector: "border-amber-400/35 bg-amber-500/10 text-amber-200",
};

export interface SignalDetailCardProps {
  signal: DetectedSignal;
  onClose?: () => void;
  /** Abrir la Red Mesh (pestaña o página) desde la ficha. */
  onOpenMesh?: () => void;
  className?: string;
}

export function SignalDetailCard({ signal, onClose, onOpenMesh, className }: SignalDetailCardProps) {
  const router = useRouter();
  const prompt = usePrompt();
  const [busy, setBusy] = useState<string | null>(null);
  const p = signal.placement;
  const q = signal.quality;

  const run = async (a: SignalActionKind) => {
    if (!a.enabled) {
      toast.message(a.label, { description: a.hint ?? "Esta acción no está disponible para esta señal." });
      return;
    }
    setBusy(a.id);
    try {
      switch (a.id) {
        case "open-mesh": {
          onOpenMesh?.();
          break;
        }
        case "connect-serial": {
          await connectMesh("serial");
          toast.success("Abriendo el radio por serie…");
          break;
        }
        case "connect-ble": {
          await connectMesh("ble");
          toast.success("Buscando el radio por Bluetooth…");
          break;
        }
        case "connect-daemon": {
          await connectMesh("daemon", { daemonUrl: getConnectivitySettings().daemonUrl });
          toast.success("Conectando al daemon meshtasticd…");
          break;
        }
        case "connect-wifi-node": {
          const host = await prompt({
            title: "Conectar nodo Wi-Fi",
            label: "IP o host del nodo Meshtastic en tu red (puerto 4403 por defecto):",
            defaultValue: "192.168.1.",
          });
          if (host?.trim()) {
            await connectWifiNode(host.trim());
            toast.success("Conectando a la malla por IP…");
          }
          break;
        }
        case "sync-now": {
          const isNode = signal.antenna === "lora";
          const nodeNum = isNode ? Number(signal.id.split(":")[1]) : undefined;
          // El relé direcciona por el id de DISPOSITIVO DE MALLA. Los faros y las
          // topologías federadas lo publican; el registro de neuronas usa OTRO
          // espacio de ids, así que ahí NO se pone `recipient` (iría a un buzón
          // inexistente): se envía al relé de la cuenta y lo recogen todas.
          const relayAddressable =
            signal.starseed?.via === "relay-beacon" || signal.starseed?.via === "federation";
          const receipt = await transmit({
            scope: "private",
            cls: "P1",
            type: "presence",
            // Whitelist de `presence`: h (handle) · n (nombre) · b (batería).
            body: { h: "starseed", n: "sync" },
            target: isNode ? "node" : "account",
            distance: isNode ? "local" : "far",
            ...(Number.isFinite(nodeNum) ? { destNode: nodeNum } : {}),
            ...(relayAddressable && signal.starseed ? { recipient: signal.starseed.sourceId } : {}),
          });
          const okHops = receipt.hops.filter((h) => h.status === "sent" || h.status === "confirmed");
          if (okHops.length) {
            toast.success("Sincronización enviada", { description: receipt.summary });
          } else {
            toast.error("No se pudo sincronizar", { description: receipt.summary });
          }
          break;
        }
        case "add-server": {
          const port = signal.starseed?.port;
          const host = await prompt({
            title: "Añadir como servidor",
            label: `Esta neurona anuncia que ofrece internet público${port ? ` en el puerto ${port}` : ""}, pero el faro NO publica su IP (privacidad). Escribe el host o IP que te haya dado su dueño:`,
            defaultValue: "",
          });
          if (host?.trim()) {
            const raw = host.trim();
            const endpoint = /^https?:\/\//i.test(raw) ? raw : `http://${raw}${port ? `:${port}` : ""}`;
            const srv = addMeshServer({
              name: signal.starseed?.name || "Servidor de neurona StarSeed",
              endpoint,
              visibility: "public",
              notes: `Añadido desde el radar de señales (faro ${signal.starseed?.sourceId ?? "?"}).`,
            });
            toast.success(`Servidor «${srv.name}» añadido`, { description: endpoint });
          }
          break;
        }
        case "open-neurons": {
          router.push("/agent?tab=neuronas");
          break;
        }
        case "none":
        default:
          break;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar la acción");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn("rounded-2xl border border-white/12 bg-black/45 p-3", className)}>
      {/* Cabecera: nombre + tipo de señal + cierre */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-bold text-white/95">
            <span className="size-2 shrink-0 rounded-full" style={{ background: signal.color }} aria-hidden />
            <span className="truncate">{signal.label}</span>
            {signal.simulated && (
              <span className="shrink-0 rounded-full border border-amber-400/40 bg-amber-500/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-amber-200">
                Simulador
              </span>
            )}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-white/50">
            <span className="inline-flex items-center gap-1"><RadioTower className="h-3 w-3" />{signal.antennaLabel}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1"><Waves className="h-3 w-3" />{signal.signalType}</span>
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ficha de señal"
            className="shrink-0 cursor-pointer rounded-lg border border-white/10 bg-white/[0.04] p-1 text-white/50 transition-colors duration-200 hover:border-white/25 hover:text-white/85"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <p className="mt-1.5 text-[11px] leading-snug text-white/60">{signal.detail}</p>

      {/* Calidad real */}
      <div className="mt-2 rounded-xl border border-white/8 bg-white/[0.02] px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/80">
            <Gauge className="h-3.5 w-3.5 text-sky-300" /> Calidad de señal
          </span>
          <span className="tabular-nums text-[11px] font-black text-white/85">
            {q == null ? "no medible" : `${Math.round(q * 100)} / 100`}
          </span>
        </div>
        {q != null && (
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${Math.round(q * 100)}%`, background: signal.color }}
            />
          </div>
        )}
        <p className="mt-1 text-[10px] leading-snug text-white/45">{signal.qualityDetail}</p>
      </div>

      {/* Posición + anillo de precisión */}
      <div className="mt-2 rounded-xl border border-white/8 bg-white/[0.02] px-2.5 py-2">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/80">
            <Target className="h-3.5 w-3.5 text-emerald-300" /> Posición e incertidumbre
          </span>
          <span className={cn("rounded-full border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider", MODE_CLS[p.mode])}>
            {MODE_LABEL[p.mode]}
          </span>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1.5 text-[10px]">
          <span className="text-white/45">Distancia estimada</span>
          <span className="text-right tabular-nums text-white/80">{fmtDistance(p.distanceM)}</span>
          <span className="text-white/45">Rango de precisión</span>
          <span className="text-right tabular-nums text-white/80">
            {p.accuracyM == null ? "no expresable en metros" : `± ${fmtDistance(p.accuracyM)}`}
          </span>
          <span className="text-white/45">Anillo en el radar</span>
          <span className="text-right tabular-nums text-white/80">{Math.round(p.accuracyFrac * 200)} % del radio</span>
        </div>
        <p className="mt-1 flex items-start gap-1 text-[10px] leading-snug text-white/45">
          <Compass className="mt-0.5 h-3 w-3 shrink-0" /> {p.detail}
        </p>
      </div>

      {/* Métricas crudas reales */}
      {signal.metrics.length > 0 && (
        <div className="mt-2 rounded-xl border border-white/8 bg-white/[0.02] px-2.5 py-2">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/80">
            <Activity className="h-3.5 w-3.5 text-violet-300" /> Datos medidos
          </p>
          <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
            {signal.metrics.map((m) => (
              <div key={m.label} className="contents">
                <span className="truncate text-white/45">{m.label}</span>
                <span className="truncate text-right tabular-nums text-white/80" title={m.value}>{m.value}</span>
              </div>
            ))}
            <span className="text-white/45">Última vez oída</span>
            <span className="text-right tabular-nums text-white/80">{fmtAge(signal.lastHeard)}</span>
          </div>
        </div>
      )}

      {/* Cuenta StarSeed vinculada (datos PÚBLICOS) */}
      {signal.starseed ? (
        <div className="mt-2 rounded-xl border border-violet-400/25 bg-violet-500/[0.06] px-2.5 py-2">
          <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-violet-100">
            <BadgeCheck className="h-3.5 w-3.5 text-violet-300" />
            Cuenta StarSeed vinculada
            <span className="rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-violet-200">
              {signal.starseed.ownAccount ? "tu cuenta" : "otra cuenta"}
            </span>
          </p>
          <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
            <span className="text-white/45">Nombre público</span>
            <span className="truncate text-right text-white/85">{signal.starseed.name ?? "no compartido (anónima)"}</span>
            <span className="text-white/45">Vínculo verificado por</span>
            <span className="text-right text-white/70">
              {signal.starseed.via === "neuron-registry" ? "registro de neuronas de la cuenta"
                : signal.starseed.via === "federation" ? "federación de topología (mismo nº de nodo)"
                : "faro firmado del relé"}
            </span>
            {signal.starseed.platform && (<>
              <span className="text-white/45">Plataforma</span>
              <span className="text-right text-white/85">{signal.starseed.platform}</span>
            </>)}
            {signal.starseed.deviceKind && (<>
              <span className="text-white/45">Tipo de dispositivo</span>
              <span className="text-right text-white/85">{signal.starseed.deviceKind}</span>
            </>)}
            {typeof signal.starseed.online === "boolean" && (<>
              <span className="text-white/45">Presencia</span>
              <span className={cn("text-right font-semibold", signal.starseed.online ? "text-emerald-300" : "text-white/55")}>
                {signal.starseed.online ? "en línea" : "desconectada"}
              </span>
            </>)}
            {signal.starseed.region && (<>
              <span className="text-white/45">Región LoRa</span>
              <span className="text-right text-white/85">{signal.starseed.region}</span>
            </>)}
            {signal.starseed.preset && (<>
              <span className="text-white/45">Preset de módem</span>
              <span className="text-right text-white/85">{signal.starseed.preset}</span>
            </>)}
          </div>
          {signal.starseed.capabilities.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {signal.starseed.capabilities.map((c) => (
                <span key={c} className="rounded-full border border-violet-400/25 bg-violet-500/10 px-1.5 py-0.5 text-[9px] text-violet-100/90">
                  {c}
                </span>
              ))}
            </div>
          )}
          <p className="mt-1 text-[9px] leading-snug text-white/40">
            Solo datos PÚBLICOS declarados por esa neurona. Nada privado (memorias, archivos, claves) viaja por aquí.
          </p>
          {signal.starseed.via === "neuron-registry" && (
            <Link
              href="/agent?tab=neuronas"
              className="mt-1.5 inline-flex cursor-pointer items-center gap-1 text-[10px] text-violet-200/85 transition-colors duration-200 hover:text-violet-100"
            >
              <ExternalLink className="h-3 w-3" /> Abrir panel de neuronas
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-2 flex items-start gap-1.5 rounded-xl border border-white/8 bg-white/[0.02] px-2.5 py-2 text-[10px] leading-snug text-white/50">
          <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/35" />
          Sin cuenta StarSeed vinculada: esta señal no declara identidad de la red, así que no hay perfil público que mostrar.
        </div>
      )}

      {/* Compatibilidad y opciones */}
      <div className={cn("mt-2 rounded-xl border px-2.5 py-2",
        signal.compatible ? "border-emerald-400/25 bg-emerald-500/[0.05]" : "border-amber-400/25 bg-amber-500/[0.05]")}>
        <p className={cn("flex items-center gap-1.5 text-[11px] font-semibold", signal.compatible ? "text-emerald-200" : "text-amber-200")}>
          {signal.compatible ? <Zap className="h-3.5 w-3.5" /> : <CircleSlash2 className="h-3.5 w-3.5" />}
          {signal.compatible ? "Compatible con la red StarSeed" : "No compatible con el protocolo de la malla"}
        </p>
        <p className="mt-0.5 text-[10px] leading-snug text-white/60">{signal.compatDetail}</p>
      </div>

      {/* Acciones REALES */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {signal.actions.map((a) => (
          <button
            key={a.id + a.label}
            type="button"
            title={a.hint}
            disabled={busy !== null}
            onClick={() => void run(a)}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors duration-200",
              a.enabled
                ? "border-sky-400/35 bg-sky-500/10 text-sky-100 hover:bg-sky-500/20"
                : "border-white/10 bg-white/[0.03] text-white/40 hover:border-white/20",
              busy !== null && "cursor-wait opacity-60",
            )}
          >
            {a.id === "add-server" ? <Server className="h-3 w-3" />
              : a.id === "sync-now" ? <Radar className="h-3 w-3" />
              : <RadioTower className="h-3 w-3" />}
            {busy === a.id ? "…" : a.label}
          </button>
        ))}
      </div>
      {signal.actions.some((a) => !a.enabled && a.hint) && (
        <ul className="mt-1 space-y-0.5">
          {signal.actions.filter((a) => !a.enabled && a.hint).map((a) => (
            <li key={`hint-${a.id}${a.label}`} className="text-[9px] leading-snug text-white/40">
              <span className="font-semibold text-white/55">{a.label}:</span> {a.hint}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default SignalDetailCard;
