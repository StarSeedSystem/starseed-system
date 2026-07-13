"use client";

/**
 * StarSeed OS — Exocórtex · Explorador de chats de Aurora (folder completo)
 * ----------------------------------------------------------------------------
 * VISTA PRINCIPAL fusionada de la sección Aurora:
 *
 *   1) BARRA SUPERIOR ÚNICA (buscar ⇄ chatear): un solo input que sirve tanto
 *      para PREGUNTAR A AURORA (send()) como para BUSCAR recursos en la red
 *      (universalSearch) y dentro de los propios chats. Conmutador claro
 *      "Preguntar / Buscar"; el botón de buscar TAMBIÉN invoca a Aurora.
 *
 *   2) EXPLORADOR TIPO FOLDER con dos EJES conmutables:
 *        · por FECHA  → Hoy / Ayer / Esta semana / por mes.
 *        · por TEMA   → un folder por categoría (categorización automática).
 *      Navegable, plegable, buscable y claro. Cada chat muestra su categoría,
 *      nº de mensajes, franja horaria y acciones: abrir, guardar en memorias,
 *      duplicar, interconectar.
 *
 *   3) Al abrir un chat, se carga su CONTEXTO en la vista compartida
 *      `AuroraChatView` (misma que el resto de la sección — no se duplica la
 *      lógica del chat). Si el chat es un contexto del árbol, se fija como activo.
 *
 * Reutiliza: useChatCatalog (log+árbol+categoría), useChatTree (ramificación),
 * universalSearch (red), y AuroraChatView (conversación). SSR-safe, defensivo,
 * estilo Crystal Liquid Glass (clases .axc-* de la sección + .axe-* propias),
 * responsive y con reduced-motion.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines, CalendarDays, Coffee, Copy, Cpu, FolderTree,
  GitBranch, GraduationCap, Heart, Landmark, Link2, Loader2, MessageSquare,
  Save, Search, Send, Sparkles, Tags, X, Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useChatCatalog,
  groupByDate as groupDate,
  groupByCategory as groupCat,
  type CatalogChat,
  type CategoryBucket,
  type DateBucket,
} from "@/lib/aurora/chat-catalog";
import { categoryDef, type ChatCategoryId } from "@/lib/aurora/chat-auto-categorize";
import type { UseChatTree } from "@/lib/aurora/chat-tree";
import {
  universalSearch,
  emptyResults,
  type UniversalSearchResults,
  type SearchCategoryKey,
} from "@/lib/search/universal-search";

// ── Resolución de iconos de categoría (nombre → componente lucide) ───────────
const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Cpu, Wand2, Landmark, Coffee, AudioLines, GraduationCap, Heart, MessageSquare,
};
function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Ico = CATEGORY_ICONS[name] ?? MessageSquare;
  return <Ico className={className} />;
}

// ── CSS propio del explorador (prefijo .axe-*) — complementa .axc-* ──────────
const AXE_CSS = `
.axe-root{display:flex;flex-direction:column;gap:12px;min-height:0;}
.axe-axis{display:inline-flex;gap:4px;padding:4px;border-radius:14px;
  background:rgba(2,4,10,.6);border:1px solid rgba(148,163,184,.14);}
.axe-axis-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:10px;cursor:pointer;
  border:0;background:transparent;color:rgba(226,232,240,.66);font-size:11px;font-weight:600;
  transition:background .18s, color .18s;}
.axe-axis-btn:hover{color:#fff;}
.axe-axis-btn[data-active="true"]{color:#05070d;background:linear-gradient(120deg,#007FFF,#39FF14);}
.axe-folder{border-radius:16px;border:1px solid rgba(148,163,184,.12);overflow:hidden;
  background:linear-gradient(180deg, rgba(148,163,184,.05), rgba(15,23,42,.32));}
.axe-folder+.axe-folder{margin-top:8px;}
.axe-folder-head{display:flex;align-items:center;gap:9px;width:100%;cursor:pointer;text-align:left;
  border:0;background:transparent;color:#eef2ff;padding:10px 12px;transition:background .18s;}
.axe-folder-head:hover{background:rgba(148,163,184,.06);}
.axe-folder-ico{flex:none;display:grid;place-items:center;width:30px;height:30px;border-radius:9px;
  border:1px solid rgba(148,163,184,.18);}
.axe-folder-title{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;}
.axe-folder-name{font-size:12.5px;font-weight:600;color:rgba(240,244,255,.92);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.axe-folder-hint{font-size:10px;color:rgba(148,163,184,.6);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.axe-folder-count{flex:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9px;
  padding:2px 8px;border-radius:999px;background:rgba(148,163,184,.16);color:rgba(226,232,240,.7);}
.axe-folder-body{border-top:1px solid rgba(148,163,184,.1);padding:6px;display:flex;flex-direction:column;gap:5px;}
.axe-chat{display:flex;align-items:center;gap:8px;padding:8px 9px;border-radius:12px;
  border:1px solid transparent;background:rgba(2,4,10,.35);transition:background .18s, border-color .18s;}
.axe-chat:hover{background:rgba(148,163,184,.08);border-color:rgba(148,163,184,.16);}
.axe-chat.linksel{border-color:rgba(255,191,0,.55);background:rgba(255,191,0,.1);}
.axe-chat-dot{flex:none;width:8px;height:8px;border-radius:50%;box-shadow:0 0 8px currentColor;}
.axe-chat-main{flex:1;min-width:0;cursor:pointer;border:0;background:transparent;text-align:left;padding:0;color:inherit;}
.axe-chat-title{font-size:12px;color:rgba(240,244,255,.9);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.axe-chat-title:hover{color:#fff;}
.axe-chat-sub{display:flex;align-items:center;gap:6px;margin-top:2px;font-size:9.5px;color:rgba(148,163,184,.6);}
.axe-chat-badge{display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:999px;
  font-size:9px;border:1px solid rgba(148,163,184,.2);}
.axe-chat-saved{color:#39FF14;}
.axe-chat-linked{color:#7fb8ff;}
.axe-chat-acts{flex:none;display:flex;align-items:center;gap:3px;opacity:0;transition:opacity .18s;}
.axe-chat:hover .axe-chat-acts,.axe-chat.linksel .axe-chat-acts{opacity:1;}
@media (hover:none){.axe-chat-acts{opacity:1;}}
.axe-act{display:grid;place-items:center;width:26px;height:26px;border-radius:8px;cursor:pointer;
  border:1px solid rgba(148,163,184,.16);background:rgba(148,163,184,.06);color:rgba(226,232,240,.7);
  transition:transform .16s, background .18s, color .18s, border-color .18s;}
.axe-act:hover{color:#fff;transform:translateY(-1px);}
.axe-act:active{transform:scale(.92);}
.axe-act.save:hover{background:rgba(57,255,20,.2);border-color:rgba(57,255,20,.45);color:#dcfce7;}
.axe-act.dup:hover{background:rgba(0,127,255,.2);border-color:rgba(0,127,255,.45);color:#dbeafe;}
.axe-act.link:hover{background:rgba(255,191,0,.2);border-color:rgba(255,191,0,.45);color:#fef3c7;}
.axe-empty{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;padding:26px 14px;
  color:rgba(148,163,184,.55);}
.axe-linkbar{display:flex;align-items:center;gap:8px;padding:9px 11px;border-radius:14px;
  border:1px solid rgba(255,191,0,.4);background:linear-gradient(120deg, rgba(255,191,0,.14), rgba(255,191,0,.04));}
.axe-results{display:flex;flex-direction:column;gap:8px;}
.axe-resgroup{border-radius:14px;border:1px solid rgba(148,163,184,.12);background:rgba(2,4,10,.4);overflow:hidden;}
.axe-resgroup-head{display:flex;align-items:center;gap:7px;padding:7px 11px;border-bottom:1px solid rgba(148,163,184,.1);
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:rgba(127,184,255,.75);}
.axe-reshit{display:flex;flex-direction:column;gap:1px;padding:7px 11px;text-decoration:none;color:inherit;transition:background .16s;}
.axe-reshit:hover{background:rgba(0,127,255,.1);}
.axe-reshit-label{font-size:12px;color:rgba(240,244,255,.9);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.axe-reshit-sub{font-size:9.5px;color:rgba(148,163,184,.6);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.axe-modehint{display:flex;align-items:center;gap:6px;font-size:10.5px;color:rgba(148,163,184,.62);padding:2px 2px;}
.axe-scroll{scrollbar-width:thin;scrollbar-color:rgba(0,127,255,.35) transparent;}
.axe-scroll::-webkit-scrollbar{width:8px;}
.axe-scroll::-webkit-scrollbar-thumb{background:rgba(0,127,255,.28);border-radius:99px;border:2px solid transparent;background-clip:padding-box;}
@media (prefers-reduced-motion: reduce){
  .axe-axis-btn,.axe-folder-head,.axe-chat,.axe-act,.axe-reshit{transition:none !important;}
  .axe-act:hover{transform:none;}
}
`;

// ── Etiquetas de las categorías de la búsqueda universal (red) ───────────────
const SEARCH_CAT_LABEL: Record<SearchCategoryKey, string> = {
  perfiles: "Perfiles",
  paginas: "Páginas",
  publicaciones: "Publicaciones",
  memorias: "Memorias",
  temas: "Temas",
  cerebros: "Cerebros",
  apps: "Apps",
  lienzos: "Lienzos",
};

// ── Props ────────────────────────────────────────────────────────────────────
export interface AuroraChatExplorerProps {
  /** Nombre visible de Aurora (para títulos de memoria / burbujas). */
  auroraName: string;
  /** Árbol de contextos (compartido con la sección) — para fijar el activo. */
  tree: UseChatTree;
  /** Envía texto a Aurora (send() del provider/puente). */
  onAskAurora: (text: string) => void | Promise<void>;
  /**
   * Abrir un chat del catálogo en la conversación: la sección reconstruye sus
   * mensajes y (si es contexto) lo fija activo. Recibe el chat proyectado.
   */
  onOpenChat: (chat: CatalogChat) => void;
  className?: string;
}

