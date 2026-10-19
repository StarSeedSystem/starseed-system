'use client';

import { PanelProtomoleculaAutonomo } from './panel-protomolecula';
import type { CanvasEdge } from '@/lib/canvas/workcenters';

export interface BloquePizarraProtomoleculaProps {
  moleculaId: string;
  aristasEntrantes: CanvasEdge[];
  aristasSalientes: CanvasEdge[];
}

export function BloquePizarraProtomolecula({ moleculaId, aristasEntrantes, aristasSalientes }: BloquePizarraProtomoleculaProps) {
  const incomingIds = aristasEntrantes.map(e => e.from);
  const outgoingIds = aristasSalientes.map(e => e.to);

  return (
    <div>
      <PanelProtomoleculaAutonomo compacto moleculaId={moleculaId} />
      <div className="mt-2 text-sm text-muted-foreground">
        Recibe de: {incomingIds.length > 0 ? incomingIds.join(', ') : 'ninguno'} | 
        Alimenta a: {outgoingIds.length > 0 ? outgoingIds.join(', ') : 'ninguno'}
      </div>
    </div>
  );
}