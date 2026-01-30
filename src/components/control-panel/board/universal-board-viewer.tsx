"use client";

import React, { useEffect, useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { v4 as uuidv4 } from "uuid";
import { useBoardSystem, WidgetType } from "@/context/board-context";
import { useUserContext } from "@/context/user-context";
import { cn } from "@/lib/utils";
import {
    Maximize2,
    Minimize2,
    Plus,
    Image as ImageIcon,
    Type,
    CheckSquare,
    Sparkles,
    X,
    GripHorizontal,
    Edit2,
    Eye,
    Video,
    Link as LinkIcon,
    Share2,
    ChevronUp,
    ChevronDown
} from "lucide-react";
import { ShareBoardDialog } from "./share-board-dialog"; // Import Dialog
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// Safe import for RGL with Next.js/Turbopack
const RGL = require("react-grid-layout");
const AvailableWidthProvider = RGL.WidthProvider || RGL.default?.WidthProvider;
const AvailableResponsive = RGL.Responsive || RGL.default?.Responsive;

const ResponsiveGridLayout = (typeof window !== "undefined" && AvailableWidthProvider && AvailableResponsive)
    ? AvailableWidthProvider(AvailableResponsive)
    : (AvailableResponsive || "div");

const isRPresent = !!AvailableResponsive;

// --- Widget Components ---

const NoteWidget = ({ data, onChange }: { data: any, onChange: (d: any) => void }) => {
    const [isEditing, setIsEditing] = useState(!data.text); // Default to edit if empty

    return (
        <div className="h-full flex flex-col bg-yellow-100/10 p-3 rounded-lg border border-yellow-200/20 backdrop-blur-sm shadow-sm transition-all hover:shadow-md hover:bg-yellow-100/15 group/note relative">

            {/* Toolbar */}
            <div className="absolute top-2 right-2 z-20 flex gap-1 opacity-0 group-hover/note:opacity-100 transition-opacity">
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 rounded-full bg-black/10 hover:bg-black/20"
                    onClick={() => setIsEditing(!isEditing)}
                >
                    {isEditing ? <Eye className="w-3 h-3" /> : <Edit2 className="w-3 h-3" />}
                </Button>
            </div>

            {/* Title Input (Always visible or only in edit? Let's keep it visible for quick scanning) */}
            <Input
                value={data.title || ""}
                onChange={(e) => onChange({ ...data, title: e.target.value })}
                placeholder="Title..."
                className="bg-transparent border-none text-base font-bold placeholder:text-yellow-500/50 mb-2 focus-visible:ring-0 px-0 h-auto py-1 shadow-none"
            />

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative min-h-0">
                {isEditing ? (
                    <Textarea
                        value={data.text || ""}
                        onChange={(e) => onChange({ ...data, text: e.target.value })}
                        placeholder="Type markdown here... (**bold**, - list)"
                        className="w-full h-full bg-transparent border-none resize-none text-sm focus-visible:ring-0 px-0 py-0 leading-relaxed font-mono text-muted-foreground/80"
                        autoFocus
                    />
                ) : (
                    <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed overflow-y-auto h-full scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pr-2 break-words">
                        <ReactMarkdown>{data.text || "*Empty note*"}</ReactMarkdown>
                    </div>
                )}
            </div>
        </div>
    );
};

const MediaWidget = ({ data, onChange }: { data: any, onChange: (d: any) => void }) => {
    const [urlInput, setUrlInput] = useState("");

    // Helper to detect type
    const getMediaType = (url: string) => {
        if (!url) return 'empty';
        if (url.match(/^(https?\:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/)) return 'youtube';
        return 'image'; // Default to image
    };

    const type = getMediaType(data.url);

    const getYouTubeId = (url: string) => {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    };

    const handleSave = () => {
        if (urlInput) onChange({ ...data, url: urlInput });
    };

    return (
        <div className="h-full w-full relative group overflow-hidden rounded-xl bg-black/20 border border-white/5 shadow-inner transition-all hover:border-white/10 flex flex-col">

            {type === 'empty' && (
                <div className="flex flex-col items-center justify-center h-full space-y-4 p-6 animate-in fade-in duration-500">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shadow-lg">
                        <LinkIcon className="w-6 h-6 text-indigo-400 opacity-80" />
                    </div>
                    <div className="w-full max-w-[200px] space-y-2">
                        <Input
                            placeholder="Paste Image or YouTube URL..."
                            className="h-8 text-xs bg-black/40 border-white/10 text-center rounded-full focus-visible:ring-indigo-500/50"
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSave()
                            }}
                            onBlur={handleSave}
                        />
                        <p className="text-[10px] text-muted-foreground text-center opacity-60">Supports JPG, PNG, YouTube</p>
                    </div>
                </div>
            )}

            {type === 'image' && (
                <div className="relative w-full h-full bg-black/50 flex items-center justify-center">
                    <img
                        src={data.url}
                        alt="Media"
                        className="w-full h-full object-cover pointer-events-none select-none relative z-10"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement?.classList.add('error-state');
                        }}
                    />
                    {/* Fallback displayed when img is hidden via CSS or state */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400/50 space-y-2 z-0">
                        <Video className="w-8 h-8" />
                        <span className="text-[10px] uppercase font-bold tracking-widest">Signal Lost</span>
                    </div>
                </div>
            )}

            {type === 'youtube' && (
                <div className="w-full h-full bg-black relative">
                    {/* Overlay for dragging - only captures clicks if not interacting with controls */}
                    <div className="absolute inset-0 z-10 pointer-events-none" />
                    <iframe
                        width="100%"
                        height="100%"
                        src={`https://www.youtube.com/embed/${getYouTubeId(data.url)}?modestbranding=1&rel=0`}
                        title="YouTube video player"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="pointer-events-auto relative z-20"
                    ></iframe>
                </div>
            )}

            {/* Delete Action (Top Right) */}
            {type !== 'empty' && (
                <div className="absolute top-2 right-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 bg-black/50 hover:bg-red-500/20 text-white/70 hover:text-red-400 rounded-full backdrop-blur-md border border-white/5"
                        onClick={() => onChange({ ...data, url: "" })}
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            )}
        </div>
    );
};

