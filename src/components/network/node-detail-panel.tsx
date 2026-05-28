'use client';

import type { GraphNode3D } from '@/hermes-integration/01-types';
import { getNodeTypeColor, getHarmonicForType } from '@/hermes-integration/02-layers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  X, Clock, Hash, Activity, Tag, Database, Layers, Music,
} from 'lucide-react';

interface NodeDetailPanelProps {
  node: GraphNode3D;
  onClose: () => void;
}

export function NodeDetailPanel({ node, onClose }: NodeDetailPanelProps) {
  const harmonic = getHarmonicForType(node.type);

  return (
    <Card className="border-white/10 bg-black/80 backdrop-blur-xl shadow-2xl animate-in slide-in-from-bottom-5 duration-300">
      <CardHeader className="flex flex-row items-start justify-between pb-3">
        <div className="flex items-center gap-3">
          {/* Type indicator */}
          <div
            className="w-4 h-4 rounded-full border-2"
            style={{ borderColor: node.color || getNodeTypeColor(node.type) }}
          />
          <div>
            <CardTitle className="text-base">{node.label}</CardTitle>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{node.id}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="w-3 h-3" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Badge row */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Database className="w-3 h-3" />
            {node.type}
          </Badge>
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Activity className="w-3 h-3" />
            {node.size.toFixed(1)}px
          </Badge>
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Music className="w-3 h-3" />
            {node.frequency.toFixed(1)} Hz
          </Badge>
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Hash className="w-3 h-3" />
            {(node.data as any)?.accessCount || 0} accesos
          </Badge>
        </div>

        <Separator className="bg-white/5" />

        {/* Harmonic information */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/5 rounded-lg p-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Geometría</p>
            <p className="font-semibold text-sm">{harmonic.solid}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Frecuencia</p>
            <p className="font-semibold text-sm">{harmonic.base} Hz</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Armonía</p>
            <p className="font-semibold text-sm">{harmonic.name}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Capa</p>
            <p className="font-semibold text-sm capitalize">{node.type}</p>
          </div>
        </div>

        {/* Tags */}
        {(node.data as any)?.tags?.length > 0 && (
          <>
            <Separator className="bg-white/5" />
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Tag className="w-3 h-3" /> Tags
              </p>
              <div className="flex flex-wrap gap-1">
                {(node.data as any).tags.map((tag: string) => (
                  <Badge key={tag} variant="secondary" className="text-[9px] font-mono">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Description */}
        {(node.data as any)?.description && (
          <>
            <Separator className="bg-white/5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {(node.data as any).description}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}