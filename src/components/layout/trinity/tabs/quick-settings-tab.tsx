"use client";

/**
 * QuickSettingsTab — pestaña "Control" del Centro de Control (Logic/Este).
 * ----------------------------------------------------------------------------
 * Antes: TODO mock (toggles de wifi/bluetooth/power con useState local que no
 * persistía ni afectaba nada). Ahora: cada control lee/escribe estado REAL:
 *
 *   · Tema claro/oscuro   → useTheme() (next-themes), ciclo light/dark.
 *   · Transparencias      → config.styling.opacity (mismo campo que usa
 *                           Ajustes → Apariencia; ver performance-settings.tsx).
 *   · Rendimiento         → lib/perf/device-tier (auto/alto/eco), el MISMO
 *                           sistema que PerformanceSettings — no se duplica
 *                           lógica, solo se ofrece un acceso rápido compacto.
 *     Nota: no existe ningún sistema real de "sonido/SFX de UI" en el proyecto
 *     (comprobado: sin flags de audio en context/lib) — así que este hueco NO
 *     se rellena con un toggle falso; se sustituye por Rendimiento, que sí
 *     tiene backend real.
 *   · Aurora (voz)        → lib/aurora/tts-oss/voice-config (motor activo:
 *                           navegador/Kokoro/Kitten). Aurora siempre puede
 *                           hablar (no hay "mute" global real); se muestra el
 *                           motor activo con un indicador de color como estado.
 *   · Red / sincronización→ hasStarseedSession() (settings-sync.ts), mismo
 *                           patrón visual que account-sync-panel.tsx.
 *   · Brillo del fondo    → config.background.overlayOpacity (invertido: más
 *                           overlay = menos brillo), vía updateSection.
 *   · Atmósfera del fondo → atajo a la pestaña "Hogar" (fusionada como
 *                           Atmósfera del sistema, ver smart-home-tab.tsx) en
 *                           vez de duplicar los mismos controles aquí.
 *   · Ajustes completos   → link real a /settings.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Slider } from "@/components/ui/slider";
import {
    Moon, Sun, Sparkles, Settings, ChevronRight,
    ShieldCheck, CircleSlash, CloudUpload, Gauge, Zap, Leaf,
    SunDim, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { useAppearance } from "@/context/appearance-context";
import { hasStarseedSession, pushPreferences } from "@/lib/settings-sync";
import {
    getRealtimeSyncStatus,
    onRealtimeSyncStatus,
    type RealtimeSyncStatus,
} from "@/lib/sync/realtime-sync";
import {
    getPerfMode,
    setPerfMode,
    type PerfMode,
} from "@/lib/perf/device-tier";
import {
    getVoiceConfig,
    subscribeVoiceConfig,
    type AuroraVoiceEngine,
} from "@/lib/aurora/tts-oss/voice-config";
import { CONTROL_CENTER_NAVIGATE_EVENT } from "../control-center-events";

const AURORA_ENGINE_LABEL: Record<AuroraVoiceEngine, string> = {
    browser: "Navegador",
    kokoro: "Kokoro (mejorada)",
    kitten: "Kitten (beta)",
    // Motores NEURALES por endpoint (Adenda voz de Aurora, jul-2026): servidores
    // Python en una neurona propia/CasaOS. Si fallan, la cadena de respaldo
    // (Kokoro → navegador) mantiene a Aurora hablando siempre.
    bark: "Bark (neuronal)",
    "gpt-sovits": "GPT-SoVITS (clonación)",
    omnivoice: "OmniVoice (multilingüe)",
};

const PERF_OPTIONS: Array<{ id: PerfMode; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
    { id: "auto", label: "Auto", Icon: Sparkles },
    { id: "high", label: "Alto", Icon: Zap },
    { id: "eco", label: "Eco", Icon: Leaf },
];

export function QuickSettingsTab() {
    const router = useRouter();
    const { setTheme, theme } = useTheme();
    const { config, updateSection } = useAppearance();

    const [mounted, setMounted] = useState(false);
    const [session, setSession] = useState<boolean | null>(null);
    const [syncBusy, setSyncBusy] = useState(false);
    const [perfMode, setPerfModeState] = useState<PerfMode>("auto");
    const [auroraEngine, setAuroraEngine] = useState<AuroraVoiceEngine>("browser");
    const [realtimeStatus, setRealtimeStatus] = useState<RealtimeSyncStatus>(getRealtimeSyncStatus());

    useEffect(() => {
        setMounted(true);
        setPerfModeState(getPerfMode());
        setAuroraEngine(getVoiceConfig().engine);
        hasStarseedSession().then(setSession);

        const syncAurora = () => setAuroraEngine(getVoiceConfig().engine);
        const off = subscribeVoiceConfig(syncAurora);
        const offSync = onRealtimeSyncStatus(setRealtimeStatus);
        return () => { off(); offSync(); };
    }, []);

    const isDark = theme === "dark";
    const toggleTheme = useCallback(() => {
        setTheme(isDark ? "light" : "dark");
    }, [isDark, setTheme]);

    const choosePerf = useCallback((m: PerfMode) => {
        setPerfModeState(m);
        setPerfMode(m);
    }, []);

    const handleSyncPush = useCallback(async () => {
        setSyncBusy(true);
        await pushPreferences();
        setSyncBusy(false);
    }, []);

    // Pide al ControlCenter que cambie a la pestaña "Hogar" (Atmósfera del
    // sistema) — evento interno, sin acoplar este archivo a control-center.tsx.
    const goToAtmosphere = useCallback(() => {
        try {
            window.dispatchEvent(new CustomEvent(CONTROL_CENTER_NAVIGATE_EVENT, { detail: { tab: "home" } }));
        } catch { /* noop */ }
    }, []);

    // Transparencias del cristal — mismo campo que Ajustes → Apariencia.
    const opacityPct = Math.round((config.styling.opacity ?? 0.65) * 100);
    const setOpacityPct = (pct: number) => {
        updateSection("styling", { opacity: Math.min(1, Math.max(0, pct / 100)) });
    };

    // Brillo del fondo — overlayOpacity más alto = overlay más oscuro = fondo
    // MENOS brillante. Slider mostrado ya invertido (100 = brillo máximo).
    const overlayOpacity = config.background.overlayOpacity ?? 0.1;
    const brightnessPct = Math.round((1 - overlayOpacity) * 100);
    const setBrightnessPct = (pct: number) => {
        updateSection("background", { overlayOpacity: Math.min(1, Math.max(0, 1 - pct / 100)) });
    };

    return (
        <div className="space-y-6 pt-2">
            {/* Tema + Aurora */}
            <div className="grid grid-cols-2 gap-3">
                <NeonToggle
                    active={mounted && isDark}
                    onClick={toggleTheme}
                    icon={mounted && isDark ? Moon : Sun}
                    label="Tema"
                    color="cyan"
                    status={!mounted ? "…" : isDark ? "Oscuro" : "Claro"}
                />
                <AuroraCard engine={auroraEngine} />
            </div>

            {/* Rendimiento (auto/alto/eco) — mismo sistema que Ajustes → Rendimiento */}
            <div className="space-y-2">
                <div className="flex items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
                    <Gauge className="w-3.5 h-3.5 text-cyan-400" /> Rendimiento
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {PERF_OPTIONS.map(({ id, label, Icon }) => (
                        <MiniToggle
                            key={id}
                            active={perfMode === id}
                            onClick={() => choosePerf(id)}
                            icon={Icon}
                            color={id === "eco" ? "amber" : id === "high" ? "red" : "blue"}
                            label={label}
                        />
                    ))}
                </div>
            </div>

            {/* Red / sincronización de cuenta */}
            <SyncStatusRow session={session} busy={syncBusy} onPush={handleSyncPush} realtime={realtimeStatus} />

            {/* Sliders reales */}
            <div className="space-y-4 bg-black/20 p-5 rounded-2xl border border-white/5 backdrop-blur-md">
                <EnergySlider
                    icon={Layers}
                    value={opacityPct}
                    onChange={(v: number[]) => setOpacityPct(v[0])}
                    label="Transparencia del cristal"
                    colorClass="[&>.relative>.absolute]:bg-cyan-500"
                />
                <EnergySlider
                    icon={SunDim}
                    value={brightnessPct}
                    onChange={(v: number[]) => setBrightnessPct(v[0])}
                    label="Brillo del fondo"
                    colorClass="[&>.relative>.absolute]:bg-amber-500"
                />
            </div>

            {/* Atajos */}
            <div className="grid grid-cols-1 gap-2">
                <button
                    type="button"
                    onClick={goToAtmosphere}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all duration-200 cursor-pointer group"
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 shrink-0">
                            <Sparkles className="w-4 h-4" />
                        </div>
                        <div className="text-left min-w-0">
                            <div className="text-sm font-medium truncate">Atmósfera del fondo</div>
                            <div className="text-[10px] text-muted-foreground truncate">Variante, partículas y ciclo — pestaña Hogar</div>
                        </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </button>
                <button
                    type="button"
                    onClick={() => router.push("/settings")}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all duration-200 cursor-pointer group"
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-lg bg-white/5 text-foreground/70 shrink-0">
                            <Settings className="w-4 h-4" />
                        </div>
                        <div className="text-left min-w-0">
                            <div className="text-sm font-medium truncate">Ajustes completos</div>
                            <div className="text-[10px] text-muted-foreground truncate">Apariencia, cuenta, Aurora y más</div>
                        </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </button>
            </div>
        </div>
    );
}

