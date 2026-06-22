"use client";

// Evita el bailout de prerender estatico por useSearchParams (build de Vercel).
export const dynamic = "force-dynamic";

import { useState, useRef, useEffect, useMemo } from "react";
import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  BrainCircuit,
  Mic,
  Send,
  Sparkles,
  Image as ImageIcon,
  FileText,
  Settings,
  History,
  Code,
  Bot,
  Workflow,
  Shield,
  Plus,
  Save,
  Trash2,
  Sliders,
  Play,
  Square,
  Lock,
  Cpu,
  Cloud,
  Zap,
  Wrench,
  BookOpen,
  CheckCircle2,
  Database,
  Vote,
  Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import OKFPanel from "@/components/exocortex/okf-panel";
import ProviderPanel from "@/components/exocortex/provider-panel";
import AuroraStudio from "@/components/aurora/aurora-studio";
import StoragePanel from "@/components/storage/storage-panel";
import ConnectionsHub from "@/components/storage/connections-hub";
import BrainsPanel from "@/components/brains/brains-panel";
import ServersPanel from "@/components/brains/servers-panel";
import GovernancePanel from "@/components/governance/governance-panel";
import GovNotifications from "@/components/governance/notifications-panel";
import MyActivity from "@/components/decisions/my-activity";

import { chat } from "@/ai/client/chat";
import { loadConfigs, getActiveProviderId, setActiveProviderId } from "@/ai/client/providerStore";
import { PROVIDERS, type ProviderId } from "@/ai/providers";
import type { ProviderConfig, ChatMessage } from "@/ai/providers/types";
import { skillsRegistry } from "@/hermes-integration/07-skills-registry";
import { toolsRegistry } from "@/hermes-integration/08-tools-registry";
import { hermes } from "@/hermes-integration";
import { SensesPanel } from "@/components/hermes/senses-panel";
import { McpPanel } from "@/components/hermes/mcp-panel";
import { QuickOptionsGrid } from "@/components/hermes/quick-options-grid";
import { AiStudioDashboard } from "@/components/hermes/ai-studio-dashboard";
import { MemoryBrain3D } from "@/components/exocortex/memory-brain-3d";
import { TelegramSpacesPanel } from "@/components/exocortex/telegram-spaces-panel";
import { ChatNeuralSidebar } from "@/components/agent/chat-neural-sidebar";
import { MemoryHub } from "@/components/exocortex/memory-hub";
import { AgentRuntimePanel } from "@/components/agent/agent-runtime-panel";
import { VaultsPanel } from "@/components/exocortex/vaults-panel";
import { BatchJobsPanel } from "@/components/hermes/batch-jobs-panel";
import { ServerRegistryPanel } from "@/components/hermes/server-registry-panel";
import { HardDrive } from "lucide-react";
import { Eye, Server, LayoutDashboard, Brain, Layers } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { buildSystemContext, snapshotToSystemPrompt } from "@/hermes-integration/system-context";
import { getLivingGraphStore } from "@/hermes-integration/living-graph-store";
import { getOpenHumanEngine } from "@/hermes-integration/openhuman-bridge";
import { useCalendar, eventDateTimeMs } from "@/contexts/calendar-context";

// --- Types ---
type Agent = {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  temperature: number;
  capabilities: string[];
};

type Rule = {
  id: string;
  name: string;
  content: string;
  isActive: boolean;
};

type WorkflowItem = {
  id: string;
  name: string;
  trigger: string;
  action: string;
  isActive: boolean;
};

// --- Mock Data ---
const initialAgents: Agent[] = [
  {
    id: "1",
    name: "Núcleo StarSeed",
    description: "Asistente central del sistema operativo.",
    systemPrompt: "Eres el núcleo operativo de StarSeed...",
    temperature: 0.7,
    capabilities: ["search", "code", "file_system"]
  },
  {
    id: "2",
    name: "Musa Creativa",
    description: "Generador de arte y conceptos abstractos.",
    systemPrompt: "Eres una musa inspiradora...",
    temperature: 1.2,
    capabilities: ["image_gen", "poetry"]
  }
];

const initialRules: Rule[] = [
  { id: "r1", name: "Código Abierto", content: "Todo código generado debe ser Open Source (MIT).", isActive: true },
  { id: "r2", name: "Tono Pacífico", content: "Mantener un tono diplomático y constructivo.", isActive: true },
];

