"use client";

/**
 * QuickSettingsTab — sección «Inicio» del Centro de Control (Logic/Este).
 * ----------------------------------------------------------------------------
 * Lo que más se toca, a un gesto. Cada control lee/escribe estado REAL:
 *
 *   · Tema claro/oscuro   → useTheme() (next-themes), ciclo light/dark.
 *   · Grabar              → la grabadora única (lib/grabacion): muestra si hay una grabación en curso
 *                           y lleva a la sección Grabar.
 *   · Sincronizar         → hasStarseedSession() + pushPreferences() (settings-sync.ts); sin sesión,
 *                           lleva a iniciar sesión (nada de botones muertos).
 *   · Rendimiento         → lib/perf/device-tier (auto/alto/eco), el MISMO sistema que
 *                           Ajustes → Rendimiento.
 *   · Transparencias      → config.styling.opacity (mismo campo que Ajustes → Apariencia).
 *   · Brillo del fondo    → config.background.overlayOpacity (invertido: más overlay = menos brillo).
 *   · Aurora (voz)        → lib/aurora/tts-oss/voice-config: motor activo; abre sus ajustes.
 *   · Astraura            → ventana de sistemas de Astraura de esta neurona + el valor efectivo de cada uno.
 *   · Atmósfera del fondo → atajo a la sección «Atmósfera» (smart-home-tab.tsx).
 *   · Ajustes completos   → /cuenta.
 * No hay "sonido/SFX de UI" real en el proyecto: no se pinta un interruptor falso.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, CloudUpload, Gauge, Layers, LogIn, Moon, RadioTower, Settings, Sparkles, Sun, SunDim, Video, Zap, Leaf, SlidersHorizontal, Wand2 } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/context/appearance-context";
import { hasStarseedSession, pushPreferences } from "@/lib/settings-sync";
import { getRealtimeSyncStatus, onRealtimeSyncStatus, type RealtimeSyncStatus } from "@/lib/sync/realtime-sync";
import { getPerfMode, setPerfMode, type PerfMode } from "@/lib/perf/device-tier";
import { getVoiceConfig, subscribeVoiceConfig, type AuroraVoiceEngine } from "@/lib/aurora/tts-oss/voice-config";
// (Adenda 149) Atajo a la ventana «Configuración/actualización de sistemas de
// Astraura en esta neurona» (LLM · Astraura · OmniVoice · Cerebro · Señales).
import { openAstrauraConfig } from "@/lib/astraura/config-ui";
// (Adenda 149) …y el ESTADO EFECTIVO de esos 5 sistemas, para que el atajo no
// sea mudo: se resuelve para «Todas las personalidades» (defaults de la neurona).
// Import PEREZOSO (rev. 3 olas): `neuron-persona-systems` arrastra
// personalities/engine-registry; cargarlo estático metía ese grafo entero en el
// chunk de Trinity. Solo el TIPO se importa estático (se borra al compilar).
import type { ResolvedPersonaSystems } from "@/lib/astraura/neuron-persona-systems";
import { thisDeviceId } from "@/lib/neurons/neurons";
import { pedirSeccion } from "../control-center-events";
import { SeccionLogic } from "../logic/seccion-logic";
import { PildoraEstado } from "../logic/pildora-estado";
import { Segmentado } from "../logic/segmentado";
import { FilaAcceso } from "../logic/fila-acceso";
import { DeslizadorLogic } from "../logic/deslizador-logic";
import { useIrCerrando } from "../logic/use-ir-cerrando";
import { useGrabadora } from "../logic/use-grabadora";
import { Cronometro } from "../logic/grabar/cronometro";
import { rotuloDeFase } from "@/lib/grabacion/texto";
import { etiquetaDelFondo } from "./smart-home-tab";

const AURORA_ENGINE_LABEL: Record<AuroraVoiceEngine, string> = {
    browser: "Navegador (respaldo)",
    kokoro: "Kokoro (respaldo · mejorada)",
    kitten: "Kitten (beta)",
    // Motores NEURALES por endpoint (Adenda voz de Aurora, jul-2026): servidores
    // Python en una neurona propia/CasaOS. Si fallan, la cadena de respaldo
    // (Kokoro → navegador) mantiene a Aurora hablando siempre.
    // OpenVoice/OmniVoice son el PREDETERMINADO real (Adenda 90 · sin
    // configuración); VoxCPM y el resto son opcionales por endpoint — el más
    // realista cuando el usuario levanta su propio servidor.
    voxcpm: "VoxCPM (respaldo opcional · endpoint propio)",
    voicebox: "Voicebox (estudio local)",
    bark: "Bark (neuronal)",
    "gpt-sovits": "GPT-SoVITS (clonación)",
    omnivoice: "OmniVoice (sistema · local/nube)",
    openvoice2: "OpenVoice 2 (motor por defecto · web)",
    xai: "xAI · Grok Voice (tiempo real)",
    vibevoice: "VibeVoice (clonación neuronal)",
    voice158: "Voz 1.58-bit (Astro · CPU local)",
    chatterbox: "Chatterbox (local o Space gratis)",
};

const OPCIONES_RENDIMIENTO = [
    { id: "auto" as PerfMode, rotulo: "Auto", icono: Sparkles, titulo: "El sistema elige según tu aparato" },
    { id: "high" as PerfMode, rotulo: "Alto", icono: Zap, titulo: "Todos los efectos visuales" },
    { id: "eco" as PerfMode, rotulo: "Eco", icono: Leaf, titulo: "Menos animaciones y fondos más ligeros" },
];

function haceCuanto(ts: number | null | undefined): string {
    if (!ts) return "sin cambios";
    const diff = Date.now() - ts;
    if (diff < 5_000) return "ahora";
    if (diff < 60_000) return `hace ${Math.round(diff / 1000)} s`;
    if (diff < 3_600_000) return `hace ${Math.round(diff / 60_000)} min`;
    return `hace ${Math.round(diff / 3_600_000)} h`;
}

function puntoTiempoReal(state: RealtimeSyncStatus["state"] | undefined): string {
    switch (state) {
        case "connected": return "bg-emerald-400";
        case "connecting": return "bg-amber-400 motion-safe:animate-pulse";
        case "error": return "bg-red-400";
        default: return "bg-zinc-500";
    }
}

export function QuickSettingsTab() {
    const ir = useIrCerrando();
    const { setTheme, theme } = useTheme();
    const { config, updateSection } = useAppearance();
    const { controlador, estado: grabadora } = useGrabadora();
    const soporteGrabar = useMemo(() => controlador.soporte(), [controlador]);

    const [mounted, setMounted] = useState(false);
    const [session, setSession] = useState<boolean | null>(null);
    const [syncBusy, setSyncBusy] = useState(false);
    const [syncMsg, setSyncMsg] = useState<{ ok: boolean; texto: string } | null>(null);
    const [perfMode, setPerfModeState] = useState<PerfMode>("auto");
    const [auroraEngine, setAuroraEngine] = useState<AuroraVoiceEngine>("browser");
    const [realtimeStatus, setRealtimeStatus] = useState<RealtimeSyncStatus>(getRealtimeSyncStatus());

    useEffect(() => {
        setMounted(true);
        setPerfModeState(getPerfMode());
        setAuroraEngine(getVoiceConfig().engine);
        let vivo = true;
        hasStarseedSession().then(
            (s) => vivo && setSession(s),
            () => vivo && setSession(false),
        );

        const syncAurora = () => setAuroraEngine(getVoiceConfig().engine);
        const off = subscribeVoiceConfig(syncAurora);
        const offSync = onRealtimeSyncStatus(setRealtimeStatus);
        return () => { vivo = false; off(); offSync(); };
    }, []);

    // (Adenda 149) Estado efectivo de los 5 sistemas de Astraura en esta neurona.
    // SSR-safe: se resuelve dentro del efecto y se refresca con el store.
    const [astraura, setAstraura] = useState<ResolvedPersonaSystems | null>(null);
    useEffect(() => {
        let alive = true;
        let off: (() => void) | null = null;
        void (async () => {
            try {
                const mod = await import("@/lib/astraura/neuron-persona-systems");
                const refresh = () => {
                    try {
                        if (alive) setAstraura(mod.resolvePersonaSystems(mod.ALL_PERSONAS, thisDeviceId(), null));
                    } catch {
                        if (alive) setAstraura(null);
                    }
                };
                refresh();
                off = mod.subscribeNeuronPersona(refresh);
            } catch { /* módulo no disponible: los accesos no se pintan */ }
        })();
        return () => { alive = false; off?.(); };
    }, []);

    // Valor ABREVIADO por sistema (el detalle completo vive en la ventana).
    const astrauraChips = useMemo(() => {
        if (!astraura) return [];
        const antenas = Object.values(astraura.senales.porAntena).filter(
            (r) => !(r.enabled && r.entrada && r.salida && r.ruta === "auto"),
        ).length;
        return [
            {
                section: "llm",
                label: "LLM",
                value: astraura.llm.provenance === "auto" ? "Auto" : (astraura.llm.modelo || astraura.llm.fuente || "Fijado"),
            },
            {
                section: "astraura",
                label: "Astraura",
                value: astraura.astraura.modo === "fija" ? "Fija" : "Auto",
            },
            {
                section: "openvoice",
                label: "OmniVoice",
                value: (AURORA_ENGINE_LABEL[astraura.voz.motor] ?? astraura.voz.motor).split("(")[0].trim(),
            },
            {
                section: "cerebro",
                label: "Cerebro",
                value: astraura.cerebro.usarMemorias
                    ? (astraura.cerebro.nivelContexto === "completo" ? "Completo" : "Breve")
                    : "Sin memoria",
            },
            {
                section: "senales",
                label: "Señales",
                value: antenas > 0 ? `${antenas} ${antenas === 1 ? "regla" : "reglas"}` : "Auto",
            },
        ];
    }, [astraura]);

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
        setSyncMsg(null);
        try {
            const r = await pushPreferences();
            setSyncMsg({ ok: r.ok, texto: r.ok ? "Ajustes subidos a tu cuenta." : r.message });
        } catch {
            setSyncMsg({ ok: false, texto: "No se pudo sincronizar ahora. Inténtalo de nuevo." });
        } finally {
            setSyncBusy(false);
        }
    }, []);

    // Transparencias del cristal — mismo campo que Ajustes → Apariencia.
    const opacityPct = Math.round((config.styling?.opacity ?? 0.65) * 100);
    const setOpacityPct = (pct: number) => {
        updateSection("styling", { opacity: Math.min(1, Math.max(0, pct / 100)) });
    };

    // Brillo del fondo — overlayOpacity más alto = overlay más oscuro = fondo
    // MENOS brillante. Slider mostrado ya invertido (100 = brillo máximo).
    const overlayOpacity = config.background?.overlayOpacity ?? 0.1;
    const brightnessPct = Math.round((1 - overlayOpacity) * 100);
    const setBrightnessPct = (pct: number) => {
        updateSection("background", { overlayOpacity: Math.min(1, Math.max(0, 1 - pct / 100)) });
    };

    const franjaGrabadora = rotuloDeFase(grabadora);
    const conReloj = grabadora.fase === "grabando" || grabadora.fase === "pausada";
    const estadoGrabar = franjaGrabadora
        ?? (soporteGrabar.pantalla ? "Pantalla y cámara" : soporteGrabar.camara ? "Solo cámara aquí" : "No disponible aquí");

    return (
        <div className="space-y-5 pt-1" data-testid="seccion-inicio">
            {/* Accesos rápidos: lo que se enciende y se apaga, con su estado en palabras */}
            <section aria-label="Accesos rápidos" className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                    <PildoraEstado
                        icono={mounted && isDark ? Moon : Sun}
                        etiqueta="Tema"
                        estado={!mounted ? "…" : isDark ? "Oscuro" : "Claro"}
                        activa={mounted && isDark}
                        onClick={toggleTheme}
                        titulo="Cambiar entre el tema claro y el oscuro"
                        testId="pildora-tema"
                    />
                    <PildoraEstado
                        icono={Video}
                        etiqueta="Grabar"
                        estado={estadoGrabar}
                        resaltada={franjaGrabadora !== null}
                        tono="rojo"
                        extra={conReloj ? <Cronometro estado={grabadora} className="font-mono tabular-nums" /> : undefined}
                        onClick={() => pedirSeccion("grabar")}
                        titulo="Abrir la grabadora de pantalla"
                        testId="pildora-grabar"
                    />
                    {session === false ? (
                        <PildoraEstado
                            icono={LogIn}
                            etiqueta="Iniciar sesión"
                            estado="Para sincronizar tus ajustes"
                            onClick={() => ir("/login")}
                            titulo="Sin sesión, tus ajustes solo se guardan en este aparato"
                            testId="pildora-sincronizar"
                        />
                    ) : (
                        <PildoraEstado
                            icono={CloudUpload}
                            etiqueta="Sincronizar"
                            estado={session === null ? "Comprobando…" : syncBusy ? "Subiendo…" : "Sesión activa"}
                            extra={
                                session && realtimeStatus.lastChangeAt ? (
                                    <span className="inline-flex shrink-0 items-center gap-1 text-amber-100/55">
                                        <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", puntoTiempoReal(realtimeStatus.state))} />
                                        {haceCuanto(realtimeStatus.lastChangeAt)}
                                    </span>
                                ) : undefined
                            }
                            ocupada={syncBusy}
                            deshabilitada={session === null || syncBusy}
                            onClick={handleSyncPush}
                            titulo="Subir mis ajustes a la cuenta"
                            testId="pildora-sincronizar"
                        />
                    )}
                    <PildoraEstado
                        icono={RadioTower}
                        etiqueta="Conexiones"
                        estado="Red y malla"
                        onClick={() => pedirSeccion("conexiones")}
                        titulo="Red externa, malla de neuronas y Bluetooth"
                        testId="pildora-conexiones"
                    />
                </div>
                <p role="status" aria-live="polite" className={cn("min-h-[1rem] px-1 text-[11px] leading-snug", syncMsg ? (syncMsg.ok ? "text-emerald-200" : "text-amber-200") : "text-transparent")}>
                    {syncMsg?.texto ?? ""}
                </p>
            </section>

            <SeccionLogic titulo="Pantalla y rendimiento" icono={Gauge} testId="seccion-pantalla">
                <div className="space-y-4">
                    <Segmentado etiqueta="Rendimiento" valor={perfMode} opciones={OPCIONES_RENDIMIENTO} onCambio={choosePerf} testId="selector-rendimiento" />
                    <div className="space-y-1 rounded-2xl border border-white/10 bg-black/25 p-3.5">
                        <DeslizadorLogic icono={Layers} etiqueta="Transparencia del cristal" valor={opacityPct} onCambio={setOpacityPct} testId="deslizador-transparencia" />
                        <DeslizadorLogic icono={SunDim} etiqueta="Brillo del fondo" valor={brightnessPct} onCambio={setBrightnessPct} testId="deslizador-brillo" />
                    </div>
                </div>
            </SeccionLogic>

            <SeccionLogic titulo="Sistemas y ajustes" icono={SlidersHorizontal} testId="seccion-sistemas">
                <div className="space-y-2">
                    <FilaAcceso
                        icono={Wand2}
                        titulo="Aurora"
                        sub={AURORA_ENGINE_LABEL[auroraEngine]}
                        onClick={() => ir("/cuenta?section=aurora-voz")}
                        etiqueta={`Aurora: voz ${AURORA_ENGINE_LABEL[auroraEngine]}. Abrir sus ajustes`}
                        testId="fila-aurora"
                    />
                    <FilaAcceso
                        icono={Bot}
                        titulo="Sistemas de Astraura (esta neurona)"
                        sub="LLM, Astraura, OmniVoice, cerebro y señales"
                        onClick={() => openAstrauraConfig()}
                        etiqueta="Sistemas de Astraura en esta neurona"
                        titleAttr="Configurar y actualizar los sistemas de Astraura en esta neurona"
                        testId="fila-astraura"
                    />
                    {/* (Adenda 149) Los 5 sistemas con su valor EFECTIVO en esta neurona (defaults para
                        todas las personalidades); cada acceso abre la ventana directamente en su pestaña. */}
                    {astrauraChips.length > 0 && (
                        <ul className="grid grid-cols-2 gap-1.5" aria-label="Estado de los sistemas de Astraura">
                            {astrauraChips.map((c) => (
                                <li key={c.section} className="min-w-0">
                                    <button
                                        type="button"
                                        onClick={() => openAstrauraConfig(c.section)}
                                        title={`${c.label}: ${c.value} — abrir esta pestaña de los sistemas de Astraura en esta neurona`}
                                        aria-label={`${c.label}: ${c.value}`}
                                        className="flex min-h-[44px] w-full min-w-0 cursor-pointer flex-col justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1 text-left outline-none transition-[border-color,background-color] duration-200 hover:border-amber-300/40 hover:bg-amber-400/[0.08] focus-visible:ring-2 focus-visible:ring-amber-300/70"
                                    >
                                        <span className="text-[10px] font-medium uppercase leading-tight tracking-wider text-amber-200/70">{c.label}</span>
                                        <span className="truncate text-[12px] leading-tight text-amber-50">{c.value}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <FilaAcceso
                        icono={Sparkles}
                        titulo="Atmósfera del fondo"
                        sub={`${etiquetaDelFondo(config.background)} · variante, partículas y ciclo`}
                        onClick={() => pedirSeccion("home")}
                        testId="fila-atmosfera"
                    />
                    <FilaAcceso
                        icono={Settings}
                        titulo="Ajustes completos"
                        sub="Apariencia, cuenta, Aurora y más"
                        onClick={() => ir("/cuenta")}
                        testId="fila-ajustes"
                    />
                </div>
            </SeccionLogic>
        </div>
    );
}
