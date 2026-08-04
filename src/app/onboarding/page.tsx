// src/app/onboarding/page.tsx
'use client';

/**
 * Onboarding guiado — flujo completo de bienvenida al SOSD.
 *
 * Etapas:
 *   1. Individuo o grupo
 *   2. Entrar (sin guía) o crear cuenta (con guía)
 *   3. Acceso: usuario/contraseña (preferido) o métodos alternos
 *   4. Tema visual: presets, variantes y ajustes
 *   5. Walkthrough de páginas principales (skip por sección o total)
 *   6. Perfil + portada + descripción
 *   7. Guía de IA: skills/plugins/MCP/APIs/sentidos/Cerebro
 *   8. Si grupo: selección de fase comunitaria (Semilla / Nodo Urbano / Fortaleza)
 *
 * El estado se persiste en localStorage para que el usuario pueda retomar.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  User, Users, LogIn, UserPlus, Palette, BookOpen, Sparkles, Image as ImageIcon,
  Cpu, Brain, ChevronRight, ChevronLeft, SkipForward, Check, ArrowRight, Leaf, Building, Castle, Eye, Wrench, Server,
} from 'lucide-react';

type AccountKind = 'individual' | 'grupo';
type CommunityPhase = 'semilla' | 'nodo' | 'fortaleza';

interface OnboardingState {
  kind?: AccountKind;
  mode?: 'enter' | 'create';
  username?: string;
  password?: string;
  email?: string;
  themeId?: string;
  themeVariant?: string;
  phase?: CommunityPhase;
  profile?: { displayName: string; bio: string; avatar?: string; cover?: string };
}

const STORAGE_KEY = 'starseed.onboarding.state.v1';
const COMPLETED_KEY = 'starseed.onboarding.completed.v1';

const STEPS = [
  'kind', 'authMode', 'auth', 'theme', 'walkthrough', 'profile', 'ai-guide', 'phase', 'done',
] as const;
type Step = typeof STEPS[number];

const PHASES: { id: CommunityPhase; label: string; tagline: string; icon: any; gradient: string; description: string }[] = [
  {
    id: 'semilla',
    label: 'Fase Semilla',
    tagline: 'Rural · Gratuita · Cloud',
    icon: Leaf,
    gradient: 'from-emerald-500/30 to-cyan-500/15',
    description: 'Despliegue en nube gratuita (Vercel + Supabase). Ideal para arrancar con cohesión humana antes de infraestructura pesada. Énfasis en magnetismo cultural y donación consciente.',
  },
  {
    id: 'nodo',
    label: 'Fase Nodo Urbano',
    tagline: 'Híbrida · Materialización',
    icon: Building,
    gradient: 'from-amber-500/30 to-fuchsia-500/15',
    description: 'Infraestructura híbrida (cloud + servidores propios). Vivienda permanente, granjas verticales, automatización energética. Excedentes comercializados y reinvertidos.',
  },
  {
    id: 'fortaleza',
    label: 'Fase Fortaleza',
    tagline: 'Soberana · Post-escasez',
    icon: Castle,
    gradient: 'from-purple-600/30 to-amber-500/15',
    description: 'Soberanía física absoluta: servidores propios, mesh local, IPFS. Gratuidad sistémica para vivienda/comida/salud/transporte. Mitosis social cuando se alcanza el tamaño óptimo.',
  },
];

const THEMES = [
  { id: 'crystal',     label: 'Crystal Liquid Glass', description: 'Estética por defecto del SOSD.' },
  { id: 'synthwave',   label: 'Synthwave Horizon',     description: 'Cyberdélico nocturno.' },
  { id: 'solarpunk',   label: 'Solarpunk Aurora',      description: 'Verde + energía libre.' },
  { id: 'tokyo',       label: 'Tokyo Midnight',        description: 'Neón urbano profundo.' },
  { id: 'lavender',    label: 'Lavender Mist',         description: 'Minimal suave.' },
  { id: 'bauhaus',     label: 'Bauhaus Modular',       description: 'Brutalista geométrico.' },
];

const WALKTHROUGH_PAGES = [
  { path: '/dashboard',      label: 'Dashboard',     icon: User,     desc: 'Tu centro personal con widgets configurables.' },
  { path: '/hub',            label: 'Hub',           icon: Users,    desc: 'Punto de encuentro: actividad social, política y colaborativa.' },
  { path: '/network',        label: 'La Red',        icon: Sparkles, desc: 'Latido vivo de gobernanza, educación y cultura.' },
  { path: '/network/graph',  label: 'Cerebro',       icon: Brain,    desc: 'Memoria unificada + skills + tools + agentes.' },
  { path: '/agent',          label: 'Astraura AI',     icon: Cpu,      desc: 'Configura tu IA personal y todas sus capacidades.' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [state, setState] = useState<OnboardingState>({});
  const [step, setStep] = useState<Step>('kind');

  // Hidratar desde localStorage en cliente
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setState(JSON.parse(raw));
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* noop */ }
  }, [state]);

  const stepIdx = STEPS.indexOf(step);
  const totalSteps = state.kind === 'grupo' ? STEPS.length : STEPS.length - 1; // grupo añade fase

  const next = () => {
    const order: Step[] = state.kind === 'grupo'
      ? [...STEPS]
      : (STEPS.filter((s) => s !== 'phase') as Step[]);
    const i = order.indexOf(step);
    if (i >= 0 && i < order.length - 1) setStep(order[i + 1]);
  };
  const prev = () => {
    const order: Step[] = state.kind === 'grupo'
      ? [...STEPS]
      : (STEPS.filter((s) => s !== 'phase') as Step[]);
    const i = order.indexOf(step);
    if (i > 0) setStep(order[i - 1]);
  };

  const finish = () => {
    try { window.localStorage.setItem(COMPLETED_KEY, JSON.stringify({ ...state, completedAt: new Date().toISOString() })); } catch { /* noop */ }
    router.push('/dashboard');
  };

  const skipAll = async () => {
    if (!(await confirm({ title: "Saltar la guía", description: "¿Saltar toda la guía? Podrás repetirla desde Ajustes." }))) return;
    finish();
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-purple-950/40 via-black to-cyan-950/40 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl space-y-4">
        {/* Progress */}
        <div className="flex items-center gap-1">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={cn(
                'h-1 flex-1 rounded-full transition-all',
                i <= stepIdx ? 'bg-gradient-to-r from-purple-400 to-cyan-400' : 'bg-white/10'
              )}
            />
          ))}
        </div>

        <Card className="liquid-glass-panel border-white/15">
          <CardContent className="p-6 md:p-8 space-y-5 min-h-[420px]">
            {step === 'kind' && <StepKind state={state} setState={setState} onNext={next} />}
            {step === 'authMode' && <StepAuthMode state={state} setState={setState} onNext={next} onFinish={finish} />}
            {step === 'auth' && <StepAuth state={state} setState={setState} onNext={next} />}
            {step === 'theme' && <StepTheme state={state} setState={setState} onNext={next} />}
            {step === 'walkthrough' && <StepWalkthrough onNext={next} />}
            {step === 'profile' && <StepProfile state={state} setState={setState} onNext={next} />}
            {step === 'ai-guide' && <StepAiGuide onNext={next} />}
            {step === 'phase' && state.kind === 'grupo' && (
              <StepPhase state={state} setState={setState} onNext={next} />
            )}
            {step === 'done' && <StepDone state={state} onFinish={finish} />}
          </CardContent>
        </Card>

        {/* Nav inferior */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={prev} disabled={stepIdx === 0} className="text-xs">
            <ChevronLeft className="w-3 h-3 mr-1" /> Anterior
          </Button>
          <Button variant="ghost" onClick={skipAll} className="text-xs text-muted-foreground">
            <SkipForward className="w-3 h-3 mr-1" /> Saltar toda la guía
          </Button>
          {step !== 'done' && (
            <Button variant="ghost" onClick={next} className="text-xs">
              Siguiente <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Pasos ────────────────────────────────────────────────────────────

function StepKind({ state, setState, onNext }: any) {
  return (
    <div className="space-y-4 text-center">
      <h1 className="text-3xl font-bold font-headline bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-purple-300 to-amber-200">
        Bienvenido a StarSeed
      </h1>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        Antes de empezar, dinos quién eres en esta red. Tu cuenta puede ser personal o representar a una comunidad.
      </p>
      <div className="grid sm:grid-cols-2 gap-3 mt-6">
        <KindCard icon={User} label="Individuo" desc="Una persona soberana en la red." selected={state.kind === 'individual'} onClick={() => { setState({ ...state, kind: 'individual' }); }} />
        <KindCard icon={Users} label="Grupo" desc="Comunidad / Sangha / colectivo." selected={state.kind === 'grupo'} onClick={() => { setState({ ...state, kind: 'grupo' }); }} />
      </div>
      <Button onClick={onNext} disabled={!state.kind} className="mt-4">
        Continuar <ArrowRight className="w-3 h-3 ml-1" />
      </Button>
    </div>
  );
}

function KindCard({ icon: Icon, label, desc, selected, onClick }: any) {
  return (
    <button onClick={onClick} className={cn(
      'p-5 rounded-2xl border-2 transition-all text-left hover:scale-[1.02]',
      selected ? 'border-purple-400 bg-purple-500/10 shadow-[0_0_30px_rgba(168,85,247,0.25)]' : 'border-white/10 hover:border-white/30 bg-white/[0.02]'
    )}>
      <Icon className="w-8 h-8 text-purple-300 mb-2" />
      <h3 className="font-bold text-base mb-1">{label}</h3>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </button>
  );
}

function StepAuthMode({ state, setState, onNext, onFinish }: any) {
  return (
    <div className="space-y-4 text-center">
      <h2 className="text-2xl font-bold">¿Ya tienes cuenta?</h2>
      <p className="text-sm text-muted-foreground">
        Si entras con una cuenta existente, te llevamos directo al sistema. Si la creas, te guiamos paso a paso.
      </p>
      <div className="grid sm:grid-cols-2 gap-3 mt-6">
        <KindCard icon={LogIn} label="Entrar" desc="Cargar mi cuenta sin guía." selected={state.mode === 'enter'} onClick={() => setState({ ...state, mode: 'enter' })} />
        <KindCard icon={UserPlus} label="Crear cuenta" desc="Iniciar la guía completa." selected={state.mode === 'create'} onClick={() => setState({ ...state, mode: 'create' })} />
      </div>
      {state.mode === 'enter' ? (
        <Link href="/login" className="inline-block mt-4">
          <Button>Ir a login</Button>
        </Link>
      ) : (
        <Button onClick={onNext} disabled={!state.mode}>Continuar <ArrowRight className="w-3 h-3 ml-1" /></Button>
      )}
    </div>
  );
}

function StepAuth({ state, setState, onNext }: any) {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-center">Crea tu acceso</h2>
      <p className="text-xs text-muted-foreground text-center">
        Recomendamos usuario y contraseña para no depender de correo o teléfono. El email es opcional.
      </p>
      <div className="grid gap-2 max-w-md mx-auto">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Usuario</label>
        <Input value={state.username ?? ''} onChange={(e) => setState({ ...state, username: e.target.value })} className="h-9" placeholder="ej. starseeder" />
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Contraseña</label>
        <Input type="password" value={state.password ?? ''} onChange={(e) => setState({ ...state, password: e.target.value })} className="h-9" placeholder="al menos 12 caracteres" />
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Email (opcional)</label>
        <Input type="email" value={state.email ?? ''} onChange={(e) => setState({ ...state, email: e.target.value })} className="h-9" placeholder="solo si quieres recuperación por correo" />
      </div>
      <div className="text-center pt-2">
        <Button onClick={onNext} disabled={!state.username || !state.password}>Continuar <ArrowRight className="w-3 h-3 ml-1" /></Button>
      </div>
    </div>
  );
}

function StepTheme({ state, setState, onNext }: any) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 justify-center">
        <Palette className="w-5 h-5 text-purple-400" />
        <h2 className="text-2xl font-bold">Elige tu estilo visual</h2>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Puedes cambiarlo después en Ajustes. También puedes instalar temas desde la biblioteca online o un archivo .json.
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => setState({ ...state, themeId: t.id })}
            className={cn(
              'p-3 rounded-xl border-2 text-left transition-all',
              state.themeId === t.id ? 'border-purple-400 bg-purple-500/10' : 'border-white/10 hover:border-white/30 bg-white/[0.02]'
            )}
          >
            <h4 className="text-xs font-bold mb-1">{t.label}</h4>
            <p className="text-[10px] text-muted-foreground">{t.description}</p>
          </button>
        ))}
      </div>
      <div className="text-center pt-2">
        <Button onClick={onNext} disabled={!state.themeId}>Continuar <ArrowRight className="w-3 h-3 ml-1" /></Button>
      </div>
    </div>
  );
}

