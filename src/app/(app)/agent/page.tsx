"use client";

// Evita el bailout de prerender estatico por useSearchParams (build de Vercel).
export const dynamic = "force-dynamic";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Suspense } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
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
  Blocks,
  Languages,
  Cloud,
  Zap,
  Wrench,
  BookOpen,
  BookMarked,
  CheckCircle2,
  Database,
  Vote,
  Activity,
  Network,
  ChevronRight,
  ArrowUpRight,
  Waypoints,
  GraduationCap,
  SlidersHorizontal,
  Radio,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import OKFPanel from "@/components/exocortex/okf-panel";
// Centro de Configuración de Aurora y Astraura (Adenda 67 · P1).
import { openAuroraSetup } from "@/lib/aurora/setup-config";
import ProviderPanel from "@/components/exocortex/provider-panel";
import AuroraStudio from "@/components/aurora/aurora-studio";
// Adenda 97: pestaña GLOBAL «Personalidades» (hub) + panel de la Red Mesh.
import PersonalitiesHub from "@/components/aurora/personalities-hub";
import MeshControlPanel from "@/components/mesh/mesh-control-panel";
import { MessageRenderer } from "@/components/aurora/message-renderer";
import { MessageActionBar } from "@/components/aurora/message-action-bar";
import { MessageProcessModal } from "@/components/aurora/message-process-modal";
import { useAurora } from "@/components/aurora/aurora-provider";
import { ChatHeaderOptions } from "@/components/aurora/chat-header-options";
import StoragePanel from "@/components/storage/storage-panel";
import ConnectionsHub from "@/components/storage/connections-hub";
import BrainsPanel from "@/components/brains/brains-panel";
import ServersPanel from "@/components/brains/servers-panel";
import SecurityPanel from "@/components/security/security-panel";
import PublicationComposer from "@/components/publish/publication-composer";
import WorkCenters from "@/components/canvas/work-centers";
import AbilitiesHub from "@/components/abilities/abilities-hub";
import GovernancePanel from "@/components/governance/governance-panel";
import GovNotifications from "@/components/governance/notifications-panel";
import MyActivity from "@/components/decisions/my-activity";
import { ChatConnectionsPanel } from "@/components/messaging/chat-connections-panel";
import { OssLibraryBrowser } from "@/components/settings/ai/oss-library-browser";
import { LibrarySourcesPanel } from "@/components/library/library-sources-panel";
// Adenda 132: configuración unificada de Astraura & OmniVoice.
// - `AstrauraOmniVoiceConfig` embebe la config en la pestaña «Configuración IA».
// - `openAstrauraConfig` abre el mismo panel como drawer global desde cualquier
//   pestaña (cabecera, Nexus, Modelos). Ambos los provee otro agente por contrato.
import { AstrauraOmniVoiceConfig } from "@/components/astraura/astraura-omnivoice-config";
import { openAstrauraConfig } from "@/lib/astraura/config-ui";

// Conversación unificada Aurora ↔ Astraura AI (Adenda 69 · I-1).
import {
  useAiConversations,
  useAiMessages,
  appendMessage as appendUnifiedMessage,
  ensureActiveConversation,
  titleFromText,
  setActiveChatLogEnabled,
} from "@/lib/aurora/conversations";

import { chat, chatSmart } from "@/ai/client/chat";
import { astrauraChat } from "@/ai/astraura/router";
// Pipeline compartido de Aurora (Adenda 71-ter · I1): acciones+conocimiento en el
// prompt, voz por personalidad/ajustes, y dictado por voz reutilizable.
import { composeAuroraSystem, speakAuroraReply, resolveTurnPersona } from "@/lib/aurora/turn";
// Adjuntos + voz de chat compartidos (Agente S1): 📎, chips, mic/altavoz.
import { buildAttachmentsContext, summarizeAttachments, type UniversalAttachment } from "@/lib/aurora/attachments";
import { ChatAttachButton, PendingAttachmentChips, MessageAttachmentChips } from "@/components/aurora/chat-attach-button";
import { ChatVoiceButtons } from "@/components/aurora/chat-voice-buttons";
import { ConfigChangeNotice, isConfigChangeMessage } from "@/components/aurora/config-change-notice";
import type { AuroraMessageMeta } from "@/lib/aurora/engine";
import { parseDirectives } from "@/lib/aurora/actions";
import { loadConfigs, getActiveProviderId, setActiveProviderId } from "@/ai/client/providerStore";
import { PROVIDERS, type ProviderId } from "@/ai/providers";
import type { ProviderConfig, ChatMessage } from "@/ai/providers/types";
import { skillsRegistry } from "@/hermes-integration/07-skills-registry";
import { toolsRegistry } from "@/hermes-integration/08-tools-registry";
import { hermes } from "@/hermes-integration";
import nextDynamic from "next/dynamic";
import { SensesPanel } from "@/components/hermes/senses-panel";
import { McpPanel } from "@/components/hermes/mcp-panel";
import { QuickOptionsGrid } from "@/components/hermes/quick-options-grid";

