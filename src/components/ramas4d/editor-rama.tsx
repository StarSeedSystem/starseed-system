'use client';

// StarSeed OS — Ramas 4D · editor de rama. Contrato `architecture/multiverso-5d.md`:
// elegir origen y formato de una rama nueva (cualquiera cabe) o pedir otra forma del
// contenido y colgarla como hermana con arista transmuta. Tokens del tema, sin colores
// sueltos; textos en español; el grafo lleva referencias, nunca contenido privado.

import { useEffect, useMemo, useState } from 'react';
import { Link2, Loader2, Plus, Repeat2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DESTINOS_HABITUALES } from '@/lib/conversion/formatos';
import type { DatosRama } from '@/lib/ramas4d/edicion';

export interface NodoOrigen { id: string; titulo: string; formato: string }

export interface EditorRamaProps {
  abierto: boolean;
  onAbiertoCambia: (abierto: boolean) => void;
  padre: { id: string; titulo: string } | null;
  origen?: NodoOrigen | null;
  onCrear: (datos: DatosRama) => void;
  onTransmutar?: (opciones: { destino: string; archivo: File }) => void | Promise<void>;
}

const ORIGENES = ['archivo', 'enlace', 'nota', 'publicacion', 'app', 'leccion'];
const FORMATOS = ['texto', 'imagen', 'video', 'audio', 'modelo3d', 'app', 'web', 'documento', 'tabla', 'pizarra', 'presentacion', 'enlace', 'flujo'];
const ETIQUETA: Record<string, string> = {
  archivo: 'Archivo', enlace: 'Enlace', nota: 'Nota', publicacion: 'Publicación', app: 'App',
  leccion: 'Lección', texto: 'Texto', imagen: 'Imagen', video: 'Vídeo', audio: 'Audio',
  modelo3d: 'Modelo 3D', web: 'Web', documento: 'Documento', tabla: 'Tabla', pizarra: 'Pizarra',
  presentacion: 'Presentación', flujo: 'Flujo',
};
const nombre = (v: string) => ETIQUETA[v] ?? v;

export default function EditorRama({ abierto, onAbiertoCambia, padre, origen = null, onCrear, onTransmutar }: EditorRamaProps) {
  const [modo, setModo] = useState<'crear' | 'transmutar'>('crear');
  const [tipo, setTipo] = useState('archivo');
  const [formato, setFormato] = useState('texto');
  const [titulo, setTitulo] = useState('');
  const [ref, setRef] = useState('');
  const [destino, setDestino] = useState('png');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const destinos = useMemo(() => DESTINOS_HABITUALES.filter((d) => d !== origen?.formato), [origen?.formato]);

  useEffect(() => {
    if (!abierto) return;
    setModo(origen && onTransmutar ? 'transmutar' : 'crear');
    setTipo('archivo'); setFormato('texto'); setTitulo(''); setRef('');
    setDestino(destinos[0] ?? 'png'); setArchivo(null); setTrabajando(false);
  }, [abierto, origen, onTransmutar, destinos]);

  const puedeCrear = titulo.trim().length > 0 && ref.trim().length > 0;
  const puedeEnviar = modo === 'crear' ? puedeCrear : Boolean(archivo) && destino.length > 0;

  async function enviar() {
    if (modo === 'transmutar' && onTransmutar && archivo) {
      setTrabajando(true);
      try { await onTransmutar({ destino, archivo }); onAbiertoCambia(false); }
      finally { setTrabajando(false); }
      return;
    }
    if (!puedeCrear) return;
    onCrear({ tipo, titulo: titulo.trim(), formato, ref: ref.trim() });
    onAbiertoCambia(false);
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoCambia}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {modo === 'transmutar' ? <Repeat2 className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            {modo === 'transmutar' ? 'Transmutar rama' : 'Añadir rama'}
          </DialogTitle>
          <DialogDescription>
            {modo === 'transmutar'
              ? `Otra forma de «${origen?.titulo ?? 'esta rama'}», colgada como hermana con arista transmuta.`
              : padre ? `Se colgará dentro de «${padre.titulo}». Cualquier formato cabe.`
                : 'Se colgará en la raíz del universo. Cualquier formato cabe.'}
          </DialogDescription>
        </DialogHeader>

        {origen && onTransmutar && (
          <div className="flex gap-2" role="tablist" aria-label="Qué hacer con la rama">
            <Button type="button" size="sm" variant={modo === 'crear' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setModo('crear')}>Añadir hija</Button>
            <Button type="button" size="sm" variant={modo === 'transmutar' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setModo('transmutar')}><Repeat2 className="h-4 w-4" /> Transmutar</Button>
          </div>
        )}

        {modo === 'crear' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rama-origen">Origen</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger id="rama-origen" className="cursor-pointer"><SelectValue /></SelectTrigger>
                  <SelectContent>{ORIGENES.map((o) => <SelectItem key={o} value={o} className="cursor-pointer">{nombre(o)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rama-formato">Formato</Label>
                <Select value={formato} onValueChange={setFormato}>
                  <SelectTrigger id="rama-formato" className="cursor-pointer"><SelectValue /></SelectTrigger>
                  <SelectContent>{FORMATOS.map((f) => <SelectItem key={f} value={f} className="cursor-pointer">{nombre(f)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rama-titulo">Título</Label>
              <Input id="rama-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Nombre de la rama" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rama-ref">Referencia</Label>
              <Input id="rama-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="/ruta, id de archivo o de memoria" />
              <p className="text-xs text-muted-foreground">Solo la referencia para abrirla; el contenido privado nunca viaja en el grafo.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="rama-destino">Nueva forma</Label>
              <Select value={destino} onValueChange={setDestino}>
                <SelectTrigger id="rama-destino" className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>{destinos.map((d) => <SelectItem key={d} value={d} className="cursor-pointer">{d.toUpperCase()}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rama-archivo">Archivo de origen</Label>
              <Input id="rama-archivo" type="file" className="cursor-pointer" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
              <p className="flex items-center gap-1 text-xs text-muted-foreground"><Link2 className="h-3.5 w-3.5" /> Si el formato no se puede convertir, se avisa y no se inventa.</p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" className="cursor-pointer" onClick={() => onAbiertoCambia(false)}>Cancelar</Button>
          <Button type="button" className="cursor-pointer" disabled={trabajando || !puedeEnviar} onClick={() => { void enviar(); }}>
            {trabajando ? <Loader2 className="h-4 w-4 animate-spin" /> : modo === 'crear' ? <Plus className="h-4 w-4" /> : <Repeat2 className="h-4 w-4" />}
            {modo === 'crear' ? 'Añadir rama' : 'Transmutar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