function StepWalkthrough({ onNext }: any) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const current = WALKTHROUGH_PAGES[currentIdx];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 justify-center">
        <BookOpen className="w-5 h-5 text-cyan-400" />
        <h2 className="text-2xl font-bold">Conoce las secciones principales</h2>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Te llevamos por las páginas clave. Puedes saltar cualquier sección o todo el recorrido.
      </p>

      <Card className="border-cyan-500/20 bg-cyan-500/[0.04]">
        <CardContent className="p-5 flex items-start gap-4">
          <current.icon className="w-12 h-12 text-cyan-400 shrink-0" />
          <div className="flex-1">
            <h3 className="text-lg font-bold mb-1">{current.label}</h3>
            <p className="text-xs text-muted-foreground mb-3">{current.desc}</p>
            <div className="flex flex-wrap gap-2">
              <Link href={current.path} target="_blank">
                <Button variant="outline" size="sm" className="text-xs">
                  <ArrowRight className="w-3 h-3 mr-1" /> Visitar
                </Button>
              </Link>
              <Button variant="ghost" size="sm" className="text-xs"
                onClick={() => currentIdx < WALKTHROUGH_PAGES.length - 1 ? setCurrentIdx((i) => i + 1) : onNext()}>
                <SkipForward className="w-3 h-3 mr-1" /> Omitir esta
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{currentIdx + 1} de {WALKTHROUGH_PAGES.length}</span>
        {currentIdx < WALKTHROUGH_PAGES.length - 1 ? (
          <Button size="sm" onClick={() => setCurrentIdx((i) => i + 1)}>Siguiente sección <ChevronRight className="w-3 h-3 ml-1" /></Button>
        ) : (
          <Button size="sm" onClick={onNext}>Terminar recorrido <ChevronRight className="w-3 h-3 ml-1" /></Button>
        )}
      </div>
    </div>
  );
}

