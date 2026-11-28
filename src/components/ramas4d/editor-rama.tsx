'use client';

import { useState } from 'react';
import { AppWindow, FileText, GraduationCap, Link2, Newspaper, StickyNote, type LucideIcon } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { referenciaValida, type DatosRamaNueva } from '@/lib/ramas4d/edicion';

type Origen = 'ruta' | 'enlace';

interface OpcionFormato {
  etiqueta: string;
  formato: string;
  tipo: string;
  icono: LucideIcon;
}

function nuevoId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `rama-${Date.now()}`;
}

const OPCIONES: OpcionFormato[] = [
  { etiqueta: 'Archivo', formato: 'documento', tipo: 'archivo', icono: FileText },
  { etiqueta: 'Enlace', formato: 'enlace', tipo: 'archivo', icono: Link2 },
  { etiqueta: 'Nota', formato: 'texto', tipo: 'memoria', icono: StickyNote },
  { etiqueta: 'Publicación', formato: 'texto', tipo: 'publicacion', icono: Newspaper },
  { etiqueta: 'Aplicación', formato: 'app', tipo: 'proyecto', icono: AppWindow },
  { etiqueta: 'Lección', formato: 'video', tipo: 'leccion', icono: GraduationCap },
];

export interface EditorRamaProps {
  abierto: boolean;
  onCerrar: () => void;
  onCrear: (datos: DatosRamaNueva) => void;
  tituloPadre?: string;
}

export function EditorRama({ abierto, onCerrar, onCrear, tituloPadre }: EditorRamaProps) {
  const [id, setId] = useState(nuevoId);
  const [indice, setIndice] = useState(0);
  const [origen, setOrigen] = useState<Origen>('ruta');
  const [titulo, setTitulo] = useState('');
  const [ref, setRef] = useState('');
  const valido = referenciaValida(ref.trim());

  function crear() {
    if (!valido) return;
    onCrear({ id, titulo: titulo.trim() || OPCIONES[indice].etiqueta, formato: OPCIONES[indice].formato, tipo: OPCIONES[indice].tipo, ref: ref.trim() });
    setId(nuevoId());
    setTitulo('');
    setRef('');
  }

  return (
    <Dialog open={abierto} onOpenChange={(abiertoAhora) => { if (!abiertoAhora) onCerrar(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Añadir una rama</DialogTitle>
          <DialogDescription>Elige el formato y el origen. El grafo guarda solo la referencia; el contenido se abre con tus permisos.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-[38.2%_61.8%]">
          <fieldset className="min-w-0">
            <legend className="mb-2 text-sm font-medium text-foreground">Formato de la rama</legend>
            <div className="flex flex-wrap gap-2">
              {OPCIONES.map((opcion, i) => {
                const Icono = opcion.icono;
                return (
                  <button key={opcion.etiqueta} type="button" onClick={() => setIndice(i)} aria-pressed={i === indice}
                    className={`min-h-11 cursor-pointer rounded-[var(--radius)] border px-3 text-sm flex items-center gap-2 transition-colors ${i === indice ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-card text-muted-foreground hover:bg-accent'}`}>
                    <Icono aria-hidden="true" className="h-4 w-4" />{opcion.etiqueta}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="min-w-0 space-y-4">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-foreground">Origen del contenido</legend>
              <div className="flex gap-2">
                {(['ruta', 'enlace'] as const).map((opcion) => (
                  <button key={opcion} type="button" onClick={() => setOrigen(opcion)} aria-pressed={origen === opcion}
                    className={`min-h-11 cursor-pointer rounded-[var(--radius)] border px-3 text-sm ${origen === opcion ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-card text-muted-foreground hover:bg-accent'}`}>
                    {opcion === 'ruta' ? 'Ruta del OS' : 'Enlace externo'}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="block text-sm text-muted-foreground" htmlFor="rama-titulo">Título de la rama</label>
            <input id="rama-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Nombre que se verá en el universo"
              className="min-h-11 w-full rounded-[var(--radius)] border border-border bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <label className="block text-sm text-muted-foreground" htmlFor="rama-ref">{origen === 'ruta' ? 'Ruta del OS' : 'Enlace'}</label>
            <input id="rama-ref" value={ref} onChange={(e) => setRef(e.target.value)} aria-invalid={ref.length > 0 && !valido}
              placeholder={origen === 'ruta' ? '/ramas/mi-leccion' : 'https://…'}
              className="min-h-11 w-full rounded-[var(--radius)] border border-border bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            {ref.length > 0 && !valido && <p role="alert" className="text-sm text-destructive">Escribe una ruta o un enlace; no pongas contenido privado.</p>}
            {tituloPadre && <p className="text-xs text-muted-foreground">Se colgará de «{tituloPadre}».</p>}
          </div>
        </div>
        <DialogFooter>
          <button type="button" onClick={onCerrar} className="min-h-11 cursor-pointer rounded-[var(--radius)] border border-border px-4 text-foreground hover:bg-accent">Cancelar</button>
          <button type="button" onClick={crear} disabled={!valido} className="min-h-11 cursor-pointer rounded-[var(--radius)] bg-primary px-4 text-primary-foreground hover:opacity-90 disabled:opacity-50">Añadir rama</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
