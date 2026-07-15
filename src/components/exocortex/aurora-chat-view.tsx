"use client";

/**
 * StarSeed OS — Exocórtex · Vista compartida del chat de Aurora
 * ----------------------------------------------------------------------------
 * Componente PRESENTACIONAL reutilizado por:
 *   · el panel normal de `aurora-chat-section.tsx` (modo compacto), y
 *   · el overlay a pantalla completa `aurora-chat-fullscreen.tsx` (2 columnas).
 *
 * NO instancia el motor ni duplica la lógica de Aurora: recibe TODO por props
 * (estado + handlers) desde la sección, que sigue siendo la única dueña del
 * cableado con `useAurora()` / el puente. Aquí vive:
 *   · el ÁRBOL DE CONTEXTOS (sangría por nivel, líneas de rama, iconos,
 *     "Ramificar aquí", "Nuevo contexto raíz", renombrar, archivar), y
 *   · la CONVERSACIÓN (burbujas en vivo o de un contexto/sesión cargada),
 *     entrada + envío, transporte de voz, registro de acciones.
 *
 * Estilo cristal-líquido con los colores del orbe (clases .axc-*), definido en
 * la sección; aquí sólo añadimos unas pocas clases .axc-tree-* para el árbol
 * (inyectadas por la sección junto al resto del CSS).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive, ChevronDown, ChevronRight, GitBranch, History, ListChecks, MessageSquare,
  Paperclip, Pause, Pencil, Play, Plus, Send, SkipBack, SkipForward, Square, X,
  Settings2, Activity, HardDrive, Terminal, Bot, Sparkles, Network, Menu
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuroraChatLogEntry } from "@/lib/aurora/aurora-chat-log";
import type { ChatContext, UseChatTree } from "@/lib/aurora/chat-tree";
import type { AuroraMessageMeta } from "@/lib/aurora/engine";
import { MessageRenderer } from "@/components/aurora/message-renderer";
import { RouteChip } from "@/components/aurora/route-chip";
// Menú contextual (clic derecho / long-press) + modal "Ver proceso" de un
// mensaje — Adenda "Aurora siempre responde" (jul-2026). Reutiliza el mismo
// hook de disparo (x,y) que el Finder de Bibliotecas.
import { useContextTrigger } from "@/components/library/finder/use-context-trigger";
import { MessageContextMenu, type ChatMessagePayload } from "@/components/aurora/message-context-menu";
import { MessageProcessModal } from "@/components/aurora/message-process-modal";
// Subida universal de archivos (Adenda 64 §9): el composer de Aurora solo
// maneja TEXTO (el motor no tiene concepto de adjuntos estructurados) — el
// botón de adjuntar sube el archivo e inserta su enlace en el draft; Aurora lo
// recibe como texto normal y MessageRenderer/MessageMedia ya sabe mostrar
// imágenes/audio/vídeo/PDF a partir de una URL dentro del mensaje.
import { AttachFilePickerButton } from "@/components/files/universal-file-picker";
import type { UniversalAttachment } from "@/lib/files/os-files";
import { MessageActionBar } from "@/components/aurora/message-action-bar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { listPersonalityProfiles } from "@/lib/aurora/personalities";

// ── Tipos de props ───────────────────────────────────────────────────────────
/** Un mensaje "en vivo" del motor (conversation lleva `.at`). */
export interface LiveMessage {
  role: "user" | "aurora";
  text: string;
  at?: number;
  /** (Aditivo) Metadatos de proceso de esta respuesta — solo Aurora los lleva. */
  meta?: AuroraMessageMeta;
}

/** Una acción ejecutada por Aurora (para el registro breve del chat). */
export interface ActionItem {
  name: string;
  ok: boolean;
  message: string;
}

/** Sesión/contexto cargado desde el registro (solo lectura de ese día). */
export interface LoadedSession {
  day: string;
  entries: AuroraChatLogEntry[];
  /** Etiqueta legible (día o contexto). */
  label?: string;
}

