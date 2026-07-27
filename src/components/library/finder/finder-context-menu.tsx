"use client";

// ════════════════════════════════════════════════════════════════════════════
// FinderContextMenu — menú contextual (clic derecho / long-press) de un ítem
// o folder de la Biblioteca. Posicionado en (x,y) mediante un ancla invisible
// + DropdownMenu de Radix controlado (no hay ContextMenu de Radix instalado
// en el repo; ver architecture/libreria-biblioteca-sync.md §6).
// ════════════════════════════════════════════════════════════════════════════


import { DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal } from "@/components/ui/dropdown-menu";
import { Volume2 } from "lucide-react";
import { useAurora } from "@/components/aurora/aurora-provider";
import { useSavedLibrary } from "@/lib/library-store";
import type { PersonalityProfile } from "@/lib/aurora/personalities";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
    ExternalLink, Eye, GitBranch, Copy, ClipboardCopy, ClipboardPaste,
    Link2, FolderInput, Tags, Share2, Send, ShieldCheck, Trash2, Package, Megaphone,
    PenSquare, History, MessageSquare, Boxes, ScrollText, Sparkles,
    type LucideIcon,
} from "lucide-react";

export interface FinderMenuTarget {
    kind: "item" | "folder";
    id: string;
    /** Escritura permitida sobre este target (ACL); oculta acciones de edición si false. */
    canWrite: boolean;
    /** true si es un alias (oculta Replicar/Duplicar: no tienen contenido propio). */
    isAlias?: boolean;
}

/** Acción genérica calculada por el llamador según formato/tipo (Adenda 65, §18). */
export interface FinderExtraAction {
    label: string;
    icon: LucideIcon;
    onClick: () => void;
}

export interface FinderContextMenuProps {
    x: number;
    y: number;
    target: FinderMenuTarget;
    clipboardHasContent: boolean;
    onOpen: () => void;
    onClose: () => void;
    onPreview?: () => void;
    onReplicate?: () => void;
    onDuplicate?: () => void;
    onCopy: () => void;
    onCut?: () => void;
    onPaste?: () => void;
    onCreateShortcut?: () => void;
    onMove: () => void;
    onTags: () => void;
    onShare: () => void;
    /** Adenda 66 §5: "Enviar a…" — abre el diálogo de destinos (publicación/mensaje/cerebro/entidad/librería/enlace). */
    onSendTo?: () => void;
    /** Abre el Lienzo de Creación con este ítem precargado (/publish?attach=…). */
    onPublish?: () => void;
    /** Publica en el catálogo público de la Librería (biblioteca → Comunidad). */
    onPublishToCatalog?: () => void;
    /** Solo folders: publica TODOS sus ítems (conservando estructura) en la Librería. */
    onPublishFolderToCatalog?: () => void;
    onPermissions: () => void;
    onRemove: () => void;
    /** v2.1 (§13): edita título/nota/contenido (crea versión con el estado anterior). */
    onEdit?: () => void;
    /** v2.1 (§13): historial de versiones (restaurar/comparar). */
    onVersions?: () => void;
    /**
     * v3 (Adenda 66 §2): HISTORIAL en la nube — revisiones con autor/fecha/mensaje,
     * restaurar, crear rama y comparar. Disponible para ítems Y folders.
     */
    onHistory?: () => void;
    /** v3 (Adenda 66 §2): REGISTRO (log) de accesos y cambios. Ítems y folders. */
    onLog?: () => void;
    /** v2.1 (§14): vista de ramas (linaje) + fusión con confirmación. */
    onBranches?: () => void;
    /** v2.1 (§15): hilo de comentarios (ítems y folders). */
    onComments?: () => void;
    /** v2.1 (§18): "Instalar/guardar en…" (biblioteca/escritorio/cerebro/servidor). */
    onInstallTo?: () => void;
    /** v2.1 (§18): acciones adicionales calculadas por formato (imagen/código/audio/vídeo/zip…). */
    extraActions?: FinderExtraAction[];
}

