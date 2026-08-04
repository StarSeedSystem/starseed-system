// src/components/network/living-graph.tsx
'use client';

/**
 * Cerebro — visualización geométrica única e integrada (antes "Gráfica Viva").
 *
 * Una sola visualización SVG estática (sin física ni movimiento) que muestra
 * las interconexiones reales entre Memoria Unificada (OpenHuman tree/FTS/KV),
 * Skills, Tools, Agentes, MCPs, Proveedores de IA, Sentidos y descubrimientos.
 *
 * Las "capas" son los TIPOS de conexión (uso, dependencia, exposición,
 * configuración, memoria, percepción, referencia, descubrimiento, manual)
 * — no gráficas separadas.
 *
 * Layout: mandala determinista de anillos concéntricos. El centro es `self`.
 * Coordenadas redondeadas a entero para que server y client rendericen
 * idénticamente (evita errores de hidratación de Next.js SSR).
 */

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  getLivingGraphStore,
  CONNECTION_LAYERS,
  type GraphNode,
  type GraphEdge,
  type GraphNodeKind,
  type GraphEdgeKind,
} from '@/hermes-integration/living-graph-store';
import { getOpenHumanEngine } from '@/hermes-integration/openhuman-bridge';
import {
  Link2,
  Plus,
  Trash2,
  RotateCcw,
  Info,
  X,
  Layers as LayersIcon,
  Search,
  Download,
  Brain,
  Save,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { MemoryAdminDialog } from './memory-admin-dialog';
import { Database as DatabaseIcon } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';

// ── Layout geométrico (coordenadas enteras = sin mismatch SSR) ──────────

const VIEW = { w: 1000, h: 1000, cx: 500, cy: 500 };

const RING_BY_KIND: Record<GraphNodeKind, number> = {
  self:         0,
  memory:       120,
  conversation: 150,
  sense:        210,
  skill:        290,
  agent:        320,
  tool:         370,
  discovery:    360,
  mcp:          420,
  provider:     460,
};

const ANGLE_OFFSET: Record<GraphNodeKind, number> = {
  self:         0,
  memory:       0,
  sense:        Math.PI / 7,
  skill:        Math.PI / 11,
  tool:         Math.PI / 5,
  agent:        Math.PI / 3,
  mcp:          Math.PI / 9,
  provider:     Math.PI / 13,
  discovery:    Math.PI / 4,
  conversation: Math.PI / 6,
};

const KIND_LABEL: Record<GraphNodeKind, string> = {
  self: 'Tú',
  memory: 'Memoria',
  conversation: 'Conversación',
  sense: 'Sentidos',
  skill: 'Skills',
  tool: 'Tools',
  agent: 'Agentes',
  discovery: 'Descubrimientos',
  mcp: 'MCPs',
  provider: 'Proveedores',
};

interface Positioned extends GraphNode {
  x: number;
  y: number;
}

/**
 * Calcula posiciones deterministas. Math.round → enteros idénticos
 * server↔client (sin error de hidratación por precisión flotante).
 */
function positionNodes(nodes: GraphNode[]): Map<string, Positioned> {
  const groups = new Map<GraphNodeKind, GraphNode[]>();
  // Orden estable por id para que el índice angular sea reproducible
  const sorted = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  sorted.forEach((n) => {
    const arr = groups.get(n.kind) ?? [];
    arr.push(n);
    groups.set(n.kind, arr);
  });

  const out = new Map<string, Positioned>();
  for (const [kind, list] of groups.entries()) {
    if (kind === 'self') {
      const self = list[0];
      if (self) out.set(self.id, { ...self, x: VIEW.cx, y: VIEW.cy });
      continue;
    }
    const r = RING_BY_KIND[kind];
    const offset = ANGLE_OFFSET[kind];
    const count = list.length;
    list.forEach((n, i) => {
      const angle = offset + (i / Math.max(count, 1)) * Math.PI * 2;
      out.set(n.id, {
        ...n,
        x: Math.round(VIEW.cx + Math.cos(angle) * r),
        y: Math.round(VIEW.cy + Math.sin(angle) * r),
      });
    });
  }
  return out;
}

// ── Sólidos platónicos como path SVG (estáticos) ────────────────────────

function nodeShape(kind: GraphNodeKind, x: number, y: number, size: number, selected: boolean) {
  const stroke = selected ? '#ffffff' : 'currentColor';
  const strokeWidth = selected ? 2.2 : 1.4;
  const common = { stroke, strokeWidth, fill: 'none' as const };
  switch (kind) {
    case 'self': {
      const points: string[] = [];
      for (let i = 0; i < 16; i++) {
        const r = i % 2 === 0 ? size * 1.4 : size * 0.7;
        const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
        points.push(`${Math.round(x + Math.cos(a) * r)},${Math.round(y + Math.sin(a) * r)}`);
      }
      return <polygon points={points.join(' ')} {...common} />;
    }
    case 'memory':
      return <circle cx={x} cy={y} r={size} {...common} />;
    case 'sense':
      return (
        <>
          <circle cx={x} cy={y} r={size} {...common} />
          <circle cx={x} cy={y} r={Math.round(size * 0.45)} {...common} strokeOpacity={0.5} />
        </>
      );
    case 'skill':
      return (
        <polygon
          points={`${x},${y - size} ${x + size},${y} ${x},${y + size} ${x - size},${y}`}
          {...common}
        />
      );
    case 'tool': {
      const s = Math.round(size * 0.9);
      return (
        <>
          <rect x={x - s} y={y - s} width={s * 2} height={s * 2} {...common} />
          <rect x={x - s + 3} y={y - s - 3} width={s * 2} height={s * 2} {...common} strokeOpacity={0.45} />
        </>
      );
    }
    case 'agent':
      return (
        <polygon
          points={`${x},${Math.round(y - size * 1.15)} ${x + size},${Math.round(y + size * 0.7)} ${x - size},${Math.round(y + size * 0.7)}`}
          {...common}
        />
      );
    case 'mcp': {
      const pts: string[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        pts.push(`${Math.round(x + Math.cos(a) * size)},${Math.round(y + Math.sin(a) * size)}`);
      }
      return <polygon points={pts.join(' ')} {...common} />;
    }
    case 'provider': {
      const pts: string[] = [];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        pts.push(`${Math.round(x + Math.cos(a) * size)},${Math.round(y + Math.sin(a) * size)}`);
      }
      return <polygon points={pts.join(' ')} {...common} />;
    }
    case 'discovery':
      return (
        <>
          <circle cx={x} cy={y} r={size + 4} {...common} strokeOpacity={0.3} strokeDasharray="2 3" />
          <polygon
            points={`${x},${y - size} ${x + size},${y} ${x},${y + size} ${x - size},${y}`}
            {...common}
          />
        </>
      );
    case 'conversation':
      return <circle cx={x} cy={y} r={size} {...common} strokeDasharray="3 2" />;
  }
}

