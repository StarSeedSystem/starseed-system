/**
 * 🌌 StarSeed OS — AI Detection Wizard
 *
 * Asistente interactivo que escanea el sistema del usuario en busca de:
 * - IAs locales (Ollama, llama.cpp, LM Studio)
 * - APIs cloud configuradas
 * - API keys en variables de entorno
 * - Skills de Hermes Agent
 * - Agentes y configuraciones existentes
 *
 * Luego pregunta al usuario qué desea integrar y lo almacena
 * en la memoria unificada, conectándolo al grafo vivo.
 */

'use client';

import React, { useState, useCallback } from 'react';
import { AutoDiscover } from '@/hermes-integration/04-auto-discover';
import { UnifiedMemoryStore } from '@/hermes-integration/03-unified-store';
import type { DiscoveryResult, DiscoveredProvider, DiscoveredKey, SkillDocument } from '@/hermes-integration/01-types';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Cpu, Cloud, Key, Bot, BookOpen, Database,
  CheckCircle2, AlertCircle, ChevronRight, Sparkles,
  Settings, Globe, Server, Search, Shield,
  X, Info, Clock, Link2,
} from 'lucide-react';

// ========================================================================
// Step types
// ========================================================================

type WizardStep = 'intro' | 'scanning' | 'results' | 'importing' | 'done' | 'error';

// ========================================================================
// Animation keyframes (import via tailwind config or inline style)
// ========================================================================

const pulseStyle = {
  animation: 'pulse-soft 2s ease-in-out infinite',
};

// ========================================================================
// AI Detection Wizard Component
// ========================================================================