export function FinderContextMenu({
    x, y, target, clipboardHasContent,
    onOpen, onClose, onPreview, onReplicate, onDuplicate,
    onCopy, onCut, onPaste, onCreateShortcut, onMove, onTags,
    onShare, onSendTo, onPublish, onPublishToCatalog, onPublishFolderToCatalog, onPermissions, onRemove,
    onEdit, onVersions, onHistory, onLog, onBranches, onComments, onInstallTo, extraActions,
}: FinderContextMenuProps) {
    
    const aurora = useAurora();
    const speak = aurora?.speak;
    const { items } = useSavedLibrary();
    const personalities = items
        .filter((it) => it.kind === "personality" && (it as any).content)
        .map((it) => {
            try { return JSON.parse((it as any).content || "{}") as PersonalityProfile; } catch { return null; }
        })
        .filter(Boolean) as PersonalityProfile[];

    const isItem = target.kind === "item";
    const targetItem = items.find((i) => i.id === target.id);
    const itemText = targetItem
        ? targetItem.kind === "text"
            ? ((targetItem as { content?: string }).content || targetItem.title)
            : targetItem.title
        : "";

    const readWithAurora = (p?: PersonalityProfile) => {
        if (!itemText) return;
        speak?.(itemText, p);
        window.dispatchEvent(new CustomEvent("starseed:open-aurora-exocortex", { 
            detail: { text: itemText, personality: p } 
        }));
    };

    const copyToAuroraChat = () => {
        if (!itemText) return;
        import("sonner").then(({ toast }) => {
            window.dispatchEvent(
                new CustomEvent("aurora:inject-text", {
                    detail: { text: itemText.substring(0, 2000) },
                })
            );
            window.dispatchEvent(new CustomEvent("starseed:open-aurora-exocortex"));
            toast.success("Copiado al chat de Aurora");
        });
    };

    const wrap = (fn?: () => void) => () => {
        fn?.();
        onClose();
    };

    return (
        <DropdownMenu open onOpenChange={(o) => !o && onClose()}>
            <DropdownMenuContent
                align="start"
                sideOffset={0}
                style={{ position: "fixed", left: x, top: y, zIndex: 80 }}
                className="w-56 border-white/10 bg-black/90 backdrop-blur-2xl"
                onCloseAutoFocus={(e) => e.preventDefault()}
            >
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {isItem ? "Ítem" : "Folder"}
                </DropdownMenuLabel>

                <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(onOpen)}>
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir
                </DropdownMenuItem>
                {isItem && onPreview && (
                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(onPreview)}>
                        <Eye className="h-3.5 w-3.5" /> Vista previa
                    </DropdownMenuItem>
                )}

                                <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(() => {
                    try {
                        window.dispatchEvent(new CustomEvent("starseed:open-aurora-exocortex"));
                        window.dispatchEvent(new CustomEvent("aurora:suggest", { detail: { context: "finder-item", itemId: target.id, itemKind: target.kind } }));
                    } catch { /* noop */ }
                })}>
                    <MessageSquare className="h-3.5 w-3.5 text-blue-300" /> Copiar al chat
                </DropdownMenuItem>

                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="gap-2 text-xs cursor-pointer">
                        <Volume2 className="h-3.5 w-3.5 text-white/80" /> Leer en voz alta
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                        <DropdownMenuSubContent className="bg-black/90 border-white/10 backdrop-blur-xl z-[9999]">
                            <DropdownMenuItem className="text-xs text-white cursor-pointer" onClick={wrap(() => speak?.(`Seleccionaste el ${target.kind} con ID ${target.id}`, aurora?.activePersonality))}>
                                {aurora?.activePersonality?.name || "Predeterminada"} (Actual)
                            </DropdownMenuItem>
                            {personalities.map((p) => (
                                <DropdownMenuItem key={p.id} className="text-xs text-white cursor-pointer" onClick={wrap(() => speak?.(`Seleccionaste el ${target.kind} con ID ${target.id}`, p))}>
                                    {p.name}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                </DropdownMenuSub>

                {isItem && !target.isAlias && (
                    <>
                        <DropdownMenuSeparator className="bg-white/10" />
                        {onReplicate && (
                            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(onReplicate)}>
                                <GitBranch className="h-3.5 w-3.5" /> Replicar (rama)
                            </DropdownMenuItem>
                        )}
                        {onDuplicate && (
                            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(onDuplicate)}>
                                <Copy className="h-3.5 w-3.5" /> Duplicar
                            </DropdownMenuItem>
                        )}
                        {target.canWrite && onEdit && (
                            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(onEdit)}>
                                <PenSquare className="h-3.5 w-3.5" /> Editar…
                            </DropdownMenuItem>
                        )}
                    </>
                )}

                {/* Historial y Registro (Adenda 66 §2): también en FOLDERS, no solo en ítems. */}
                {(onHistory || onLog) && (
                    <>
                        <DropdownMenuSeparator className="bg-white/10" />
                        {onHistory && (
                            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(onHistory)}>
                                <History className="h-3.5 w-3.5" /> Historial…
                            </DropdownMenuItem>
                        )}
                        {onLog && (
                            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(onLog)}>
                                <ScrollText className="h-3.5 w-3.5" /> Registro…
                            </DropdownMenuItem>
                        )}
                    </>
                )}

                {isItem && !target.isAlias && (onVersions || onBranches) && (
                    <>
                        <DropdownMenuSeparator className="bg-white/10" />
                        {onVersions && (
                            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(onVersions)}>
                                <History className="h-3.5 w-3.5" /> Versiones (este dispositivo)…
                            </DropdownMenuItem>
                        )}
                        {onBranches && (
                            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(onBranches)}>
                                <GitBranch className="h-3.5 w-3.5" /> Ramas…
                            </DropdownMenuItem>
                        )}
                    </>
                )}

                {onComments && (
                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(onComments)}>
                        <MessageSquare className="h-3.5 w-3.5" /> Comentarios…
                    </DropdownMenuItem>
                )}

                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(onCopy)}>
                    <ClipboardCopy className="h-3.5 w-3.5" /> Copiar
                </DropdownMenuItem>
                {target.canWrite && onCut && (
                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(onCut)}>
                        <ClipboardCopy className="h-3.5 w-3.5" /> Cortar
                    </DropdownMenuItem>
                )}
                {!isItem && target.canWrite && clipboardHasContent && onPaste && (
                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(onPaste)}>
                        <ClipboardPaste className="h-3.5 w-3.5" /> Pegar en este folder
                    </DropdownMenuItem>
                )}
                {isItem && onCreateShortcut && (
                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(onCreateShortcut)}>
                        <Link2 className="h-3.5 w-3.5" /> Crear acceso directo
                    </DropdownMenuItem>
                )}

                <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-[#7fb8ff] focus:text-[#7fb8ff]" onClick={wrap(copyToAuroraChat)}>
                    <MessageSquare className="h-3.5 w-3.5" /> Copiar al chat de Aurora
                </DropdownMenuItem>

                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="cursor-pointer gap-2 text-xs text-[#7fb8ff] focus:text-[#7fb8ff]">
                        <Volume2 className="h-3.5 w-3.5" /> Leer con Aurora
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                        <DropdownMenuSubContent className="w-56 border-white/10 bg-black/95 text-white backdrop-blur-2xl">
                            <DropdownMenuItem className="cursor-pointer text-xs" onClick={wrap(() => readWithAurora())}>
                                Predeterminada ({aurora?.activePersonality?.name || "Aurora"})
                            </DropdownMenuItem>
                            {personalities.length > 0 && (
                                <>
                                    <DropdownMenuSeparator className="bg-white/10" />
                                    <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">Otras</DropdownMenuLabel>
                                    {personalities.map((p) => (
                                        <DropdownMenuItem
                                            key={p.id}
                                            className="cursor-pointer text-xs"
                                            onClick={wrap(() => readWithAurora(p))}
                                        >
                                            {p.name}
                                        </DropdownMenuItem>
                                    ))}
                                </>
                            )}
                        </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                </DropdownMenuSub>

                {target.canWrite && (
                    <>
                        <DropdownMenuSeparator className="bg-white/10" />
                        <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(onMove)}>
                            <FolderInput className="h-3.5 w-3.5" /> Mover a…
                        </DropdownMenuItem>
                        {isItem && (
                            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(onTags)}>
                                <Tags className="h-3.5 w-3.5" /> Etiquetas…
                            </DropdownMenuItem>
                        )}
                    </>
                )}

                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(onShare)}>
                    <Share2 className="h-3.5 w-3.5" /> Compartir
                </DropdownMenuItem>
                {onSendTo && (
                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(onSendTo)}>
                        <Send className="h-3.5 w-3.5" /> Enviar a…
                    </DropdownMenuItem>
                )}
                {isItem && onPublish && (
                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(onPublish)}>
                        <Megaphone className="h-3.5 w-3.5" /> Publicar…
                    </DropdownMenuItem>
                )}
                {isItem && onPublishToCatalog && (
                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-emerald-300 focus:text-emerald-200" onClick={wrap(onPublishToCatalog)}>
                        <Package className="h-3.5 w-3.5" /> Publicar en la Librería…
                    </DropdownMenuItem>
                )}
                {!isItem && onPublishFolderToCatalog && (
                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-emerald-300 focus:text-emerald-200" onClick={wrap(onPublishFolderToCatalog)}>
                        <Package className="h-3.5 w-3.5" /> Publicar folder completo…
                    </DropdownMenuItem>
                )}

                {isItem && (onInstallTo || (extraActions && extraActions.length > 0)) && (
                    <>
                        <DropdownMenuSeparator className="bg-white/10" />
                        {onInstallTo && (
                            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(onInstallTo)}>
                                <Boxes className="h-3.5 w-3.5" /> Instalar / guardar en…
                            </DropdownMenuItem>
                        )}
                        {extraActions?.map((a, i) => (
                            <DropdownMenuItem key={`${a.label}-${i}`} className="cursor-pointer gap-2 text-xs" onClick={wrap(a.onClick)}>
                                <a.icon className="h-3.5 w-3.5" /> {a.label}
                            </DropdownMenuItem>
                        ))}
                    </>
                )}

                {target.canWrite && (
                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(onPermissions)}>
                        <ShieldCheck className="h-3.5 w-3.5" /> Permisos…
                    </DropdownMenuItem>
                )}

                {target.canWrite && (
                    <>
                        <DropdownMenuSeparator className="bg-white/10" />
                        <DropdownMenuItem className="cursor-pointer gap-2 text-xs text-rose-300 focus:text-rose-200" onClick={wrap(onRemove)}>
                            <Trash2 className="h-3.5 w-3.5" /> Quitar
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export default FinderContextMenu;