function AuroraCard({ engine }: { engine: AuroraVoiceEngine }) {
    const router = useRouter();
    return (
        <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => router.push("/settings")}
            className={cn(
                "relative h-20 rounded-2xl border flex flex-col items-center justify-center gap-1.5 p-2 transition-all duration-300 overflow-hidden group cursor-pointer",
                "bg-cyan-500/10 border-cyan-500/30 text-cyan-300 shadow-[0_0_20px_-5px] shadow-cyan-500/50"
            )}
        >
            <div className="flex items-center justify-center relative w-full">
                <Sparkles className="w-6 h-6" />
                <div className="absolute right-2 top-0 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981] animate-pulse" />
            </div>
            <div className="text-center w-full px-2 flex flex-col items-center justify-center min-w-0">
                <div className="font-semibold text-xs md:text-sm truncate w-full">Aurora</div>
                <div className="text-[9px] md:text-[10px] opacity-70 truncate w-full">{AURORA_ENGINE_LABEL[engine]}</div>
            </div>
        </motion.button>
    );
}

function realtimeDotClass(state: RealtimeSyncStatus["state"] | undefined): string {
    switch (state) {
        case "connected": return "bg-emerald-400";
        case "connecting": return "bg-amber-400 animate-pulse";
        case "error": return "bg-red-400";
        default: return "bg-zinc-500";
    }
}