const initialWorkflows: WorkflowItem[] = [
  { id: "w1", name: "Resumen Diario", trigger: "Every 24h", action: "Summarize /News -> Send to Inbox", isActive: true },
  { id: "w2", name: "Auto-Tag Library", trigger: "On File Upload", action: "Analyze Content -> Add AI Tags", isActive: false },
];

type ChatTurn = { role: "user" | "agent"; content: string; timestamp: string; pending?: boolean };

function AgentPageInner() {
  const params = useSearchParams();
  const tabParam = params?.get('tab');
  const initialTab =
    tabParam === 'skills' ? 'skills' :
    tabParam === 'tools' ? 'tools' :
    tabParam === 'mcp' ? 'mcp' :
    tabParam === 'senses' ? 'senses' :
    tabParam === 'foundry' ? 'foundry' :
    tabParam === 'rules' ? 'rules' :
    tabParam === 'workflows' ? 'workflows' :
    'chat';

  const [messages, setMessages] = useState<ChatTurn[]>([
    { role: 'agent', content: 'Sistemas neurales activos. Elige un proveedor de IA en Ajustes → IA & Modelos para empezar a conversar de verdad.', timestamp: 'Ahora' }
  ]);
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState(initialTab);

  // Contexto del sincrómetro — fuente de eventos para inyectar en el system prompt.
  const calendar = useCalendar();

  // Studio State
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [rules, setRules] = useState<Rule[]>(initialRules);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>(initialWorkflows);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("1");

  // Provider state — wired to the new multi-provider layer.
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [activeProviderId, setActiveProviderIdState] = useState<ProviderId | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const [streaming, setStreaming] = useState(false);

  // Skills & Tools state
  const [installedSkills, setInstalledSkills] = useState<any[]>([]);
  const [enabledTools, setEnabledTools] = useState<any[]>([]);
  const [allTools, setAllTools] = useState<any[]>([]);

  useEffect(() => {
    setConfigs(loadConfigs());
    setActiveProviderIdState(getActiveProviderId());

    // Init Hermes integration for skills & tools
    hermes.init().then(() => {
      setInstalledSkills(skillsRegistry.getAll());
      setAllTools(toolsRegistry.getAll());
      setEnabledTools(toolsRegistry.getEnabledTools());
    });
  }, []);

  const activeAgent = agents.find(a => a.id === selectedAgentId) || agents[0];
  const activeProviderConfig = useMemo(
    () => configs.find(c => c.enabled && c.id === activeProviderId) ?? configs.find(c => c.enabled),
    [configs, activeProviderId]
  );
  const activeProviderInfo = activeProviderConfig ? PROVIDERS[activeProviderConfig.id].info : null;

  function setProvider(id: ProviderId) {
    setActiveProviderId(id);
    setActiveProviderIdState(id);
    toast.success(`Proveedor activo: ${PROVIDERS[id].info.label}`);
  }

  async function handleSend() {
    const text = inputValue.trim();
    if (!text || streaming) return;

    setInputValue("");
    const now = new Date().toLocaleTimeString();
    setMessages(prev => [...prev, { role: 'user', content: text, timestamp: now }]);

    if (!activeProviderConfig) {
      setMessages(prev => [...prev, {
        role: 'agent',
        timestamp: now,
        content: 'Aún no tienes un proveedor de IA configurado. Ve a Ajustes → IA & Modelos y añade Ollama (local) u otro proveedor con tu propia clave.',
      }]);
      return;
    }

    // Build the conversation context:
    //   1. Persona + system prompt del agente
    //   2. Reglas activas
    //   3. Snapshot completo del sistema (Sincrómetro, sentidos, MCPs, skills,
    //      tools, memoria reciente OpenHuman, próximos eventos)
    //   4. Resumen textual de la Gráfica Viva (nodos + aristas)
    //   5. Historial de mensajes
    //
    // Esto garantiza que la IA tiene contexto completo en cada turno.
    const systemPieces: string[] = [activeAgent.systemPrompt];
    rules.filter(r => r.isActive).forEach(r => systemPieces.push(`Regla "${r.name}": ${r.content}`));

    try {
      const upcomingEvents = calendar.items
        .filter(it => eventDateTimeMs(it) >= Date.now())
        .sort((a, b) => eventDateTimeMs(a) - eventDateTimeMs(b))
        .slice(0, 10)
        .map(it => `[${it.date}${it.time ? ' ' + it.time : ''}] (${it.layer}) ${it.title}`);
      const snapshot = buildSystemContext({ upcomingEvents });
      systemPieces.push(snapshotToSystemPrompt(snapshot));

      // Resumen del grafo vivo — la IA "ve" sus propias conexiones.
      const graphSummary = getLivingGraphStore().textualSummary();
      systemPieces.push(graphSummary);

      // Snapshot del calendario unificado.
      systemPieces.push(calendar.aiContextSnapshot());

      // Persistir el turno como chunk en la memoria OpenHuman
      // (tree + FTS) para que sea recuperable en futuros turnos.
      getOpenHumanEngine().ingest(text, 'chat', `chat-${Date.now()}`);
    } catch (e) {
      console.warn('[Agent] No se pudo construir contexto completo:', e);
    }

    const history: ChatMessage[] = [
      { role: 'system', content: systemPieces.join('\n\n---\n\n') },
      ...messages.filter(m => !m.pending).map<ChatMessage>(m => ({
        role: m.role === 'agent' ? 'assistant' : 'user',
        content: m.content,
      })),
      { role: 'user', content: text },
    ];

    // Placeholder turn that we'll fill via streaming.
    const placeholderIdx = -1;
    setMessages(prev => [...prev, { role: 'agent', content: '', timestamp: now, pending: true }]);

    abortRef.current = new AbortController();
    setStreaming(true);
    try {
      await chat({
        messages: history,
        temperature: activeAgent.temperature,
        passphrase,
        signal: abortRef.current.signal,
        onChunk: (delta) => {
          setMessages(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'agent' && last.pending) {
              next[next.length - 1] = { ...last, content: last.content + delta };
            }
            return next;
          });
        },
      });
      setMessages(prev => prev.map(m => (m.pending ? { ...m, pending: false } : m)));
    } catch (err) {
      const msg = (err as Error).message;
      setMessages(prev => {
        const next = prev.filter(m => !m.pending);
        next.push({ role: 'agent', content: `⚠ ${msg}`, timestamp: now });
        return next;
      });
      toast.error(`Error: ${msg}`);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
    setStreaming(false);
    setMessages(prev => prev.map(m => (m.pending ? { ...m, pending: false, content: m.content + ' (cancelado)' } : m)));
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeTab]);

  return (
    <div className="flex flex-col h-[calc(100dvh-5rem)] gap-4 p-4 md:p-6 max-w-[1600px] mx-auto w-full">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-400 flex items-center gap-3">
          <BrainCircuit className="w-8 h-8 text-primary" />
          AI Studio & Orchestration
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          {activeProviderConfig ? (
            <Badge
              variant="outline"
              className={`gap-1 ${
                activeProviderInfo?.local
                  ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
                  : "border-blue-500/50 text-blue-400 bg-blue-500/10"
              }`}
            >
              {activeProviderInfo?.local ? <Cpu className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}
              {activeProviderConfig.label} · {activeProviderConfig.defaultModel}
            </Badge>
          ) : (
            <Link href="/settings">
              <Badge variant="outline" className="border-amber-500/50 text-amber-400 bg-amber-500/10 cursor-pointer hover:bg-amber-500/20">
                Configura un proveedor de IA →
              </Badge>
            </Link>
          )}
          <Badge variant="outline" className="border-blue-500/50 text-blue-400 bg-blue-500/10">{agents.length} agentes</Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col gap-4 min-h-0">
        <TabsList className="w-full justify-start bg-black/20 border border-white/5 p-1 flex-wrap">
          <TabsTrigger value="overview" className="gap-2"><LayoutDashboard className="w-4 h-4" /> Resumen</TabsTrigger>
          <TabsTrigger value="chat" className="gap-2"><Bot className="w-4 h-4" /> Chat Neural</TabsTrigger>
          <TabsTrigger value="cerebro" className="gap-2"><Brain className="w-4 h-4" /> Cerebro</TabsTrigger>
          <TabsTrigger value="foundry" className="gap-2"><Sparkles className="w-4 h-4" /> Agent Foundry</TabsTrigger>
          <TabsTrigger value="rules" className="gap-2"><Shield className="w-4 h-4" /> Reglas</TabsTrigger>
          <TabsTrigger value="workflows" className="gap-2"><Workflow className="w-4 h-4" /> Workflows</TabsTrigger>
          <TabsTrigger value="skills" className="gap-2"><BookOpen className="w-4 h-4" /> Skills</TabsTrigger>
          <TabsTrigger value="tools" className="gap-2"><Wrench className="w-4 h-4" /> Tools</TabsTrigger>
          <TabsTrigger value="mcp" className="gap-2"><Server className="w-4 h-4" /> MCPs</TabsTrigger>
          <TabsTrigger value="senses" className="gap-2"><Eye className="w-4 h-4" /> Sentidos</TabsTrigger>
          <TabsTrigger value="batch" className="gap-2"><Layers className="w-4 h-4" /> Batch</TabsTrigger>
          <TabsTrigger value="servers" className="gap-2"><HardDrive className="w-4 h-4" /> Servidores</TabsTrigger>
          <TabsTrigger value="quick" className="gap-2"><Plus className="w-4 h-4" /> Accesos</TabsTrigger>
          <TabsTrigger value="telegram" className="gap-2"><Bot className="w-4 h-4" /> Telegram</TabsTrigger>
          <TabsTrigger value="memorias" className="gap-2"><Brain className="w-4 h-4" /> Memorias</TabsTrigger>
          <TabsTrigger value="baules" className="gap-2"><Layers className="w-4 h-4" /> Baúles</TabsTrigger>
          <TabsTrigger value="mapa3d" className="gap-2"><Sparkles className="w-4 h-4" /> Mapa 3D</TabsTrigger>
          <TabsTrigger value="runtimes" className="gap-2"><Server className="w-4 h-4" /> Agentes</TabsTrigger>
          <TabsTrigger value="okf" className="gap-2"><BookOpen className="w-4 h-4" /> Wiki/OKF</TabsTrigger>
          <TabsTrigger value="proveedor" className="gap-2"><Database className="w-4 h-4" /> Proveedor</TabsTrigger>
          <TabsTrigger value="aurora" className="gap-2"><Mic className="w-4 h-4" /> Aurora</TabsTrigger>
          <TabsTrigger value="almacenes" className="gap-2"><HardDrive className="w-4 h-4" /> Almacenes</TabsTrigger>
          <TabsTrigger value="conexiones" className="gap-2"><Cloud className="w-4 h-4" /> Conexiones</TabsTrigger>
          <TabsTrigger value="cerebros" className="gap-2"><BrainCircuit className="w-4 h-4" /> Cerebros</TabsTrigger>
          <TabsTrigger value="servidores" className="gap-2"><Server className="w-4 h-4" /> Servidores</TabsTrigger>
          <TabsTrigger value="decisiones" className="gap-2"><Vote className="w-4 h-4" /> Decisiones</TabsTrigger>
          <TabsTrigger value="mi-actividad" className="gap-2"><Activity className="w-4 h-4" /> Mi actividad</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex-1 min-h-0 overflow-y-auto">
          <AiStudioDashboard />
        </TabsContent>

        <TabsContent value="cerebro" className="flex-1 min-h-0 overflow-hidden">
          <MemoryBrain3D className="h-full min-h-[70vh]" />
        </TabsContent>

        <TabsContent value="batch" className="flex-1 min-h-0 overflow-y-auto">
          <BatchJobsPanel />
        </TabsContent>

        <TabsContent value="servers" className="flex-1 min-h-0 overflow-y-auto">
          <ServerRegistryPanel />
        </TabsContent>

        {/* --- TAB: CHAT --- */}
        <TabsContent value="chat" className="flex-1 data-[state=active]:flex gap-6 min-h-0">
          <ChatNeuralSidebar />
          {/* Chat Interface */}
          <div className="flex-1 flex flex-col rounded-xl border bg-background/50 overflow-hidden shadow-sm relative">
            <div className="absolute top-4 right-4 z-10 flex gap-2">
              {configs.filter(c => c.enabled).length > 0 && (
                <Select
                  value={activeProviderId ?? configs[0]?.id}
                  onValueChange={(v) => setProvider(v as ProviderId)}
                >
                  <SelectTrigger className="w-[200px] max-w-[46vw] bg-card/60 backdrop-blur border-border/50">
                    <SelectValue placeholder="Proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {configs.filter(c => c.enabled).map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {PROVIDERS[c.id].info.local ? "🖥 " : "☁ "}{c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                <SelectTrigger className="w-[180px] max-w-[42vw] bg-card/60 backdrop-blur border-border/50">
                  <SelectValue placeholder="Agente" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="flex flex-col gap-4 max-w-3xl mx-auto pt-10">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <Avatar className="w-8 h-8 border border-white/10">
                      {msg.role === 'agent' ? (
                        <AvatarFallback className="bg-primary/20 text-primary"><Bot className="w-4 h-4" /></AvatarFallback>
                      ) : (
                        <AvatarImage src="https://placehold.co/40x40.png" />
                      )}
                    </Avatar>
                    <div className={`p-3 rounded-2xl max-w-[80%] text-sm shadow-sm whitespace-pre-wrap ${msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-none'
                      : 'bg-card border rounded-tl-none'
                      }`}>
                      {msg.content}
                      {msg.pending && <span className="inline-block w-2 h-4 ml-1 bg-primary/70 animate-pulse align-middle" />}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="p-4 border-t bg-background/40 backdrop-blur-md space-y-2">
              {activeProviderConfig?.encryptedKey && (
                <div className="flex gap-2 max-w-3xl mx-auto items-center">
                  <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                  <Input
                    type="password"
                    placeholder="Frase de paso (descifra tu clave de API)"
                    className="flex-1 bg-background/50 text-xs h-8"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                  />
                </div>
              )}
              <div className="flex gap-2 max-w-3xl mx-auto items-center">
                <Button variant="outline" size="icon" className="shrink-0" disabled><Mic className="w-4 h-4" /></Button>
                <Input
                  placeholder={`Conversando con ${activeAgent.name}${activeProviderConfig ? ` vía ${activeProviderConfig.label}` : ""}...`}
                  className="flex-1 bg-background/50"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !streaming && handleSend()}
                  disabled={streaming}
                />
                {streaming ? (
                  <Button onClick={handleStop} variant="destructive" className="shrink-0 gap-2">
                    <Square className="w-4 h-4" /> Detener
                  </Button>
                ) : (
                  <Button onClick={handleSend} className="shrink-0 gap-2" disabled={!inputValue.trim()}>
                    <Send className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* --- TAB: FOUNDRY (AGENT BUILDER) --- */}
        <TabsContent value="foundry" className="flex-1 data-[state=active]:grid grid-cols-1 md:grid-cols-3 gap-6 overflow-y-auto min-h-0">
          {/* Agent List */}
          <Card className="col-span-1 border-white/10 bg-black/20">
            <CardHeader>
              <CardTitle className="text-lg flex justify-between items-center">
                Mis Agentes
                <Button size="sm" variant="ghost"><Plus className="w-4 h-4" /></Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {agents.map(agent => (
                <div
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${selectedAgentId === agent.id ? 'bg-primary/10 border-primary/50' : 'bg-transparent border-white/5 hover:bg-white/5'}`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8 rounded-md">
                      <AvatarFallback><Bot className="w-4 h-4" /></AvatarFallback>
                    </Avatar>
                    <div className="overflow-hidden">
                      <p className="font-semibold text-sm truncate">{agent.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{agent.capabilities.length} capabilities</p>
                    </div>
                  </div>
                  {selectedAgentId === agent.id && <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Editor */}
          <Card className="col-span-1 md:col-span-2 border-white/10 bg-black/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sliders className="w-5 h-5" /> Configuración de Agente</CardTitle>
              <CardDescription>Define la personalidad, directivas y parámetros de tu IA.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase text-muted-foreground">Nombre</label>
                  <Input value={activeAgent.name} onChange={(e) => setAgents(prev => prev.map(a => a.id === selectedAgentId ? { ...a, name: e.target.value } : a))} className="bg-black/20 border-white/10" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase text-muted-foreground">Rol / Descripción</label>
                  <Input value={activeAgent.description} onChange={(e) => setAgents(prev => prev.map(a => a.id === selectedAgentId ? { ...a, description: e.target.value } : a))} className="bg-black/20 border-white/10" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase text-muted-foreground">Prime Directive (System Prompt)</label>
                <Textarea value={activeAgent.systemPrompt} onChange={(e) => setAgents(prev => prev.map(a => a.id === selectedAgentId ? { ...a, systemPrompt: e.target.value } : a))} className="h-32 bg-black/20 border-white/10 font-mono text-sm" />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium uppercase text-muted-foreground">Creatividad (Temperature): {activeAgent.temperature}</label>
                </div>
                <Slider value={[activeAgent.temperature]} onValueChange={(val) => setAgents(prev => prev.map(a => a.id === selectedAgentId ? { ...a, temperature: val[0] } : a))} max={2} step={0.1} className="w-full" />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                <Button variant="destructive" size="sm" className="gap-2"><Trash2 className="w-4 h-4" /> Eliminar</Button>
                <Button size="sm" className="gap-2"><Save className="w-4 h-4" /> Guardar Cambios</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- TAB: RULES & CONTEXT --- */}
        <TabsContent value="rules" className="flex-1 data-[state=active]:grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto min-h-0">
          <Card className="border-white/10 bg-black/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5 text-emerald-400" /> Leyes del Sistema</CardTitle>
              <CardDescription>Reglas inmutables que todos los agentes deben obedecer.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {rules.map(rule => (
                <div key={rule.id} className="flex items-start gap-4 p-4 rounded-lg bg-white/5 border border-white/5">
                  <Switch checked={rule.isActive} onCheckedChange={() => setRules(prev => prev.map(r => r.id === rule.id ? { ...r, isActive: !r.isActive } : r))} />
                  <div className="flex-1 space-y-1">
                    <p className="font-semibold text-sm">{rule.name}</p>
                    <p className="text-xs text-muted-foreground font-mono bg-black/30 p-2 rounded">{rule.content}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6"><Settings className="w-3 h-3" /></Button>
                </div>
              ))}
              <Button variant="outline" className="w-full border-dashed border-white/20 hover:bg-white/5 gap-2"><Plus className="w-4 h-4" /> Nueva Regla</Button>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-black/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BrainCircuit className="w-5 h-5 text-purple-400" /> Contextos Ambientales</CardTitle>
              <CardDescription>Sets de conocimiento cargados dinámicamente.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20 flex justify-between items-center">
                <div>
                  <p className="font-bold text-sm text-purple-300">Modo Desarrollo</p>
                  <p className="text-xs text-purple-400/70">Acceso a docs de Next.js, Tailwind, StarSeed Core.</p>
                </div>
                <Badge className="bg-purple-500/20 text-purple-300 hover:bg-purple-500/30">Activo</Badge>
              </div>
              <div className="p-4 rounded-lg bg-white/5 border border-white/5 flex justify-between items-center opacity-60">
                <div>
                  <p className="font-bold text-sm">Modo Filósofo</p>
                  <p className="text-xs text-muted-foreground">Acceso a Manifiesto Ontocrático, Historia.</p>
                </div>
                <Switch defaultChecked={false} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- TAB: WORKFLOWS --- */}
        <TabsContent value="workflows" className="flex-1 min-h-0 overflow-y-auto">
          <Card className="border-white/10 bg-black/20 h-full">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><Workflow className="w-5 h-5 text-orange-400" /> Motor de Flujos</CardTitle>
                <CardDescription>Automatización de tareas encadenadas.</CardDescription>
              </div>
              <Button className="gap-2 bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20">
                <Plus className="w-4 h-4" /> Crear Flujo
              </Button>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workflows.map(wf => (
                <div key={wf.id} className="relative group p-5 rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent hover:border-orange-500/30 transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <div className={`p-2 rounded-lg ${wf.isActive ? 'bg-orange-500/20 text-orange-400' : 'bg-white/5 text-muted-foreground'}`}>
                      <Workflow className="w-5 h-5" />
                    </div>
                    <Switch checked={wf.isActive} onCheckedChange={() => setWorkflows(prev => prev.map(w => w.id === wf.id ? { ...w, isActive: !w.isActive } : w))} />
                  </div>
                  <h3 className="font-bold mb-1">{wf.name}</h3>
                  <div className="space-y-2 mt-4 text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="font-mono bg-black/40 px-1 rounded">IF</span> {wf.trigger}
                    </div>
                    <div className="flex items-center gap-2 text-orange-300">
                      <span className="font-mono bg-black/40 px-1 rounded text-muted-foreground">THEN</span> {wf.action}
                    </div>
                  </div>
                  <div className="absolute top-4 right-14 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-6 w-6"><Play className="w-3 h-3" /></Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- TAB: SKILLS --- */}
        <TabsContent value="skills" className="flex-1 min-h-0 overflow-y-auto">
          <Card className="border-white/10 bg-black/20 h-full">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><BookOpen className="w-5 h-5 text-purple-400" /> Skills del Exocórtex</CardTitle>
                <CardDescription>Procedimientos reutilizables que el agente carga automáticamente según el contexto.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1 text-xs"><Zap className="w-3 h-3" /> {installedSkills.length} skills</Badge>
                <Link href="/ai-setup">
                  <Button size="sm" variant="outline" className="gap-1 text-xs">
                    <Database className="w-3 h-3" /> Descubrir
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {installedSkills.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <BookOpen className="w-12 h-12 text-muted-foreground/30 mx-auto" />
                  <p className="text-muted-foreground">No hay skills instalados</p>
                  <p className="text-xs text-muted-foreground/60">
                    Escanea tu sistema en{' '}
                    <Link href="/ai-setup" className="text-primary hover:underline">Configuración IA</Link>
                    {' '}para detectar skills de Hermes, o crea uno nuevo.
                  </p>
                  <Button variant="outline" size="sm" className="gap-1">
                    <Plus className="w-3 h-3" /> Nuevo Skill
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {installedSkills.map((skill, i) => (
                    <div key={i} className="p-4 rounded-xl border border-white/10 bg-gradient-to-br from-purple-500/5 to-transparent hover:border-purple-500/30 transition-all group">
                      <div className="flex items-start justify-between mb-2">
                        <div className="p-2 rounded-lg bg-purple-500/20">
                          <BookOpen className="w-4 h-4 text-purple-400" />
                        </div>
                        <Badge variant="outline" className="text-[9px]">v{skill.metadata.version || '1.0'}</Badge>
                      </div>
                      <h4 className="font-semibold text-sm mb-1">{skill.metadata.name}</h4>
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                        {skill.metadata.description || 'Skill del sistema'}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {(skill.metadata.tags || []).slice(0, 4).map((tag: string) => (
                          <Badge key={tag} variant="secondary" className="text-[8px]">{tag}</Badge>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-400" />
                          {skill.metadata.triggers?.length || 0} triggers
                        </span>
                        <span>·</span>
                        <span>
                          {skill.metadata.dependencies?.length || 0} dependencias
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- TAB: TOOLS --- */}
        <TabsContent value="tools" className="flex-1 min-h-0 overflow-y-auto">
          <Card className="border-white/10 bg-black/20 h-full">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><Wrench className="w-5 h-5 text-emerald-400" /> Tools del Sistema</CardTitle>
                <CardDescription>Herramientas disponibles para los agentes. Activa o desactiva cada toolset según necesites.</CardDescription>
              </div>
              <Badge variant="outline" className="gap-1 text-xs">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" /> {enabledTools.length}/{allTools.length} activas
              </Badge>
            </CardHeader>
            <CardContent>
              {allTools.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <Wrench className="w-12 h-12 text-muted-foreground/30 mx-auto" />
                  <p className="text-muted-foreground">No hay tools registradas</p>
                  <p className="text-xs text-muted-foreground/60">
                    Las tools se registran automáticamente al conectar el sistema.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Resumen por toolset */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
                    {Object.entries(allTools.reduce((acc: any, t: any) => {
                      const ts = t.toolset || 'unknown';
                      if (!acc[ts]) acc[ts] = [];
                      acc[ts].push(t);
                      return acc;
                    }, {})).map(([toolset, tools]: [string, any]) => (
                      <div key={toolset} className="p-3 rounded-lg bg-white/5 border border-white/5 text-center">
                        <p className="font-semibold text-sm capitalize">{toolset.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-muted-foreground">{tools.length} tools</p>
                      </div>
                    ))}
                  </div>

                  {/* Lista de tools */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {allTools.map((tool, i) => {
                      const toolset = tool.toolset || 'unknown';
                      const colors: Record<string, string> = {
                        web: 'text-blue-400', file: 'text-cyan-400', memory: 'text-purple-400',
                        terminal: 'text-emerald-400', code_execution: 'text-amber-400',
                        delegation: 'text-pink-400', cron: 'text-orange-400',
                        vision: 'text-violet-400', image_gen: 'text-rose-400',
                        messaging: 'text-sky-400',
                      };
                      return (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-white/5 hover:bg-white/5 transition-colors">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#' + (Math.floor(Math.random()*0xFFFFFF).toString(16).padStart(6,'0')) }} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{tool.schema?.name || 'unnamed'}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              <span className={`${colors[toolset] || 'text-muted-foreground'}`}>{toolset}</span>
                              {' · '}{tool.schema?.description?.slice(0, 60) || ''}
                            </p>
                          </div>
                          <Badge variant="outline" className={`text-[9px] ${colors[toolset] || ''}`}>{toolset}</Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- TAB: MCP --- */}
        <TabsContent value="mcp" className="flex-1 min-h-0 overflow-y-auto">
          <McpPanel />
        </TabsContent>

        {/* --- TAB: SENTIDOS --- */}
        <TabsContent value="senses" className="flex-1 min-h-0 overflow-y-auto">
          <SensesPanel />
        </TabsContent>

        {/* --- TAB: ACCESOS RÁPIDOS (mismo catálogo del dock y Nexus) --- */}
        <TabsContent value="telegram" className="flex-1 min-h-0 overflow-y-auto"><TelegramSpacesPanel /></TabsContent>

        <TabsContent value="memorias" className="flex-1 min-h-0 overflow-y-auto"><MemoryHub /></TabsContent>

        <TabsContent value="baules" className="flex-1 min-h-0 overflow-y-auto"><VaultsPanel /></TabsContent>

        <TabsContent value="mapa3d" className="flex-1 min-h-0 overflow-y-auto"><div className="flex flex-col items-center justify-center h-full text-center gap-4 p-8"><div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-fuchsia-500 to-cyan-500 flex items-center justify-center text-3xl">🌐</div><div className="text-lg font-semibold text-cyan-50">Mapa 3D de memorias</div><p className="text-sm text-white/50 max-w-md">Visualiza tus baúles, memorias y conexiones como un grafo 3D interactivo, con vistas múltiples, ramificación y la ayuda de Astraura para organizarlo.</p><Link href="/memorias-3d"><Button className="gap-2 bg-cyan-600 hover:bg-cyan-500"><Sparkles className="w-4 h-4" /> Abrir mapa 3D</Button></Link></div></TabsContent>

        <TabsContent value="runtimes" className="flex-1 min-h-0 overflow-y-auto"><AgentRuntimePanel /></TabsContent>

        <TabsContent value="okf" className="flex-1 min-h-0 overflow-y-auto"><OKFPanel /></TabsContent>

        <TabsContent value="proveedor" className="flex-1 min-h-0 overflow-y-auto"><ProviderPanel /></TabsContent>

        <TabsContent value="aurora" className="flex-1 min-h-0 overflow-y-auto"><AuroraStudio /></TabsContent>

        <TabsContent value="almacenes" className="flex-1 min-h-0 overflow-y-auto"><StoragePanel /></TabsContent>

        <TabsContent value="conexiones" className="flex-1 min-h-0 overflow-y-auto"><ConnectionsHub /></TabsContent>

        <TabsContent value="cerebros" className="flex-1 min-h-0 overflow-y-auto"><BrainsPanel /></TabsContent>

        <TabsContent value="servidores" className="flex-1 min-h-0 overflow-y-auto"><ServersPanel /></TabsContent>

        <TabsContent value="decisiones" className="flex-1 min-h-0 overflow-y-auto"><div className="space-y-6"><GovernancePanel /><GovNotifications /></div></TabsContent>

        <TabsContent value="mi-actividad" className="flex-1 min-h-0 overflow-y-auto"><MyActivity /></TabsContent>

        <TabsContent value="quick" className="flex-1 min-h-0 overflow-y-auto space-y-3">
          <QuickOptionsGrid
            title="Accesos rápidos del agente"
            description="El mismo catálogo unificado disponible en el dock y el Nexus. Edita aquí lo que quieres exponer en cualquier superficie."
            columns={4}
            editable
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AgentPage() {
  return (
    <Suspense fallback={null}>
      <AgentPageInner />
    </Suspense>
  );
}
