'use client';
// «Mapa de vías» (MED1108B): por cada sistema de StarSeed, si funciona ahora, por qué medio y qué falta.
// Solo lectura. Cruza los conectores vivos con la tabla del contrato `red-sin-dependencias.md` §2.
import { useEffect, useState } from 'react';
import { CheckCircle2, CircleDashed, CircleOff, Route } from 'lucide-react';
import { construirMapaVias, type EstadoAhora, type FilaMapaVias } from '@/lib/malla/conectores/mapa-vias';
import { descubrirVias } from '@/lib/malla/conectores/registro';
import { instalarConectoresBase } from '@/lib/malla/conectores/adaptadores';
import type { ViaViva } from '@/lib/malla/conectores/tipos';

const TEXTO: Record<EstadoAhora, string> = { funciona: 'Funciona', parcial: 'A medias', no: 'No funciona' };
const COLOR: Record<EstadoAhora, string> = { funciona: 'text-emerald-500', parcial: 'text-amber-500', no: 'text-rose-400' };
const ICONO: Record<EstadoAhora, typeof CheckCircle2> = { funciona: CheckCircle2, parcial: CircleDashed, no: CircleOff };

/** Parte presentacional: recibe las filas ya calculadas (fácil de probar). */
export function PanelMapaVias({ filas, cargando = false }: { filas: FilaMapaVias[]; cargando?: boolean }) {
  const n = filas.filter((f) => f.ahora === 'funciona').length;
  return (
    <section aria-label="Mapa de vías" className="rounded-xl border border-border/40 bg-card/40 p-3 backdrop-blur-sm sm:p-4">
      <header className="flex items-center gap-2">
        <Route className="h-4 w-4 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold">Mapa de vías</h3>
        <span className="ml-auto text-xs text-muted-foreground" data-testid="mapa-vias-resumen">
          {cargando ? 'mirando los medios…' : `${n} de ${filas.length} funcionan ahora`}
        </span>
      </header>
      <p className="mt-1 text-xs text-muted-foreground">
        Por cada sistema: si funciona ahora, por qué medio viaja y qué falta para que funcione sin internet.
      </p>
      <ul className="mt-3 space-y-2" aria-live="polite">
        {filas.map((f) => {
          const Icono = ICONO[f.ahora];
          return (
            <li key={f.sistema.id} data-testid={`mapa-vias-${f.sistema.id}`} className="rounded-lg border border-border/30 bg-background/20 p-2.5 text-xs">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <Icono className={`h-3.5 w-3.5 shrink-0 ${COLOR[f.ahora]}`} aria-hidden="true" />
                <span className="font-medium">{f.sistema.nombre}</span>
                <span className={`font-medium ${COLOR[f.ahora]}`} data-testid={`mapa-vias-${f.sistema.id}-estado`}>{TEXTO[f.ahora]}</span>
                {f.sistema.fase && f.falta.length > 0 && <span className="ml-auto text-[11px] text-muted-foreground">{f.sistema.fase}</span>}
              </p>
              <p className="mt-1 text-muted-foreground">{f.resumen}</p>
              {f.medios.length > 0 && (
                <p className="mt-1 break-words">
                  <span className="text-muted-foreground">Por: </span>{f.medios.join(' · ')}
                </p>
              )}
              {f.falta.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                  {f.falta.map((x) => <li key={x}>{x}</li>)}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Conectado a los medios vivos: mira cada 4 s y cuando cambia la conexión a internet. */
export function PanelMapaViasVivo() {
  const [vias, setVias] = useState<ViaViva[] | null>(null);
  const [enInternet, setEnInternet] = useState<boolean>(() => (typeof navigator === 'undefined' ? false : navigator.onLine !== false));
  useEffect(() => {
    const quitar = instalarConectoresBase();
    let vivo = true;
    const mirar = () => {
      descubrirVias().then((v) => { if (vivo) setVias(v); }).catch(() => { if (vivo) setVias([]); });
    };
    const red = () => { setEnInternet(navigator.onLine !== false); mirar(); };
    mirar();
    const t = setInterval(mirar, 4000);
    window.addEventListener('online', red);
    window.addEventListener('offline', red);
    return () => { vivo = false; clearInterval(t); window.removeEventListener('online', red); window.removeEventListener('offline', red); quitar(); };
  }, []);
  return <PanelMapaVias filas={construirMapaVias(vias ?? [], enInternet)} cargando={vias === null} />;
}
