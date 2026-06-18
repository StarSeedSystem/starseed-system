"use client";

/**
 * StarSeed OS — Exocórtex · Cerebro 3D
 *
 * Visualizador del grafo de memoria del ecosistema + panel de control
 * con IA real (misma capa que el Chat Neural de /agent).
 */

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BrainCircuit,
  Search,
  Send,
  Loader2,
  ExternalLink,
  Network,
  BookOpen,
  Bot,
  Settings2,
  Layers,
  Sparkles,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Activity,
} from "lucide-react";
import {
  memoryGraph,
  nodesByKind,
  searchNodes,
  getNode,
  neighbors,
  type MemoryNode,
} from "./memory-graph-data";
import { chat } from "@/ai/client/chat";
import { loadConfigs, getActiveProviderId } from "@/ai/client/providerStore";
import { PROVIDERS, type ProviderId } from "@/ai/providers";
import type { ProviderConfig } from "@/ai/providers/types";

// ============================================================
// Helpers de presentación
// ============================================================

/** Color por node.type, usando la paleta del meta.nodeTypes */
const TYPE_COLORS: Record<string, string> = {
  root: "#F6A21E",
  area: "#E9C46A",
  app: "#7FD1AE",
  repo: "#9C6B3F",
  deploy: "#5BC0EB",
  service: "#C792EA",
  account: "#B388FF",
  database: "#4DD0E1",
  api: "#FF9E64",
  design: "#F4E8C9",
  doc: "#A8DADC",
  memory: "#FFD166",
  connector: "#80CBC4",
  agent: "#FF6B9D",
  concept: "#BDB2FF",
};

const KIND_LABEL: Record<string, string> = {
  identity: "Identidad",
  semantic: "Semántica",
  episodic: "Episódica",
  procedural: "Procedural",
  project: "Proyecto",
  reference: "Referencia",
  account: "Cuenta",
  feedback: "Feedback",
};

function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? "#888888";
}

function NodeBadge({ type }: { type: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
      style={{
        background: typeColor(type) + "22",
        color: typeColor(type),
        border: `1px solid ${typeColor(type)}55`,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: typeColor(type) }}
      />
      {type}
    </span>
  );
}

// ============================================================
// Panel de resumen del nodo seleccionado
// ============================================================

