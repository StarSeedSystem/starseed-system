"use client";

/**
 * StarSeed OS — Barra lateral de CHATS de Astraura AI (`/agent`)
 * ----------------------------------------------------------------------------
 * (Adenda 69 · I-1) Antes esto era una lista FALSA: cuatro folders hardcodeados
 * ("Proyectos Personales", "Investigación Política"…) con chats inventados que
 * no abrían nada. Ahora es la lista REAL de la CONVERSACIÓN UNIFICADA
 * (`aurora_conversations` en la nube), la MISMA que alimenta a Aurora (orbe,
 * mini-reproductor, Exocórtex). Lo que hables por voz con Aurora aparece aquí,
 * y lo que escribas aquí aparece en el Exocórtex de Astraura IA. En tiempo real.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Dna,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Network,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Orbit,
  Bot,
  Folder,
  Sparkles,
  Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAiConversations, pinnedThenRecent, type AiConversation } from "@/lib/aurora/conversations";
// Ola 281 · E4 (2026-09-07): los chats de Telegram se mudan al Hub de Conexiones
// (E7); aquí la carpeta de Telegram se sustituye por la sección «Externos» con
// vínculos (`PanelExternos`) y puentes a servidores de chat (`PuentesChat`).
import { PanelExternos } from "@/components/externos/panel-externos";
import { PuentesChat } from "@/components/externos/puentes-chat";
import { useChatFolders } from "@/lib/aurora/chat-folders-store";
import { ChatFolders } from "@/components/aurora/chat-folders";
import { groupConversationsByPersonality } from "@/lib/aurora/chat-grouping";
import { useChatContextMenu } from "@/components/aurora/chat-context-menu";
// GEN1113E (contrato `architecture/astraura-chats-genesis.md` §2.4): un chat puede estar en
// Chats y en Genesis a la vez. «Llevar a Genesis…» le pone un VÍNCULO (nunca lo copia ni borra
// nada); los chats cuyo vínculo ya no incluye Chats se esconden aquí; la dirección y los puentes
// que se añadieron a Chats salen en la carpeta «Genesis» y abren la pestaña Genesis.
import {
  leerPrefsChatsGenesis,
  guardarPrefsChatsGenesis,
  vincular,
  idDeVinculo,
  marcarConversacionGenesis,
} from "@/lib/chats-genesis/vinculos";
import type { NivelGenesis, PrefsChatsGenesis, VinculoChat, Bandeja } from "@/lib/chats-genesis/tipos";
import { miAccesoMetaGenesis } from "@/lib/metagenesis/accesos";
import { crearClienteCanon, leerCopiaCanon, nombreDeChat, type CatalogoCanon } from "@/lib/chats-genesis/canon";
import { misEntidades, type EntidadGestionable } from "@/lib/genesis/entidades";

/** ¿Este chat sigue en la bandeja Chats? Sin vínculo, sí (así era antes de GEN1113). */
export function estaEnChats(c: Pick<AiConversation, "id" | "meta">, vinculos: readonly VinculoChat[]): boolean {
  const v = vinculos.find((x) => x.id === idDeVinculo({ tipo: "astraura", convId: c.id }));
  if (v) return v.en.includes("chats");
  const en = (c.meta as { genesis?: { en?: unknown } } | null | undefined)?.genesis?.en;
  return Array.isArray(en) ? en.includes("chats") : true;
}

/** Lo que va en la carpeta «Genesis» de la barra: dirección y puentes añadidos a Chats. */
export function enCarpetaGenesis(vinculos: readonly VinculoChat[]): VinculoChat[] {
  return vinculos.filter((v) => (v.fuente.tipo === "direccion" || v.fuente.tipo === "puente") && v.en.includes("chats"));
}

/**
 * GEN1114F (contrato GEN1114 §2.6 y §5.1): el nombre de la carpeta «Genesis» sale del catálogo de la Mac
 * (`nombreDeChat`), el mismo que en la pestaña Genesis. Un título puesto a mano en el vínculo se respeta
 * como nombre LOCAL, y se dice cuál es el del chat. Sin catálogo, el nombre es provisional.
 */