function StepProfile({ state, setState, onNext }: any) {
  const profile = state.profile ?? { displayName: '', bio: '' };
  const update = (p: any) => setState({ ...state, profile: { ...profile, ...p } });
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 justify-center">
        <ImageIcon className="w-5 h-5 text-emerald-400" />
        <h2 className="text-2xl font-bold">Tu perfil</h2>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Información básica. Puedes editar todo después.
      </p>
      <div className="grid gap-2 max-w-md mx-auto">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Nombre visible</label>
        <Input value={profile.displayName} onChange={(e) => update({ displayName: e.target.value })} className="h-9" placeholder="¿Cómo te llamamos?" />
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Descripción / Bio</label>
        <Textarea value={profile.bio} onChange={(e) => update({ bio: e.target.value })} rows={3} placeholder="Cuéntanos algo de ti..." className="text-xs" />
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">URL del avatar (opcional)</label>
        <Input value={profile.avatar ?? ''} onChange={(e) => update({ avatar: e.target.value })} className="h-9 font-mono text-xs" />
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">URL de la portada (opcional)</label>
        <Input value={profile.cover ?? ''} onChange={(e) => update({ cover: e.target.value })} className="h-9 font-mono text-xs" />
      </div>
      <div className="text-center pt-2">
        <Button onClick={onNext} disabled={!profile.displayName}>Continuar <ArrowRight className="w-3 h-3 ml-1" /></Button>
      </div>
    </div>
  );
}

