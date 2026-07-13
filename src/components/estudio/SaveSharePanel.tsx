"use client";

/*
 * SaveSharePanel — guardar/compartir lo diseñado en el Estudio:
 *  · "Guardar como tema" — usa el CONTRATO theme-engine.ts tal cual
 *    (saveCustomTheme + ThemePack con modes.auto = tokens actuales).
 *  · "Exportar archivo" — .starseed-theme.json (formato oficial, familia
 *    "theme") o un envoltorio propio .starseed-element.json para overrides
 *    de UN elemento (namespacing propio para no chocar con el formato
 *    compartido de temas completos).
 *  · "Guardar en biblioteca…" — reutiliza el componente SaveToLibrary ya
 *    existente (saveItem + selector de destino/folder).
 *  · "Publicar en Librería" — guarda primero (saveItem) y abre el
 *    PublishDialog público ya existente con el ítem resultante.
 *  · "Duplicar desde tema existente" — carga los tokens de un ThemePack
 *    (builtin o personalizado) como punto de partida.
 *  · "Aplicar al sistema ahora" — único botón que muta el documento GLOBAL
 *    (applyThemeTokens); todo lo demás es local hasta que se use.
 */

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Save, Share2, Copy, Zap } from "lucide-react";
import { SaveToLibrary } from "@/components/library/save-to-library";
import { PublishDialog } from "@/components/library/finder/publish-dialog";
import { saveItem, useMyLibraryDestinations, readLibrarySnapshot, type SavedItem } from "@/lib/library/entity-library";
import { applyThemeTokens, exportThemeFile, listThemes, saveCustomTheme, type ThemePack } from "@/lib/design/theme-engine";
import type { ElementFamily, ElementOverride, ThemeDraftMeta } from "./types";

