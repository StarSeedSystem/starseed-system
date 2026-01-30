"use client";

import { useState, useRef, useEffect } from "react";
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
  Play
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

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

export default function AgentPage() {
  const [messages, setMessages] = useState([
    { role: 'agent', content: 'Sistemas neurales activos. El estudio de orquestación está listo.', timestamp: 'Ahora' }
  ]);
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState("chat");

  // Studio State
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [rules, setRules] = useState<Rule[]>(initialRules);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>(initialWorkflows);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("1");

  const activeAgent = agents.find(a => a.id === selectedAgentId) || agents[0];

  const handleSend = () => {
    if (!inputValue.trim()) return;
    const newMsg = { role: 'user', content: inputValue, timestamp: 'Ahora' };
    setMessages(prev => [...prev, newMsg]);
    setInputValue("");
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'agent', content: `[${activeAgent.name}]: Procesando solicitud con temperatura ${activeAgent.temperature}...`, timestamp: 'Ahora' }]);
    }, 600);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeTab]);

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] gap-4 p-4 md:p-6 max-w-[1600px] mx-auto w-full">

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-400 flex items-center gap-3">
          <BrainCircuit className="w-8 h-8 text-primary" />
          AI Studio & Orchestration
        </h1>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-green-500/50 text-green-400 bg-green-500/10">System Online</Badge>
          <Badge variant="outline" className="border-blue-500/50 text-blue-400 bg-blue-500/10">{agents.length} Agents Active</Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col gap-4">
        <TabsList className="w-full justify-start bg-black/20 border border-white/5 p-1">
          <TabsTrigger value="chat" className="gap-2"><Bot className="w-4 h-4" /> Chat Neural</TabsTrigger>
          <TabsTrigger value="foundry" className="gap-2"><Sparkles className="w-4 h-4" /> Agent Foundry</TabsTrigger>
          <TabsTrigger value="rules" className="gap-2"><Shield className="w-4 h-4" /> Reglas & Contexto</TabsTrigger>
          <TabsTrigger value="workflows" className="gap-2"><Workflow className="w-4 h-4" /> Workflows</TabsTrigger>
        </TabsList>

        {/* --- TAB: CHAT --- */}
        <TabsContent value="chat" className="flex-1 flex gap-6 min-h-0">
          {/* Chat Interface */}
          <div className="flex-1 flex flex-col rounded-xl border bg-background/50 overflow-hidden shadow-sm relative">
            <div className="absolute top-4 right-4 z-10">
              <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                <SelectTrigger className="w-[180px] bg-black/50 backdrop-blur border-white/10">
                  <SelectValue placeholder="Select Agent" />
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
                    <div className={`p-3 rounded-2xl max-w-[80%] text-sm shadow-sm ${msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-none'
                      : 'bg-card border rounded-tl-none'
                      }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="p-4 border-t bg-background/40 backdrop-blur-md">
              <div className="flex gap-2 max-w-3xl mx-auto items-center">
                <Button variant="outline" size="icon" className="shrink-0"><Mic className="w-4 h-4" /></Button>
                <Input
                  placeholder={`Chatting with ${activeAgent.name}...`}
                  className="flex-1 bg-background/50"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                />
                <Button onClick={handleSend} className="shrink-0 gap-2">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* --- TAB: FOUNDRY (AGENT BUILDER) --- */}
        <TabsContent value="foundry" className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 overflow-y-auto">
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
                  <Input value={activeAgent.name} className="bg-black/20 border-white/10" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase text-muted-foreground">Rol / Descripción</label>
                  <Input value={activeAgent.description} className="bg-black/20 border-white/10" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase text-muted-foreground">Prime Directive (System Prompt)</label>
                <Textarea value={activeAgent.systemPrompt} className="h-32 bg-black/20 border-white/10 font-mono text-sm" />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium uppercase text-muted-foreground">Creatividad (Temperature): {activeAgent.temperature}</label>
                </div>
                <Slider defaultValue={[activeAgent.temperature]} max={2} step={0.1} className="w-full" />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                <Button variant="destructive" size="sm" className="gap-2"><Trash2 className="w-4 h-4" /> Eliminar</Button>
                <Button size="sm" className="gap-2"><Save className="w-4 h-4" /> Guardar Cambios</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- TAB: RULES & CONTEXT --- */}
        <TabsContent value="rules" className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto">
          <Card className="border-white/10 bg-black/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5 text-emerald-400" /> Leyes del Sistema</CardTitle>
              <CardDescription>Reglas inmutables que todos los agentes deben obedecer.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {rules.map(rule => (
                <div key={rule.id} className="flex items-start gap-4 p-4 rounded-lg bg-white/5 border border-white/5">
                  <Switch checked={rule.isActive} />
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
                <Switch />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- TAB: WORKFLOWS --- */}
        <TabsContent value="workflows" className="flex-1 overflow-y-auto">
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
                    <Switch checked={wf.isActive} />
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
      </Tabs>
    </div>
  );
}