function realtimeRelative(ts: number | null | undefined): string {
    if (!ts) return "sin cambios";
    const diff = Date.now() - ts;
    if (diff < 5_000) return "ahora";
    if (diff < 60_000) return `hace ${Math.round(diff / 1000)}s`;
    if (diff < 3_600_000) return `hace ${Math.round(diff / 60_000)}min`;
    return `hace ${Math.round(diff / 3_600_000)}h`;
}

function SyncStatusRow({ session, busy, onPush, realtime }: {
    session: boolean | null;
    busy: boolean;
    onPush: () => void;
    realtime?: RealtimeSyncStatus;
}) {
    return (
        <div className={cn(
            "flex items-center gap-2.5 p-3 rounded-xl border text-xs transition-colors duration-200",
            session === false
                ? "border-amber-500/30 bg-amber-500/5 text-amber-300"
                : "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
        )}>
            {session === false ? <CircleSlash className="w-4 h-4 shrink-0" /> : <ShieldCheck className="w-4 h-4 shrink-0" />}
            <span className="flex-1 min-w-0 truncate">
                {session === null ? "Comprobando sesión…"
                    : session ? "Sesión StarSeed activa"
                        : "Sin sesión — ajustes solo locales"}
                {session && realtime && (
                    <span className="inline-flex items-center gap-1 ml-2 text-muted-foreground">
                        <span className={cn("w-1.5 h-1.5 rounded-full", realtimeDotClass(realtime.state))} />
                        {realtimeRelative(realtime.lastChangeAt)}
                    </span>
                )}
            </span>
            {session && (
                <button
                    type="button"
                    onClick={onPush}
                    disabled={busy}
                    title="Subir mis ajustes a la cuenta"
                    className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 transition-colors cursor-pointer shrink-0",
                        busy && "opacity-50 cursor-not-allowed"
                    )}
                >
                    <CloudUpload className={cn("w-3.5 h-3.5", busy && "animate-pulse")} />
                    <span className="hidden sm:inline">{busy ? "Subiendo…" : "Sincronizar"}</span>
                </button>
            )}
        </div>
    );
}

