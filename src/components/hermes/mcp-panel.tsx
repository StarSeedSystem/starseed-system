// src/components/hermes/mcp-panel.tsx
'use client';

/**
 * Panel de MCPs (Model Context Protocol Servers) del Exocórtex Hermes.
 *
 * Los MCPs son servidores externos que exponen herramientas a la IA personal
 * vía el protocolo MCP. El usuario puede activar/desactivar conexiones y
 * cada MCP activo aparece como nodo en la Gráfica Armónica de la Memoria
 * Unificada (capa 'mcp').
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link as LinkIcon, Plus, Server, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getLivingGraphStore } from '@/hermes-integration/living-graph-store';

interface McpEntry {
  id: string;
  name: string;
  transport: 'stdio' | 'http' | 'sse';
  url?: string;
  command?: string;
  enabled: boolean;
  description?: string;
}

const STORAGE_KEY = 'starseed.hermes.mcp.v1';

const SEED_MCPS: McpEntry[] = [
  {
    id: 'mcp-memory',
    name: 'Memoria Unificada',
    transport: 'http',
    url: 'internal://hermes/memory',
    enabled: true,
    description: 'Acceso directo a la Memoria Unificada (capa árbol + FTS5 + KV).',
  },
  {
    id: 'mcp-sincrometro',
    name: 'Sincrómetro',
    transport: 'http',
    url: 'internal://hermes/sincrometro',
    enabled: true,
    description: 'Eventos, recordatorios, alarmas y modo activo (gregoriano/astrológico/lunar).',
  },
  {
    id: 'mcp-fediverso',
    name: 'Fediverso (ActivityPub)',
    transport: 'sse',
    url: 'wss://relay.starseed.network/ap',
    enabled: false,
    description: 'Federación con otros nodos StarSeed y servidores ActivityPub.',
  },
];

export function McpPanel() {
  const [mcps, setMcps] = useState<McpEntry[]>([]);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setMcps(JSON.parse(stored));
        return;
      }
    } catch {
      /* ignore */
    }
    setMcps(SEED_MCPS);
  }, []);

  const persist = (next: McpEntry[]) => {
    setMcps(next);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* noop */ }
  };

  const toggle = (id: string) => {
    const updated = mcps.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m));
    persist(updated);
    // Reflejar en el grafo vivo: cada MCP activado se conecta a self.
    try {
      const store = getLivingGraphStore();
      const target = updated.find((m) => m.id === id);
      if (target && target.enabled) {
        const nodeId = `mcp-${id}`;
        if (!store.getNode(nodeId)) {
          store.addNode({
            id: nodeId,
            kind: 'mcp',
            label: target.name,
            description: target.description,
          } as any);
        }
        store.addEdge({ sourceId: 'self', targetId: nodeId, kind: 'uses', origin: 'system' });
      }
    } catch { /* noop */ }
  };

  const remove = (id: string) => {
    persist(mcps.filter((m) => m.id !== id));
  };

  const addNew = () => {
    if (!newName.trim() || !newUrl.trim()) {
      toast.error('Indica un nombre y un URL/comando para el MCP.');
      return;
    }
    const entry: McpEntry = {
      id: `mcp-${Date.now().toString(36)}`,
      name: newName.trim(),
      url: newUrl.trim(),
      transport: newUrl.startsWith('http') ? 'http' : 'stdio',
      enabled: false,
    };
    persist([...mcps, entry]);
    setNewName('');
    setNewUrl('');
    toast.success(`MCP "${entry.name}" añadido (desactivado por defecto).`);
  };

  const activeCount = mcps.filter((m) => m.enabled).length;

  return (
    <div className="space-y-4">
      <Card className="bg-black/20 border-white/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="w-5 h-5 text-emerald-400" />
            Servidores MCP
            <Badge variant="outline" className="ml-auto border-emerald-500/40 text-emerald-300">
              {activeCount} conectados / {mcps.length}
            </Badge>
          </CardTitle>
          <CardDescription>
            Cada MCP conectado se materializa como un nodo en la Gráfica Armónica
            de la Memoria Unificada (capa <strong>MCP</strong>). Las herramientas
            que expone quedan disponibles para los agentes del usuario.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {mcps.map((mcp) => (
            <div
              key={mcp.id}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-3 transition-all',
                mcp.enabled
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-white/5 bg-white/[0.02] opacity-80'
              )}
            >
              <div className={cn('p-2 rounded-lg bg-white/5', mcp.enabled ? 'text-emerald-400' : 'text-muted-foreground')}>
                <LinkIcon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="text-sm font-bold">{mcp.name}</h4>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] border-white/10">
                      {mcp.transport.toUpperCase()}
                    </Badge>
                    <Switch checked={mcp.enabled} onCheckedChange={() => toggle(mcp.id)} />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(mcp.id)}
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                {mcp.description && (
                  <p className="text-[11px] text-muted-foreground mt-1">{mcp.description}</p>
                )}
                {(mcp.url || mcp.command) && (
                  <p className="text-[10px] font-mono text-muted-foreground/70 mt-1 truncate">
                    {mcp.url ?? mcp.command}
                  </p>
                )}
              </div>
            </div>
          ))}

          <div className="rounded-xl border border-dashed border-white/10 p-3 bg-white/[0.02]">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Añadir MCP
            </p>
            <div className="grid sm:grid-cols-[1fr_2fr_auto] gap-2">
              <Input
                placeholder="Nombre"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-8 text-xs bg-black/30"
              />
              <Input
                placeholder="https://..., stdio://..., wss://..."
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="h-8 text-xs font-mono bg-black/30"
              />
              <Button size="sm" onClick={addNew} className="h-8 px-3">
                <Plus className="w-3.5 h-3.5 mr-1" /> Añadir
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