const ChecklistWidget = ({ data, onChange }: { data: any, onChange: (d: any) => void }) => {
    const items = data.items || [];

    const addItem = (text: string) => {
        if (!text.trim()) return;
        const newItem = { id: uuidv4(), text, completed: false };
        onChange({ ...data, items: [...items, newItem] });
    };

    const toggleItem = (id: string) => {
        const newItems = items.map((i: any) =>
            i.id === id ? { ...i, completed: !i.completed } : i
        );
        onChange({ ...data, items: newItems });
    };

    const deleteItem = (id: string) => {
        const newItems = items.filter((i: any) => i.id !== id);
        onChange({ ...data, items: newItems });
    };

    // Calculate progress
    const completedCount = items.filter((i: any) => i.completed).length;
    const progress = items.length > 0 ? (completedCount / items.length) * 100 : 0;

    return (
        <div className="h-full flex flex-col bg-green-950/10 p-3 rounded-lg border border-green-500/10 backdrop-blur-sm shadow-sm transition-all hover:bg-green-950/20 group/checklist relative hover:shadow-green-900/10 hover:border-green-500/20">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <Input
                    value={data.title || "Checklist"}
                    onChange={(e) => onChange({ ...data, title: e.target.value })}
                    className="bg-transparent border-none text-sm font-bold placeholder:text-green-500/50 focus-visible:ring-0 px-0 h-auto py-0 shadow-none text-green-100/90"
                />
                <span className="text-[10px] font-mono text-green-400/80">{Math.round(progress)}%</span>
            </div>

            {/* Progress Bar */}
            <div className="h-1 w-full bg-black/20 rounded-full overflow-hidden mb-3">
                <div
                    className="h-full bg-green-500/50 transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 pr-1 gap-1 flex flex-col min-h-0">
                {items.length === 0 && (
                    <div className="text-[10px] text-muted-foreground text-center py-4 italic opacity-50">
                        Add tasks below...
                    </div>
                )}
                {items.map((item: any, index: number) => (
                    <div key={item.id} className="flex items-center gap-2 group/item min-h-[24px]">
                        {/* Reorder Controls */}
                        <div className="flex flex-col opacity-0 group-hover/item:opacity-50 hover:!opacity-100 transition-opacity -ml-1">
                            <button
                                onClick={() => {
                                    if (index === 0) return;
                                    const newItems = [...items];
                                    [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
                                    onChange({ ...data, items: newItems });
                                }}
                                disabled={index === 0}
                                className="h-2 w-3 flex items-center justify-center hover:text-white disabled:opacity-0"
                            >
                                <ChevronUp className="w-2 h-2" />
                            </button>
                            <button
                                onClick={() => {
                                    if (index === items.length - 1) return;
                                    const newItems = [...items];
                                    [newItems[index + 1], newItems[index]] = [newItems[index], newItems[index + 1]];
                                    onChange({ ...data, items: newItems });
                                }}
                                disabled={index === items.length - 1}
                                className="h-2 w-3 flex items-center justify-center hover:text-white disabled:opacity-0"
                            >
                                <ChevronDown className="w-2 h-2" />
                            </button>
                        </div>

                        <button
                            onClick={() => toggleItem(item.id)}
                            className={cn(
                                "w-4 h-4 rounded border border-white/10 flex items-center justify-center transition-colors shrink-0",
                                item.completed ? "bg-green-500/20 border-green-500/50 text-green-400" : "hover:border-white/30"
                            )}
                        >
                            {item.completed && <CheckSquare className="w-3 h-3" />}
                        </button>
                        <span className={cn(
                            "text-xs flex-1 truncate transition-all select-none cursor-pointer",
                            item.completed ? "text-muted-foreground line-through opacity-50" : "text-white/80"
                        )} onClick={() => toggleItem(item.id)}>
                            {item.text}
                        </span>
                        <button
                            onClick={() => deleteItem(item.id)}
                            className="opacity-0 group-hover/item:opacity-100 p-0.5 text-red-400/50 hover:text-red-400 transition-opacity shrink-0"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                ))}
            </div>

            {/* Add Input */}
            <div className="mt-2 relative">
                <Plus className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-white/30" />
                <Input
                    placeholder="Add item..."
                    className="bg-black/20 border-white/5 text-xs h-7 pl-7 focus-visible:ring-1 focus-visible:ring-green-500/30 rounded text-white/90 placeholder:text-white/20"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            addItem(e.currentTarget.value);
                            e.currentTarget.value = '';
                        }
                    }}
                />
            </div>
        </div>
    );
};

