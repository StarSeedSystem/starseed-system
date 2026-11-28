'use client';

// StarSeed OS — Ramas 4D · editor de rama. Contrato `architecture/multiverso-5d.md`:
// elegir origen y formato de una rama nueva (cualquiera cabe), vincular dos nodos con
// un tipo de arista o pedir otra forma del contenido y colgarla como hermana con
// arista transmuta. Tokens del tema, sin colores sueltos; textos en español; el grafo
// lleva referencias, nunca contenido privado. Las operaciones se aplican con el motor
// puro de `@/lib/ramas4d/edicion` y `@/lib/ramas4d/transmutar`; cuando no se le pasa
// estado, el diálogo solo emite la intención por sus callbacks.

import { useEffect, useMemo, useState } from 'react';
import { Link2, Loader2, Plus, Repeat2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DESTINOS_HABITUALES } from '@/lib/conversion/formatos';
import type { TipoArista } from '@/lib/ramas4d/modelo';
import {
  anadirRamaHija,
  clonarGrafo,
  deshacer,
  puedeEditar,
  vincularNodos,
  type ContextoEdicion,
  type DatosRama,
  type EstadoEdicion,
  type ResultadoEdicion,
} from '@/lib/ramas4d/edicion';
import {
  crearPuertoConversion,
  planificarTransmutacion,
  transmutarNodo,
  type DestinosConversion,
} from '@/lib/ramas4d/transmutar';

export interface NodoOrigen { id: string; titulo: string; formato: string }

export interface EditorRamaProps {
  abierto: boolean;
  onAbiertoCambia: (abierto: boolean) => void;
  padre: { id: string; titulo: string } | null;
  origen?: NodoOrigen | null;
  onCrear?: (datos: DatosRama) => void;
  onTransmutar?: (opciones: { destino: string; archivo: File }) => void | Promise<void>;
  /** Estado de edición del grafo. Si se pasa junto con `ctx`, el diálogo aplica el cambio. */
  estado?: EstadoEdicion;
  /** Observador, permisos e instante de la edición. */
  ctx?: ContextoEdicion;
  /** Recibe el estado ya aplicado (con su pila de deshacer). */
  onEstado?: (estado: EstadoEdicion) => void;
  /** Destinos que el conversor admite para el contenido de origen. */
  destinosConversion?: DestinosConversion | null;
}

const ORIGENES = ['archivo', 'enlace', 'nota', 'publicacion', 'app', 'leccion'];
const FORMATOS = ['texto', 'imagen', 'video', 'audio', 'modelo3d', 'app', 'web', 'documento', 'tabla', 'pizarra', 'presentacion', 'enlace', 'flujo'];
const ARISTAS: TipoArista[] = ['contiene', 'deriva', 'cita', 'prerrequisito', 'sincroniza', 'senal', 'transmuta', 'variacion', 'vota', 'participa', 'usa'];
const ETIQUETA: Record<string, string> = {
  archivo: 'Archivo', enlace: 'Enlace', nota: 'Nota', publicacion: 'Publicación', app: 'App',
  leccion: 'Lección', texto: 'Texto', imagen: 'Imagen', video: 'Vídeo', audio: 'Audio',
  modelo3d: 'Modelo 3D', web: 'Web', documento: 'Documento', tabla: 'Tabla', pizarra: 'Pizarra',
  presentacion: 'Presentación', flujo: 'Flujo', contiene: 'Contiene', deriva: 'Deriva',
  cita: 'Cita', prerrequisito: 'Prerrequisito', sincroniza: 'Sincroniza', senal: 'Señal',
  transmuta: 'Transmuta', variacion: 'Variación', vota: 'Vota', participa: 'Participa', usa: 'Usa',
};
const nombre = (v: string) => ETIQUETA[v] ?? v;

