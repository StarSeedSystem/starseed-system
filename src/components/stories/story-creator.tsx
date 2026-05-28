// src/components/stories/story-creator.tsx
'use client';

/**
 * Creador de historias temporales con opciones ilimitadas:
 *   - Cualquier tipo de contenido (texto, imagen, vídeo, archivo, post programado, link)
 *   - TTL elegible (presets + custom)
 *   - Fondo gradiente personalizable
 *   - Categoría, glyph y color de etiqueta
 *   - Visibilidad (red / seguidores / privada)
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Type, Image as ImageIcon, Film, File as FileIcon, CalendarClock, Link2 } from 'lucide-react';
import {
  useStories,
  STORY_TTL_PRESETS,
  STORY_GRADIENTS,
  type StoryMediaKind,
  type StoryOwnerKind,
} from '@/contexts/stories-context';
import { toast } from 'sonner';

interface StoryCreatorProps {
  ownerKind: StoryOwnerKind;
  ownerId: string;
  ownerLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StoryCreator({ ownerKind, ownerId, ownerLabel, open, onOpenChange }: StoryCreatorProps) {
  const { addStory } = useStories();
  const [media, setMedia] = useState<StoryMediaKind>('text');
  const [content, setContent] = useState('');
  const [caption, setCaption] = useState('');
  const [gradientIdx, setGradientIdx] = useState(0);
  const [ttlHours, setTtlHours] = useState(24);
  const [category, setCategory] = useState('');
  const [categoryColor, setCategoryColor] = useState('#a78bfa');
  const [visibility, setVisibility] = useState<'red' | 'seguidores' | 'privada'>('red');

  const publish = () => {
    if (!content.trim() && media === 'text') {
      toast.error('Escribe el texto de la historia.');
      return;
    }
    if (!content.trim() && media !== 'text') {
      toast.error('Indica la URL/ruta del contenido.');
      return;
    }
    const expiresAt = new Date(Date.now() + ttlHours * 3_600_000).toISOString();
    addStory({
      ownerKind,
      ownerId,
      ownerLabel,
      media,
      content: content.trim(),
      caption: caption.trim() || undefined,
      background: STORY_GRADIENTS[gradientIdx].gradient,
      expiresAt,
      category: category.trim() || undefined,
      categoryColor: category.trim() ? categoryColor : undefined,
      visibility,
    });
    toast.success(`Historia publicada por ${ttlHours} horas.`);
    onOpenChange(false);
    setContent('');
    setCaption('');
    setCategory('');
  };

  const grad = STORY_GRADIENTS[gradientIdx].gradient;
  const previewStyle = {
    background: grad.via
      ? `linear-gradient(135deg, ${grad.from}, ${grad.via}, ${grad.to})`
      : `linear-gradient(135deg, ${grad.from}, ${grad.to})`,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nueva historia · {ownerLabel}</DialogTitle>
          <DialogDescription className="text-xs">
            Configura tipo, duración, fondo, categoría y visibilidad. TTL desde 1 hora hasta 30 días.
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-[1fr_240px] gap-4">
          <div className="space-y-3">
            <Tabs value={media} onValueChange={(v) => setMedia(v as StoryMediaKind)}>
              <TabsList className="w-full grid grid-cols-6">
                <TabsTrigger value="text" className="text-xs gap-1"><Type className="w-3 h-3" /> Texto</TabsTrigger>
                <TabsTrigger value="image" className="text-xs gap-1"><ImageIcon className="w-3 h-3" /> Imagen</TabsTrigger>
                <TabsTrigger value="video" className="text-xs gap-1"><Film className="w-3 h-3" /> Vídeo</TabsTrigger>
                <TabsTrigger value="file" className="text-xs gap-1"><FileIcon className="w-3 h-3" /> Archivo</TabsTrigger>
                <TabsTrigger value="scheduled-post" className="text-xs gap-1"><CalendarClock className="w-3 h-3" /> Post</TabsTrigger>
                <TabsTrigger value="link" className="text-xs gap-1"><Link2 className="w-3 h-3" /> Link</TabsTrigger>
              </TabsList>
              <TabsContent value="text" className="space-y-2">
                <Textarea value={content} onChange={(e) => setContent(e.target.value)}
                  rows={4} placeholder="Escribe tu historia..." className="text-sm" />
              </TabsContent>
              {(['image', 'video', 'file', 'link'] as StoryMediaKind[]).map((kind) => (
                <TabsContent key={kind} value={kind} className="space-y-2">
                  <Input value={content} onChange={(e) => setContent(e.target.value)}
                    placeholder={`URL del ${kind}`} className="text-xs font-mono h-9" />
                </TabsContent>
              ))}
              <TabsContent value="scheduled-post" className="space-y-2">
                <Input value={content} onChange={(e) => setContent(e.target.value)}
                  placeholder="Id del post programado o URL" className="text-xs h-9" />
              </TabsContent>
            </Tabs>

            <Input value={caption} onChange={(e) => setCaption(e.target.value)}
              placeholder="Texto superpuesto opcional" className="text-xs h-9" />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">
                  Fondo
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {STORY_GRADIENTS.map((g, i) => {
                    const sty = g.gradient.via
                      ? `linear-gradient(135deg, ${g.gradient.from}, ${g.gradient.via}, ${g.gradient.to})`
                      : `linear-gradient(135deg, ${g.gradient.from}, ${g.gradient.to})`;
                    return (
                      <button
                        key={g.label}
                        onClick={() => setGradientIdx(i)}
                        className={cn(
                          'w-8 h-8 rounded-lg border-2 transition-all',
                          gradientIdx === i ? 'border-white scale-110' : 'border-white/10 hover:border-white/40'
                        )}
                        style={{ background: sty }}
                        title={g.label}
                      />
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">
                  Visibilidad
                </label>
                <Select value={visibility} onValueChange={(v) => setVisibility(v as any)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="red" className="text-xs">Pública en la Red</SelectItem>
                    <SelectItem value="seguidores" className="text-xs">Solo seguidores</SelectItem>
                    <SelectItem value="privada" className="text-xs">Privada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-[1fr_100px] gap-2">
              <Input value={category} onChange={(e) => setCategory(e.target.value)}
                placeholder="Categoría (opcional): Sistema, Cultura..." className="text-xs h-8" />
              <Input type="color" value={categoryColor} onChange={(e) => setCategoryColor(e.target.value)}
                className="h-8 p-0 cursor-pointer" />
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">
                Duración (TTL): {ttlHours} horas
              </label>
              <Slider min={1} max={720} step={1} value={[ttlHours]}
                onValueChange={(v) => setTtlHours(v[0])} />
              <div className="flex flex-wrap gap-1 mt-2">
                {STORY_TTL_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setTtlHours(p.hours)}
                    className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full border transition-all',
                      ttlHours === p.hours
                        ? 'border-primary bg-primary/20 text-primary'
                        : 'border-white/10 text-muted-foreground hover:border-white/30'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block">
              Vista previa
            </label>
            <div
              className="aspect-[9/16] rounded-2xl overflow-hidden border border-white/10 relative"
              style={previewStyle}
            >
              {media === 'text' && content && (
                <div className="absolute inset-0 flex items-center justify-center p-4">
                  <p className="text-white font-bold text-center drop-shadow-lg leading-tight">
                    {content}
                  </p>
                </div>
              )}
              {category && (
                <span
                  className="absolute top-2 left-2 text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider"
                  style={{ background: 'rgba(0,0,0,0.6)', color: categoryColor }}
                >
                  {category}
                </span>
              )}
              {caption && (
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
                  <p className="text-white text-xs">{caption}</p>
                </div>
              )}
              <Badge variant="outline" className="absolute top-2 right-2 text-[9px] bg-black/40 border-white/30 text-white">
                {ttlHours}h
              </Badge>
            </div>
            <Button onClick={publish} className="w-full">Publicar historia</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