export interface AuroraChatViewProps {
  // ── Presentación / identidad ──
  auroraName: string;
  /** true → layout de 2 columnas (árbol fijo a la izquierda). Para fullscreen. */
  twoColumn?: boolean;
  /** Fuerza el árbol abierto (fullscreen) o lo deja plegable (panel normal). */
  treeAlwaysOpen?: boolean;
  className?: string;

  // ── Estado de la conversación ──
  /** Conversación EN VIVO ya filtrada por la frontera de "Nuevo chat". */
  visibleConvo: LiveMessage[];
  /** Transcripción parcial (interim) en vivo. */
  interim?: string;
  /** Contexto/sesión cargada del registro (solo lectura), o null. */
  loadedSession?: LoadedSession | null;
  /** Acciones recientes (para el bloque "Acciones"). */
  actionLog?: ActionItem[];
  /** ¿Aurora está hablando (pausable)? Para el transporte. */
  paused?: boolean;

  // ── Entrada ──
  draft: string;
  setDraft: (v: string) => void;
  onSubmitDraft: () => void;
  /** Salir de la sesión cargada y volver al chat en vivo. */
  onExitLoadedSession?: () => void;
  /** Adjuntos entregados por el selector universal (dispositivo/bibliotecas/neuronas), ya subidos con URL real. Opcional: sin este prop, no se muestra el botón de adjuntar. */
  onAttachFile?: (attachments: UniversalAttachment[]) => void;

  // ── Transporte de voz ──
  onPause: () => void;
  onResume: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  onInterrupt: () => void;

  // ── Árbol de contextos ──
  tree: UseChatTree;
  /** Abrir un contexto (carga su conversación cruzando timestamps con el log). */
  onOpenContext: (id: string) => void;
  /** Formatea un timestamp a HH:MM. */
  fmtTime: (ts?: number) => string;
  /** Formatea un día YYYY-MM-DD a etiqueta legible. */
  dayLabel: (day: string) => string;

  /** (fullscreen) Cerrar el overlay — muestra la X de cierre en la cabecera. */
  onClose?: () => void;

  // ── Menú contextual de mensajes (clic derecho / long-press) ──
  /** Crea una rama nueva con el historial hasta el mensaje elegido (incluido) y la abre. Sin este prop, la opción no se muestra. */
  onBranchFromMessage?: (history: { role: "user" | "aurora"; text: string; ts: number }[], label: string) => void;
  /** Reenvía el mensaje de usuario anterior a la respuesta elegida, opcionalmente forzando fuente/modelo. Sin este prop, no hay submenú "Reintentar". */
  onRetryMessage?: (userText: string, forceSource?: { sourceId: string; modelId: string }) => void;
}

// ── Nodo del árbol (recursivo, con sangría + línea de rama) ──────────────────
interface TreeNodeProps {
  ctx: ChatContext;
  depth: number;
  tree: UseChatTree;
  onOpenContext: (id: string) => void;
}

