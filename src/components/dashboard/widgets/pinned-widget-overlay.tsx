'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    Pin, PinOff, GripVertical, Maximize2, Minimize2, X
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PinnedWidget {
    id: string;
    htmlCode: string;
    title: string;
    themeColor: string;
    position: { x: number; y: number; width: number; height: number };
    isMinimized?: boolean;
}

const STORAGE_KEY = 'starseed_pinned_widgets';

function loadPinnedWidgets(): PinnedWidget[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function savePinnedWidgets(widgets: PinnedWidget[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
}

export function usePinnedWidgets() {
    const [pinnedWidgets, setPinnedWidgets] = useState<PinnedWidget[]>([]);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setPinnedWidgets(loadPinnedWidgets());
        setMounted(true);

        // Listen for storage changes (from dashboard pin actions)
        const handleStorageEvent = () => {
            setPinnedWidgets(loadPinnedWidgets());
        };
        window.addEventListener('storage', handleStorageEvent);
        return () => window.removeEventListener('storage', handleStorageEvent);
    }, []);

    const pinWidget = useCallback((widget: Omit<PinnedWidget, 'position'>) => {
        setPinnedWidgets(prev => {
            if (prev.find(w => w.id === widget.id)) return prev;

            const wWidth = 400;
            const wHeight = 320;
            let targetX = 60 + prev.length * 30;
            let targetY = 60 + prev.length * 30;

            if (typeof window !== 'undefined') {
                targetX = Math.max(20, Math.min(window.innerWidth - wWidth - 20, targetX));
                targetY = Math.max(20, Math.min(window.innerHeight - wHeight - 20, targetY));
            }

            const newWidgets = [...prev, {
                ...widget,
                position: {
                    x: targetX,
                    y: targetY,
                    width: wWidth,
                    height: wHeight,
                }
            }];
            savePinnedWidgets(newWidgets);
            return newWidgets;
        });
    }, []);

    const unpinWidget = useCallback((id: string) => {
        setPinnedWidgets(prev => {
            const newWidgets = prev.filter(w => w.id !== id);
            savePinnedWidgets(newWidgets);
            return newWidgets;
        });
    }, []);

    const updatePosition = useCallback((id: string, position: Partial<PinnedWidget['position']>) => {
        setPinnedWidgets(prev => {
            const newWidgets = prev.map(w => w.id === id ? { ...w, position: { ...w.position, ...position } } : w);
            savePinnedWidgets(newWidgets);
            return newWidgets;
        });
    }, []);

    const toggleMinimize = useCallback((id: string) => {
        setPinnedWidgets(prev => {
            const newWidgets = prev.map(w => w.id === id ? { ...w, isMinimized: !w.isMinimized } : w);
            savePinnedWidgets(newWidgets);
            return newWidgets;
        });
    }, []);

    return { pinnedWidgets, pinWidget, unpinWidget, updatePosition, toggleMinimize, mounted };
}

