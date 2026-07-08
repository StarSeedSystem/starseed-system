"use client";

/* ═══════════════════════════════════════════════════════════════════════════
 * ThemeMixerPanel — UI del Mezclador de Diseños ("Combinar…").
 * ---------------------------------------------------------------------------
 * Selector por slot (7 dropdowns con preview), vista previa VIVA compuesta
 * (mini-UI con botón/tarjeta/pestañas, escala local vía CSS custom properties
 * en un wrapper — nunca toca `:root`), "Sorpréndeme" (aleatorio armónico),
 * "Afinar con Aurora" (mismo patrón que AuroraDesignerPanel del Estudio:
 * JSON tolerante + diff antes de aplicar) y guardar/aplicar/exportar/publicar
 * reutilizando el contrato de theme-engine.ts + los flujos ya existentes de
 * Biblioteca/Librería (idénticos a SaveSharePanel del Estudio).
 *
 * Montable en dos sitios (ambos aditivos): theme-gallery.tsx (botón
 * "Combinar…" → diálogo) y /estudio (pestaña "Mezclador"). Autónomo: sin
 * props obligatorias.
 * ═══════════════════════════════════════════════════════════════════════════ */

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Shuffle, Sparkles, Save, Download, Share2, Zap, Loader2, Check, X, Wand2,
    AlertTriangle, Info, Sun, Moon, SunMoon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    mixThemes, emptyMixSlots, listSlotOptions, describeSource, randomMixSlots,
    encodeMixSource, decodeMixSource, buildAuroraMixerPrompt, sanitizeMixAuroraResponse,
    SLOT_ORDER, SLOT_LABELS, SLOT_DESCRIPTIONS,
    type MixSlots, type MixSlotId, type MixSource, type MixAuroraSuggestion,
} from "@/lib/design/theme-mixer";
import {
    applyTheme as applyThemePack, exportThemeFile, saveCustomTheme, type ThemePack, type ThemeTokens,
} from "@/lib/design/theme-engine";
import { astrauraChat } from "@/ai/astraura/router";
import type { ChatMessage } from "@/ai/providers/types";
import { SaveToLibrary } from "@/components/library/save-to-library";
import { PublishDialog } from "@/components/library/finder/publish-dialog";
import { saveItem, useMyLibraryDestinations, readLibrarySnapshot, type SavedItem } from "@/lib/library/entity-library";

