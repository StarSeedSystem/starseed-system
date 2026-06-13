'use client';

// Evita el bailout de prerender estatico por useSearchParams (build de Vercel).
export const dynamic = "force-dynamic";

import { AiDetectionWizard } from '@/hermes-integration/06-ai-detection-wizard';
import { hermes } from '@/hermes-integration';
import { useEffect, useState } from 'react';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, Database, Zap, Wrench, Bot, Eye, Server, Search, ShieldCheck } from 'lucide-react';
import { SensesPanel } from '@/components/hermes/senses-panel';
import { McpPanel } from '@/components/hermes/mcp-panel';
import { AiPermissionsPanel } from '@/components/ai/ai-permissions-panel';

function AiSetupPageInner() {
  const params = useSearchParams();
  const tabParam = params?.get('tab');
  const initialTab =
    tabParam === 'senses' ? 'senses' :
    tabParam === 'mcp' ? 'mcp' :
    tabParam === 'permissions' ? 'permissions' :
    'discover';

  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [status, setStatus] = useState<{
    memory: { nodes: number; edges: number };
    skills: number;
    tools: number;
    initialized: boolean;
  } | null>(null);

  useEffect(() => {
    hermes.init().then(() => {
      hermes.getStatus().then(setStatus);
    });
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-400 flex items-center gap-3">
          <Sparkles className="w-8 h-8 text-primary" />
          Ecosistema IA
        </h1>
        {status?.initialized && (
          <Badge variant="outline" className="border-emerald-500/50 text-emerald-400 bg-emerald-500/10 gap-1">
            <Database className="w-3 h-3" />
            Sistema listo
          </Badge>
        )}
      </div>

      {/* Status cards */}
      {status && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: Database, label: 'Nodos en memoria', value: status.memory.nodes, color: 'text-cyan-400' },
            { icon: Zap, label: 'Aristas', value: status.memory.edges, color: 'text-purple-400' },
            { icon: Wrench, label: 'Skills instalados', value: status.skills, color: 'text-emerald-400' },
            { icon: Bot, label: 'Tools registradas', value: status.tools, color: 'text-amber-400' },
          ].map((stat) => (
            <Card key={stat.label} className="bg-black/20 border-white/5">
              <CardContent className="p-4 flex items-center gap-3">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
                <div>
                  <div className={`text-lg font-bold font-mono ${stat.color}`}>{stat.value}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full justify-start bg-black/20 border border-white/5 p-1 flex-wrap">
          <TabsTrigger value="discover" className="gap-2">
            <Search className="w-4 h-4" /> Descubrimientos
          </TabsTrigger>
          <TabsTrigger value="senses" className="gap-2">
            <Eye className="w-4 h-4" /> Sentidos
          </TabsTrigger>
          <TabsTrigger value="mcp" className="gap-2">
            <Server className="w-4 h-4" /> MCPs
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-2">
            <ShieldCheck className="w-4 h-4" /> Permisos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="discover" className="space-y-4">
          <AiDetectionWizard />
        </TabsContent>

        <TabsContent value="senses" className="space-y-4">
          <SensesPanel />
        </TabsContent>

        <TabsContent value="mcp" className="space-y-4">
          <McpPanel />
        </TabsContent>

        <TabsContent value="permissions" className="space-y-4 @container">
          <div>
            <h2 className="text-lg font-black tracking-tight">Permisos y accesos de la IA</h2>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Controla qué pueden leer y modificar el Asistente y el Nexo. Por defecto tienen acceso completo a tu propio entorno; los fundamentos del sistema y los datos de la red están protegidos por la Constitución StarSeed.
            </p>
          </div>
          <AiPermissionsPanel defaultActor="assistant" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AiSetupPage() {
  return (
    <Suspense fallback={null}>
      <AiSetupPageInner />
    </Suspense>
  );
}
