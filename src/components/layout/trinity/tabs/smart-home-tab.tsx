"use client";

/**
 * SmartHomeTab — "Atmósfera del sistema" (pestaña "Hogar" del Centro de Control).
 * ----------------------------------------------------------------------------
 * El template original ("Smart Home": TV/termostato/cerrojo) era un mock de
 * dispositivos IoT sin sentido para un OS social — StarSeed no gestiona
 * hardware doméstico. Se reemplaza por el equivalente real que SÍ existe en
 * este sistema: el estado del fondo/atmósfera visual activa, con controles
 * reales conectados a `useAppearance()` (config.background), igual que hace
 * Ajustes → Apariencia → Fondo.
 *
 * Se mantiene el nombre de archivo y el export `SmartHomeTab` para no romper
 * el import en control-center.tsx.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Waves, Sparkles, SunDim, Wifi, Home as HomeIcon, Loader2, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Slider } from "@/components/ui/slider";
import { useAppearance } from "@/context/appearance-context";
import type { AppearanceConfig } from "@/context/appearance-context";

type LivingVariant = NonNullable<AppearanceConfig["background"]["living"]>["variant"];

const LIVING_VARIANTS: Array<{ id: LivingVariant; label: string }> = [
    { id: "aurora", label: "Aurora" },
    { id: "nebula", label: "Nebulosa" },
    { id: "starfield", label: "Campo estelar" },
    { id: "mycelium", label: "Micelio" },
    { id: "plasma", label: "Plasma" },
    { id: "prisma", label: "Prisma" },
    { id: "ocean", label: "Océano" },
];

/** Etiqueta legible del tipo de fondo activo (para los que no son "living"). */
const BG_TYPE_LABELS: Partial<Record<AppearanceConfig["background"]["type"], string>> = {
    solid: "Sólido",
    gradient: "Degradado",
    image: "Imagen",
    video: "Vídeo",
    webgl: "WebGL",
    spline: "Escena Spline",
    living: "Fondo vivo",
    audiomorphic: "Audiomorphic (visualizador)",
    "liquid-aurora": "Líquido · Aurora",
    "liquid-plasma": "Líquido · Plasma",
    "liquid-lava": "Líquido · Lava",
    "liquid-oceanic": "Líquido · Oceánico",
    "liquid-iris": "Líquido · Iris",
    "materia-oro-vivo": "Materia · Oro vivo",
    "materia-cristal-liquido": "Materia · Cristal líquido",
    "materia-bosque-dorado": "Materia · Bosque dorado",
};

