"use client";

/**
 * ChatContextMenu — menú contextual (clic derecho + pulsación larga táctil) para
 * CHATS y CARPETAS de Astraura (Adenda 76 · Agente G2). Se usa en el sidebar de
 * /agent, en ChatFolders y en el FoldersBrowser del Exocórtex.
 *
 * Se expone como un hook `useChatContextMenu()` que devuelve:
 *   · `bind(target)` — props para el elemento disparador (clic derecho + long
 *     press 500ms, patrón de `use-context-trigger`).
 *   · `menu` — el árbol a renderizar (menú posicionado + diálogos). Cada
 *     superficie solo hace `<div {...bind(t)}>…</div>` y `{menu}` una vez.
 *
 * Opciones de CHAT: Fijar/Desfijar · Ramificar · Compartir · Accesos · Duplicar ·
 * Copiar (md) · Mover a folder… · Añadir a espacio… · Pantalla completa ·
 * Renombrar · Eliminar.
 * Opciones de CARPETA: Fijar · Renombrar · Mover chats… · Añadir a espacio ·
 * Compartir (vía espacio) · Eliminar.
 */

import React, { useState } from "react";
import {
  Pin, PinOff, GitBranch, Share2, ShieldCheck, CopyPlus, ClipboardCopy, FolderInput,
  Boxes, Maximize2, Pencil, Trash2, Home, Check, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useContextTrigger } from "@/components/library/finder/use-context-trigger";
import { useChatFolders } from "@/lib/aurora/chat-folders-store";
import { pinFolderTop, renameFolder as renameFolderStore, deleteFolder as deleteFolderStore } from "@/lib/aurora/chat-folders-store";
import {
  cachedConversations, isConversationPinned, setConversationPinned, branchConversation,
  duplicateConversation, conversationMarkdown, moveConversationToFolder, renameConversation,
  deleteConversation, type AiSurface,
} from "@/lib/aurora/conversations";
import { WorkspacePicker, type WorkspaceAttach } from "@/components/workspaces/workspace-picker";
import { WorkspaceAccessDialog, type AccessTarget } from "@/components/workspaces/workspace-access-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface ChatMenuTarget {
  kind: "chat" | "folder";
  /** convId (chat) | nombre de la carpeta (folder). */
  id: string;
  name: string;
  /** Carpeta actual del chat (para resaltar en "Mover a"). */
  folder?: string | null;
  /** Id de la carpeta en el almacén (target folder). */
  folderId?: string;
}

/* ── Primitivas visuales (estilo del menú del escritorio) ── */
function MenuItem({
  icon: Icon, label, danger, active, onClick,
}: {
  icon?: LucideIcon;
  label: string;
  danger?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-semibold transition-colors cursor-pointer",
        danger ? "text-rose-300 hover:bg-rose-500/15" : "text-foreground/90 hover:bg-white/10",
        active && "bg-white/[0.06]",
      )}
    >
      {Icon ? <Icon className="size-3.5 shrink-0 opacity-90" /> : <span className="size-3.5 shrink-0" />}
      <span className="flex-1 truncate">{label}</span>
      {active && <Check className="size-3 shrink-0 text-cyan-300" />}
    </button>
  );
}

function MenuDivider() {
  return <div className="my-1 h-px bg-white/10" />;
}

function SubMenu({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-semibold text-foreground/90 transition-colors hover:bg-white/10 cursor-pointer",
          open && "bg-white/[0.06]",
        )}
      >
        <Icon className="size-3.5 shrink-0 opacity-90" />
        <span className="flex-1 truncate">{label}</span>
        <span className={cn("shrink-0 text-[10px] text-muted-foreground transition-transform", open && "rotate-90")}>›</span>
      </button>
      {open && <div className="mb-0.5 ml-3 max-h-40 overflow-y-auto border-l border-white/10 pl-1">{children}</div>}
    </div>
  );
}

const MENU_W = 220;

export interface UseChatContextMenu {
  bind: ReturnType<typeof useContextTrigger<ChatMenuTarget>>["bind"];
  menu: React.ReactNode;
}