// ── Componente principal ────────────────────────────────────────────────

interface LivingGraphProps {
  className?: string;
}

export function LivingGraph({ className }: LivingGraphProps) {
  const confirm = useConfirm();
  const store = getLivingGraphStore();
  const [tick, setTick] = useState(0);
  // mounted: solo true en cliente. El primer render del cliente coincide
  // con el del server (placeholder), evitando el hydration mismatch.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const unsubscribe = store.subscribe(() => setTick((t) => t + 1));
    return () => { unsubscribe(); };
  }, [store]);

  // Estado de UI
  const [visibleLayers, setVisibleLayers] = useState<Record<GraphEdgeKind, boolean>>(() =>
    CONNECTION_LAYERS.reduce(
      (acc, l) => ({ ...acc, [l.id]: true }),
      {} as Record<GraphEdgeKind, boolean>
    )
  );
  const [visibleKinds, setVisibleKinds] = useState<Record<GraphNodeKind, boolean>>(() =>
    (Object.keys(KIND_LABEL) as GraphNodeKind[]).reduce(
      (acc, k) => ({ ...acc, [k]: true }),
      {} as Record<GraphNodeKind, boolean>
    )
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<{ sourceId: string; targetId: string } | null>(null);
  const [newEdgeKind, setNewEdgeKind] = useState<GraphEdgeKind>('custom');
  const [newEdgeLabel, setNewEdgeLabel] = useState('');

  // Búsqueda y panel de añadir nodo
  const [searchQuery, setSearchQuery] = useState('');
  const [addNodeOpen, setAddNodeOpen] = useState(false);
  // Memoria admin: nodo cuya ventana de admin está abierta
  const [adminNodeId, setAdminNodeId] = useState<string | null>(null);
  const [newNode, setNewNode] = useState<{ label: string; description: string; kind: GraphNodeKind }>({
    label: '',
    description: '',
    kind: 'tool',
  });

  // Datos (solo se materializan en cliente para evitar mismatch)
  const nodes = mounted ? store.getNodes() : [];
  const edges = mounted ? store.getEdges() : [];
  const positioned = useMemo(() => positionNodes(nodes), [nodes, tick, mounted]);

  // Aplicar filtros de tipo de nodo y búsqueda
  const filteredNodeIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const ids = new Set<string>();
    nodes.forEach((n) => {
      if (!visibleKinds[n.kind] && n.kind !== 'self') return;
      if (q) {
        const hit = n.label.toLowerCase().includes(q) ||
          (n.description ?? '').toLowerCase().includes(q);
        if (!hit) return;
      }
      ids.add(n.id);
    });
    // Self siempre visible
    ids.add('self');
    return ids;
  }, [nodes, visibleKinds, searchQuery]);

  const toggleLayer = (id: GraphEdgeKind) =>
    setVisibleLayers((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleKind = (id: GraphNodeKind) =>
    setVisibleKinds((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleNodeClick = (id: string) => {
    if (!connectMode) {
      setSelected(id === selected ? null : id);
      return;
    }
    if (!selected) {
      setSelected(id);
      return;
    }
    if (selected === id) {
      setSelected(null);
      return;
    }
    setPendingConnection({ sourceId: selected, targetId: id });
  };

  const confirmConnection = () => {
    if (!pendingConnection) return;
    const created = store.addEdge({
      sourceId: pendingConnection.sourceId,
      targetId: pendingConnection.targetId,
      kind: newEdgeKind,
      label: newEdgeLabel.trim() || undefined,
      origin: 'user',
    });
    if (created) {
      const s = store.getNode(created.sourceId)?.label ?? created.sourceId;
      const t = store.getNode(created.targetId)?.label ?? created.targetId;
      toast.success(`Conexión: ${s} —[${created.kind}]→ ${t}`);
    } else {
      toast.warning('Esa conexión ya existe.');
    }
    setPendingConnection(null);
    setNewEdgeLabel('');
    setSelected(null);
  };

  const removeEdge = (edgeId: string) => {
    if (store.removeEdge(edgeId)) toast.success('Conexión eliminada.');
  };

  const resetGraph = async () => {
    if (!(await confirm({
      title: "Restablecer Cerebro",
      description: "¿Restablecer el Cerebro al estado semilla? Las conexiones y nodos manuales se perderán.",
      destructive: true,
    }))) return;
    store.reset();
    toast.success('Cerebro reiniciado.');
  };

  const exportGraph = () => {
    const data = JSON.stringify({ nodes: store.getNodes(), edges: store.getEdges() }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cerebro-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Cerebro exportado.');
  };

  const snapshotToMemory = () => {
    const summary = store.textualSummary();
    getOpenHumanEngine().ingest(summary, 'system', `cerebro-snapshot-${Date.now()}`);
    getOpenHumanEngine().kv.store('global', 'cerebro_snapshot_latest', new Date().toISOString(), 'core');
    toast.success('Snapshot del Cerebro guardado en memoria OpenHuman.');
  };

  const createCustomNode = () => {
    if (!newNode.label.trim()) {
      toast.error('El nodo necesita una etiqueta.');
      return;
    }
    const id = `custom-${newNode.kind}-${Date.now().toString(36)}`;
    store.addNode({
      id,
      kind: newNode.kind,
      label: newNode.label.trim(),
      description: newNode.description.trim() || undefined,
    } as any);
    // Conectar automáticamente a self como punto de partida
    store.addEdge({ sourceId: 'self', targetId: id, kind: 'custom', origin: 'user' });
    setNewNode({ label: '', description: '', kind: 'tool' });
    setAddNodeOpen(false);
    toast.success(`Nodo "${newNode.label}" añadido y conectado a Tú.`);
  };

  // Aristas visibles (filtradas por capa Y por nodos visibles)
  const visibleEdges = useMemo(
    () =>
      edges.filter(
        (e) =>
          visibleLayers[e.kind] &&
          filteredNodeIds.has(e.sourceId) &&
          filteredNodeIds.has(e.targetId)
      ),
    [edges, visibleLayers, filteredNodeIds]
  );

  const highlightedEdgeIds = useMemo(() => {
    if (!selected) return new Set<string>();
    return new Set(
      edges.filter((e) => e.sourceId === selected || e.targetId === selected).map((e) => e.id)
    );
  }, [edges, selected]);

  const neighborIds = useMemo(() => {
    if (!selected) return new Set<string>();
    const ns = new Set<string>();
    edges.forEach((e) => {
      if (e.sourceId === selected) ns.add(e.targetId);
      if (e.targetId === selected) ns.add(e.sourceId);
    });
    return ns;
  }, [edges, selected]);

  const layerCounts = useMemo(() => {
    const counts: Record<GraphEdgeKind, number> = {} as any;
    CONNECTION_LAYERS.forEach((l) => (counts[l.id] = 0));
    edges.forEach((e) => { counts[e.kind] = (counts[e.kind] ?? 0) + 1; });
    return counts;
  }, [edges]);

  const kindCounts = useMemo(() => {
    const counts: Record<GraphNodeKind, number> = {} as any;
    (Object.keys(KIND_LABEL) as GraphNodeKind[]).forEach((k) => (counts[k] = 0));
    nodes.forEach((n) => { counts[n.kind] = (counts[n.kind] ?? 0) + 1; });
    return counts;
  }, [nodes]);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className={cn('space-y-3', className)}>
      {/* Barra de controles superior */}
      <Card className="liquid-glass-panel border-white/10">
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/[0.06] backdrop-blur px-3 py-1 text-[10px] uppercase tracking-wider font-bold text-purple-300">
              <Brain className="w-3.5 h-3.5" /> Cerebro
            </div>
            <div className="inline-flex items-center gap-2 relative">
              <Search className="absolute left-2 w-3 h-3 text-muted-foreground pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar nodo..."
                className="h-7 text-xs pl-7 w-44 bg-black/30"
              />
            </div>
            <span className="text-[10px] text-muted-foreground">
              {visibleEdges.length}/{edges.length} aristas · {filteredNodeIds.size}/{nodes.length} nodos
            </span>
            <div className="ml-auto flex items-center gap-1.5 flex-wrap">
              <Button
                size="sm"
                variant={connectMode ? 'default' : 'outline'}
                className="h-7 text-xs btn-pill"
                onClick={() => {
                  setConnectMode((m) => !m);
                  setSelected(null);
                  setPendingConnection(null);
                }}
              >
                <Link2 className="w-3 h-3 mr-1" />
                {connectMode ? 'Cancelar' : 'Conectar'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs btn-pill"
                onClick={() => setAddNodeOpen((v) => !v)}
              >
                <Plus className="w-3 h-3 mr-1" />
                Nodo
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs btn-pill"
                onClick={snapshotToMemory}
                title="Guardar el estado actual como recuerdo en OpenHuman"
              >
                <Save className="w-3 h-3 mr-1" />
                Recordar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs btn-pill"
                onClick={exportGraph}
                title="Descargar JSON del Cerebro"
              >
                <Download className="w-3 h-3 mr-1" />
                Exportar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs btn-pill"
                onClick={resetGraph}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset
              </Button>
            </div>
          </div>

          {/* Filtros de tipo de nodo (anillos) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold inline-flex items-center gap-1 mr-1">
              <Filter className="w-3 h-3" /> Anillos
            </span>
            {(Object.keys(KIND_LABEL) as GraphNodeKind[])
              .filter((k) => k !== 'self')
              .map((kind) => {
                const active = visibleKinds[kind];
                const count = kindCounts[kind] ?? 0;
                if (count === 0) return null;
                return (
                  <button
                    key={kind}
                    onClick={() => toggleKind(kind)}
                    className={cn(
                      'cursor-pointer rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-all',
                      active ? 'border-white/20 bg-white/[0.05] text-foreground/90' : 'border-white/5 opacity-50 hover:opacity-80'
                    )}
                  >
                    {KIND_LABEL[kind]} <span className="opacity-60">{count}</span>
                  </button>
                );
              })}
          </div>

          {/* Capas (tipos de conexión) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold inline-flex items-center gap-1 mr-1">
              <LayersIcon className="w-3 h-3" /> Conexiones
            </span>
            {CONNECTION_LAYERS.map((layer) => {
              const active = visibleLayers[layer.id];
              const count = layerCounts[layer.id] ?? 0;
              return (
                <button
                  key={layer.id}
                  onClick={() => toggleLayer(layer.id)}
                  className={cn(
                    'cursor-pointer rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-all flex items-center gap-1.5 backdrop-blur-sm',
                    active ? 'border-white/20 bg-white/[0.05]' : 'border-white/5 opacity-50 hover:opacity-80'
                  )}
                  style={{ color: active ? layer.color : undefined }}
                  title={layer.description}
                >
                  <span
                    className="inline-block w-3 border-t-2"
                    style={{ borderColor: layer.color, borderStyle: layer.dashed ? 'dashed' : 'solid' }}
                  />
                  {layer.label}
                  <span className="opacity-60">{count}</span>
                </button>
              );
            })}
          </div>

          {connectMode && (
            <div className="text-[11px] text-purple-300 bg-purple-500/5 border border-purple-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
              <Info className="w-3 h-3 shrink-0" />
              {!selected
                ? 'Haz click en el nodo de origen.'
                : !pendingConnection
                ? `Origen: ${store.getNode(selected)?.label}. Ahora haz click en el destino.`
                : 'Elige el tipo de conexión a crear en el panel derecho.'}
            </div>
          )}

          {addNodeOpen && (
            <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-cyan-300 font-bold">
                Nuevo nodo en el Cerebro
              </p>
              <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
                <Input
                  placeholder="Etiqueta"
                  value={newNode.label}
                  onChange={(e) => setNewNode((n) => ({ ...n, label: e.target.value }))}
                  className="h-8 text-xs"
                />
                <Select
                  value={newNode.kind}
                  onValueChange={(v) => setNewNode((n) => ({ ...n, kind: v as GraphNodeKind }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(KIND_LABEL) as GraphNodeKind[])
                      .filter((k) => k !== 'self')
                      .map((k) => (
                        <SelectItem key={k} value={k} className="text-xs">
                          {KIND_LABEL[k]}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8 text-xs" onClick={createCustomNode}>
                  <Plus className="w-3 h-3 mr-1" /> Crear
                </Button>
              </div>
              <Textarea
                placeholder="Descripción opcional"
                value={newNode.description}
                onChange={(e) => setNewNode((n) => ({ ...n, description: e.target.value }))}
                rows={2}
                className="text-xs resize-none"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* SVG y panel lateral */}
      <div className="grid lg:grid-cols-[1fr_280px] gap-3">
        <Card className="liquid-glass-panel border-white/10 overflow-hidden">
          <CardContent className="p-0">
            {!mounted ? (
              <div className="aspect-square w-full flex items-center justify-center text-muted-foreground text-xs">
                <Brain className="w-5 h-5 mr-2 opacity-50" />
                Cargando Cerebro...
              </div>
            ) : (
              <svg
                viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
                className="w-full h-auto block"
                style={{ background: 'radial-gradient(circle at center, rgba(168,85,247,0.05), transparent 70%)' }}
              >
                {/* Anillos guía */}
                {Array.from(new Set(Object.values(RING_BY_KIND).filter((r) => r > 0))).map((r) => (
                  <circle
                    key={r}
                    cx={VIEW.cx}
                    cy={VIEW.cy}
                    r={r}
                    fill="none"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth={0.5}
                    strokeDasharray="2 4"
                  />
                ))}

                {/* Aristas */}
                <g>
                  {visibleEdges.map((e) => {
                    const s = positioned.get(e.sourceId);
                    const t = positioned.get(e.targetId);
                    if (!s || !t) return null;
                    const layer = CONNECTION_LAYERS.find((l) => l.id === e.kind);
                    const isHi = highlightedEdgeIds.has(e.id);
                    return (
                      <g key={e.id}>
                        <line
                          x1={s.x}
                          y1={s.y}
                          x2={t.x}
                          y2={t.y}
                          stroke={layer?.color ?? '#ffffff'}
                          strokeOpacity={selected ? (isHi ? 0.95 : 0.12) : 0.5}
                          strokeWidth={isHi ? 2.2 : 1}
                          strokeDasharray={layer?.dashed ? '4 4' : undefined}
                        />
                        {isHi && e.origin === 'user' && (
                          <circle
                            cx={Math.round((s.x + t.x) / 2)}
                            cy={Math.round((s.y + t.y) / 2)}
                            r={6}
                            fill="rgba(0,0,0,0.7)"
                            stroke={layer?.color ?? '#fff'}
                            strokeOpacity={0.8}
                            onClick={(ev) => { ev.stopPropagation(); removeEdge(e.id); }}
                            style={{ cursor: 'pointer' }}
                          />
                        )}
                      </g>
                    );
                  })}
                </g>

                {/* Nodos */}
                <g>
                  {Array.from(positioned.values())
                    .filter((n) => filteredNodeIds.has(n.id))
                    .map((n) => {
                      const isSelected = n.id === selected;
                      const isNeighbor = neighborIds.has(n.id);
                      const dim = selected && !isSelected && !isNeighbor;
                      const isPendingSource = pendingConnection?.sourceId === n.id || (selected === n.id && connectMode);
                      const isPendingTarget = pendingConnection?.targetId === n.id;
                      const size = n.kind === 'self' ? 22 : 12;
                      return (
                        <g
                          key={n.id}
                          style={{ cursor: 'pointer', opacity: dim ? 0.25 : 1, color: n.color }}
                          onClick={() => handleNodeClick(n.id)}
                        >
                          {(isSelected || isPendingSource || isPendingTarget) && (
                            <circle
                              cx={n.x}
                              cy={n.y}
                              r={size + 8}
                              fill={n.color}
                              fillOpacity={0.15}
                              stroke={n.color}
                              strokeWidth={1.5}
                              strokeDasharray={isPendingSource || isPendingTarget ? '3 3' : undefined}
                            />
                          )}
                          {nodeShape(n.kind, n.x, n.y, size, !!isSelected)}
                          <text
                            x={n.x}
                            y={n.y + size + 14}
                            textAnchor="middle"
                            fontSize={n.kind === 'self' ? 14 : 10}
                            fill="rgba(255,255,255,0.85)"
                            style={{ pointerEvents: 'none', fontWeight: n.kind === 'self' ? 700 : 400 }}
                          >
                            {n.label}
                          </text>
                          <title>{`${n.label} · ${n.kind} · ${n.frequency} Hz${n.description ? ' — ' + n.description : ''}`}</title>
                        </g>
                      );
                    })}
                </g>
              </svg>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3">
          {pendingConnection && (
            <Card className="liquid-glass-panel border-purple-500/30 bg-purple-500/[0.04]">
              <CardContent className="p-3 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-purple-300 font-bold mb-1">
                      Nueva conexión
                    </p>
                    <p className="text-xs">
                      <span className="text-cyan-300 font-semibold">{store.getNode(pendingConnection.sourceId)?.label}</span>
                      <span className="text-muted-foreground mx-1">→</span>
                      <span className="text-emerald-300 font-semibold">{store.getNode(pendingConnection.targetId)?.label}</span>
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => { setPendingConnection(null); setNewEdgeLabel(''); }}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Tipo de relación
                  </label>
                  <Select value={newEdgeKind} onValueChange={(v) => setNewEdgeKind(v as GraphEdgeKind)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONNECTION_LAYERS.map((l) => (
                        <SelectItem key={l.id} value={l.id} className="text-xs">
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Etiqueta (opcional)"
                    value={newEdgeLabel}
                    onChange={(e) => setNewEdgeLabel(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Button size="sm" className="w-full h-8 text-xs" onClick={confirmConnection}>
                    <Plus className="w-3 h-3 mr-1" /> Crear conexión
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {selected && !pendingConnection && (
            <NodeDetail
              nodeId={selected}
              onClose={() => setSelected(null)}
              onDeleteEdge={removeEdge}
              onOpenAdmin={() => setAdminNodeId(selected)}
            />
          )}

          {!selected && !pendingConnection && (
            <Card className="liquid-glass-panel border-white/10">
              <CardContent className="p-4 space-y-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  Cerebro
                </p>
                <p className="text-xs text-muted-foreground">
                  Una sola visualización geométrica integra Memoria Unificada (OpenHuman: tree, FTS, KV),
                  agentes, sentidos, MCPs, skills, tools y proveedores. Las capas filtran los tipos de conexión.
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Stat label="Nodos" value={nodes.length} />
                  <Stat label="Aristas" value={edges.length} />
                  <Stat label="Manuales" value={edges.filter((e) => e.origin === 'user').length} />
                  <Stat label="Capas activas" value={Object.values(visibleLayers).filter(Boolean).length} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Memory Admin Dialog: administrador completo del nodo seleccionado */}
      <MemoryAdminDialog
        nodeId={adminNodeId}
        open={!!adminNodeId}
        onOpenChange={(o) => !o && setAdminNodeId(null)}
      />
    </div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────

function NodeDetail({
  nodeId,
  onClose,
  onDeleteEdge,
  onOpenAdmin,
}: {
  nodeId: string;
  onClose: () => void;
  onDeleteEdge: (edgeId: string) => void;
  onOpenAdmin: () => void;
}) {
  const store = getLivingGraphStore();
  const node = store.getNode(nodeId);
  if (!node) return null;
  const adjacent = store.edgesOf(nodeId);

  return (
    <Card className="liquid-glass-panel border-white/10" style={{ borderColor: `${node.color}55` }}>
      <CardContent className="p-3 space-y-3">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: node.color }}>
              {node.kind} · {node.frequency} Hz
            </p>
            <h4 className="text-sm font-bold" style={{ color: node.color }}>{node.label}</h4>
            {node.description && (
              <p className="text-[11px] text-muted-foreground mt-1">{node.description}</p>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onClose}>
            <X className="w-3 h-3" />
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs btn-pill"
          onClick={onOpenAdmin}
          style={{ borderColor: `${node.color}55`, color: node.color }}
        >
          <DatabaseIcon className="w-3 h-3 mr-1.5" />
          Administrar memoria
        </Button>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">
            Conexiones ({adjacent.length})
          </p>
          {adjacent.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">
              Sin conexiones. Activa "Conectar" para enlazar este nodo.
            </p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {adjacent.map((e: GraphEdge) => {
                const other = e.sourceId === nodeId ? store.getNode(e.targetId) : store.getNode(e.sourceId);
                const layer = CONNECTION_LAYERS.find((l) => l.id === e.kind);
                const isOutgoing = e.sourceId === nodeId;
                return (
                  <div
                    key={e.id}
                    className="flex items-center gap-1.5 text-[11px] py-1 px-2 rounded border bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
                    style={{ borderColor: `${layer?.color ?? '#fff'}33` }}
                  >
                    <span className="text-muted-foreground shrink-0">{isOutgoing ? '→' : '←'}</span>
                    <Badge
                      variant="outline"
                      className="text-[9px] shrink-0"
                      style={{ borderColor: layer?.color, color: layer?.color }}
                    >
                      {e.kind}
                    </Badge>
                    <span className="truncate flex-1">{other?.label ?? '?'}</span>
                    {e.origin === 'user' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => onDeleteEdge(e.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 px-2 py-1.5 text-center">
      <div className="text-base font-bold font-mono text-foreground/90">{value}</div>
      <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}