export interface ThemeMixerPanelProps {
    /** Slots iniciales (p.ej. al reabrir un borrador). Por defecto, todos "Equilibrado". */
    initialSlots?: MixSlots;
    /** Se llama tras guardar/aplicar con el resultado — opcional, útil para quien monte el panel. */
    onMixChange?: (slots: MixSlots, pack: ThemePack) => void;
    compact?: boolean;
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Mismo parser tolerante que AuroraDesignerPanel del Estudio (no exportado
 *  desde allí — función pura de 8 líneas, se duplica a propósito en vez de
 *  acoplar dos componentes independientes). */
function extractJson(text: string): unknown | null {
    const fence = /```json\s*([\s\S]*?)```/i.exec(text) ?? /```\s*([\s\S]*?)```/i.exec(text);
    const raw = fence ? fence[1] : text;
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

/** Convierte los `vars` de un ThemeTokens en CSS custom properties de un
 *  wrapper LOCAL (nunca toca `document.documentElement`). Las clases reales
 *  del sistema (Tailwind `bg-primary`, `.glass-card`…) leen esas mismas
 *  variables por nombre, así que heredan el valor local sin más trabajo —
 *  es el mismo mecanismo de cascada de custom properties que usa el propio
 *  `applyThemeTokens`, solo que aquí el "root" es este div, no `:root`. */
function tokensToStyle(tokens: ThemeTokens): React.CSSProperties {
    const style: Record<string, string> = {};
    for (const [k, v] of Object.entries(tokens.vars || {})) style[`--${k}`] = v;
    if (tokens.fontFamily) style["--font-body"] = tokens.fontFamily;
    if (tokens.motion !== undefined) style["--ss-motion"] = String(tokens.motion);
    return style as React.CSSProperties;
}

/** Aproximación honesta (no pixel-perfect) del "puente de materiales" de
 *  starseed-themes.css, que solo aplica bajo `html[data-ss-material]` — este
 *  preview está SCOPEADO a un div, así que replicamos la MISMA fórmula visual
 *  en línea en vez de mutar `<html>` (que rompería el resto de la página que
 *  se está editando). */
function materialPreviewStyle(materialClass: string | undefined, primaryRgb: string | undefined): React.CSSProperties {
    const rgb = primaryRgb || "160, 43, 238";
    if (!materialClass) return {};
    if (materialClass.startsWith("ss-crystal")) {
        return { borderColor: `rgba(${rgb}, 0.32)`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.14), 0 18px 42px -18px rgba(${rgb}, 0.28)` };
    }
    if (materialClass.startsWith("ss-neon")) {
        return { borderColor: `rgba(${rgb}, 0.4)`, boxShadow: `0 0 16px -4px rgba(${rgb}, 0.4), inset 0 0 10px -6px rgba(${rgb}, 0.35)` };
    }
    if (materialClass === "ss-metal") return { borderColor: "rgba(212,175,55,0.35)" };
    if (materialClass === "ss-wood") return { borderColor: "rgba(122,78,42,0.5)" };
    if (materialClass === "ss-nature") return { borderColor: "rgba(74,222,128,0.35)" };
    return {};
}

export function ThemeMixerPanel({ initialSlots, onMixChange, compact }: ThemeMixerPanelProps) {
    const { resolvedTheme } = useTheme();
    const [draftId] = useState(() => `mix-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`);
    const [slots, setSlots] = useState<MixSlots>(() => initialSlots ?? emptyMixSlots());
    const [name, setName] = useState("Mi mezcla");
    const [description, setDescription] = useState("");
    const [previewMode, setPreviewMode] = useState<"light" | "dark">("dark");

    const [auroraPrompt, setAuroraPrompt] = useState("");
    const [auroraLoading, setAuroraLoading] = useState(false);
    const [auroraStatus, setAuroraStatus] = useState("");
    const [auroraSuggestion, setAuroraSuggestion] = useState<MixAuroraSuggestion | null>(null);
    const [auroraError, setAuroraError] = useState("");

    const { destinations } = useMyLibraryDestinations();
    const selfRef = destinations[0]?.ref;
    const [publishOpen, setPublishOpen] = useState(false);
    const [publishItem, setPublishItem] = useState<SavedItem | null>(null);
    const [busy, setBusy] = useState<"" | "apply" | "save" | "publish">("");

    const result = useMemo(() => mixThemes(slots, { id: draftId, name, description }), [slots, name, description, draftId]);
    const { pack, warnings, usedBaseline } = result;
    const previewTokens = previewMode === "light" ? pack.modes.light! : pack.modes.dark!;

    const optionsBySlot = useMemo(() => {
        const map = {} as Record<MixSlotId, ReturnType<typeof listSlotOptions>>;
        for (const s of SLOT_ORDER) map[s] = listSlotOptions(s);
        return map;
    }, []);

    function setSlotSource(slot: MixSlotId, value: string) {
        setSlots((prev) => ({ ...prev, [slot]: decodeMixSource(value) }));
    }

    function handleRandom() {
        setSlots(randomMixSlots());
        toast.success("Mezcla aleatoria generada — armonizada automáticamente.");
    }

    function handleReset() {
        setSlots(emptyMixSlots());
    }

    function handleSaveTheme() {
        setBusy("save");
        try {
            saveCustomTheme(pack);
            toast.success(`Mezcla guardada como tema «${pack.name}».`, { description: "Disponible en tus temas personalizados (Ajustes → Apariencia)." });
            onMixChange?.(slots, pack);
        } finally { setBusy(""); }
    }

    function handleApplyMode(mode: "light" | "dark" | "auto") {
        setBusy("apply");
        try {
            // Guardamos primero para que la mezcla sobreviva a un refresco —
            // mismo patrón que ThemeCatalogGallery/SaveSharePanel.
            saveCustomTheme(pack);
            const resolved: "light" | "dark" = mode === "auto" ? (resolvedTheme === "light" ? "light" : "dark") : mode;
            const ok = applyThemePack(pack.id, resolved);
            if (ok) {
                toast.success(`Mezcla aplicada al sistema (${resolved === "dark" ? "oscura" : "clara"}).`, {
                    description: "Cambia TODO StarSeed OS ahora mismo — revertible desde Ajustes → Apariencia.",
                });
                onMixChange?.(slots, pack);
            } else {
                toast.error("No se pudo aplicar la mezcla.");
            }
        } finally { setBusy(""); }
    }

    function handleExport() {
        downloadBlob(exportThemeFile(pack), `${pack.id}.starseed-theme.json`);
        toast.success("Mezcla exportada como .starseed-theme.json");
    }

    async function handlePublish() {
        if (!selfRef) { toast.error("Inicia sesión para publicar en la Librería."); return; }
        setBusy("publish");
        try {
            const title = `${pack.name}.starseed-theme.json`;
            const content = await exportThemeFile(pack).text();
            const res = await saveItem(selfRef, { type: "file", title, mime: "application/json", content, tags: ["starseed-mezclador", "tema"] }, null);
            if (!res.ok) { toast.error("No se pudo guardar antes de publicar."); return; }
            const item: SavedItem = {
                id: res.id, type: "file", title, tags: ["starseed-mezclador", "tema"],
                folderId: null, addedAt: new Date().toISOString(), addedBy: "", mime: "application/json", content,
            };
            setPublishItem(item);
            setPublishOpen(true);
        } finally { setBusy(""); }
    }

    async function askAurora() {
        if (!auroraPrompt.trim()) { toast.error("Escribe qué quieres pedirle a Aurora."); return; }
        setAuroraLoading(true);
        setAuroraStatus("");
        setAuroraError("");
        const sys = buildAuroraMixerPrompt(slots);
        const messages: ChatMessage[] = [
            { role: "system", content: sys },
            { role: "user", content: auroraPrompt },
        ];
        const res = await astrauraChat({ messages, taskHint: "creative", onStatus: setAuroraStatus });
        setAuroraLoading(false);
        setAuroraStatus("");
        const text = res.text ?? "";
        const parsed = extractJson(text);
        if (!parsed) {
            setAuroraError(text.slice(0, 600));
            toast.error("No se pudo interpretar la respuesta de Aurora como JSON.");
            return;
        }
        const suggestion = sanitizeMixAuroraResponse(parsed);
        if (!Object.keys(suggestion.slots).length) {
            toast.error("Aurora no propuso ningún slot válido para este Mezclador.");
            return;
        }
        setAuroraSuggestion(suggestion);
    }

    function applyAuroraSuggestion() {
        if (!auroraSuggestion) return;
        setSlots((prev) => ({ ...prev, ...auroraSuggestion.slots }));
        toast.success("Sugerencia de Aurora aplicada — puedes seguir afinando.");
        setAuroraSuggestion(null);
    }

    return (
        <div className="space-y-5">
            {/* ── Cabecera: nombre/descripción + acciones globales ── */}
            <div className="space-y-2.5">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la mezcla" className="h-8 border-white/15 bg-black/30 text-xs" />
                    <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción (opcional)" className="h-8 border-white/15 bg-black/30 text-xs" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={handleRandom} className="h-8 gap-1.5 bg-fuchsia-500/80 text-xs text-white hover:bg-fuchsia-500">
                        <Shuffle className="h-3.5 w-3.5" /> Sorpréndeme
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleReset} className="h-8 gap-1.5 text-xs text-white/50 hover:text-white/80">
                        <X className="h-3.5 w-3.5" /> Reiniciar a Equilibrado
                    </Button>
                </div>
            </div>

            {/* ── Vista previa VIVA compuesta ── */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">Vista previa en vivo</h3>
                    <div className="flex items-center gap-1">
                        <Button size="sm" variant={previewMode === "light" ? "default" : "outline"} onClick={() => setPreviewMode("light")} className="h-6 gap-1 px-2 text-[10px]">
                            <Sun className="h-3 w-3" /> Claro
                        </Button>
                        <Button size="sm" variant={previewMode === "dark" ? "default" : "outline"} onClick={() => setPreviewMode("dark")} className="h-6 gap-1 px-2 text-[10px]">
                            <Moon className="h-3 w-3" /> Oscuro
                        </Button>
                    </div>
                </div>
                <div
                    style={{ ...tokensToStyle(previewTokens), background: "hsl(var(--background-hsl))", color: "hsl(var(--foreground-hsl))" }}
                    className="space-y-3 rounded-2xl border border-white/10 p-4 transition-colors"
                >
                    <div
                        className="glass-card rounded-[var(--radius)] border p-3.5"
                        style={{ ...materialPreviewStyle(previewTokens.materialClass, previewTokens.vars["primary-rgb"]), color: "hsl(var(--card-foreground-hsl))" }}
                    >
                        <p className="text-sm font-semibold" style={{ fontFamily: previewTokens.fontFamily || undefined }}>Tarjeta de ejemplo</p>
                        <p className="mt-1 text-xs opacity-70">Así se ve un panel con esta mezcla — material, paleta y radio combinados.</p>
                        {previewTokens.background && (
                            <p className="mt-2 flex items-center gap-1 text-[10px] opacity-60">
                                <Sparkles className="h-3 w-3" /> Fondo animado activo: {previewTokens.background}
                            </p>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Botones puramente decorativos (preview, sin onClick) — cursor-default
                            a propósito: "cursor pointer en todo lo clicable" implica lo contrario
                            para lo que NO lo es, para no sugerir una interacción que no existe. */}
                        <button
                            type="button"
                            tabIndex={-1}
                            aria-hidden="true"
                            className="cursor-default rounded-[var(--radius)] px-4 py-2 text-sm font-medium transition-transform hover:scale-105"
                            style={{ background: "hsl(var(--primary-hsl))", color: "hsl(var(--primary-foreground-hsl))", transitionDuration: "var(--dur-base, 220ms)" }}
                        >
                            Botón primario
                        </button>
                        <button
                            type="button"
                            tabIndex={-1}
                            aria-hidden="true"
                            className="cursor-default rounded-[var(--radius)] border px-4 py-2 text-sm font-medium transition-transform hover:scale-105"
                            style={{ background: "hsl(var(--secondary-hsl))", color: "hsl(var(--secondary-foreground-hsl))", borderColor: "hsl(var(--border-hsl))", transitionDuration: "var(--dur-base, 220ms)" }}
                        >
                            Secundario
                        </button>
                    </div>
                    <div className="flex gap-3 border-b" style={{ borderColor: "hsl(var(--border-hsl))" }}>
                        {["General", "Detalles", "Ajustes"].map((t, i) => (
                            <span
                                key={t}
                                className="cursor-default pb-1.5 text-xs font-medium"
                                style={i === 0
                                    ? { color: "hsl(var(--primary-hsl))", borderBottom: "2px solid hsl(var(--primary-hsl))" }
                                    : { color: "hsl(var(--muted-foreground-hsl))" }}
                            >
                                {t}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Avisos del validador ── */}
            {warnings.length > 0 && (
                <div className="space-y-1.5">
                    {warnings.map((w, i) => (
                        <div
                            key={i}
                            className={cn(
                                "flex items-start gap-1.5 rounded-lg border p-2 text-[11px]",
                                w.level === "warn" ? "border-amber-400/25 bg-amber-400/10 text-amber-100/85" : "border-white/10 bg-white/[0.03] text-white/50",
                            )}
                        >
                            {w.level === "warn" ? <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" /> : <Info className="h-3 w-3 shrink-0 mt-0.5" />}
                            <span>{w.message}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Selectores por slot ── */}
            <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">Slots</h3>
                <div className={cn("grid gap-2", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
                    {SLOT_ORDER.map((slot) => {
                        const current = slots[slot] ?? { kind: "none" as const };
                        const elementOpts = optionsBySlot[slot].filter((o) => o.source.kind === "element");
                        const themeOpts = optionsBySlot[slot].filter((o) => o.source.kind === "theme");
                        const usedFallback = usedBaseline.includes(slot);
                        return (
                            <div key={slot} className="space-y-1 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-medium text-white/80">{SLOT_LABELS[slot]}</span>
                                    {usedFallback && <span className="text-[10px] text-white/30">equilibrado</span>}
                                </div>
                                <p className="text-[10px] text-white/40">{SLOT_DESCRIPTIONS[slot]}</p>
                                <Select value={encodeMixSource(current)} onValueChange={(v) => setSlotSource(slot, v)}>
                                    <SelectTrigger className="h-8 border-white/15 bg-black/30 text-xs">
                                        <SelectValue placeholder="Elegir…" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-72 border-white/10 bg-black/90">
                                        <SelectItem value="none" className="text-xs">Equilibrado (por defecto)</SelectItem>
                                        {elementOpts.length > 0 && (
                                            <SelectGroup>
                                                <SelectLabel className="text-[10px] text-white/40">Elementos</SelectLabel>
                                                {elementOpts.map((o) => (
                                                    <SelectItem key={encodeMixSource(o.source)} value={encodeMixSource(o.source)} className="text-xs">{o.label}</SelectItem>
                                                ))}
                                            </SelectGroup>
                                        )}
                                        {themeOpts.length > 0 && (
                                            <SelectGroup>
                                                <SelectLabel className="text-[10px] text-white/40">Temas completos</SelectLabel>
                                                {themeOpts.map((o) => (
                                                    <SelectItem key={encodeMixSource(o.source)} value={encodeMixSource(o.source)} className="text-xs">{o.label}</SelectItem>
                                                ))}
                                            </SelectGroup>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Afinar con Aurora ── */}
            <div className="space-y-2 rounded-xl border border-fuchsia-400/20 bg-fuchsia-400/[0.03] p-3">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fuchsia-200">
                    <Wand2 className="h-3.5 w-3.5" /> Afinar con Aurora
                </h3>
                <Textarea
                    value={auroraPrompt}
                    onChange={(e) => setAuroraPrompt(e.target.value)}
                    placeholder="p.ej. «más cyberpunk, con fondo matrix y tipografía técnica»"
                    className="min-h-[60px] bg-white/[0.04] text-xs"
                />
                <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={() => void askAurora()} disabled={auroraLoading} className="h-8 gap-1.5 bg-fuchsia-500/80 text-xs text-white hover:bg-fuchsia-500">
                        {auroraLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Proponer ajustes
                    </Button>
                    {auroraLoading && auroraStatus && (
                        <span className="flex items-center gap-1.5 text-[11px] text-fuchsia-200/80"><Loader2 className="h-3 w-3 animate-spin" /> {auroraStatus}</span>
                    )}
                </div>

                {auroraError && (
                    <div className="space-y-1 rounded-lg border border-amber-400/25 bg-amber-400/10 p-2 text-[11px] text-amber-100/80">
                        <p>Aurora no devolvió JSON válido. Respuesta recibida:</p>
                        <p className="text-white/50">{auroraError || "(vacío)"}</p>
                    </div>
                )}

                {auroraSuggestion && (
                    <div className="space-y-2 rounded-lg border border-cyan-400/25 bg-cyan-400/5 p-3">
                        <p className="text-xs font-semibold text-cyan-100">Cambios propuestos{auroraSuggestion.notes ? ` — ${auroraSuggestion.notes}` : ""}</p>
                        <ul className="space-y-0.5 text-[11px]">
                            {SLOT_ORDER.filter((s) => auroraSuggestion.slots[s]).map((s) => (
                                <li key={s} className="text-amber-300">
                                    {SLOT_LABELS[s]}: {describeSource(s, slots[s])} → {describeSource(s, auroraSuggestion.slots[s])}
                                </li>
                            ))}
                        </ul>
                        <div className="flex items-center gap-2">
                            <Button size="sm" onClick={applyAuroraSuggestion} className="h-7 gap-1.5 bg-emerald-600 text-[11px] text-white hover:bg-emerald-500">
                                <Check className="h-3 w-3" /> Aplicar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setAuroraSuggestion(null)} className="h-7 gap-1.5 text-[11px] text-white/50">
                                <X className="h-3 w-3" /> Descartar
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Guardar / aplicar / compartir ── */}
            <div className="space-y-2 border-t border-white/10 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={handleSaveTheme} disabled={busy !== ""} className="h-8 gap-1.5 bg-purple-600/80 text-xs text-white hover:bg-purple-600">
                        {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar como tema
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleApplyMode("light")} disabled={busy !== ""} className="h-8 gap-1.5 text-xs">
                        <Sun className="h-3.5 w-3.5" /> Aplicar claro
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleApplyMode("dark")} disabled={busy !== ""} className="h-8 gap-1.5 text-xs">
                        <Moon className="h-3.5 w-3.5" /> Aplicar oscuro
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleApplyMode("auto")} disabled={busy !== ""} className="h-8 gap-1.5 text-xs">
                        <SunMoon className="h-3.5 w-3.5" /> Aplicar auto
                    </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={handleExport} className="h-8 gap-1.5 text-xs">
                        <Download className="h-3.5 w-3.5" /> Exportar archivo
                    </Button>
                    <SaveToLibrary
                        item={{
                            type: "file",
                            title: `${pack.name}.starseed-theme.json`,
                            mime: "application/json",
                            content: JSON.stringify({ kind: "starseed-theme", v: 1, pack }, null, 2),
                            tags: ["starseed-mezclador", "tema"],
                        }}
                        label="Guardar en biblioteca…"
                        className="h-8 text-xs"
                    />
                    <Button size="sm" variant="outline" onClick={() => void handlePublish()} disabled={busy !== ""} className="h-8 gap-1.5 text-xs">
                        {busy === "publish" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />} Publicar en Librería
                    </Button>
                </div>
                <p className="text-[10px] text-white/30">
                    <Zap className="mr-1 inline h-3 w-3 text-amber-300/70" />
                    «Aplicar» cambia TODO StarSeed OS de inmediato y guarda la mezcla como tema personalizado (sobrevive a un refresco). El resto de acciones son locales.
                </p>
            </div>

            {publishOpen && selfRef && publishItem && (
                <PublishDialog mode="item" item={publishItem} open={publishOpen} onOpenChange={setPublishOpen} entityRef={selfRef} doc={readLibrarySnapshot(selfRef)} />
            )}
        </div>
    );
}

export default ThemeMixerPanel;
