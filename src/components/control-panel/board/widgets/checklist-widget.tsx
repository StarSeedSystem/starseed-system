import React from "react";
import { Input } from "@/components/ui/input";
import { ChevronUp, ChevronDown, CheckSquare, X, Plus } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { cn } from "@/lib/utils";

interface ChecklistItem {
    id: string;
    text: string;
    completed: boolean;
}

interface ChecklistWidgetProps {
    data: {
        title?: string;
        items?: ChecklistItem[];
    };
    onChange: (data: any) => void;
}

export function ChecklistWidget({ data, onChange }: ChecklistWidgetProps) {
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
        onChange({ ...data, items: items.filter((i) => i.id !== id) }); // Correct logic applied
    };

    // Calculate progress
    const completedCount = items.filter((i) => i.completed).length;
    const progress = items.length > 0 ? (completedCount / items.length) * 100 : 0;

    return (
        <div className="h-full flex flex-col bg-green-950/10 p-4 rounded-lg border border-green-500/10 backdrop-blur-sm shadow-sm transition-all hover:bg-green-950/20 group/checklist relative hover:shadow-green-900/10 hover:border-green-500/20">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <Input
                    value={data.title || "Checklist"}
                    onChange={(e) => onChange({ ...data, title: e.target.value })}
                    className="bg-transparent border-none text-base font-bold placeholder:text-green-500/50 focus-visible:ring-0 px-0 h-auto py-0 shadow-none text-green-100/90"
                />
                <span className="text-[10px] font-mono text-green-400/80">{Math.round(progress)}%</span>
            </div>

            {/* Progress Bar */}
            <div className="h-1 w-full bg-black/20 rounded-full overflow-hidden mb-4">
                <div
                    className="h-full bg-green-500/50 transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 pr-1 gap-1.5 flex flex-col min-h-0">
                {items.length === 0 && (
                    <div className="text-[11px] text-muted-foreground text-center py-6 italic opacity-50 flex flex-col items-center">
                        <CheckSquare className="w-8 h-8 opacity-20 mb-2" />
                        <span>Add tasks below...</span>
                    </div>
                )}
                {items.map((item, index) => (
                    <div key={item.id} className="flex items-center gap-2 group/item min-h-[28px]">
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
                                className="h-3 w-3 flex items-center justify-center hover:text-white disabled:opacity-0"
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
                                className="h-3 w-3 flex items-center justify-center hover:text-white disabled:opacity-0"
                            >
                                <ChevronDown className="w-2 h-2" />
                            </button>
                        </div>

                        <button
                            onClick={() => toggleItem(item.id)}
                            className={cn(
                                "w-4 h-4 rounded border border-white/10 flex items-center justify-center transition-all shrink-0 active:scale-95",
                                item.completed
                                    ? "bg-green-500/20 border-green-500/50 text-green-400"
                                    : "hover:border-white/30 hover:bg-white/5"
                            )}
                        >
                            {item.completed && <CheckSquare className="w-3 h-3" />}
                        </button>

                        <span className={cn(
                            "text-sm flex-1 truncate transition-all select-none cursor-pointer",
                            item.completed ? "text-muted-foreground line-through opacity-50 decoration-green-500/30" : "text-white/80"
                        )} onClick={() => toggleItem(item.id)}>
                            {item.text}
                        </span>

                        <button
                            onClick={() => deleteItem(item.id)}
                            className="opacity-0 group-hover/item:opacity-100 p-1 text-red-400/50 hover:text-red-400 transition-opacity shrink-0"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                ))}
            </div>

            {/* Add Input */}
            <div className="mt-3 relative group/input">
                <Plus className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30 group-focus-within/input:text-green-400 transition-colors" />
                <Input
                    placeholder="Add item..."
                    className="bg-black/20 border-white/5 text-xs h-8 pl-8 focus-visible:ring-1 focus-visible:ring-green-500/30 rounded text-white/90 placeholder:text-white/20 transition-all hover:bg-black/30"
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
}
