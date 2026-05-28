'use client';

import { useState } from 'react';
import { LAYER_CONFIGS } from '@/hermes-integration/02-layers';
import type { MemoryLayer } from '@/hermes-integration/01-types';
import { cn } from '@/lib/utils';
import { Layers, Eye, EyeOff } from 'lucide-react';

interface LayerSelectorProps {
  activeLayer: MemoryLayer;
  onLayerChange: (layer: MemoryLayer) => void;
  secondaryLayers?: MemoryLayer[];
  onSecondaryLayersChange?: (layers: MemoryLayer[]) => void;
}

export function LayerSelector({
  activeLayer, onLayerChange,
  secondaryLayers = [], onSecondaryLayersChange,
}: LayerSelectorProps) {
  const [expanded, setExpanded] = useState(false);

  const layers = Object.values(LAYER_CONFIGS);

  return (
    <div className="absolute top-4 left-4 z-20 max-w-[220px]">
      <div className="bg-black/70 backdrop-blur-xl border border-white/10 rounded-xl p-3 space-y-2 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
            <Layers className="w-3 h-3" />
            Capas
          </h3>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? '▲' : '▼'}
          </button>
        </div>

        {/* Layer buttons */}
        <div className="space-y-0.5">
          {layers.map(layer => {
            const isActive = activeLayer === layer.id;
            return (
              <button
                key={layer.id}
                onClick={() => onLayerChange(isActive ? 'all' : layer.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all',
                  isActive
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'hover:bg-white/5 text-muted-foreground border border-transparent'
                )}
              >
                {/* Color indicator */}
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: layer.color }}
                />
                <span className="flex-1 text-left truncate">{layer.label}</span>
                {!layer.visibleByDefault && (
                  <EyeOff className="w-2.5 h-2.5 opacity-40" />
                )}
              </button>
            );
          })}
        </div>

        {/* Combination mode */}
        {expanded && (
          <div className="border-t border-white/10 pt-2 mt-2 space-y-0.5">
            <p className="text-[9px] uppercase text-muted-foreground tracking-wider px-1">
              Combinar
            </p>
            {layers.filter(l => l.id !== 'all' && l.id !== activeLayer).map(layer => (
              <label
                key={layer.id}
                className="flex items-center gap-2 px-2.5 py-1 rounded-lg hover:bg-white/5 cursor-pointer text-[11px]"
              >
                <input
                  type="checkbox"
                  checked={secondaryLayers.includes(layer.id)}
                  onChange={() => {
                    if (!onSecondaryLayersChange) return;
                    const next = secondaryLayers.includes(layer.id)
                      ? secondaryLayers.filter(l => l !== layer.id)
                      : [...secondaryLayers, layer.id];
                    onSecondaryLayersChange(next);
                  }}
                  className="rounded border-white/20 w-3 h-3"
                />
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: layer.color }}
                />
                {layer.label}
              </label>
            ))}
          </div>
        )}

        {/* Stats footer */}
        <div className="border-t border-white/10 pt-1.5 mt-1.5 flex justify-between text-[9px] text-muted-foreground">
          <span>{activeLayer === 'all' ? 'Todas las capas' : LAYER_CONFIGS[activeLayer]?.label || 'Personalizado'}</span>
          <span>{LAYER_CONFIGS[activeLayer]?.nodeTypes.length || 0} tipos</span>
        </div>
      </div>
    </div>
  );
}