"use client";

/*
 * BoardShareDialog — "Compartir pizarra…" (SOP §11): crea un os_spaces
 * kind='board' copiando el doc actual del lienzo (bloques + aristas).
 * Distinto del toggle `canvas.shared` existente (referencia simple
 * compartible) — este es el espacio COLABORATIVO real con realtime.
 * La pizarra personal queda intacta; el espacio es la variante compartida.
 */

import { useCallback, useState } from "react";
import { Share2, Users2, Globe, Lock, UserPlus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createSpace, inviteToSpaceByUsername, type SpaceAccess } from "@/lib/spaces/spaces";
import type { Canvas } from "@/lib/canvas/canvas";
import { getEdges } from "@/lib/canvas/workcenters";

const ACCESS_OPTIONS: Array<{ id: SpaceAccess; label: string; icon: typeof Lock }> = [
    { id: "invite", label: "Invitados", icon: UserPlus },
    { id: "profiles", label: "Perfiles", icon: Users2 },
    { id: "public", label: "Público", icon: Globe },
    { id: "private", label: "Privado", icon: Lock },
];

export function BoardShareDialog({
    canvas,
    open,
    onClose,
}: {
    canvas: Canvas;
    open: boolean;
    onClose: () => void;
}) {
    const [title, setTitle] = useState(canvas.title || "Pizarra compartida");
    const [access, setAccess] = useState<SpaceAccess>("invite");
    const [groupSlug, setGroupSlug] = useState("");
    const [inviteUsername, setInviteUsername] = useState("");
    const [creating, setCreating] = useState(false);
    const [created, setCreated] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleCreate = useCallback(async () => {
        setCreating(true);
        setError(null);
        try {
            const space = await createSpace({
                kind: "board",
                title: title.trim() || "Pizarra compartida",
                access,
                groupSlug: groupSlug.trim() || null,
                doc: { blocks: canvas.blocks, edges: getEdges(canvas) } as Record<string, unknown>,
            });
            if (!space) {
                setError("No se pudo crear el espacio. Inicia sesión e inténtalo de nuevo.");
                return;
            }
            if (access === "invite" && inviteUsername.trim()) {
                await inviteToSpaceByUsername(space.id, inviteUsername.trim());
            }
            setCreated(true);
        } finally {
            setCreating(false);
        }
    }, [title, access, groupSlug, inviteUsername, canvas]);

    const handleClose = () => {
        setCreated(false);
        setError(null);
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
            <DialogContent className="max-w-md border-white/10 bg-zinc-950/95 backdrop-blur-2xl">
                <DialogHeader>
                    <DialogTitle>Compartir pizarra</DialogTitle>
                    <DialogDescription>
                        Crea un espacio colaborativo a partir de este lienzo. Tu pizarra personal no se modifica.
                    </DialogDescription>
                </DialogHeader>

                {created ? (
                    <div className="space-y-2 py-2 text-sm">
                        <p className="font-semibold text-emerald-300">Espacio creado correctamente.</p>
                        <p className="text-xs text-white/50">
                            Aparecerá en «Pizarras compartidas conmigo» para todos los colaboradores con acceso.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3 py-1">
                        <div>
                            <label className="mb-1 block text-[11px] font-semibold text-white/50">Título</label>
                            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-black/30 border-white/10" />
                        </div>
                        <div>
                            <label className="mb-1 block text-[11px] font-semibold text-white/50">Acceso</label>
                            <div className="grid grid-cols-4 gap-1.5">
                                {ACCESS_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => setAccess(opt.id)}
                                        className={cn(
                                            "flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-bold transition-colors cursor-pointer",
                                            access === opt.id
                                                ? "border-amber-400/50 bg-amber-400/15 text-amber-100"
                                                : "border-white/10 text-white/50 hover:bg-white/5",
                                        )}
                                    >
                                        <opt.icon className="size-3" /> {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {access === "invite" && (
                            <div>
                                <label className="mb-1 block text-[11px] font-semibold text-white/50">Invitar por @usuario (opcional)</label>
                                <Input
                                    value={inviteUsername}
                                    onChange={(e) => setInviteUsername(e.target.value)}
                                    placeholder="@usuario"
                                    className="bg-black/30 border-white/10"
                                />
                            </div>
                        )}
                        <div>
                            <label className="mb-1 block text-[11px] font-semibold text-white/50">Grupo (opcional)</label>
                            <Input
                                value={groupSlug}
                                onChange={(e) => setGroupSlug(e.target.value)}
                                placeholder="slug-del-grupo"
                                className="bg-black/30 border-white/10"
                            />
                        </div>
                        {error && <p className="text-xs text-red-300">{error}</p>}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" className="border-white/15 cursor-pointer" onClick={handleClose}>
                        {created ? "Cerrar" : "Cancelar"}
                    </Button>
                    {!created && (
                        <Button className="gap-1.5 cursor-pointer bg-amber-600 hover:bg-amber-500" disabled={creating} onClick={handleCreate}>
                            {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Share2 className="size-3.5" />}
                            Compartir
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Botón compacto "Compartir pizarra…" listo para insertar en la toolbar. */
export function BoardShareTrigger({ onClick }: { onClick: () => void }) {
    return (
        <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-8 border-amber-500/30 text-amber-100 cursor-pointer"
            onClick={onClick}
            title="Crear un espacio colaborativo a partir de este lienzo"
        >
            <Share2 className="w-3.5 h-3.5" /> Compartir pizarra…
        </Button>
    );
}