export function nombreDeVinculo(v: VinculoChat, catalogo: CatalogoCanon | null = null): { nombre: string; nota: string | null; provisional: boolean } {
  const clave = v.fuente.tipo === "direccion" ? "direccion" : v.fuente.tipo === "puente" ? `puente:${v.fuente.puente}` : null;
  // Siempre por la clave de transporte (relación fija de §3.4), nunca por un id que diga el vínculo.
  const delChat = clave ? nombreDeChat(catalogo, clave) : null;
  if (v.titulo) {
    return { nombre: v.titulo, nota: delChat ? `Nombre puesto por ti; el del chat es «${delChat.nombre}»` : null, provisional: false };
  }
  if (delChat) return { nombre: delChat.nombre, nota: delChat.provisional ? "Nombre provisional: la Mac aún no ha publicado el nombre real" : null, provisional: delChat.provisional };
  return { nombre: v.id, nota: null, provisional: false };
}

function whenLabel(ts: number): string {
  try {
    const d = new Date(ts);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

/** Agrupa por origen: lo hablado con Aurora vs. lo escrito aquí, en Astraura AI. */
function groupOf(c: AiConversation): "aurora" | "astraura" {
  return c.kind === "astraura" || c.surface === "agent" ? "astraura" : "aurora";
}

export function ChatNeuralSidebar({
  variant = "sidebar",
  onPick,
}: {
  /** `sidebar` = barra fija (oculta bajo lg). `panel` = ancho completo para el
   *  drawer móvil y la barra colapsable de la página a pantalla completa. */
  variant?: "sidebar" | "panel";
  /** Se llama al abrir una conversación (para cerrar el drawer, p.ej.). */
  onPick?: () => void;
} = {}) {
  const { conversations: todas, activeId, setActive, create, rename, remove } = useAiConversations();
  // GEN1113E: vínculos con Genesis (una lectura; la verdad está en `user_settings.prefs`).
  const [prefsCG, setPrefsCG] = useState<PrefsChatsGenesis | null>(null);
  const [llevando, setLlevando] = useState<string | null>(null);
  const [prefsFallo, setPrefsFallo] = useState(false);
  useEffect(() => {
    let vivo = true;
    void leerPrefsChatsGenesis()
      .then((p) => {
        if (vivo) setPrefsCG(p);
      })
      .catch(() => {
        // Sin preferencias legibles: todo sigue en Chats, como antes de GEN1113.
        if (vivo) setPrefsFallo(true);
      });
    return () => {
      vivo = false;
    };
  }, []);
  const vinculos = prefsCG?.vinculos ?? [];
  const conversations = todas.filter((c) => estaEnChats(c, vinculos));
  const carpetaGenesis = enCarpetaGenesis(vinculos);
  // GEN1114F: el catálogo de nombres, solo si hay algo en la carpeta «Genesis».
  const [catalogo, setCatalogo] = useState<CatalogoCanon | null>(() => leerCopiaCanon()?.catalogo ?? null);
  const hayCarpeta = carpetaGenesis.length > 0;
  useEffect(() => {
    if (!hayCarpeta) return;
    let vivo = true;
    void crearClienteCanon()
      .leer()
      .then((r) => {
        if (vivo) setCatalogo(r.ok ? r.catalogo : r.copia);
      })
      .catch(() => { /* sin catálogo: nombres provisionales */ });
    return () => {
      vivo = false;
    };
  }, [hayCarpeta]);
  const pick = (id: string) => {
    setActive(id);
    onPick?.();
  };
  // Carpetas EN VIVO (Adenda 71-ter · I1): las conversaciones se agrupan por su
  // carpeta (aurora_conversations.folder), no por origen. Orden estable por la
  // posición de la tabla de carpetas; "Sin carpeta" al final.
  const { folders } = useChatFolders();
  // Menú contextual (clic derecho + pulsación larga) de chats y carpetas (Adenda 76).
  const { bind: ctxBind, menu: ctxMenu } = useChatContextMenu({ surface: "agent", onOpenChat: setActive });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // (Ola 281 · E4) Estado de la sección «Externos»: plegada por defecto y, dentro
  // de Vínculos, si se muestra además el ámbito de toda la cuenta o solo el chat.
  const [externosOpen, setExternosOpen] = useState(false);
  const [verCuenta, setVerCuenta] = useState(false);
  // Nombre e id del chat activo para vincularlo (o nada si no hay chat abierto).
  const chatActivo = conversations.find((c) => c.id === activeId);
  const chatActivoId = activeId || undefined;
  const chatActivoNombre = chatActivo?.title;
  // (Agente B1) Eje de agrupación: por Folders (carpeta) o por Personalidad.
  const [groupBy, setGroupBy] = useState<"folder" | "personality">("folder");

  const byFolder = new Map<string, AiConversation[]>();
  for (const c of conversations) {
    const key = c.folder || "";
    const arr = byFolder.get(key) ?? [];
    arr.push(c);
    byFolder.set(key, arr);
  }
  const knownNames = new Set(folders.map((f) => f.name));
  type Group = { id: string; name: string; Icon: typeof Orbit; items: AiConversation[] };
  const folderGroups: Group[] = [
    ...folders
      .filter((f) => (byFolder.get(f.name)?.length ?? 0) > 0)
      .map((f) => ({ id: `f:${f.name}`, name: f.name, Icon: Folder, items: byFolder.get(f.name) ?? [] })),
    // Folders referenciados por chats pero aún no en la tabla (defensivo).
    ...[...byFolder.keys()]
      .filter((k) => k && !knownNames.has(k))
      .map((k) => ({ id: `f:${k}`, name: k, Icon: Folder, items: byFolder.get(k) ?? [] })),
    // Chats sin folder al final.
    ...((byFolder.get("")?.length ?? 0) > 0
      ? [{ id: "__none__", name: "Sin folder", Icon: MessageSquare, items: byFolder.get("") ?? [] }]
      : []),
  ];
  // Por personalidad: usa el helper compartido (mismo criterio en todas las superficies).
  const personalityGroups: Group[] = groupConversationsByPersonality(conversations).map((g) => ({
    ...g,
    Icon: Sparkles,
  }));
  const groups: Group[] = groupBy === "personality" ? personalityGroups : folderGroups;

  return (
    <div className={cn(
      "flex flex-col rounded-xl border bg-background/40 overflow-hidden",
      // min-h-0: sin esto, en la fila de escritorio (ChatSurface embebido va a
      // `md:flex-row`) este panel se estira por `align-items:stretch` pero su
      // `min-height` por defecto es "auto" (=el alto de TODO su contenido:
      // cabecera + folders + lista completa de conversaciones). Con contenido
      // largo, un navegador puede preferir ese alto de contenido al de estirar
      // y desbordar el panel en vez de dejar que la lista de abajo (que sí es
      // `flex-1 overflow-y-auto`) haga scroll interno. La variante "panel" de
      // abajo YA lo lleva (`h-full min-h-0`); aquí faltaba — mismo patrón que
      // TAB_SCROLL/TAB_FILL en agent/page.tsx.
      variant === "panel" ? "w-full h-full min-h-0" : "hidden lg:flex w-64 shrink-0 min-h-0",
    )}>
      <div className="px-3 py-3 border-b flex items-center gap-2 text-sm font-semibold text-cyan-100">
        <Network className="w-4 h-4 text-cyan-400" />
        <span className="flex-1 min-w-0 truncate">Conversaciones</span>
        <button
          onClick={() => void create({ kind: "astraura", surface: "agent" })}
          title="Nueva conversación"
          className="cursor-pointer rounded-md p-1 text-cyan-300/80 transition-colors duration-150 hover:bg-white/10 hover:text-cyan-100"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* (Agente B1) Toggle de agrupación: Folders | Personalidad. */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-white/5">
        <button
          onClick={() => setGroupBy("folder")}
          className={cn(
            "flex-1 cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium transition-colors duration-150 flex items-center justify-center gap-1",
            groupBy === "folder"
              ? "bg-cyan-500/15 text-cyan-100 ring-1 ring-cyan-500/30"
              : "text-cyan-100/50 hover:bg-white/5 hover:text-cyan-100/80",
          )}
          title="Agrupar los chats por folder"
        >
          <Folder className="w-3 h-3" /> Folders
        </button>
        <button
          onClick={() => setGroupBy("personality")}
          className={cn(
            "flex-1 cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium transition-colors duration-150 flex items-center justify-center gap-1",
            groupBy === "personality"
              ? "bg-fuchsia-500/15 text-fuchsia-100 ring-1 ring-fuchsia-500/30"
              : "text-cyan-100/50 hover:bg-white/5 hover:text-cyan-100/80",
          )}
          title="Agrupar los chats por personalidad asignada"
        >
          <Sparkles className="w-3 h-3" /> Personalidad
        </button>
      </div>

      {/* Folders de chat (Adenda 71-bis): los chats se adjuntan a folders y
          se ven en todas las secciones porque comparten el almacén unificado.
          La asignación rápida del chat activo solo aplica al eje Folders. */}
      {groupBy === "folder" && (
      <ChatFolders
        activeConvId={activeId}
        folder={conversations.find((c) => c.id === activeId)?.folder ?? null}
        onPick={async (f) => {
          if (!activeId) return;
          try {
            const sb = (await import("@/utils/supabase/client")).createClient();
            await sb.from("aurora_conversations").update({ folder: f }).eq("id", activeId);
          } catch { /* */ }
        }}
      />
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {conversations.length === 0 && (
          <p className="px-2 py-6 text-center text-[11px] leading-relaxed text-cyan-100/40">
            {todas.length > 0
              ? "Tus chats están solo en Genesis. Ábrelos en la pestaña Genesis o vuelve a mostrarlos en Chats desde allí."
              : "Aún no hay conversaciones. Escribe aquí, o háblale a Aurora desde el orbe: el historial es el mismo."}
          </p>
        )}

        {/* GEN1113E: carpeta «Genesis» — la dirección y los puentes añadidos a Chats */}
        {carpetaGenesis.length > 0 && (
          <div className="space-y-0.5" data-testid="carpeta-genesis">
            <button
              onClick={() => setOpen((o) => ({ ...o, __genesis__: o.__genesis__ === false }))}
              className="flex w-full cursor-pointer items-center px-2 py-1.5 text-xs font-semibold text-cyan-300/80 transition-colors duration-150 hover:text-cyan-200"
            >
              {open.__genesis__ !== false ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
              <Dna className="w-3 h-3 mr-2 text-cyan-400/70" />
              <span className="min-w-0 flex-1 truncate text-left">Genesis</span>
              <span className="text-[10px] font-normal text-cyan-100/40">{carpetaGenesis.length}</span>
            </button>
            {open.__genesis__ !== false && (
              <div className="ml-2 space-y-0.5 border-l border-cyan-500/10 pl-2">
                {carpetaGenesis.map((v) => {
                  const n = nombreDeVinculo(v, catalogo);
                  return (
                    <Link
                      key={v.id}
                      href="/agent?tab=chats-genesis"
                      onClick={() => onPick?.()}
                      className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs text-cyan-100/80 transition-colors duration-150 hover:bg-white/5"
                      title={`Abrir «${n.nombre}» en la pestaña Genesis${n.nota ? `. ${n.nota}` : ""}`}
                    >
                      <Dna className="mt-0.5 w-3 h-3 shrink-0 text-cyan-500/50" />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 break-words [overflow-wrap:anywhere]">{n.nombre}</span>
                        {n.provisional ? <span className="block text-[10px] text-amber-200/70">nombre provisional</span> : null}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {groups.map((g) => {
          const folderMeta =
            groupBy === "folder" && g.id.startsWith("f:") ? folders.find((f) => f.name === g.name) : undefined;
          return g.items.length === 0 ? null : (
            <div key={g.id} className="space-y-0.5">
              <button
                onClick={() => setOpen((o) => ({ ...o, [g.id]: o[g.id] === false ? true : false }))}
                {...(folderMeta ? ctxBind({ kind: "folder", id: g.name, name: g.name, folderId: folderMeta.id }) : {})}
                className="flex w-full cursor-pointer items-center px-2 py-1.5 text-xs font-semibold text-cyan-300/80 transition-colors duration-150 hover:text-cyan-200"
              >
                {open[g.id] !== false ? (
                  <ChevronDown className="w-3 h-3 mr-1" />
                ) : (
                  <ChevronRight className="w-3 h-3 mr-1" />
                )}
                <g.Icon className="w-3 h-3 mr-2 text-cyan-400/70" />
                <span className="min-w-0 flex-1 truncate text-left">{g.name}</span>
                <span className="text-[10px] font-normal text-cyan-100/40">{g.items.length}</span>
              </button>

              {open[g.id] !== false && (
                <div className="ml-2 space-y-0.5 border-l border-cyan-500/10 pl-2">
                  {[...g.items].sort(pinnedThenRecent).map((c) => (
                    <div key={c.id}>
                    <div
                      {...ctxBind({ kind: "chat", id: c.id, name: c.title, folder: c.folder ?? null })}
                      className={cn(
                        "group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors duration-150",
                        c.id === activeId
                          ? "bg-cyan-500/15 text-cyan-100"
                          : "text-cyan-100/80 hover:bg-white/5",
                      )}
                    >
                      {editing === c.id ? (
                        <>
                          <input
                            autoFocus
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                void rename(c.id, draft);
                                setEditing(null);
                              }
                              if (e.key === "Escape") setEditing(null);
                            }}
                            className="min-w-0 flex-1 rounded bg-black/40 px-1.5 py-0.5 text-xs outline-none ring-1 ring-cyan-500/30"
                          />
                          <button
                            onClick={() => {
                              void rename(c.id, draft);
                              setEditing(null);
                            }}
                            className="cursor-pointer text-emerald-400 hover:text-emerald-300"
                            title="Guardar"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setEditing(null)}
                            className="cursor-pointer text-white/50 hover:text-white"
                            title="Cancelar"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => pick(c.id)}
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                            title={`Abrir «${c.title}»`}
                          >
                            <MessageSquare className="w-3 h-3 shrink-0 text-cyan-500/50" />
                            <span className="min-w-0 flex-1 truncate">{c.title}</span>
                            <span className="shrink-0 text-[9px] text-cyan-100/35">
                              {whenLabel(c.updatedAt)}
                            </span>
                          </button>
                          <button
                            onClick={() => setLlevando((x) => (x === c.id ? null : c.id))}
                            className={cn(
                              "cursor-pointer hover:text-emerald-300",
                              llevando === c.id ? "block text-emerald-300" : "text-white/40 lg:hidden lg:group-hover:block",
                              variant === "panel" && "!block",
                            )}
                            title="Llevar a Genesis…"
                            aria-label={`Llevar «${c.title}» a Genesis`}
                            aria-expanded={llevando === c.id}
                          >
                            <Dna className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => {
                              setEditing(c.id);
                              setDraft(c.title);
                            }}
                            className="hidden cursor-pointer text-white/40 hover:text-white group-hover:block"
                            title="Renombrar"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => void remove(c.id)}
                            className="hidden cursor-pointer text-white/40 hover:text-rose-400 group-hover:block"
                            title="Eliminar conversación"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                    {llevando === c.id && prefsCG && (
                      <LlevarAGenesis
                        conv={c}
                        prefs={prefsCG}
                        onHecho={(p) => {
                          setPrefsCG(p);
                          setLlevando(null);
                        }}
                        onCancelar={() => setLlevando(null)}
                      />
                    )}
                    {llevando === c.id && !prefsCG && (
                      <p className="px-2 py-1 text-[10px] text-amber-200/70">
                        {prefsFallo
                          ? "No se pudieron leer tus vínculos con Genesis; vuelve a intentarlo en un rato."
                          : "Leyendo tus vínculos con Genesis…"}
                      </p>
                    )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className="mt-2 border-t border-cyan-500/10 pt-2">
          {/* Sección «Externos» (Ola 281 · E4): sustituye a la antigua carpeta de
              Telegram. Dos subsecciones: Vínculos (tokens de acceso por ámbito) y
              Puentes (servidores de chat externos: Hermes, terminal, WhatsApp…). */}
          <button
            onClick={() => setExternosOpen((o) => !o)}
            className="flex w-full cursor-pointer items-center px-2 py-1.5 text-xs font-semibold text-cyan-300/80 transition-colors duration-150 hover:text-cyan-200"
            title="Vínculos y puentes a servicios externos"
          >
            {externosOpen ? (
              <ChevronDown className="w-3 h-3 mr-1" />
            ) : (
              <ChevronRight className="w-3 h-3 mr-1" />
            )}
            <Plug className="w-3 h-3 mr-2 text-cyan-400/70" />
            <span className="min-w-0 flex-1 truncate text-left">Externos</span>
          </button>

          {externosOpen && (
            <div className="ml-2 space-y-2 border-l border-cyan-500/10 pl-2">
              {/* Vínculos: panel del chat activo + enlace para ver toda la cuenta. */}
              <div>
                <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-100/40">
                  Vínculos
                </p>
                <PanelExternos
                  compacto
                  ambito={{
                    tipo: "chat",
                    id: chatActivoId ?? "chat",
                    nombre: chatActivoNombre,
                  }}
                />
                <button
                  onClick={() => setVerCuenta((v) => !v)}
                  className="mt-1 cursor-pointer rounded px-1.5 py-0.5 text-[10px] text-cyan-200/70 transition-colors duration-150 hover:bg-white/5 hover:text-cyan-100"
                  title="Ver los vínculos de toda la cuenta"
                >
                  {verCuenta ? "Ocultar " : ""}de toda la cuenta
                </button>
                {verCuenta && (
                  <div className="mt-1">
                    <PanelExternos
                      compacto
                      ambito={{ tipo: "cuenta", id: "cuenta", nombre: "toda la cuenta" }}
                    />
                  </div>
                )}
              </div>

              {/* Puentes: servidores de chat externos vinculables a este chat. */}
              <div>
                <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-100/40">
                  Puentes
                </p>
                <PuentesChat chatId={chatActivoId} chatNombre={chatActivoNombre} />
              </div>
            </div>
          )}
        </div>
      </div>
      {ctxMenu}
    </div>
  );
}

const NIVELES: { id: NivelGenesis; label: string }[] = [
  { id: "genesis", label: "Mi Genesis" },
  { id: "poligenesis", label: "PoliGenesis" },
  { id: "metagenesis", label: "MetaGenesis" },
];

/**
 * «Llevar a Genesis…» (GEN1113E, §2.4): crea o actualiza el VÍNCULO del chat con Genesis. El chat
 * sigue en Chats salvo que se marque «Quitar de Chats» (= «Trasladar»). Nunca borra nada.
 */
export function LlevarAGenesis({
  conv,
  prefs,
  onHecho,
  onCancelar,
}: {
  conv: Pick<AiConversation, "id" | "title">;
  prefs: PrefsChatsGenesis;
  onHecho: (p: PrefsChatsGenesis) => void;
  onCancelar: () => void;
}) {
  const actual = prefs.vinculos.find((v) => v.id === idDeVinculo({ tipo: "astraura", convId: conv.id }));
  const [nivel, setNivel] = useState<NivelGenesis>(actual?.nivel ?? "genesis");
  const [entidad, setEntidad] = useState<string>(actual?.entidad ?? "");
  const [trasladar, setTrasladar] = useState(false);
  const [miembro, setMiembro] = useState(false);
  const [entidades, setEntidades] = useState<EntidadGestionable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    void miAccesoMetaGenesis()
      .then((a) => {
        if (vivo) setMiembro(a?.miembro === true);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (nivel !== "poligenesis" || entidades) return;
    let vivo = true;
    void misEntidades()
      .then((r) => {
        if (!vivo) return;
        const lista = r.ok ? r.lista.filter((e) => e.rango >= 2) : [];
        setEntidades(lista);
        if (!entidad && lista[0]) setEntidad(lista[0].id);
      })
      .catch(() => {
        if (vivo) setEntidades([]);
      });
    return () => {
      vivo = false;
    };
  }, [nivel, entidades, entidad]);

  const llevar = useCallback(async () => {
    if (nivel === "poligenesis" && !entidad) return;
    setGuardando(true);
    setError(null);
    const en: Bandeja[] = trasladar ? ["genesis"] : ["chats", "genesis"];
    const g = { nivel, entidad: nivel === "poligenesis" ? entidad : null, en };
    let siguiente: PrefsChatsGenesis;
    try {
      siguiente = vincular(
        prefs,
        { fuente: { tipo: "astraura", convId: conv.id }, ...g, titulo: conv.title.slice(0, 120) },
        new Date().toISOString(),
      );
      await guardarPrefsChatsGenesis(siguiente);
    } catch (e) {
      setError(
        e instanceof RangeError
          ? "Ya tienes 500 chats vinculados a Genesis: quita alguno antes."
          : "No se pudo guardar el vínculo; el chat sigue como estaba.",
      );
      setGuardando(false);
      return;
    }
    // La marca en el propio chat es comodidad (la verdad está en las preferencias): si falla, no se deshace nada.
    await marcarConversacionGenesis(conv.id, g).catch(() => undefined);
    setGuardando(false);
    onHecho(siguiente);
  }, [nivel, entidad, trasladar, prefs, conv.id, conv.title, onHecho]);

  const niveles = NIVELES.filter((n) => n.id !== "metagenesis" || miembro || actual?.nivel === "metagenesis");

  return (
    <div className="my-1 space-y-2 rounded-md border border-emerald-500/20 bg-emerald-950/15 p-2 text-[11px] text-emerald-50/90" role="group" aria-label="Llevar a Genesis">
      <p className="leading-snug">
        {actual?.en.includes("genesis")
          ? "Ya está en Genesis. Puedes cambiar el nivel."
          : "El chat sigue aquí y aparece también en la pestaña Genesis."}
      </p>
      <div className="flex flex-wrap gap-1">
        {niveles.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => setNivel(n.id)}
            aria-pressed={nivel === n.id}
            className={cn(
              "cursor-pointer rounded-md px-2 py-1 transition-colors duration-150",
              nivel === n.id ? "bg-emerald-500/20 text-emerald-50 ring-1 ring-emerald-400/40" : "text-emerald-100/60 hover:bg-white/5",
            )}
          >
            {n.label}
          </button>
        ))}
      </div>
      {nivel === "poligenesis" && (
        entidades === null ? (
          <p className="text-emerald-100/50">Buscando tus grupos y páginas…</p>
        ) : entidades.length === 0 ? (
          <p className="text-amber-200/80">No colaboras (rango 2 o más) en ningún grupo ni página.</p>
        ) : (
          <select
            value={entidad}
            onChange={(e) => setEntidad(e.target.value)}
            aria-label="Grupo o página"
            className="w-full rounded-md border border-white/10 bg-background/60 px-2 py-1.5 text-[11px] text-foreground"
          >
            {entidades.map((e) => (
              <option key={e.id} value={e.id} className="bg-zinc-900">
                {e.nombre} · {e.tipo === "grupo" ? "grupo" : "página"}
              </option>
            ))}
          </select>
        )
      )}
      <label className="flex items-center gap-1.5 text-emerald-100/70">
        <input type="checkbox" checked={trasladar} onChange={(e) => setTrasladar(e.target.checked)} className="h-3.5 w-3.5 accent-emerald-500" />
        Quitar de Chats (trasladar)
      </label>
      {error && <p className="text-rose-300">{error}</p>}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => void llevar()}
          disabled={guardando || (nivel === "poligenesis" && !entidad)}
          className="flex-1 cursor-pointer rounded-md bg-emerald-600/80 px-2 py-1.5 font-medium text-white transition-colors duration-150 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Llevar a Genesis"}
        </button>
        <button type="button" onClick={onCancelar} className="cursor-pointer rounded-md px-2 py-1.5 text-emerald-100/60 hover:bg-white/5">
          Cancelar
        </button>
      </div>
    </div>
  );
}

export default ChatNeuralSidebar;
