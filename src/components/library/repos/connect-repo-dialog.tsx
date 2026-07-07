"use client";

// ════════════════════════════════════════════════════════════════════════════
// ConnectRepoDialog — "Conectar repositorio externo" por URL de GitHub
// (Adenda 65, §17). Pega la URL → proxy de servidor → ficha cacheada guardada
// como ítem `type:"repo"` en la Biblioteca.
// ════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link2, Loader2 } from "lucide-react";
import { connectRepo } from "@/lib/library/connected-repos";
import type { EntityRef } from "@/lib/sync/entity-state";

export interface ConnectRepoDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    entityRef: EntityRef;
    folderId: string | null;
    onConnected: (itemId: string) => void;
}

export function ConnectRepoDialog({ open, onOpenChange, entityRef, folderId, onConnected }: ConnectRepoDialogProps) {
    const [url, setUrl] = useState("");
    const [busy, setBusy] = useState(false);

    const handleConnect = async () => {
        if (!url.trim()) return;
        setBusy(true);
        const res = await connectRepo(entityRef, url, folderId);
        setBusy(false);
        if (res.ok && res.id) {
            toast.success("Repositorio conectado", { description: url.trim() });
            setUrl("");
            onConnected(res.id);
            onOpenChange(false);
        } else {
            toast.error("No se pudo conectar", { description: res.error });
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Link2 className="h-4 w-4" /> Conectar repositorio externo
                    </DialogTitle>
                    <DialogDescription>
                        Pega la URL de un repo público de GitHub (o «usuario/repositorio»). Se guarda una ficha con sus
                        metadatos — lectura pública, sin token; escritura real en GitHub llegará más adelante.
                    </DialogDescription>
                </DialogHeader>
                <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://github.com/usuario/repositorio"
                    className="h-9 border-white/15 bg-black/30 text-xs"
                    onKeyDown={(e) => {
                        if (e.key === "Enter") void handleConnect();
                    }}
                />
                <DialogFooter>
                    <Button type="button" variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button type="button" onClick={() => void handleConnect()} disabled={busy || !url.trim()} className="cursor-pointer gap-2">
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                        Conectar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default ConnectRepoDialog;
