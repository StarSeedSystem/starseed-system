"use client";

// ════════════════════════════════════════════════════════════════════════════
// FinderContextMenu — menú contextual (clic derecho / long-press) de un ítem
// o carpeta de la Biblioteca. Posicionado en (x,y) mediante un ancla invisible
// + DropdownMenu de Radix controlado (no hay ContextMenu de Radix instalado
// en el repo; ver architecture/libreria-biblioteca-sync.md §6).
// ════════════════════════════════════════════════════════════════════════════

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
    ExternalLink, Eye, GitBranch, Copy, ClipboardCopy, ClipboardPaste,
    Link2, FolderInput, Tags, Share2, ShieldCheck, Trash2, Package, Megaphone,
} from "lucide-react";

export interface FinderMenuTarget {
    kind: "item" | "folder";
    id: string;
    /** Escritura permitida sobre este target (ACL); oculta acciones de edición si false. */
    canWrite: boolean;
    /** true si es un alias (oculta Replicar/Duplicar: no tienen contenido propio). */
    isAlias?: boolean;
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
    /** Abre el Lienzo de Creación con este ítem precargado (/publish?attach=…). */
    onPublish?: () => void;
    /** Publica en el catálogo público de la Librería (biblioteca → Comunidad). */
    onPublishToCatalog?: () => void;
    /** Solo carpetas: publica TODOS sus ítems (conservando estructura) en la Librería. */
    onPublishFolderToCatalog?: () => void;
    onPermissions: () => void;
    onRemove: () => void;
}

export function FinderContextMenu({
    x, y, target, clipboardHasContent,
    onOpen, onClose, onPreview, onReplicate, onDuplicate,
    onCopy, onCut, onPaste, onCreateShortcut, onMove, onTags,
    onShare, onPublish, onPublishToCatalog, onPublishFolderToCatalog, onPermissions, onRemove,
}: FinderContextMenuProps) {
    const isItem = target.kind === "item";
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
                    {isItem ? "Ítem" : "Carpeta"}
                </DropdownMenuLabel>

                <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(onOpen)}>
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir
                </DropdownMenuItem>
                {isItem && onPreview && (
                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(onPreview)}>
                        <Eye className="h-3.5 w-3.5" /> Vista previa
                    </DropdownMenuItem>
                )}

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
                    </>
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
                        <ClipboardPaste className="h-3.5 w-3.5" /> Pegar en esta carpeta
                    </DropdownMenuItem>
                )}
                {isItem && onCreateShortcut && (
                    <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(onCreateShortcut)}>
                        <Link2 className="h-3.5 w-3.5" /> Crear acceso directo
                    </DropdownMenuItem>
                )}

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
                        <Package className="h-3.5 w-3.5" /> Publicar carpeta completa…
                    </DropdownMenuItem>
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
