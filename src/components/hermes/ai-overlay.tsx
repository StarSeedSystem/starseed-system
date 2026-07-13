// src/components/hermes/ai-overlay.tsx
'use client';

/**
 * AI Overlay omnipresente — botón flotante DRAGGABLE + ventana de chat sobre
 * la pantalla.  Reconoce voz (Web Speech API), responde por voz (speechSynthesis)
 * y ejecuta acciones del sistema:
 *   - Navegar a cualquier sección (`/dashboard`, `/hub`, etc.)
 *   - Crear conexiones en el Cerebro
 *   - Añadir eventos al Sincrómetro
 *   - Buscar en memoria OpenHuman
 *   - Crear skills/agentes via Meta-skills
 *
 * Características v2:
 *   ✓ Draggable con spring physics (framer-motion)
 *   ✓ Edge-snapping al soltar
 *   ✓ Drop zone de descarte (arrastra hacia abajo para ocultar)
 *   ✓ Visibilidad controlada desde Nexus (AppearanceConfig.assistant.visible)
 *   ✓ Acceso rápido a sentidos IA dentro del panel
 *   ✓ Badge de proveedor activo
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Brain, Mic, MicOff, Send, X, Sparkles, Eye, FileText,
  Terminal, Ear, Activity, HardDrive, ChevronDown, Cpu, Cloud,
} from 'lucide-react';
import { motion, AnimatePresence, useDragControls, type PanInfo } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { getOpenHumanEngine } from '@/hermes-integration/openhuman-bridge';
import { getLivingGraphStore } from '@/hermes-integration/living-graph-store';
import { toast } from 'sonner';
import { useAppearance } from '@/context/appearance-context';
import { loadConfigs, getActiveProviderId } from '@/ai/client/providerStore';
import { PROVIDERS } from '@/ai/providers';
// UN SOLO MOTOR DE VOZ EN TODO EL OS: este overlay delega la escucha en el motor
// ÚNICO de Aurora (src/lib/aurora/engine.ts) a través del puente global. Ver el
// comentario de `toggleListen`.
import { toggleAuroraVoice, isAuroraReady } from '@/lib/aurora/open-aurora';

interface OverlayMessage {
  role: 'user' | 'agent';
  content: string;
  ts: string;
}

// ── Senses quick-toggle config ───────────────────────────────────────
interface QuickSense {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
}

const DEFAULT_QUICK_SENSES: QuickSense[] = [
  { id: 'screen',     label: 'Pantalla',   icon: Eye,       enabled: true },
  { id: 'text',       label: 'Texto',      icon: FileText,  enabled: true },
  { id: 'logs',       label: 'Logs',       icon: Terminal,   enabled: true },
  { id: 'audio',      label: 'Audio',      icon: Ear,       enabled: false },
  { id: 'memory',     label: 'Memoria',    icon: HardDrive, enabled: true },
  { id: 'activity',   label: 'Actividad',  icon: Activity,  enabled: true },
];

const STORAGE_KEY   = 'starseed.ai-overlay.history.v1';
const POS_KEY       = 'starseed.ai-overlay.position.v1';
const SENSES_KEY    = 'starseed.ai-overlay.senses.v1';

export function AiOverlay() {
  const router = useRouter();
  const { config, updateSection } = useAppearance();
  const isVisible = config.assistant?.visible ?? true;

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<OverlayMessage[]>([]);
  const [listening, setListening] = useState(false);
  const [showSenses, setShowSenses] = useState(false);
  const [senses, setSenses] = useState<QuickSense[]>(DEFAULT_QUICK_SENSES);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [showDismiss, setShowDismiss] = useState(false);
  const [overDismiss, setOverDismiss] = useState(false);
  const [position, setPosition] = useState({ x: -1, y: -1 });
  const constraintsRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Provider info
  const providerInfo = useMemo(() => {
    try {
      const configs = loadConfigs();
      const activeId = getActiveProviderId();
      const active = configs.find(c => c.enabled && c.id === activeId) ?? configs.find(c => c.enabled);
      if (active) {
        const info = PROVIDERS[active.id]?.info;
        return { label: active.label, model: active.defaultModel, local: info?.local ?? false };
      }
    } catch { /* noop */ }
    return null;
  }, []);

  // ── Hydration & Persistence ──────────────────────────────────────────
  useEffect(() => {
    try {
      const rawPos = window.localStorage.getItem(POS_KEY);
      if (rawPos) setPosition(JSON.parse(rawPos));
    } catch { /* noop */ }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw));
    } catch { /* noop */ }

    try {
      const raw = window.localStorage.getItem(SENSES_KEY);
      if (raw) setSenses(JSON.parse(raw));
    } catch { /* noop */ }

    setMounted(true);
  }, []);

  // Persist messages
  useEffect(() => {
    if (mounted) {
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50))); } catch { /* noop */ }
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [messages, mounted]);

  // Persist senses
  useEffect(() => {
    if (mounted) {
      try { window.localStorage.setItem(SENSES_KEY, JSON.stringify(senses)); } catch { /* noop */ }
    }
  }, [senses, mounted]);

  // ── Voice: STT ──────────────────────────────────────────────────────
  /**
   * UN SOLO MOTOR DE VOZ EN TODO EL OS.
   *
   * Antes este overlay construía su PROPIO `SpeechRecognition` (`new SR()`), en
   * paralelo al motor único de Aurora (`src/lib/aurora/engine.ts`). Dos
   * reconocimientos vivos pelean por el MISMO micrófono: se abortan mutuamente
   * (`aborted`), ninguno entrega `onresult` («Aurora no escucha») y cada `onend`
   * reprograma otro arranque («se repite en loop»). Es exactamente el fallo que
   * ya se vio en el Café.
   *
   * Ahora la escucha se DELEGA en el motor único vía el puente global. El
   * componente no está montado hoy (se retiró del layout), pero se conserva en
   * el repo: dejarlo con su propio motor era una mina para el futuro.
   */
  const toggleListen = () => {
    try {
      if (!isAuroraReady()) {
        toast.error('Aurora aún no está disponible. Ábrela desde su orbe o el Exocórtex.');
        return;
      }
      toggleAuroraVoice();
      setListening((v) => !v);
    } catch {
      toast.error('No se pudo activar la voz.');
    }
  };

  // ── Voice: TTS ──────────────────────────────────────────────────────
  const speak = (text: string) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES';
      window.speechSynthesis.speak(u);
    } catch { /* noop */ }
  };

  // ── System actions (local router) ──────────────────────────────────
  const tryAction = (text: string): string | null => {
    const t = text.toLowerCase().trim();

    // Navigation
    const routes: { match: RegExp; path: string; label: string }[] = [
      { match: /\b(dashboard|inicio|tablero)\b/, path: '/dashboard', label: 'Dashboard' },
      { match: /\bhub\b/, path: '/hub', label: 'Hub' },
      { match: /\b(cerebro|grafica viva|memoria viva)\b/, path: '/network/graph', label: 'Cerebro' },
      { match: /\b(ai studio|estudio.*ia|pagina.*ia|agente)\b/, path: '/agent', label: 'Astraura AI' },
      { match: /\b(ajustes|configuracion|settings)\b/, path: '/settings', label: 'Ajustes' },
      { match: /\b(biblioteca|library)\b/, path: '/library', label: 'Biblioteca' },
      { match: /\b(notificaciones|notificacion)\b/, path: '/notifications', label: 'Notificaciones' },
      { match: /\b(perfil|profile)\b/, path: '/profile/starseeduser', label: 'Perfil' },
      { match: /\b(red|network|nodos)\b/, path: '/network', label: 'La Red' },
      { match: /\b(sincr[oó]metro|calendario)\b/, path: '/hub?tab=calendar', label: 'Sincrómetro' },
      { match: /\b(ai.setup|setup.ia|sentidos|mcps?)\b/, path: '/ai-setup', label: 'IA · Setup' },
    ];
    if (/\b(abre|ve a|navega|lleva|ir a|llevame|ll[eé]vame)\b/.test(t)) {
      for (const r of routes) {
        if (r.match.test(t)) {
          router.push(r.path);
          return `Abriendo ${r.label}.`;
        }
      }
    }

    // Memory: remember / forget
    let m = t.match(/^(?:recuerda|acu[ée]rdate|guarda)\s+(?:que\s+)?(.+)/);
    if (m) {
      const note = m[1];
      getOpenHumanEngine().kv.store('global', `note-${Date.now()}`, note, 'core');
      return `Guardado en memoria: "${note}".`;
    }
    m = t.match(/^(?:olvida|borra el recuerdo de)\s+(.+)/);
    if (m) {
      const key = m[1];
      getOpenHumanEngine().kv.forget('global', key);
      return `Olvidé "${key}".`;
    }

    // Brain: create connection
    m = t.match(/^conecta(?:r)?\s+(.+?)\s+con\s+(.+)/);
    if (m) {
      const store = getLivingGraphStore();
      const a = store.getNodes().find((n) => n.label.toLowerCase().includes(m![1]));
      const b = store.getNodes().find((n) => n.label.toLowerCase().includes(m![2]));
      if (a && b) {
        store.addEdge({ sourceId: a.id, targetId: b.id, kind: 'custom', origin: 'user' });
        return `Conecté ${a.label} con ${b.label} en tu Cerebro.`;
      }
      return `No encontré los nodos "${m[1]}" o "${m[2]}".`;
    }

    // Click a button
    m = t.match(/^(?:haz click|pulsa|presiona)\s+(.+)/);
    if (m) {
      const label = m[1].trim();
      const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
      const match = buttons.find((b) => (b.textContent ?? '').toLowerCase().includes(label.toLowerCase()));
      if (match) {
        (match as HTMLElement).click();
        return `Presioné "${label}".`;
      }
      return `No encontré ningún botón con "${label}".`;
    }

    return null;
  };

  const handleSend = (forced?: string) => {
    const text = (forced ?? input).trim();
    if (!text) return;
    setInput('');
    const ts = new Date().toISOString();
    setMessages((prev) => [...prev, { role: 'user', content: text, ts }]);

    // Persist in memory
    try { getOpenHumanEngine().ingest(text, 'chat', `overlay-${Date.now()}`); } catch { /* noop */ }

    // Try local actions first
    const local = tryAction(text);
    let response: string;
    if (local) {
      response = local;
    } else {
      response = `Recibido: "${text}". Para acciones del sistema usa frases como "abre Cerebro", "recuerda que mi color favorito es violeta", "conecta Skills con Tools", o "haz click en Conectar".`;
    }
    setMessages((prev) => [...prev, { role: 'agent', content: response, ts: new Date().toISOString() }]);
    speak(response);
  };

  // ── Drag handlers ───────────────────────────────────────────────────
  const handleDragStart = () => {
    setIsDragging(true);
    setShowDismiss(true);
  };

  const handleDrag = useCallback((_: any, info: PanInfo) => {
    // Check if over dismiss zone
    if (dismissRef.current && buttonRef.current) {
      const dismissRect = dismissRef.current.getBoundingClientRect();
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const buttonCenter = {
        x: buttonRect.left + buttonRect.width / 2,
        y: buttonRect.top + buttonRect.height / 2,
      };
      const isOver =
        buttonCenter.x >= dismissRect.left &&
        buttonCenter.x <= dismissRect.right &&
        buttonCenter.y >= dismissRect.top &&
        buttonCenter.y <= dismissRect.bottom;
      setOverDismiss(isOver);
    }
  }, []);

  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    setIsDragging(false);
    setShowDismiss(false);

    if (overDismiss) {
      // Dismiss the assistant
      updateSection('assistant', { visible: false });
      setOverDismiss(false);
      toast.info('Asistente IA oculto. Actívalo de nuevo desde el Nexus (borde superior).');
      return;
    }
    setOverDismiss(false);

    // Snap to nearest horizontal edge
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;

      // Determine target X: snap to left or right edge
      const margin = 16;
      const targetX = cx < vw / 2
        ? margin
        : vw - rect.width - margin;

      // Clamp Y
      const targetY = Math.max(80, Math.min(vh - rect.height - 120, rect.top));

      setPosition({ x: targetX, y: targetY });
      try { window.localStorage.setItem(POS_KEY, JSON.stringify({ x: targetX, y: targetY })); } catch { /* noop */ }
    }
  }, [overDismiss, updateSection]);

  const toggleSense = (id: string) => {
    setSenses(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  if (!mounted) return null;
  if (config.assistant?.visible === false) return null;

  // Compute initial position (default bottom-right)
  const defaultPos = {
    x: position.x !== -1 ? position.x : (typeof window !== 'undefined' ? window.innerWidth - 80 : 300),
    y: position.y !== -1 ? position.y : (typeof window !== 'undefined' ? window.innerHeight - 180 : 500),
  };

  const activeSenseCount = senses.filter(s => s.enabled).length;

  return (
    <>
      {/* Full-screen drag constraints */}
      <div
        ref={constraintsRef}
        className="fixed inset-0 z-[59] pointer-events-none"
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Dismiss drop zone — appears when dragging */}
      <AnimatePresence>
        {showDismiss && (
          <motion.div
            ref={dismissRef}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className={cn(
              'fixed bottom-6 left-1/2 -translate-x-1/2 z-[61]',
              'w-48 h-20 rounded-3xl flex items-center justify-center gap-2',
              'border-2 border-dashed transition-all duration-200 pointer-events-auto',
              overDismiss
                ? 'border-red-400 bg-red-500/30 shadow-[0_0_40px_rgba(239,68,68,0.5)] scale-110'
                : 'border-white/20 bg-black/40 backdrop-blur-xl shadow-2xl'
            )}
          >
            <X className={cn(
              'w-5 h-5 transition-colors',
              overDismiss ? 'text-red-300' : 'text-white/40'
            )} />
            <span className={cn(
              'text-xs font-medium uppercase tracking-wider transition-colors',
              overDismiss ? 'text-red-200' : 'text-white/30'
            )}>
              Ocultar
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating draggable button */}
      <AnimatePresence>
        {!open && (
          <motion.div
            ref={buttonRef}
            drag
            dragConstraints={constraintsRef}
            dragElastic={0.1}
            dragMomentum={false}
            onDragStart={handleDragStart}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{
              opacity: 1,
              scale: 1,
              x: defaultPos.x,
              y: defaultPos.y,
            }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              if (!isDragging) setOpen(true);
            }}
            className={cn(
              'fixed top-0 left-0 z-[60] cursor-grab active:cursor-grabbing pointer-events-auto',
              'w-14 h-14 rounded-full',
              'bg-gradient-to-br from-purple-600 via-violet-600 to-cyan-500',
              'flex items-center justify-center text-white',
              'shadow-[0_0_30px_rgba(168,85,247,0.45)]',
            )}
            style={{ touchAction: 'none' }}
            title="Abrir Asistente IA (arrastra para mover)"
          >
            {/* Pulsing ring */}
            <span className="absolute inset-0 rounded-full animate-ping bg-purple-500/20 pointer-events-none" />
            <span className="absolute inset-[-3px] rounded-full border-2 border-purple-400/30 animate-pulse pointer-events-none" />
            <Brain className="w-6 h-6 relative z-10" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 40 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className={cn(
              'fixed bottom-4 right-2 sm:bottom-6 sm:right-6 z-[80]',
              'w-[calc(100vw-1rem)] sm:w-[420px] max-h-[75vh] flex flex-col',
              'rounded-2xl border border-purple-500/30 bg-black/90 backdrop-blur-2xl shadow-[0_20px_60px_rgba(168,85,247,0.25)]',
              'pointer-events-auto overflow-hidden'
            )}
          >
            {/* Header */}
            <div className="flex items-center gap-2 p-3 border-b border-white/10 bg-gradient-to-r from-purple-900/30 to-cyan-900/20 shrink-0">
              <div className="p-1.5 rounded-lg bg-purple-500/20">
                <Sparkles className="w-4 h-4 text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-white/90">Exocórtex · Asistente</h4>
                {providerInfo && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Badge variant="outline" className={cn(
                      'text-[8px] px-1.5 py-0 h-4 rounded-full gap-0.5',
                      providerInfo.local
                        ? 'border-emerald-500/40 text-emerald-300'
                        : 'border-blue-500/40 text-blue-300'
                    )}>
                      {providerInfo.local ? <Cpu className="w-2 h-2" /> : <Cloud className="w-2 h-2" />}
                      {providerInfo.label}
                    </Badge>
                    <span className="text-[8px] text-white/25 font-mono">{providerInfo.model}</span>
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg hover:bg-purple-500/10 text-white/40 hover:text-white/80"
                onClick={() => setShowSenses(!showSenses)}
                title="Sentidos IA"
              >
                <Eye className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg hover:bg-red-500/10 text-white/40 hover:text-red-400"
                onClick={() => setOpen(false)}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>

            {/* Senses quick-toggle drawer */}
            <AnimatePresence>
              {showSenses && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="overflow-hidden border-b border-white/10 shrink-0"
                >
                  <div className="p-3 bg-black/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-white/30 font-mono uppercase tracking-wider">
                        Sentidos activos: {activeSenseCount}/{senses.length}
                      </span>
                      <ChevronDown
                        className="w-3 h-3 text-white/20 cursor-pointer hover:text-white/40"
                        onClick={() => setShowSenses(false)}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {senses.map(sense => {
                        const Icon = sense.icon;
                        return (
                          <button
                            key={sense.id}
                            onClick={() => toggleSense(sense.id)}
                            className={cn(
                              'flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] transition-all border',
                              sense.enabled
                                ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                                : 'border-white/5 bg-white/[0.02] text-white/30'
                            )}
                          >
                            <Icon className="w-3 h-3 shrink-0" />
                            <span className="truncate">{sense.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 text-xs min-h-0">
              {messages.length === 0 && (
                <div className="text-center py-6 space-y-2">
                  <Brain className="w-10 h-10 text-purple-500/20 mx-auto" />
                  <p className="text-muted-foreground italic text-[11px] max-w-[280px] mx-auto leading-relaxed">
                    Habla o escribe. Puedo navegar, recordar cosas, conectar nodos del Cerebro y pulsar botones por ti.
                  </p>
                </div>
              )}
              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={cn(
                    'rounded-xl px-3 py-2 max-w-[85%] leading-relaxed',
                    m.role === 'user'
                      ? 'bg-gradient-to-br from-cyan-500/15 to-blue-500/10 text-cyan-100 ml-auto rounded-tr-sm'
                      : 'bg-gradient-to-br from-purple-500/10 to-violet-500/5 text-purple-100 rounded-tl-sm'
                  )}
                >
                  {m.content}
                </motion.div>
              ))}
            </div>

            {/* Input bar */}
            <div className="p-2.5 border-t border-white/10 flex items-center gap-1.5 bg-black/30 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-8 w-8 shrink-0 rounded-lg', listening && 'text-red-400 animate-pulse bg-red-500/10')}
                onClick={toggleListen}
                title={listening ? 'Detener' : 'Escuchar'}
              >
                {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder='Ej: "abre Cerebro" / "recuerda que..."'
                className="h-8 text-xs bg-white/5 border-white/10 rounded-lg"
              />
              <Button
                size="icon"
                className="h-8 w-8 shrink-0 rounded-lg bg-purple-600/80 hover:bg-purple-500/80"
                onClick={() => handleSend()}
                disabled={!input.trim()}
              >
                <Send className="w-3 h-3" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