export function SmartHomeTab() {
    const { config, updateSection } = useAppearance();
    const bg = config.background;
    const isLiving = bg.type === "living";
    const living = bg.living;

    const currentVariantIndex = useMemo(() => {
        if (!living) return 0;
        const idx = LIVING_VARIANTS.findIndex((v) => v.id === living.variant);
        return idx === -1 ? 0 : idx;
    }, [living]);

    const currentVariantLabel = isLiving && living
        ? (LIVING_VARIANTS[currentVariantIndex]?.label ?? living.variant)
        : (BG_TYPE_LABELS[bg.type] ?? bg.type);

    const cycleVariant = () => {
        if (!isLiving || !living) return;
        const next = LIVING_VARIANTS[(currentVariantIndex + 1) % LIVING_VARIANTS.length];
        updateSection("background", { living: { ...living, variant: next.id } });
    };

    // Intensidad de partículas/efectos: "living.intensity" si el fondo es vivo,
    // o el "intensity" genérico (fondos "materia-*") como equivalente honesto.
    const intensityValue = isLiving && living ? living.intensity : (bg.intensity ?? 0.7);
    const setIntensity = (v: number) => {
        if (isLiving && living) {
            updateSection("background", { living: { ...living, intensity: v } });
        } else {
            updateSection("background", { intensity: v });
        }
    };

    // Brillo del fondo: overlayOpacity más ALTO = overlay más oscuro = fondo
    // MENOS brillante. Mostramos el slider ya invertido (100 = brillo máximo,
    // overlay 0) para que sea intuitivo; ver mismo patrón en quick-settings-tab.
    const overlayOpacity = bg.overlayOpacity ?? 0.1;
    const brightnessPct = Math.round((1 - overlayOpacity) * 100);
    const setBrightnessPct = (pct: number) => {
        updateSection("background", { overlayOpacity: Math.min(1, Math.max(0, 1 - pct / 100)) });
    };

    return (
        <div className="space-y-4 pt-2">
            {/* Estado de la atmósfera activa */}
            <div className="grid grid-cols-2 gap-3">
                <AtmosphereCard
                    label="Fondo activo"
                    icon={Sparkles}
                    value={currentVariantLabel}
                    sub={isLiving ? "Fondo vivo · pulsa para ciclar" : "Tipo de fondo"}
                    color="purple"
                    onClick={isLiving ? cycleVariant : undefined}
                />
                <AtmosphereCard
                    label="Estado del OS"
                    icon={Waves}
                    value="En línea"
                    sub="Sistema · Interfaz Trinity"
                    color="emerald"
                />
            </div>

            {/* Variantes de fondo vivo (solo si el fondo activo es "living") */}
            {isLiving && living ? (
                <div className="grid grid-cols-4 gap-1.5">
                    {LIVING_VARIANTS.map((v) => (
                        <VariantChip
                            key={v.id}
                            label={v.label}
                            active={v.id === living.variant}
                            onClick={() => updateSection("background", { living: { ...living, variant: v.id } })}
                        />
                    ))}
                </div>
            ) : (
                <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-[11px] text-muted-foreground leading-relaxed">
                    El fondo activo no es un "fondo vivo" (canvas), así que no hay variantes que ciclar aquí.
                    Los sliders de abajo siguen afectando a la intensidad y al brillo del fondo actual.
                </div>
            )}

            {/* Sliders reales de atmósfera */}
            <div className="space-y-4 bg-black/20 p-5 rounded-2xl border border-white/5 backdrop-blur-md">
                <AtmosphereSlider
                    icon={Sparkles}
                    value={Math.round((intensityValue ?? 0.7) * 100)}
                    onChange={(v: number[]) => setIntensity(v[0] / 100)}
                    label="Intensidad de partículas/efectos"
                    colorClass="[&>.relative>.absolute]:bg-purple-500"
                />
                <AtmosphereSlider
                    icon={SunDim}
                    value={brightnessPct}
                    onChange={(v: number[]) => setBrightnessPct(v[0])}
                    label="Brillo del fondo"
                    colorClass="[&>.relative>.absolute]:bg-amber-500"
                />
            </div>

            <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between gap-3 overflow-hidden">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400 shrink-0">
                        <Wifi className="w-5 h-5 animate-pulse" />
                    </div>
                    <div className="min-w-0">
                        <div className="text-sm font-medium truncate">Renderizado</div>
                        <div className="text-xs text-emerald-400 truncate">Aplicado en vivo a toda la interfaz</div>
                    </div>
                </div>
                <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981] shrink-0" />
            </div>

            {/* Hogar / IoT (Home Assistant) — opt-in, honesto, config local */}
            <HomeAssistantBlock />
        </div>
    );
}

