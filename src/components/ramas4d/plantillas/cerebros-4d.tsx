'use client';

/**
 * Vista «Recuerdos vivos 4D» (MV1125L) sobre el motor Ramas 4D.
 * Cerebro = galaxia, carpeta = sistema, archivo y memoria = planeta o luna.
 * El 3D se importa con next/dynamic({ ssr: false }); debajo hay una lista
 * accesible equivalente. Solo referencias: el contenido se abre en su app.
 */

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, ListTree, Sparkles, X } from 'lucide-react';
import { listBrains, type Brain } from '@/lib/brains/brains';
import { listAllMemories, isBrainMemory, type HubMemory } from '@/lib/cerebro/brain-memories';
import { listMemoryFiles, type MemoryFile } from '@/lib/cerebro/memory-files';
import {
  construirGrafoCerebros,
  mapearAlcanceCerebro,
  type CarpetaCerebro,
  type CerebroFuente,
  type RecuerdoCerebro,
} from '@/lib/ramas4d/plantillas/cerebros';
import type { Grafo4D, Nodo } from '@/lib/ramas4d/modelo';
import { calcularDisposicion } from '@/lib/ramas4d/use-disposicion';
import { cn } from '@/lib/utils';

const EscenaRamas = dynamic(() => import('@/components/ramas4d/escena-ramas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Abriendo tus recuerdos vivos…
    </div>
  ),
});

function ms(fecha?: string): number | undefined {
  if (!fecha) return undefined;
  const t = new Date(fecha).getTime();
  return Number.isFinite(t) ? t : undefined;
}

function claveCarpeta(archivo: MemoryFile): string {
  const categoria = archivo.meta?.category;
  if (typeof categoria === 'string' && categoria.trim()) return categoria.trim();
  return archivo.source || 'starseed';
}

function aFuente(brain: Brain, memorias: HubMemory[], archivos: MemoryFile[]): CerebroFuente {
  const carpetas = new Map<string, CarpetaCerebro>();
  for (const archivo of archivos) {
    const clave = claveCarpeta(archivo);
    const id = `carpeta:${brain.id}:${clave}`;
    if (!carpetas.has(id)) {
      carpetas.set(id, {
        id,
        titulo: clave,
        ref: `/cerebros?tab=memoria&mview=3d&msub=archivos&brain=${brain.id}`,
        t_actividad: ms(archivo.updated_at) ?? ms(archivo.created_at),
        etiquetas: [clave],
      });
    }
  }
  const recuerdosArchivo: RecuerdoCerebro[] = archivos.map((archivo) => ({
    id: `archivo:${archivo.id}`,
    titulo: archivo.name,
    ref: `/cerebros?tab=memoria&mview=3d&msub=archivos&brain=${brain.id}`,
    carpetaId: `carpeta:${brain.id}:${claveCarpeta(archivo)}`,
    formato: 'documento',
    t_actividad: ms(archivo.updated_at) ?? ms(archivo.created_at),
    etiquetas: [archivo.source],
  }));
  const recuerdosMemoria: RecuerdoCerebro[] = memorias.map((memoria) => ({
    id: `memoria:${memoria.id}`,
    titulo: memoria.name,
    ref: `/cerebros?tab=memoria&mview=3d&msub=hub&brain=${brain.id}`,
    alcance: mapearAlcanceCerebro(memoria.scope === 'brain' ? brain.scope : memoria.scope),
    formato: memoria.format || 'documento',
    t_actividad: ms(memoria.updated_at) ?? ms(memoria.created_at),
    etiquetas: memoria.kinds ?? [],
    luna: true,
  }));
  return {
    id: `brain:${brain.id}`,
    titulo: brain.name,
    dueno: brain.owner ?? 'yo',
    alcance: mapearAlcanceCerebro(brain.scope),
    capas: [brain.scope],
    t_creado: ms(brain.created_at),
    t_actividad: ms(brain.updated_at),
    uso: memorias.length + archivos.length,
    etiquetas: [brain.scope],
    carpetas: Array.from(carpetas.values()),
    archivos: recuerdosArchivo,
    memorias: recuerdosMemoria,
  };
}

export interface Cerebros4DProps {
  className?: string;
}

