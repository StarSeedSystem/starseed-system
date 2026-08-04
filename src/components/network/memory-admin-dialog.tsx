// src/components/network/memory-admin-dialog.tsx
'use client';

/**
 * Administrador completo de un nodo del Cerebro.
 *
 * Tabs:
 *   - Información: etiqueta, descripción, peso, tags, notas.
 *   - Conexiones: aristas adyacentes y nodos sincronizados entre perfiles.
 *   - Historial: logs + versiones (con restaurar).
 *   - Archivos: lista de archivos asociados con tipo y tamaño.
 *   - Almacenamiento: mover entre local / IndexedDB / Supabase / IPFS / Drive / iCloud / Fediverso.
 *   - Configuración: pares key→value libres.
 */

import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { usePrompt } from '@/components/ui/confirm-dialog';
import {
  Database,
  History,
  Link2,
  FileBox,
  Settings as SettingsIcon,
  Info,
  Trash2,
  Plus,
  Save,
  RotateCcw,
  Folder,
  Share2,
  ArrowRightLeft,
} from 'lucide-react';
import {
  getMemoryAdminStore,
  getStorageOptions,
  DEFAULT_PROFILES,
  type StorageLocation,
  type MemoryFile,
} from '@/hermes-integration/memory-admin-store';
import { getLivingGraphStore, CONNECTION_LAYERS } from '@/hermes-integration/living-graph-store';