function StepAiGuide({ onNext }: any) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 justify-center">
        <Brain className="w-5 h-5 text-purple-400" />
        <h2 className="text-2xl font-bold">Tu IA personal (Exocórtex)</h2>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        StarSeed integra una IA personal soberana, con memoria unificada, skills editables y conexiones MCP.
      </p>
      <div className="grid sm:grid-cols-3 gap-2">
        <FeatureCard icon={Cpu}      label="Proveedores"  desc="Conecta Ollama (local), Claude, OpenAI o Gemini. Prioriza gratis/local." />
        <FeatureCard icon={Sparkles} label="Skills"       desc="Stack abierto editable: Hermes, OpenHuman, OpenClaw, react-doctor." />
        <FeatureCard icon={Wrench}   label="Tools"        desc="Capacidades: web, archivo, memoria, cron, visión, voz." />
        <FeatureCard icon={Server}   label="MCPs"         desc="Servidores externos: Google, iCloud, fediverso." />
        <FeatureCard icon={Eye}      label="Sentidos"     desc="Visión, audición, voz, ubicación, intuición sintética." />
        <FeatureCard icon={Brain}    label="Cerebro"      desc="Visualización geométrica de tu memoria y conexiones." />
      </div>
      <div className="text-center pt-2 flex gap-2 justify-center">
        <Link href="/agent" target="_blank"><Button variant="outline" size="sm">Abrir Astraura AI</Button></Link>
        <Button onClick={onNext}>Continuar <ArrowRight className="w-3 h-3 ml-1" /></Button>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, label, desc }: any) {
  return (
    <div className="p-3 rounded-xl border border-white/10 bg-white/[0.02]">
      <Icon className="w-5 h-5 text-purple-300 mb-1" />
      <h4 className="text-xs font-bold mb-0.5">{label}</h4>
      <p className="text-[10px] text-muted-foreground leading-tight">{desc}</p>
    </div>
  );
}