export default function Cerebros4D({ className }: Cerebros4DProps) {
  const router = useRouter();
  const [fuentes, setFuentes] = useState<CerebroFuente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [posiciones, setPosiciones] = useState<Float32Array | null>(null);
  const [verLista, setVerLista] = useState(false);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const [brains, memorias] = await Promise.all([listBrains(), listAllMemories()]);
        const archivosPorCerebro = await Promise.all(
          brains.map((brain) => listMemoryFiles(brain.id)),
        );
        if (!vivo) return;
        setFuentes(
          brains.map((brain, i) =>
            aFuente(
              brain,
              memorias.filter((m) =>
                isBrainMemory(m, brain.id, brain.includes?.memories ?? []),
              ),
              archivosPorCerebro[i] ?? [],
            ),
          ),
        );
      } catch {
        if (vivo) setError('No se pudieron leer los cerebros. Inténtalo de nuevo.');
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const grafo = useMemo<Grafo4D>(() => construirGrafoCerebros(fuentes), [fuentes]);

  useEffect(() => {
    if (grafo.nodos.size === 0) {
      setPosiciones(null);
      return;
    }
    let vivo = true;
    const ids = Array.from(grafo.nodos.keys());
    const indice = new Map(ids.map((id, i) => [id, i]));
    const aristas = grafo.aristas
      .map((a) => ({
        de: indice.get(a.de) ?? -1,
        a: indice.get(a.a) ?? -1,
        intensidad: a.intensidad,
      }))
      .filter((a) => a.de >= 0 && a.a >= 0);
    calcularDisposicion({
      modo: 'fuerza',
      n: ids.length,
      aristas,
      opciones: { semilla: 7, iteraciones: 90 },
    })
      .then((p) => {
        if (vivo) setPosiciones(p);
      })
      .catch(() => {
        if (vivo) setPosiciones(null);
      });
    return () => {
      vivo = false;
    };
  }, [grafo]);

  const nodo: Nodo | null = seleccionado ? grafo.nodos.get(seleccionado) ?? null : null;
  const cuenta = useMemo(() => {
    const c = { cerebro: 0, carpeta: 0, archivo: 0, memoria: 0 };
    for (const n of grafo.nodos.values()) {
      if (n.tipo === 'cerebro') c.cerebro++;
      else if (n.tipo === 'carpeta') c.carpeta++;
      else if (n.tipo === 'archivo') c.archivo++;
      else if (n.tipo === 'memoria') c.memoria++;
    }
    return c;
  }, [grafo]);

  if (cargando) {
    return (
      <div className={cn('flex h-full w-full items-center justify-center text-muted-foreground', className)}>
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Leyendo tus cerebros y memorias…
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('flex h-full w-full items-center justify-center px-6 text-center text-sm text-muted-foreground', className)}>
        {error}
      </div>
    );
  }

  return (
    <div className={cn('flex h-full w-full flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/60 px-2.5 py-1">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> {cuenta.cerebro} galaxias
        </span>
        <span className="rounded-full border border-border/60 bg-card/60 px-2.5 py-1">{cuenta.carpeta} sistemas</span>
        <span className="rounded-full border border-border/60 bg-card/60 px-2.5 py-1">{cuenta.archivo} planetas</span>
        <span className="rounded-full border border-border/60 bg-card/60 px-2.5 py-1">{cuenta.memoria} lunas</span>
        <button
          type="button"
          onClick={() => setVerLista((v) => !v)}
          className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-foreground transition hover:bg-accent/20"
          aria-pressed={verLista}
        >
          <ListTree className="h-3.5 w-3.5" /> {verLista ? 'Ocultar lista' : 'Lista accesible'}
        </button>
      </div>

      <div className="relative min-h-[60vh] flex-1 overflow-hidden rounded-xl border border-border/50 bg-background/40">
        {posiciones && grafo.nodos.size > 0 ? (
          <EscenaRamas
            grafo={grafo}
            posiciones={posiciones}
            seleccionado={seleccionado}
            onSeleccionar={setSeleccionado}
            capasVisibles={[]}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            {grafo.nodos.size === 0 ? 'Todavía no hay cerebros con recuerdos.' : 'Colocando los recuerdos en órbita…'}
          </div>
        )}

        {nodo && (
          <aside className="absolute bottom-3 right-3 w-72 max-w-[calc(100%-1.5rem)] rounded-xl border border-border/60 bg-card/95 p-3 shadow-lg backdrop-blur">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{nodo.tipo} · {nodo.alcance}</p>
                <h3 className="truncate text-sm font-semibold text-foreground">{nodo.titulo}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSeleccionado(null)}
                className="cursor-pointer rounded-md p-1 text-muted-foreground transition hover:bg-accent/20 hover:text-foreground"
                aria-label="Cerrar detalle"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Brillo {Math.round(nodo.peso * 100)}% · {nodo.formato}
            </p>
            <button
              type="button"
              onClick={() => router.push(nodo.ref)}
              className="mt-2 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Abrir en su app
            </button>
          </aside>
        )}
      </div>

      {verLista && (
        <div className="max-h-56 overflow-auto rounded-xl border border-border/50 bg-card/40 p-2">
          <ul className="space-y-1">
            {Array.from(grafo.nodos.values())
              .sort((a, b) => b.peso - a.peso)
              .map((n) => (
                <li key={n.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSeleccionado(n.id)}
                    className={cn(
                      'min-w-0 flex-1 cursor-pointer truncate rounded-md px-2 py-1 text-left text-xs transition hover:bg-accent/20',
                      seleccionado === n.id ? 'bg-accent/30 text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {n.titulo} <span className="opacity-60">· {n.tipo}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(n.ref)}
                    className="cursor-pointer rounded-md p-1 text-muted-foreground transition hover:bg-accent/20 hover:text-foreground"
                    aria-label={`Abrir ${n.titulo} en su app`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