export interface SaveSharePanelProps {
    family: ElementFamily;
    value: ElementOverride;
    meta: ThemeDraftMeta;
    onMetaChange: (m: ThemeDraftMeta) => void;
    onLoadTokens: (tokens: ElementOverride["tokens"]) => void;
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

export function SaveSharePanel({ family, value: o, meta, onMetaChange, onLoadTokens }: SaveSharePanelProps) {
    const { destinations } = useMyLibraryDestinations();
    const selfRef = destinations[0]?.ref;
    const [publishOpen, setPublishOpen] = useState(false);
    const [publishItem, setPublishItem] = useState<SavedItem | null>(null);
    const [applying, setApplying] = useState(false);
    const [dupPick, setDupPick] = useState("");

    const themes = useMemo<ThemePack[]>(() => {
        try { return listThemes(); } catch { return []; }
    }, []);

    function buildPack(): ThemePack {
        return {
            id: meta.id,
            name: meta.name || "Tema sin nombre",
            description: meta.description || "Creado en el Estudio Universal de Diseño.",
            style: meta.style || "personalizado",
            modes: { auto: o.tokens },
        };
    }

    const elementEnvelope = {
        kind: "starseed-estudio-element" as const,
        v: 1,
        family,
        name: meta.name || `${family} personalizado`,
        override: o,
    };

    function exportContent(): string {
        return family === "theme"
            ? JSON.stringify({ kind: "starseed-theme", v: 1, pack: buildPack() }, null, 2)
            : JSON.stringify(elementEnvelope, null, 2);
    }

    function handleExport() {
        if (family === "theme") {
            downloadBlob(exportThemeFile(buildPack()), `${meta.id || "tema"}.starseed-theme.json`);
        } else {
            downloadBlob(new Blob([exportContent()], { type: "application/json" }), `${family}-${meta.id || "estudio"}.starseed-element.json`);
        }
        toast.success("Archivo exportado.");
    }

    function handleSaveTheme() {
        const pack = buildPack();
        saveCustomTheme(pack);
        toast.success(`Tema «${pack.name}» guardado en tus temas personalizados.`);
    }

    function handleApplyNow() {
        setApplying(true);
        try {
            applyThemeTokens(o.tokens);
            toast.success("Aplicado al sistema — cambia el aspecto de TODO StarSeed OS ahora mismo (revertible desde Ajustes → Apariencia).");
        } finally {
            setApplying(false);
        }
    }

    async function handlePublishFlow() {
        if (!selfRef) {
            toast.error("Inicia sesión para publicar en la Librería.");
            return;
        }
        const title = meta.name || `${family} — Estudio de Diseño`;
        const content = exportContent();
        const res = await saveItem(selfRef, { type: "file", title, mime: "application/json", content, tags: ["starseed-estudio", family] }, null);
        if (!res.ok) {
            toast.error("No se pudo guardar antes de publicar.");
            return;
        }
        const item: SavedItem = {
            id: res.id, type: "file", title, tags: ["starseed-estudio", family],
            folderId: null, addedAt: new Date().toISOString(), addedBy: "", mime: "application/json", content,
        };
        setPublishItem(item);
        setPublishOpen(true);
    }

    function handleDuplicate(themeId: string) {
        const pack = themes.find((t) => t.id === themeId);
        if (!pack) return;
        const tokens = pack.modes.auto ?? pack.modes.dark ?? pack.modes.light;
        if (!tokens) return;
        onLoadTokens(tokens);
        toast.success(`Cargado «${pack.name}» como punto de partida.`);
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
                <Input value={meta.name} onChange={(e) => onMetaChange({ ...meta, name: e.target.value })} placeholder="Nombre" className="col-span-3 h-8 border-white/15 bg-black/30 text-xs sm:col-span-1" />
                <Input value={meta.style} onChange={(e) => onMetaChange({ ...meta, style: e.target.value })} placeholder="Estilo (p.ej. cyberpunk)" className="col-span-3 h-8 border-white/15 bg-black/30 text-xs sm:col-span-1" />
                <Input value={meta.description} onChange={(e) => onMetaChange({ ...meta, description: e.target.value })} placeholder="Descripción" className="col-span-3 h-8 border-white/15 bg-black/30 text-xs sm:col-span-1" />
            </div>

            {themes.length > 0 && (
                <div className="flex items-center gap-2">
                    <Copy className="h-3.5 w-3.5 shrink-0 text-white/40" />
                    <Select value={dupPick} onValueChange={(v) => { setDupPick(v); handleDuplicate(v); }}>
                        <SelectTrigger className="h-8 flex-1 border-white/15 bg-black/30 text-xs"><SelectValue placeholder="Duplicar desde un tema existente…" /></SelectTrigger>
                        <SelectContent className="border-white/10 bg-black/90">
                            {themes.map((t) => <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
                {family === "theme" && (
                    <Button size="sm" onClick={handleSaveTheme} className="h-8 gap-1.5 bg-purple-600/80 text-xs text-white hover:bg-purple-600">
                        <Save className="h-3.5 w-3.5" /> Guardar como tema
                    </Button>
                )}
                <Button size="sm" variant="outline" onClick={handleExport} className="h-8 gap-1.5 text-xs">
                    <Download className="h-3.5 w-3.5" /> Exportar archivo
                </Button>
                <SaveToLibrary
                    item={{
                        type: "file",
                        title: meta.name || `${family} — Estudio de Diseño`,
                        mime: "application/json",
                        content: exportContent(),
                        tags: ["starseed-estudio", family],
                    }}
                    label="Guardar en biblioteca…"
                    className="h-8 text-xs"
                />
                <Button size="sm" variant="outline" onClick={() => void handlePublishFlow()} className="h-8 gap-1.5 text-xs">
                    <Share2 className="h-3.5 w-3.5" /> Publicar en Librería
                </Button>
                {family === "theme" && (
                    <Button size="sm" variant="ghost" onClick={handleApplyNow} disabled={applying} className="h-8 gap-1.5 text-xs text-amber-200/80 hover:text-amber-100">
                        <Zap className="h-3.5 w-3.5" /> Aplicar al sistema ahora
                    </Button>
                )}
            </div>
            <p className="text-[10px] text-white/30">
                «Aplicar al sistema ahora» cambia TODO StarSeed OS de inmediato. El resto de acciones son locales y no afectan a nadie hasta que las uses.
            </p>

            {publishOpen && selfRef && publishItem && (
                <PublishDialog mode="item" item={publishItem} open={publishOpen} onOpenChange={setPublishOpen} entityRef={selfRef} doc={readLibrarySnapshot(selfRef)} />
            )}
        </div>
    );
}

export default SaveSharePanel;
