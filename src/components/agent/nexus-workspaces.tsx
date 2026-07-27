"use client";

/**
 * StarSeed OS — PORTAL NEXUS (fusión I4)
 * ============================================================================
 * Antes existía una página independiente `/nexus` que era un MOCK: espacios de
 * trabajo y burbujas hardcodeadas, sin handlers ni datos. Se ELIMINÓ y sus
 * características de valor se FUSIONARON aquí, dentro de la pestaña «Nexus» de la
 * sección Astraura IA (`/agent`), pero ahora IMPLEMENTADAS DE VERDAD sobre los
 * datos reales del OS:
 *
 *   (a) «Espacios de trabajo» = las CARPETAS de chat reales (`useChatFolders`)
 *       mostradas como tarjetas con contador de chats, acceso rápido (abre el
 *       chat más reciente de la carpeta) y creación de carpeta en vivo.
 *   (b) Acciones rápidas reales: nuevo chat, nueva carpeta, y accesos directos a
 *       Cerebros, Personalidades y Memorias (cambian de pestaña en el estudio).
 *   (c) El «Catálogo Nexus» (QuickOptionsGrid): el mismo catálogo unificado del
 *       dock, editable y sincronizado en todas las superficies.
 *
 * Todo comparte el almacén unificado (`aurora_conversations` + carpetas), así que
 * las carpetas y los chats salen en tiempo real y el `activeId` es el MISMO que
 * usan el orbe y el Exocórtex.
 */

import { useMemo, useState } from "react";
import {
  BrainCircuit,
  Folder,
  FolderPlus,
  Inbox,
  MessageSquarePlus,
  Brain,
  Sparkles,
  HardDrive,
  ArrowRight,
  Plus,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAiConversations } from "@/lib/aurora/conversations";
import { useChatFolders } from "@/lib/aurora/chat-folders-store";
import { QuickOptionsGrid } from "@/components/hermes/quick-options-grid";

