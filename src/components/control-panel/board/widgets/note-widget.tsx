import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Eye, Edit2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface NoteWidgetProps {
    data: {
        title?: string;
        text?: string;
    };
    onChange: (data: any) => void;
}

export function NoteWidget({ data, onChange }: NoteWidgetProps) {
    const [isEditing, setIsEditing] = useState(!data.text); // Default to edit if empty

    return (
        <div className="h-full flex flex-col bg-yellow-100/10 p-4 rounded-lg border border-yellow-200/20 backdrop-blur-sm shadow-sm transition-all hover:shadow-md hover:bg-yellow-100/15 group/note relative">

            {/* Toolbar */}
            <div className="absolute top-2 right-8 z-20 flex gap-1 opacity-0 group-hover/note:opacity-100 transition-opacity">
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 rounded-full bg-black/10 hover:bg-black/20 hover:text-white"
                    onClick={() => setIsEditing(!isEditing)}
                >
                    {isEditing ? <Eye className="w-3 h-3" /> : <Edit2 className="w-3 h-3" />}
                </Button>
            </div>

            {/* Title Input */}
            <Input
                value={data.title || ""}
                onChange={(e) => onChange({ ...data, title: e.target.value })}
                placeholder="Untitled Note"
                className="bg-transparent border-none text-lg font-bold placeholder:text-yellow-500/40 mb-2 focus-visible:ring-0 px-0 h-auto py-1 shadow-none text-yellow-50/90"
            />

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative min-h-0">
                {isEditing ? (
                    <Textarea
                        value={data.text || ""}
                        onChange={(e) => onChange({ ...data, text: e.target.value })}
                        placeholder="Type markdown here... (**bold**, - list)"
                        className="w-full h-full bg-transparent border-none resize-none text-sm focus-visible:ring-0 px-0 py-0 leading-relaxed font-mono text-muted-foreground/80 placeholder:text-white/10"
                        autoFocus
                    />
                ) : (
                    <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed overflow-y-auto h-full scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pr-2 break-words text-white/80">
                        <ReactMarkdown>{data.text || "*Empty note*"}</ReactMarkdown>
                    </div>
                )}
            </div>
        </div>
    );
}
