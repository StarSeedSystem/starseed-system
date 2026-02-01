import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link as LinkIcon, Video, X } from "lucide-react";

interface MediaWidgetProps {
    data: {
        url?: string;
    };
    onChange: (data: any) => void;
}

export function MediaWidget({ data, onChange }: MediaWidgetProps) {
    const [urlInput, setUrlInput] = useState("");

    // Helper to detect type
    const getMediaType = (url: string) => {
        if (!url) return 'empty';
        if (url.match(/^(https?\:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/)) return 'youtube';
        return 'image'; // Default to image
    };

    const type = getMediaType(data.url || "");

    const getYouTubeId = (url: string) => {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    };

    const handleSave = () => {
        if (urlInput) onChange({ ...data, url: urlInput });
    };

    return (
        <div className="h-full w-full relative group overflow-hidden bg-black/20 flex flex-col">

            {type === 'empty' && (
                <div className="flex flex-col items-center justify-center h-full space-y-4 p-6 animate-in fade-in duration-500">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shadow-lg group-hover:scale-110 transition-transform duration-500">
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
                        <p className="text-[10px] text-muted-foreground text-center opacity-60">
                            Supports JPG, PNG, GIF, YouTube
                        </p>
                    </div>
                </div>
            )}

            {type === 'image' && (
                <div className="relative w-full h-full bg-black/50 flex items-center justify-center group-hover:bg-black/40 transition-colors">
                    <img
                        src={data.url}
                        alt="Media"
                        className="w-full h-full object-cover pointer-events-none select-none relative z-10 transition-transform duration-700 group-hover:scale-105"
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
                        src={`https://www.youtube.com/embed/${getYouTubeId(data.url || "")}?modestbranding=1&rel=0`}
                        title="YouTube video player"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="pointer-events-auto relative z-20 w-full h-full"
                    ></iframe>
                </div>
            )}

            {/* Clear/Reset Action (Top Right, distinct from Container Delete) */}
            {type !== 'empty' && (
                <div className="absolute top-2 right-8 z-30 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 bg-black/50 hover:bg-black/80 text-white/70 hover:text-white rounded-full backdrop-blur-md border border-white/5"
                        onClick={() => onChange({ ...data, url: "" })}
                        title="Change Media"
                    >
                        <LinkIcon className="w-3 h-3" />
                    </Button>
                </div>
            )}
        </div>
    );
}