export function AiDetectionWizard() {
  // State
  const [step, setStep] = useState<WizardStep>('intro');
  const [scanProgress, setScanProgress] = useState(0);
  const [scanMessage, setScanMessage] = useState('');
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [importProgress, setImportProgress] = useState(0);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // ====================================================================
  // Step 1: Start scan
  // ====================================================================

  const startScan = useCallback(async () => {
    setStep('scanning');
    setScanProgress(0);

    const discover = new AutoDiscover();

    // Simulate progress while scanning (real scanning is fast, but we show progress)
    const progressMsgs = [
      'Escaneando puertos locales...',
      'Buscando IAs en localhost...',
      'Revisando variables de entorno...',
      'Buscando configuraciones de Hermes...',
      'Detectando skills instalados...',
      'Analizando ubicaciones del sistema...',
      'Preparando resultados...',
    ];

    let msgIdx = 0;
    const progressInterval = setInterval(() => {
      setScanProgress(p => {
        const next = Math.min(p + (Math.random() * 10 + 5), 85);
        if (next > 10 && msgIdx < progressMsgs.length - 1) {
          msgIdx = Math.floor(next / 15);
          setScanMessage(progressMsgs[Math.min(msgIdx, progressMsgs.length - 1)]);
        }
        return next;
      });
    }, 400);

    try {
      const results = await discover.scanAll();
      clearInterval(progressInterval);
      setScanProgress(100);
      setScanMessage('Escaneo completo');

      setDiscovery(results);

      // Auto-select all items by default
      const allIds = new Set<string>();
      results.providers.forEach((p) => allIds.add(`provider-${p.id}-${p.source}`));
      results.apiKeys.forEach((k) => allIds.add(`key-${k.provider}-${k.source}`));
      results.skills.forEach((s) => allIds.add(`skill-${s.metadata.name}`));
      results.agents.forEach((a) => allIds.add(`agent-${a.id}`));
      setSelectedItems(allIds);

      // Auto-expand first category with results
      if (results.providers.length > 0) setExpandedCategory('providers');
      else if (results.apiKeys.length > 0) setExpandedCategory('keys');
      else if (results.skills.length > 0) setExpandedCategory('skills');
      else if (results.agents.length > 0) setExpandedCategory('agents');

      setTimeout(() => setStep('results'), 600);
    } catch (err) {
      clearInterval(progressInterval);
      setScanProgress(0);
      setScanMessage(`Error: ${(err as Error).message}`);
      setStep('error');
    }
  }, []);

  // ====================================================================
  // Step 3: Import selected items
  // ====================================================================

  const importSelected = useCallback(async () => {
    if (!discovery) return;
    setStep('importing');
    setImportProgress(0);

    const store = UnifiedMemoryStore.getInstance();
    await store.init();

    let imported = 0;
    const total = selectedItems.size;

    // Helper to update progress
    const tick = () => {
      imported++;
      setImportProgress(Math.round((imported / total) * 100));
    };

    try {
      // ====================================================================
      // Import providers
      // ====================================================================
      for (const provider of discovery.providers) {
        const itemId = `provider-${provider.id}-${provider.source}`;
        if (!selectedItems.has(itemId)) continue;

        const nodeId = `provider-${provider.id}-${Date.now()}`;
        await store.addNode({
          id: nodeId,
          type: 'provider',
          label: provider.label,
          description: `Proveedor de IA detectado en ${provider.source}. ${provider.local ? 'Ejecución local.' : ''} ${provider.models.length} modelos disponibles.`,
          data: { ...provider, integratedAt: new Date().toISOString() },
          tags: ['ai', 'provider', provider.local ? 'local' : 'cloud', 'discovered'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          accessCount: 0,
          lastAccessedAt: new Date().toISOString(),
          layer: 'ai',
        });

        // Create edges for each model
        for (const model of provider.models) {
          const modelId = `model-${provider.id}-${model.replace(/[^a-zA-Z0-9]/g, '-')}`;
          await store.addNode({
            id: modelId,
            type: 'model',
            label: model,
            description: `Modelo disponible en ${provider.label}`,
            data: { provider: provider.id, model, source: provider.source },
            tags: ['ai', 'model', provider.local ? 'local' : 'cloud'],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            accessCount: 0,
            lastAccessedAt: new Date().toISOString(),
            layer: 'ai',
          });

          await store.addEdge({
            id: `edge-${nodeId}-${modelId}`,
            sourceId: nodeId,
            targetId: modelId,
            type: 'configured_for',
            weight: 0.8,
            frequency: 852,
            data: { relationship: 'hosts_model' },
            createdAt: new Date().toISOString(),
          });
        }

        // Create discovery edge
        const discoveryId = `disc-provider-${provider.id}`;
        await store.addEdge({
          id: `edge-disc-${nodeId}`,
          sourceId: discoveryId,
          targetId: nodeId,
          type: 'discovered_at',
          weight: 1.0,
          frequency: 528,
          data: { source: provider.source },
          createdAt: new Date().toISOString(),
        });

        tick();
      }

      // ====================================================================
      // Import API keys
      // ====================================================================
      for (const key of discovery.apiKeys) {
        const itemId = `key-${key.provider}-${key.source}`;
        if (!selectedItems.has(itemId)) continue;

        const nodeId = `apikey-${key.provider}-${Date.now()}`;
        await store.addNode({
          id: nodeId,
          type: 'api_key',
          label: key.label,
          description: `API key encontrada en ${key.source}`,
          data: { ...key, integratedAt: new Date().toISOString() },
          tags: ['ai', 'api-key', 'discovered'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          accessCount: 0,
          lastAccessedAt: new Date().toISOString(),
          layer: 'ai',
        });

        tick();
      }

      // ====================================================================
      // Import skills
      // ====================================================================
      for (const skill of discovery.skills) {
        const itemId = `skill-${skill.metadata.name}`;
        if (!selectedItems.has(itemId)) continue;

        const nodeId = `skill-${skill.metadata.name}-${Date.now()}`;
        await store.addNode({
          id: nodeId,
          type: 'skill',
          label: skill.metadata.name,
          description: skill.metadata.description || `Skill v${skill.metadata.version}`,
          data: {
            ...skill.metadata,
            content: skill.content.slice(0, 500),
            integratedAt: new Date().toISOString(),
          },
          tags: ['skill', ...(skill.metadata.tags || [])],
          createdAt: skill.metadata.created || new Date().toISOString(),
          updatedAt: skill.metadata.updated || new Date().toISOString(),
          accessCount: 0,
          lastAccessedAt: new Date().toISOString(),
          layer: 'skills',
        });

        tick();
      }

      // ====================================================================
      // Import agents
      // ====================================================================
      for (const agent of discovery.agents) {
        const itemId = `agent-${agent.id}`;
        if (!selectedItems.has(itemId)) continue;

        const nodeId = `agent-${agent.id}-${Date.now()}`;
        await store.addNode({
          id: nodeId,
          type: 'agent',
          label: agent.name,
          description: `Agente detectado en ${agent.source}`,
          data: { ...agent.config, integratedAt: new Date().toISOString() },
          tags: ['agent', 'discovered'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          accessCount: 0,
          lastAccessedAt: new Date().toISOString(),
          layer: 'agents',
        });

        tick();
      }

      // Create a special "discovery session" node to group everything
      const sessionId = `discovery-scan-${Date.now()}`;
      await store.addNode({
        id: sessionId,
        type: 'discovery',
        label: `Escaneo ${new Date().toLocaleDateString()}`,
        description: `Descubrimiento automático: ${selectedItems.size} elementos integrados`,
        data: {
          timestamp: new Date().toISOString(),
          totalProviders: discovery.providers.length,
          totalKeys: discovery.apiKeys.length,
          totalSkills: discovery.skills.length,
          totalAgents: discovery.agents.length,
          selectedCount: selectedItems.size,
        },
        tags: ['discovery', 'scan', 'auto-integrated'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        accessCount: 1,
        lastAccessedAt: new Date().toISOString(),
        layer: 'discoveries',
      });

      toast.success(`${imported} elementos integrados exitosamente al grafo vivo`);
      setTimeout(() => setStep('done'), 500);

    } catch (err) {
      toast.error(`Error durante la integración: ${(err as Error).message}`);
      setStep('results');
    }
  }, [discovery, selectedItems]);

  // ====================================================================
  // Item selection toggle
  // ====================================================================

  const toggleItem = useCallback((itemId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (!discovery) return;
    const allIds = new Set<string>();
    discovery.providers.forEach((p) => allIds.add(`provider-${p.id}-${p.source}`));
    discovery.apiKeys.forEach((k) => allIds.add(`key-${k.provider}-${k.source}`));
    discovery.skills.forEach((s) => allIds.add(`skill-${s.metadata.name}`));
    discovery.agents.forEach((a) => allIds.add(`agent-${a.id}`));
    setSelectedItems(allIds);
  }, [discovery]);

  const deselectAll = useCallback(() => {
    setSelectedItems(new Set());
  }, []);

  // ====================================================================
  // RENDER: INTRO
  // ====================================================================

  if (step === 'intro') {
    return (
      <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-700">
        {/* Hero */}
        <Card className="bg-gradient-to-br from-primary/10 via-background/40 to-purple-500/10 
          border-primary/20 overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(0,127,255,0.1),transparent_60%)]" />
          <CardHeader className="text-center relative z-10">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-cyan-500/30 to-purple-500/30 
              border border-white/20 flex items-center justify-center mb-4 shadow-2xl">
              <Sparkles className="w-10 h-10 text-primary" />
            </div>
            <CardTitle className="text-3xl font-bold bg-clip-text text-transparent 
              bg-gradient-to-r from-primary to-purple-400">
              Descubrimiento del Ecosistema IA
            </CardTitle>
            <CardDescription className="text-base max-w-xl mx-auto leading-relaxed">
              Escanea tu sistema para detectar automáticamente IAs locales, APIs, 
              agentes, skills y configuraciones. Cada descubrimiento se convierte 
              en un nodo en tu grafo vivo de memoria.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Categories grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              icon: Cpu,
              label: 'IAs Locales',
              desc: 'Ollama, llama.cpp, LM Studio, vLLM corriendo en tu máquina',
              gradient: 'from-emerald-500/20 to-teal-500/10',
              border: 'border-emerald-500/20',
            },
            {
              icon: Globe,
              label: 'APIs Cloud',
              desc: 'OpenAI, Anthropic, DeepSeek, Groq, OpenRouter y más',
              gradient: 'from-blue-500/20 to-cyan-500/10',
              border: 'border-blue-500/20',
            },
            {
              icon: Key,
              label: 'API Keys',
              desc: 'En .env, config.yaml, keychains del sistema',
              gradient: 'from-amber-500/20 to-orange-500/10',
              border: 'border-amber-500/20',
            },
            {
              icon: Bot,
              label: 'Agentes Externos',
              desc: 'Hermes Agent, Claude Code, Codex CLI',
              gradient: 'from-purple-500/20 to-pink-500/10',
              border: 'border-purple-500/20',
            },
            {
              icon: BookOpen,
              label: 'Skills Hermes',
              desc: 'Skills instalados en ~/.hermes/skills/',
              gradient: 'from-violet-500/20 to-indigo-500/10',
              border: 'border-violet-500/20',
            },
            {
              icon: Server,
              label: 'Configuraciones',
              desc: 'Proveedores configurados en ~/.hermes/config.yaml',
              gradient: 'from-rose-500/20 to-red-500/10',
              border: 'border-rose-500/20',
            },
          ].map(({ icon: Icon, label, desc, gradient, border }) => (
            <Card key={label} className={`bg-gradient-to-br ${gradient} ${border} backdrop-blur-sm`}>
              <CardContent className="p-5 space-y-3">
                <div className="w-10 h-10 rounded-xl bg-black/30 border border-white/10 
                  flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">{label}</h4>
                  <p className="text-xs text-muted-foreground mt-1">{desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Privacy notice */}
        <Card className="bg-black/40 border-white/5">
          <CardContent className="p-5 flex items-start gap-4">
            <Shield className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-emerald-400">Privacidad absoluta</p>
              <p className="text-xs text-muted-foreground mt-1">
                Todo el escaneo ocurre localmente en tu navegador. Las API keys detectadas
                <strong> no se envían a ningún servidor</strong>. Se almacenan cifradas en
                tu IndexedDB local.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Start button */}
        <div className="flex justify-center">
          <Button onClick={startScan} size="lg" className="gap-3 px-8 py-6 text-lg shadow-2xl">
            <Search className="w-6 h-6" />
            Iniciar Escaneo del Sistema
          </Button>
        </div>
      </div>
    );
  }

  // ====================================================================
  // RENDER: SCANNING
  // ====================================================================

  if (step === 'scanning') {
    return (
      <Card className="max-w-lg mx-auto p-10 text-center space-y-6 animate-in fade-in duration-500">
        <div className="relative">
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-cyan-500/30 to-purple-500/30 
            border border-white/20 flex items-center justify-center animate-pulse">
            <Cpu className="w-10 h-10 text-primary" />
          </div>
        </div>
        <div>
          <h3 className="text-xl font-bold">Escaneando...</h3>
          <p className="text-sm text-muted-foreground mt-2">{scanMessage}</p>
        </div>
        <div className="space-y-2">
          <Progress value={scanProgress} className="w-full h-2" />
          <p className="text-xs text-muted-foreground">{Math.round(scanProgress)}%</p>
        </div>
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> Localhost</span>
          <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> .env</span>
          <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> Skills</span>
        </div>
      </Card>
    );
  }

  // ====================================================================
  // RENDER: RESULTS
  // ====================================================================

  if (step === 'results' && discovery) {
    const totalCount = discovery.providers.length + discovery.apiKeys.length + discovery.skills.length + discovery.agents.length;

    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-700">
        {/* Header */}
        <Card className="bg-gradient-to-br from-emerald-500/10 to-primary/10 border-emerald-500/20">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                Escaneo Completo
              </CardTitle>
              <CardDescription>
                Se encontraron <strong>{totalCount}</strong> elementos en tu sistema
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {selectedItems.size} seleccionados
              </Badge>
              <Button variant="ghost" size="sm" onClick={selectAll}>Todo</Button>
              <Button variant="ghost" size="sm" onClick={deselectAll}>Ninguno</Button>
            </div>
          </CardHeader>
        </Card>

        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-4">
            {/* === PROVIDERS === */}
            {discovery.providers.length > 0 && (
              <Card className="border-white/5">
                <CardHeader
                  className="cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => setExpandedCategory(expandedCategory === 'providers' ? null : 'providers')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Cloud className="w-5 h-5 text-blue-400" />
                      <CardTitle className="text-base">Proveedores de IA</CardTitle>
                      <Badge variant="secondary" className="text-[10px]">{discovery.providers.length}</Badge>
                    </div>
                    <ChevronRight className={`w-4 h-4 transition-transform ${expandedCategory === 'providers' ? 'rotate-90' : ''}`} />
                  </div>
                </CardHeader>
                {expandedCategory === 'providers' && (
                  <CardContent className="space-y-2">
                    {discovery.providers.map((p) => (
                      <ProviderItem
                        key={`provider-${p.id}-${p.source}`}
                        provider={p}
                        selected={selectedItems.has(`provider-${p.id}-${p.source}`)}
                        onToggle={() => toggleItem(`provider-${p.id}-${p.source}`)}
                      />
                    ))}
                  </CardContent>
                )}
              </Card>
            )}

            {/* === API KEYS === */}
            {discovery.apiKeys.length > 0 && (
              <Card className="border-white/5">
                <CardHeader
                  className="cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => setExpandedCategory(expandedCategory === 'keys' ? null : 'keys')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Key className="w-5 h-5 text-amber-400" />
                      <CardTitle className="text-base">API Keys Detectadas</CardTitle>
                      <Badge variant="secondary" className="text-[10px]">{discovery.apiKeys.length}</Badge>
                    </div>
                    <ChevronRight className={`w-4 h-4 transition-transform ${expandedCategory === 'keys' ? 'rotate-90' : ''}`} />
                  </div>
                </CardHeader>
                {expandedCategory === 'keys' && (
                  <CardContent className="space-y-2">
                    {discovery.apiKeys.map((k) => (
                      <KeyItem
                        key={`key-${k.provider}-${k.source}`}
                        keyData={k}
                        selected={selectedItems.has(`key-${k.provider}-${k.source}`)}
                        onToggle={() => toggleItem(`key-${k.provider}-${k.source}`)}
                      />
                    ))}
                  </CardContent>
                )}
              </Card>
            )}

            {/* === SKILLS === */}
            {discovery.skills.length > 0 && (
              <Card className="border-white/5">
                <CardHeader
                  className="cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => setExpandedCategory(expandedCategory === 'skills' ? null : 'skills')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <BookOpen className="w-5 h-5 text-purple-400" />
                      <CardTitle className="text-base">Skills Detectados</CardTitle>
                      <Badge variant="secondary" className="text-[10px]">{discovery.skills.length}</Badge>
                    </div>
                    <ChevronRight className={`w-4 h-4 transition-transform ${expandedCategory === 'skills' ? 'rotate-90' : ''}`} />
                  </div>
                </CardHeader>
                {expandedCategory === 'skills' && (
                  <CardContent className="space-y-2">
                    {discovery.skills.map((s) => (
                      <SkillItem
                        key={`skill-${s.metadata.name}`}
                        skill={s}
                        selected={selectedItems.has(`skill-${s.metadata.name}`)}
                        onToggle={() => toggleItem(`skill-${s.metadata.name}`)}
                      />
                    ))}
                  </CardContent>
                )}
              </Card>
            )}

            {/* === AGENTS === */}
            {discovery.agents.length > 0 && (
              <Card className="border-white/5">
                <CardHeader
                  className="cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => setExpandedCategory(expandedCategory === 'agents' ? null : 'agents')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Bot className="w-5 h-5 text-amber-400" />
                      <CardTitle className="text-base">Agentes Externos</CardTitle>
                      <Badge variant="secondary" className="text-[10px]">{discovery.agents.length}</Badge>
                    </div>
                    <ChevronRight className={`w-4 h-4 transition-transform ${expandedCategory === 'agents' ? 'rotate-90' : ''}`} />
                  </div>
                </CardHeader>
                {expandedCategory === 'agents' && (
                  <CardContent className="space-y-2">
                    {discovery.agents.map((a) => (
                      <AgentItem
                        key={`agent-${a.id}`}
                        agent={a}
                        selected={selectedItems.has(`agent-${a.id}`)}
                        onToggle={() => toggleItem(`agent-${a.id}`)}
                      />
                    ))}
                  </CardContent>
                )}
              </Card>
            )}
          </div>
        </ScrollArea>

        {/* Bottom actions */}
        <div className="flex justify-between items-center gap-4">
          <p className="text-xs text-muted-foreground">
            <Info className="w-3 h-3 inline mr-1" />
            Los datos se almacenan localmente en tu navegador
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('intro')}>
              Volver
            </Button>
            <Button onClick={importSelected} size="lg" className="gap-2 shadow-xl" 
              disabled={selectedItems.size === 0}>
              <Database className="w-5 h-5" />
              Integrar {selectedItems.size} elementos al Grafo Vivo
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ====================================================================
  // RENDER: IMPORTING
  // ====================================================================

  if (step === 'importing') {
    return (
      <Card className="max-w-lg mx-auto p-10 text-center space-y-6 animate-in fade-in duration-500">
        <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-emerald-500/30 to-cyan-500/30 
          border border-emerald-500/30 flex items-center justify-center animate-bounce">
          <Database className="w-10 h-10 text-emerald-400" />
        </div>
        <h3 className="text-xl font-bold">Integrando al Ecosistema...</h3>
        <div className="space-y-2">
          <Progress value={importProgress} className="w-full h-2" />
          <p className="text-xs text-muted-foreground">
            Conectando nodos, creando relaciones armónicas y preparando el grafo vivo...
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Link2 className="w-3 h-3 animate-pulse" />
          Construyendo conexiones armónicas
        </div>
      </Card>
    );
  }

  // ====================================================================
  // RENDER: DONE
  // ====================================================================

  if (step === 'done') {
    return (
      <div className="max-w-lg mx-auto space-y-6 animate-in fade-in duration-700">
        <Card className="bg-gradient-to-br from-emerald-500/20 via-background/40 to-emerald-500/5 
          border-emerald-500/30 text-center p-10">
          <CardHeader>
            <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 
              flex items-center justify-center mb-4 shadow-2xl">
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            </div>
            <CardTitle className="text-2xl font-bold">Ecosistema Integrado</CardTitle>
            <CardDescription className="text-base mt-2 leading-relaxed">
              {selectedItems.size} elementos ahora son parte de tu grafo vivo.
              Puedes explorarlos en la <strong>Red StarSeed</strong>, filtrar por capas,
              y descubrir las conexiones armónicas entre cada componente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Proveedores', count: discovery!.providers.filter(p => selectedItems.has(`provider-${p.id}-${p.source}`)).length, color: 'text-blue-400' },
                { label: 'API Keys', count: discovery!.apiKeys.filter(k => selectedItems.has(`key-${k.provider}-${k.source}`)).length, color: 'text-amber-400' },
                { label: 'Skills', count: discovery!.skills.filter(s => selectedItems.has(`skill-${s.metadata.name}`)).length, color: 'text-purple-400' },
                { label: 'Agentes', count: discovery!.agents.filter(a => selectedItems.has(`agent-${a.id}`)).length, color: 'text-amber-400' },
              ].map(stat => (
                <Card key={stat.label} className="bg-white/5 border-white/10">
                  <CardContent className="p-4 text-center">
                    <div className={`text-2xl font-bold font-mono ${stat.color}`}>{stat.count}</div>
                    <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex justify-center gap-4 pt-4">
              <Button variant="outline" onClick={() => setStep('intro')}>
                Nuevo Escaneo
              </Button>
              <Button onClick={() => window.location.href = '/network'}>
                Ir al Grafo Vivo <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ====================================================================
  // RENDER: ERROR
  // ====================================================================

  if (step === 'error') {
    return (
      <Card className="max-w-lg mx-auto p-10 text-center space-y-6">
        <div className="w-20 h-20 mx-auto rounded-full bg-destructive/20 border border-destructive/30 
          flex items-center justify-center">
          <AlertCircle className="w-10 h-10 text-destructive" />
        </div>
        <h3 className="text-xl font-bold">Error durante el escaneo</h3>
        <p className="text-sm text-muted-foreground">{scanMessage}</p>
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={() => setStep('intro')}>
            Volver
          </Button>
          <Button onClick={startScan} className="gap-2">
            <Search className="w-4 h-4" /> Reintentar
          </Button>
        </div>
      </Card>
    );
  }

  return null;
}

// ========================================================================
// Sub-components for each item type
// ========================================================================

function ProviderItem({
  provider, selected, onToggle,
}: {
  provider: DiscoveredProvider;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer ${
        selected
          ? 'bg-primary/10 border-primary/30'
          : 'bg-white/5 border-white/5 hover:bg-white/10'
      }`}
      onClick={onToggle}
    >
      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
        selected ? 'bg-primary border-primary' : 'border-white/20'
      }`}>
        {selected && <CheckCircle2 className="w-4 h-4 text-white" />}
      </div>

      <div className={`p-2 rounded-lg ${
        provider.local ? 'bg-emerald-500/20' : 'bg-blue-500/20'
      }`}>
        {provider.local
          ? <Cpu className="w-5 h-5 text-emerald-400" />
          : <Cloud className="w-5 h-5 text-blue-400" />
        }
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">{provider.label}</p>
        <p className="text-xs text-muted-foreground truncate">
          {provider.models.length} modelos · {provider.source}
        </p>
      </div>

      <div className="flex gap-1">
        {provider.models.slice(0, 3).map(m => (
          <Badge key={m} variant="outline" className="text-[9px] max-w-[80px] truncate">
            {m.split('/').pop()?.split(':')[0]}
          </Badge>
        ))}
        {provider.models.length > 3 && (
          <Badge variant="secondary" className="text-[9px]">+{provider.models.length - 3}</Badge>
        )}
      </div>

      <Badge className={`text-[10px] ${
        provider.local ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'
      }`}>
        {provider.local ? 'LOCAL' : 'CLOUD'}
      </Badge>
    </div>
  );
}

function KeyItem({
  keyData, selected, onToggle,
}: {
  keyData: DiscoveredKey;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer ${
        selected
          ? 'bg-amber-500/10 border-amber-500/30'
          : 'bg-white/5 border-white/5 hover:bg-white/10'
      }`}
      onClick={onToggle}
    >
      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
        selected ? 'bg-amber-500 border-amber-500' : 'border-white/20'
      }`}>
        {selected && <CheckCircle2 className="w-4 h-4 text-white" />}
      </div>

      <div className="p-2 rounded-lg bg-amber-500/20">
        <Key className="w-5 h-5 text-amber-400" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{keyData.label}</p>
        <p className="text-xs text-muted-foreground font-mono truncate">{keyData.keyPreview}</p>
      </div>

      <Badge variant="outline" className="text-[10px]">{keyData.source}</Badge>
    </div>
  );
}

function SkillItem({
  skill, selected, onToggle,
}: {
  skill: SkillDocument;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer ${
        selected
          ? 'bg-purple-500/10 border-purple-500/30'
          : 'bg-white/5 border-white/5 hover:bg-white/10'
      }`}
      onClick={onToggle}
    >
      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
        selected ? 'bg-purple-500 border-purple-500' : 'border-white/20'
      }`}>
        {selected && <CheckCircle2 className="w-4 h-4 text-white" />}
      </div>

      <div className="p-2 rounded-lg bg-purple-500/20">
        <BookOpen className="w-5 h-5 text-purple-400" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">{skill.metadata.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {skill.metadata.description || `v${skill.metadata.version || '1.0'}`}
        </p>
      </div>

      <div className="flex gap-1">
        {(skill.metadata.tags || []).slice(0, 3).map(t => (
          <Badge key={t} variant="outline" className="text-[9px]">{t}</Badge>
        ))}
      </div>

      <Badge variant="secondary" className="text-[10px] font-mono">
        v{skill.metadata.version || '?'}
      </Badge>
    </div>
  );
}

function AgentItem({
  agent, selected, onToggle,
}: {
  agent: { id: string; name: string; source: string; config: Record<string, unknown> };
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer ${
        selected
          ? 'bg-amber-500/10 border-amber-500/30'
          : 'bg-white/5 border-white/5 hover:bg-white/10'
      }`}
      onClick={onToggle}
    >
      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
        selected ? 'bg-amber-500 border-amber-500' : 'border-white/20'
      }`}>
        {selected && <CheckCircle2 className="w-4 h-4 text-white" />}
      </div>

      <div className="p-2 rounded-lg bg-amber-500/20">
        <Bot className="w-5 h-5 text-amber-400" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{agent.name}</p>
        <p className="text-xs text-muted-foreground">Detectado en {agent.source}</p>
      </div>

      <Badge variant="outline" className="text-[10px]">{agent.source}</Badge>
    </div>
  );
}