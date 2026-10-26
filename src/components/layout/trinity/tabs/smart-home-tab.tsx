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

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Sparkles, SunDim, Home as HomeIcon, Loader2, Eye, EyeOff, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/context/appearance-context";
import type { AppearanceConfig } from "@/context/appearance-context";
import { SeccionLogic } from "../logic/seccion-logic";
import { PildoraEstado } from "../logic/pildora-estado";
import { DeslizadorLogic } from "../logic/deslizador-logic";
import { FilaInterruptor } from "../logic/fila-interruptor";

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

/** Nombre legible del fondo activo («Aurora», «Sólido»…); lo usa también la pestaña Inicio. */
export function etiquetaDelFondo(bg: AppearanceConfig["background"] | undefined): string {
    if (!bg) return "Fondo";
    if (bg.type === "living" && bg.living) {
        return LIVING_VARIANTS.find((v) => v.id === bg.living?.variant)?.label ?? bg.living.variant;
    }
    return BG_TYPE_LABELS[bg.type] ?? bg.type;
}

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
        <div className="space-y-5 pt-1" data-testid="seccion-atmosfera">
            <SeccionLogic titulo="Fondo" icono={Palette} insignia={currentVariantLabel} testId="seccion-fondo">
                <div className="space-y-3">
                    {isLiving && living ? (
                        <>
                            <PildoraEstado
                                icono={Sparkles}
                                etiqueta="Fondo activo"
                                estado={`${currentVariantLabel} · toca para pasar al siguiente`}
                                resaltada
                                onClick={cycleVariant}
                                titulo="Pasar a la siguiente variante del fondo vivo"
                                testId="pildora-fondo"
                            />
                            <div role="group" aria-label="Variantes del fondo vivo" className="grid grid-cols-3 gap-1.5">
                                {LIVING_VARIANTS.map((v) => (
                                    <VariantChip
                                        key={v.id}
                                        label={v.label}
                                        active={v.id === living.variant}
                                        onClick={() => updateSection("background", { living: { ...living, variant: v.id } })}
                                    />
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 text-[12px] leading-relaxed text-amber-100/70">
                            <span className="block text-[13px] font-medium text-amber-50">Fondo activo: {currentVariantLabel}</span>
                            Este fondo no es un «fondo vivo» (canvas), así que no hay variantes que cambiar aquí. Los deslizadores de abajo siguen
                            afectando a la intensidad y al brillo del fondo actual.
                        </div>
                    )}
                </div>
            </SeccionLogic>

            <SeccionLogic titulo="Intensidad y brillo" icono={SunDim} testId="seccion-intensidad">
                <div className="space-y-1 rounded-2xl border border-white/10 bg-black/25 p-3.5">
                    <DeslizadorLogic
                        icono={Sparkles}
                        valor={Math.round((intensityValue ?? 0.7) * 100)}
                        onCambio={(v) => setIntensity(v / 100)}
                        etiqueta="Intensidad de partículas y efectos"
                    />
                    <DeslizadorLogic icono={SunDim} valor={brightnessPct} onCambio={setBrightnessPct} etiqueta="Brillo del fondo" />
                </div>
                <p className="mt-2 px-1 text-[11px] leading-snug text-amber-100/55">Se aplica en vivo a toda la interfaz.</p>
            </SeccionLogic>

            {/* Hogar / IoT (Home Assistant) — opt-in, honesto, config local */}
            <HomeAssistantBlock />
        </div>
    );
}

function VariantChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                "flex min-h-[44px] w-full min-w-0 cursor-pointer items-center justify-center rounded-xl border px-1.5 text-center text-[12px] font-medium leading-tight outline-none",
                "transition-[background-color,border-color,transform] duration-200 focus-visible:ring-2 focus-visible:ring-amber-300/70 motion-safe:active:scale-[0.97]",
                active
                    ? "border-amber-300/60 bg-amber-400/20 text-amber-50 shadow-[0_0_14px_-5px_rgba(255,191,0,0.6)]"
                    : "border-white/10 bg-white/[0.04] text-amber-100/70 hover:border-amber-300/40 hover:bg-amber-400/[0.08]"
            )}
        >
            <span className="w-full break-words">{label}</span>
        </button>
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
    const CAMPO = "h-11 w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-3 text-[13px] text-amber-50 outline-none placeholder:text-amber-100/35 focus:border-amber-300/60 focus-visible:ring-2 focus-visible:ring-amber-300/50";

    return (
        <SeccionLogic titulo="Hogar / IoT" icono={HomeIcon} insignia="Opcional" abiertaPorDefecto={cfg.enabled} testId="seccion-hogar">
            <div className="space-y-3">
                <FilaInterruptor
                    etiqueta="Home Assistant"
                    descripcion="El hogar común de tu Oikos/Sangha, o el tuyo. Se guarda solo en este aparato."
                    marcado={cfg.enabled}
                    onCambio={() => toggleEnabled()}
                    testId="interruptor-home-assistant"
                />

                {!cfg.enabled ? (
                    <p className="px-1 text-[12px] leading-relaxed text-amber-100/65">
                        No configurado. Actívalo para conectar tu instancia de Home Assistant (URL + token de acceso de
                        larga duración) y controlar luces e interruptores desde aquí.{" "}
                        <Link href="/library" className="text-amber-200 underline-offset-2 hover:underline">Ver ficha del paquete en la Biblioteca</Link>.
                    </p>
                ) : (
                    <>
                        <div className="grid gap-2.5">
                            <label className="flex flex-col gap-1">
                                <span className="text-[11px] text-amber-100/65">URL de Home Assistant</span>
                                <input
                                    value={draftUrl}
                                    onChange={(e) => setDraftUrl(e.target.value)}
                                    onBlur={save}
                                    placeholder="http://homeassistant.local:8123"
                                    className={CAMPO}
                                    spellCheck={false}
                                    inputMode="url"
                                    autoComplete="off"
                                />
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-[11px] text-amber-100/65">Token de acceso (larga duración)</span>
                                <div className="flex gap-1.5">
                                    <input
                                        value={draftToken}
                                        onChange={(e) => setDraftToken(e.target.value)}
                                        onBlur={save}
                                        type={showToken ? "text" : "password"}
                                        placeholder="eyJhbGciOi…"
                                        className={cn(CAMPO, "flex-1")}
                                        spellCheck={false}
                                        autoComplete="off"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowToken((v) => !v)}
                                        className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-amber-100/70 outline-none transition-colors duration-150 hover:text-amber-50 focus-visible:ring-2 focus-visible:ring-amber-300/70"
                                        title={showToken ? "Ocultar" : "Mostrar"}
                                        aria-label={showToken ? "Ocultar el token" : "Mostrar el token"}
                                    >
                                        {showToken ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                                    </button>
                                </div>
                            </label>
                        </div>

                        {!configured ? (
                            <p className="px-1 text-[12px] text-amber-200/80">Añade la URL y el token para conectar.</p>
                        ) : loading ? (
                            <p role="status" className="flex items-center gap-1.5 px-1 text-[12px] text-amber-100/65"><Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> Conectando…</p>
                        ) : error ? (
                            <div role="alert" className="flex items-center justify-between gap-2 rounded-xl bg-amber-400/10 px-3 py-1 text-[12px] text-amber-100">
                                <span className="min-w-0 flex-1 py-1.5">{error}</span>
                                <button type="button" onClick={() => void loadEntities(cfg)} className="inline-flex min-h-[44px] shrink-0 cursor-pointer items-center rounded-lg px-2 font-medium text-amber-200 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-amber-300/70">Reintentar</button>
                            </div>
                        ) : entities && entities.length > 0 ? (
                            <ul className="space-y-1.5" aria-label="Luces e interruptores">
                                {entities.map((e) => (
                                    <li key={e.entity_id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-1 pl-3 pr-1.5">
                                        <span className="min-w-0 flex-1 truncate text-[13px] text-amber-50/90">{e.attributes?.friendly_name ?? e.entity_id}</span>
                                        <button
                                            type="button"
                                            onClick={() => void toggleEntity(e)}
                                            disabled={busyEntity === e.entity_id}
                                            aria-pressed={e.state === "on"}
                                            className={cn(
                                                "inline-flex min-h-[44px] min-w-[92px] shrink-0 cursor-pointer items-center justify-center rounded-lg border px-3 text-[12px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-amber-300/70",
                                                e.state === "on" ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200" : "border-white/10 bg-white/[0.05] text-amber-100/70",
                                                busyEntity === e.entity_id && "cursor-wait opacity-50",
                                            )}
                                        >
                                            {busyEntity === e.entity_id ? "…" : e.state === "on" ? "Encendido" : "Apagado"}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : entities ? (
                            <p className="px-1 text-[12px] text-amber-100/65">Conectado, pero no se encontraron luces ni interruptores.</p>
                        ) : null}

                        <p className="px-1 text-[11px] leading-relaxed text-amber-100/45">
                            Guardado solo en este dispositivo (localStorage), nunca en la cuenta. Complementa Oikos: una
                            comunidad/Sangha podría exponer así el hogar común.
                        </p>
                    </>
                )}
            </div>
        </SeccionLogic>
    );
}
