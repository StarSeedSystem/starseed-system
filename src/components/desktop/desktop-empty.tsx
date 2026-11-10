'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Estado vacío premium del escritorio
// ----------------------------------------------------------------
// Un escritorio SIN elementos debe verse igualmente cuidado: el símbolo
// oficial StarSeed en 3D real (ESC1110A) FUNDIDO con la Flor de la Vida
// (ESC1110B: el disco inferior es el círculo central de la flor y el
// superior el de encima, en la misma escena 3D), halos de gradiente
// StarSeed y accesos claros: Astraura y un botón por cada tipo de elemento
// que admite el escritorio (apps, widgets, archivos, enlaces, folders y
// notas). Cuando llega el primer elemento, por cualquier vía, toda la
// bienvenida se retira con una transición fluida (el símbolo sube y se
// disuelve mientras la flor se abre: le cede el espacio) y vuelve igual si
// el escritorio se vacía. Respeto absoluto por prefers-reduced-motion.
// Presentacional: recibe callbacks del lienzo.
// ════════════════════════════════════════════════════════════════

import React from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { LayoutGrid, MonitorPlay, FolderOpen, Globe, FolderPlus, StickyNote, Sparkles, type LucideIcon } from "lucide-react";
import type { Desktop } from "./desktop-store";
import type { AddPanelTab } from "./desktop-add-panel";
import { SimboloStarSeed3D } from "@/components/brand/simbolo-starseed-3d";
import type { ArchivoSimbolo } from "@/components/brand/simbolo-archivo";

// ── Tipos de elemento del escritorio (ESC1110B) ──────────────────
// La lista real: `DesktopIconKind` (app · file · folder · widget · link) más
// las notas (`createNoteIcon`, un archivo con texto). Cada botón abre el flujo
// real de su tipo: la pestaña correspondiente del panel «+ Añadir» o, para la
// nota, la crea al momento.
export type TipoElementoEscritorio = AddPanelTab | "nota";

export const TIPOS_ELEMENTO: ReadonlyArray<{ id: TipoElementoEscritorio; etiqueta: string; titulo: string; icono: LucideIcon; acento: string }> = [
    { id: "apps", etiqueta: "Apps", titulo: "Añadir apps", icono: LayoutGrid, acento: "#007FFF" },
    { id: "widgets", etiqueta: "Widgets", titulo: "Añadir widgets vivos", icono: MonitorPlay, acento: "#7C3AED" },
    { id: "files", etiqueta: "Archivos", titulo: "Añadir archivos de la Librería o de tu aparato", icono: FolderOpen, acento: "#FFBF00" },
    { id: "web", etiqueta: "Enlace", titulo: "Añadir un enlace web", icono: Globe, acento: "#06B6D4" },
    { id: "folder", etiqueta: "Folder", titulo: "Crear un folder", icono: FolderPlus, acento: "#10B981" },
    { id: "nota", etiqueta: "Nota", titulo: "Crear una nota", icono: StickyNote, acento: "#FBBF24" },
];

