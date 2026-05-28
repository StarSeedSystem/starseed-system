// src/components/hermes/batch-jobs-panel.tsx
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Play, Layers, Trash2, X, Plus } from 'lucide-react';
import {
  getBatchProcessor,
  smartDispatch,
  type BatchJob,
  type BatchRequest,
} from '@/hermes-integration/batch-processing';

export function BatchJobsPanel() {
  const proc = getBatchProcessor();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const unsub = proc.subscribe(() => setTick((t) => t + 1));
    return () => { unsub(); };
  }, []);

  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [requestsJson, setRequestsJson] = useState('[\n  { "custom_id": "1", "payload": { "prompt": "hola" } }\n]');
  const [concurrency, setConcurrency] = useState(4);
  const [retries, setRetries] = useState(2);
  const [preferFree, setPreferFree] = useState(true);
  const [failFast, setFailFast] = useState(false);

  const create = () => {
    let requests: BatchRequest[] = [];
    try { requests = JSON.parse(requestsJson); } catch { toast.error('JSON inválido.'); return; }
    if (!Array.isArray(requests) || requests.length === 0) { toast.error('Indica al menos un request.'); return; }
    const job = proc.create({
      label: label || `Batch · ${new Date().toLocaleTimeString()}`,
      provider: 'mixed',
      requests,
      config: { concurrency, retries, timeoutMs: 30_000, preferFree, failFast },
    });
    toast.success(`Job ${job.id} creado.`);
    setOpen(false);
    setLabel('');
  };

  const run = async (job: BatchJob) => {
    toast.info(`Ejecutando ${job.id}...`);
    await proc.run(job.id, (req) => smartDispatch(req, job.config.preferFree));
  };

  const jobs = proc.all();
  const stats = proc.stats();

  return (
    <div className="space-y-3">
      <Card className="liquid-glass-panel border-white/10">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" /> Batch processing
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Procesa N requests en paralelo. Funciona con cualquier IA, MCP o skill local — usa el smart dispatcher que prioriza gratuito.
              </p>
            </div>
            <Button onClick={() => setOpen((v) => !v)} size="sm">
              <Plus className="w-3 h-3 mr-1" /> Nuevo batch
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Stat label="Total"      value={stats.total} />
            <Stat label="En cola"    value={stats.queued} />
            <Stat label="Activos"    value={stats.inProgress} />
            <Stat label="Completos"  value={stats.completed} />
            <Stat label="Requests"   value={stats.totalRequests} />
          </div>
        </CardContent>
      </Card>

      {open && (
        <Card className="border-cyan-500/30 bg-cyan-500/[0.03]">
          <CardContent className="p-4 space-y-2">
            <Input placeholder="Etiqueta" value={label} onChange={(e) => setLabel(e.target.value)} className="h-8 text-xs" />
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Requests (JSON array de {`{ custom_id, payload, skillId? }`})
            </label>
            <Textarea
              value={requestsJson}
              onChange={(e) => setRequestsJson(e.target.value)}
              rows={6}
              className="font-mono text-[10px]"
            />
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Concurrencia · {concurrency}</label>
                <Slider min={1} max={16} step={1} value={[concurrency]} onValueChange={(v) => setConcurrency(v[0])} />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Reintentos · {retries}</label>
                <Slider min={0} max={5} step={1} value={[retries]} onValueChange={(v) => setRetries(v[0])} />
              </div>
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={preferFree} onCheckedChange={setPreferFree} />
                Priorizar gratuito/local
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={failFast} onCheckedChange={setFailFast} />
                Fail-fast
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={create}>Crear job</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {jobs.length === 0 && (
          <p className="text-xs text-muted-foreground italic text-center py-8">
            Aún no hay batch jobs. Crea uno para reindexar memoria, generar resúmenes masivos, etc.
          </p>
        )}
        {jobs.map((j) => (
          <Card key={j.id} className="liquid-glass-panel border-white/10">
            <CardContent className="p-3 flex items-center gap-3">
              <Badge variant="outline" className="text-[9px] shrink-0">{j.status}</Badge>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{j.label}</p>
                <p className="text-[10px] text-muted-foreground">
                  {j.requests.length} req · {j.stats.success} ok · {j.stats.failed} err · {j.stats.avgMs}ms avg
                </p>
              </div>
              {j.status === 'queued' && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => run(j)}>
                  <Play className="w-3 h-3 mr-1" /> Ejecutar
                </Button>
              )}
              {j.status === 'in_progress' && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => proc.cancel(j.id)}>
                  <X className="w-3 h-3 mr-1" /> Cancelar
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => proc.remove(j.id)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 px-2 py-1.5 text-center">
      <div className="text-base font-bold font-mono">{value}</div>
      <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}
