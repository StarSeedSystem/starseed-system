"use client";

import { BoardWidgetContainer } from "./widgets/board-widget-container";
import { NoteWidget } from "./widgets/note-widget";
import { MediaWidget } from "./widgets/media-widget";
import { ChecklistWidget } from "./widgets/checklist-widget";
import { AIInsightWidget } from "./widgets/ai-insight-widget";
import { UniversalRegistryWidget } from "./widgets/universal-registry-widget";

// ... existing imports ...
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
    ChevronDown,
    Activity // Added for new button
} from "lucide-react";
import { ShareBoardDialog } from "./share-board-dialog";
import { Button } from "@/components/ui/button";

// Safe import for RGL with Next.js/Turbopack
const RGL = require("react-grid-layout");
const AvailableWidthProvider = RGL.WidthProvider || RGL.default?.WidthProvider;
const AvailableResponsive = RGL.Responsive || RGL.default?.Responsive;

const ResponsiveGridLayout = (typeof window !== "undefined" && AvailableWidthProvider && AvailableResponsive)
    ? AvailableWidthProvider(AvailableResponsive)
    : (AvailableResponsive || "div");

const isRPresent = !!AvailableResponsive;

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

    const [isShareOpen, setIsShareOpen] = useState(false);
    const board = boards.find(b => b.id === activeBoardId);

    // Helper to add a "Universal" widget (e.g., Political Summary)
    const addUniversalWidget = () => {
        // We hijack the 'addWidgetToActiveBoard' or manually add it if the context supports it. 
        // For now, we'll assume we can pass a special type or we might need to extend the context later.
        // Since `addWidgetToActiveBoard` takes a string type, let's pass 'POLITICAL_SUMMARY' 
        // effectively treating it as a new type string.
        addWidgetToActiveBoard('POLITICAL_SUMMARY');
    };

    // Quick fix: Map 'POLITICAL_SUMMARY' to a known type or handle it in the render
    // Ideally, the board context's `addWidgetToActiveBoard` should accept any string. 
    // If it restricts types, we might need to modify `board-context.tsx`. 
    // Assuming it accepts string for now based on previous usage.

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
        "relative transition-all duration-700 ease-out",
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

                    {/* Universal Widget Test Button */}
                    <TooltipButton icon={<Activity className="w-4 h-4 text-purple-400" />} label="Metric" onClick={addUniversalWidget} />

                    <div className="w-px h-5 bg-white/10 mx-1" />

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
                        margin={[20, 20]}
                        onLayoutChange={handleLayoutChange}
                        onDragStop={handleDragStop}
                        onResizeStop={handleDragStop}
                    >
                        {board.widgets.map((widget) => {
                            // Determine if it's a known board widget type or a universal dashboard type
                            const isBoardSpecific = ['note', 'image', 'checklist', 'ai'].includes(widget.type);
                            const content = (
                                <>
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
                                    {widget.type === 'checklist' && (
                                        <ChecklistWidget
                                            data={widget.content}
                                            onChange={(updated) => updateWidgetOnActiveBoard(widget.i, { content: updated })}
                                        />
                                    )}
                                    {widget.type === 'ai' && (
                                        <AIInsightWidget />
                                    )}
                                    {/* Universal / Dashboard Widget Fallback */}
                                    {!isBoardSpecific && (
                                        <UniversalRegistryWidget type={widget.type} />
                                    )}
                                </>
                            );

                            return (
                                <div key={widget.i}>
                                    <BoardWidgetContainer
                                        type={widget.type}
                                        onDelete={() => removeWidgetFromActiveBoard(widget.i)}
                                    >
                                        {content}
                                    </BoardWidgetContainer>
                                </div>
                            );
                        })}
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
