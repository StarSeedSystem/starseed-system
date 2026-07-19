'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Ajustes del escritorio (diseño y edición)
// ----------------------------------------------------------------
// Hoja completa para diseñar CADA escritorio:
//   • Fondo: global (heredado) · gradiente StarSeed · imagen (URL) ·
//     CSS libre — con presets cristalinos de un toque.
//   • Iconos: tamaño (peq/med/grande).
//   • Rejilla: visible on/off · densidad (compacta/cómoda/amplia) ·
//     magnética on/off.
//   • Tema/tinte del escritorio (auto/azur/esmeralda/ámbar/carmesí/violeta).
//   • Orden por defecto (manual/nombre/tipo/fecha).
//   • Escritorios: renombrar · duplicar · eliminar · reordenar.
// Todo escribe en el store (persistente + espejo en la cuenta).
// ════════════════════════════════════════════════════════════════

import React, { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
    X, Settings2, ImageIcon, Grid3x3, Magnet, Palette, ArrowUpDown,
    SquareStack, Pencil, Copy, Trash2, Check, Plus, ChevronUp, ChevronDown,
    Maximize, Sparkles, PictureInPicture2, Share2,
    type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
    Desktop, DesktopIconSize, DesktopDensity, DesktopTheme, DesktopSortMode,
} from "./desktop-store";
import {
    setWallpaper, setDesktopView, setSnap, renameDesktop, duplicateDesktop,
    deleteDesktop, createDesktop, setActiveDesktop, reorderDesktops,
    DEFAULT_DESKTOP_VIEW, readDesktopsSnapshot,
} from "./desktop-store";
// Bloque "Sincronización" (SOP §10-11): perfiles que sincronizan + compartir
// como espacio + lista de escritorios compartidos (Adenda 65).
import { DesktopSharePanel } from "./desktop-share-panel";
// Permisos universales (Adenda 63 §5): compartir CADA escritorio por ámbito y
// rol, con acceso parcial por pestañas y enlace ?space= colaborativo.
import { ShareAccessDialog } from "@/components/sharing/share-access-dialog";

// ── Presets de gradiente cristalino StarSeed ─────────────────────
const GRADIENT_PRESETS: Array<{ name: string; css: string }> = [
    { name: "Nébula", css: "radial-gradient(circle at 25% 20%, #1e3a8a, #0b1020 55%), radial-gradient(circle at 80% 80%, #4c1d95, transparent 60%)" },
    { name: "Aurora", css: "linear-gradient(135deg, #042f2e, #0b1020 45%, #3b0764)" },
    { name: "Azur", css: "linear-gradient(160deg, #082f49, #0b1020 60%)" },
    { name: "Ámbar", css: "linear-gradient(160deg, #451a03, #0b1020 62%)" },
    { name: "Cristal", css: "linear-gradient(135deg, #0f172a, #1e1b4b 50%, #0b1020)" },
    { name: "Cosmos", css: "radial-gradient(circle at 50% 30%, #312e81, #0b1020 60%)" },
];

const THEMES: Array<{ id: DesktopTheme; name: string; dot: string }> = [
    { id: "auto", name: "Auto", dot: "#94A3B8" },
    { id: "azure", name: "Azur", dot: "#007FFF" },
    { id: "emerald", name: "Esmeralda", dot: "#10B981" },
    { id: "amber", name: "Ámbar", dot: "#FFBF00" },
    { id: "crimson", name: "Carmesí", dot: "#DC143C" },
    { id: "violet", name: "Violeta", dot: "#7C3AED" },
];

// ── Bloque de sección ────────────────────────────────────────────
function Section({ icon: Icon, title, children }: {
    icon: LucideIcon; title: string; children: React.ReactNode;
}): React.ReactElement {
    return (
        <section className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/80">
                <Icon className="size-3" /> {title}
            </h4>
            {children}
        </section>
    );
}

function SegBtn({ active, onClick, children }: {
    active: boolean; onClick: () => void; children: React.ReactNode;
}): React.ReactElement {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-bold transition-colors cursor-pointer",
                active ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100" : "border-white/10 text-muted-foreground hover:bg-white/[0.07]",
            )}
        >
            {children}
        </button>
    );
}

