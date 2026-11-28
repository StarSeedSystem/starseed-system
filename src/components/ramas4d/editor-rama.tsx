'use client';

/**
 * Editor de rama de Ramas 4D (MV1125I): diálogo para añadir una rama hija de
 * cualquier formato o transmutar un contenido existente a otra forma. El grafo
 * guarda referencias, nunca contenido privado. Tokens del tema, sin colores sueltos.
 */

import { useState } from 'react';
import { ArrowRightLeft, FilePlus2, GitBranch, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { etiquetaFormato } from '@/lib/conversion/formatos';
import type { NuevaRama } from '@/lib/ramas4d/edicion';
import type { FormatoNodo } from '@/lib/ramas4d/modelo';
import { cn } from '@/lib/utils';

export interface OrigenRama {
  id: string;
  titulo: string;
  formato: string;
}

export interface EditorRamaProps {
  abierto: boolean;
  onAbiertoCambia: (abierto: boolean) => void;
  padreTitulo?: string;
  origenes?: OrigenRama[];
  onCrear: (rama: NuevaRama) => void;
  onTransmutar?: (solicitud: { nodoId: string; formato: string }) => void;
  cargando?: boolean;
  error?: string;
}

const FORMATOS: { id: FormatoNodo; etiqueta: string }[] = [
  { id: 'texto', etiqueta: 'Texto' },
  { id: 'nota', etiqueta: 'Nota' },
  { id: 'documento', etiqueta: 'Documento' },
  { id: 'enlace', etiqueta: 'Enlace' },
  { id: 'publicacion', etiqueta: 'Publicación' },
  { id: 'leccion', etiqueta: 'Lección' },
  { id: 'imagen', etiqueta: 'Imagen' },
  { id: 'video', etiqueta: 'Vídeo' },
  { id: 'audio', etiqueta: 'Audio' },
  { id: 'presentacion', etiqueta: 'Presentación' },
  { id: 'tabla', etiqueta: 'Tabla' },
  { id: 'pizarra', etiqueta: 'Pizarra' },
  { id: 'app', etiqueta: 'App' },
  { id: 'modelo3d', etiqueta: 'Modelo 3D' },
];

const DESTINOS = ['pdf', 'docx', 'pptx', 'md', 'txt', 'html', 'epub', 'png', 'jpg', 'mp4', 'mp3', 'csv', 'xlsx', 'glb'];

function nuevoId(formato: FormatoNodo): string {
  return `rama-${formato}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const claseSelect =
  'h-11 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function EditorRama({
  abierto,
  onAbiertoCambia,
  padreTitulo,
  origenes = [],
  onCrear,
  onTransmutar,
  cargando = false,
  error,
}: EditorRamaProps) {
  const [modo, setModo] = useState<'nueva' | 'transmutar'>('nueva');
  const [formato, setFormato] = useState<FormatoNodo>('texto');
  const [titulo, setTitulo] = useState('');
  const [ref, setRef] = useState('');
  const [origenId, setOrigenId] = useState('');
  const [destino, setDestino] = useState('pdf');

  const origenElegido = origenId || origenes[0]?.id || '';
  const puedeCrear = modo === 'nueva' && titulo.trim() !== '' && ref.trim() !== '' && !cargando;
  const puedeTransmutar =
    modo === 'transmutar' && origenElegido !== '' && destino !== '' && Boolean(onTransmutar) && !cargando;

  const enviar = () => {
    if (modo === 'nueva') {
      onCrear({ id: nuevoId(formato), titulo: titulo.trim(), formato, ref: ref.trim() });
      setTitulo('');
      setRef('');
      return;
    }
    if (onTransmutar && origenElegido) onTransmutar({ nodoId: origenElegido, formato: destino });
  };

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoCambia}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" aria-hidden />
            {padreTitulo ? `Añadir rama a «${padreTitulo}»` : 'Añadir rama'}
          </DialogTitle>
          <DialogDescription>
            Cualquier formato, en lo tuyo o en un grupo donde puedas editar. El grafo guarda la
            referencia; el contenido se abre con sus permisos normales.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-1 rounded-full border border-border bg-muted/40 p-1" role="group" aria-label="Qué quieres hacer">
          {(['nueva', 'transmutar'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={modo === m}
              onClick={() => setModo(m)}
              className={cn(
                'min-h-11 cursor-pointer rounded-full px-3 text-sm transition-colors',
                modo === m
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m === 'nueva' ? 'Nueva rama' : 'Transmutar'}
            </button>
          ))}
        </div>

        {modo === 'nueva' ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Formato de la rama</Label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label="Formato de la rama">
                {FORMATOS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={formato === f.id}
                    onClick={() => setFormato(f.id)}
                    className={cn(
                      'min-h-11 cursor-pointer rounded-lg border px-2 text-xs transition-colors',
                      formato === f.id
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    {f.etiqueta}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rama-titulo">Título</Label>
              <Input
                id="rama-titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Cómo se llamará esta rama"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rama-ref">{formato === 'enlace' ? 'Enlace (URL)' : 'Referencia'}</Label>
              <Input
                id="rama-ref"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder={formato === 'enlace' ? 'https://…' : 'Ruta, id de archivo o de memoria'}
                inputMode={formato === 'enlace' ? 'url' : 'text'}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rama-origen">Contenido de origen</Label>
              <select
                id="rama-origen"
                className={claseSelect}
                value={origenElegido}
                onChange={(e) => setOrigenId(e.target.value)}
                disabled={origenes.length === 0}
              >
                {origenes.length === 0 ? (
                  <option value="">Todavía no hay contenido para transmutar</option>
                ) : (
                  origenes.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.titulo} · {o.formato}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rama-destino">Nueva forma</Label>
              <select
                id="rama-destino"
                className={claseSelect}
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
              >
                {DESTINOS.map((d) => (
                  <option key={d} value={d}>
                    {etiquetaFormato(d)}
                  </option>
                ))}
              </select>
            </div>
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              Se pedirá a la neurona que convierta el contenido. Si ese formato no se puede, te lo
              dirá y no inventa nada.
            </p>
          </div>
        )}

        {error ? (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" className="cursor-pointer">
              Cancelar
            </Button>
          </DialogClose>
          <Button
            type="button"
            onClick={enviar}
            disabled={modo === 'nueva' ? !puedeCrear : !puedeTransmutar}
            className="cursor-pointer"
          >
            {cargando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : modo === 'nueva' ? (
              <FilePlus2 className="h-4 w-4" aria-hidden />
            ) : (
              <ArrowRightLeft className="h-4 w-4" aria-hidden />
            )}
            {modo === 'nueva' ? 'Añadir rama' : 'Transmutar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EditorRama;