function AtmosphereCard({ label, icon: Icon, value, sub, color, onClick }: {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    value: string;
    sub: string;
    color: "purple" | "emerald";
    onClick?: () => void;
}) {
    const colorMap: Record<string, string> = {
        purple: "group-hover:text-purple-400 group-hover:shadow-[0_0_20px_-5px_rgba(168,85,247,0.5)] group-hover:border-purple-500/50",
        emerald: "group-hover:text-emerald-400 group-hover:shadow-[0_0_20px_-5px_rgba(16,185,129,0.5)] group-hover:border-emerald-500/50",
    };

    return (
        <motion.button
            type="button"
            whileHover={onClick ? { scale: 1.02 } : undefined}
            whileTap={onClick ? { scale: 0.98 } : undefined}
            onClick={onClick}
            disabled={!onClick}
            className={cn(
                "group relative h-28 rounded-2xl border bg-black/40 backdrop-blur-md p-2 flex flex-col items-center justify-center gap-2 transition-all duration-300 overflow-hidden",
                "border-white/10",
                colorMap[color],
                onClick ? "cursor-pointer" : "cursor-default"
            )}
        >
            <div className="flex items-center justify-center relative w-full">
                <div className="p-2 rounded-full bg-white/5 transition-colors shrink-0 text-white">
                    <Icon className="w-4 h-4" />
                </div>
                <div className="absolute right-2 top-0 w-1.5 h-1.5 rounded-full shadow-[0_0_8px] animate-pulse bg-current shrink-0" />
            </div>

            <div className="text-center z-10 w-full px-2 flex flex-col items-center justify-center min-w-0">
                <div className="text-[10px] md:text-[11px] text-muted-foreground font-medium mb-0.5 truncate w-full">{label}</div>
                <div className="text-xs md:text-sm font-bold truncate w-full text-white">{value}</div>
                <div className="text-[9px] text-muted-foreground/70 truncate w-full mt-0.5">{sub}</div>
            </div>

            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none" />
        </motion.button>
    );
}

function VariantChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={onClick}
            className={cn(
                "h-12 rounded-xl border flex items-center justify-center text-[10px] font-medium transition-all duration-200 px-1 min-w-0 w-full text-center cursor-pointer",
                active
                    ? "bg-purple-500/20 border-purple-500/40 text-purple-200 shadow-[0_0_12px_-3px_rgba(168,85,247,0.6)]"
                    : "bg-white/5 border-white/5 text-muted-foreground hover:bg-white/10"
            )}
        >
            <span className="w-full truncate">{label}</span>
        </motion.button>
    );
}

function AtmosphereSlider({ icon: Icon, value, onChange, label, colorClass }: {
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

/* ════════════════════════════════════════════════════════════════════════
 * Hogar / IoT (Home Assistant) — bloque OPT-IN dentro de "Atmósfera del
 * sistema". Honesto: enabled=false por defecto, config SOLO local
 * (localStorage, nunca viaja con la cuenta), y si no hay conexión se explica
 * el porqué en vez de fingir datos. Alineado con Oikos: una comunidad/Sangha
 * podría exponer así su hogar común, igual que un usuario el suyo propio.
 * ════════════════════════════════════════════════════════════════════════ */

const HA_CONFIG_KEY = "starseed.iot.homeassistant.v1";

interface HomeAssistantConfig {
    enabled: boolean;
    url?: string;
    token?: string;
}

const HA_DEFAULT: HomeAssistantConfig = { enabled: false };

function readHaConfig(): HomeAssistantConfig {
    if (typeof window === "undefined") return { ...HA_DEFAULT };
    try {
        const raw = window.localStorage.getItem(HA_CONFIG_KEY);
        if (!raw) return { ...HA_DEFAULT };
        const parsed = JSON.parse(raw) as Partial<HomeAssistantConfig>;
        return {
            enabled: parsed?.enabled === true,
            url: typeof parsed?.url === "string" && parsed.url ? parsed.url : undefined,
            token: typeof parsed?.token === "string" && parsed.token ? parsed.token : undefined,
        };
    } catch {
        return { ...HA_DEFAULT };
    }
}

function writeHaConfig(next: HomeAssistantConfig): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(HA_CONFIG_KEY, JSON.stringify(next));
    } catch {
        /* cuota/modo privado: degrada en silencio */
    }
}

interface HaEntity {
    entity_id: string;
    state: string;
    attributes?: { friendly_name?: string };
}

