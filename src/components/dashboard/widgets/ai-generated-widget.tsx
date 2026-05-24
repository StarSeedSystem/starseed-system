'use client';

import { useState } from 'react';
import { DashboardWidget, AiWidgetSettings } from '../dashboard-types';
import { Sparkles, Pencil, Maximize2, Minimize2 } from 'lucide-react';

interface AiGeneratedWidgetProps {
    widget: DashboardWidget;
    onEditRequest?: (widget: DashboardWidget) => void;
}

export function AiGeneratedWidget({ widget, onEditRequest }: AiGeneratedWidgetProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const settings = widget.settings as Partial<AiWidgetSettings>;

    const config = settings?.widgetConfig || {
        opacity: 0.4,
        blur: 16,
        borderRadius: 32,
        glowIntensity: 20,
        scale: 1,
        rotateX: 0,
        rotateY: 0,
        animationStiffness: 100,
        animationDamping: 20,
    };

    const ontology = settings?.ontology || {
        title: 'Widget IA',
        description: 'Widget generado por La Fragua',
        themeColor: '#8b5cf6',
    };

    const customHtml = settings?.customHtml || '';

    if (!customHtml) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6 bg-card/60 backdrop-blur-sm rounded-3xl">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-indigo-400" />
                </div>
                <div className="text-center space-y-1">
                    <h3 className="font-semibold text-foreground/80">Widget IA vacío</h3>
                    <p className="text-xs text-muted-foreground">
                        Abre La Fragua para diseñar este widget
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div
            className="relative h-full w-full overflow-hidden group"
            style={{
                '--widget-opacity': config.opacity,
                '--widget-blur': config.blur,
                '--widget-radius': config.borderRadius,
                filter: `drop-shadow(0 0 ${config.glowIntensity}px ${ontology.themeColor}40)`,
                transform: `scale(${config.scale}) rotateX(${config.rotateX}deg) rotateY(${config.rotateY}deg)`,
                transition: 'transform 0.3s ease, filter 0.3s ease',
                perspective: '1200px',
            } as React.CSSProperties}
        >
            {/* Rendered AI Widget */}
            <div
                className="h-full w-full text-white overflow-auto"
                dangerouslySetInnerHTML={{ __html: customHtml }}
            />

            {/* Edit Overlay — appears on hover */}
            <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center gap-1.5 z-20">
                <div
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider"
                    style={{
                        background: `${ontology.themeColor}20`,
                        border: `1px solid ${ontology.themeColor}40`,
                        color: ontology.themeColor,
                    }}
                >
                    <Sparkles className="w-3 h-3" />
                    {ontology.title}
                </div>
            </div>

            {/* Action buttons overlay */}
            <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center gap-1.5 z-20">
                {onEditRequest && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onEditRequest(widget);
                        }}
                        className="p-1.5 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-white/70 hover:text-white hover:bg-black/80 transition-all"
                        title="Editar con IA"
                    >
                        <Pencil className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
}
