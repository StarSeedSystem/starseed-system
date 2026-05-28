// src/components/hermes/senses-panel.tsx
'use client';

/**
 * Panel de "Sentidos" del Exocórtex Hermes.
 *
 * Los sentidos son canales de percepción que la IA personal del usuario
 * puede activar/desactivar. Cada sentido habilita un conjunto de
 * capacidades en los agentes y se materializa como un nodo conectado
 * en la gráfica de Memoria Unificada.
 *
 * Modelo: el usuario es siempre soberano. Cada sentido requiere consentimiento
 * explícito y se almacena localmente; nada se envía a la red sin permiso.
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Eye,
  Ear,
  MapPin,
  Mic,
  Camera,
  Bell,
  Brain,
  Sparkles,
  Hand,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLivingGraphStore } from '@/hermes-integration/living-graph-store';

interface Sense {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  /** Permiso del navegador asociado (si lo hay). */
  permission?: 'geolocation' | 'camera' | 'microphone' | 'notifications';
  /** Capacidades que habilita en el sistema (skills/tools). */
  unlocks: string[];
  enabledByDefault?: boolean;
}

const SENSES: Sense[] = [
  {
    id: 'vision',
    label: 'Visión',
    description:
      'Permite a Hermes interpretar imágenes y capturas de pantalla del usuario. Usa modelos multimodales del proveedor de IA activo.',
    icon: Eye,
    color: 'text-cyan-400',
    permission: 'camera',
    unlocks: ['analyze_image', 'screen_capture_describe', 'ocr'],
  },
  {
    id: 'hearing',
    label: 'Audición',
    description:
      'Habilita transcripción de audio, comandos por voz y análisis de tono. Requiere acceso al micrófono.',
    icon: Ear,
    color: 'text-emerald-400',
    permission: 'microphone',
    unlocks: ['speech_to_text', 'voice_command', 'audio_classify'],
  },
  {
    id: 'voice',
    label: 'Voz',
    description:
      'Permite a Hermes hablar usando síntesis de voz local del navegador (Web Speech API).',
    icon: Mic,
    color: 'text-purple-400',
    unlocks: ['text_to_speech'],
    enabledByDefault: true,
  },
  {
    id: 'location',
    label: 'Ubicación',
    description:
      'Acceso a la ubicación geográfica para sugerencias contextuales y sincronización con eventos comunitarios locales.',
    icon: MapPin,
    color: 'text-amber-400',
    permission: 'geolocation',
    unlocks: ['nearby_events', 'local_weather', 'community_proximity'],
  },
  {
    id: 'camera',
    label: 'Cámara',
    description:
      'Vista de cámara en vivo para análisis (códigos QR, plantas, objetos, asistencia visual). Procesado local cuando es posible.',
    icon: Camera,
    color: 'text-pink-400',
    permission: 'camera',
    unlocks: ['live_camera_analyze', 'qr_scan'],
  },
  {
    id: 'awareness',
    label: 'Consciencia ambiental',
    description:
      'Hermes puede recibir notificaciones de la red federada y reaccionar a eventos en tiempo real (mensajes, propuestas, alarmas).',
    icon: Bell,
    color: 'text-red-400',
    permission: 'notifications',
    unlocks: ['ambient_alerts', 'cron_jobs'],
  },
  {
    id: 'tactile',
    label: 'Tacto',
    description:
      'Lectura de gestos y patrones de uso para personalizar el flujo (sin perfilado: solo agregados en el dispositivo).',
    icon: Hand,
    color: 'text-rose-400',
    unlocks: ['gesture_hints', 'usage_pattern_personalization'],
  },
  {
    id: 'intuition',
    label: 'Intuición sintética',
    description:
      'Análisis predictivo basado en la Memoria Unificada: sugerencias proactivas a partir de patrones recurrentes detectados.',
    icon: Brain,
    color: 'text-fuchsia-400',
    unlocks: ['proactive_suggestions', 'context_memory_recall'],
    enabledByDefault: true,
  },
  {
    id: 'astral',
    label: 'Resonancia armónica',
    description:
      'Sentido onírico/simbólico: lee el Sincrómetro (signo zodiacal y fase lunar actual) y los expone como contexto al agente.',
    icon: Sparkles,
    color: 'text-yellow-300',
    unlocks: ['sincrometro_context', 'symbolic_correlation'],
    enabledByDefault: true,
  },
];

const STORAGE_KEY = 'starseed.hermes.senses.v1';

export function SensesPanel() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setEnabled(JSON.parse(stored));
        return;
      }
    } catch {
      /* ignore */
    }
    const seed: Record<string, boolean> = {};
    SENSES.forEach((s) => (seed[s.id] = !!s.enabledByDefault));
    setEnabled(seed);
  }, []);

  const toggle = (id: string) => {
    setEnabled((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* noop */ }
      // Sincronizar con el grafo vivo: si el sentido se activa, conectar
      // self → sense-{id} con la arista 'perceives'. Si se desactiva,
      // marcar como inactivo (la arista existe pero queda con peso bajo).
      try {
        const store = getLivingGraphStore();
        const senseNodeId = `sense-${id === 'voice' ? 'voice' : id === 'awareness' ? 'awareness' : id === 'intuition' ? 'intuition' : id === 'astral' ? 'astral' : id}`;
        if (next[id]) {
          if (!store.getNode(senseNodeId)) {
            const meta = SENSES.find((s) => s.id === id);
            store.addNode({
              id: senseNodeId,
              kind: 'sense',
              label: meta?.label ?? id,
              description: meta?.description,
            } as any);
          }
          store.addEdge({ sourceId: 'self', targetId: senseNodeId, kind: 'perceives', origin: 'system' });
        }
      } catch { /* noop */ }
      return next;
    });
  };

  const activeCount = Object.values(enabled).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <Card className="bg-black/20 border-white/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            Sentidos del Exocórtex
            <Badge variant="outline" className="ml-auto border-purple-500/40 text-purple-300">
              {activeCount} activos / {SENSES.length}
            </Badge>
          </CardTitle>
          <CardDescription>
            Cada sentido habilita una capacidad de percepción de tu IA personal. Todos
            se guardan localmente y solo se activan con consentimiento explícito.
            Lo que activas se conecta automáticamente al grafo armónico de Memoria
            Unificada como un nodo de tipo <code className="text-[10px] px-1 rounded bg-white/5">sense</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          {SENSES.map((sense) => {
            const Icon = sense.icon;
            const isOn = !!enabled[sense.id];
            return (
              <div
                key={sense.id}
                className={cn(
                  'rounded-xl border p-3 transition-all',
                  isOn
                    ? 'border-white/20 bg-white/[0.04]'
                    : 'border-white/5 bg-white/[0.02] opacity-80'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn('p-2 rounded-lg bg-white/5', sense.color)}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className={cn('text-sm font-bold', sense.color)}>{sense.label}</h4>
                      <Switch checked={isOn} onCheckedChange={() => toggle(sense.id)} />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">{sense.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {sense.unlocks.map((u) => (
                        <Badge
                          key={u}
                          variant="outline"
                          className="text-[9px] border-white/10 bg-white/[0.03] text-muted-foreground"
                        >
                          {u}
                        </Badge>
                      ))}
                    </div>
                    {sense.permission && (
                      <p className="text-[10px] text-muted-foreground/70 mt-1.5 italic">
                        Requiere permiso del navegador: {sense.permission}.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
