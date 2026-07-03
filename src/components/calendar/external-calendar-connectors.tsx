// src/components/calendar/external-calendar-connectors.tsx
'use client';

/**
 * Conectores externos de calendario: Google, Apple/iCloud, Outlook/Microsoft,
 * CalDAV, .ics URL, Proton Calendar, Nextcloud.
 *
 * Cada conector activado se materializa como:
 *   - Una "capa" virtual en el Sincrómetro
 *   - Un nodo en el Cerebro (kind: mcp) conectado a self con 'uses'
 *   - Una entrada en MEMORY admin (storage del nodo apunta al servicio)
 *
 * La integración real con OAuth/CalDAV vive en /api/calendars/* (mock por ahora;
 * en producción usaríamos el flujo OAuth/PKCE estándar).
 */

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Cloud,
  Apple,
  Mail,
  Globe,
  Link as LinkIcon,
  ShieldCheck,
  ExternalLink,
  CalendarClock,
  Zap,
} from 'lucide-react';
import { getLivingGraphStore } from '@/hermes-integration/living-graph-store';
import {
  fetchCalendarEvents,
  testCalcom,
  CALCOM_DEFAULT_BASE,
} from '@/lib/integrations/services/calcom';

interface ExternalCalendar {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  authKind: 'oauth' | 'caldav' | 'ics-url' | 'app-password' | 'api-key';
  enabled: boolean;
  account?: string;
  url?: string;
  /** Clave/API key (para conectores tipo `api-key`, p.ej. Cal.com). */
  apiKey?: string;
  lastSync?: string;
  /** Conteo de eventos importados de este conector. */
  syncedCount?: number;
}

const STORAGE_KEY = 'starseed.external-calendars.v1';

const SEED: ExternalCalendar[] = [
  { id: 'google',    label: 'Google Calendar',  description: 'Sincronización OAuth con tu cuenta Google.',           icon: Cloud,    color: '#4285F4', authKind: 'oauth',         enabled: false },
  { id: 'calcom',    label: 'Cal.com',          description: 'Agendamiento open source (API v2). Lee tus reservas en la red.', icon: CalendarClock, color: '#292929', authKind: 'api-key', enabled: false, url: CALCOM_DEFAULT_BASE },
  { id: 'icloud',    label: 'Apple iCloud',     description: 'CalDAV con tu Apple ID (app password).',                icon: Apple,    color: '#a3a3a3', authKind: 'app-password',  enabled: false },
  { id: 'outlook',   label: 'Microsoft 365',    description: 'OAuth con Outlook / Microsoft 365.',                    icon: Mail,     color: '#0078D4', authKind: 'oauth',         enabled: false },
  { id: 'caldav',    label: 'CalDAV genérico',  description: 'Cualquier servidor CalDAV (Nextcloud, Radicale, etc.).',icon: Globe,    color: '#22c55e', authKind: 'caldav',        enabled: false },
  { id: 'ics',       label: 'ICS por URL',      description: 'Suscripción de solo lectura a un calendario .ics.',     icon: LinkIcon, color: '#a78bfa', authKind: 'ics-url',       enabled: false },
  { id: 'proton',    label: 'Proton Calendar',  description: 'CalDAV con Proton (Bridge requerido).',                  icon: ShieldCheck, color: '#6d4aff', authKind: 'caldav',     enabled: false },
];

// Nota: el conector Cal.com usa el cliente defensivo Cal.com API v2
// (`@/lib/integrations/services/calcom`) para LEER reservas y volcarlas al
// calendario de la red (evento `starseed:external-calendar-events`). Los demás
// conectores siguen siendo mock/OAuth como antes.
const CALENDAR_EVENTS_EVENT = 'starseed:external-calendar-events';

function load(): ExternalCalendar[] {
  if (typeof window === 'undefined') return SEED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ExternalCalendar[];
      // Mezclar con SEED para añadir conectores nuevos
      const known = new Set(parsed.map((p) => p.id));
      const merged = [...parsed, ...SEED.filter((s) => !known.has(s.id))];
      // Restituir referencias de icono que no se serializan
      return merged.map((m) => ({ ...m, icon: SEED.find((s) => s.id === m.id)?.icon ?? Cloud }));
    }
  } catch { /* noop */ }
  return SEED;
}

function persist(items: ExternalCalendar[]) {
  if (typeof window === 'undefined') return;
  try {
    // No persistimos la función icon
    const stripped = items.map(({ icon, ...rest }) => rest);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped));
  } catch { /* noop */ }
}