function StepPhase({ state, setState, onNext }: any) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 justify-center">
        <Users className="w-5 h-5 text-amber-400" />
        <h2 className="text-2xl font-bold">Fase de tu comunidad</h2>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        El sistema se adapta a la fase en la que se encuentra tu Sangha. Puedes cambiarla cuando evoluciones.
      </p>
      <div className="grid gap-3">
        {PHASES.map((p) => {
          const Icon = p.icon;
          const selected = state.phase === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setState({ ...state, phase: p.id })}
              className={cn(
                'text-left rounded-2xl border-2 p-4 transition-all',
                'bg-gradient-to-br', p.gradient,
                selected ? 'border-amber-400 ring-2 ring-amber-400/30' : 'border-white/10 hover:border-white/30'
              )}
            >
              <div className="flex items-start gap-3">
                <Icon className="w-7 h-7 text-foreground/90 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold">{p.label}</h3>
                    <Badge variant="outline" className="text-[10px]">{p.tagline}</Badge>
                  </div>
                  <p className="text-xs text-foreground/80 mt-1 leading-tight">{p.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="text-center pt-2">
        <Button onClick={onNext} disabled={!state.phase}>Continuar <ArrowRight className="w-3 h-3 ml-1" /></Button>
      </div>
    </div>
  );
}

function StepDone({ state, onFinish }: any) {
  return (
    <div className="text-center space-y-4">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400/30 to-cyan-400/30 mb-2">
        <Check className="w-8 h-8 text-emerald-300" />
      </div>
      <h2 className="text-3xl font-bold font-headline bg-clip-text text-transparent bg-gradient-to-r from-emerald-300 via-cyan-300 to-purple-300">
        Listo, {state.profile?.displayName ?? state.username}
      </h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        Tu sistema está configurado y conectado al Cerebro. La IA está disponible desde el botón flotante en cualquier sección. Puedes ajustar todo desde Ajustes.
      </p>
      <Button onClick={onFinish} size="lg" className="mt-4">
        Entrar al Dashboard <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  );
}
