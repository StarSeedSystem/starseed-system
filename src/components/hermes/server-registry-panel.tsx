// src/components/hermes/server-registry-panel.tsx
'use client';

/**
 * Panel para gestionar servidores y bases de datos. Permite al usuario elegir
 * dónde se guardan sus publicaciones, archivos, mensajes y eventos.
 *
 * Por defecto: servidor LOCAL (sin internet). El usuario puede activar
 * Supabase, Fediverso ActivityPub, IPFS o añadir un servidor remoto custom.
 *
 * Cada scope (posts, files, messages, events, memory, stories, agents)
 * puede tener un servidor distinto, o todos pueden compartir el activo.
 */

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  HardDrive, Database, Globe, Cloud, Plus, Check, X, Settings as SettingsIcon, Share2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  getServerRegistry,
  type ServerEntry,
  type ServerKind,
  type DatabaseKind,
} from '@/hermes-integration/server-registry';

const KIND_ICONS: Record<ServerKind, any> = {
  local: HardDrive,
  'remote-http': Globe,
  supabase: Cloud,
  fediverso: Share2,
  ipfs: Database,
  custom: SettingsIcon,
};

const SCOPES = ['posts', 'files', 'messages', 'events', 'memory', 'stories', 'agents'] as const;

export function ServerRegistryPanel() {
  const reg = getServerRegistry();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const unsub = reg.subscribe(() => setTick((t) => t + 1));
    return () => { unsub(); };
  }, []);

  const servers = reg.all();
  const active = reg.getActive();

  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<{ label: string; kind: ServerKind; database: DatabaseKind; url: string }>({
    label: '', kind: 'remote-http', database: 'postgres', url: '',
  });

  const addServer = () => {
    if (!draft.label.trim()) { toast.error('Indica una etiqueta.'); return; }
    reg.add({
      id: `srv-${Date.now().toString(36)}`,
      label: draft.label,
      description: `Servidor ${draft.kind} añadido manualmente.`,
      kind: draft.kind,
      url: draft.url || undefined,
      database: draft.database,
      scopes: ['posts', 'files', 'messages', 'events', 'memory', 'stories', 'agents'],
      status: 'configuring',
      isDefault: false,
    });
    toast.success(`Servidor "${draft.label}" añadido.`);
    setDraft({ label: '', kind: 'remote-http', database: 'postgres', url: '' });
    setAddOpen(false);
  };

  return (
    <div className="space-y-3">
      <Card className="liquid-glass-panel border-white/10">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider">
                Servidores y bases de datos
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Elige dónde se guardan tus publicaciones, archivos, mensajes y eventos. Por defecto: local (sin internet).
              </p>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
                Activo: {active.label}
              </Badge>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddOpen((v) => !v)}>
                <Plus className="w-3 h-3 mr-1" /> Añadir
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {addOpen && (
        <Card className="border-cyan-500/30 bg-cyan-500/[0.03]">
          <CardContent className="p-4 space-y-2">
            <h4 className="text-xs uppercase tracking-wider text-cyan-300 font-bold">Nuevo servidor</h4>
            <div className="grid sm:grid-cols-2 gap-2">
              <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Etiqueta" className="h-8 text-xs" />
              <Input value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="URL (https://...)" className="h-8 text-xs font-mono" />
              <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v as ServerKind })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="remote-http" className="text-xs">Remote HTTP</SelectItem>
                  <SelectItem value="supabase" className="text-xs">Supabase</SelectItem>
                  <SelectItem value="fediverso" className="text-xs">Fediverso ActivityPub</SelectItem>
                  <SelectItem value="ipfs" className="text-xs">IPFS</SelectItem>
                  <SelectItem value="custom" className="text-xs">Custom</SelectItem>
                </SelectContent>
              </Select>
              <Select value={draft.database} onValueChange={(v) => setDraft({ ...draft, database: v as DatabaseKind })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="postgres" className="text-xs">PostgreSQL</SelectItem>
                  <SelectItem value="sqlite-wasm" className="text-xs">SQLite WASM</SelectItem>
                  <SelectItem value="sqlite-remote" className="text-xs">SQLite remoto</SelectItem>
                  <SelectItem value="indexeddb" className="text-xs">IndexedDB</SelectItem>
                  <SelectItem value="rxdb" className="text-xs">RxDB</SelectItem>
                  <SelectItem value="localstorage" className="text-xs">LocalStorage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={addServer}>Añadir</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid sm:grid-cols-2 gap-2">
        {servers.map((s) => {
          const Icon = KIND_ICONS[s.kind];
          const isActive = s.id === active.id;
          return (
            <Card
              key={s.id}
              className={cn(
                'border transition-all',
                isActive ? 'border-emerald-500/40 bg-emerald-500/[0.04]' : 'border-white/10 bg-white/[0.02]'
              )}
            >
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="p-1.5 rounded-lg bg-white/5 shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h4 className="text-xs font-bold">{s.label}</h4>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[9px]',
                          s.status === 'connected' && 'border-emerald-500/50 text-emerald-300',
                          s.status === 'configuring' && 'border-amber-500/50 text-amber-300',
                          s.status === 'disconnected' && 'border-white/20 text-muted-foreground',
                          s.status === 'error' && 'border-red-500/50 text-red-300'
                        )}
                      >
                        {s.status}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{s.description}</p>
                    <p className="text-[10px] text-muted-foreground/70 font-mono mt-1 truncate">
                      {s.kind} · {s.database}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  {SCOPES.map((scope) => {
                    const supported = s.scopes.includes(scope);
                    return (
                      <Badge
                        key={scope}
                        variant="outline"
                        className={cn(
                          'text-[9px] cursor-pointer',
                          supported ? 'border-white/15 text-foreground/80' : 'border-white/5 text-muted-foreground/50'
                        )}
                        onClick={() => {
                          if (supported) {
                            getServerRegistry().setScopeServer(scope, s.id);
                            toast.success(`${scope} ahora se guarda en ${s.label}.`);
                          }
                        }}
                      >
                        {scope}
                      </Badge>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 text-[10px]">
                  <Button
                    size="sm"
                    variant={isActive ? 'default' : 'outline'}
                    className="h-6 text-[10px] flex-1"
                    onClick={() => { getServerRegistry().setActive(s.id); toast.success(`${s.label} es ahora el servidor activo.`); }}
                  >
                    {isActive ? <><Check className="w-3 h-3 mr-1" /> Activo</> : 'Usar este'}
                  </Button>
                  {s.origin === 'user' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] text-muted-foreground hover:text-destructive"
                      onClick={() => { getServerRegistry().remove(s.id); toast.success('Servidor eliminado.'); }}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