export function useChatContextMenu(opts?: { surface?: AiSurface; onOpenChat?: (id: string) => void }): UseChatContextMenu {
  const surface = opts?.surface ?? "agent";
  const { menu, bind, close } = useContextTrigger<ChatMenuTarget>();
  const { folders } = useChatFolders();
  const confirm = useConfirm();

  const [pickerFor, setPickerFor] = useState<WorkspaceAttach | null>(null);
  const [pickerLabel, setPickerLabel] = useState<string>("");
  const [pickerAfter, setPickerAfter] = useState<null | ((wsId: string) => void)>(null);
  const [accessFor, setAccessFor] = useState<AccessTarget | null>(null);
  const [renameState, setRenameState] = useState<{ target: ChatMenuTarget; value: string } | null>(null);

  const run = (fn: () => void) => {
    fn();
    close();
  };

  const openFullscreen = (convId: string) => {
    if (typeof window !== "undefined") window.location.href = `/agent/chat?id=${encodeURIComponent(convId)}`;
  };

  const copyMd = async (convId: string) => {
    const md = conversationMarkdown(convId);
    try {
      await navigator.clipboard.writeText(md);
      toast.success("Chat copiado al portapapeles (Markdown)");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const commitRename = async () => {
    if (!renameState) return;
    const value = renameState.value.trim();
    const t = renameState.target;
    setRenameState(null);
    if (!value) return;
    if (t.kind === "chat") await renameConversation(t.id, value);
    else if (t.folderId) await renameFolderStore(t.folderId, value);
  };

  // Contenido del menú según el tipo de objetivo.
  const renderItems = (t: ChatMenuTarget): React.ReactNode => {
    if (t.kind === "chat") {
      const conv = cachedConversations().find((c) => c.id === t.id) ?? null;
      const pinned = isConversationPinned(conv);
      return (
        <>
          <MenuItem
            icon={pinned ? PinOff : Pin}
            label={pinned ? "Desfijar" : "Fijar arriba"}
            onClick={() => run(() => void setConversationPinned(t.id, !pinned))}
          />
          <MenuItem
            icon={GitBranch}
            label="Ramificar chat"
            onClick={() =>
              run(() => {
                void branchConversation(t.id, surface).then((c) => {
                  if (c) {
                    toast.success("Rama creada");
                    opts?.onOpenChat?.(c.id);
                  }
                });
              })
            }
          />
          <MenuItem icon={CopyPlus} label="Duplicar" onClick={() => run(() => void duplicateConversation(t.id, surface))} />
          <MenuItem icon={ClipboardCopy} label="Copiar (Markdown)" onClick={() => run(() => void copyMd(t.id))} />
          <MenuDivider />
          <SubMenu icon={FolderInput} label="Mover a folder…">
            <MenuItem
              icon={Home}
              label="Sin folder"
              active={!t.folder}
              onClick={() => run(() => void moveConversationToFolder(t.id, null))}
            />
            {folders.map((f) => (
              <MenuItem
                key={f.id}
                label={f.name}
                active={t.folder === f.name}
                onClick={() => run(() => void moveConversationToFolder(t.id, f.name))}
              />
            ))}
          </SubMenu>
          <MenuItem
            icon={Boxes}
            label="Añadir a espacio…"
            onClick={() =>
              run(() => {
                setPickerLabel(t.name);
                setPickerAfter(null);
                setPickerFor({ chatIds: [t.id] });
              })
            }
          />
          <MenuDivider />
          <MenuItem icon={Share2} label="Compartir…" onClick={() => run(() => setAccessFor({ kind: "chat", id: t.id, title: t.name }))} />
          <MenuItem
            icon={ShieldCheck}
            label="Accesos y permisos…"
            onClick={() => run(() => setAccessFor({ kind: "chat", id: t.id, title: t.name }))}
          />
          <MenuItem icon={Maximize2} label="Abrir en pantalla completa" onClick={() => run(() => openFullscreen(t.id))} />
          <MenuDivider />
          <MenuItem icon={Pencil} label="Renombrar" onClick={() => run(() => setRenameState({ target: t, value: t.name }))} />
          <MenuItem
            icon={Trash2}
            label="Eliminar"
            danger
            onClick={() =>
              run(async () => {
                if (await confirm({ title: "Eliminar chat", description: `¿Eliminar «${t.name}»?`, destructive: true })) {
                  void deleteConversation(t.id);
                }
              })
            }
          />
        </>
      );
    }
    // Carpeta
    const chatsInFolder = cachedConversations().filter((c) => c.folder === t.id);
    return (
      <>
        <MenuItem
          icon={Pin}
          label="Fijar arriba"
          onClick={() => run(() => { if (t.folderId) void pinFolderTop(t.folderId); })}
        />
        <MenuItem icon={Pencil} label="Renombrar" onClick={() => run(() => setRenameState({ target: t, value: t.name }))} />
        <SubMenu icon={FolderInput} label={`Mover ${chatsInFolder.length} chats a…`}>
          <MenuItem
            icon={Home}
            label="Sin folder"
            onClick={() => run(() => chatsInFolder.forEach((c) => void moveConversationToFolder(c.id, null)))}
          />
          {folders
            .filter((f) => f.name !== t.id)
            .map((f) => (
              <MenuItem
                key={f.id}
                label={f.name}
                onClick={() => run(() => chatsInFolder.forEach((c) => void moveConversationToFolder(c.id, f.name)))}
              />
            ))}
        </SubMenu>
        <MenuItem
          icon={Boxes}
          label="Añadir a espacio…"
          onClick={() =>
            run(() => {
              setPickerLabel(t.name);
              setPickerAfter(null);
              setPickerFor({ folderIds: t.folderId ? [t.folderId] : [] });
            })
          }
        />
        <MenuItem
          icon={Share2}
          label="Compartir (vía espacio)…"
          onClick={() =>
            run(() => {
              // Compartir una carpeta = adjuntarla a un espacio y compartir el espacio (real).
              setPickerLabel(t.name);
              setPickerAfter(() => (wsId: string) => setAccessFor({ kind: "workspace", id: wsId, title: t.name }));
              setPickerFor({ folderIds: t.folderId ? [t.folderId] : [] });
            })
          }
        />
        <MenuDivider />
        <MenuItem
          icon={Trash2}
          label="Eliminar folder"
          danger
          onClick={() =>
            run(async () => {
              if (!t.folderId) return;
              if (await confirm({
                title: "Borrar folder",
                description: `¿Borrar el folder «${t.name}»? Sus chats no se borran; quedan sin folder.`,
                destructive: true,
              })) {
                void deleteFolderStore(t.folderId);
              }
            })
          }
        />
      </>
    );
  };

  const positioned = menu
    ? (() => {
        const left = Math.max(6, Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 1000) - MENU_W - 6));
        const top = Math.max(8, Math.min(menu.y, (typeof window !== "undefined" ? window.innerHeight : 800) - 40));
        return (
          <>
            {/* Backdrop para cerrar */}
            <div className="fixed inset-0 z-[70]" onClick={close} onContextMenu={(e) => { e.preventDefault(); close(); }} />
            <div
              role="menu"
              data-chat-context-menu
              style={{ left, top, width: MENU_W }}
              className="fixed z-[71] overflow-y-auto rounded-2xl border border-white/12 bg-card/95 p-1.5 shadow-2xl backdrop-blur-2xl"
            >
              <span aria-hidden className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />
              <p className="px-2.5 pb-1 pt-1 text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">
                {menu.payload.kind === "chat" ? "Chat" : "Carpeta"}
              </p>
              {renderItems(menu.payload)}
            </div>
          </>
        );
      })()
    : null;

  const element = (
    <>
      {positioned}
      {pickerFor && (
        <WorkspacePicker
          open
          onClose={() => setPickerFor(null)}
          attach={pickerFor}
          label={pickerLabel}
          onDone={(wsId) => {
            const after = pickerAfter;
            setPickerFor(null);
            setPickerAfter(null);
            if (after) after(wsId);
          }}
        />
      )}
      {accessFor && <WorkspaceAccessDialog open onClose={() => setAccessFor(null)} target={accessFor} />}
      {renameState && (
        <Dialog open onOpenChange={(o) => !o && setRenameState(null)}>
          <DialogContent className="max-w-xs border-white/10 bg-black/90 text-white backdrop-blur-2xl">
            <DialogHeader>
              <DialogTitle className="text-sm font-light">Renombrar</DialogTitle>
            </DialogHeader>
            <Input
              autoFocus
              value={renameState.value}
              onChange={(e) => setRenameState((s) => (s ? { ...s, value: e.target.value } : s))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitRename();
                if (e.key === "Escape") setRenameState(null);
              }}
              className="h-9 border-white/10 bg-black/40 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setRenameState(null)}>
                Cancelar
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={() => void commitRename()}>
                Guardar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );

  return { bind, menu: element };
}

export default useChatContextMenu;
