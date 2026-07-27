"use client";

/**
 * MeshControlPanel — pestaña «Red Mesh» de Astraura IA (Adenda 97 · SOP §7.1).
 * ============================================================================
 * Panel de control COMPLETO de la malla Meshtastic/LoRa:
 *   · Conexión del radio: USB (Web Serial) · Bluetooth · daemon local · simulador.
 *   · Salud dual Wi-Fi ↔ Mesh (las mismas puntuaciones que usa el router).
 *   · Nodos vivos con métricas (SNR · RSSI · batería · saltos · última vez).
 *   · Historial de decisiones de enrutado (transparencia radical del router).
 *   · Cola de sincronización + presupuesto de airtime (duty cycle).
 *   · Pruebas honestas: presencia P1 y alerta P0 de ensayo.
 *
 * Diseño: Crystal Liquid Glass (cards border-white/10 bg-black/20, acentos
 * esmeralda), iconos SIEMPRE Lucide, cursor-pointer, transiciones 200 ms.
 * SSR-safe. Nunca lanza.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Battery,
  BatteryCharging,
  Bluetooth,
  Cable,
  CircuitBoard,
  FlaskConical,
  Gauge,
  ListTree,
  Radio,
  RadioTower,
  Send,
  Server,
  Signal,
  Unplug,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  connectMesh,
  disconnectMesh,
  sendOverMesh,
  startMeshSubsystem,
  useMeshState,
  type MeshNodeInfo,
  type MeshTransportKind,
  type RouteDecision,
} from "@/ai/astraura/mesh";
import { MESH_DAEMON_DEFAULT_URL } from "@/ai/astraura/mesh/constants";

/* ── Utilidades de presentación ────────────────────────────────────────────── */

function timeAgo(ms: number): string {
  if (!ms) return "—";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return `hace ${h} h`;
}

function scoreColor(score: number): string {
  if (score >= 0.55) return "text-emerald-300";
  if (score >= 0.35) return "text-amber-300";
  return "text-rose-300";
}

const ROUTE_LABEL: Record<RouteDecision["route"], { label: string; cls: string }> = {
  wifi: { label: "Wi-Fi", cls: "bg-sky-500/15 text-sky-200 border-sky-400/30" },
  mesh: { label: "Mesh", cls: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30" },
  dual: { label: "Dual", cls: "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/30" },
  "queued-mesh": { label: "Mesh (cola)", cls: "bg-amber-500/15 text-amber-200 border-amber-400/30" },
  "offline-queue": { label: "Cola offline", cls: "bg-zinc-500/15 text-zinc-300 border-zinc-400/30" },
};

const REASON_LABEL: Record<RouteDecision["reason"], string> = {
  "no-radio": "sin radio conectada",
  "wifi-healthy": "Wi-Fi sana",
  "wifi-degraded": "Wi-Fi degradada → malla",
  "mesh-forced-by-rule": "regla de neurona fuerza malla",
  "mesh-unhealthy": "malla insuficiente",
  "critical-dual-path": "alerta crítica: doble ruta",
  "duty-budget-exhausted": "presupuesto de airtime agotado",
  "payload-too-large": "payload demasiado grande para LoRa",
  "all-links-down": "sin ninguna ruta viva",
};

const STATUS_LABEL: Record<string, string> = {
  disconnected: "Sin radio conectada",
  connecting: "Conectando con el radio…",
  configuring: "Leyendo config + NodeDB…",
  ready: "Malla operativa",
  degraded: "Enlace débil (sin tramas recientes)",
  reconnecting: "Reconectando…",
  error: "Error de conexión",
};

/* ── Sub-componentes ───────────────────────────────────────────────────────── */

function NodeCard({ node }: { node: MeshNodeInfo }) {
  const dot =
    node.presence === "online"
      ? "bg-emerald-400"
      : node.presence === "stale"
        ? "bg-amber-400"
        : "bg-zinc-500";
  const battery =
    typeof node.batteryLevel === "number" ? (
      <span className="inline-flex items-center gap-1 text-white/60">
        {node.batteryLevel > 100 ? (
          <BatteryCharging className="h-3 w-3 text-emerald-300" />
        ) : (
          <Battery className="h-3 w-3" />
        )}
        {node.batteryLevel > 100 ? "red" : `${node.batteryLevel}%`}
      </span>
    ) : null;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 transition-colors duration-200 hover:border-emerald-400/25",
        node.isSelf && "border-emerald-400/30 bg-emerald-500/[0.06]",
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />
        <div className="min-w-0">
          <p className="truncate text-sm text-white/90">
            {node.longName || node.shortName || node.id || `Nodo ${node.num.toString(16)}`}
            {node.isSelf && <span className="ml-1.5 text-[10px] text-emerald-300">este radio</span>}
          </p>
          <p className="truncate text-[11px] text-white/40">
            {node.id ?? `!${node.num.toString(16)}`}
            {node.hwModel ? ` · ${node.hwModel}` : ""}
            {node.role && node.role !== "CLIENT" ? ` · ${node.role}` : ""}
            {typeof node.hopsAway === "number" ? ` · ${node.hopsAway} salto${node.hopsAway === 1 ? "" : "s"}` : ""}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-[11px]">
        {typeof node.snr === "number" && (
          <span className="inline-flex items-center gap-1 text-white/60">
            <Signal className="h-3 w-3" /> {node.snr.toFixed(1)} dB
          </span>
        )}
        {typeof node.rssi === "number" && (
          <span className="hidden text-white/40 sm:inline">{Math.round(node.rssi)} dBm</span>
        )}
        {battery}
        <span className="text-white/40">{timeAgo(node.lastHeard)}</span>
      </div>
    </div>
  );
}