const MemoryBrain3D = nextDynamic(() => import("@/components/exocortex/memory-brain-3d").then(m => m.MemoryBrain3D), { ssr: false });
const CanvasBoard = nextDynamic(() => import("@/components/canvas/canvas-board"), { ssr: false });
const BrowserWindows = nextDynamic(() => import("@/components/browser/browser-windows"), { ssr: false });
const AiAppGenerator = nextDynamic(() => import("@/components/appgen/ai-app-generator"), { ssr: false });
// Neuronas: capacidades de hardware + modelos recomendados por neurona (Adenda 109).
const NeuronModelsPanel = nextDynamic(() => import("@/components/neurons/neuron-models-panel").then(m => m.NeuronModelsPanel), { ssr: false });
// Integraciones: fuentes OSS/gratuitas recomendadas por servicio del OS (Adenda 110).
const IntegrationSourcesPanel = nextDynamic(() => import("@/components/integrations/integration-sources-panel").then(m => m.IntegrationSourcesPanel), { ssr: false });
// Astraura 1.58-bit: panel del SISTEMA PRIMARIO soberano (Adenda 153).
const Astraura158Panel = nextDynamic(() => import("@/components/astraura/astraura-158-panel").then(m => m.Astraura158Panel), { ssr: false });
// Voz coherente: persona portátil que se mantiene al cambiar de modelo (Adenda 112).
const PersonaCoherencePanel = nextDynamic(() => import("@/components/aurora/persona-coherence-panel").then(m => m.PersonaCoherencePanel), { ssr: false });
import { TelegramSpacesPanel } from "@/components/exocortex/telegram-spaces-panel";
import { ChatNeuralSidebar } from "@/components/agent/chat-neural-sidebar";
import { NexusWorkspaces } from "@/components/agent/nexus-workspaces";
// Adenda 76 · G1: cuerpo de chat compartido + panel de uso Nexus.
import { ChatSurface } from "@/components/agent/chat-surface";
import { AstrauraUsagePanel } from "@/components/agent/usage-panel";
// «Espacios de trabajo» — página de gestión (Agente G2). Dynamic + placeholder.
const WorkspacesSection = nextDynamic(
  () => import("@/components/workspaces/workspaces-section").then((m) => m.WorkspacesSection),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl border border-white/10 bg-black/20 p-10 text-center text-sm text-white/50">
        Cargando gestión de espacios de trabajo…
      </div>
    ),
  },
);
import { MemoryHub } from "@/components/exocortex/memory-hub";
import { AgentRuntimePanel } from "@/components/agent/agent-runtime-panel";
import { VaultsPanel } from "@/components/exocortex/vaults-panel";
import { BatchJobsPanel } from "@/components/hermes/batch-jobs-panel";
import { ServerRegistryPanel } from "@/components/hermes/server-registry-panel";
import { HardDrive } from "lucide-react";
import { Eye, Server, LayoutDashboard, Brain, Layers, RadioTower, Binary } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { buildSystemContext, snapshotToSystemPrompt } from "@/hermes-integration/system-context";
import { getLivingGraphStore } from "@/hermes-integration/living-graph-store";
import { getOpenHumanEngine } from "@/hermes-integration/openhuman-bridge";
import { useCalendar, eventDateTimeMs } from "@/contexts/calendar-context";

// ─────────────────────────────────────────────────────────────────────────────
// Navegación por SECCIONES de configuración
// -----------------------------------------------------------------------------
// Antes había ~40 pestañas sueltas en una sola barra que desbordaba los bordes.
// Ahora las agrupamos en secciones lógicas (Cerebro & Memorias, Modelos &
// Proveedores, Habilidades, Sentidos & Canales, Aurora & Astraura,
// Infraestructura, Estudio, Gobernanza). El `value` de cada ítem coincide 1:1
// con su <TabsContent> — así se conserva TODA la funcionalidad y los deep-links
// `/agent?tab=<value>` siguen funcionando.
// ─────────────────────────────────────────────────────────────────────────────
type SectionItem = {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};
type StudioSection = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string; // clase de color para el estado activo del rail
  hint?: string;
  items: SectionItem[];
};

const STUDIO_SECTIONS: StudioSection[] = [
  // Adenda 76 · G1: «Chats», «Nexus» y «Espacios de trabajo» pasan a ser
  // ENTRADAS DE PRIMER NIVEL del menú (antes eran sub-pestañas dentro de
  // «Inicio»). Cada una es una sección de un solo ítem → sin sub-toggle.
  {
    id: "chats",
    label: "Chats",
    icon: Bot,
    accent: "text-primary",
    hint: "Conversa con Astraura IA — el mismo hilo que el orbe y el Exocórtex.",
    items: [{ value: "chat", label: "Chats", icon: Bot }],
  },
  {
    id: "nexus",
    label: "Nexus",
    icon: Activity,
    accent: "text-cyan-300",
    hint: "Panel gráfico de uso del sistema Astraura, por perfil.",
    items: [{ value: "overview", label: "Nexus", icon: Activity }],
  },
  {
    id: "espacios",
    label: "Espacios de trabajo",
    icon: Layers,
    accent: "text-fuchsia-300",
    hint: "Tus espacios (carpetas) de trabajo, sus accesos rápidos y su gestión completa.",
    items: [
      { value: "espacios", label: "Espacios de trabajo", icon: Layers },
      // Adenda 132: «Accesos rápidos» se traslada aquí desde «Sentidos & Canales».
      { value: "quick", label: "Accesos rápidos", icon: Plus },
    ],
  },
  {
    id: "cerebro",
    label: "Cerebro & Memorias",
    icon: Brain,
    accent: "text-fuchsia-300",
    hint: "El núcleo cognitivo, sus recuerdos, baúles y conocimiento.",
    items: [
      { value: "cerebro", label: "Cerebro", icon: Brain },
      { value: "memorias", label: "Memorias", icon: Brain },
      { value: "baules", label: "Baúles", icon: Layers },
      // Adenda 132: «Mapa 3D» se fusiona con «Cerebro» (que ya monta el MemoryBrain3D real).
      { value: "conocimiento", label: "Conocimiento", icon: BookOpen },
      { value: "okf", label: "Wiki / OKF", icon: BookOpen },
    ],
  },
  {
    id: "modelos",
    label: "Modelos & Proveedores",
    icon: Cpu,
    accent: "text-blue-300",
    hint: "Qué modelos usa tu IA, sus neuronas, agentes, reglas y directivas.",
    items: [
      { value: "proveedor", label: "Proveedor", icon: Database },
      // Adenda 132: «Neuronas», «Agentes (runtimes)» y «Batch» se trasladan aquí desde Infraestructura.
      { value: "neuronas", label: "Neuronas", icon: Cpu },
      { value: "foundry", label: "Agent Foundry", icon: Sparkles },
      { value: "rules", label: "Reglas", icon: Shield },
      { value: "workflows", label: "Workflows", icon: Workflow },
      { value: "runtimes", label: "Agentes (runtimes)", icon: Server },
      { value: "batch", label: "Batch", icon: Layers },
    ],
  },
  {
    id: "habilidades",
    label: "Habilidades",
    icon: GraduationCap,
    accent: "text-purple-300",
    hint: "Skills, herramientas, MCPs y plugins de código abierto.",
    items: [
      { value: "skills", label: "Skills", icon: BookOpen },
      { value: "tools", label: "Tools", icon: Wrench },
      { value: "mcp", label: "MCPs", icon: Server },
      { value: "fuentes", label: "Fuentes", icon: BookMarked },
      // Adenda 132: «Integraciones» se traslada aquí desde Infraestructura.
      { value: "integraciones", label: "Integraciones", icon: Blocks },
      { value: "habilidades", label: "Habilidades", icon: Zap },
      { value: "apps-ia", label: "Apps IA", icon: Code },
    ],
  },
  {
    id: "sentidos",
    label: "Sentidos & Canales",
    icon: Radio,
    accent: "text-sky-300",
    hint: "Percepción multimodal, permisos y canales de mensajería.",
    items: [
      { value: "senses", label: "Sentidos", icon: Eye },
      { value: "conexiones-chat", label: "Conexiones de chat", icon: Send },
      { value: "telegram", label: "Telegram", icon: Send },
    ],
  },
  // Adenda 97: la antigua sección de un solo ítem «Aurora & Astraura» se
  // convierte en la sección GLOBAL «Personalidades»: el hub centralizado de
  // personalidades (con métricas, memoria local y reglas mesh por neurona),
  // el Estudio de voz de siempre (deep-links `?tab=aurora` intactos) y el
  // panel de control de la Red Mesh Meshtastic/LoRa.
  {
    id: "aurora",
    label: "Personalidades",
    icon: Sparkles,
    accent: "text-emerald-300",
    hint: "Personalidades globales de Astraura: identidad, voz OmniVoice, memoria y red mesh por neurona.",
    items: [
      { value: "personalidades", label: "Personalidades", icon: Sparkles },
      { value: "aurora", label: "Estudio de voz", icon: Mic },
      { value: "coherencia", label: "Voz coherente", icon: Languages },
      { value: "mesh", label: "Red Mesh", icon: RadioTower },
    ],
  },
  {
    id: "infra",
    label: "Infraestructura",
    icon: Server,
    accent: "text-amber-300",
    hint: "Configuración IA, cerebros, servidores, almacenes, conexiones y seguridad.",
    items: [
      // Adenda 132: «Configuración IA» (config unificada de Astraura & OmniVoice), primero.
      { value: "config-ia", label: "Configuración IA", icon: Sliders },
      // Adenda 153: Astraura 1.58-bit, el sistema PRIMARIO soberano (backend propio).
      { value: "astraura-158", label: "Astraura 1.58", icon: Binary },
      { value: "cerebros", label: "Cerebros", icon: BrainCircuit },
      { value: "servidores", label: "Servidores", icon: Server },
      { value: "servers", label: "Registro de servidores", icon: HardDrive },
      { value: "almacenes", label: "Almacenes", icon: HardDrive },
      { value: "conexiones", label: "Conexiones", icon: Cloud },
      { value: "red3d", label: "Red 3D", icon: Network },
      { value: "seguridad", label: "Seguridad", icon: Shield },
    ],
  },
  {
    id: "estudio",
    label: "Estudio",
    icon: Layers,
    accent: "text-cyan-300",
    hint: "Pizarras, navegador y publicación de contenido.",
    items: [
      { value: "pizarra", label: "Pizarra", icon: Layers },
      { value: "pizarras", label: "Pizarras", icon: LayoutDashboard },
      { value: "navegador", label: "Navegador", icon: Network },
      { value: "publicar", label: "Publicar", icon: Send },
    ],
  },
  {
    id: "gobernanza",
    label: "Gobernanza",
    icon: Vote,
    accent: "text-rose-300",
    hint: "Decisiones y tu actividad en la red.",
    items: [
      { value: "decisiones", label: "Decisiones", icon: Vote },
      { value: "mi-actividad", label: "Mi actividad", icon: Activity },
    ],
  },
];