const AIInsightWidget = () => { // No data needed, purely context driven for now
    const { getContextSummary, analyzeContext } = useUserContext();
    const [summary, setSummary] = useState("Initializing Neural Link...");

    useEffect(() => {
        analyzeContext(); // Trigger analysis on mount
        const timer = setTimeout(() => {
            setSummary(getContextSummary());
        }, 1500); // Fake delay for effect
        return () => clearTimeout(timer);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-indigo-950/20 rounded-2xl border border-indigo-500/20 backdrop-blur-md relative overflow-hidden group">
            {/* Animated Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 animate-pulse" />

            <Sparkles className="w-10 h-10 text-indigo-400 mb-4 animate-bounce duration-[3000ms]" />

            <h4 className="text-sm font-bold text-indigo-200 mb-2 tracking-wide uppercase">AI Context Insight</h4>

            <p className="text-xs text-indigo-100/80 leading-relaxed max-w-[200px] relative z-10 transition-all duration-500">
                {summary}
            </p>

            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent opacity-50" />
        </div>
    );
};

const UniversalBoardViewer = () => {
    const {
        activeBoardId,
        boards,
        updateWidgetOnActiveBoard,
        removeWidgetFromActiveBoard,
        addWidgetToActiveBoard,
        viewMode,
        setViewMode,
    } = useBoardSystem();

    const [isShareOpen, setIsShareOpen] = useState(false); // State for Share Dialog

    const board = boards.find(b => b.id === activeBoardId);

    if (!board) {
        return (
            <div className="h-full flex items-center justify-center text-muted-foreground flex-col gap-4 animate-pulse">
                <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                    <Sparkles className="w-8 h-8 text-indigo-400" />
                </div>
                <div className="text-center">
                    <h3 className="text-lg font-medium text-foreground">No Board Selected</h3>
                    <p className="text-sm text-muted-foreground/60">Create a new board from the sidebar to begin.</p>
                </div>
            </div>
        );
    }

    const isFullscreen = viewMode === "fullscreen";

    // RGL Props
    const layout = board.widgets.map(w => ({
        i: w.i, x: w.x, y: w.y, w: w.w, h: w.h
    }));

    const handleLayoutChange = (newLayout: any[]) => {
        // Placeholder for real-time sync
    };

    const handleDragStop = (layout: any[]) => {
        layout.forEach(item => {
            updateWidgetOnActiveBoard(item.i, { x: item.x, y: item.y, w: item.w, h: item.h });
        });
    };

    // --- Render ---

    const canvasClasses = cn(
        "relative transition-all duration-700 ease-[cubic-bezier(0.25,0.1,0.25,1)]",
        isFullscreen
            ? "fixed inset-0 z-[100] bg-[#0A0A0A] " // Use a solid dark background for focus mode
            : "h-full w-full bg-black/20 rounded-xl border border-white/5 overflow-hidden shadow-2xl"
    );

    return (
        <div className={canvasClasses}>
            {/* Infinite Dot Grid Background */}
            <div className="absolute inset-0 z-0 pointer-events-none opacity-40"
                style={{
                    backgroundImage: `radial-gradient(rgba(255,255,255,0.15) 1px, transparent 1px)`,
                    backgroundSize: '24px 24px',
                    maskImage: 'radial-gradient(circle at center, black 40%, transparent 100%)' // Vignette effect
                }}
            />
            <div className="absolute inset-0 z-0 pointer-events-none opacity-20"
                style={{
                    backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`,
                    backgroundSize: '96px 96px', // Major grid lines
                }}
            />

            {/* Header / Toolbar */}
            <div className={cn(
                "absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 transition-all duration-500",
                isFullscreen ? "translate-y-0 scale-110" : "translate-y-0"
            )}>
                {/* Title Pill */}
                {isFullscreen && (
                    <div className="bg-black/40 backdrop-blur-xl px-5 py-2 rounded-full border border-white/10 shadow-2xl animate-in slide-in-from-top-4 fade-in duration-500">
                        <span className="text-sm font-medium text-white/90 tracking-wide">{board.name}</span>
                    </div>
                )}

                {/* Main Toolbox */}
                <div className="flex items-center gap-3 p-2 rounded-full bg-black/60 backdrop-blur-xl border border-white/10 shadow-2xl ring-1 ring-white/5 group hover:bg-black/70 transition-all">
                    <TooltipButton icon={<Type className="w-4 h-4" />} label="Note" onClick={() => addWidgetToActiveBoard('note')} />
                    <TooltipButton icon={<ImageIcon className="w-4 h-4" />} label="Media" onClick={() => addWidgetToActiveBoard('image')} />
                    <TooltipButton icon={<CheckSquare className="w-4 h-4" />} label="Task" onClick={() => addWidgetToActiveBoard('checklist')} />

                    <div className="w-px h-5 bg-white/10 mx-1" />

                    {/* Share Button (New) */}
                    <TooltipButton icon={<Share2 className="w-4 h-4 text-indigo-300" />} label="Share" onClick={() => setIsShareOpen(true)} />

                    <div className="w-px h-5 bg-white/10 mx-1" />

                    <TooltipButton
                        icon={<Sparkles className="w-4 h-4 text-indigo-400 group-hover:animate-pulse" />}
                        label="AI Insight"
                        onClick={() => addWidgetToActiveBoard('ai')}
                    />
                </div>

                {/* Window Controls */}
                <div className="flex items-center gap-2">
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-10 w-10 rounded-full bg-black/40 hover:bg-white/10 backdrop-blur-md border border-white/10 shadow-lg text-muted-foreground hover:text-white"
                        onClick={() => setViewMode(isFullscreen ? "panel" : "fullscreen")}
                    >
                        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </Button>
                </div>
            </div>

            <ShareBoardDialog open={isShareOpen} onOpenChange={setIsShareOpen} />

            {/* Canvas Area */}
            <div className="h-full w-full overflow-y-auto overflow-x-hidden p-4 pt-24 scrollbar-hide perspective-[1000px]">
                {isRPresent ? (
                    <ResponsiveGridLayout
                        className="layout min-h-[800px]"
                        layouts={{ lg: layout }}
                        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                        cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                        rowHeight={60}
                        width={isFullscreen && typeof window !== 'undefined' ? window.innerWidth : 800}
                        draggableHandle=".drag-handle"
                        margin={[20, 20]} // Increased margin
                        onLayoutChange={handleLayoutChange}
                        onDragStop={handleDragStop}
                        onResizeStop={handleDragStop}
                    >
                        {board.widgets.map((widget) => (
                            <div key={widget.i} className={cn(
                                "group/widget relative bg-[#121212]/80 backdrop-blur-2xl rounded-2xl border border-white/5 shadow-xl transition-all duration-300 hover:shadow-2xl hover:border-white/20 hover:scale-[1.01] overflow-hidden flex flex-col ring-1 ring-black/50 hover:ring-white/10",
                                widget.type === 'note' && "bg-[#1A1A10]/90 hover:border-yellow-500/20",
                                widget.type === 'ai' && "hover:border-indigo-500/30 hover:shadow-indigo-500/20",
                                isFullscreen && "shadow-2xl"
                            )}>
                                {/* Drag Handle (Always visible on hover, subtle otherwise) */}
                                <div className="drag-handle absolute top-0 left-0 right-0 h-6 cursor-move z-20 flex items-center justify-center opacity-0 group-hover/widget:opacity-100 transition-opacity bg-gradient-to-b from-black/40 to-transparent">
                                    <GripHorizontal className="w-8 h-3 text-white/20" />
                                </div>

                                {/* Delete Button */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); removeWidgetFromActiveBoard(widget.i); }}
                                    className="absolute top-1 right-1 z-30 p-1 opacity-0 group-hover/widget:opacity-100 text-white/40 hover:text-red-400 transition-all"
                                >
                                    <X className="w-3 h-3" />
                                </button>

                                {/* Content */}
                                <div className="flex-1 h-full relative z-0">
                                    {widget.type === 'note' && (
                                        <NoteWidget
                                            data={widget.content}
                                            onChange={(updated) => updateWidgetOnActiveBoard(widget.i, { content: updated })}
                                        />
                                    )}
                                    {widget.type === 'image' && (
                                        <MediaWidget
                                            data={widget.content}
                                            onChange={(updated) => updateWidgetOnActiveBoard(widget.i, { content: updated })}
                                        />
                                    )}
                                    {widget.type === 'ai' && (
                                        <AIInsightWidget />
                                    )}
                                    {/* New fallback for checklist if needed, or other types */}
                                    {widget.type === 'checklist' && (
                                        <ChecklistWidget
                                            data={widget.content}
                                            onChange={(updated) => updateWidgetOnActiveBoard(widget.i, { content: updated })}
                                        />
                                    )}
                                </div>
                            </div>
                        ))}
                    </ResponsiveGridLayout>
                ) : (
                    <div className="p-8 text-center text-red-400 bg-red-950/20 rounded-lg border border-red-500/20">
                        Grid Layout Module Failed to Load. Please Refresh.
                    </div>
                )}
            </div>
        </div>
    );
};

// Helper for tooltips
const TooltipButton = ({ icon, label, onClick }: { icon: any, label: string, onClick: () => void }) => (
    <Button
        size="icon"
        variant="ghost"
        className="h-9 w-9 rounded-full text-muted-foreground hover:text-white hover:bg-white/10 transition-colors relative group"
        onClick={onClick}
    >
        {icon}
        <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black/80 text-[10px] px-2 py-0.5 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-white/10">
            {label}
        </span>
    </Button>
)

export default UniversalBoardViewer;