/* ── Panel principal ───────────────────────────────────────────────────────── */

export function MeshControlPanel() {
  const state = useMeshState();
  const [busy, setBusy] = useState<MeshTransportKind | "off" | null>(null);
  const [daemonUrl, setDaemonUrl] = useState(MESH_DAEMON_DEFAULT_URL);

  // Arranca los monitores pasivos (salud Wi-Fi + presencia) al abrir el panel.
  useEffect(() => {
    startMeshSubsystem();
  }, []);

  const online = useMemo(
    () => state.nodes.filter((n) => !n.isSelf && n.presence === "online").length,
    [state.nodes],
  );
  const connected = state.status === "ready" || state.status === "degraded";

  const connect = useCallback(
    async (kind: MeshTransportKind) => {
      setBusy(kind);
      try {
        await connectMesh(kind, kind === "daemon" ? { daemonUrl } : undefined);
        toast.success(
          kind === "simulator"
            ? "Malla simulada activa (modo demo, sin radio)."
            : "Radio Meshtastic conectada. Leyendo la malla…",
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo conectar con el radio.");
      } finally {
        setBusy(null);
      }
    },
    [daemonUrl],
  );

  const disconnect = useCallback(async () => {
    setBusy("off");
    try {
      await disconnectMesh();
      toast("Radio desconectada.");
    } finally {
      setBusy(null);
    }
  }, []);

  const sendTestPresence = useCallback(() => {
    const r = sendOverMesh({
      type: "presence",
      cls: "P1",
      body: { h: "esta-neurona", n: "Prueba", b: 100 },
    });
    toast(
      `Presencia de prueba → ${ROUTE_LABEL[r.decision.route].label} (${REASON_LABEL[r.decision.reason]}).`,
    );
  }, []);

  const sendTestAlert = useCallback(() => {
    const r = sendOverMesh({
      type: "alert",
      cls: "P0",
      body: { k: "ensayo", txt: "Alerta de ENSAYO StarSeed", ttl: 300, sev: 1 },
    });
    toast.warning(
      `Alerta de ensayo → ${ROUTE_LABEL[r.decision.route].label} (${REASON_LABEL[r.decision.reason]}).`,
    );
  }, []);

  const budgetPct = state.budget.capacityMs
    ? Math.round((state.budget.availableMs / state.budget.capacityMs) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* ── Conexión del radio ── */}
      <Card className="border-white/10 bg-black/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <RadioTower className="h-4 w-4 text-emerald-300" /> Red Mesh · Meshtastic (LoRa)
          </CardTitle>
          <CardDescription>
            Comunicación descentralizada y fuera de red para cuando la infraestructura falle o sea
            comprometida. Conecta un radio LoRa (T-Beam, Heltec, T-Echo…) por USB o Bluetooth
            (Chrome/Edge), por un nodo WiFi/daemon local, o prueba el simulador sin hardware.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => void connect("serial")}
              disabled={busy !== null}
              className="cursor-pointer gap-1.5 bg-emerald-600 transition-colors duration-200 hover:bg-emerald-500"
            >
              <Cable className="h-3.5 w-3.5" /> USB (Serial)
            </Button>
            <Button
              size="sm"
              onClick={() => void connect("ble")}
              disabled={busy !== null}
              className="cursor-pointer gap-1.5 bg-emerald-600 transition-colors duration-200 hover:bg-emerald-500"
            >
              <Bluetooth className="h-3.5 w-3.5" /> Bluetooth
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void connect("daemon")}
              disabled={busy !== null}
              className="cursor-pointer gap-1.5 border-white/15 transition-colors duration-200 hover:border-emerald-400/40"
            >
              <Server className="h-3.5 w-3.5" /> Nodo WiFi / daemon
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void connect("simulator")}
              disabled={busy !== null}
              className="cursor-pointer gap-1.5 border-white/15 transition-colors duration-200 hover:border-fuchsia-400/40"
            >
              <FlaskConical className="h-3.5 w-3.5" /> Simulador
            </Button>
            {connected && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void disconnect()}
                disabled={busy !== null}
                className="cursor-pointer gap-1.5 text-white/60 transition-colors duration-200 hover:text-rose-300"
              >
                <Unplug className="h-3.5 w-3.5" /> Desconectar
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  connected ? "bg-emerald-400" : state.status === "error" ? "bg-rose-400" : "bg-zinc-500",
                  (state.status === "connecting" || state.status === "configuring" || state.status === "reconnecting") &&
                    "animate-pulse bg-sky-400",
                )}
              />
              {STATUS_LABEL[state.status] ?? state.status}
              {state.transport ? ` · ${state.transport}` : ""}
            </span>
            {state.lastError && <span className="text-rose-300/80">{state.lastError}</span>}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={daemonUrl}
              onChange={(e) => setDaemonUrl(e.target.value)}
              placeholder="URL del nodo WiFi o meshtasticd (http://192.168.1.40)"
              className="h-8 max-w-sm border-white/10 bg-white/5 text-xs"
            />
            <span className="text-[11px] text-white/35">
              Solo para «Nodo WiFi / daemon». USB y Bluetooth piden permiso del navegador.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Salud dual + presupuesto + cola ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="border-white/10 bg-black/20">
          <CardContent className="p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/40">
              <Wifi className="h-3.5 w-3.5" /> Wi-Fi / Internet
            </p>
            <p className={cn("mt-1 text-xl font-semibold", scoreColor(state.wifiHealth.score))}>
              {(state.wifiHealth.score * 100).toFixed(0)}
              <span className="ml-0.5 text-xs text-white/40">/100</span>
            </p>
            <p className="mt-0.5 truncate text-[11px] text-white/45">{state.wifiHealth.detail}</p>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-black/20">
          <CardContent className="p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/40">
              <Radio className="h-3.5 w-3.5" /> Malla LoRa
            </p>
            <p className={cn("mt-1 text-xl font-semibold", scoreColor(state.meshHealth.score))}>
              {(state.meshHealth.score * 100).toFixed(0)}
              <span className="ml-0.5 text-xs text-white/40">/100</span>
            </p>
            <p className="mt-0.5 truncate text-[11px] text-white/45">{state.meshHealth.detail}</p>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-black/20">
          <CardContent className="p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/40">
              <Gauge className="h-3.5 w-3.5" /> Airtime (duty cycle)
            </p>
            <p className="mt-1 text-xl font-semibold text-white/85">
              {budgetPct}
              <span className="ml-0.5 text-xs text-white/40">%</span>
            </p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-400/80 transition-all duration-300"
                style={{ width: `${Math.max(2, budgetPct)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-white/45">
              objetivo {state.budget.targetDutyPct} % · región {state.region}
            </p>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-black/20">
          <CardContent className="p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/40">
              <ListTree className="h-3.5 w-3.5" /> Cola de sync
            </p>
            <p className="mt-1 text-xl font-semibold text-white/85">{state.queue.pending}</p>
            <p className="mt-0.5 text-[11px] text-white/45">
              P0 {state.queue.byClass.P0} · P1 {state.queue.byClass.P1} · P2 {state.queue.byClass.P2} · P3{" "}
              {state.queue.byClass.P3}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Nodos ── */}
      <Card className="border-white/10 bg-black/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CircuitBoard className="h-4 w-4 text-emerald-300" /> Nodos de la malla
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
              {online} en línea
            </span>
          </CardTitle>
          <CardDescription>
            Descubrimiento pasivo continuo: cada NodeInfo/telemetría oída actualiza la topología en
            tiempo real, sin gastar airtime ni batería.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {state.nodes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/40">
              Sin nodos todavía. Conecta un radio o arranca el simulador para ver la malla viva.
            </p>
          ) : (
            state.nodes.map((n) => <NodeCard key={n.num} node={n} />)
          )}
        </CardContent>
      </Card>

      {/* ── Decisiones del router + pruebas ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="border-white/10 bg-black/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4 text-emerald-300" /> Decisiones de enrutado
            </CardTitle>
            <CardDescription>
              Transparencia radical: cada envío registra POR QUÉ fue por Wi-Fi, por la malla o por
              ambas (alertas críticas).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {state.decisions.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-center text-sm text-white/40">
                Aún no hay decisiones. Usa las pruebas de la derecha.
              </p>
            ) : (
              state.decisions.slice(0, 10).map((d, i) => (
                <div
                  key={`${d.at}-${i}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-[11px]"
                >
                  <span className={cn("rounded-full border px-2 py-0.5", ROUTE_LABEL[d.route].cls)}>
                    {ROUTE_LABEL[d.route].label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-white/55">
                    {d.cls} · {REASON_LABEL[d.reason]}
                  </span>
                  <span className="shrink-0 text-white/35">
                    W {(d.wifiScore * 100).toFixed(0)} · M {(d.meshScore * 100).toFixed(0)} ·{" "}
                    {timeAgo(d.at)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-black/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Send className="h-4 w-4 text-emerald-300" /> Pruebas de la malla
            </CardTitle>
            <CardDescription>
              Envíos reales de ensayo por el pipeline completo (router → codec → cola → radio). La
              alerta va marcada como «ensayo» — honestidad ante todo.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={sendTestPresence}
              className="cursor-pointer gap-1.5 border-white/15 transition-colors duration-200 hover:border-sky-400/40"
            >
              <Send className="h-3.5 w-3.5" /> Presencia de prueba (P1)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={sendTestAlert}
              className="cursor-pointer gap-1.5 border-white/15 transition-colors duration-200 hover:border-amber-400/40"
            >
              <AlertTriangle className="h-3.5 w-3.5" /> Alerta de ENSAYO (P0)
            </Button>
            <p className="mt-1 w-full text-[11px] leading-relaxed text-white/40">
              El troceo (≤200 B por trama), la compresión deflate y el presupuesto de duty cycle se
              aplican automáticamente. Los sobres viajan por el puerto de app privado de Meshtastic
              (PRIVATE_APP 256) con el cifrado del canal.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default MeshControlPanel;
