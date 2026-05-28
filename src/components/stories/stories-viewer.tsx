// src/components/stories/stories-viewer.tsx
'use client';

/**
 * Viewer fullscreen para historias temporales. Estilo Instagram pero con
 * controles avanzados: pausar, extender TTL, ver visualizaciones, archivar.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Pause, Play, Eye, Clock, Trash2 } from 'lucide-react';
import { useStories, type Story } from '@/contexts/stories-context';
import { toast } from 'sonner';

interface StoriesViewerProps {
  stories: Story[];
  initialIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PROGRESS_MS = 5000; // 5 segundos por historia por defecto

export function StoriesViewer({ stories, initialIndex, open, onOpenChange }: StoriesViewerProps) {
  const { markViewed, extendTTL, removeStory } = useStories();
  const [index, setIndex] = useState(initialIndex);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(Date.now());

  useEffect(() => { setIndex(initialIndex); }, [initialIndex]);

  const current = stories[index];

  useEffect(() => {
    if (!open || !current) return;
    markViewed(current.id, 'me');
    setElapsed(0);
    startRef.current = Date.now();
  }, [current?.id, open, markViewed]);

  useEffect(() => {
    if (!open || paused) return;
    const id = window.setInterval(() => {
      const e = Date.now() - startRef.current;
      setElapsed(e);
      if (e >= PROGRESS_MS) {
        if (index < stories.length - 1) {
          setIndex((i) => i + 1);
          startRef.current = Date.now();
          setElapsed(0);
        } else {
          onOpenChange(false);
        }
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [open, paused, index, stories.length, onOpenChange]);

  if (!current) return null;

  const bgStyle = useMemo(() => {
    const bg = current.background;
    if (!bg) return { background: 'rgba(0,0,0,0.9)' };
    if (typeof bg === 'string') return { background: bg };
    return {
      background: bg.via
        ? `linear-gradient(135deg, ${bg.from}, ${bg.via}, ${bg.to})`
        : `linear-gradient(135deg, ${bg.from}, ${bg.to})`,
    };
  }, [current.background]);

  const remainingMs = new Date(current.expiresAt).getTime() - Date.now();
  const remainingHours = Math.max(0, Math.round(remainingMs / 3_600_000));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-0 bg-transparent shadow-none">
        <div className="relative aspect-[9/16] rounded-2xl overflow-hidden" style={bgStyle}>
          {/* Barras de progreso superiores */}
          <div className="absolute top-2 left-2 right-2 flex gap-1 z-20">
            {stories.map((_, i) => {
              const filled = i < index ? 1 : i === index ? Math.min(elapsed / PROGRESS_MS, 1) : 0;
              return (
                <div key={i} className="flex-1 h-0.5 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white"
                    style={{ width: `${filled * 100}%`, transition: 'width 100ms linear' }}
                  />
                </div>
              );
            })}
          </div>

          {/* Header con owner */}
          <div className="absolute top-6 left-3 right-3 flex items-center gap-2 z-20">
            <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-xs font-bold text-white">
              {current.ownerLabel[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">{current.ownerLabel}</p>
              <p className="text-[10px] text-white/70 truncate">
                {current.archived ? 'En archivo' : `Caduca en ${remainingHours}h`}
              </p>
            </div>
            {current.category && (
              <Badge variant="outline" className="text-[9px] border-white/30 text-white bg-black/30">
                {current.category}
              </Badge>
            )}
          </div>

          {/* Contenido */}
          <div className="absolute inset-0 flex items-center justify-center p-6 pt-16 pb-20">
            {current.media === 'text' && (
              <p className="text-white text-center font-bold text-xl leading-tight drop-shadow-lg">
                {current.content}
              </p>
            )}
            {current.media === 'image' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.content} alt={current.caption ?? ''} className="max-w-full max-h-full object-contain" />
            )}
            {current.media === 'video' && (
              <video src={current.content} autoPlay controls className="max-w-full max-h-full" />
            )}
            {(current.media === 'file' || current.media === 'link' || current.media === 'scheduled-post') && (
              <div className="text-white text-center">
                <p className="text-3xl mb-2">
                  {current.media === 'file' ? '📎' : current.media === 'link' ? '🔗' : '⏱'}
                </p>
                <a href={current.content} target="_blank" rel="noreferrer" className="text-xs underline break-all">
                  {current.content}
                </a>
              </div>
            )}
          </div>

          {/* Caption */}
          {current.caption && (
            <div className="absolute bottom-12 left-3 right-3 z-20">
              <p className="text-white text-sm bg-black/40 backdrop-blur px-3 py-2 rounded-xl">
                {current.caption}
              </p>
            </div>
          )}

          {/* Controles inferiores */}
          <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1 z-20">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white hover:bg-white/10"
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] text-white hover:bg-white/10"
              onClick={() => { extendTTL(current.id, 24); toast.success('+24h añadidas.'); }}
            >
              <Clock className="w-3 h-3 mr-1" /> +24h
            </Button>
            <span className="text-[10px] text-white/70 ml-1 flex items-center gap-1">
              <Eye className="w-3 h-3" /> {current.viewedBy.length}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white/70 hover:bg-white/10"
                onClick={() => {
                  if (!confirm('¿Eliminar esta historia?')) return;
                  removeStory(current.id);
                  toast.success('Historia eliminada.');
                  onOpenChange(false);
                }}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {/* Navegación */}
          <button
            className="absolute left-0 top-0 bottom-0 w-1/3 z-10"
            onClick={() => {
              if (index > 0) { setIndex(index - 1); startRef.current = Date.now(); setElapsed(0); }
            }}
            aria-label="Anterior"
          >
            <ChevronLeft className="absolute left-2 top-1/2 -translate-y-1/2 w-5 h-5 text-white/0 hover:text-white/70 transition-colors" />
          </button>
          <button
            className="absolute right-0 top-0 bottom-0 w-1/3 z-10"
            onClick={() => {
              if (index < stories.length - 1) { setIndex(index + 1); startRef.current = Date.now(); setElapsed(0); }
              else onOpenChange(false);
            }}
            aria-label="Siguiente"
          >
            <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 text-white/0 hover:text-white/70 transition-colors" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