export default function EditorRama({
  abierto, onAbiertoCambia, padre, origen = null, onCrear, onTransmutar,
  estado, ctx, onEstado, destinosConversion = null,
}: EditorRamaProps) {
  const [modo, setModo] = useState<'crear' | 'vincular' | 'transmutar'>('crear');
  const [tipo, setTipo] = useState('archivo');
  const [formato, setFormato] = useState('texto');
  const [titulo, setTitulo] = useState('');
  const [ref, setRef] = useState('');
  const [destino, setDestino] = useState('png');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [de, setDe] = useState('');
  const [a, setA] = useState('');
  const [tipoArista, setTipoArista] = useState<TipoArista>('cita');
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState('');
  const destinos = useMemo(() => DESTINOS_HABITUALES.filter((d) => d !== origen?.formato), [origen?.formato]);
  const motor = Boolean(estado && ctx);
  const editables = useMemo(
    () => (estado && ctx ? Array.from(estado.grafo.nodos.values()).filter((n) => puedeEditar(n, ctx)) : []),
    [estado, ctx]
  );
  const plan = useMemo(
    () => (destinosConversion ? planificarTransmutacion(destinosConversion, destino) : null),
    [destinosConversion, destino]
  );

  useEffect(() => {
    if (!abierto) return;
    setModo(origen && (onTransmutar || motor) ? 'transmutar' : 'crear');
    setTipo('archivo'); setFormato('texto'); setTitulo(''); setRef('');
    setDestino(destinos[0] ?? 'png'); setArchivo(null); setTrabajando(false); setAviso('');
    setDe(padre?.id ?? ''); setA(''); setTipoArista('cita');
  }, [abierto, origen, onTransmutar, motor, padre?.id, destinos]);

  const puedeCrear = titulo.trim().length > 0 && ref.trim().length > 0;
  const puedeVincular = de.length > 0 && a.length > 0 && de !== a;
  const puedeEnviar = modo === 'crear'
    ? puedeCrear
    : modo === 'vincular'
      ? puedeVincular
      : Boolean(archivo) && destino.length > 0 && (plan ? plan.ok : true);

  function aplicar(resultado: ResultadoEdicion) {
    if (!resultado.ok) {
      setAviso(resultado.error ?? 'No se pudo aplicar el cambio.');
      return;
    }
    const copia: EstadoEdicion = {
      grafo: clonarGrafo(resultado.estado.grafo),
      deshacer: resultado.estado.deshacer.map(clonarGrafo),
    };
    onEstado?.(copia);
    onAbiertoCambia(false);
  }

  function deshacerUltimo() {
    if (!estado) return;
    const resultado = deshacer(estado);
    if (!resultado.ok) {
      setAviso(resultado.error ?? 'No hay nada que deshacer.');
      return;
    }
    const copia: EstadoEdicion = {
      grafo: clonarGrafo(resultado.estado.grafo),
      deshacer: resultado.estado.deshacer.map(clonarGrafo),
    };
    onEstado?.(copia);
    setAviso('Deshecho el último cambio.');
  }

  async function enviar() {
    setAviso('');
    if (modo === 'crear') {
      if (!puedeCrear) return;
      const datos: DatosRama = { tipo, titulo: titulo.trim(), formato, ref: ref.trim() };
      if (estado && ctx) {
        if (!padre) { setAviso('Elige la rama donde colgar la nueva.'); return; }
        aplicar(anadirRamaHija(estado, padre.id, datos, ctx));
        return;
      }
      onCrear?.(datos);
      onAbiertoCambia(false);
      return;
    }

    if (modo === 'vincular') {
      if (!estado || !ctx || !puedeVincular) return;
      aplicar(vincularNodos(estado, de, a, tipoArista, ctx));
      return;
    }

    if (!archivo) return;
    if (estado && ctx && origen) {
      if (plan && !plan.ok) { setAviso(plan.motivo ?? 'No se puede convertir este contenido.'); return; }
      setTrabajando(true);
      try {
        const resultado = await transmutarNodo(estado, {
          origenId: origen.id,
          destino,
          archivo,
          nombre: archivo.name,
          ctx,
          puerto: crearPuertoConversion(),
        });
        if (!resultado.ok) {
          setAviso(resultado.motivo ?? resultado.error ?? 'No se pudo transmutar la rama.');
          return;
        }
        aplicar(resultado);
      } finally {
        setTrabajando(false);
      }
      return;
    }

    if (onTransmutar) {
      setTrabajando(true);
      try { await onTransmutar({ destino, archivo }); onAbiertoCambia(false); }
      finally { setTrabajando(false); }
    }
  }

  const tituloDialogo = modo === 'transmutar' ? 'Transmutar rama' : modo === 'vincular' ? 'Vincular nodos' : 'Añadir rama';
  const IconoModo = modo === 'transmutar' ? Repeat2 : modo === 'vincular' ? Link2 : Plus;

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoCambia}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconoModo className="h-5 w-5" />
            {tituloDialogo}
          </DialogTitle>
          <DialogDescription>
            {modo === 'transmutar'
              ? `Otra forma de «${origen?.titulo ?? 'esta rama'}», colgada como hermana con arista transmuta.`
              : modo === 'vincular'
                ? 'Une dos nodos con el tipo de arista que elijas. Solo lo propio o lo de un grupo con permiso de edición.'
                : padre ? `Se colgará dentro de «${padre.titulo}». Cualquier formato cabe.`
                  : 'Se colgará en la raíz del universo. Cualquier formato cabe.'}
          </DialogDescription>
        </DialogHeader>

        {(motor || (origen && onTransmutar)) && (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Qué hacer con la rama">
            <Button type="button" size="sm" variant={modo === 'crear' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => { setModo('crear'); setAviso(''); }}>Añadir hija</Button>
            {motor && (
              <Button type="button" size="sm" variant={modo === 'vincular' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => { setModo('vincular'); setAviso(''); }}><Link2 className="h-4 w-4" /> Vincular</Button>
            )}
            {origen && (motor || onTransmutar) && (
              <Button type="button" size="sm" variant={modo === 'transmutar' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => { setModo('transmutar'); setAviso(''); }}><Repeat2 className="h-4 w-4" /> Transmutar</Button>
            )}
          </div>
        )}

        {modo === 'crear' && (
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
        )}

        {modo === 'vincular' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rama-de">Nodo de salida</Label>
                <Select value={de} onValueChange={setDe}>
                  <SelectTrigger id="rama-de" className="cursor-pointer"><SelectValue placeholder="Elige un nodo…" /></SelectTrigger>
                  <SelectContent>{editables.map((n) => <SelectItem key={n.id} value={n.id} className="cursor-pointer">{n.titulo}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rama-a">Nodo de llegada</Label>
                <Select value={a} onValueChange={setA}>
                  <SelectTrigger id="rama-a" className="cursor-pointer"><SelectValue placeholder="Elige un nodo…" /></SelectTrigger>
                  <SelectContent>{editables.map((n) => <SelectItem key={n.id} value={n.id} className="cursor-pointer">{n.titulo}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rama-arista">Tipo de vínculo</Label>
              <Select value={tipoArista} onValueChange={setTipoArista}>
                <SelectTrigger id="rama-arista" className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>{ARISTAS.map((t) => <SelectItem key={t} value={t} className="cursor-pointer">{nombre(t)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {editables.length === 0 && (
              <p className="text-xs text-muted-foreground">No hay nodos que puedas editar: solo se vincula lo propio o lo de un grupo con permiso.</p>
            )}
          </div>
        )}

        {modo === 'transmutar' && (
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
            {plan && !plan.ok && (
              <p className="text-xs text-muted-foreground">{plan.motivo}</p>
            )}
          </div>
        )}

        {aviso && (
          <p className="rounded-xl border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">{aviso}</p>
        )}

        <DialogFooter className="flex-wrap gap-2">
          <Button type="button" variant="ghost" className="cursor-pointer" onClick={() => onAbiertoCambia(false)}>Cancelar</Button>
          {motor && (
            <Button type="button" variant="outline" className="cursor-pointer" onClick={deshacerUltimo}><Undo2 className="h-4 w-4" /> Deshacer</Button>
          )}
          <Button type="button" className="cursor-pointer" disabled={trabajando || !puedeEnviar} onClick={() => { void enviar(); }}>
            {trabajando ? <Loader2 className="h-4 w-4 animate-spin" /> : <IconoModo className="h-4 w-4" />}
            {modo === 'crear' ? 'Añadir rama' : modo === 'vincular' ? 'Vincular' : 'Transmutar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
