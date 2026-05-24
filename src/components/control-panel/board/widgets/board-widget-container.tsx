import React from "react";
import { cn } from "@/lib/utils";
import { X, GripHorizontal } from "lucide-react";
import { TiltCard } from "@/components/ui/tilt-card";

interface BoardWidgetContainerProps {
    children: React.ReactNode;
    selected?: boolean;
    onDelete?: () => void;
    className?: string;
    type?: string;
}

export function BoardWidgetContainer({
    children,
    selected,
    onDelete,
    className,
    type
}: BoardWidgetContainerProps) {
    return (
        <TiltCard
            intensity={12}
            className={cn(
                "group/widget relative h-full flex flex-col",
                "bg-[#121212]/80 backdrop-blur-2xl rounded-2xl border border-white/5 shadow-xl",
                "transition-all duration-300 hover:shadow-2xl hover:border-white/20 hover:scale-[1.01] overflow-hidden",
                "ring-1 ring-black/50 hover:ring-white/10",
                selected && "ring-2 ring-primary/50 border-primary/30 shadow-primary/10",
                type === 'note' && "bg-[#1A1A10]/90 hover:border-yellow-500/20",
                type === 'ai' && "hover:border-indigo-500/30 hover:shadow-indigo-500/20",
                className
            )}
        >
            {/* Drag Handle (Always visible on hover, subtle otherwise) */}
            <div className="drag-handle absolute top-0 left-0 right-0 h-6 cursor-move z-20 flex items-center justify-center opacity-0 group-hover/widget:opacity-100 transition-opacity bg-gradient-to-b from-black/40 to-transparent">
                <GripHorizontal className="w-8 h-3 text-white/20" />
            </div>

            {/* Delete Button */}
            {onDelete && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                    className="absolute top-1 right-1 z-30 p-1 opacity-0 group-hover/widget:opacity-100 text-white/40 hover:text-red-400 transition-all rounded-full hover:bg-white/5"
                >
                    <X className="w-3 h-3" />
                </button>
            )}

            {/* Content Container */}
            <div className="flex-1 h-full relative z-0 min-h-0">
                {children}
            </div>
        </TiltCard>
    );
}
