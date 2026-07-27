"use client";

/**
 * AntennasPanel — ANTENAS, BANDAS y SELECTOR INTELIGENTE (Adenda 98).
 * ============================================================================
 * Muestra las vías de radio REALES de esta neurona (LoRa · Wi-Fi · BT ·
 * celular, con honestidad sobre qué controla el OS y qué no), la banda
 * regional activa del radio con sus límites legales, y el SELECTOR INTELIGENTE
 * de preset: alcance ↔ equilibrio ↔ velocidad ↔ automático (decide con el SNR
 * de la vecindad, la densidad y la congestión del canal — y APLICA el cambio
 * al radio de verdad con un clic).
 */

import { useCallback, useMemo, useState } from "react";
import { Antenna, Bluetooth, Gauge, RadioTower, Signal, Smartphone, Wand2, Wifi } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  antennaInventory,
  applyModemPreset,
  getActiveModemPreset,
  PRESET_ORDER,
  PRESET_SPECS,
  recommendPreset,
  REGION_BANDS,
  useMeshState,
  type BandGoal,
} from "@/ai/astraura/mesh";

const ANTENNA_ICONS: Record<string, typeof Antenna> = {
  lora: RadioTower,
  wifi: Wifi,
  bluetooth: Bluetooth,
  cellular: Smartphone,
};

const GOALS: Array<{ id: BandGoal; label: string; hint: string }> = [
  { id: "auto", label: "Automático", hint: "decide con SNR, densidad y congestión" },
  { id: "distancia", label: "Distancia", hint: "máximo alcance" },
  { id: "equilibrio", label: "Equilibrio", hint: "alcance/velocidad" },
  { id: "velocidad", label: "Velocidad", hint: "máxima capacidad" },
];

export function AntennasPanel() {
  const state = useMeshState();
  const [goal, setGoal] = useState<BandGoal>("auto");
  const [applying, setApplying] = useState(false);
  const connected = state.status === "ready" || state.status === "degraded";
  const activePreset = getActiveModemPreset();
  const band = REGION_BANDS[state.region] ?? REGION_BANDS.UNSET;
  const antennas = useMemo(() => antennaInventory(state.region, connected), [state.region, connected]);

  const reco = useMemo(() => {
    const online = state.nodes.filter((n) => !n.isSelf && n.presence === "online");
    const snrs = online.map((n) => n.snr).filter((v): v is number => typeof v === "number");
    return recommendPreset(
      goal,
      {
        avgSnr: snrs.length ? snrs.reduce((a, b) => a + b, 0) / snrs.length : null,
        onlineNodes: online.length,
        channelUtilPct: state.self?.channelUtilization ?? null,
        region: state.region,
      },
      activePreset === "UNSET" ? null : activePreset,
    );
  }, [goal, state.nodes, state.self?.channelUtilization, state.region, activePreset]);

  const apply = useCallback(async () => {
    setApplying(true);
    try {
      const ok = await applyModemPreset(reco.presetKey);
      if (ok) {
        toast.success(
          `Preset ${PRESET_SPECS[reco.presetKey]?.label ?? reco.presetKey} aplicado al radio. El enlace puede reiniciarse unos segundos.`,
        );
      } else {
        toast.error(
          connected
            ? "El radio no aceptó el cambio (transporte sin soporte de escritura)."
            : "Conecta un radio (o el simulador) para aplicar el preset.",
        );
      }
    } finally {
      setApplying(false);
    }
  }, [reco.presetKey, connected]);

  return (
    <Card className="border-white/10 bg-black/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Antenna className="h-4 w-4 text-emerald-300" /> Antenas y bandas de radiofrecuencia
        </CardTitle>
        <CardDescription>
          Lo que esta neurona puede EMITIR y RECIBIR de verdad — la telecomunicación sin compañías la
          da el radio LoRa en su banda libre regional; Wi-Fi y Bluetooth son transporte y red externa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Inventario de antenas */}
        <div className="grid gap-2 sm:grid-cols-2">
          {antennas.map((a) => {
            const Icon = ANTENNA_ICONS[a.id] ?? Antenna;
            return (
              <div
                key={a.id}
                className={cn(
                  "rounded-xl border px-3 py-2.5 transition-colors duration-200",
                  a.controllable
                    ? "border-emerald-400/25 bg-emerald-500/[0.05]"
                    : "border-white/10 bg-white/[0.03]",
                )}
              >
                <p className="flex items-center gap-1.5 text-[12px] font-medium text-white/90">
                  <Icon className={cn("h-3.5 w-3.5", a.controllable ? "text-emerald-300" : "text-white/40")} />
                  {a.label}
                  {a.controllable && (
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-1.5 text-[9px] text-emerald-200">
                      controlable
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[11px] text-white/55">{a.bands}</p>
                <p className="mt-0.5 text-[10px] leading-snug text-white/40">
                  {a.role}
                  {a.note ? ` · ${a.note}` : ""}
                </p>
              </div>
            );
          })}
        </div>

        {/* Banda regional activa */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/60">
          <Signal className="h-3.5 w-3.5 text-emerald-300" />
          <span className="font-medium text-white/85">Banda LoRa activa: {band.key}</span>
          <span>
            {band.freqStartMhz}–{band.freqEndMhz} MHz · duty {band.dutyPct}% · máx {band.powerDbm} dBm
            {band.note ? ` · ${band.note}` : ""}
          </span>
        </div>

        {/* Selector inteligente */}
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-white/85">
            <Wand2 className="h-3.5 w-3.5 text-emerald-300" /> Selector inteligente de banda/preset
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {GOALS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGoal(g.id)}
                title={g.hint}
                className={cn(
                  "cursor-pointer rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-200",
                  goal === g.id
                    ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                    : "border-white/12 bg-white/[0.04] text-white/60 hover:border-emerald-400/30",
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.06] px-2.5 py-2">
            <div className="min-w-0">
              <p className="text-[12px] text-emerald-100">
                Recomendado: <span className="font-semibold">{PRESET_SPECS[reco.presetKey]?.label ?? reco.presetKey}</span>
                {!reco.changes && <span className="ml-1.5 text-[10px] text-white/45">(ya activo)</span>}
              </p>
              <p className="mt-0.5 text-[10px] leading-snug text-white/50">{reco.reason}</p>
            </div>
            <Button
              size="sm"
              onClick={() => void apply()}
              disabled={applying || !connected || !reco.changes}
              className="h-7 cursor-pointer gap-1.5 bg-emerald-600 px-2.5 text-[11px] transition-colors duration-200 hover:bg-emerald-500 disabled:opacity-40"
            >
              <Gauge className="h-3 w-3" /> {applying ? "Aplicando…" : "Aplicar al radio"}
            </Button>
          </div>
          {/* Tabla honesta de presets */}
          <div className="mt-2.5 grid grid-cols-1 gap-1 sm:grid-cols-3">
            {PRESET_ORDER.map((k) => {
              const p = PRESET_SPECS[k];
              const isActive = activePreset === k;
              const isReco = reco.presetKey === k;
              return (
                <div
                  key={k}
                  className={cn(
                    "rounded-lg border px-2 py-1.5 text-[10px] transition-colors duration-200",
                    isActive
                      ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-100"
                      : isReco
                        ? "border-emerald-400/25 bg-white/[0.04] text-white/70"
                        : "border-white/8 bg-white/[0.02] text-white/50",
                  )}
                >
                  <span className="font-medium">{p.label}</span>
                  <span className="ml-1">
                    {p.kbps} kbps · alcance {p.range}/10
                    {isActive ? " · ACTIVO" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default AntennasPanel;