function NodeDetail({
  node,
  onClose,
}: {
  node: MemoryNode;
  onClose: () => void;
}) {
  const nbrs = neighbors(node.id);
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm leading-tight">{node.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {KIND_LABEL[node.kind] ?? node.kind}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <NodeBadge type={node.type} />
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      </div>

      {node.summary && (
        <p className="text-xs text-muted-foreground leading-relaxed border-l-2 pl-3"
          style={{ borderColor: typeColor(node.type) + "66" }}>
          {node.summary}
        </p>
      )}

      {/* Contextos */}
      {node.context && node.context.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {node.context.map((c) => (
            <Badge
              key={c}
              variant="secondary"
              className="text-[9px] bg-white/5"
            >
              {c}
            </Badge>
          ))}
        </div>
      )}

      {/* Estado */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Estado:</span>
        <span
          className={`font-semibold ${
            node.status === "vivo" || node.status === "online" || node.status === "activo"
              ? "text-emerald-400"
              : node.status === "congelado"
              ? "text-blue-400"
              : "text-amber-400"
          }`}
        >
          {node.status}
        </span>
      </div>

      {/* Vecinos */}
      {nbrs.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">
            Conectado con ({nbrs.length}):
          </p>
          <div className="flex flex-wrap gap-1">
            {nbrs.slice(0, 6).map((nb) => (
              <span
                key={nb.id}
                className="text-[10px] px-2 py-0.5 rounded border cursor-default"
                style={{
                  borderColor: typeColor(nb.type) + "44",
                  color: typeColor(nb.type),
                  background: typeColor(nb.type) + "11",
                }}
              >
                {nb.label}
              </span>
            ))}
            {nbrs.length > 6 && (
              <span className="text-[10px] text-muted-foreground">
                +{nbrs.length - 6} más
              </span>
            )}
          </div>
        </div>
      )}

      {/* Links externos */}
      {node.links && node.links.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {node.links.map((lnk, i) => (
            <a
              key={i}
              href={lnk.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
            >
              <ExternalLink className="w-3 h-3" />
              {lnk.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Componente principal
// ============================================================

export function ExocortexBrain({ className }: { className?: string }) {
  // --- Datos del grafo ---
  const kindMap = nodesByKind();
  const totalNodes = memoryGraph.nodes.length;
  const totalEdges = memoryGraph.edges.length;
  const kinds = Object.keys(kindMap).sort();

  // --- Estado de búsqueda ---
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MemoryNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<MemoryNode | null>(null);

  // --- Estado de IA ---
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [providerConfig, setProviderConfig] = useState<ProviderConfig | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // --- Estado de capas (cosmético + toggling) ---
  const [activeKinds, setActiveKinds] = useState<Set<string>>(new Set(kinds));

  // --- Estado de ajustes ---
  const [rotacion, setRotacion] = useState(true);
  const [densidad, setDensidad] = useState([60]);
  const [etiquetas, setEtiquetas] = useState(true);

  // --- Secciones colapsables ---
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    stats: true,
    ia: true,
    buscar: true,
    capas: false,
    red: false,
    ajustes: false,
  });

  // --- HarmonicGraph3D (importado dinámico para SSR-safety) ---
  const [Graph3D, setGraph3D] = useState<React.ComponentType | null>(null);
  useEffect(() => {
    import("@/components/network/harmonic-graph-3d").then((m) => {
      setGraph3D(() => m.HarmonicGraph3D);
    });
  }, []);

  // --- Cargar proveedor activo ---
  useEffect(() => {
    const configs = loadConfigs();
    const activeId = getActiveProviderId();
    const active =
      configs.find((c) => c.enabled && c.id === activeId) ??
      configs.find((c) => c.enabled) ??
      null;
    setProviderConfig(active);
  }, []);

  // --- Búsqueda en grafo ---
  const handleSearch = useCallback(
    (q: string) => {
      setSearchQuery(q);
      if (!q.trim()) {
        setSearchResults([]);
        return;
      }
      setSearchResults(searchNodes(q));
    },
    []
  );

  // --- Pregunta al Exocórtex ---
  const handleAskExocortex = useCallback(async () => {
    const question = aiQuestion.trim();
    if (!question || aiLoading) return;

    if (!providerConfig) {
      setAiError("no_provider");
      return;
    }

    setAiLoading(true);
    setAiError(null);
    setAiAnswer("");

    // Construir resumen del grafo para el system prompt
    const nodesSummary = memoryGraph.nodes
      .slice(0, 60)
      .map((n) => `[${n.type}:${n.id}] ${n.label}${n.summary ? ` — ${n.summary}` : ""}`)
      .join("\n");
    const edgesSummary = memoryGraph.edges
      .slice(0, 40)
      .map((e) => `${e.source} --[${e.type}]--> ${e.target}`)
      .join("\n");

    const systemPrompt = `Eres el Exocórtex de StarSeed OS, la inteligencia personal del ecosistema StarSeed.
Tu propósito es ayudar al usuario a entender y navegar el grafo de memoria del sistema.
Responde en español, de forma clara y concisa.

GRAFO DE MEMORIA (resumen de ${totalNodes} nodos, ${totalEdges} conexiones):

Nodos principales:
${nodesSummary}

Conexiones principales:
${edgesSummary}

Responde siempre haciendo referencia al grafo cuando sea relevante.`;

    abortRef.current = new AbortController();

    try {
      await chat({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
        temperature: 0.7,
        signal: abortRef.current.signal,
        onChunk: (delta) => {
          setAiAnswer((prev) => prev + delta);
        },
      });
    } catch (err) {
      const msg = (err as Error).message;
      if (!msg.includes("aborted")) {
        setAiError(msg);
      }
    } finally {
      setAiLoading(false);
      abortRef.current = null;
    }
  }, [aiQuestion, aiLoading, providerConfig, totalNodes, totalEdges]);

  // --- Toggle sección ---
  function toggleSection(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // --- Toggle kind ---
  function toggleKind(kind: string) {
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  }

  return (
    <div className={`flex flex-col xl:flex-row gap-4 w-full ${className ?? ""}`}>
      {/* ======================================================
          COLUMNA IZQUIERDA — Cerebro 3D
         ====================================================== */}
      <div className="flex-1 xl:w-0 xl:flex-[2] min-h-[60vh]">
        <GlassCard className="h-full min-h-[60vh] p-0 overflow-hidden">
          {/* Header del cerebro */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-primary" />
              <span className="font-bold text-sm">Cerebro Exocórtex</span>
              <Badge
                variant="outline"
                className="text-[9px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10 gap-1"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                VIVO
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3" />
                {totalNodes} nodos
              </span>
              <span>{totalEdges} aristas</span>
            </div>
          </div>

          {/* Canvas 3D */}
          <div className="w-full" style={{ minHeight: "calc(60vh - 50px)" }}>
            {Graph3D ? (
              <Graph3D />
            ) : (
              <div className="flex items-center justify-center h-full min-h-[400px] gap-3 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-sm">Iniciando motor 3D...</span>
              </div>
            )}
          </div>
        </GlassCard>
      </div>

      {/* ======================================================
          COLUMNA DERECHA — Panel de control
         ====================================================== */}
      <div className="xl:w-[380px] flex flex-col gap-3 xl:overflow-y-auto xl:max-h-[calc(100vh-8rem)]">

        {/* ---- 1. Stats ---- */}
        <GlassCard>
          <button
            className="w-full flex items-center justify-between p-4 cursor-pointer text-left"
            onClick={() => toggleSection("stats")}
          >
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">Exocórtex</span>
            </div>
            {openSections.stats ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          {openSections.stats && (
            <div className="px-4 pb-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 text-center">
                  <p className="text-2xl font-bold text-primary">{totalNodes}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Nodos totales
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/10 text-center">
                  <p className="text-2xl font-bold text-purple-400">{totalEdges}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Conexiones
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                {kinds.map((kind) => (
                  <div
                    key={kind}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-muted-foreground">
                      {KIND_LABEL[kind] ?? kind}
                    </span>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-1 rounded-full bg-primary/30"
                        style={{
                          width: `${Math.max(
                            20,
                            ((kindMap[kind]?.length ?? 0) / totalNodes) * 120
                          )}px`,
                        }}
                      />
                      <span className="font-mono text-[10px] w-5 text-right text-muted-foreground">
                        {kindMap[kind]?.length ?? 0}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/50 font-mono">
                v{memoryGraph.meta.version} · {memoryGraph.meta.generated}
              </p>
            </div>
          )}
        </GlassCard>

        {/* ---- 2. Pregunta al Exocórtex (IA real) ---- */}
        <GlassCard>
          <button
            className="w-full flex items-center justify-between p-4 cursor-pointer text-left"
            onClick={() => toggleSection("ia")}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="font-semibold text-sm">Pregunta al Exocórtex</span>
            </div>
            {openSections.ia ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          {openSections.ia && (
            <div className="px-4 pb-4 space-y-3">
              {/* Indicador de proveedor */}
              {providerConfig ? (
                <div className="flex items-center gap-2 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5">
                  <Bot className="w-3 h-3" />
                  <span>
                    {providerConfig.label} ·{" "}
                    {providerConfig.defaultModel}
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>
                    Sin proveedor IA.{" "}
                    <Link
                      href="/agent"
                      className="underline hover:text-amber-300 cursor-pointer"
                    >
                      Configura uno en Agente → IA & Modelos
                    </Link>
                  </span>
                </div>
              )}

              <Textarea
                placeholder="¿Qué es el ecosistema StarSeed? ¿Cómo se conectan los repos? ¿Qué es Astraura?..."
                className="bg-black/20 border-white/10 text-sm resize-none min-h-[80px]"
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    handleAskExocortex();
                  }
                }}
                disabled={aiLoading}
              />

              <div className="flex gap-2">
                <Button
                  onClick={handleAskExocortex}
                  disabled={!aiQuestion.trim() || aiLoading || !providerConfig}
                  size="sm"
                  className="flex-1 gap-2 cursor-pointer"
                >
                  {aiLoading ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Pensando...
                    </>
                  ) : (
                    <>
                      <Send className="w-3 h-3" />
                      Enviar
                    </>
                  )}
                </Button>
                {aiLoading && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      abortRef.current?.abort();
                      setAiLoading(false);
                    }}
                    className="cursor-pointer"
                  >
                    Detener
                  </Button>
                )}
              </div>

              {/* Respuesta */}
              {aiError && aiError !== "no_provider" && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  Error: {aiError}
                </div>
              )}

              {aiAnswer && (
                <div className="text-xs text-foreground/80 bg-primary/5 border border-primary/10 rounded-xl p-3 leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {aiAnswer}
                  {aiLoading && (
                    <span className="inline-block w-1.5 h-3.5 ml-1 bg-primary/70 animate-pulse align-middle" />
                  )}
                </div>
              )}

              <p className="text-[9px] text-muted-foreground/40">
                Ctrl/⌘ + Enter para enviar
              </p>
            </div>
          )}
        </GlassCard>

        {/* ---- 3. Buscar en la memoria ---- */}
        <GlassCard>
          <button
            className="w-full flex items-center justify-between p-4 cursor-pointer text-left"
            onClick={() => toggleSection("buscar")}
          >
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-cyan-400" />
              <span className="font-semibold text-sm">Buscar en la memoria</span>
              {searchResults.length > 0 && (
                <Badge
                  variant="secondary"
                  className="text-[9px] bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                >
                  {searchResults.length}
                </Badge>
              )}
            </div>
            {openSections.buscar ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          {openSections.buscar && (
            <div className="px-4 pb-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Busca nodos, conceptos, repos, servicios..."
                  className="pl-8 bg-black/20 border-white/10 text-sm"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>

              {searchResults.length > 0 ? (
                <ScrollArea className="max-h-64">
                  <div className="space-y-1 pr-1">
                    {searchResults.map((node) => (
                      <button
                        key={node.id}
                        onClick={() =>
                          setSelectedNode(
                            selectedNode?.id === node.id ? null : node
                          )
                        }
                        className={`w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer text-xs ${
                          selectedNode?.id === node.id
                            ? "border-primary/40 bg-primary/10"
                            : "border-white/5 bg-white/3 hover:bg-white/8 hover:border-white/10"
                        }`}
                      >
                        <div className="flex items-center gap-2 justify-between">
                          <span className="font-medium truncate">{node.label}</span>
                          <NodeBadge type={node.type} />
                        </div>
                        {node.summary && (
                          <p className="text-muted-foreground mt-1 line-clamp-2 leading-tight">
                            {node.summary}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              ) : searchQuery.trim() ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Sin resultados para &ldquo;{searchQuery}&rdquo;
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground/50 text-center py-2">
                  Escribe para explorar los {totalNodes} nodos del grafo
                </p>
              )}

              {/* Detalle del nodo seleccionado */}
              {selectedNode && (
                <div className="border border-white/10 rounded-xl bg-black/20">
                  <NodeDetail
                    node={selectedNode}
                    onClose={() => setSelectedNode(null)}
                  />
                </div>
              )}
            </div>
          )}
        </GlassCard>

        {/* ---- 4. Capas / tipos ---- */}
        <GlassCard>
          <button
            className="w-full flex items-center justify-between p-4 cursor-pointer text-left"
            onClick={() => toggleSection("capas")}
          >
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" />
              <span className="font-semibold text-sm">Capas / tipos</span>
            </div>
            {openSections.capas ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          {openSections.capas && (
            <div className="px-4 pb-4 space-y-3">
              {/* Por tipo de nodo */}
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                Tipos de nodo
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(TYPE_COLORS).map(([type, color]) => {
                  const count = memoryGraph.nodes.filter(
                    (n) => n.type === type
                  ).length;
                  if (count === 0) return null;
                  return (
                    <span
                      key={type}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold cursor-default"
                      style={{
                        background: color + "18",
                        color,
                        border: `1px solid ${color}44`,
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: color }}
                      />
                      {type}
                      <span className="opacity-60">({count})</span>
                    </span>
                  );
                })}
              </div>

              {/* Por kind */}
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold pt-1">
                Capas de memoria
              </p>
              <div className="flex flex-wrap gap-1.5">
                {kinds.map((kind) => (
                  <button
                    key={kind}
                    onClick={() => toggleKind(kind)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold cursor-pointer transition-all border ${
                      activeKinds.has(kind)
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-white/3 border-white/10 text-muted-foreground"
                    }`}
                  >
                    {KIND_LABEL[kind] ?? kind}
                    <span className="opacity-60">
                      ({kindMap[kind]?.length ?? 0})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </GlassCard>

        {/* ---- 5. Tu red ---- */}
        <GlassCard>
          <button
            className="w-full flex items-center justify-between p-4 cursor-pointer text-left"
            onClick={() => toggleSection("red")}
          >
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold text-sm">Tu red</span>
            </div>
            {openSections.red ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          {openSections.red && (
            <div className="px-4 pb-4 grid grid-cols-2 gap-2">
              {[
                {
                  href: "/network",
                  label: "Red Social",
                  sub: "Nodo holográfico",
                  color: "#38bdf8",
                  icon: Network,
                },
                {
                  href: "/hub",
                  label: "Hub",
                  sub: "Comunidades",
                  color: "#7FD1AE",
                  icon: BookOpen,
                },
                {
                  href: "/agent",
                  label: "Agente IA",
                  sub: "Exocórtex",
                  color: "#FF6B9D",
                  icon: Bot,
                },
                {
                  href: "/library",
                  label: "Biblioteca",
                  sub: "Conocimiento",
                  color: "#FFD166",
                  icon: BookOpen,
                },
              ].map(({ href, label, sub, color, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex flex-col gap-1 p-3 rounded-xl border transition-all cursor-pointer group"
                  style={{
                    borderColor: color + "33",
                    background: color + "0a",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      className="w-4 h-4 transition-transform group-hover:scale-110"
                      style={{ color }}
                    />
                    <span
                      className="text-xs font-semibold"
                      style={{ color }}
                    >
                      {label}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{sub}</p>
                </Link>
              ))}
            </div>
          )}
        </GlassCard>

        {/* ---- 6. Ajustes ---- */}
        <GlassCard>
          <button
            className="w-full flex items-center justify-between p-4 cursor-pointer text-left"
            onClick={() => toggleSection("ajustes")}
          >
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Ajustes</span>
            </div>
            {openSections.ajustes ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          {openSections.ajustes && (
            <div className="px-4 pb-4 space-y-4">
              {/* Rotación auto */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">Rotación automática</p>
                  <p className="text-[10px] text-muted-foreground">
                    Órbita continua de la cámara
                  </p>
                </div>
                <Switch
                  checked={rotacion}
                  onCheckedChange={setRotacion}
                />
              </div>

              {/* Etiquetas */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">Etiquetas visibles</p>
                  <p className="text-[10px] text-muted-foreground">
                    Muestra nombres de nodos
                  </p>
                </div>
                <Switch
                  checked={etiquetas}
                  onCheckedChange={setEtiquetas}
                />
              </div>

              {/* Densidad */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">Densidad de partículas</p>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {densidad[0]}%
                  </span>
                </div>
                <Slider
                  value={densidad}
                  onValueChange={setDensidad}
                  min={10}
                  max={100}
                  step={5}
                  className="w-full"
                />
              </div>

              <p className="text-[9px] text-muted-foreground/40 pt-1">
                Algunos ajustes son cosméticos hasta la próxima iteración del motor 3D.
              </p>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