interface MemoryAdminDialogProps {
  nodeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MemoryAdminDialog({ nodeId, open, onOpenChange }: MemoryAdminDialogProps) {
  const prompt = usePrompt();
  const graphStore = getLivingGraphStore();
  const adminStore = getMemoryAdminStore();
  const node = nodeId ? graphStore.getNode(nodeId) : null;
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  // Sub-suscripción a cambios de cualquier store
  useMemo(() => {
    if (!open || !nodeId) return;
    const u1 = graphStore.subscribe(refresh);
    const u2 = adminStore.subscribe(refresh);
    return () => { u1(); u2(); };
  }, [open, nodeId]);

  const record = useMemo(
    () => (nodeId ? adminStore.getOrInit(nodeId) : null),
    [nodeId, tick]
  );

  const adjacentEdges = useMemo(
    () => (nodeId ? graphStore.edgesOf(nodeId) : []),
    [nodeId, tick]
  );

  if (!node || !record) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" style={{ color: node.color }} />
            <span style={{ color: node.color }}>{node.label}</span>
            <Badge variant="outline" className="text-[10px]" style={{ borderColor: node.color, color: node.color }}>
              {node.kind} · {node.frequency} Hz
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Administrador completo de esta memoria. Versiones, archivos, almacenamiento, conexiones cruzadas entre perfiles.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="info" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid grid-cols-6 mb-3 h-auto">
            <TabsTrigger value="info" className="gap-1 text-xs"><Info className="w-3 h-3" /> Info</TabsTrigger>
            <TabsTrigger value="connections" className="gap-1 text-xs"><Link2 className="w-3 h-3" /> Conexiones</TabsTrigger>
            <TabsTrigger value="history" className="gap-1 text-xs"><History className="w-3 h-3" /> Historial</TabsTrigger>
            <TabsTrigger value="files" className="gap-1 text-xs"><FileBox className="w-3 h-3" /> Archivos</TabsTrigger>
            <TabsTrigger value="storage" className="gap-1 text-xs"><Folder className="w-3 h-3" /> Storage</TabsTrigger>
            <TabsTrigger value="config" className="gap-1 text-xs"><SettingsIcon className="w-3 h-3" /> Config</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto pr-1">
            {/* INFO */}
            <TabsContent value="info" className="space-y-3 mt-0">
              <Card><CardContent className="p-4 space-y-3">
                <Field label="ID">{node.id}</Field>
                <Field label="Tipo">{node.kind}</Field>
                <Field label="Frecuencia armónica">{node.frequency} Hz · {node.geometry}</Field>
                <Field label="Creado">{node.createdAt}</Field>
                <Field label="Última actualización">{record.updatedAt}</Field>
                <Field label="Perfil">
                  <Select value={record.profileId} onValueChange={(v) => {
                    adminStore.update(node.id, { profileId: v }, { action: 'moved', details: `Perfil cambiado a ${v}.` });
                    toast.success('Perfil actualizado.');
                  }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEFAULT_PROFILES.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                          {p.glyph} {p.label} · {p.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={`Peso global · ${record.weight.toFixed(2)}`}>
                  <Slider
                    min={0}
                    max={1}
                    step={0.05}
                    value={[record.weight]}
                    onValueChange={(v) => adminStore.update(node.id, { weight: v[0] }, { action: 'edited', details: `Peso ajustado a ${v[0]}.` })}
                  />
                </Field>
                <Field label="Etiquetas (separadas por coma)">
                  <Input
                    defaultValue={record.tags.join(', ')}
                    onBlur={(e) => {
                      const tags = e.target.value.split(',').map((t) => t.trim()).filter(Boolean);
                      adminStore.update(node.id, { tags }, { action: 'edited', details: 'Etiquetas actualizadas.' });
                    }}
                    className="h-8 text-xs"
                  />
                </Field>
                <Field label="Notas privadas">
                  <Textarea
                    defaultValue={record.notes}
                    onBlur={(e) => adminStore.update(node.id, { notes: e.target.value }, { action: 'edited', details: 'Notas actualizadas.' })}
                    rows={3}
                    className="text-xs resize-none"
                  />
                </Field>
              </CardContent></Card>
            </TabsContent>

            {/* CONEXIONES */}
            <TabsContent value="connections" className="space-y-3 mt-0">
              <Card><CardContent className="p-4 space-y-3">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    Aristas adyacentes ({adjacentEdges.length})
                  </h4>
                  {adjacentEdges.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Sin conexiones.</p>
                  ) : (
                    <div className="space-y-1">
                      {adjacentEdges.map((e) => {
                        const isOut = e.sourceId === node.id;
                        const other = isOut ? graphStore.getNode(e.targetId) : graphStore.getNode(e.sourceId);
                        const layer = CONNECTION_LAYERS.find((l) => l.id === e.kind);
                        return (
                          <div
                            key={e.id}
                            className="flex items-center gap-2 text-xs py-1.5 px-2 rounded border bg-white/[0.02]"
                            style={{ borderColor: `${layer?.color}33` }}
                          >
                            <span className="text-muted-foreground">{isOut ? '→' : '←'}</span>
                            <Badge variant="outline" className="text-[9px]" style={{ borderColor: layer?.color, color: layer?.color }}>
                              {e.kind}
                            </Badge>
                            <span className="flex-1 truncate">{other?.label}</span>
                            <Badge variant="outline" className="text-[9px]">{e.origin}</Badge>
                            {e.origin === 'user' && (
                              <Button variant="ghost" size="icon" className="h-6 w-6"
                                onClick={() => { graphStore.removeEdge(e.id); toast.success('Conexión eliminada.'); }}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                    <ArrowRightLeft className="w-3 h-3" /> Sincronizado entre perfiles ({record.syncedWith.length})
                  </h4>
                  {record.syncedWith.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      Esta memoria solo existe en el perfil <strong>{DEFAULT_PROFILES.find(p => p.id === record.profileId)?.label}</strong>.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {record.syncedWith.map((other) => (
                        <div key={other} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded border border-white/10 bg-white/[0.02]">
                          <Share2 className="w-3 h-3 text-cyan-400" />
                          <span className="flex-1 truncate">{other}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6"
                            onClick={() => { adminStore.unsyncFrom(node.id, other); toast.success('Desconectado.'); }}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <ConnectAcrossProfilesPicker nodeId={node.id} currentSync={record.syncedWith} />
                </div>
              </CardContent></Card>
            </TabsContent>

            {/* HISTORIAL */}
            <TabsContent value="history" className="space-y-3 mt-0">
              <Card><CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Versiones ({record.versions.length})
                  </h4>
                  <Button size="sm" variant="outline" className="h-7 text-xs"
                    onClick={async () => {
                      const label = await prompt({ title: "Nueva versión", label: "Etiqueta para la nueva versión:" });
                      if (!label) return;
                      adminStore.snapshot(node.id, label, { weight: record.weight, tags: record.tags, notes: record.notes });
                      toast.success('Versión guardada.');
                    }}>
                    <Save className="w-3 h-3 mr-1" /> Guardar versión
                  </Button>
                </div>
                <div className="space-y-1">
                  {record.versions.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">Sin versiones todavía.</p>
                  )}
                  {record.versions.map((v) => (
                    <div key={v.id} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded border border-white/10 bg-white/[0.02]">
                      <Badge variant="outline" className="text-[9px]">{v.timestamp.slice(0, 16)}</Badge>
                      <span className="flex-1 truncate font-semibold">{v.label}</span>
                      <Button variant="ghost" size="sm" className="h-7 text-xs"
                        onClick={() => { adminStore.restoreVersion(node.id, v.id); toast.success(`Versión "${v.label}" restaurada.`); }}>
                        <RotateCcw className="w-3 h-3 mr-1" /> Restaurar
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="border-t border-white/5 pt-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    Logs ({record.logs.length})
                  </h4>
                  <div className="space-y-1 max-h-72 overflow-y-auto">
                    {record.logs.slice().reverse().map((log) => (
                      <div key={log.id} className="flex items-start gap-2 text-[11px] py-1 px-2 rounded border border-white/5 bg-white/[0.01]">
                        <Badge variant="outline" className="text-[9px] shrink-0 mt-0.5">{log.action}</Badge>
                        <span className="flex-1">{log.details}</span>
                        <span className="text-muted-foreground/60 text-[9px] shrink-0">{log.timestamp.slice(5, 16)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent></Card>
            </TabsContent>

            {/* ARCHIVOS */}
            <TabsContent value="files" className="space-y-3 mt-0">
              <Card><CardContent className="p-4 space-y-3">
                <FileAdder nodeId={node.id} />
                <div className="space-y-1">
                  {record.files.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">Esta memoria no tiene archivos asociados todavía.</p>
                  )}
                  {record.files.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded border border-white/10 bg-white/[0.02]">
                      <FileBox className="w-3 h-3 text-cyan-400" />
                      <span className="flex-1 truncate font-semibold">{f.name}</span>
                      <Badge variant="outline" className="text-[9px]">{f.mime}</Badge>
                      <span className="text-[10px] text-muted-foreground">{(f.sizeBytes / 1024).toFixed(1)} KB</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6"
                        onClick={() => { adminStore.removeFile(node.id, f.id); toast.success('Archivo eliminado.'); }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent></Card>
            </TabsContent>

            {/* STORAGE */}
            <TabsContent value="storage" className="space-y-3 mt-0">
              <Card><CardContent className="p-4 space-y-3">
                <Field label="Ubicación actual">
                  <Select value={record.storage} onValueChange={(v) => {
                    adminStore.move(node.id, v as StorageLocation, record.folder);
                    toast.success(`Movido a ${v}.`);
                  }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {getStorageOptions().map((s) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">
                          {s.label} — <span className="opacity-60">{s.description}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Carpeta lógica">
                  <Input
                    defaultValue={record.folder}
                    onBlur={(e) => adminStore.move(node.id, record.storage, e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </Field>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label="Archivos" value={record.files.length} />
                  <Stat label="Versiones" value={record.versions.length} />
                  <Stat label="Logs" value={record.logs.length} />
                </div>
              </CardContent></Card>
            </TabsContent>

            {/* CONFIG */}
            <TabsContent value="config" className="space-y-3 mt-0">
              <Card><CardContent className="p-4 space-y-3">
                <ConfigEditor
                  config={record.config}
                  onChange={(newConfig) =>
                    adminStore.update(node.id, { config: newConfig }, { action: 'edited', details: 'Configuración actualizada.' })
                  }
                />
              </CardContent></Card>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">
        {label}
      </label>
      <div className="text-xs">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 px-2 py-2">
      <div className="text-base font-bold font-mono text-foreground/90">{value}</div>
      <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}

function FileAdder({ nodeId }: { nodeId: string }) {
  const adminStore = getMemoryAdminStore();
  const [name, setName] = useState('');
  const [mime, setMime] = useState('text/plain');
  return (
    <div className="grid grid-cols-[1fr_120px_auto] gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del archivo" className="h-8 text-xs" />
      <Input value={mime} onChange={(e) => setMime(e.target.value)} placeholder="MIME" className="h-8 text-xs font-mono" />
      <Button size="sm" className="h-8 text-xs"
        onClick={() => {
          if (!name.trim()) { toast.error('Indica un nombre.'); return; }
          adminStore.addFile(nodeId, { name, mime, path: `/memory/${nodeId}/${name}`, sizeBytes: 0 });
          setName('');
          toast.success('Archivo añadido.');
        }}>
        <Plus className="w-3 h-3 mr-1" /> Añadir
      </Button>
    </div>
  );
}

function ConnectAcrossProfilesPicker({ nodeId, currentSync }: { nodeId: string; currentSync: string[] }) {
  const adminStore = getMemoryAdminStore();
  const graphStore = getLivingGraphStore();
  const [target, setTarget] = useState('');
  const candidates = graphStore.getNodes().filter((n) => n.id !== nodeId && !currentSync.includes(n.id));
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2 mt-2">
      <Select value={target} onValueChange={setTarget}>
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sincronizar con otro nodo..." /></SelectTrigger>
        <SelectContent>
          {candidates.map((n) => (
            <SelectItem key={n.id} value={n.id} className="text-xs">
              {n.label} <span className="opacity-60">({n.kind})</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" className="h-8 text-xs"
        onClick={() => {
          if (!target) { toast.error('Elige un nodo.'); return; }
          adminStore.syncWith(nodeId, target);
          setTarget('');
          toast.success('Sincronizado.');
        }}>
        <Plus className="w-3 h-3 mr-1" /> Sincronizar
      </Button>
    </div>
  );
}

function ConfigEditor({ config, onChange }: { config: Record<string, string>; onChange: (c: Record<string, string>) => void }) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  return (
    <div className="space-y-2">
      {Object.entries(config).length === 0 && (
        <p className="text-xs text-muted-foreground italic">Sin configuración. Añade pares clave→valor abajo.</p>
      )}
      {Object.entries(config).map(([k, v]) => (
        <div key={k} className="grid grid-cols-[140px_1fr_auto] gap-2">
          <Input value={k} disabled className="h-8 text-xs font-mono" />
          <Input
            defaultValue={v}
            onBlur={(e) => onChange({ ...config, [k]: e.target.value })}
            className="h-8 text-xs"
          />
          <Button variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => { const c = { ...config }; delete c[k]; onChange(c); }}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      ))}
      <div className="grid grid-cols-[140px_1fr_auto] gap-2 border-t border-white/5 pt-2">
        <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="clave" className="h-8 text-xs font-mono" />
        <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="valor" className="h-8 text-xs" />
        <Button size="sm" className="h-8 text-xs"
          onClick={() => {
            if (!newKey.trim()) return;
            onChange({ ...config, [newKey]: newValue });
            setNewKey(''); setNewValue('');
          }}>
          <Plus className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
