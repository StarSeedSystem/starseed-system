"use client";

// ═══════════════════════════════════════════════════════════════════════════
// EntityLayoutEditor — diálogo "Personalizar" para grupo/página (y perfil)
// -----------------------------------------------------------------------------
// Edita la capa `entity-layout.ts` (entity_state key 'layout'): acento/portada
// de personalización, orden y visibilidad de pestañas (flechas), e
// integraciones sugeridas (Educación / Gobernanza / Galería) según el tipo de
// entidad. Solo se muestra a quien la página ya considera dueño/a
// (useEntityOwner) — el mismo criterio que EntityEditorDialog.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AttachFilePickerButton } from "@/components/files/universal-file-picker";
import { ArrowUp, ArrowDown, Eye, EyeOff, Palette, LayoutList, Puzzle, ImageIcon, RotateCcw, X, Blend } from "lucide-react";
import type { EntityLayout, IntegrationSuggestion } from "@/lib/entity-layout";
// Catálogo + Mezclador de temas (theme-engine.ts): listThemes() incluye los
// ~24 builtin MÁS los personalizados del usuario (incl. mezclas guardadas
// como tema desde el Mezclador) — el mismo selector sirve para ambos.
import { listThemes } from "@/lib/design/theme-engine";

export interface EntityLayoutEditorProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Acento "oficial" de la entidad (para comparar/mostrar el color por defecto). */
    baseAccent: string;
    /** Pestañas actualmente visibles+ordenadas (base + integraciones activas). */
    tabs: Array<{ id: string; label: string; visible: boolean }>;
    layout: EntityLayout;
    suggestions: IntegrationSuggestion[];
    onSetAccent: (v: string | null) => Promise<void>;
    onSetCoverUrl: (v: string | null) => Promise<void>;
    onReorderTabs: (orderedIds: string[]) => Promise<void>;
    onSetTabVisible: (id: string, visible: boolean) => Promise<void>;
    onToggleIntegration: (key: string, on: boolean) => Promise<void>;
    /** Tema por entidad (Mezclador/Catálogo — theme-mixer.ts + theme-engine.ts).
     *  Opcional: si no se pasa, la sección "Tema" no se muestra (cero cambio
     *  visual para quien no la use todavía). */
    onSetTheme?: (themeId: string | null) => Promise<void>;
}