type Axis = "fecha" | "tema";
type BarMode = "chat" | "buscar";

// ── Fila de un chat dentro de un folder ────────────────────────────────────
function ChatRow(props: {
  chat: CatalogChat;
  auroraName: string;
  onOpen: (chat: CatalogChat) => void;
  onSave: (chat: CatalogChat) => void;
  onDuplicate: (chat: CatalogChat) => void;
  onLinkToggle: (chat: CatalogChat) => void;
  linkPending: string | null;
  savingId: string | null;
  fmtTime: (ts?: number) => string;
}) {
  const {
    chat, onOpen, onSave, onDuplicate, onLinkToggle, linkPending, savingId, fmtTime,
  } = props;
  const def = categoryDef(chat.category);
  const isLinkSel = linkPending === chat.id;
  const isSaving = savingId === chat.id;

  return (
    <div className={cn("axe-chat", isLinkSel && "linksel")}>
      <span className="axe-chat-dot" style={{ color: def.color }} aria-hidden />
      <button
        type="button"
        className="axe-chat-main"
        onClick={() => onOpen(chat)}
        title="Abrir este chat en la conversación"
      >
        <div className="axe-chat-title">{chat.title || def.label}</div>
        <div className="axe-chat-sub">
          <span>{def.label}</span>
          <span aria-hidden>·</span>
          <span>{chat.count} msg</span>
          {chat.startTs > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="font-mono">{fmtTime(chat.startTs)}</span>
            </>
          )}
          {chat.source === "context" && (
            <span className="axe-chat-badge" title="Es una rama/contexto del árbol">
              <GitBranch className="h-2.5 w-2.5" /> rama
            </span>
          )}
          {chat.savedMemoryId && (
            <span className="axe-chat-badge axe-chat-saved" title="Guardado en tus memorias">
              <Save className="h-2.5 w-2.5" /> memoria
            </span>
          )}
          {chat.linkedIds.length > 0 && (
            <span className="axe-chat-badge axe-chat-linked" title={`Interconectado con ${chat.linkedIds.length} chat(s)`}>
              <Link2 className="h-2.5 w-2.5" /> {chat.linkedIds.length}
            </span>
          )}
        </div>
      </button>
      <div className="axe-chat-acts">
        <button
          type="button"
          className="axe-act save"
          onClick={() => onSave(chat)}
          disabled={isSaving || !!chat.savedMemoryId}
          title={chat.savedMemoryId ? "Ya guardado en memorias" : "Guardar este chat en tus memorias"}
          aria-label="Guardar en memorias"
        >
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          className="axe-act dup"
          onClick={() => onDuplicate(chat)}
          title="Duplicar este chat (copia con id nuevo)"
          aria-label="Duplicar chat"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="axe-act link"
          onClick={() => onLinkToggle(chat)}
          title={
            linkPending
              ? isLinkSel
                ? "Cancelar interconexión"
                : "Interconectar con el chat seleccionado"
              : "Interconectar este chat con otro"
          }
          aria-label="Interconectar chat"
        >
          <Link2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Folder desplegable (fecha o tema) ───────────────────────────────────────
function Folder(props: {
  name: string;
  hint?: string;
  count: number;
  icon?: string;
  color?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const { name, hint, count, icon, color, defaultOpen, children } = props;
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="axe-folder">
      <button
        type="button"
        className="axe-folder-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={open ? "Contraer folder" : "Expandir folder"}
      >
        <span
          className="axe-folder-ico"
          style={color ? { color, borderColor: `${color}55` } : undefined}
          aria-hidden
        >
          {icon ? <CategoryIcon name={icon} className="h-4 w-4" /> : <CalendarDays className="h-4 w-4 text-[#7fb8ff]" />}
        </span>
        <span className="axe-folder-title">
          <span className="axe-folder-name">{name}</span>
          {hint && <span className="axe-folder-hint">{hint}</span>}
        </span>
        <span className="axe-folder-count">{count}</span>
      </button>
      {open && <div className="axe-folder-body">{children}</div>}
    </div>
  );
}

// ── Explorador principal ─────────────────────────────────────────────────────
export function AuroraChatExplorer(props: AuroraChatExplorerProps) {
  const { auroraName, tree, onAskAurora, onOpenChat, className } = props;
  const catalog = useChatCatalog();

  const [axis, setAxis] = useState<Axis>("fecha");
  const [barMode, setBarMode] = useState<BarMode>("chat");
  const [query, setQuery] = useState("");
  // Interconexión: id del primer chat elegido (esperando el segundo).
  const [linkPending, setLinkPending] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string>("");

  // Búsqueda en la red (universalSearch) — sólo en modo "buscar".
  const [netResults, setNetResults] = useState<UniversalSearchResults>(() => emptyResults());
  const [netLoading, setNetLoading] = useState(false);
  const searchSeq = useRef(0);

  const fmtTime = useCallback((ts?: number) => {
    if (!ts || !Number.isFinite(ts)) return "";
    try {
      return new Date(ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }, []);

  const flashMsg = useCallback((m: string) => {
    setFlash(m);
    if (typeof window !== "undefined") {
      window.setTimeout(() => setFlash((cur) => (cur === m ? "" : cur)), 2600);
    }
  }, []);

  // Filtro de chats por término (título/categoría/mensajes) — barato y local.
  const filteredChats = useMemo(
    () => (query.trim().length >= 2 ? catalog.search(query) : catalog.chats),
    [catalog, query],
  );

  const byDate: DateBucket[] = useMemo(
    () => catalog.chats === filteredChats ? catalog.byDate : groupDate(filteredChats),
    // catalog.byDate ya está memoizado sobre catalog.chats; si filtramos, reagrupamos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog.byDate, filteredChats, catalog.chats],
  );
  const byCategory: CategoryBucket[] = useMemo(
    () => catalog.chats === filteredChats ? catalog.byCategory : groupCat(filteredChats),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog.byCategory, filteredChats, catalog.chats],
  );

  // ── Búsqueda en la red al escribir en modo "buscar" (debounce) ─────────────
  useEffect(() => {
    if (barMode !== "buscar") {
      setNetResults(emptyResults());
      setNetLoading(false);
      return;
    }
    const term = query.trim();
    if (term.length < 2) {
      setNetResults(emptyResults());
      setNetLoading(false);
      return;
    }
    if (typeof window === "undefined") return;
    const seq = ++searchSeq.current;
    setNetLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const res = await universalSearch(term);
        if (seq === searchSeq.current) setNetResults(res);
      } catch {
        if (seq === searchSeq.current) setNetResults(emptyResults());
      } finally {
        if (seq === searchSeq.current) setNetLoading(false);
      }
    }, 320);
    return () => window.clearTimeout(t);
  }, [barMode, query]);

  // ── Barra única: enviar (preguntar a Aurora) o alternar a buscar ───────────
  const submitBar = useCallback(async () => {
    const t = query.trim();
    if (!t) return;
    // En modo chat: enviamos a Aurora y limpiamos el input. En modo buscar,
    // el listado en la red ya se refresca al escribir; "enviar" desde buscar
    // TAMBIÉN pregunta a Aurora (fusión de ambos sistemas, según la misión).
    setQuery("");
    try {
      await onAskAurora(t);
    } catch {
      /* defensivo */
    }
  }, [query, onAskAurora]);

  // "Buscar" explícito: además de mostrar resultados de red, invoca a Aurora.
  const askAndSearch = useCallback(async () => {
    const t = query.trim();
    if (!t) return;
    try {
      await onAskAurora(t);
    } catch {
      /* defensivo */
    }
    flashMsg(`Enviado a ${auroraName} y buscado en la red`);
  }, [query, onAskAurora, auroraName, flashMsg]);

  // ── Acciones sobre chats ───────────────────────────────────────────────────
  const handleSave = useCallback(
    (chat: CatalogChat) => {
      setSavingId(chat.id);
      try {
        const id = catalog.saveAsMemory(chat, auroraName);
        flashMsg(id ? `«${chat.title || "Chat"}» guardado en tus memorias` : "No se pudo guardar");
      } finally {
        if (typeof window !== "undefined") window.setTimeout(() => setSavingId(null), 400);
        else setSavingId(null);
      }
    },
    [catalog, auroraName, flashMsg],
  );

  const handleDuplicate = useCallback(
    (chat: CatalogChat) => {
      const id = catalog.duplicate(chat);
      flashMsg(id ? `«${chat.title || "Chat"}» duplicado` : "No se pudo duplicar");
    },
    [catalog, flashMsg],
  );

  const handleLinkToggle = useCallback(
    (chat: CatalogChat) => {
      if (!linkPending) {
        setLinkPending(chat.id);
        flashMsg("Elige el segundo chat para interconectar");
        return;
      }
      if (linkPending === chat.id) {
        setLinkPending(null);
        return;
      }
      catalog.link(linkPending, chat.id);
      setLinkPending(null);
      flashMsg("Chats interconectados");
    },
    [linkPending, catalog, flashMsg],
  );

  const netHasResults = useMemo(
    () => (Object.keys(netResults) as SearchCategoryKey[]).some((k) => netResults[k].length > 0),
    [netResults],
  );

  return (
    <div className={cn("axe-root", className)}>
      <style>{AXE_CSS}</style>

      {/* ── Barra única: buscar ⇄ chatear ── */}
      <div className="relative z-[1] flex flex-col gap-2">
        <div className="axc-bar">
          <span className="axc-bar-ico" aria-hidden>
            {barMode === "buscar" ? <Search className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitBar();
              }
            }}
            placeholder={
              barMode === "buscar"
                ? "Buscar en la red y en tus chats… (Enter también pregunta a Aurora)"
                : `Pregunta a ${auroraName} o busca en tus chats…`
            }
            className="axc-bar-input"
            aria-label={barMode === "buscar" ? "Buscar recursos" : "Preguntar a Aurora"}
          />
          {query.trim() && barMode === "buscar" && (
            <button
              type="button"
              onClick={() => void askAndSearch()}
              className="axc-btn azure shrink-0"
              title={`Preguntar a ${auroraName} con esta consulta`}
            >
              <Sparkles className="h-3.5 w-3.5" /> Aurora
            </button>
          )}
          {query.trim() && (
            <button
              type="button"
              onClick={() => void submitBar()}
              className="axc-send"
              title={barMode === "buscar" ? "Preguntar a Aurora" : "Enviar a Aurora"}
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Conmutador de modo + eje del explorador */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="axe-axis" role="tablist" aria-label="Modo de la barra">
            <button
              type="button"
              role="tab"
              data-active={barMode === "chat"}
              onClick={() => setBarMode("chat")}
              className="axe-axis-btn"
              title="Modo chat: preguntar a Aurora"
            >
              <MessageSquare className="h-3.5 w-3.5" /> Preguntar
            </button>
            <button
              type="button"
              role="tab"
              data-active={barMode === "buscar"}
              onClick={() => setBarMode("buscar")}
              className="axe-axis-btn"
              title="Modo buscar: recursos en la red + tus chats"
            >
              <Search className="h-3.5 w-3.5" /> Buscar
            </button>
          </div>

          <div className="axe-axis" role="tablist" aria-label="Organizar chats por">
            <button
              type="button"
              role="tab"
              data-active={axis === "fecha"}
              onClick={() => setAxis("fecha")}
              className="axe-axis-btn"
              title="Organizar por fecha"
            >
              <CalendarDays className="h-3.5 w-3.5" /> Fecha
            </button>
            <button
              type="button"
              role="tab"
              data-active={axis === "tema"}
              onClick={() => setAxis("tema")}
              className="axe-axis-btn"
              title="Organizar por tema (categorías automáticas)"
            >
              <Tags className="h-3.5 w-3.5" /> Tema
            </button>
          </div>
        </div>

        <div className="axe-modehint">
          <FolderTree className="h-3.5 w-3.5 text-[#7fb8ff]" />
          {catalog.total} chats · categorizados automáticamente · organizados por{" "}
          {axis === "fecha" ? "fecha" : "tema"}
        </div>
      </div>

      {/* ── Aviso flash (guardado/duplicado/interconectado) ── */}
      {flash && (
        <div className="relative z-[1] flex items-center gap-2 rounded-[12px] border border-[#39FF14]/30 bg-[#39FF14]/10 px-3 py-2 text-[11px] text-[#dcfce7]">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#39FF14]" />
          {flash}
        </div>
      )}

      {/* ── Barra de interconexión activa ── */}
      {linkPending && (
        <div className="axe-linkbar relative z-[1]">
          <Link2 className="h-4 w-4 shrink-0 text-[#FFBF00]" />
          <span className="min-w-0 flex-1 text-[11px] text-white/80">
            Interconectando… elige el segundo chat (o cancela).
          </span>
          <button
            type="button"
            onClick={() => setLinkPending(null)}
            className="axc-btn amber shrink-0"
            title="Cancelar interconexión"
          >
            <X className="h-3.5 w-3.5" /> Cancelar
          </button>
        </div>
      )}

      {/* ── Resultados de la red (modo buscar) ── */}
      {barMode === "buscar" && query.trim().length >= 2 && (
        <div className="relative z-[1] axe-results">
          <div className="axe-modehint">
            {netLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#7fb8ff]" /> Buscando en la red…
              </>
            ) : (
              <>
                <Search className="h-3.5 w-3.5 text-[#7fb8ff]" />
                {netHasResults ? "Resultados en la red" : "Sin resultados en la red (revisa tus chats abajo)"}
              </>
            )}
          </div>
          {netHasResults &&
            (Object.keys(netResults) as SearchCategoryKey[])
              .filter((k) => netResults[k].length > 0)
              .map((k) => (
                <div key={k} className="axe-resgroup">
                  <div className="axe-resgroup-head">{SEARCH_CAT_LABEL[k]} · {netResults[k].length}</div>
                  {netResults[k].map((hit) => (
                    <a key={hit.id} href={hit.href} className="axe-reshit" title={hit.label}>
                      <span className="axe-reshit-label">{hit.label}</span>
                      {hit.sub && <span className="axe-reshit-sub">{hit.sub}</span>}
                    </a>
                  ))}
                </div>
              ))}
        </div>
      )}

      {/* ── Explorador de folders (fecha o tema) ── */}
      <div className="axe-scroll relative z-[1] max-h-[26rem] overflow-y-auto pr-1">
        {catalog.total === 0 ? (
          <div className="axe-empty">
            <FolderTree className="h-6 w-6 text-white/25" />
            <p className="text-[11px] leading-relaxed">
              Aún no hay chats con {auroraName}. Todo lo que hables o escribas se
              organizará aquí automáticamente por fecha y por tema.
            </p>
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="axe-empty">
            <Search className="h-6 w-6 text-white/25" />
            <p className="text-[11px] leading-relaxed">
              Ningún chat coincide con «{query.trim()}». Prueba otro término.
            </p>
          </div>
        ) : axis === "fecha" ? (
          byDate.map((bucket, i) => (
            <Folder
              key={bucket.id}
              name={bucket.label}
              count={bucket.chats.length}
              defaultOpen={i === 0 || bucket.id === "hoy" || bucket.id === "ayer"}
            >
              {bucket.chats.map((chat) => (
                <ChatRow
                  key={chat.id}
                  chat={chat}
                  auroraName={auroraName}
                  onOpen={onOpenChat}
                  onSave={handleSave}
                  onDuplicate={handleDuplicate}
                  onLinkToggle={handleLinkToggle}
                  linkPending={linkPending}
                  savingId={savingId}
                  fmtTime={fmtTime}
                />
              ))}
            </Folder>
          ))
        ) : (
          byCategory.map((bucket, i) => (
            <Folder
              key={bucket.id}
              name={bucket.label}
              hint={bucket.hint}
              icon={bucket.icon}
              color={bucket.color}
              count={bucket.chats.length}
              defaultOpen={i === 0}
            >
              {bucket.chats.map((chat) => (
                <ChatRow
                  key={chat.id}
                  chat={chat}
                  auroraName={auroraName}
                  onOpen={onOpenChat}
                  onSave={handleSave}
                  onDuplicate={handleDuplicate}
                  onLinkToggle={handleLinkToggle}
                  linkPending={linkPending}
                  savingId={savingId}
                  fmtTime={fmtTime}
                />
              ))}
            </Folder>
          ))
        )}
      </div>
    </div>
  );
}

export default AuroraChatExplorer;
