'use client';

// Widget «Inspiración» (RFI1018K): tarjetas de referencias e inspiración para
// dashboard, escritorio, pizarra y capa flotante. Sin red ni reloj propios:
// las tarjetas de `referencias.buscar` llegan por props y, si no hay, las novedades del catálogo.

import { useMemo } from 'react';
import { Sparkles, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import catalogoReferencias from '../../../../config/referencias-inspiracion.json';
import type { TarjetaReferencia } from '@/lib/library/referencias/buscar-referencias';

/** Entrada mínima del catálogo que necesita el widget. */
export interface EntradaInspiracion {
  id: string;
  nombre: string;
  url: string;
  tema: string;
  que_es: string;
  verificado: string;
}

/** Catálogo mínimo: temas con nombre + entradas. */
export interface CatalogoInspiracion {
  temas: ReadonlyArray<{ id: string; nombre: string }>;
  entradas: ReadonlyArray<EntradaInspiracion>;
}

/** Tarjeta lista para pintarse en el widget. */
export interface TarjetaInspiracion {
  id: string;
  nombre: string;
  url: string;
  tema: string;
  porque: string;
}

const CATALOGO = catalogoReferencias as unknown as CatalogoInspiracion;

/** Elige las tarjetas: las de `referencias.buscar` para el contexto actual y,
 *  si no hay, las novedades del catálogo (más recientes primero). */
export function elegirTarjetas(
  catalogo: CatalogoInspiracion,
  previas?: ReadonlyArray<TarjetaReferencia> | null,
  maximo = 6,
): TarjetaInspiracion[] {
  const nombreTema = new Map(catalogo.temas.map((t) => [t.id, t.nombre]));
  const conNombre = (tema: string): string => nombreTema.get(tema) ?? tema;
  if (previas && previas.length > 0) {
    const deId = new Map(catalogo.entradas.map((e) => [e.id, e]));
    return previas.slice(0, maximo).map((t) => {
      const entrada = deId.get(t.entradaId);
      const url = t.enlaces.find((l) => l.url)?.url ?? entrada?.url ?? '';
      return {
        id: t.entradaId,
        nombre: entrada?.nombre ?? t.entradaId,
        url,
        tema: conNombre(entrada?.tema ?? ''),
        porque: t.porque,
      };
    });
  }
  return [...catalogo.entradas]
    .sort((a, b) => (a.verificado < b.verificado ? 1 : a.verificado > b.verificado ? -1 : 0))
    .slice(0, maximo)
    .map((e) => ({
      id: e.id,
      nombre: e.nombre,
      url: e.url,
      tema: conNombre(e.tema),
      porque: `Novedad del catálogo · ${e.que_es}`,
    }));
}

/** Widget compacto «Inspiración»: referencias de este contexto con
 *  «Usar como inspiración» (de la referencia sale un diseño propio, citándola). */
export function WidgetReferencias(
  { tarjetas, maximo = 6, onUsar }: {
    tarjetas?: ReadonlyArray<TarjetaReferencia>;
    maximo?: number;
    onUsar?: (t: TarjetaInspiracion) => void;
  },
) {
  const elegidas = useMemo(() => elegirTarjetas(CATALOGO, tarjetas, maximo), [tarjetas, maximo]);
  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4" aria-hidden />
        <span>Inspiración</span>
        <span className="ml-auto text-xs text-muted-foreground">{elegidas.length} referencias</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto">
        {elegidas.map((t) => (
          <div key={t.id} className="rounded-lg border p-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{t.nombre}</span>
              {t.tema && <Badge variant="secondary">{t.tema}</Badge>}
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.porque}</p>
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => onUsar?.(t)}>
                Usar como inspiración
              </Button>
              <a
                href={t.url}
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                aria-label={`Abrir ${t.nombre}`}
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