export function ExternalCalendarConnectors() {
  const [connectors, setConnectors] = useState<ExternalCalendar[]>(SEED);

  useEffect(() => { setConnectors(load()); }, []);

  const update = (id: string, patch: Partial<ExternalCalendar>) => {
    setConnectors((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, ...patch } : c));
      persist(next);
      return next;
    });
  };

  const toggle = (c: ExternalCalendar) => {
    update(c.id, { enabled: !c.enabled });
    if (!c.enabled) {
      // Al activar, refleja en el grafo del Cerebro
      try {
        const store = getLivingGraphStore();
        const nodeId = `external-cal-${c.id}`;
        if (!store.getNode(nodeId)) {
          store.addNode({
            id: nodeId,
            kind: 'mcp',
            label: c.label,
            description: c.description,
          } as any);
        }
        store.addEdge({ sourceId: 'self', targetId: nodeId, kind: 'uses', origin: 'system' });
      } catch { /* noop */ }
      toast.success(`${c.label} conectado.`);
    } else {
      toast.success(`${c.label} desconectado.`);
    }
  };

  const sync = async (c: ExternalCalendar) => {
    // Cal.com: sincronización REAL vía su API v2 (lee reservas y las vuelca
    // como eventos del calendario de la red mediante un evento de ventana).
    if (c.authKind === 'api-key' && c.id === 'calcom') {
      const base = (c.url ?? '').trim() || CALCOM_DEFAULT_BASE;
      const key = (c.apiKey ?? '').trim();
      if (!key) {
        toast.error('Añade tu API key de Cal.com para sincronizar.');
        return;
      }
      toast.info('Leyendo reservas de Cal.com…');
      const res = await fetchCalendarEvents(base, key);
      if (res.ok) {
        const events = res.data ?? [];
        update(c.id, { lastSync: new Date().toISOString(), syncedCount: events.length });
        // Publica los eventos para que el calendario de la red los lea.
        try {
          window.dispatchEvent(
            new CustomEvent(CALENDAR_EVENTS_EVENT, {
              detail: { source: 'calcom', events },
            }),
          );
        } catch { /* noop */ }
        toast.success(`Cal.com: ${res.message}`);
      } else {
        toast.error(`Cal.com: ${res.message}`);
      }
      return;
    }
    // Resto de conectores: mock (en producción, fetch a /api/calendars/{id}/sync).
    update(c.id, { lastSync: new Date().toISOString(), syncedCount: (c.syncedCount ?? 0) + 1 });
    toast.success(`Sincronización iniciada con ${c.label}.`);
  };

  const doTestCalcom = async (c: ExternalCalendar) => {
    const base = (c.url ?? '').trim() || CALCOM_DEFAULT_BASE;
    const key = (c.apiKey ?? '').trim();
    if (!key) {
      toast.error('Añade tu API key de Cal.com para probar la conexión.');
      return;
    }
    toast.info('Probando conexión con Cal.com…');
    const res = await testCalcom(base, key);
    if (res.ok) toast.success(res.message);
    else toast.warning(res.message);
  };

  const active = connectors.filter((c) => c.enabled);

  return (
    <Card className="liquid-glass-panel border-white/10">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider">
              Conectores externos de calendario
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Sincroniza Cal.com, Google, Apple, Outlook, Proton, Nextcloud o cualquier
              CalDAV/.ics. Cada conector activo se refleja también como nodo en tu Cerebro.
            </p>
          </div>
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
            {active.length} conectado{active.length === 1 ? '' : 's'}
          </Badge>
        </div>

        <div className="grid sm:grid-cols-2 gap-2">
          {connectors.map((c) => {
            const Icon = c.icon;
            return (
              <div
                key={c.id}
                className={cn(
                  'rounded-xl border p-3 transition-all space-y-2',
                  c.enabled ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-white/10 bg-white/[0.02] opacity-90'
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="p-1.5 rounded-lg bg-white/5 shrink-0" style={{ color: c.color }}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-bold" style={{ color: c.color }}>{c.label}</h4>
                      <Switch checked={c.enabled} onCheckedChange={() => toggle(c)} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{c.description}</p>
                  </div>
                </div>

                {c.enabled && (
                  <div className="space-y-1.5 pl-7">
                    {c.authKind === 'ics-url' && (
                      <Input
                        placeholder="https://...ics"
                        value={c.url ?? ''}
                        onChange={(e) => update(c.id, { url: e.target.value })}
                        className="h-7 text-[11px] font-mono"
                      />
                    )}
                    {c.authKind === 'caldav' && (
                      <Input
                        placeholder="https://servidor/dav/calendars/usuario/"
                        value={c.url ?? ''}
                        onChange={(e) => update(c.id, { url: e.target.value })}
                        className="h-7 text-[11px] font-mono"
                      />
                    )}
                    {c.authKind === 'app-password' && (
                      <Input
                        placeholder="App-specific password"
                        value={c.account ?? ''}
                        onChange={(e) => update(c.id, { account: e.target.value })}
                        className="h-7 text-[11px]"
                        type="password"
                      />
                    )}
                    {c.authKind === 'oauth' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] w-full"
                        onClick={() => {
                          toast.info(`Abriendo flujo OAuth con ${c.label}...`);
                          // En producción: window.open('/api/oauth/' + c.id, '_blank');
                        }}
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        Iniciar OAuth con {c.label}
                      </Button>
                    )}
                    {c.authKind === 'api-key' && (
                      <>
                        <Input
                          placeholder={CALCOM_DEFAULT_BASE}
                          value={c.url ?? ''}
                          onChange={(e) => update(c.id, { url: e.target.value })}
                          className="h-7 text-[11px] font-mono"
                        />
                        <Input
                          placeholder="API key de Cal.com (Bearer)"
                          value={c.apiKey ?? ''}
                          onChange={(e) => update(c.id, { apiKey: e.target.value })}
                          className="h-7 text-[11px] font-mono"
                          type="password"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] w-full"
                          onClick={() => doTestCalcom(c)}
                        >
                          <Zap className="w-3 h-3 mr-1" />
                          Probar conexión
                        </Button>
                      </>
                    )}
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">
                        {c.lastSync ? `Último sync: ${c.lastSync.slice(0, 16)}` : 'Sin sync aún'}
                        {c.syncedCount ? ` · ${c.syncedCount} eventos` : ''}
                      </span>
                      <button
                        onClick={() => sync(c)}
                        className="px-2 py-0.5 rounded-full border border-white/10 hover:bg-white/5 text-foreground/80"
                      >
                        Sincronizar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