// ── Acción por tipo (pastilla cristal) ───────────────────────────
function ActionPill({
    icon: Icon, label, title, accent, onClick, testId,
}: {
    icon: LucideIcon;
    label: string;
    title: string;
    accent: string;
    onClick: () => void;
    testId: string;
}): React.ReactElement {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            aria-label={title}
            data-testid={testId}
            className="group flex items-center gap-2 rounded-2xl border border-white/12 bg-[#0a0e22]/60 px-3 py-2 text-left backdrop-blur-sm transition-all duration-200 hover:-translate-y-px hover:border-white/25 hover:bg-white/[0.09] cursor-pointer"
        >
            <span
                className="grid size-7 shrink-0 place-items-center rounded-xl border border-white/15 transition-transform group-hover:scale-105"
                style={{ background: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 30%, transparent))` }}
            >
                <Icon className="size-3.5 text-white" strokeWidth={2} />
            </span>
            <span className="text-[12px] font-bold text-foreground/90">{label}</span>
        </button>
    );
}

/** Variantes de entrada y salida (ESC1110B). Con movimiento reducido, solo opacidad. */
export function variantesBienvenida(reducido: boolean): { simbolo: Variants; texto: Variants; fondo: Variants } {
    if (reducido) {
        const solo: Variants = { oculto: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.2 } }, saliendo: { opacity: 0, transition: { duration: 0.2 } } };
        return { simbolo: solo, texto: solo, fondo: solo };
    }
    return {
        // El símbolo sube un poco y se abre con la flor mientras se disuelve: le cede el espacio.
        simbolo: {
            oculto: { opacity: 0, scale: 0.9, y: 10, filter: "blur(4px)" },
            visible: { opacity: 1, scale: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.8, ease: [0.2, 0.7, 0.2, 1] } },
            saliendo: { opacity: 0, scale: 1.32, y: -18, filter: "blur(3px)", transition: { duration: 0.75, ease: [0.2, 0.7, 0.2, 1] } },
        },
        texto: {
            oculto: { opacity: 0, y: 16, filter: "blur(6px)" },
            visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.6, ease: "easeOut", delay: 0.1 } },
            saliendo: { opacity: 0, y: 14, filter: "blur(6px)", transition: { duration: 0.55, ease: "easeIn" } },
        },
        fondo: {
            oculto: { opacity: 0 },
            visible: { opacity: 0.6, transition: { duration: 0.8 } },
            saliendo: { opacity: 0, transition: { duration: 0.75 } },
        },
    };
}

export interface EmptyDesktopStateProps {
    desktop: Desktop;
    onAddApps: () => void;
    onAddWidgets: () => void;
    onExploreLibrary: () => void;
    /** ESC1110B: abre la pestaña del panel «+ Añadir» de ese tipo. */
    onAdd?: (tab: AddPanelTab) => void;
    /** ESC1110B: crea una nota al momento. */
    onNewNote?: () => void;
    /** ESC1110B: el archivo de símbolo del perfil, página o grupo (por defecto, el oficial). */
    archivo?: ArchivoSimbolo;
    /** ESC1110B: rótulo del símbolo propio («Símbolo propio de …»). */
    rotulo?: string | null;
}

// ── Estado vacío ─────────────────────────────────────────────────
export function EmptyDesktopState({
    desktop, onAddApps, onAddWidgets, onExploreLibrary, onAdd, onNewNote, archivo, rotulo,
}: EmptyDesktopStateProps): React.ReactElement {
    const reducido = !!useReducedMotion();
    const v = variantesBienvenida(reducido);

    const askAstraura = () => {
        try {
            window.dispatchEvent(new CustomEvent("starseed:open-aurora-exocortex"));
            window.dispatchEvent(new CustomEvent("aurora:suggest", {
                detail: { context: "desktop-empty", desktopName: desktop.name },
            }));
        } catch { /* noop */ }
    };

    // Cada tipo, a su flujo real; un tipo sin flujo disponible no pinta botón (ninguno muerto).
    const accion = (id: TipoElementoEscritorio): (() => void) | null => {
        if (id === "nota") return onNewNote ?? null;
        if (onAdd) return () => onAdd(id);
        if (id === "apps") return onAddApps;
        if (id === "widgets") return onAddWidgets;
        if (id === "files") return onExploreLibrary;
        return null;
    };

    return (
        <motion.div
            className="pointer-events-none absolute inset-0 z-10 grid place-items-center overflow-hidden p-6"
            data-testid="bienvenida-escritorio"
            initial="oculto"
            animate="visible"
            exit="saliendo"
        >
            <motion.span
                aria-hidden
                variants={v.fondo}
                className="pointer-events-none absolute left-1/2 top-1/2 size-[520px] max-w-[120vw] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[90px]"
                style={{ background: "radial-gradient(circle, rgba(34,211,238,0.14), rgba(124,58,237,0.10) 50%, transparent 72%)" }}
            />

            <div className="relative flex max-w-md flex-col items-center text-center">
                {/* ESC1110A + ESC1110B: símbolo 3D fundido con la Flor de la Vida; imagen fija al instante. */}
                <motion.div variants={v.simbolo} className="pointer-events-auto relative mb-3">
                    <SimboloStarSeed3D alto={192} conFlor interactivo archivo={archivo} />
                </motion.div>

                <motion.div variants={v.texto} className="pointer-events-auto relative z-10 flex flex-col items-center">
                    {rotulo && (
                        <span className="mb-1 text-[10px] font-semibold text-muted-foreground/80" data-testid="rotulo-simbolo-propio">{rotulo}</span>
                    )}
                    <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-[#080c1e]/55 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200/90 backdrop-blur-sm">
                        <Sparkles className="size-3" /> Lienzo soberano
                    </span>
                    <h2 className="text-xl font-black tracking-tight text-foreground [text-shadow:0_2px_14px_rgba(2,6,24,0.9)] sm:text-2xl">
                        Bienvenido a «{desktop.name}»
                    </h2>
                    <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-muted-foreground [text-shadow:0_1px_10px_rgba(2,6,24,0.95)]">
                        Un espacio en blanco listo para tomar forma. Coloca apps, widgets vivos,
                        archivos, enlaces, folders y notas — o deja que Astraura lo componga contigo.
                    </p>

                    {/* Acción primaria: Astraura */}
                    <button
                        type="button"
                        onClick={askAstraura}
                        className="group mt-6 inline-flex items-center gap-2 rounded-full border border-violet-300/40 bg-gradient-to-r from-violet-500/30 to-sky-500/30 px-6 py-3 text-[13px] font-black text-violet-50 shadow-[0_0_28px_rgba(124,58,237,0.4)] transition-all hover:-translate-y-px hover:shadow-[0_0_40px_rgba(124,58,237,0.6)] cursor-pointer"
                    >
                        <Sparkles className="size-4 transition-transform group-hover:rotate-12" />
                        Pídele a Astraura que lo arme
                    </button>

                    {/* Un botón por tipo de elemento */}
                    <div className="mt-4 grid w-full max-w-sm grid-cols-2 gap-2 sm:grid-cols-3">
                        {TIPOS_ELEMENTO.map((t) => {
                            const f = accion(t.id);
                            return f ? (
                                <ActionPill key={t.id} icon={t.icono} label={t.etiqueta} title={t.titulo} accent={t.acento} onClick={f} testId={`anadir-${t.id}`} />
                            ) : null;
                        })}
                    </div>

                    <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                        Clic derecho en el lienzo para más opciones
                    </p>
                </motion.div>
            </div>
        </motion.div>
    );
}

/**
 * ESC1110B: la bienvenida con su salida y su vuelta. Se retira sola (con
 * transición) en cuanto el escritorio tiene algo, por cualquier vía, y
 * vuelve igual cuando se vacía.
 */
export function BienvenidaEscritorio({ vacio, ...props }: EmptyDesktopStateProps & { vacio: boolean }): React.ReactElement {
    return (
        <AnimatePresence>
            {vacio && <EmptyDesktopState key="bienvenida" {...props} />}
        </AnimatePresence>
    );
}

// Compat: export por defecto también, por si algún import lo espera.
export default EmptyDesktopState;