// ── Panel ────────────────────────────────────────────────────────
export function DesktopSettingsPanel({
    desktop, desktops, snap, open, onClose,
}: {
    desktop: Desktop;
    desktops: Desktop[];
    snap: boolean;
    open: boolean;
    onClose: () => void;
}): React.ReactElement {
    const reduced = useReducedMotion();
    const view = { ...DEFAULT_DESKTOP_VIEW, ...(desktop.view ?? {}) };
    const [wpDraft, setWpDraft] = useState(desktop.wallpaper?.value ?? "");
    const [renamingId, setRenamingId] = useState<string | null>(null);
    // Compartir un escritorio concreto (permisos universales, Adenda 63 §5).
    const [shareTarget, setShareTarget] = useState<Desktop | null>(null);

    const isCustom = desktop.wallpaper?.type === "custom";
    const idx = desktops.findIndex((d) => d.id === desktop.id);

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        key="settings-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        onClick={onClose}
                        className="absolute inset-0 z-[50] bg-black/40 backdrop-blur-[2px]"
                        aria-hidden
                    />
                    <motion.aside
                        key="settings-sheet"
                        role="dialog"
                        aria-label="Ajustes del escritorio"
                        initial={reduced ? { opacity: 0 } : { opacity: 0, x: -60, filter: "blur(6px)" }}
                        animate={reduced ? { opacity: 1 } : { opacity: 1, x: 0, filter: "blur(0px)" }}
                        exit={reduced ? { opacity: 0 } : { opacity: 0, x: -60, filter: "blur(6px)" }}
                        transition={reduced ? { duration: 0.15 } : { type: "spring", stiffness: 320, damping: 32 }}
                        className={cn(
                            "absolute z-[51] flex flex-col overflow-hidden border border-white/12 bg-card/90 backdrop-blur-2xl shadow-2xl",
                            "max-sm:inset-x-2 max-sm:bottom-2 max-sm:top-auto max-sm:h-[82%] max-sm:rounded-3xl",
                            "sm:bottom-3 sm:left-3 sm:top-14 sm:w-[420px] sm:max-w-[calc(100%-24px)] sm:rounded-3xl",
                        )}
                    >
                        <span aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/70 to-transparent" />

                        <header className="flex shrink-0 items-center gap-2 px-4 pb-2.5 pt-3.5">
                            <Settings2 className="size-4 text-violet-300" />
                            <div className="min-w-0 flex-1">
                                <h3 className="text-sm font-black tracking-tight">Ajustes del escritorio</h3>
                                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">{desktop.name}</p>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                title="Cerrar"
                                aria-label="Cerrar ajustes"
                                className="grid size-8 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:bg-white/10 hover:text-foreground cursor-pointer"
                            >
                                <X className="size-4" />
                            </button>
                        </header>

                        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-5">
                            {/* ── Fondo ── */}
                            <Section icon={ImageIcon} title="Fondo">
                                <div className="flex gap-1.5">
                                    <SegBtn active={!isCustom} onClick={() => setWallpaper(desktop.id, undefined)}>Global</SegBtn>
                                    <SegBtn active={isCustom} onClick={() => setWallpaper(desktop.id, { type: "custom", value: wpDraft || GRADIENT_PRESETS[0].css })}>Propio</SegBtn>
                                </div>
                                <div className="grid grid-cols-3 gap-1.5">
                                    {GRADIENT_PRESETS.map((g) => {
                                        const activeGrad = isCustom && desktop.wallpaper?.value === g.css;
                                        return (
                                            <button
                                                key={g.name}
                                                type="button"
                                                onClick={() => { setWpDraft(g.css); setWallpaper(desktop.id, { type: "custom", value: g.css }); }}
                                                title={g.name}
                                                className={cn(
                                                    "group relative h-12 overflow-hidden rounded-xl border transition-all cursor-pointer",
                                                    activeGrad ? "border-cyan-300/70 ring-2 ring-cyan-300/40" : "border-white/12 hover:border-white/30",
                                                )}
                                                style={{ background: g.css }}
                                            >
                                                <span className="absolute inset-x-0 bottom-0 bg-black/40 px-1 py-0.5 text-[8px] font-black uppercase tracking-wide text-white/90">{g.name}</span>
                                                {activeGrad && <Check className="absolute right-1 top-1 size-3 text-cyan-200" />}
                                            </button>
                                        );
                                    })}
                                </div>
                                <input
                                    value={wpDraft}
                                    onChange={(e) => setWpDraft(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") setWallpaper(desktop.id, { type: "custom", value: wpDraft || undefined }); }}
                                    placeholder="URL de imagen o gradiente CSS…"
                                    spellCheck={false}
                                    className="h-8 w-full rounded-lg border border-white/10 bg-black/40 px-2.5 text-[11px] font-medium outline-none transition-colors focus:border-cyan-400/50"
                                />
                            </Section>

                            {/* ── Iconos ── */}
                            <Section icon={Maximize} title="Tamaño de iconos">
                                <div className="flex gap-1.5">
                                    {(["sm", "md", "lg"] as DesktopIconSize[]).map((s) => (
                                        <SegBtn key={s} active={view.iconSize === s} onClick={() => setDesktopView(desktop.id, { iconSize: s })}>
                                            {s === "sm" ? "Pequeño" : s === "md" ? "Mediano" : "Grande"}
                                        </SegBtn>
                                    ))}
                                </div>
                            </Section>

                            {/* ── Rejilla ── */}
                            <Section icon={Grid3x3} title="Rejilla">
                                <div className="flex gap-1.5">
                                    <SegBtn active={view.showGrid === true} onClick={() => setDesktopView(desktop.id, { showGrid: true })}>Visible</SegBtn>
                                    <SegBtn active={!view.showGrid} onClick={() => setDesktopView(desktop.id, { showGrid: false })}>Oculta</SegBtn>
                                </div>
                                <div className="flex gap-1.5">
                                    {(["compact", "cozy", "spacious"] as DesktopDensity[]).map((d) => (
                                        <SegBtn key={d} active={view.density === d} onClick={() => setDesktopView(desktop.id, { density: d })}>
                                            {d === "compact" ? "Compacta" : d === "cozy" ? "Cómoda" : "Amplia"}
                                        </SegBtn>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSnap(!snap)}
                                    className="flex w-full items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-[12px] font-bold text-foreground/90 transition-colors hover:bg-white/[0.06] cursor-pointer"
                                >
                                    <Magnet className="size-3.5" /> Rejilla magnética
                                    <span className={cn("ml-auto flex items-center rounded-full border px-0.5 transition-colors", snap ? "justify-end border-emerald-300/50 bg-emerald-400/25" : "justify-start border-white/15 bg-white/[0.06]")} style={{ height: 18, width: 32 }}>
                                        <span className="rounded-full bg-white/90 shadow" style={{ width: 13, height: 13 }} />
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDesktopView(desktop.id, { windowSnap: view.windowSnap === false })}
                                    className="flex w-full items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-[12px] font-bold text-foreground/90 transition-colors hover:bg-white/[0.06] cursor-pointer"
                                >
                                    <PictureInPicture2 className="size-3.5" /> Snap de ventanas a bordes
                                    <span className={cn("ml-auto flex items-center rounded-full border px-0.5 transition-colors", view.windowSnap !== false ? "justify-end border-emerald-300/50 bg-emerald-400/25" : "justify-start border-white/15 bg-white/[0.06]")} style={{ height: 18, width: 32 }}>
                                        <span className="rounded-full bg-white/90 shadow" style={{ width: 13, height: 13 }} />
                                    </span>
                                </button>
                            </Section>

                            {/* ── Tema ── */}
                            <Section icon={Palette} title="Tema del escritorio">
                                <div className="grid grid-cols-3 gap-1.5">
                                    {THEMES.map((t) => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => setDesktopView(desktop.id, { theme: t.id })}
                                            className={cn(
                                                "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-bold transition-colors cursor-pointer",
                                                view.theme === t.id ? "border-white/30 bg-white/10 text-foreground" : "border-white/10 text-muted-foreground hover:bg-white/[0.07]",
                                            )}
                                        >
                                            <span className="size-2.5 rounded-full" style={{ background: t.dot, boxShadow: `0 0 6px ${t.dot}` }} />
                                            {t.name}
                                        </button>
                                    ))}
                                </div>
                            </Section>

                            {/* ── Orden por defecto ── */}
                            <Section icon={ArrowUpDown} title="Orden por defecto">
                                <div className="grid grid-cols-4 gap-1.5">
                                    {([["manual", "Manual"], ["name", "Nombre"], ["type", "Tipo"], ["date", "Fecha"]] as Array<[DesktopSortMode, string]>).map(([m, lbl]) => (
                                        <SegBtn key={m} active={view.sortMode === m} onClick={() => setDesktopView(desktop.id, { sortMode: m })}>{lbl}</SegBtn>
                                    ))}
                                </div>
                            </Section>

                            {/* ── Escritorios ── */}
                            <Section icon={SquareStack} title="Escritorios">
                                <div className="space-y-1">
                                    {desktops.map((d, i) => (
                                        <div
                                            key={d.id}
                                            className={cn(
                                                "group flex items-center gap-1 rounded-xl border px-2 py-1.5 transition-colors",
                                                d.id === desktop.id ? "border-cyan-300/40 bg-cyan-400/10" : "border-white/10 hover:bg-white/[0.05]",
                                            )}
                                        >
                                            {renamingId === d.id ? (
                                                <input
                                                    autoFocus
                                                    defaultValue={d.name}
                                                    onFocus={(e) => e.currentTarget.select()}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") { renameDesktop(d.id, e.currentTarget.value); setRenamingId(null); }
                                                        if (e.key === "Escape") setRenamingId(null);
                                                    }}
                                                    onBlur={(e) => { renameDesktop(d.id, e.currentTarget.value); setRenamingId(null); }}
                                                    className="h-6 min-w-0 flex-1 rounded-lg border border-cyan-400/50 bg-black/60 px-2 text-[12px] font-semibold outline-none"
                                                />
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveDesktop(d.id)}
                                                    className="min-w-0 flex-1 truncate text-left text-[12px] font-bold text-foreground/90 cursor-pointer"
                                                >
                                                    {d.name}
                                                </button>
                                            )}
                                            {d.id === desktop.id && renamingId !== d.id && <Check className="size-3 shrink-0 text-cyan-300" />}
                                            <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                                                <button type="button" title="Subir" aria-label="Subir escritorio" disabled={i === 0} onClick={() => reorderDesktops(i, i - 1)} className="grid size-6 place-items-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-20 cursor-pointer">
                                                    <ChevronUp className="size-3" />
                                                </button>
                                                <button type="button" title="Bajar" aria-label="Bajar escritorio" disabled={i === desktops.length - 1} onClick={() => reorderDesktops(i, i + 1)} className="grid size-6 place-items-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-20 cursor-pointer">
                                                    <ChevronDown className="size-3" />
                                                </button>
                                                <button type="button" title="Renombrar" aria-label="Renombrar escritorio" onClick={() => setRenamingId(d.id)} className="grid size-6 place-items-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-white/10 hover:text-foreground cursor-pointer">
                                                    <Pencil className="size-3" />
                                                </button>
                                                <button type="button" title="Duplicar" aria-label="Duplicar escritorio" onClick={() => duplicateDesktop(d.id)} className="grid size-6 place-items-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-white/10 hover:text-foreground cursor-pointer">
                                                    <Copy className="size-3" />
                                                </button>
                                                <button type="button" title="Compartir" aria-label="Compartir escritorio" onClick={() => setShareTarget(d)} className="grid size-6 place-items-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-cyan-400/15 hover:text-cyan-200 cursor-pointer">
                                                    <Share2 className="size-3" />
                                                </button>
                                                <button type="button" title={desktops.length <= 1 ? "Siempre queda uno" : "Eliminar"} aria-label="Eliminar escritorio" disabled={desktops.length <= 1} onClick={() => deleteDesktop(d.id)} className="grid size-6 place-items-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-red-500/15 hover:text-red-300 disabled:opacity-20 cursor-pointer">
                                                    <Trash2 className="size-3" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => createDesktop()}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-2.5 py-1.5 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground cursor-pointer"
                                >
                                    <Plus className="size-3.5" /> Nuevo escritorio
                                </button>
                            </Section>

                            {/* ── Sincronización (perfiles + compartir como espacio) ── */}
                            <DesktopSharePanel />

                            <p className="flex items-center justify-center gap-1.5 pt-1 text-[10px] font-semibold text-muted-foreground/60">
                                <Sparkles className="size-3" /> Cada escritorio guarda su propio diseño
                            </p>
                        </div>
                    </motion.aside>

                    {/* Compartir escritorio: modelo universal (ámbito + roles + pestañas parciales). */}
                    {shareTarget && (
                        <ShareAccessDialog
                            open
                            onOpenChange={(o) => !o && setShareTarget(null)}
                            resource={{ type: "desktop", id: shareTarget.id, title: shareTarget.name }}
                            makeSpaceDoc={() => ({ ...readDesktopsSnapshot() })}
                            sections={desktops.map((d) => ({ id: d.id, label: d.name }))}
                            defaultSections={[shareTarget.id]}
                            buildLink={(spaceId) =>
                                spaceId && typeof window !== "undefined"
                                    ? `${window.location.origin}/escritorios?space=${encodeURIComponent(spaceId)}`
                                    : null
                            }
                        />
                    )}
                </>
            )}
        </AnimatePresence>
    );
}