export function EntityLayoutEditor({
    open, onOpenChange, baseAccent, tabs, layout, suggestions,
    onSetAccent, onSetCoverUrl, onReorderTabs, onSetTabVisible, onToggleIntegration, onSetTheme,
}: EntityLayoutEditorProps) {
    const [uploadingCover, setUploadingCover] = useState(false);

    const move = (id: string, dir: -1 | 1) => {
        const ids = tabs.map((t) => t.id);
        const i = ids.indexOf(id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= ids.length) return;
        const next = [...ids];
        [next[i], next[j]] = [next[j], next[i]];
        void onReorderTabs(next);
    };

    const activeIntegrationKeys = new Set(Object.keys(layout.integrations).filter((k) => layout.integrations[k]));
    const pendingSuggestions = suggestions.filter((s) => !activeIntegrationKeys.has(s.key));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Personalizar formato</DialogTitle>
                    <DialogDescription className="text-xs">
                        Cambios visibles solo para ti al editar; se guardan y sincronizan en tiempo real para todo el mundo.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5">
                    {/* Apariencia */}
                    <section className="space-y-2.5">
                        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                            <Palette className="h-3.5 w-3.5" /> Apariencia
                        </h3>
                        <div className="flex items-center gap-3">
                            <input
                                type="color"
                                value={layout.accent || baseAccent}
                                onChange={(e) => void onSetAccent(e.target.value)}
                                className="h-9 w-14 cursor-pointer rounded-md border border-input bg-transparent p-1"
                                aria-label="Color de acento personalizado"
                            />
                            <span className="text-xs text-muted-foreground tabular-nums">{layout.accent || `${baseAccent} (por defecto)`}</span>
                            {layout.accent && (
                                <Button variant="ghost" size="sm" className="cursor-pointer gap-1 text-xs" onClick={() => void onSetAccent(null)}>
                                    <RotateCcw className="h-3 w-3" /> Restablecer
                                </Button>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            {layout.coverUrl ? (
                                <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg border border-white/10">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={layout.coverUrl} alt="Portada personalizada" className="h-full w-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => void onSetCoverUrl(null)}
                                        className="absolute right-0.5 top-0.5 cursor-pointer rounded-full bg-black/60 p-0.5 text-white"
                                        aria-label="Quitar portada personalizada"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ) : (
                                <span className="text-xs text-muted-foreground">Portada: la de la entidad (por defecto)</span>
                            )}
                            <AttachFilePickerButton
                                onPick={(picked) => {
                                    setUploadingCover(false);
                                    const url = picked[0]?.url;
                                    if (url) void onSetCoverUrl(url);
                                }}
                                accept="image/*"
                                folder="layout-portadas"
                                title="Portada personalizada"
                                hideTabs={["neuronas"]}
                                className="cursor-pointer rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:border-primary/30 hover:text-foreground transition-colors duration-200"
                            >
                                {uploadingCover ? "Subiendo…" : "Cambiar portada"}
                            </AttachFilePickerButton>
                        </div>
                    </section>

                    {onSetTheme && (
                        <>
                            <Separator />
                            {/* Tema por entidad (Mezclador/Catálogo) */}
                            <section className="space-y-2">
                                <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                    <Blend className="h-3.5 w-3.5" /> Tema
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                    Elige un tema del catálogo o una mezcla tuya guardada (Ajustes → Apariencia → Combinar…). Se aplica solo al entrar en esta entidad.
                                </p>
                                <Select
                                    value={layout.themeId || "none"}
                                    onValueChange={(v) => void onSetTheme(v === "none" ? null : v)}
                                >
                                    <SelectTrigger className="h-9 w-full">
                                        <SelectValue placeholder="Tema del sistema (por defecto)" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-72">
                                        <SelectItem value="none">Tema del sistema (por defecto)</SelectItem>
                                        {listThemes().map((t) => (
                                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </section>
                        </>
                    )}

                    <Separator />

                    {/* Pestañas: orden y visibilidad */}
                    <section className="space-y-2">
                        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                            <LayoutList className="h-3.5 w-3.5" /> Pestañas
                        </h3>
                        <div className="space-y-1">
                            {tabs.map((t, i) => (
                                <div key={t.id} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5">
                                    <span className={`flex-1 truncate text-sm ${t.visible ? "" : "text-muted-foreground line-through"}`}>{t.label}</span>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 cursor-pointer" disabled={i === 0} onClick={() => move(t.id, -1)} aria-label={`Subir ${t.label}`}>
                                        <ArrowUp className="h-3 w-3" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 cursor-pointer" disabled={i === tabs.length - 1} onClick={() => move(t.id, 1)} aria-label={`Bajar ${t.label}`}>
                                        <ArrowDown className="h-3 w-3" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 cursor-pointer" onClick={() => void onSetTabVisible(t.id, !t.visible)} aria-label={t.visible ? `Ocultar ${t.label}` : `Mostrar ${t.label}`}>
                                        {t.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </section>

                    {pendingSuggestions.length > 0 && (
                        <>
                            <Separator />
                            <section className="space-y-2">
                                <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                    <Puzzle className="h-3.5 w-3.5" /> Integraciones sugeridas
                                </h3>
                                {pendingSuggestions.map((s) => (
                                    <div key={s.key} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                                        <span className="text-sm">{s.label}</span>
                                        <Switch checked={false} onCheckedChange={(on) => void onToggleIntegration(s.key, on)} />
                                    </div>
                                ))}
                            </section>
                        </>
                    )}

                    {Array.from(activeIntegrationKeys).length > 0 && (
                        <section className="space-y-2">
                            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                <ImageIcon className="h-3.5 w-3.5" /> Integraciones activas
                            </h3>
                            {suggestions.filter((s) => activeIntegrationKeys.has(s.key)).map((s) => (
                                <div key={s.key} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                                    <span className="text-sm">{s.label}</span>
                                    <Switch checked onCheckedChange={(on) => void onToggleIntegration(s.key, on)} />
                                </div>
                            ))}
                        </section>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default EntityLayoutEditor;