// ─── FLOATING PINNED WIDGET ──────────────────────────
function FloatingWidget({
    widget,
    onUnpin,
    onUpdatePosition,
    onToggleMinimize,
}: {
    widget: PinnedWidget;
    onUnpin: () => void;
    onUpdatePosition: (pos: Partial<PinnedWidget['position']>) => void;
    onToggleMinimize: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });
    const resizeRef = useRef({ isResizing: false, startX: 0, startY: 0, origW: 0, origH: 0 });

    const { x, y, width, height } = widget.position;

    // ───── DRAG ─────
    const handleDragStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = { isDragging: true, startX: e.clientX, startY: e.clientY, origX: x, origY: y };

        const handleMove = (ev: MouseEvent) => {
            if (!dragRef.current.isDragging) return;
            const dx = ev.clientX - dragRef.current.startX;
            const dy = ev.clientY - dragRef.current.startY;
            const currentW = widget.isMinimized ? 240 : width;
            const currentH = widget.isMinimized ? 48 : height;
            onUpdatePosition({
                x: Math.max(0, Math.min(window.innerWidth - currentW, dragRef.current.origX + dx)),
                y: Math.max(0, Math.min(window.innerHeight - currentH, dragRef.current.origY + dy)),
            });
        };
        const handleUp = () => {
            dragRef.current.isDragging = false;
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
    }, [x, y, width, height, widget.isMinimized, onUpdatePosition]);

    // ───── RESIZE ─────
    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        resizeRef.current = { isResizing: true, startX: e.clientX, startY: e.clientY, origW: width, origH: height };

        const handleMove = (ev: MouseEvent) => {
            if (!resizeRef.current.isResizing) return;
            const dx = ev.clientX - resizeRef.current.startX;
            const dy = ev.clientY - resizeRef.current.startY;
            const maxW = window.innerWidth - x;
            const maxH = window.innerHeight - y;
            onUpdatePosition({
                width: Math.max(200, Math.min(maxW, resizeRef.current.origW + dx)),
                height: Math.max(120, Math.min(maxH, resizeRef.current.origH + dy)),
            });
        };
        const handleUp = () => {
            resizeRef.current.isResizing = false;
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
    }, [x, y, width, height, onUpdatePosition]);

    return (
        <div
            ref={ref}
            className="fixed z-[9999] group"
            style={{
                left: x,
                top: y,
                width: widget.isMinimized ? 240 : width,
                height: widget.isMinimized ? 48 : height,
                transition: widget.isMinimized ? 'all 0.35s cubic-bezier(0.16,1,0.3,1)' : 'width 0.35s, height 0.35s',
            }}
        >
            {/* Glass background */}
            <div className={cn(
                "absolute inset-0 rounded-2xl overflow-hidden",
                widget.isMinimized ? "rounded-full" : ""
            )} style={{
                background: 'rgba(10, 10, 20, 0.88)',
                backdropFilter: 'blur(20px)',
                border: `1px solid ${widget.themeColor}30`,
                boxShadow: `0 8px 40px rgba(0,0,0,0.5), 0 0 20px ${widget.themeColor}15`,
            }} />

            {/* Title bar */}
            <div
                className="relative z-10 flex items-center justify-between h-10 px-3 cursor-grab active:cursor-grabbing select-none"
                onMouseDown={handleDragStart}
            >
                <div className="flex items-center gap-2 min-w-0">
                    <GripVertical className="w-3.5 h-3.5 text-white/20 shrink-0" />
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: widget.themeColor }} />
                    <span className="text-[11px] text-white/60 truncate font-mono">{widget.title}</span>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={onToggleMinimize}
                        className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                    >
                        {widget.isMinimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
                    </button>
                    <button
                        onClick={onUnpin}
                        className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
                    >
                        <X className="w-3 h-3" />
                    </button>
                </div>
            </div>

            {/* Content */}
            {!widget.isMinimized && (
                <div
                    className="relative z-10 px-3 pb-3 overflow-auto"
                    style={{ height: `calc(100% - 40px)` }}
                >
                    <div
                        className="text-white w-full h-full"
                        style={{
                            '--widget-opacity': '0.85',
                            '--widget-blur': '12',
                            '--widget-radius': '16',
                        } as React.CSSProperties}
                        dangerouslySetInnerHTML={{ __html: widget.htmlCode }}
                    />
                </div>
            )}

            {/* Resize handle (bottom-right) */}
            {!widget.isMinimized && (
                <div
                    className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize z-20 opacity-0 group-hover:opacity-100 transition-opacity"
                    onMouseDown={handleResizeStart}
                >
                    <svg width="12" height="12" viewBox="0 0 12 12" className="absolute bottom-1.5 right-1.5 text-white/20">
                        <path d="M11 1v10H1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                </div>
            )}
        </div>
    );
}

// ─── OVERLAY (renders all pinned widgets) ──────────────
export function PinnedWidgetOverlay() {
    const { pinnedWidgets, unpinWidget, updatePosition, toggleMinimize, mounted } = usePinnedWidgets();

    if (!mounted || pinnedWidgets.length === 0) return null;

    return (
        <>
            {pinnedWidgets.map(widget => (
                <FloatingWidget
                    key={widget.id}
                    widget={widget}
                    onUnpin={() => unpinWidget(widget.id)}
                    onUpdatePosition={(pos) => updatePosition(widget.id, pos)}
                    onToggleMinimize={() => toggleMinimize(widget.id)}
                />
            ))}
        </>
    );
}
