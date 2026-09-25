"use client";

/**
 * Contenido de la cortina Horizon (izquierda · verde): Centro de Creación.
 * Separado de side-curtains.tsx para que el armazón de las cortinas (gestos,
 * cierre, accesibilidad) y su contenido se puedan leer y cambiar por separado.
 * Todas las áreas ABREN de verdad su destino (Adenda 63).
 */

import React from "react";
import { ArrowLeft, BookOpen, Copy, Layout, Library, Maximize2, Palette, Pencil, Plus, Send, Sparkles, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBoardSystem } from "@/context/board-context";
import { usePerfilDispositivo } from "@/hooks/use-perfil-dispositivo";
import { usePanelCortina } from "./panel-cortina";

const formatearFecha = (ts: number) =>
    new Intl.DateTimeFormat("es-ES", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(ts));

export function ContenidoHorizon({ ir, abrirEditor }: { ir: (href: string) => void; abrirEditor: () => void }) {
    const { boards, createBoard, setActiveBoard, deleteBoard } = useBoardSystem();
    const panel = usePanelCortina();
    const { entrada } = usePerfilDispositivo();
    const pistaCierre = entrada === "raton"
        ? "o desliza con dos dedos hacia la izquierda · Esc"
        : "o desliza el panel hacia la izquierda";

    const crearPizarra = () => createBoard(`Nueva Pizarra ${boards.length + 1}`);

    return (
        <div className="relative w-full h-full flex flex-col">
            {/* Cristal + tinte esmeralda (contenidos en el panel) */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" />
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/50 to-transparent pointer-events-none" />

            <div className="relative z-10 w-full flex-1 min-h-0 flex flex-col px-6 pt-16 pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1.5rem,env(safe-area-inset-left))] md:px-10 md:pt-14 text-emerald-50 overflow-y-auto overscroll-contain custom-scrollbar">
                {/* Cabecera */}
                <div className="flex flex-col items-center text-center gap-4 mb-10 flex-shrink-0">
                    <div data-ss-coreo="logo" className="p-4 rounded-full bg-emerald-500/20 border border-emerald-400/30 shadow-[0_0_25px_rgba(16,185,129,0.5)]">
                        <Copy className="w-8 h-8 text-emerald-300" />
                    </div>
                    <div>
                        <h2 className="text-2xl md:text-3xl font-light tracking-widest uppercase font-headline">Centro de Creación</h2>
                        <p className="text-xs text-emerald-400/60 font-mono mt-1">UNIVERSAL CANVAS HUB</p>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="mt-2 h-11 min-h-[44px] rounded-full gap-2 text-xs text-emerald-300/80 hover:bg-emerald-500/10 hover:text-emerald-200 cursor-pointer"
                            onClick={() => ir("/crear")}
                        >
                            <Maximize2 className="h-3.5 w-3.5" /> Abrir página completa
                        </Button>
                    </div>
                </div>

                {/* Lienzo Universal */}
                <div className="mb-6 flex-shrink-0 px-2">
                    <Button
                        className="w-full h-auto min-h-[44px] py-6 rounded-3xl flex flex-col items-center gap-3 bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border border-emerald-500/30 hover:border-emerald-400/60 hover:from-emerald-500/30 hover:to-teal-600/30 transition-all group shadow-lg cursor-pointer"
                        onClick={() => ir("/crear?area=lienzo")}
                    >
                        <div className="p-3 rounded-full bg-emerald-400/20 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                            <Sparkles className="w-8 h-8 text-emerald-300" />
                        </div>
                        <div className="text-center">
                            <span className="block text-xl font-light tracking-wider text-emerald-100 mb-1">Lienzo Universal</span>
                            <span className="text-sm text-emerald-200/60 font-light px-4 whitespace-normal break-words">Creador de publicaciones específicas: bloques, archivos y widgets para cualquier sección de la red.</span>
                        </div>
                    </Button>
                </div>

                {/* Editor Universal */}
                <div className="mb-6 flex-shrink-0 px-2">
                    <Button
                        className="w-full h-auto min-h-[44px] py-5 rounded-3xl flex items-center gap-4 bg-gradient-to-r from-violet-600/20 via-fuchsia-600/15 to-emerald-600/15 border border-violet-500/30 hover:border-violet-400/50 hover:from-violet-600/30 hover:via-fuchsia-600/25 hover:to-emerald-600/25 transition-all group shadow-lg cursor-pointer"
                        onClick={abrirEditor}
                    >
                        <div className="p-3 rounded-full bg-violet-500/20 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(139,92,246,0.3)]">
                            <Pencil className="w-7 h-7 text-violet-200" />
                        </div>
                        <div className="text-left">
                            <span className="block text-lg font-light tracking-wider text-violet-100">Editor Universal</span>
                            <span className="text-xs text-violet-300/50 font-mono uppercase tracking-wider">Diseño · Código · IA · Biblioteca</span>
                        </div>
                    </Button>
                </div>

                <div className="flex-1 space-y-10">
                    {/* Pizarras activas */}
                    <div>
                        <div className="flex items-center justify-between mb-4 border-b border-emerald-500/20 pb-3">
                            <h3 className="text-sm font-semibold text-emerald-400/70 uppercase tracking-widest flex items-center gap-2">
                                <Layout className="w-4 h-4" /> Pizarras Activas
                            </h3>
                            <div className="flex items-center gap-1">
                                <Button size="sm" variant="ghost" className="h-9 rounded-full gap-2 text-xs text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300" onClick={() => ir("/pizarras")}>
                                    <Library className="h-4 w-4" /> Nube
                                </Button>
                                <Button size="sm" variant="ghost" className="h-9 rounded-full gap-2 text-xs text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300" onClick={crearPizarra}>
                                    <Plus className="h-4 w-4" /> Nueva
                                </Button>
                            </div>
                        </div>

                        <ScrollArea className="h-[240px] rounded-2xl border border-emerald-500/10 bg-emerald-950/20 p-3 shadow-inner">
                            {boards.map((board) => (
                                <div
                                    key={board.id}
                                    className="flex items-center justify-between p-4 mb-3 rounded-2xl border border-emerald-500/10 bg-black/40 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all group cursor-pointer"
                                    onClick={() => setActiveBoard(board.id)}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-1.5 h-10 rounded-full bg-emerald-500/50 group-hover:bg-emerald-400 transition-colors" />
                                        <div className="overflow-hidden">
                                            <p className="font-medium text-base truncate text-emerald-100 group-hover:text-white transition-colors">{board.name}</p>
                                            <p className="text-[11px] text-emerald-500/60 mt-0.5">{formatearFecha(board.updatedAt)}</p>
                                        </div>
                                    </div>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        aria-label={`Borrar la pizarra ${board.name}`}
                                        className="h-9 w-9 rounded-full opacity-60 md:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-destructive hover:bg-destructive/20"
                                        onClick={(e) => { e.stopPropagation(); deleteBoard(board.id); }}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                            {boards.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-full text-emerald-500/40 text-sm">
                                    <Layout className="w-8 h-8 mb-3 opacity-20" />
                                    <p>No hay pizarras activas.</p>
                                    <Button variant="link" className="text-emerald-400 text-sm p-0 h-auto mt-2 hover:text-emerald-300" onClick={crearPizarra}>Crear una ahora</Button>
                                </div>
                            )}
                        </ScrollArea>
                    </div>

                    {/* Zona de publicación */}
                    <div className="bg-emerald-950/20 rounded-3xl p-6 border border-emerald-500/20 shadow-inner">
                        <div className="flex flex-col items-center text-center mb-6">
                            <div className="p-2 rounded-full bg-emerald-500/20 mb-3">
                                <Send className="w-5 h-5 text-emerald-400" />
                            </div>
                            <h3 className="text-sm font-semibold text-emerald-400/90 uppercase tracking-widest">Zona de Publicación</h3>
                            <p className="text-xs text-emerald-200/60 mt-2 max-w-[250px] leading-relaxed mx-auto">
                                Selecciona el contexto espacial de tu publicación actual.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3">
                            <BotonPublicar icono={<Library className="w-5 h-5" />} rotulo="Biblioteca" sub="Archivo & Wiki" onClick={() => ir("/crear?area=publicar&dest=biblioteca")} />
                            <BotonPublicar icono={<Users className="w-5 h-5" />} rotulo="Política" sub="Propuestas & Votos" onClick={() => ir("/crear?area=publicar&dest=politica")} />
                            <BotonPublicar icono={<BookOpen className="w-5 h-5" />} rotulo="Educación" sub="Cursos & Guías" onClick={() => ir("/crear?area=publicar&dest=educacion")} />
                            <BotonPublicar icono={<Palette className="w-5 h-5" />} rotulo="Cultura" sub="Arte & Eventos" onClick={() => ir("/crear?area=publicar&dest=cultura")} />
                        </div>
                    </div>
                </div>

                {/* Pie: cerrar con la misma animación que el gesto, y cómo hacerlo con el gesto. */}
                <button
                    type="button"
                    onClick={() => panel?.cerrar()}
                    className="flex flex-col justify-center items-center gap-1 text-emerald-400/60 text-sm mt-10 hover:text-emerald-200 transition-colors py-4 min-h-[44px] flex-shrink-0 border-t border-emerald-500/10 cursor-pointer"
                >
                    <span className="flex items-center gap-2 uppercase tracking-wider">
                        <ArrowLeft className="w-5 h-5" /> Cerrar
                    </span>
                    <span className="text-[11px] normal-case tracking-normal text-emerald-300/45">{pistaCierre}</span>
                </button>
            </div>
        </div>
    );
}

function BotonPublicar({ icono, rotulo, sub, onClick }: { icono: React.ReactNode; rotulo: string; sub: string; onClick: () => void }) {
    return (
        <Button
            variant="ghost"
            onClick={onClick}
            className="h-auto py-4 px-4 flex flex-col items-center text-center gap-2 w-full rounded-2xl border border-emerald-500/10 bg-emerald-950/20 hover:bg-emerald-500/20 hover:border-emerald-500/30 transition-all group"
        >
            <div className="flex flex-col items-center gap-1 w-full relative z-10">
                <div className="p-3 bg-emerald-500/10 rounded-full text-emerald-400 group-hover:bg-emerald-500/20 group-hover:text-emerald-300 group-hover:scale-110 transition-all duration-300">
                    {icono}
                </div>
                <span className="text-sm font-medium text-emerald-100 mt-1">{rotulo}</span>
            </div>
            <span className="text-[10px] text-emerald-500/60 font-mono tracking-wider">{sub}</span>
        </Button>
    );
}
