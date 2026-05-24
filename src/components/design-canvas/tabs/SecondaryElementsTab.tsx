"use client";

import React from "react";
import { MoreHorizontal, MousePointer2, SeparatorHorizontal, Scroll, ScanFace } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasState } from "../state-types";
import { usePreviewSync } from "../hooks/usePreviewSync";
import { SettingControl } from "../controls/SettingControl";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";

interface Props { state: CanvasState; dispatch: React.Dispatch<any>; }

export function SecondaryElementsTab({ state, dispatch }: Props) {
    const { scrollToPreview } = usePreviewSync();

    const handleHighlight = (id: string | null) => {
        dispatch({ type: "SET_UI", payload: { activeHighlight: id } });
    };

    const update = (p: Partial<CanvasState["secondary"]>) => {
        dispatch({ type: "SET_SECONDARY", payload: p });
        scrollToPreview("family-wrapper-secondary"); // General UI interaction
    };

    const { secondary } = state;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-500/20 to-gray-500/20 flex items-center justify-center border border-slate-500/20">
                    <MoreHorizontal className="w-5 h-5 text-slate-400" />
                </div>
                <div>
                    <h3 className="text-base font-semibold text-white">Elementos Secundarios</h3>
                    <p className="text-xs text-white/60">Interacción fina, cursores y máscaras</p>
                </div>
            </div>

            <Tabs defaultValue="interaction" className="w-full">
                <TabsList className="w-full grid grid-cols-2 bg-white/5 p-1 rounded-xl mb-4">
                    <TabsTrigger value="interaction" className="text-xs">Interacción</TabsTrigger>
                    <TabsTrigger value="details" className="text-xs">Detalles UI</TabsTrigger>
                </TabsList>

                {/* INTERACTION TAB */}
                <TabsContent value="interaction" className="space-y-4 data-[state=active]:animate-in data-[state=active]:fade-in-50">
                    <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <MousePointer2 className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-xs text-white/70">Personalización del Cursor</span>
                        </div>

                        <SettingControl
                            id="cursorStyle"
                            label="Estilo Base"
                            description="Main cursor appearance"
                            onHighlight={handleHighlight}
                        >
                            <Select value={secondary.cursor} onValueChange={(v: any) => update({ cursor: v })}>
                                <SelectTrigger className="w-full h-8 text-xs bg-white/5 border-white/10 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-white/10 text-white">
                                    <SelectItem value="default">Nativo del SO</SelectItem>
                                    <SelectItem value="custom">Custom SVG</SelectItem>
                                    <SelectItem value="glow">Glow Point</SelectItem>
                                </SelectContent>
                            </Select>
                        </SettingControl>

                        {secondary.cursor === 'custom' && (
                            <SettingControl
                                id="customCursorSvg"
                                label="SVG URL / Data URI"
                                description="URL or Data URI for custom cursor"
                                onHighlight={handleHighlight}
                            >
                                <Input
                                    value={secondary.customCursorSvg || ""}
                                    onChange={e => update({ customCursorSvg: e.target.value })}
                                    className="h-8 text-xs bg-white/5 border-white/10"
                                    placeholder="url('cursor.svg')..."
                                />
                            </SettingControl>
                        )}

                        <div className="pt-4 border-t border-white/5">
                            <div className="flex items-center gap-2 mb-2">
                                <Scroll className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-xs text-white/70">Scrollbars</span>
                            </div>
                            <SettingControl
                                id="scrollbars"
                                label="Estilo de Scrollbar"
                                description="Appearance of global scrollbars"
                                onHighlight={handleHighlight}
                            >
                                <Select value={secondary.scrollbars} onValueChange={(v: any) => update({ scrollbars: v })}>
                                    <SelectTrigger className="w-full h-8 text-xs bg-white/5 border-white/10 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10 text-white">
                                        <SelectItem value="default">Nativo</SelectItem>
                                        <SelectItem value="thin">Minimal (Thin)</SelectItem>
                                        <SelectItem value="hidden">Invisible</SelectItem>
                                        <SelectItem value="glow">Neon Glow</SelectItem>
                                    </SelectContent>
                                </Select>
                            </SettingControl>
                        </div>
                    </div>
                </TabsContent>

                {/* DETAILS TAB */}
                <TabsContent value="details" className="space-y-4 data-[state=active]:animate-in data-[state=active]:fade-in-50">
                    <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-5">
                        <div className="flex items-center gap-2 mb-2">
                            <ScanFace className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-xs text-white/70">Máscaras y Separadores</span>
                        </div>

                        <SettingControl
                            id="masking"
                            label="Masking de Contenedores"
                            description="Shape masking for containers"
                            onHighlight={handleHighlight}
                        >
                            <Select value={secondary.mask || "none"} onValueChange={(v: any) => update({ mask: v })}>
                                <SelectTrigger className="w-full h-8 text-xs bg-white/5 border-white/10 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-white/10 text-white">
                                    <SelectItem value="none">Rectángulo (Default)</SelectItem>
                                    <SelectItem value="hex">Hexagonal</SelectItem>
                                    <SelectItem value="circle">Circular</SelectItem>
                                </SelectContent>
                            </Select>
                        </SettingControl>

                        <SettingControl
                            id="dividers"
                            label="Divisores de Sección"
                            description="Style of section dividers"
                            onHighlight={handleHighlight}
                        >
                            <Select value={secondary.dividers} onValueChange={(v: any) => update({ dividers: v })}>
                                <SelectTrigger className="w-full h-8 text-xs bg-white/5 border-white/10 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-white/10 text-white">
                                    <SelectItem value="none">Espacio Blanco</SelectItem>
                                    <SelectItem value="line">Línea Sólida</SelectItem>
                                    <SelectItem value="gradient">Gradiente Fade</SelectItem>
                                </SelectContent>
                            </Select>
                        </SettingControl>

                        <div className="pt-4 border-t border-white/5 flex flex-col gap-4">
                            <SettingControl
                                id="selectionColor"
                                label="Color de Selección"
                                description="Color for text selection"
                                headerAction={<span className="text-[10px] text-white/40 font-mono">{secondary.selectionColor}</span>}
                                onHighlight={handleHighlight}
                            >
                                <div className="flex items-center gap-2">
                                    <input type="color" value={secondary.selectionColor}
                                        onChange={(e) => update({ selectionColor: e.target.value })}
                                        className="w-full h-6 rounded bg-transparent cursor-pointer border-0 p-0" />
                                </div>
                            </SettingControl>

                            <SettingControl
                                id="selectionMode"
                                label="Modo de Selección"
                                description="Selection behavior"
                                onHighlight={handleHighlight}
                            >
                                <Select value={secondary.selectionMode || "precise"} onValueChange={(v: any) => update({ selectionMode: v })}>
                                    <SelectTrigger className="w-full h-8 text-xs bg-white/5 border-white/10 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10 text-white">
                                        <SelectItem value="precise">Preciso (Texto)</SelectItem>
                                        <SelectItem value="block">Bloque (Area)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </SettingControl>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