function TreeNode({ ctx, depth, tree, onOpenContext }: TreeNodeProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(ctx.title);
  const [selectedAgentId, setSelectedAgentId] = useState('agent-core');
  const children = tree.childrenOf(ctx.id);
  const hasChildren = children.length > 0;
  const isActive = tree.activeId === ctx.id;

  const commitRename = useCallback(() => {
    const t = draftTitle.trim();
    if (t && t !== ctx.title) tree.rename(ctx.id, t);
    setEditing(false);
  }, [draftTitle, ctx.id, ctx.title, tree]);

  return (
    <div className="axc-tree-node" style={{ ["--tree-depth" as string]: String(depth) }}>
      <div className={cn("axc-tree-row", isActive && "active")}>
        {/* Guía visual de rama: iconos + sangría según profundidad */}
        <span className="axc-tree-branch" aria-hidden>
          {depth > 0 && <GitBranch className="h-3 w-3" />}
        </span>

        {/* Plegar/desplegar hijos (si los hay) */}
        {hasChildren ? (
          <button
            type="button"
            className="axc-tree-caret"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Mostrar ramas" : "Ocultar ramas"}
            aria-label={collapsed ? "Mostrar ramas" : "Ocultar ramas"}
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="axc-tree-caret ghost" aria-hidden>
            <span className="axc-tree-dot" />
          </span>
        )}

        {/* Título (clic = abrir contexto) o edición inline */}
        {editing ? (
          <input
            autoFocus
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitRename(); }
              if (e.key === "Escape") { setDraftTitle(ctx.title); setEditing(false); }
            }}
            onBlur={commitRename}
            className="axc-tree-edit"
            aria-label="Renombrar contexto"
          />
        ) : (
          <button
            type="button"
            className="axc-tree-title"
            onClick={() => onOpenContext(ctx.id)}
            title="Abrir este contexto en la conversación"
          >
            <span className="axc-tree-titletext">{ctx.title}</span>
            {hasChildren && <span className="axc-tree-count">{children.length}</span>}
          </button>
        )}

        {/* Acciones del nodo: ramificar · renombrar · archivar */}
        <div className="axc-tree-actions">
          <button
            type="button"
            className="axc-tree-act"
            onClick={() => tree.branchFrom(ctx.id)}
            title="Ramificar aquí (crear un contexto hijo)"
            aria-label="Ramificar aquí"
          >
            <GitBranch className="h-3 w-3" />
          </button>
          <button
            type="button"
            className="axc-tree-act"
            onClick={() => { setDraftTitle(ctx.title); setEditing(true); }}
            title="Renombrar"
            aria-label="Renombrar contexto"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            className="axc-tree-act danger"
            onClick={() => tree.archive(ctx.id, true)}
            title="Archivar (se oculta; no se borra)"
            aria-label="Archivar contexto"
          >
            <Archive className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Hijos (recursión) — con línea vertical de rama */}
      {hasChildren && !collapsed && (
        <div className="axc-tree-children">
          {children.map((child) => (
            <TreeNode
              key={child.id}
              ctx={child}
              depth={depth + 1}
              tree={tree}
              onOpenContext={onOpenContext}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Panel del árbol de contextos ─────────────────────────────────────────────
interface TreePanelProps {
  tree: UseChatTree;
  onOpenContext: (id: string) => void;
}

function TreePanel({ tree, onOpenContext }: TreePanelProps) {
  const [showArchived, setShowArchived] = useState(false);

  return (
    <div className="axc-tree">
      <div className="axc-tree-head">
        <div className="axc-label flex items-center gap-1.5">
          <GitBranch className="h-3 w-3 text-[#7fb8ff]" />
          Contextos
        </div>
        <button
          type="button"
          className="axc-btn azure axc-tree-new"
          onClick={() => tree.create()}
          title="Crear un contexto raíz nuevo"
        >
          <Plus className="h-3.5 w-3.5" /> Nuevo raíz
        </button>
      </div>

      <div className="axc-scroll axc-tree-body">
        {tree.roots.length === 0 ? (
          <div className="axc-tree-empty">
            <GitBranch className="h-5 w-5 text-white/25" />
            <p className="text-[11px] leading-relaxed text-white/45">
              Aún no hay contextos. Crea uno raíz y <strong>ramifica</strong> desde él para
              separar temas de conversación. Cada rama guarda su propio hilo.
            </p>
            <button type="button" className="axc-btn lime" onClick={() => tree.create()}>
              <Plus className="h-3.5 w-3.5" /> Crear el primero
            </button>
          </div>
        ) : (
          tree.roots.map((root) => (
            <TreeNode
              key={root.id}
              ctx={root}
              depth={0}
              tree={tree}
              onOpenContext={onOpenContext}
            />
          ))
        )}

        {/* Archivo (contextos archivados) */}
        {tree.archived.length > 0 && (
          <div className="axc-tree-archive">
            <button
              type="button"
              className="axc-tree-archtoggle"
              onClick={() => setShowArchived((v) => !v)}
              title={showArchived ? "Ocultar archivados" : "Ver archivados"}
            >
              <Archive className="h-3 w-3" />
              Archivados
              <span className="axc-tree-count">{tree.archived.length}</span>
              <ChevronDown
                className={cn("h-3 w-3 transition-transform", showArchived && "rotate-180")}
              />
            </button>
            {showArchived && (
              <div className="axc-tree-archlist">
                {tree.archived.map((c) => (
                  <div key={c.id} className="axc-tree-archrow">
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                    <button
                      type="button"
                      className="axc-tree-act"
                      onClick={() => tree.archive(c.id, false)}
                      title="Desarchivar"
                      aria-label="Desarchivar contexto"
                    >
                      <History className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <p className="axc-tree-foot">
        El contexto se comparte con <strong>AI Studio</strong> — abre el mismo hilo en{" "}
        <a
          href="https://aistudio.google.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#7fb8ff] hover:underline"
        >
          AI Studio
        </a>
        .
      </p>
    </div>
  );
}

// ── Transporte de voz (compartido) ───────────────────────────────────────────
function Transport(props: {
  paused?: boolean;
  onPause: () => void;
  onResume: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  onInterrupt: () => void;
}) {
  const { paused, onPause, onResume, onSkipBack, onSkipForward, onInterrupt } = props;
  return (
    <div className="relative z-[1] flex items-center justify-center gap-1.5 rounded-[16px] border border-white/10 bg-white/[0.03] px-2 py-2">
      <button onClick={onSkipBack} title="Retroceder a la respuesta anterior" className="axc-tbtn">
        <SkipBack className="h-4 w-4" />
      </button>
      {paused ? (
        <button onClick={onResume} title="Reanudar la voz" className="axc-tbtn primary">
          <Play className="h-4 w-4" />
        </button>
      ) : (
        <button onClick={onPause} title="Pausar la voz" className="axc-tbtn primary">
          <Pause className="h-4 w-4" />
        </button>
      )}
      <button onClick={onInterrupt} title="Interrumpir a Aurora" className="axc-tbtn danger">
        <Square className="h-4 w-4" />
      </button>
      <button onClick={onSkipForward} title="Adelantar a la respuesta siguiente" className="axc-tbtn">
        <SkipForward className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Línea de "proceso" sutil y expandible bajo una respuesta de Aurora ───────
function ProcessLine({ meta, onOpenFull }: { meta: AuroraMessageMeta; onOpenFull: () => void }) {
  const [open, setOpen] = useState(false);
  const toolCount = meta.tools?.length ?? 0;
  const summary = [
    meta.local ? "respuesta local" : meta.provider || null,
    typeof meta.ms === "number" ? `${meta.ms} ms` : null,
    toolCount ? `${toolCount} herramienta${toolCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" · ");
  if (!summary) return null;

  return (
    <div className="axc-process">
      <button
        type="button"
        className="axc-process-toggle"
        onClick={() => setOpen((v) => !v)}
        title="Ver el proceso de esta respuesta"
      >
        <span className="axc-process-dot" aria-hidden />
        proceso · {summary}
        {open ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
      </button>
      {open && (
        <div className="axc-process-detail">
          {meta.reason && <p>{meta.reason}</p>}
          {meta.tools?.map((t, i) => (
            <div key={`${t.name}-${i}`} className="axc-process-tool">
              <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", t.ok ? "bg-[#39FF14]" : "bg-[#FFBF00]")} />
              <span className="min-w-0 flex-1">{t.name} — {t.summary}</span>
            </div>
          ))}
          <button type="button" className="axc-process-link" onClick={onOpenFull}>
            Ver proceso completo
          </button>
        </div>
      )}
    </div>
  );
}

// ── Conversación (en vivo o sesión cargada) ──────────────────────────────────
function Conversation(props: {
  auroraName: string;
  visibleConvo: LiveMessage[];
  interim?: string;
  loadedSession?: LoadedSession | null;
  fmtTime: (ts?: number) => string;
  fill?: boolean;
  onBranchFromMessage?: (history: { role: "user" | "aurora"; text: string; ts: number }[], label: string) => void;
  onRetryMessage?: (userText: string, forceSource?: { sourceId: string; modelId: string }) => void;
}) {
  const {
    auroraName, visibleConvo, interim, loadedSession, fmtTime, fill,
    onBranchFromMessage, onRetryMessage,
  } = props;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Menú contextual (clic derecho / long-press) — un solo disparador para toda
  // la conversación (vivo o cargada); el payload lleva el mensaje concreto.
  const { menu, bind, close } = useContextTrigger<ChatMessagePayload>();
  const [process, setProcess] = useState<{ open: boolean; meta?: AuroraMessageMeta }>({ open: false });
  const openProcess = useCallback((meta: AuroraMessageMeta | undefined) => setProcess({ open: true, meta }), []);

  // Auto-scroll al fondo cuando cambia el contenido en vivo.
  const convoLen = visibleConvo.length;
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (loadedSession) return;
    const el = scrollRef.current;
    if (el) {
      try { el.scrollTop = el.scrollHeight; } catch { /* */ }
    }
  }, [convoLen, interim, loadedSession]);

  return (
    <div
      ref={scrollRef}
      className={cn(
        "axc-scroll relative z-[1] flex flex-col gap-2 overflow-y-auto rounded-[18px] border border-white/10 bg-black/40 px-3 py-2.5",
        fill ? "flex-1 min-h-0" : "h-64",
      )}
    >
      {loadedSession ? (
        loadedSession.entries.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-white/40">
            Este contexto aún no tiene mensajes.
          </div>
        ) : (
          loadedSession.entries.map((m, i) => (
            <div
              key={`${m.ts}-${i}`}
              className={cn("axc-msg", m.role === "user" ? "user" : "aurora")}
              {...bind({
                role: m.role,
                text: m.text,
                ts: m.ts,
                meta: m.meta,
                history: loadedSession.entries
                  .slice(0, i + 1)
                  .map((e) => ({ role: e.role, text: e.text, ts: e.ts })),
              })}
            >
              <div className="axc-role">
                {m.role === "user" ? "Tú" : auroraName} · {fmtTime(m.ts)}
              </div>
              {/* Renderizador universal: markdown, código, tablas, JSON, SVG,
                  imágenes/vídeo/audio/PDF/3D/CSV… del mensaje */}
              <MessageRenderer text={m.text} compact={m.role === "user"} />
              {m.role === "aurora" && m.meta && (
                <ProcessLine meta={m.meta} onOpenFull={() => openProcess(m.meta)} />
              )}
            </div>
          ))
        )
      ) : visibleConvo.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
          <History className="h-6 w-6 text-white/20 mb-2" />
          <div className="text-xs leading-relaxed text-white/50 max-w-sm">
            Aquí verás tu conversación con {auroraName}. Háblale desde el orbe, usa la
            barra de arriba o escríbele abajo: tiene control total del OS y sigue activa
            en segundo plano.
          </div>
        </div>
      ) : (
        visibleConvo.map((m, i) => (
          <div
            key={i}
            className={cn("axc-msg", m.role === "user" ? "user" : "aurora")}
            {...bind({
              role: m.role,
              text: m.text,
              ts: m.at ?? Date.now(),
              meta: m.meta,
              history: visibleConvo
                .slice(0, i + 1)
                .map((e) => ({ role: e.role, text: e.text, ts: e.at ?? 0 })),
            })}
          >
            <div className="axc-role">{m.role === "user" ? "Tú" : auroraName}</div>
            {/* Renderizador universal: markdown, código, tablas, JSON, SVG,
                imágenes/vídeo/audio/PDF/3D/CSV… del mensaje */}
            {(() => {
              let displayText = m.text;
              let extraInfo: string | undefined = undefined;
              if (m.role === "aurora") {
                const regex = /(?:\n\s*(?:—|-|_)*\s*\*?(?:Modelo utilizado|Modelo usado|Modelo:|Modelo actual):?[\s\S]*)$/i;
                const match = displayText.match(regex);
                if (match) {
                  extraInfo = match[0].trim();
                  displayText = displayText.substring(0, match.index).trim();
                }
              }
              const enhancedMeta = m.meta || extraInfo ? { ...m.meta, modelText: extraInfo } : undefined;
              return (
                <div className="group relative">
                  <MessageRenderer text={displayText} compact={m.role === "user"} />
                  <MessageActionBar
                    payload={{
                      role: m.role,
                      text: m.text,
                      ts: m.at ?? Date.now(),
                      meta: enhancedMeta,
                      history: visibleConvo.slice(0, i + 1).map((e) => ({ role: e.role, text: e.text, ts: e.at ?? 0 })),
                    }}
                    onBranchFromMessage={onBranchFromMessage}
                    onRetryMessage={onRetryMessage}
                    onViewProcess={openProcess}
                  />
                  {m.role === "aurora" && enhancedMeta && (
                    <ProcessLine meta={enhancedMeta} onOpenFull={() => openProcess(enhancedMeta)} />
                  )}
                </div>
              );
            })()}
          </div>
        ))
      )}
      {!loadedSession && interim && (
        <div className="axc-msg user interim">
          <div className="axc-role">Tú</div>
          {interim}
        </div>
      )}

      {menu && (
        <MessageContextMenu
          x={menu.x}
          y={menu.y}
          payload={menu.payload}
          onClose={close}
          onBranchFromMessage={onBranchFromMessage}
          onRetryMessage={onRetryMessage}
          onViewProcess={openProcess}
        />
      )}
      <MessageProcessModal
        open={process.open}
        meta={process.meta}
        onOpenChange={(o) => setProcess((p) => ({ ...p, open: o }))}
      />
    </div>
  );
}

// ── Vista principal ──────────────────────────────────────────────────────────
export function AuroraChatView(props: AuroraChatViewProps) {
  const [selectedAgentId, setSelectedAgentId] = useState('agent-core');
  const {
    auroraName, twoColumn, className,
    visibleConvo, interim, loadedSession, actionLog = [], paused,
    draft, setDraft, onSubmitDraft, onExitLoadedSession, onAttachFile,
    onPause, onResume, onSkipBack, onSkipForward, onInterrupt,
    tree, onOpenContext, fmtTime, dayLabel, onClose,
    onBranchFromMessage, onRetryMessage,
  } = props;

  const [treeOpen, setTreeOpen] = useState(false);
  const activeCtx = tree.activeId ? tree.contextById(tree.activeId) : undefined;

  // Bloque conversación + entrada + transporte + acciones (reutilizado).
  const conversationBlock = (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-2.5", twoColumn && "axc-convo-col")}>
      <Transport
        paused={paused}
        onPause={onPause}
        onResume={onResume}
        onSkipBack={onSkipBack}
        onSkipForward={onSkipForward}
        onInterrupt={onInterrupt}
      />

      {/* Banner de contexto/sesión cargada (solo lectura) */}
      {loadedSession && (
        <div className="relative z-[1] flex items-center gap-2 rounded-[14px] border border-[#39FF14]/30 bg-[#39FF14]/10 px-3 py-2">
          <History className="h-3.5 w-3.5 shrink-0 text-[#39FF14]" />
          <span className="min-w-0 flex-1 truncate text-[11px] text-white/75">
            <span className="font-medium text-white/90 first-letter:uppercase">
              {loadedSession.label ?? dayLabel(loadedSession.day)}
            </span>{" "}
            · {loadedSession.entries.length} mensajes
          </span>
          {onExitLoadedSession && (
            <button onClick={onExitLoadedSession} className="axc-btn lime shrink-0" title="Volver al chat en vivo">
              <MessageSquare className="h-3.5 w-3.5" /> En vivo
            </button>
          )}
        </div>
      )}

      <div className="relative z-[2] mb-2 flex items-center justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="bg-black/40 border-white/10 text-white/70 hover:bg-white/10 hover:text-white rounded-full">
              <Settings2 className="w-3.5 h-3.5 mr-2" />
              Opciones de Aurora
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 bg-black/90 backdrop-blur-xl border border-cyan-500/20 text-cyan-50">
            <DropdownMenuLabel className="text-xs text-cyan-500/70 font-mono">Personalidades</DropdownMenuLabel>
            {listPersonalityProfiles().map(p => (
              <DropdownMenuItem 
                key={p.id}
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("starseed:inject-chat", {
                      detail: { text: `Activa la personalidad ${p.name}` }
                    })
                  );
                }}
                className="hover:bg-cyan-500/20 cursor-pointer text-xs"
              >
                <Bot className="w-3.5 h-3.5 mr-2 text-cyan-400" />
                {p.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator className="bg-cyan-500/20" />
            <DropdownMenuLabel className="text-xs text-cyan-500/70 font-mono">Habilidades & Sentidos</DropdownMenuLabel>
            <DropdownMenuItem 
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent("starseed:inject-chat", {
                    detail: { text: "Revisar mis sentidos y conexiones activas" }
                  })
                );
              }}
              className="hover:bg-cyan-500/20 cursor-pointer text-xs"
            >
              <Activity className="w-3.5 h-3.5 mr-2 text-emerald-400" />
              Estado del Sistema
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent("starseed:inject-chat", {
                    detail: { text: "Analizar los logs recientes del sistema" }
                  })
                );
              }}
              className="hover:bg-cyan-500/20 cursor-pointer text-xs"
            >
              <Terminal className="w-3.5 h-3.5 mr-2 text-amber-400" />
              Ver Logs del Sistema
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Conversation
        auroraName={auroraName}
        visibleConvo={visibleConvo}
        interim={interim}
        loadedSession={loadedSession}
        fmtTime={fmtTime}
        fill={twoColumn}
        onBranchFromMessage={onBranchFromMessage}
        onRetryMessage={onRetryMessage}
      />

      {/* Entrada + envío */}
      <div className="axc-inputrow relative z-[1]">
        {onAttachFile && (
          <AttachFilePickerButton
            onPick={(picked: UniversalAttachment[]) => {
              const links = picked
                .filter((a) => !!a.url)
                .map((a) => a.url as string)
                .join(" ");
              if (links) setDraft(draft ? `${draft} ${links}` : links);
              onAttachFile(picked);
            }}
            folder="aurora"
            title="Adjuntar archivo"
            className="axc-tbtn shrink-0"
          >
            <Paperclip className="h-4 w-4" />
          </AttachFilePickerButton>
        )}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (loadedSession && onExitLoadedSession) onExitLoadedSession();
              onSubmitDraft();
            }
          }}
          placeholder={loadedSession ? "Escribe para continuar en el chat en vivo…" : "Escribe o pídele que abra/haga algo…"}
          className="axc-input"
        />
        <button
          onClick={() => {
            if (loadedSession && onExitLoadedSession) onExitLoadedSession();
            onSubmitDraft();
          }}
          disabled={!draft.trim()}
          title="Enviar"
          className="axc-send"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      {/* Registro breve de acciones */}
      {actionLog.length > 0 && (
        <div className="axc-card relative z-[1] px-3.5 py-2.5">
          <div className="axc-label mb-1 flex items-center gap-1.5">
            <ListChecks className="h-3 w-3" /> Acciones
          </div>
          <div className="axc-scroll max-h-24 space-y-1 overflow-y-auto">
            {actionLog.slice(-6).reverse().map((a, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px] leading-snug">
                <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", a.ok ? "bg-[#39FF14]" : "bg-[#FFBF00]")} />
                <span className="text-white/60">
                  <span className="font-medium text-white/80">{a.name}</span> · {a.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ── Layout de 2 columnas (fullscreen desktop): árbol | conversación ──
  if (twoColumn) {
    return (
      <div className={cn("axc-view-2col", className)}>
        <aside className="axc-view-tree">
          <TreePanel tree={tree} onOpenContext={onOpenContext} />
        </aside>
        <section className="axc-view-main">
          {/* Cabecera de la columna de conversación (contexto activo + cerrar) */}
          <div className="axc-view-mainhead">
            <div className="min-w-0 flex-1">
              <div className="axc-label">Conversación</div>
              <div className="truncate text-sm font-medium text-white/85">
                {activeCtx ? activeCtx.title : loadedSession ? (loadedSession.label ?? dayLabel(loadedSession.day)) : "Chat en vivo"}
              </div>
            </div>
            <div className="flex-1 px-4"><ChatHeaderOptions /></div>
            <RouteChip compact className="shrink-0" />
            {activeCtx && (
              <button
                className="axc-btn azure shrink-0"
                onClick={() => tree.branchFrom(activeCtx.id)}
                title="Ramificar desde el contexto activo"
              >
                <GitBranch className="h-3.5 w-3.5" /> Ramificar
              </button>
            )}
            {onClose && (
              <button
                className="axc-btn crimson shrink-0"
                onClick={onClose}
                title="Cerrar pantalla completa (Esc)"
                aria-label="Cerrar pantalla completa"
              >
                <X className="h-3.5 w-3.5" /> Cerrar
              </button>
            )}
          </div>
          {conversationBlock}
        </section>
      </div>
    );
  }

  // ── Layout compacto (panel normal): árbol desplegable arriba ──
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {/* Barra: desplegar árbol de contextos + ramificar el activo */}
      <div className="relative z-[1] flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTreeOpen((v) => !v)}
          className={cn("axc-btn", treeOpen ? "lime" : "azure")}
          title="Mostrar u ocultar el árbol de contextos de conversación"
        >
          <GitBranch className="h-3.5 w-3.5" /> Contextos
          {tree.contexts.length > 0 && (
            <span className="ml-0.5 rounded-full bg-white/15 px-1.5 py-0.5 font-mono text-[9px] leading-none">
              {tree.contexts.length}
            </span>
          )}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", treeOpen && "rotate-180")} />
        </button>
        <button
          type="button"
          onClick={() => tree.create()}
          className="axc-btn"
          title="Crear un contexto raíz nuevo"
        >
          <Plus className="h-3.5 w-3.5" /> Nuevo contexto
        </button>
        {activeCtx && (
          <button
            type="button"
            onClick={() => tree.branchFrom(activeCtx.id)}
            className="axc-btn"
            title={`Ramificar desde «${activeCtx.title}»`}
          >
            <GitBranch className="h-3.5 w-3.5" /> Ramificar aquí
          </button>
        )}
        {activeCtx && (
          <span className="axc-tree-activechip" title="Contexto activo">
            <GitBranch className="h-3 w-3" />
            {activeCtx.title}
          </span>
        )}
        <div className="flex-1 ml-4"><ChatHeaderOptions /></div>
        <RouteChip compact className="shrink-0" />
      </div>

      {/* Árbol desplegable */}
      {treeOpen && (
        <div className="axc-card relative z-[1] overflow-hidden">
          <TreePanel tree={tree} onOpenContext={onOpenContext} />
        </div>
      )}

      {conversationBlock}
    </div>
  );
}

export default AuroraChatView;