function NeonToggle({ active, onClick, icon: Icon, label, color = "cyan", status }: {
    active: boolean;
    onClick: () => void;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    color?: "cyan" | "blue" | "amber";
    status: string;
}) {
    const colorMap: Record<string, string> = {
        cyan: "shadow-cyan-500/50 text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
        blue: "shadow-blue-500/50 text-blue-400 bg-blue-500/10 border-blue-500/30",
        amber: "shadow-amber-500/50 text-amber-400 bg-amber-500/10 border-amber-500/30",
    };

    const activeClass = colorMap[color];

    return (
        <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={onClick}
            className={cn(
                "relative h-20 rounded-2xl border flex flex-col items-center justify-center gap-1.5 p-2 transition-all duration-300 overflow-hidden group cursor-pointer",
                active
                    ? `${activeClass} shadow-[0_0_20px_-5px]`
                    : "bg-white/5 border-white/5 text-muted-foreground hover:bg-white/10"
            )}
        >
            <div className="flex items-center justify-center relative w-full">
                <Icon className="w-6 h-6" />
            </div>
            <div className="text-center w-full px-2 flex flex-col items-center justify-center min-w-0">
                <div className="font-semibold text-xs md:text-sm truncate w-full">{label}</div>
                <div className="text-[9px] md:text-[10px] opacity-70 truncate w-full">{status}</div>
            </div>

            {active && (
                <div className="absolute inset-0 bg-gradient-to-tr from-current to-transparent opacity-10 pointer-events-none" />
            )}
        </motion.button>
    );
}

function MiniToggle({ active, onClick, icon: Icon, color = "blue", label }: {
    active: boolean;
    onClick: () => void;
    icon: React.ComponentType<{ className?: string }>;
    color?: "blue" | "amber" | "red";
    label: string;
}) {
    const colorMap: Record<string, string> = {
        blue: "text-blue-400 bg-blue-500/10 border-blue-500/30 shadow-blue-500/20",
        amber: "text-amber-400 bg-amber-500/10 border-amber-500/30 shadow-amber-500/20",
        red: "text-red-400 bg-red-500/10 border-red-500/30 shadow-red-500/20",
    };

    return (
        <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                "h-14 rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-all duration-300 cursor-pointer",
                active
                    ? `${colorMap[color]} border shadow-[0_0_15px_-3px]`
                    : "bg-white/5 border-white/5 text-muted-foreground hover:bg-white/10"
            )}
        >
            <Icon className="w-4 h-4" />
            <span className="text-[8px] font-mono uppercase tracking-wider opacity-80">{label}</span>
        </motion.button>
    );
}

function EnergySlider({ icon: Icon, value, onChange, label, colorClass }: {
    icon: React.ComponentType<{ className?: string }>;
    value: number;
    onChange: (v: number[]) => void;
    label: string;
    colorClass?: string;
}) {
    return (
        <div className="space-y-3">
            <div className="flex justify-between text-xs font-medium text-muted-foreground px-1">
                <span className="flex items-center gap-2"><Icon className="w-3 h-3" /> {label}</span>
                <span>{value}%</span>
            </div>
            <Slider
                value={[value]}
                max={100}
                onValueChange={onChange}
                className={cn("cursor-pointer", colorClass)}
            />
        </div>
    );
}