export function NexusWorkspaces({ onOpenTab }: { onOpenTab?: (tab: string) => void }) {
  // Datos reales y EN VIVO — mismo almacén unificado que el orbe/Exocórtex.
  const { conversations, setActive, create } = useAiConversations();
  const { folders, create: createFolder } = useChatFolders();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  // Contador de chats por carpeta + los que no tienen carpeta.
  const { byFolder, noneCount } = useMemo(() => {
    const m = new Map<string, number>();
    let none = 0;
    for (const c of conversations) {
      const k = (c.folder || "").trim();
      if (!k) {
        none++;
        continue;
      }
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return { byFolder: m, noneCount: none };
  }, [conversations]);

  // El Portal Nexus vive ahora en la pestaña «Nexus»; abrir/crear un chat salta
  // a la pestaña «Chats» para ver la conversación (activeId compartido).
  const goToChats = () => onOpenTab?.("chat");

  /** Abre el chat más reciente de la carpeta; si está vacía, crea uno en ella. */
  const openFolder = (folderName: string | null) => {
    const inFolder = conversations
      .filter((c) => (c.folder || "") === (folderName || ""))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    if (inFolder[0]) setActive(inFolder[0].id);
    else void create({ kind: "astraura", surface: "agent", folder: folderName ?? null, title: "Nueva conversación" });
    goToChats();
  };

  const newChat = () => {
    void create({ kind: "astraura", surface: "agent", title: "Nueva conversación" });
    goToChats();
  };
  const newChatIn = (folderName: string) => {
    void create({ kind: "astraura", surface: "agent", folder: folderName, title: "Nueva conversación" });
    goToChats();
  };

  const doCreateFolder = async () => {
    const n = name.trim();
    if (!n) return;
    await createFolder(n);
    setName("");
    setCreating(false);
  };

  const quickActions: { label: string; icon: typeof Brain; onClick: () => void; accent: string }[] = [
    { label: "Cerebros", icon: Brain, onClick: () => onOpenTab?.("cerebros"), accent: "text-fuchsia-300" },
    // Adenda 97: «Personalidades» abre el HUB global (antes caía en el Estudio Aurora).
    { label: "Personalidades", icon: Sparkles, onClick: () => onOpenTab?.("personalidades"), accent: "text-emerald-300" },
    { label: "Memorias", icon: HardDrive, onClick: () => onOpenTab?.("memorias"), accent: "text-cyan-300" },
  ];

  return (
    <div className="relative w-full">
      {/* Fondo de rejilla sutil (Crystal Liquid Glass) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(6,182,212,0.12) 1px, transparent 0)",
          backgroundSize: "36px 36px",
        }}
      />

      {/* Cabecera */}
      <div className="flex flex-col items-center text-center gap-2 pt-2 pb-5">
        <span className="grid place-items-center h-12 w-12 rounded-2xl bg-gradient-to-tr from-cyan-500/25 to-fuchsia-500/25 border border-white/10">
          <BrainCircuit className="w-6 h-6 text-cyan-300" />
        </span>
        <h2 className="text-lg font-semibold tracking-wide text-cyan-50">Portal Nexus</h2>
        <p className="max-w-md text-xs text-white/50">
          Tus espacios de trabajo son tus carpetas de chat reales. Abre uno, crea un chat nuevo o
          salta a cualquier sección del estudio — todo sincronizado con Aurora y el Exocórtex.
        </p>
      </div>

      {/* Acciones rápidas reales */}
      <div className="flex flex-wrap items-center justify-center gap-2 pb-5">
        <Button
          onClick={newChat}
          className="gap-2 bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_16px_rgba(6,182,212,0.35)]"
        >
          <MessageSquarePlus className="w-4 h-4" /> Nuevo chat
        </Button>
        {quickActions.map((a) => (
          <button
            key={a.label}
            onClick={a.onClick}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-white/80 transition-colors duration-200 hover:bg-white/[0.07] hover:text-white cursor-pointer"
          >
            <a.icon className={cn("w-4 h-4", a.accent)} />
            {a.label}
          </button>
        ))}
      </div>

      {/* Espacios de trabajo = carpetas reales */}
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-wider text-white/45">
          <Folder className="w-3.5 h-3.5" /> Espacios de trabajo
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {folders.map((f) => (
            <WorkspaceCard
              key={f.id}
              name={f.name}
              count={byFolder.get(f.name) ?? 0}
              onOpen={() => openFolder(f.name)}
              onNew={() => newChatIn(f.name)}
            />
          ))}

          {noneCount > 0 && (
            <WorkspaceCard
              name="Sin carpeta"
              count={noneCount}
              icon={Inbox}
              onOpen={() => openFolder(null)}
            />
          )}

          {/* Crear espacio (carpeta) en vivo */}
          {creating ? (
            <div className="flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/[0.06] p-3">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void doCreateFolder();
                  if (e.key === "Escape") {
                    setCreating(false);
                    setName("");
                  }
                }}
                placeholder="Nombre del espacio…"
                className="min-w-0 flex-1 rounded bg-black/30 px-2 py-1 text-xs text-white outline-none ring-1 ring-cyan-500/30"
              />
              <button
                onClick={() => void doCreateFolder()}
                className="cursor-pointer text-emerald-400 hover:text-emerald-300"
                title="Crear"
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-3 text-white/45 transition-colors duration-200 hover:border-cyan-500/40 hover:text-cyan-200 cursor-pointer"
              title="Crear un espacio de trabajo (carpeta)"
            >
              <FolderPlus className="w-5 h-5" />
              <span className="text-[11px] font-semibold">Crear espacio</span>
            </button>
          )}
        </div>
      </div>

      {/* Catálogo Nexus — el mismo catálogo unificado del dock. */}
      <QuickOptionsGrid
        title="Catálogo Nexus"
        description="El mismo catálogo de accesos rápidos que tu dock. Edita para añadir/quitar atajos — los cambios se sincronizan en todas las superficies."
        columns={4}
        editable
      />
    </div>
  );
}

function WorkspaceCard({
  name,
  count,
  icon: Icon = Folder,
  onOpen,
  onNew,
}: {
  name: string;
  count: number;
  icon?: typeof Folder;
  onOpen: () => void;
  onNew?: () => void;
}) {
  return (
    <div className="group relative flex flex-col justify-between rounded-xl border border-white/10 bg-white/[0.02] p-3 transition-all duration-200 hover:border-cyan-500/30 hover:bg-white/[0.05]">
      <button onClick={onOpen} className="flex w-full items-start gap-2.5 text-left cursor-pointer">
        <span className="grid place-items-center h-8 w-8 shrink-0 rounded-lg bg-cyan-500/10 text-cyan-300">
          <Icon className="w-4 h-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-cyan-50">{name}</span>
          <span className="text-[11px] text-white/45">
            {count} {count === 1 ? "chat" : "chats"}
          </span>
        </span>
        <ArrowRight className="w-3.5 h-3.5 shrink-0 text-white/25 transition-colors group-hover:text-cyan-300" />
      </button>
      {onNew && (
        <button
          onClick={onNew}
          title={`Nuevo chat en «${name}»`}
          className="absolute right-1.5 top-1.5 hidden h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-black/40 text-cyan-300 transition-colors hover:bg-cyan-500/20 group-hover:flex cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export default NexusWorkspaces;
