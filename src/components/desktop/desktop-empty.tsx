'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Estado vacío premium del escritorio
// ----------------------------------------------------------------
// Un escritorio SIN elementos debe verse igualmente cuidado: geometría
// sagrada sutil (semilla de la vida), orbe-estrella que respira, halos
// de gradiente StarSeed y accesos claros (Apps · Widgets · Aurora ·
// Librería). Todo con animación líquida suave y respeto absoluto por
// prefers-reduced-motion. Presentacional: recibe callbacks del lienzo.
// ════════════════════════════════════════════════════════════════

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { LayoutGrid, MonitorPlay, Sparkles, Library, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Desktop } from "./desktop-store";

// ── Geometría sagrada: semilla de la vida (7 círculos) ───────────
function SacredGeometry({ reduced }: { reduced: boolean | null }): React.ReactElement {
    const r = 34;
    // Centro + 6 pétalos hexagonales.
    const centers: Array<[number, number]> = [
        [0, 0],
        ...Array.from({ length: 6 }, (_, i) => {
            const a = (Math.PI / 3) * i - Math.PI / 2;
            return [Math.cos(a) * r, Math.sin(a) * r] as [number, number];
        }),
    ];
    return (
        <motion.svg
            aria-hidden
            viewBox="-120 -120 240 240"
            className="absolute inset-0 m-auto size-[340px] max-w-[86vw] opacity-[0.22]"
            initial={reduced ? { opacity: 0.22 } : { opacity: 0, rotate: -8 }}
            animate={reduced ? { opacity: 0.22 } : { opacity: 0.22, rotate: 0 }}
            transition={{ duration: 1.4, ease: "easeOut" }}
        >
            <defs>
                <radialGradient id="ss-empty-glow" cx="50%" cy="45%" r="60%">
                    <stop offset="0%" stopColor="#8FE8FF" stopOpacity="0.9" />
                    <stop offset="55%" stopColor="#3FB6FF" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#7C3AED" stopOpacity="0" />
                </radialGradient>
            </defs>
            <motion.g
                animate={reduced ? undefined : { rotate: 360 }}
                transition={reduced ? undefined : { duration: 140, repeat: Infinity, ease: "linear" }}
                style={{ transformOrigin: "center" }}
            >
                {centers.map(([cx, cy], i) => (
                    <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke="url(#ss-empty-glow)" strokeWidth="0.8" />
                ))}
                {/* Anillo envolvente */}
                <circle cx="0" cy="0" r={r * 2} fill="none" stroke="#3FB6FF" strokeOpacity="0.35" strokeWidth="0.6" />
                <circle cx="0" cy="0" r={r * 2 + 6} fill="none" stroke="#7C3AED" strokeOpacity="0.22" strokeWidth="0.5" />
            </motion.g>
        </motion.svg>
    );
}

