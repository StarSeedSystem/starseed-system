"use client";

/**
 * PeersPanel — PEERS P2P ACTIVOS + ROUTERS EXTERNOS (Adenda 98).
 * ============================================================================
 * Todo lo interconectado, en un solo lugar:
 *   · Peers P2P de la malla LoRa con sus datos de antena (SNR/RSSI, saltos,
 *     batería, hardware) — los mismos del panel Red Mesh, aquí en tabla densa.
 *   · Neuronas FEDERADAS de tu cuenta (con su región/preset = datos de antena
 *     del peer remoto) y cuántos nodos ve cada una.
 *   · Router(es) EXTERNOS: la conexión Wi-Fi/datos del dispositivo con su tipo,
 *     velocidad estimada y RTT (Network Information API) + salud medida.
 */

import { useEffect, useState } from "react";
import { Globe, Network, Radio, Router, Satellite } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  externalLink,
  PRESET_SPECS,
  subscribeConnectivity,
  useMeshState,
  type ConnectivityLink,
} from "@/ai/astraura/mesh";

function timeAgo(ms: number): string {
  if (!ms) return "—";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.round(m / 60)} h`;
}

export function PeersPanel() {
  const state = useMeshState();
  const [ext, setExt] = useState<ConnectivityLink | null>(null);

  useEffect(() => {
    const refresh = () => setExt(externalLink());
    refresh();
    return subscribeConnectivity(refresh);
  }, []);

  const peers = state.nodes.filter((n) => !n.isSelf);
  const remotes = state.remoteTopologies ?? [];

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/* Peers P2P activos */}
      <Card className="border-white/10 bg-black/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Network className="h-4 w-4 text-emerald-300" /> Peers P2P activos
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
              {peers.filter((n) => n.presence === "online").length} en línea
            </span>
          </CardTitle>
          <CardDescription>Datos de antena de cada peer al alcance del radio.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {peers.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-center text-[12px] text-white/40">
              Sin peers todavía — conecta el radio o el simulador.
            </p>
          ) : (
            peers.map((n) => (
              <div
                key={n.num}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-[11px]"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      n.presence === "online" ? "bg-emerald-400" : n.presence === "stale" ? "bg-amber-400" : "bg-zinc-500",
                    )}
                  />
                  <span className="truncate text-white/80">
                    {n.shortName || n.longName || `!${n.num.toString(16)}`}
                  </span>
                  {n.hwModel && <span className="shrink-0 text-white/35">{n.hwModel}</span>}
                </span>
                <span className="shrink-0 text-white/45">
                  {typeof n.snr === "number" ? `${n.snr.toFixed(1)} dB` : "—"}
                  {typeof n.rssi === "number" ? ` · ${Math.round(n.rssi)} dBm` : ""}
                  {typeof n.hopsAway === "number" ? ` · ${n.hopsAway} salto${n.hopsAway === 1 ? "" : "s"}` : ""}
                  {` · ${timeAgo(n.lastHeard)}`}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Federadas + router externo */}
      <div className="space-y-3">
        <Card className="border-white/10 bg-black/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Satellite className="h-4 w-4 text-violet-300" /> Tus otras neuronas (federación)
            </CardTitle>
            <CardDescription>Qué malla ve cada dispositivo de tu cuenta, con su antena.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {remotes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 px-4 py-4 text-center text-[12px] text-white/40">
                Sin instantáneas federadas (necesita sesión + otra neurona con malla activa).
              </p>
            ) : (
              remotes.map((r) => (
                <div
                  key={r.deviceId}
                  className="flex items-center justify-between gap-2 rounded-lg border border-violet-400/15 bg-violet-500/[0.04] px-2.5 py-1.5 text-[11px]"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Radio className="h-3 w-3 shrink-0 text-violet-300" />
                    <span className="truncate text-white/80">{r.label}</span>
                  </span>
                  <span className="shrink-0 text-white/45">
                    {r.onlineCount} nodos · {r.snapshot.region ?? "?"}
                    {r.snapshot.preset && r.snapshot.preset !== "UNSET"
                      ? ` · ${PRESET_SPECS[r.snapshot.preset]?.label ?? r.snapshot.preset}`
                      : ""}
                    {` · ${timeAgo(r.at)}`}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-black/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Router className="h-4 w-4 text-sky-300" /> Router / red externa
            </CardTitle>
            <CardDescription>La conexión convencional del dispositivo, medida de verdad.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
              <span className="flex items-center gap-1.5 text-white/80">
                <Globe className="h-3 w-3 text-sky-300" /> {ext?.label ?? "Red externa"}
              </span>
              <span className={cn("text-white/45", ext?.availability === "off" && "text-rose-300")}>
                {ext?.detail ?? "midiendo…"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
              <span className="text-white/60">Salud medida (sonda del router de Astraura)</span>
              <span className="text-white/45">
                {(state.wifiHealth.score * 100).toFixed(0)}/100 · {state.wifiHealth.detail}
              </span>
            </div>
            <p className="text-[10px] leading-snug text-white/40">
              El navegador no expone SSID ni la lista de redes (privacidad de la plataforma); lo que ves
              es el estado, tipo y velocidad REALES de la conexión activa.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default PeersPanel;
