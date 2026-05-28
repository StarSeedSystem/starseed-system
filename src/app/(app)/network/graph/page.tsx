'use client';

import { useState } from 'react';
import { LivingGraph } from '@/components/network/living-graph';
import { CONNECTION_LAYERS } from '@/hermes-integration/living-graph-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Brain, Info } from 'lucide-react';

/**
 * Cerebro — única visualización integrada del sistema (antes Gráfica Viva).
 *
 * Materializa visualmente las interconexiones reales entre la memoria
 * unificada (OpenHuman tree/FTS/KV), agentes, sentidos, MCPs, skills,
 * tools, proveedores de IA y descubrimientos. Las "capas" filtran los
 * tipos de conexión, no son gráficas separadas.
 */
export default function GraphPage() {
  const [showLegend, setShowLegend] = useState(true);

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Brain className="w-6 h-6 text-purple-400" />
          <div>
            <h2 className="text-xl font-bold">Cerebro</h2>
            <p className="text-xs text-muted-foreground/60">
              Memoria unificada · Sentidos · Skills · Tools · Agentes · MCPs · IA
            </p>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono border-purple-500/30 text-purple-400">
            Geometría sagrada · Estática
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowLegend(!showLegend)}
          className="gap-1 text-xs"
        >
          <Info className="w-3 h-3" />
          {showLegend ? 'Ocultar leyenda' : 'Leyenda'}
        </Button>
      </div>

      <LivingGraph />

      {showLegend && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-black/20 border border-white/5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              Geometrías de los nodos
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {[
                { shape: '★', label: 'Tú (centro)', color: '#fbbf24' },
                { shape: '●', label: 'Memoria · Conversación', color: '#38bdf8' },
                { shape: '◉', label: 'Sentido', color: '#fb7185' },
                { shape: '◆', label: 'Skill', color: '#a78bfa' },
                { shape: '◼', label: 'Tool', color: '#39FF14' },
                { shape: '▲', label: 'Agente', color: '#FFBF00' },
                { shape: '⬡', label: 'MCP', color: '#34d399' },
                { shape: '⬠', label: 'Proveedor IA', color: '#f472b6' },
                { shape: '◇', label: 'Descubrimiento', color: '#fbbf24' },
              ].map((g) => (
                <div key={g.label} className="flex items-center gap-2">
                  <span className="w-6 text-center font-bold" style={{ color: g.color }}>{g.shape}</span>
                  <span style={{ color: g.color }}>{g.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-black/20 border border-white/5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              Tipos de conexión (capas filtrables)
            </p>
            <div className="grid grid-cols-1 gap-1.5 text-[11px]">
              {CONNECTION_LAYERS.map((layer) => (
                <div key={layer.id} className="flex items-center gap-2">
                  <span
                    className="inline-block w-5 shrink-0"
                    style={{
                      borderTop: `2px ${layer.dashed ? 'dashed' : 'solid'} ${layer.color}`,
                    }}
                  />
                  <span style={{ color: layer.color }} className="font-semibold">
                    {layer.label}
                  </span>
                  <span className="text-muted-foreground truncate">— {layer.description}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="md:col-span-2 p-4 rounded-xl bg-black/20 border border-white/5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
              Cómo usar la Gráfica Viva
            </p>
            <ul className="text-[11px] text-muted-foreground space-y-1">
              <li>• Click en un nodo: ilumina sus conexiones y atenúa el resto.</li>
              <li>• Click en el círculo central de una conexión iluminada: la elimina (solo manuales).</li>
              <li>• "Conectar nodos": activa el modo conexión, luego click origen + click destino + elige tipo.</li>
              <li>• "Capas": cada pill arriba filtra un tipo de conexión. Combina libremente.</li>
              <li>• El centro (★) eres tú. Los anillos concéntricos son las distintas capas funcionales.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