function haHeaders(token: string): HeadersInit {
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function HomeAssistantBlock() {
    const [cfg, setCfg] = useState<HomeAssistantConfig>(HA_DEFAULT);
    const [ready, setReady] = useState(false);
    const [draftUrl, setDraftUrl] = useState("");
    const [draftToken, setDraftToken] = useState("");
    const [showToken, setShowToken] = useState(false);
    const [entities, setEntities] = useState<HaEntity[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busyEntity, setBusyEntity] = useState<string | null>(null);

    useEffect(() => {
        const c = readHaConfig();
        setCfg(c);
        setDraftUrl(c.url ?? "");
        setDraftToken(c.token ?? "");
        setReady(true);
    }, []);

    const loadEntities = useCallback(async (c: HomeAssistantConfig) => {
        if (!c.enabled || !c.url || !c.token) return;
        setLoading(true);
        setError(null);
        try {
            const base = c.url.replace(/\/+$/, "");
            const res = await fetch(`${base}/api/states`, { headers: haHeaders(c.token) });
            if (!res.ok) {
                setError(res.status === 401 ? "Token no válido (401)." : `Home Assistant respondió ${res.status}.`);
                setEntities(null);
                return;
            }
            const all = (await res.json()) as HaEntity[];
            const relevant = Array.isArray(all)
                ? all.filter((e) => e.entity_id?.startsWith("light.") || e.entity_id?.startsWith("switch.")).slice(0, 8)
                : [];
            setEntities(relevant);
        } catch (e: any) {
            setError(`No se pudo conectar: ${e?.message ?? "revisa la URL/el token/CORS"}.`);
            setEntities(null);
        } finally {
            setLoading(false);
        }
    }, []);

    // Autocarga HONESTA: solo si ya está activado Y configurado (opt-in real,
    // nunca una petición de red sin que el usuario lo haya pedido antes).
    useEffect(() => {
        if (!ready) return;
        if (cfg.enabled && cfg.url && cfg.token) void loadEntities(cfg);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, cfg.enabled, cfg.url, cfg.token]);

    const save = useCallback(() => {
        const next: HomeAssistantConfig = { enabled: cfg.enabled, url: draftUrl.trim() || undefined, token: draftToken.trim() || undefined };
        setCfg(next);
        writeHaConfig(next);
    }, [cfg.enabled, draftUrl, draftToken]);

    const toggleEnabled = useCallback(() => {
        const next = { ...cfg, enabled: !cfg.enabled };
        setCfg(next);
        writeHaConfig(next);
        if (!next.enabled) { setEntities(null); setError(null); }
    }, [cfg]);

    const toggleEntity = useCallback(async (entity: HaEntity) => {
        if (!cfg.url || !cfg.token) return;
        const domain = entity.entity_id.split(".")[0];
        const service = entity.state === "on" ? "turn_off" : "turn_on";
        setBusyEntity(entity.entity_id);
        try {
            const base = cfg.url.replace(/\/+$/, "");
            const res = await fetch(`${base}/api/services/${domain}/${service}`, {
                method: "POST",
                headers: haHeaders(cfg.token),
                body: JSON.stringify({ entity_id: entity.entity_id }),
            });
            if (res.ok) {
                setEntities((prev) => prev?.map((e) => (e.entity_id === entity.entity_id ? { ...e, state: service === "turn_on" ? "on" : "off" } : e)) ?? prev);
            } else {
                setError(`No se pudo cambiar «${entity.attributes?.friendly_name ?? entity.entity_id}» (${res.status}).`);
            }
        } catch (e: any) {
            setError(`No se pudo contactar Home Assistant: ${e?.message ?? "error de red"}.`);
        } finally {
            setBusyEntity(null);
        }
    }, [cfg.url, cfg.token]);

    if (!ready) return null;
    const configured = !!cfg.url && !!cfg.token;

    return (
        <div className="space-y-3 bg-black/20 p-4 rounded-2xl border border-white/5 backdrop-blur-md">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1.5 rounded-lg bg-sky-500/15 text-sky-300 shrink-0">
                        <HomeIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <div className="text-sm font-medium truncate">Hogar / IoT (Home Assistant)</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                            Opcional · el hogar común de tu Oikos/Sangha, o el tuyo
                        </div>
                    </div>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={cfg.enabled}
                    onClick={toggleEnabled}
                    title={cfg.enabled ? "Desactivar" : "Activar (opt-in)"}
                    className={cn(
                        "shrink-0 relative w-10 h-5 rounded-full transition-colors cursor-pointer",
                        cfg.enabled ? "bg-sky-500" : "bg-white/15",
                    )}
                >
                    <span className={cn("absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform", cfg.enabled && "translate-x-5")} />
                </button>
            </div>

            {!cfg.enabled ? (
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                    No configurado. Actívalo para conectar tu instancia de Home Assistant (URL + token de acceso de
                    larga duración) y controlar luces/interruptores desde aquí. Se guarda solo en este dispositivo.{" "}
                    <Link href="/library" className="text-sky-300 hover:underline">Ver ficha del paquete en la Biblioteca</Link>.
                </p>
            ) : (
                <>
                    <div className="grid gap-2 sm:grid-cols-2">
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground">URL de Home Assistant</span>
                            <input
                                value={draftUrl}
                                onChange={(e) => setDraftUrl(e.target.value)}
                                onBlur={save}
                                placeholder="http://homeassistant.local:8123"
                                className="h-8 px-2.5 rounded-lg bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-sky-400/50"
                                spellCheck={false}
                            />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground">Token de acceso (larga duración)</span>
                            <div className="flex gap-1">
                                <input
                                    value={draftToken}
                                    onChange={(e) => setDraftToken(e.target.value)}
                                    onBlur={save}
                                    type={showToken ? "text" : "password"}
                                    placeholder="eyJhbGciOi…"
                                    className="h-8 flex-1 min-w-0 px-2.5 rounded-lg bg-black/30 border border-white/10 text-xs text-white outline-none focus:border-sky-400/50"
                                    spellCheck={false}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowToken((v) => !v)}
                                    className="h-8 w-8 shrink-0 rounded-lg border border-white/10 bg-white/5 grid place-items-center text-muted-foreground hover:text-white cursor-pointer"
                                    title={showToken ? "Ocultar" : "Mostrar"}
                                >
                                    {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                        </label>
                    </div>

                    {!configured ? (
                        <p className="text-[11px] text-amber-300/80">Añade la URL y el token para conectar.</p>
                    ) : loading ? (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Conectando…</p>
                    ) : error ? (
                        <div className="flex items-center justify-between gap-2 text-[11px] text-amber-300/80">
                            <span className="min-w-0 flex-1">{error}</span>
                            <button type="button" onClick={() => void loadEntities(cfg)} className="shrink-0 text-sky-300 hover:underline cursor-pointer">Reintentar</button>
                        </div>
                    ) : entities && entities.length > 0 ? (
                        <div className="space-y-1.5">
                            {entities.map((e) => (
                                <div key={e.entity_id} className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-1.5">
                                    <span className="min-w-0 flex-1 truncate text-xs text-white/80">{e.attributes?.friendly_name ?? e.entity_id}</span>
                                    <button
                                        type="button"
                                        onClick={() => void toggleEntity(e)}
                                        disabled={busyEntity === e.entity_id}
                                        className={cn(
                                            "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer",
                                            e.state === "on" ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200" : "border-white/10 bg-white/5 text-muted-foreground",
                                            busyEntity === e.entity_id && "opacity-50 cursor-wait",
                                        )}
                                    >
                                        {busyEntity === e.entity_id ? "…" : e.state === "on" ? "Encendido" : "Apagado"}
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : entities ? (
                        <p className="text-[11px] text-muted-foreground">Conectado, pero no se encontraron luces/interruptores.</p>
                    ) : null}

                    <p className="text-[9px] text-muted-foreground/60 leading-relaxed">
                        Guardado solo en este dispositivo (localStorage), nunca en la cuenta. Complementa Oikos: una
                        comunidad/Sangha podría exponer así el hogar común.
                    </p>
                </>
            )}
        </div>
    );
}
