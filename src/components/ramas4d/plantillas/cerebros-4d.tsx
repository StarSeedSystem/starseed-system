'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { listBrains } from '@/lib/brains/brains';
import { listMemoryFiles, type MemoryFile } from '@/lib/cerebro/memory-files';
import { cn } from '@/lib/utils';
import { useDisposicion } from '@/lib/ramas4d/use-disposicion';
import {
  construirGrafoCerebros,
  destinoApertura,
  enfriarRecuerdos,
  grafoVisibleCerebros,
  padresCerebros,
  type EntradaRecuerdo,
  type VinculoRecuerdo,
} from '@/lib/ramas4d/plantillas/cerebros';

const EscenaRamas = dynamic(() => import('@/components/ramas4d/escena-ramas'), {
  ssr: false,
  loading: () => <div className="flex h-full w-full items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Tejiendo los recuerdos vivos…</div>,
});

interface Props {
  brainId: string | null;
  className?: string;
}

function categoriaDe(a: MemoryFile): string {
  const c = a.meta.categoria ?? a.meta.category;
  return typeof c === 'string' && c.trim() ? c : a.name.split('/')[0] || 'sin carpeta';
}
function pesoDe(a: MemoryFile): number {
  const u = a.meta.usos;
  return typeof u === 'number' && Number.isFinite(u) ? Math.max(0.05, Math.min(1, u / 20)) : 0.4;
}
function entradasDe(archivos: readonly MemoryFile[], dueno: string): EntradaRecuerdo[] {
  const salida: EntradaRecuerdo[] = [];
  const carpetas = new Set<string>();
  for (const a of archivos) {
    const cat = categoriaDe(a), idCarpeta = `carpeta:${cat}`;
    if (!carpetas.has(idCarpeta)) { carpetas.add(idCarpeta); salida.push({ id: idCarpeta, titulo: cat, tipo: 'carpeta', ref: `/cerebro/mapa?carpeta=${encodeURIComponent(cat)}`, alcance: 'privado', dueno }); }
    salida.push({ id: `mem:${a.id}`, titulo: a.name, tipo: a.name.endsWith('.md') ? 'memoria' : 'archivo', ref: `/memorias?recuerdo=${a.id}`, alcance: 'privado', dueno, carpetaPadre: idCarpeta, t_actividad: a.updated_at ? Date.parse(a.updated_at) : undefined, peso: pesoDe(a), etiquetas: typeof a.meta.kind === 'string' ? [a.meta.kind] : [] });
  }
  return salida;
}
function vinculosDe(archivos: readonly MemoryFile[]): VinculoRecuerdo[] {
  const salida: VinculoRecuerdo[] = [];
  for (const a of archivos) for (const tipo of ['fusiona', 'telepatia'] as const) {
    const destinos = a.meta[tipo];
    if (Array.isArray(destinos)) for (const d of destinos) if (typeof d === 'string') salida.push({ de: `mem:${a.id}`, a: `mem:${d}`, tipo });
  }
  return salida;
}

export default function Cerebros4D({ brainId, className }: Props) {
  const router = useRouter();
  const { posiciones, calcular } = useDisposicion();
  const [entradas, setEntradas] = useState<EntradaRecuerdo[]>([]);
  const [vinculos, setVinculos] = useState<VinculoRecuerdo[]>([]);
  const [dueno, setDueno] = useState('');
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const { data } = await createClient().auth.getUser();
      const uid = data.user?.id ?? '';
      const [brains, propios, cuenta] = await Promise.all([listBrains(), brainId ? listMemoryFiles(brainId) : Promise.resolve([]), listMemoryFiles(null)]);
      if (!vivo) return;
      setDueno(uid);
      const archivos = [...cuenta, ...propios];
      setEntradas([...brains.map((b) => ({ id: `cerebro:${b.id}`, titulo: b.name, tipo: 'cerebro' as const, ref: `/cerebro?cerebro=${b.id}`, alcance: b.scope === 'account' ? 'privado' as const : 'grupo' as const, dueno: b.owner ?? uid, t_actividad: b.updated_at ? Date.parse(b.updated_at) : undefined })), ...entradasDe(archivos, uid)]);
      setVinculos(vinculosDe(archivos));
    })();
    return () => { vivo = false; };
  }, [brainId]);
  const ahora = useMemo(() => Date.now(), [entradas]);
  const grafo = useMemo(() => enfriarRecuerdos(grafoVisibleCerebros(construirGrafoCerebros(entradas, vinculos, ahora), { id: dueno }), ahora), [entradas, vinculos, dueno, ahora]);
  const ids = useMemo(() => [...grafo.nodos.keys()], [grafo]);
  useEffect(() => { void calcular({ modo: 'radial', padres: padresCerebros(grafo, ids), opciones: { radioAnillo: 2.6, alturaAnillo: 0.8 } }); }, [grafo, ids, calcular]);
  const nodo = seleccionado ? grafo.nodos.get(seleccionado) : null;
  return (
    <div className={cn('flex h-full w-full flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Cada cerebro es una galaxia; sus carpetas, sistemas y cada recuerdo, un planeta que brilla con el uso y se enfría sin borrarse.</p>
        {nodo && <button type="button" onClick={() => router.push(destinoApertura(nodo))} className="flex cursor-pointer items-center gap-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent">Abrir «{nodo.titulo}» en su app <ArrowUpRight className="h-4 w-4" /></button>}
      </div>
      <div className="min-h-[30rem] flex-1"><EscenaRamas grafo={grafo} posiciones={posiciones} seleccionado={seleccionado} onSeleccionar={setSeleccionado} capasVisibles={[]} /></div>
      <div className="flex flex-wrap gap-1" role="list" aria-label="Recuerdos visibles">
        {ids.slice(0, 40).map((id) => <button key={id} type="button" role="listitem" onClick={() => setSeleccionado(id)} className={cn('cursor-pointer rounded-full border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent', id === seleccionado && 'bg-accent text-foreground')}>{grafo.nodos.get(id)?.titulo}</button>)}
      </div>
    </div>
  );
}