// Mapa value → sección, para auto-seleccionar la sección correcta al abrir un
// deep-link `?tab=`. Incluye alias históricos usados por otras superficies
// (funciones-index, dock, etc.) que apuntaban a valores con guiones.
const VALUE_TO_SECTION: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const s of STUDIO_SECTIONS) for (const it of s.items) m[it.value] = s.id;
  return m;
})();

// Normaliza el parámetro `?tab=` (algunos enlaces externos usan variantes).
const TAB_ALIASES: Record<string, string> = {
  mcps: "mcp",
  // Adenda 132: «Mapa 3D» se fusiona con «Cerebro» (que monta el MemoryBrain3D real).
  "mapa-3d": "cerebro",
  mapa3d: "cerebro",
  agentes: "runtimes",
  wiki: "okf",
  sentidos: "senses",
  aurora: "aurora",
  // Pestañas de Inicio (Adenda 75 · B2): «Chats» (value "chat", la vista de
  // chats — pestaña por defecto) y «Nexus» (value "overview", el Portal Nexus
  // con los espacios de trabajo + el panel de estado). Los enlaces históricos
  // `/agent?tab=chat` y `?tab=chats` siguen cayendo en Chats; `?tab=nexus`
  // abre el nuevo Portal Nexus, y `?tab=resumen` (nombre antiguo) también.
  chats: "chat",
  nexus: "overview",
  resumen: "overview",
  // Adenda 76 · G1: nueva pestaña de primer nivel «Espacios de trabajo».
  espacios: "espacios",
  workspaces: "espacios",
  // Adenda 97: hub global de Personalidades + Red Mesh (Meshtastic/LoRa).
  personalidad: "personalidades",
  personalidades: "personalidades",
  personas: "personalidades",
  malla: "mesh",
  meshtastic: "mesh",
  lora: "mesh",
  // Adenda 132: configuración unificada de IA (Astraura & OmniVoice).
  configuracion: "config-ia",
  config: "config-ia",
  "config-ia": "config-ia",
  // Adenda 149: ventana de «sistemas de Astraura en esta neurona» (LLM ·
  // Astraura · OpenVoice · Cerebro · Señales), que vive en Configuración de IA.
  sistemas: "config-ia",
  "sistemas-neurona": "config-ia",
  // Adenda 153: panel del sistema primario Astraura 1.58-bit.
  "astraura-158": "astraura-158",
  astraura158: "astraura-158",
  bitnet: "astraura-158",
  "1.58": "astraura-158",
  primario: "astraura-158",
  // Studio 1.58 (subsistemas del backend): el panel lee `?tab=` y `?sub=` y
  // abre la pestaña interna correspondiente (imaginación · enjambre · sentidos…).
  imaginacion: "astraura-158",
  imagination: "astraura-158",
  enjambre: "astraura-158",
  swarm: "astraura-158",
  sensorium: "astraura-158",
  "notificaciones-158": "astraura-158",
};
function normalizeTab(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = TAB_ALIASES[raw] ?? raw;
  return VALUE_TO_SECTION[v] ? v : null;
}

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

