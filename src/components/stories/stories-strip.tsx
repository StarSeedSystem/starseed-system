// src/components/stories/stories-strip.tsx
'use client';

/**
 * Strip horizontal estética de historias temporales, tipo Instagram pero
 * con opciones extendidas: TTL configurable, contenido ilimitado, archivo
 * permanente para el dueño. Deslizable, con dinamismo, intuitiva.
 *
 * Se usa al inicio del Hub y de cada perfil/página.
 */

import { useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Plus, Archive } from 'lucide-react';
import { useStories, type Story, type StoryOwnerKind } from '@/contexts/stories-context';
import { StoryCreator } from './story-creator';
import { StoriesViewer } from './stories-viewer';
import { Button } from '@/components/ui/button';

interface StoriesStripProps {
  ownerKind: StoryOwnerKind;
  ownerId: string;
  ownerLabel: string;
  /** Si false, no muestra el botón de crear. */
  canCreate?: boolean;
  className?: string;
  /** Variante visual del header. */
  variant?: 'profile' | 'page' | 'hub';
}

export function StoriesStrip({
  ownerKind,
  ownerId,
  ownerLabel,
  canCreate = true,
  className,
  variant = 'profile',
}: StoriesStripProps) {
  const { activeStories, byOwner, archivedStories } = useStories();
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Historias propias del owner + del resto activas (para dar variedad).
  const own = useMemo(
    () => byOwner(ownerKind, ownerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [byOwner, ownerKind, ownerId, activeStories]
  );
  const otros = useMemo(
    () => activeStories.filter(
      (s) => !(s.ownerKind === ownerKind && s.ownerId === ownerId)
    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [activeStories, ownerKind, ownerId]
  );
  const ownArchived = useMemo(
    () => byOwner(ownerKind, ownerId, { includeArchived: true }).filter((s) => s.archived),
    [byOwner, ownerKind, ownerId, archivedStories]
  );

  const visible = showArchive ? [...own, ...ownArchived] : [...own, ...otros];

  return (
    <section className={cn('relative', className)}>
      {/* Encabezado deslizable y estético */}
      <div className="flex items-baseline justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold tracking-wide font-headline bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-purple-300 to-amber-200">
            Historias
          </h3>
          <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">
            {visible.length} {showArchive ? 'en archivo' : 'activas'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {ownArchived.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() => setShowArchive((v) => !v)}
            >
              <Archive className="w-3 h-3 mr-1" />
              {showArchive ? 'Ver activas' : `Archivo (${ownArchived.length})`}
            </Button>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className={cn(
          'group/strip relative flex items-center gap-3 overflow-x-auto py-2 px-1 scrollbar-thin scrollbar-thumb-white/10',
          'snap-x snap-mandatory scroll-smooth',
          // Edge fade
          '[mask-image:linear-gradient(to_right,transparent,black_24px,black_calc(100%-24px),transparent)]'
        )}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {canCreate && (
          <CreateStoryButton variant={variant} onOpen={() => setCreatorOpen(true)} />
        )}
        {visible.map((s, idx) => (
          <StoryBubble
            key={s.id}
            story={s}
            isOwn={s.ownerKind === ownerKind && s.ownerId === ownerId}
            onClick={() => setViewerIndex(idx)}
          />
        ))}
        {visible.length === 0 && !canCreate && (
          <div className="text-[11px] text-muted-foreground/70 italic px-3">
            No hay historias activas todavía.
          </div>
        )}
      </div>

      {creatorOpen && (
        <StoryCreator
          ownerKind={ownerKind}
          ownerId={ownerId}
          ownerLabel={ownerLabel}
          open={creatorOpen}
          onOpenChange={setCreatorOpen}
        />
      )}

      {viewerIndex !== null && (
        <StoriesViewer
          stories={visible}
          initialIndex={viewerIndex}
          open={viewerIndex !== null}
          onOpenChange={(o) => !o && setViewerIndex(null)}
        />
      )}
    </section>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────

function CreateStoryButton({
  variant,
  onOpen,
}: {
  variant: 'profile' | 'page' | 'hub';
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className={cn(
        'snap-start shrink-0 group/btn',
        'flex flex-col items-center gap-1.5 cursor-pointer'
      )}
    >
      <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border-2 border-dashed border-primary/40 bg-gradient-to-br from-purple-500/10 via-cyan-500/5 to-amber-500/10 flex items-center justify-center transition-all duration-300 group-hover/btn:border-primary/80 group-hover/btn:scale-105">
        <Plus className="w-6 h-6 text-primary group-hover/btn:scale-110 transition-transform" />
        <span className="absolute inset-0 rounded-2xl opacity-0 group-hover/btn:opacity-100 bg-gradient-to-tr from-purple-500/20 to-cyan-500/20 transition-opacity blur-md -z-10" aria-hidden />
      </div>
      <span className="text-[10px] text-muted-foreground font-medium">
        {variant === 'hub' ? 'Anunciar' : variant === 'page' ? 'Publicar' : 'Crear'}
      </span>
    </button>
  );
}

function StoryBubble({
  story,
  isOwn,
  onClick,
}: {
  story: Story;
  isOwn: boolean;
  onClick: () => void;
}) {
  const isViewed = story.viewedBy.length > 0;
  const ring = isOwn
    ? 'from-amber-400 to-purple-400'
    : isViewed
    ? 'from-white/20 to-white/10'
    : 'from-cyan-400 via-purple-400 to-pink-400';

  const bgStyle = useMemo(() => {
    const bg = story.background;
    if (!bg) return { background: 'rgba(0,0,0,0.4)' };
    if (typeof bg === 'string') return { background: bg };
    return {
      background: bg.via
        ? `linear-gradient(135deg, ${bg.from}, ${bg.via}, ${bg.to})`
        : `linear-gradient(135deg, ${bg.from}, ${bg.to})`,
    };
  }, [story.background]);

  return (
    <button onClick={onClick} className="snap-start shrink-0 group/bub flex flex-col items-center gap-1.5 cursor-pointer">
      <div className={cn('relative p-[2.5px] rounded-2xl bg-gradient-to-br', ring)}>
        <div
          className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border border-black/40 flex items-center justify-center"
          style={bgStyle}
        >
          {story.media === 'image' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={story.content} alt={story.caption ?? ''} className="w-full h-full object-cover" />
          )}
          {story.media === 'text' && (
            <span className="px-1.5 text-[9px] sm:text-[10px] text-white/95 text-center font-bold line-clamp-3 leading-tight drop-shadow-md">
              {story.content.length > 28 ? story.content.slice(0, 25) + '…' : story.content}
            </span>
          )}
          {story.media === 'video' && (
            <div className="text-white/80 text-[10px]">▶</div>
          )}
          {story.media === 'file' && <div className="text-white/80 text-[10px]">📎</div>}
          {story.media === 'scheduled-post' && <div className="text-white/80 text-[10px]">⏱</div>}
          {story.media === 'link' && <div className="text-white/80 text-[10px]">🔗</div>}

          {story.category && (
            <span
              className="absolute top-1 left-1 text-[7px] px-1 py-[1px] rounded-full font-bold uppercase tracking-wider"
              style={{
                background: 'rgba(0,0,0,0.55)',
                color: story.categoryColor ?? '#fff',
              }}
            >
              {story.category}
            </span>
          )}

          {story.archived && (
            <span className="absolute bottom-1 right-1 text-[8px] px-1 py-[1px] rounded-full bg-black/60 text-white/70">
              archivada
            </span>
          )}
        </div>
      </div>
      <span className="text-[10px] text-foreground/80 font-medium truncate w-16 sm:w-20 text-center">
        {story.ownerLabel}
      </span>
    </button>
  );
}