// ── Orbe-estrella central (respiración sutil) ────────────────────
function StarOrb({ reduced }: { reduced: boolean | null }): React.ReactElement {
    return (
        <motion.div
            aria-hidden
            className="relative mb-6 size-32"
            animate={reduced ? undefined : { scale: [1, 1.05, 1] }}
            transition={reduced ? undefined : { duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
            {/* Halo exterior difuso */}
            <motion.span
                className="absolute -inset-8 rounded-full blur-3xl"
                style={{ background: "radial-gradient(circle, rgba(0,127,255,0.4), rgba(124,58,237,0.2) 55%, transparent 74%)" }}
                animate={reduced ? undefined : { opacity: [0.7, 1, 0.7] }}
                transition={reduced ? undefined : { duration: 6, repeat: Infinity, ease: "easeInOut" }}
            />
            {/* Núcleo cristalino */}
            <span
                className="absolute inset-0 rounded-full"
                style={{ background: "radial-gradient(circle at 34% 30%, rgba(240,250,255,0.98), rgba(63,182,255,0.6) 40%, rgba(109,40,217,0.42) 70%, transparent 80%)" }}
            />
            <span aria-hidden className="absolute inset-2 rounded-full border border-white/25" />
            {/* Estrella StarSeed */}
            <motion.svg
                viewBox="0 0 24 24"
                className="absolute inset-0 m-auto size-14 drop-shadow-[0_0_14px_rgba(191,243,255,0.95)]"
                animate={reduced ? undefined : { rotate: [0, 8, 0, -8, 0] }}
                transition={reduced ? undefined : { duration: 18, repeat: Infinity, ease: "easeInOut" }}
            >
                <path
                    d="M12 1 C12.9 8 15.5 10.6 22.5 12 C15.5 13.4 12.9 16 12 23 C11.1 16 8.5 13.4 1.5 12 C8.5 10.6 11.1 8 12 1 Z"
                    fill="white"
                />
            </motion.svg>
        </motion.div>
    );
}

// ── Acción secundaria (pastilla cristal) ─────────────────────────
function ActionPill({
    icon: Icon, label, accent, onClick,
}: {
    icon: React.ElementType;
    label: string;
    accent: string;
    onClick: () => void;
}): React.ReactElement {
    return (
        <button
            type="button"
            onClick={onClick}
            className="group flex items-center gap-2 rounded-2xl border border-white/12 bg-white/[0.04] px-3.5 py-2.5 text-left transition-all duration-200 hover:-translate-y-px hover:border-white/25 hover:bg-white/[0.09] cursor-pointer"
        >
            <span
                className="grid size-8 shrink-0 place-items-center rounded-xl border border-white/15 transition-transform group-hover:scale-105"
                style={{ background: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 30%, transparent))` }}
            >
                <Icon className="size-4 text-white" strokeWidth={2} />
            </span>
            <span className="text-[12px] font-bold text-foreground/90">{label}</span>
        </button>
    );
}

// ── Estado vacío ─────────────────────────────────────────────────
export function EmptyDesktopState({
    desktop, onAddApps, onAddWidgets, onExploreLibrary,
}: {
    desktop: Desktop;
    onAddApps: () => void;
    onAddWidgets: () => void;
    onExploreLibrary: () => void;
}): React.ReactElement {
    const reduced = useReducedMotion();

    const askAurora = () => {
        try {
            window.dispatchEvent(new CustomEvent("starseed:open-aurora-exocortex"));
            window.dispatchEvent(new CustomEvent("aurora:suggest", {
                detail: { context: "desktop-empty", desktopName: desktop.name },
            }));
        } catch { /* noop */ }
    };

    return (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center overflow-hidden p-6">
            {/* Composición de fondo cristalina */}
            <SacredGeometry reduced={reduced} />
            <span
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 size-[520px] max-w-[120vw] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-[90px]"
                style={{ background: "radial-gradient(circle, rgba(34,211,238,0.14), rgba(124,58,237,0.10) 50%, transparent 72%)" }}
            />

            <motion.div
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, filter: "blur(6px)" }}
                animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="pointer-events-auto relative flex max-w-md flex-col items-center text-center"
            >
                <StarOrb reduced={reduced} />

                <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.05] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200/90">
                    <Sparkles className="size-3" /> Lienzo soberano
                </span>
                <h2 className="text-xl font-black tracking-tight text-foreground sm:text-2xl">
                    Bienvenido a «{desktop.name}»
                </h2>
                <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
                    Un espacio en blanco listo para tomar forma. Coloca apps, widgets vivos,
                    archivos y carpetas — o deja que Aurora lo componga contigo.
                </p>

                {/* Acción primaria: Aurora */}
                <button
                    type="button"
                    onClick={askAurora}
                    className="group mt-6 inline-flex items-center gap-2 rounded-full border border-violet-300/40 bg-gradient-to-r from-violet-500/30 to-sky-500/30 px-6 py-3 text-[13px] font-black text-violet-50 shadow-[0_0_28px_rgba(124,58,237,0.4)] transition-all hover:-translate-y-px hover:shadow-[0_0_40px_rgba(124,58,237,0.6)] cursor-pointer"
                >
                    <Sparkles className="size-4 transition-transform group-hover:rotate-12" />
                    Pídele a Aurora que lo arme
                </button>

                {/* Accesos claros */}
                <div className="mt-4 grid w-full max-w-sm grid-cols-2 gap-2">
                    <ActionPill icon={LayoutGrid} label="Añadir apps" accent="#007FFF" onClick={onAddApps} />
                    <ActionPill icon={MonitorPlay} label="Añadir widgets" accent="#7C3AED" onClick={onAddWidgets} />
                    <ActionPill icon={Library} label="Explorar Librería" accent="#FFBF00" onClick={onExploreLibrary} />
                    <ActionPill icon={Plus} label="Nuevo elemento" accent="#10B981" onClick={onAddApps} />
                </div>

                <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                    Clic derecho en el lienzo para más opciones
                </p>
            </motion.div>
        </div>
    );
}

// Compat: export por defecto también, por si algún import lo espera.
export default EmptyDesktopState;