/** Mensaje renderizable del hilo de Astraura (incluye divisores de config). */
interface AgentRenderMsg {
  id: string;
  role: "agent" | "user" | "system";
  content: string;
  ts: number;
  meta?: AuroraMessageMeta | null;
  history: { role: string; text: string; ts: number }[];
  timestamp: string;
  pending?: boolean;
  configChange?: boolean;
  attachments?: unknown[] | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Patrón ÚNICO de layout para TabsContent (Adenda 133).
// -----------------------------------------------------------------------------
// El primitivo shadcn (`src/components/ui/tabs.tsx`) aplica `mt-2` a TODO
// TabsContent; `cn()` usa tailwind-merge, así que anteponer `mt-0` en estas
// clases siempre gana sobre ese margen fantasma (el último `mt-*` de la cadena
// fusionada manda), sin tocar el primitivo compartido.
// - TAB_SCROLL: paneles de AJUSTES (proveedor, neuronas, integraciones,
//   config-ia, seguridad, decisiones, skills, tools, mcp, fuentes, etc.) —
//   altura flexible con scroll vertical propio.
// - TAB_FILL: apps de altura completa que gestionan su propio scroll interno
//   (chat, cerebro, pizarra, navegador, apps-ia) — el panel NO hace scroll,
//   lo hace el componente hijo.
// ─────────────────────────────────────────────────────────────────────────────
const TAB_SCROLL = "mt-0 flex-1 min-h-0 w-full max-w-full box-border overflow-y-auto";
const TAB_FILL = "mt-0 flex-1 min-h-0 w-full max-w-full box-border overflow-hidden data-[state=active]:flex data-[state=active]:flex-col";

function AgentPageInner() {
  const params = useSearchParams();
  const tabParam = params?.get('tab');
  const initialTab = normalizeTab(tabParam) ?? 'chat';

  // ── CONVERSACIÓN UNIFICADA (Adenda 69 · I-1) ───────────────────────────────
  // Antes este chat era `useState<ChatTurn[]>` EN MEMORIA: no persistía nada (al
  // recargar se perdía) y no veía ni una palabra de lo hablado con Aurora. Ahora
  // lee y escribe la MISMA conversación en la nube que el orbe, el
  // mini-reproductor y el Exocórtex (`aurora_conversations` + `astraura_messages`),
  // en tiempo real y entre dispositivos.
  const conv = useAiConversations();
  const cloudMessages = useAiMessages(conv.activeId);

  // Sincroniza el flag 'Registro' por chat del menú unificado (Adenda 71-bis):
  // el grabador del Registro no guarda cuando este chat lo tiene desactivado.
  useEffect(() => {
    const cfg = (conv.conversations.find((c) => c.id === conv.activeId)?.meta as any)?.config;
    setActiveChatLogEnabled(cfg ? cfg.log !== false : true);
  }, [conv.activeId, conv.conversations]);
  /** Respuesta que se está transmitiendo ahora mismo (aún no persistida). */
  const [streamText, setStreamText] = useState("");
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState(initialTab);

  // Sección de configuración activa (derivada del tab activo, pero conmutable
  // de forma independiente por el rail lateral / la tira móvil).
  const [activeSection, setActiveSection] = useState<string>(
    () => VALUE_TO_SECTION[initialTab] ?? 'chats'
  );
  const currentSection = STUDIO_SECTIONS.find(s => s.id === activeSection) ?? STUDIO_SECTIONS[0];

  // Al elegir una sección, saltamos a su primer ítem (mantiene el panel a la vista).
  const selectSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    const sec = STUDIO_SECTIONS.find(s => s.id === sectionId);
    if (sec && sec.items.length > 0 && !sec.items.some(it => it.value === activeTab)) {
      setActiveTab(sec.items[0].value);
    }
  }, [activeTab]);

  // Si el tab cambia (p.ej. por deep-link o navegación interna), sincroniza la
  // sección resaltada para que el rail refleje dónde estás.
  useEffect(() => {
    const sec = VALUE_TO_SECTION[activeTab];
    if (sec && sec !== activeSection) setActiveSection(sec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Adenda 132 · BUG FIX (botones + deep-links): sincroniza el query param
  // `?tab=` con el tab activo. Antes `activeTab` sólo se leía de `?tab=` al
  // MONTAR (useState(initialTab)); estando ya en /agent, los botones/enlaces a
  // /agent?tab=neuronas · ?tab=integraciones · etc. cambiaban la URL pero NO la
  // pestaña. Este efecto reacciona a cada cambio del searchParam.
  useEffect(() => {
    const t = normalizeTab(tabParam);
    if (t) setActiveTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);

  // Abre el Exocórtex (cortina Zenith) reusando el mismo evento global que el
  // orbe y la paleta de comandos. Astraura, Aurora y el Exocórtex comparten el
  // mismo cerebro/contexto — este enlace lo hace explícito en la UI.
  const openExocortex = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('starseed:open-aurora-exocortex'));
      toast.success('Abriendo el Exocórtex de Astraura IA — mismo cerebro que Astraura.');
    }
  }, []);

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
  
  const [process, setProcess] = useState<{ open: boolean; meta?: any }>({ open: false });

  const [streaming, setStreaming] = useState(false);
  // Adjuntos PENDIENTES (elegidos con 📎, aún sin enviar) — van con el próximo turno.
  const [pendingAttachments, setPendingAttachments] = useState<UniversalAttachment[]>([]);
  const removeAttachment = useCallback((i: number) => {
    setPendingAttachments((prev) => prev.filter((_, idx) => idx !== i));
  }, []);

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

  const aurora = useAurora();
  const activeAgent = agents.find(a => a.id === selectedAgentId) || agents[0];
  const activeProviderConfig = useMemo(
    () => configs.find(c => c.enabled && c.id === activeProviderId) ?? configs.find(c => c.enabled),
    [configs, activeProviderId]
  );
  const activeProviderInfo = activeProviderConfig ? PROVIDERS[activeProviderConfig.id].info : null;

  // Personalidad activa (nombre VISIBLE en el Nexus) — misma resolución por
  // contexto que el pipeline de Astraura (chat > sección > global). Solo lectura:
  // deja claro QUIÉN responde en este hilo sin tocar el envío del agente I1.
  const activePersona = useMemo(() => {
    try {
      return resolveTurnPersona({ convId: conv.activeId, route: "/agent" })?.profile ?? null;
    } catch {
      return null;
    }
  }, [conv.activeId, conv.conversations]);

  function setProvider(id: ProviderId) {
    setActiveProviderId(id);
    setActiveProviderIdState(id);
    toast.success(`Proveedor activo: ${PROVIDERS[id].info.label}`);
  }

  async function handleSend(override?: string) {
    const typed = (override ?? inputValue).trim();
    const atts = pendingAttachments;
    // Sin texto pero con adjuntos → un pie honesto para el hilo/modelo.
    const text = typed || (atts.length ? summarizeAttachments(atts) : "");
    if (!text || streaming) return;

    setInputValue("");
    setPendingAttachments([]);

    // 1) La conversación de destino: la ACTIVA (la misma que usa Aurora desde el
    //    orbe). Si no hay ninguna, se crea y queda activa para ambas superficies.
    let convId = conv.activeId;
    if (!convId) {
      const created = await ensureActiveConversation({
        title: titleFromText(text),
        kind: 'aurora',
        surface: 'agent',
      });
      convId = created.id;
      conv.setActive(created.id);
    }

    // 2) El mensaje del usuario se persiste YA (nube + caché) con sus adjuntos:
    //    aparece al instante aquí y, en tiempo real, en el Exocórtex y la orbe.
    await appendUnifiedMessage({
      role: 'user',
      text,
      convId,
      kind: 'aurora',
      surface: 'agent',
      attachments: atts.length ? atts : undefined,
    });

    if (!activeProviderConfig) {
      await appendUnifiedMessage({
        role: 'assistant',
        text: 'Aún no tienes un proveedor de IA configurado. Ve a Ajustes → IA & Modelos y añade Ollama (local) u otro proveedor con tu propia clave.',
        convId,
        kind: 'aurora',
        surface: 'agent',
        meta: { local: true, provider: 'Astraura (respuesta local)' },
      });
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

    // Contexto de adjuntos (Agente S1): contenido de los legibles (≤64KB) o nombre+tipo.
    if (atts.length) {
      try { const ac = await buildAttachmentsContext(atts); if (ac) systemPieces.push(ac); } catch { /* sin contexto: /agent responde igual */ }
    }

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

      // Pipeline compartido (Adenda 71-ter · I1): acciones [[ACCION:…]] del OS +
      // herramientas del cerebro activo + conocimiento del ecosistema + contexto
      // de ruta. Es lo que hacía del chat del orbe el más completo; ahora /agent
      // también lo tiene. La personalidad la inyecta astrauraChat (chatId).
      try {
        const extras = await composeAuroraSystem({
          route: typeof window !== "undefined" ? window.location.pathname : "/agent",
        });
        if (extras) systemPieces.push(extras);
      } catch { /* defensivo: sin extras, /agent responde igual */ }

      // Persistir el turno como chunk en la memoria OpenHuman
      // (tree + FTS) para que sea recuperable en futuros turnos.
      getOpenHumanEngine().ingest(text, 'chat', `chat-${Date.now()}`);
    } catch (e) {
      console.warn('[Agent] No se pudo construir contexto completo:', e);
    }

    // 3) Historial: el REAL de la conversación unificada (incluye lo que se haya
    //    hablado con Aurora por voz en este mismo hilo — ya no son dos mundos).
    const history: ChatMessage[] = [
      { role: 'system', content: systemPieces.join('\n\n---\n\n') },
      ...cloudMessages
        .filter(m => m.role !== 'system' && m.text.trim() && m.text !== text)
        .map<ChatMessage>(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.text,
        })),
      { role: 'user', content: text },
    ];

    abortRef.current = new AbortController();
    setStreaming(true);
    setStreamText("");
    let acc = "";
    const startedAt = Date.now();
    try {
      await astrauraChat({
        chatId: convId,
        chatConfig: (conv.conversations.find((c) => c.id === convId)?.meta as any)?.config,
        messages: history,
        temperature: activeAgent.temperature,
        signal: abortRef.current.signal,
        onChunk: (delta) => {
          // Filtrar directivas [[...]] del stream para no ensuciar la UI
          const match = delta.match(/\[\[(.*?)\]\]/);
          if (!match) {
            setStreamText(prev => prev + delta);
          }
          acc += delta;
        },
      });

      // Procesar directivas agénticas al finalizar
      const directives = parseDirectives(acc);
      if (directives.length > 0 && aurora) {
        await aurora.runDirectives(acc);
      }
      // 4) La respuesta completa se persiste en la conversación unificada.
      if (acc.trim()) {
        await appendUnifiedMessage({
          role: 'assistant',
          text: acc,
          convId,
          kind: 'aurora',
          surface: 'agent',
          source: activeProviderConfig.label,
          meta: {
            provider: activeProviderConfig.label,
            model: activeProviderConfig.defaultModel,
            ms: Date.now() - startedAt,
          },
        });
        // 5) Voz según personalidad/ajustes: respeta el toggle meta.config.voice
        //    del chat (por defecto activo si la personalidad tiene voz). Reutiliza
        //    el TTS del engine vía el puente global (no duplica motor de voz).
        speakAuroraReply(acc, { convId });
      }
    } catch (err) {
      const msg = (err as Error).message;
      // Lo ya transmitido antes del corte NO se tira: es parte honesta del hilo.
      if (acc.trim()) {
        await appendUnifiedMessage({
          role: 'assistant',
          text: `${acc}\n\n⚠ ${msg}`,
          convId,
          kind: 'aurora',
          surface: 'agent',
          source: activeProviderConfig.label,
          meta: { provider: activeProviderConfig.label, model: activeProviderConfig.defaultModel },
        });
      } else {
        await appendUnifiedMessage({
          role: 'assistant',
          text: `⚠ ${msg}`,
          convId,
          kind: 'aurora',
          surface: 'agent',
          meta: { local: true, provider: 'Astraura (error)' },
        });
      }
      toast.error(`Error: ${msg}`);
    } finally {
      setStreaming(false);
      setStreamText("");
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
    // El texto ya transmitido se conserva: `handleSend` lo persiste en su
    // `catch`/`finally` (abortar lanza AbortError, que entra por el catch).
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [cloudMessages, streamText, activeTab]);

  // Lo que se pinta: los mensajes REALES de la conversación unificada + la
  // burbuja en vivo de la respuesta que se está transmitiendo. Si el hilo está
  // vacío, un saludo honesto (no se persiste: es UI, no historial).
  
  const messages = useMemo<AgentRenderMsg[]>(() => {
    // Mantiene los divisores "⚙️ Ajustes del chat actualizados" (role 'system'
    // + meta.kind 'config-change'); filtra el resto de mensajes de sistema.
    const base: AgentRenderMsg[] = cloudMessages
      .filter(m => m.role !== 'system' || isConfigChangeMessage(m.role, m.text, m.meta))
      .map((m, i, arr) => {
        if (isConfigChangeMessage(m.role, m.text, m.meta)) {
          return {
            id: m.id, role: 'system', content: m.text, ts: m.ts,
            meta: m.meta, history: [], timestamp: '', configChange: true,
          };
        }
        return {
          id: m.id,
          role: (m.role === 'assistant' ? 'agent' : 'user') as AgentRenderMsg['role'],
          content: m.text,
          ts: m.ts,
          meta: m.meta,
          attachments: m.attachments,
          history: arr.slice(0, i + 1).map(e => ({ role: e.role === 'assistant' ? 'aurora' : 'user', text: e.text, ts: e.ts })),
          timestamp: (() => {
            try { return new Date(m.ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }
            catch { return ''; }
          })(),
        };
      });
    if (base.length === 0 && !streaming) {
      base.push({
        id: 'placeholder',
        role: 'agent',
        content: 'Sistemas neurales activos. Escribe aquí o háblale a Aurora desde el orbe: es la **misma conversación**. Elige un proveedor de IA en Ajustes → IA & Modelos para conversar de verdad.',
        timestamp: 'Ahora',
        ts: Date.now(),
        meta: undefined,
        history: [],
      });
    }
    if (streaming) {
      base.push({ id: 'streaming', role: 'agent', content: streamText, timestamp: '', ts: Date.now(), pending: true, meta: undefined, history: [] });
    }
    return base;
  }, [cloudMessages, streaming, streamText]);


  return (
    <div className="flex flex-col h-[calc(100dvh-4rem-env(safe-area-inset-bottom))] gap-4 p-3 sm:p-4 md:p-5 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] max-w-[1600px] mx-auto w-full box-border overflow-x-hidden">

      <div className="flex items-center justify-between flex-wrap gap-3 w-full max-w-full box-border">
        <h1 className="text-xl sm:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-400 flex items-center gap-2 sm:gap-3 min-w-0">
          <BrainCircuit className="w-7 h-7 sm:w-8 sm:h-8 text-primary shrink-0" />
          <span className="truncate">Astraura AI & Orchestration</span>
        </h1>
        <div className="flex items-center gap-2 flex-wrap min-w-0 max-w-full">
          {activeProviderConfig ? (
            <Badge
              variant="outline"
              className={`gap-1 max-w-[60vw] truncate ${
                activeProviderInfo?.local
                  ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
                  : "border-blue-500/50 text-blue-400 bg-blue-500/10"
              }`}
            >
              {activeProviderInfo?.local ? <Cpu className="h-3 w-3 shrink-0" /> : <Cloud className="h-3 w-3 shrink-0" />}
              <span className="truncate">{activeProviderConfig.label} · {activeProviderConfig.defaultModel}</span>
            </Badge>
          ) : (
            <Link href="/settings">
              <Badge variant="outline" className="border-amber-500/50 text-amber-400 bg-amber-500/10 cursor-pointer hover:bg-amber-500/20">
                Configura un proveedor de IA →
              </Badge>
            </Link>
          )}
          <Badge variant="outline" className="border-blue-500/50 text-blue-400 bg-blue-500/10">{agents.length} agentes</Badge>
          {/* Centro de Configuración de Aurora y Astraura (Adenda 67 · P1). Si el
              perfil aún no está configurado, además se abre solo al entrar aquí. */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => openAuroraSetup()}
            className="gap-1.5 border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
          >
            <Sliders className="h-3.5 w-3.5" /> Configurar Neurona
          </Button>
          {/* Adenda 132: configuración unificada de Astraura & OmniVoice como
              drawer global. Visible en TODAS las pestañas, incluida «Chats»
              (cumple «en los chats un botón para configurar»). */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => openAstrauraConfig()}
            className="gap-1.5 border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-200 hover:bg-fuchsia-500/20 cursor-pointer"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Configurar IA
          </Button>
        </div>
      </div>

      {/* --- Vínculo Astraura ↔ Aurora ↔ Exocórtex (mismo cerebro/contexto) --- */}
      <button
        type="button"
        onClick={openExocortex}
        className="shrink-0 group w-full max-w-full box-border text-left rounded-xl border border-emerald-400/25 bg-gradient-to-r from-emerald-500/10 via-fuchsia-500/[0.06] to-blue-500/10 backdrop-blur-md px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer transition-colors duration-200 hover:border-emerald-400/45 hover:from-emerald-500/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
        aria-label="Abrir el Exocórtex de Astraura IA"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 grid place-items-center h-9 w-9 rounded-lg bg-gradient-to-tr from-emerald-500/30 to-fuchsia-500/30 border border-white/10">
            <Waypoints className="w-4 h-4 text-emerald-200" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-50 truncate">
              Astraura, Aurora y el Exocórtex comparten el mismo cerebro
            </p>
            <p className="text-[11px] sm:text-xs text-white/55 truncate">
              El contexto se mantiene entre este estudio y el Exocórtex de la voz Aurora.
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-emerald-200 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5">
            Abrir Exocórtex <ArrowUpRight className="w-3.5 h-3.5" />
          </span>
          <ArrowUpRight className="w-4 h-4 text-emerald-200 shrink-0 sm:hidden" />
        </div>
      </button>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col lg:flex-row gap-3 lg:gap-4 min-h-0 w-full max-w-full box-border">

        {/* ── RAIL DE SECCIONES ──────────────────────────────────────────────
            Desktop: navegación vertical fija a la izquierda.
            Móvil/tablet: tira horizontal deslizable (.ss-hscroll) que NUNCA
            desborda el viewport. */}
        <nav
          className="ss-hscroll ss-hscroll-fade flex flex-row lg:flex-col gap-1.5 lg:gap-1 shrink-0 w-full max-w-full lg:w-56 lg:max-w-[14rem] box-border lg:overflow-x-visible lg:overflow-y-auto lg:[mask-image:none] lg:pr-1 pb-1 lg:pb-0 px-3 lg:px-0 scroll-px-3 lg:scroll-px-0"
          aria-label="Secciones de configuración de Astraura"
        >
          {STUDIO_SECTIONS.map((sec) => {
            const isActive = sec.id === activeSection;
            const Icon = sec.icon;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => selectSection(sec.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium cursor-pointer transition-colors duration-200 shrink-0 box-border whitespace-nowrap lg:whitespace-normal lg:w-full text-left border",
                  isActive
                    ? "bg-white/[0.07] border-white/15 text-white shadow-sm"
                    : "bg-black/20 lg:bg-transparent border-white/5 text-muted-foreground hover:bg-white/5 hover:text-white/90"
                )}
              >
                <Icon className={cn("w-4 h-4 shrink-0", isActive ? sec.accent : "text-muted-foreground group-hover:text-white/80")} />
                <span className="truncate">{sec.label}</span>
                <ChevronRight className={cn("w-3.5 h-3.5 ml-auto shrink-0 hidden lg:block transition-opacity", isActive ? "opacity-70" : "opacity-0 group-hover:opacity-40")} />
              </button>
            );
          })}
        </nav>

        {/* ── PANEL DE LA SECCIÓN ACTIVA ─────────────────────────────────── */}
        <div className="flex-1 flex flex-col gap-3 min-h-0 min-w-0 w-full max-w-full box-border">

          {/* Cabecera de la sección + sub-pestañas deslizables */}
          <div className="shrink-0 w-full max-w-full box-border rounded-xl border border-white/5 bg-black/20 backdrop-blur-md p-2 sm:p-2.5">
            <div className="flex items-center gap-2 px-1 pb-2 min-w-0">
              <currentSection.icon className={cn("w-4 h-4 shrink-0", currentSection.accent)} />
              <span className="text-sm font-semibold text-white truncate">{currentSection.label}</span>
              {currentSection.hint && (
                <span className="text-[11px] text-muted-foreground/70 truncate hidden md:inline">— {currentSection.hint}</span>
              )}
              {/* Adenda 133: acceso directo a la config unificada de Astraura &
                  OmniVoice (drawer global) desde la cabecera de CADA sección —
                  antes solo aparecía en «Modelos & Proveedores». Se mantiene
                  también el botón equivalente en la cabecera de página. */}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => openAstrauraConfig()}
                className="ml-auto shrink-0 gap-1.5 border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-200 hover:bg-fuchsia-500/20 cursor-pointer"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Configurar Astraura &amp; OmniVoice</span>
                <span className="sm:hidden">Configurar</span>
              </Button>
            </div>
            {currentSection.items.length > 1 && (
              <TabsList className="ss-hscroll ss-hscroll-fade w-full max-w-full box-border justify-start bg-transparent border-0 py-0 px-3 scroll-px-3 gap-1 h-auto flex-nowrap">
                {currentSection.items.map((it) => {
                  const ItemIcon = it.icon;
                  return (
                    <TabsTrigger
                      key={it.value}
                      value={it.value}
                      className="gap-2 shrink-0 whitespace-nowrap rounded-lg data-[state=active]:bg-white/10 data-[state=active]:text-white cursor-pointer"
                    >
                      <ItemIcon className="w-4 h-4 shrink-0" />
                      <span>{it.label}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            )}
          </div>

        {/* --- TAB: NEXUS (panel gráfico de uso del sistema Astraura, por perfil) --- */}
        <TabsContent value="overview" className={TAB_SCROLL}>
          <div className="space-y-4">
            {/* CTA propio retirado (Adenda 133): el botón "Configurar Astraura & OmniVoice"
                de la cabecera de sección ya cubre esta pestaña. */}
            <AstrauraUsagePanel />
          </div>
        </TabsContent>

        {/* --- TAB: ESPACIOS DE TRABAJO (Portal Nexus + gestión de espacios · G2) --- */}
        <TabsContent value="espacios" className={TAB_SCROLL}>
          <div className="space-y-6">
            {/* El Portal Nexus (espacios = carpetas reales) vive aquí como bloque superior. */}
            <NexusWorkspaces onOpenTab={(t) => setActiveTab(t)} />
            <WorkspacesSection />
          </div>
        </TabsContent>

        <TabsContent value="cerebro" className={TAB_FILL}>
          {/* Adenda 132: «Mapa 3D» se fusionó aquí (este panel monta el MemoryBrain3D
              real). Enlace para abrir el mapa a pantalla completa en /memorias-3d,
              conservando ese acceso que antes daba el placeholder «Mapa 3D». */}
          <div className="flex items-center justify-end px-1 pb-2 shrink-0">
            <Link href="/memorias-3d">
              <Button size="sm" variant="outline" className="gap-1.5 border-cyan-400/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 cursor-pointer">
                <Sparkles className="h-3.5 w-3.5" /> Abrir a pantalla completa
              </Button>
            </Link>
          </div>
          <div className="flex-1 min-h-0">
            <MemoryBrain3D className="h-full min-h-[70vh]" />
          </div>
        </TabsContent>

        <TabsContent value="batch" className={TAB_SCROLL}>
          <BatchJobsPanel />
        </TabsContent>

        <TabsContent value="servers" className={TAB_SCROLL}>
          <ServerRegistryPanel />
        </TabsContent>

        {/* --- TAB: CHAT (cuerpo extraído a ChatSurface · Adenda 76 · G1) --- */}
        <TabsContent value="chat" className={TAB_FILL}>
          <ChatSurface />
        </TabsContent>

        {/* --- TAB: FOUNDRY (AGENT BUILDER) --- */}
        <TabsContent value="foundry" className="mt-0 flex-1 data-[state=active]:grid grid-cols-1 md:grid-cols-3 gap-6 overflow-y-auto min-h-0">
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
        <TabsContent value="rules" className="mt-0 flex-1 data-[state=active]:grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto min-h-0">
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
        <TabsContent value="workflows" className="mt-0 flex-1 min-h-0 overflow-y-auto">
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
        <TabsContent value="skills" className={TAB_SCROLL}>
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
        <TabsContent value="tools" className={cn(TAB_SCROLL, "space-y-4")}>
          <Card className="border-white/10 bg-black/20">
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

          {/* Librería de código abierto · Plugins & tools (catálogo OSS) */}
          <Card className="border-white/10 bg-black/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wrench className="w-4 h-4 text-cyan-400" /> Librería de código abierto · Plugins & tools
              </CardTitle>
              <CardDescription>
                Estándares e interoperabilidad de código abierto (MCP, OpenAPI…) para conectar herramientas y datos a tus agentes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OssLibraryBrowser category="plugin-standard" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- TAB: FUENTES / LIBRERÍA --- */}
        <TabsContent value="fuentes" className={cn(TAB_SCROLL, "space-y-4")}>
          <Card className="border-white/10 bg-black/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookMarked className="w-4 h-4 text-cyan-400" /> Fuentes de la Librería
              </CardTitle>
              <CardDescription>
                Gestiona los orígenes de la librería (código, componentes, diseño, MCP, modelos, apps…): actívalos,
                instálalos en un cerebro con permisos, comparte enlaces de instalación y actualiza skills desde sus
                repos originales.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LibrarySourcesPanel />
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- TAB: MCP --- */}
        <TabsContent value="mcp" className={TAB_SCROLL}>
          <McpPanel />
        </TabsContent>

        {/* --- TAB: SENTIDOS --- */}
        <TabsContent value="senses" className={TAB_SCROLL}>
          <SensesPanel />
        </TabsContent>

        {/* --- TAB: ACCESOS RÁPIDOS (mismo catálogo del dock y Nexus) --- */}
        <TabsContent value="telegram" className={TAB_SCROLL}><TelegramSpacesPanel /></TabsContent>

        <TabsContent value="memorias" className={TAB_SCROLL}><MemoryHub /></TabsContent>

        <TabsContent value="baules" className={TAB_SCROLL}><VaultsPanel /></TabsContent>

        {/* Adenda 132: «Mapa 3D» fusionado en «Cerebro» (MemoryBrain3D real). El
            acceso a pantalla completa /memorias-3d vive ahora dentro del panel
            «Cerebro» (value="cerebro"). Ítem de nav retirado y alias mapa3d/mapa-3d → cerebro. */}

        <TabsContent value="runtimes" className={TAB_SCROLL}><AgentRuntimePanel /></TabsContent>

        <TabsContent value="okf" className={TAB_SCROLL}><OKFPanel /></TabsContent>

        <TabsContent value="proveedor" className={TAB_SCROLL}><ProviderPanel /></TabsContent>

        <TabsContent value="aurora" className={TAB_SCROLL}><AuroraStudio /></TabsContent>

        {/* --- TAB: PERSONALIDADES (hub global · Adenda 97) --- */}
        <TabsContent value="personalidades" className={TAB_SCROLL}><PersonalitiesHub /></TabsContent>

        {/* --- TAB: RED MESH (Meshtastic/LoRa · Adenda 97) --- */}
        <TabsContent value="mesh" className={TAB_SCROLL}><MeshControlPanel /></TabsContent>

        <TabsContent value="coherencia" className={TAB_SCROLL}><PersonaCoherencePanel /></TabsContent>

        <TabsContent value="conexiones-chat" className={TAB_SCROLL}><ChatConnectionsPanel /></TabsContent>

        <TabsContent value="almacenes" className={TAB_SCROLL}><StoragePanel /></TabsContent>

        <TabsContent value="conexiones" className={TAB_SCROLL}><ConnectionsHub /></TabsContent>

        {/* --- TAB: CONFIGURACIÓN IA (config unificada Astraura & OmniVoice · Adenda 132) --- */}
        <TabsContent value="config-ia" className={TAB_SCROLL}><AstrauraOmniVoiceConfig variant="embedded" onNavigate={(t) => setActiveTab(t)} /></TabsContent>

        {/* --- TAB: ASTRAURA 1.58-BIT (sistema primario soberano · Adenda 153) --- */}
        <TabsContent value="astraura-158" className={TAB_SCROLL}><Astraura158Panel /></TabsContent>

        <TabsContent value="cerebros" className={TAB_SCROLL}><BrainsPanel /></TabsContent>

        <TabsContent value="neuronas" className={TAB_SCROLL}><NeuronModelsPanel /></TabsContent>

        <TabsContent value="integraciones" className={TAB_SCROLL}><IntegrationSourcesPanel /></TabsContent>

        <TabsContent value="servidores" className={TAB_SCROLL}><ServersPanel /></TabsContent>

        <TabsContent value="seguridad" className={TAB_SCROLL}><SecurityPanel /></TabsContent>

        <TabsContent value="pizarra" className={TAB_FILL}><CanvasBoard /></TabsContent>

        <TabsContent value="navegador" className={TAB_SCROLL}><BrowserWindows /></TabsContent>

        <TabsContent value="publicar" className={TAB_SCROLL}><PublicationComposer /></TabsContent>

        <TabsContent value="pizarras" className={TAB_SCROLL}><WorkCenters /></TabsContent>

        <TabsContent value="apps-ia" className={TAB_FILL}><AiAppGenerator /></TabsContent>

        <TabsContent value="habilidades" className={TAB_SCROLL}><AbilitiesHub /></TabsContent>

        <TabsContent value="conocimiento" className={TAB_SCROLL}><div className="flex flex-col items-center justify-center h-full text-center gap-4 p-8"><div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-400 to-fuchsia-500 flex items-center justify-center text-3xl">🌐</div><div className="text-lg font-semibold text-amber-50">Red de Conocimiento</div><p className="text-sm text-white/50 max-w-md">Categorías y temas interconectados con vínculos multi-categoría y 3 vistas (Lista, Mapa 2D, Red 3D).</p><Link href="/conocimiento"><Button className="gap-2 bg-fuchsia-600 hover:bg-fuchsia-500"><BookOpen className="w-4 h-4" /> Abrir Red de Conocimiento</Button></Link></div></TabsContent>

        {/* Adenda 132: eliminado el <TabsContent value="sentidos"> MUERTO. No existe
            ítem de nav «sentidos» y el alias sentidos→senses nunca deja activeTab="sentidos",
            así que nunca se renderizaba. El panel real de Sentidos vive en value="senses". */}

        <TabsContent value="red3d" className={TAB_SCROLL}><div className="flex flex-col items-center justify-center h-full text-center gap-4 p-8"><div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-400 to-cyan-500 flex items-center justify-center text-3xl">🕸️</div><div className="text-lg font-semibold text-cyan-50">Red 3D de interconexión</div><p className="text-sm text-white/50 max-w-md">Visualiza la malla viva de cerebros, servidores, almacenes y baúles con sus enlaces y sincronizaciones, en 3D y con ayuda de Astraura.</p><Link href="/red-3d"><Button className="gap-2 bg-cyan-600 hover:bg-cyan-500"><Network className="w-4 h-4" /> Abrir Red 3D</Button></Link></div></TabsContent>

        <TabsContent value="decisiones" className={TAB_SCROLL}><div className="space-y-6"><GovernancePanel /><GovNotifications /></div></TabsContent>

        <TabsContent value="mi-actividad" className={TAB_SCROLL}><MyActivity /></TabsContent>

        <TabsContent value="quick" className={cn(TAB_SCROLL, "space-y-3")}>
          <QuickOptionsGrid
            title="Accesos rápidos del agente"
            description="El mismo catálogo unificado disponible en el dock y el Nexus. Edita aquí lo que quieres exponer en cualquier superficie."
            columns={4}
            editable
          />
        </TabsContent>
        </div>
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
