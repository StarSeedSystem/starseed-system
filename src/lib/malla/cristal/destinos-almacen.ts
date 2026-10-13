// Destinos de guardado de cada dato (malla cristalina §5), módulo puro.
// Sin node:*, sin Supabase y sin window: se usa también desde el navegador.

import type { Dato } from './tipos';

export type TipoDestino = 'aparato' | 'cerebro' | 'biblioteca' | 'servidor';

export interface DestinoAlmacen {
  id: string;
  tipo: TipoDestino;
  motor: string;
  publico: boolean;
  cerebroId?: string;
}

export interface EntornoDestinos {
  /** Política del contexto (chat, grupo, página): ids de destino en orden. */
  politicaContexto: string[];
  /** Destinos que existen de verdad en los cerebros vinculados. */
  disponibles: DestinoAlmacen[];
  /** Elección explícita por dato; si viene, manda sobre la política. */
  elegidosPorDato?: string[];
  /** Motores con implementación real (starseed, gcs, gdrive…). */
  motoresReales: string[];
}

export interface ResultadoDestinos {
  guardar: DestinoAlmacen[];
  descartados: Array<{ id: string; motivo: string }>;
}

function motivoDescarte(d: DestinoAlmacen, dato: Dato, e: EntornoDestinos): string | null {
  if (d.publico && dato.clase !== 'publico') {
    return 'destino público no admite datos privados ni internos';
  }
  if (d.tipo !== 'aparato' && !e.motoresReales.includes(d.motor)) {
    return `motor «${d.motor}» aún sin motor de guardado`;
  }
  return null;
}

/**
 * Decide dónde se guarda un dato: usa `elegidosPorDato` si viene,
 * si no la política del contexto. Respeta el orden pedido y descarta
 * con motivo en español lo que no existe, lo público prohibido y lo
 * que no tiene motor real (el aparato siempre es válido).
 */
export function destinosDe(dato: Dato, e: EntornoDestinos): ResultadoDestinos {
  const pedidos = e.elegidosPorDato ?? e.politicaContexto;
  const porId = new Map(e.disponibles.map((d) => [d.id, d]));
  const guardar: DestinoAlmacen[] = [];
  const descartados: Array<{ id: string; motivo: string }> = [];

  for (const id of pedidos) {
    const d = porId.get(id);
    if (!d) {
      descartados.push({ id, motivo: 'destino no existe en los cerebros vinculados' });
      continue;
    }
    const motivo = motivoDescarte(d, dato, e);
    if (motivo !== null) descartados.push({ id, motivo });
    else guardar.push(d);
  }
  return { guardar, descartados };
}
