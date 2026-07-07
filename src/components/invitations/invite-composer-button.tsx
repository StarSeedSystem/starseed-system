"use client";

/*
 * InviteComposerButton — botón + diálogo para invitar a grupo/página/evento
 * desde el compositor de Mensajes o Correos. Busca en "Contenido de la red"
 * (@/lib/files/network-content-ref.ts, filtrado a grupo/página/evento — no
 * tiene sentido "invitar" a una publicación) y entrega el adjunto de
 * invitación ya construido (@/lib/invitations/invitations.ts) al llamador,
 * que lo añade a sus adjuntos pendientes exactamente igual que un archivo.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2, Mail, Search, Users2, FileText, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { searchNetworkContent, type NetworkContentRef } from "@/lib/files/network-content-ref";
import { buildInviteAttachment, type InviteTargetKind } from "@/lib/invitations/invitations";

export type InviteAttachmentPayload = ReturnType<typeof buildInviteAttachment>;

export interface InviteComposerButtonProps {
    onPick: (attachment: InviteAttachmentPayload) => void;
    className?: string;
    children?: ReactNode;
    title?: string;
}

const ICONS: Record<string, typeof Users2> = { group: Users2, page: FileText, event: CalendarDays };

export function InviteComposerButton({ onPick, className, children, title = "Invitar a…" }: InviteComposerButtonProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<NetworkContentRef[]>([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (!open) {
            setQuery("");
            setResults([]);
        }
    }, [open]);

    useEffect(() => {
        const term = query.trim();
        if (term.length < 1) {
            setResults([]);
            return;
        }
        setSearching(true);
        const t = setTimeout(async () => {
            const res = await searchNetworkContent(term);
            setResults(res.filter((r) => r.refKind !== "post"));
            setSearching(false);
        }, 250);
        return () => clearTimeout(t);
    }, [query]);

    const pick = (r: NetworkContentRef) => {
        onPick(buildInviteAttachment({ targetKind: r.refKind as InviteTargetKind, refId: r.refId, name: r.name }));
        setOpen(false);
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={cn("cursor-pointer transition-colors duration-200", className)}
            >
                {children ?? <Mail className="size-4" />}
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Mail className="size-4 text-cyan-300" /> {title}
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Busca un grupo, página/comunidad o evento para invitar.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/30" />
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Buscar por nombre…"
                                className="h-9 rounded-lg border-white/10 bg-black/20 pl-8 text-sm"
                                autoFocus
                            />
                            {searching && (
                                <Loader2 className="absolute right-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-white/30" />
                            )}
                        </div>
                        <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                            {results.map((r) => {
                                const Icon = ICONS[r.refKind] ?? FileText;
                                return (
                                    <button
                                        key={`${r.refKind}:${r.refId}`}
                                        type="button"
                                        onClick={() => pick(r)}
                                        className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-left transition-colors duration-200 hover:border-cyan-400/30 hover:bg-white/[0.06]"
                                    >
                                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/5">
                                            <Icon className="size-3.5 text-white/60" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-xs font-medium text-white/85">{r.name}</p>
                                            {r.description && <p className="truncate text-[10px] text-white/40">{r.description}</p>}
                                        </div>
                                    </button>
                                );
                            })}
                            {!searching && query.trim().length > 0 && results.length === 0 && (
                                <p className="py-6 text-center text-xs text-white/35">Sin resultados.</p>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default InviteComposerButton;
