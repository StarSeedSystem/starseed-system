"use client";

/*
 * NewChatDialog — nuevo chat directo o grupo, con búsqueda de usuarios del
 * directorio (os_profiles). Llama a seedMyProfile() al montar (garantiza que
 * el usuario actual sea buscable/tenga fila antes de operar).
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Loader2, Search, User, Users2, X } from "lucide-react";
import { searchUsers, seedMyProfile, type OsProfile } from "@/lib/social/os-profiles";
import { createDm, createGroup } from "@/lib/messages/dm";

export interface NewChatDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: (threadId: string) => void;
}

export function NewChatDialog({ open, onOpenChange, onCreated }: NewChatDialogProps) {
    const [tab, setTab] = useState<"dm" | "group">("dm");
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<OsProfile[]>([]);
    const [searching, setSearching] = useState(false);
    const [selected, setSelected] = useState<OsProfile[]>([]);
    const [groupTitle, setGroupTitle] = useState("");
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        if (open) void seedMyProfile();
    }, [open]);

    useEffect(() => {
        if (!open) {
            setQuery("");
            setResults([]);
            setSelected([]);
            setGroupTitle("");
            setTab("dm");
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
            const res = await searchUsers(term);
            setResults(res.filter((r) => !selected.some((s) => s.userId === r.userId)));
            setSearching(false);
        }, 250);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    const toggleSelect = (p: OsProfile) => {
        setSelected((prev) => (prev.some((s) => s.userId === p.userId) ? prev.filter((s) => s.userId !== p.userId) : [...prev, p]));
        setResults((prev) => prev.filter((r) => r.userId !== p.userId));
    };

    const removeSelected = (userId: string) => {
        setSelected((prev) => prev.filter((s) => s.userId !== userId));
    };

    const handleStartDm = async (p: OsProfile) => {
        setCreating(true);
        try {
            const res = await createDm(p.userId);
            if (res.needsAuth) {
                toast.error("Inicia sesión para escribir a alguien.");
                return;
            }
            if (!res.ok || !res.thread) {
                toast.error(res.error || "No se pudo iniciar la conversación.");
                return;
            }
            onOpenChange(false);
            onCreated(res.thread.id);
        } finally {
            setCreating(false);
        }
    };

    const handleCreateGroup = async () => {
        if (!selected.length) {
            toast.error("Elige al menos una persona para el grupo.");
            return;
        }
        setCreating(true);
        try {
            const res = await createGroup(groupTitle.trim() || "Nuevo grupo", selected.map((s) => s.userId));
            if (res.needsAuth) {
                toast.error("Inicia sesión para crear un grupo.");
                return;
            }
            if (!res.ok || !res.thread) {
                toast.error(res.error || "No se pudo crear el grupo.");
                return;
            }
            onOpenChange(false);
            onCreated(res.thread.id);
        } finally {
            setCreating(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md border-white/10 bg-black/90 backdrop-blur-2xl">
                <DialogHeader>
                    <DialogTitle className="font-headline">Nuevo chat</DialogTitle>
                    <DialogDescription>Busca personas en toda la red StarSeed.</DialogDescription>
                </DialogHeader>

                <Tabs value={tab} onValueChange={(v) => setTab(v as "dm" | "group")}>
                    <TabsList className="grid grid-cols-2 w-full">
                        <TabsTrigger value="dm" className="gap-1.5 text-xs"><User className="w-3.5 h-3.5" /> Directo</TabsTrigger>
                        <TabsTrigger value="group" className="gap-1.5 text-xs"><Users2 className="w-3.5 h-3.5" /> Grupo</TabsTrigger>
                    </TabsList>

                    {tab === "group" && (
                        <Input
                            value={groupTitle}
                            onChange={(e) => setGroupTitle(e.target.value)}
                            placeholder="Nombre del grupo (opcional)"
                            className="mt-3 h-9 text-sm"
                        />
                    )}

                    {tab === "group" && selected.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                            {selected.map((s) => (
                                <Badge key={s.userId} variant="secondary" className="gap-1 pr-1">
                                    {s.displayName}
                                    <button type="button" className="cursor-pointer" onClick={() => removeSelected(s.userId)}>
                                        <X className="w-3 h-3" />
                                    </button>
                                </Badge>
                            ))}
                        </div>
                    )}

                    <div className="relative mt-3">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Buscar por nombre o @usuario…"
                            className="pl-8 h-9 text-sm"
                            autoFocus
                        />
                        {searching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    </div>

                    <TabsContent value="dm" className="mt-2 max-h-72 overflow-y-auto space-y-1">
                        {results.map((p) => (
                            <button
                                key={p.userId}
                                type="button"
                                onClick={() => void handleStartDm(p)}
                                disabled={creating}
                                className="flex items-center gap-3 w-full p-2 rounded-xl text-left hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
                            >
                                <Avatar className="h-9 w-9">
                                    <AvatarImage src={p.avatarUrl} />
                                    <AvatarFallback>{p.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold truncate">{p.displayName}</p>
                                    <p className="text-xs text-muted-foreground truncate">@{p.username}</p>
                                </div>
                            </button>
                        ))}
                        {query.trim().length > 0 && !searching && results.length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-4">Sin resultados para "{query}"</p>
                        )}
                    </TabsContent>

                    <TabsContent value="group" className="mt-2 max-h-72 overflow-y-auto space-y-1">
                        {results.map((p) => (
                            <button
                                key={p.userId}
                                type="button"
                                onClick={() => toggleSelect(p)}
                                className={cn(
                                    "flex items-center gap-3 w-full p-2 rounded-xl text-left hover:bg-white/5 transition-colors cursor-pointer",
                                )}
                            >
                                <Avatar className="h-9 w-9">
                                    <AvatarImage src={p.avatarUrl} />
                                    <AvatarFallback>{p.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold truncate">{p.displayName}</p>
                                    <p className="text-xs text-muted-foreground truncate">@{p.username}</p>
                                </div>
                            </button>
                        ))}
                    </TabsContent>
                </Tabs>

                {tab === "group" && (
                    <DialogFooter>
                        <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>Cancelar</Button>
                        <Button className="cursor-pointer gap-1.5" onClick={() => void handleCreateGroup()} disabled={creating || !selected.length}>
                            {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                            Crear grupo ({selected.length})
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}

export default NewChatDialog;
