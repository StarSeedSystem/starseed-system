"use client";

// src/components/education/study/study-groups-panel.tsx
// Grupos de estudio: crear · unirse/salir · miembros reales · chat en tiempo real.
// Todo opcional y libre. Datos reales (study_groups/_members/_posts) con RLS.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
    Users,
    Plus,
    LogIn,
    LogOut,
    Trash2,
    Send,
    Globe,
    Lock,
    Loader2,
    MessageCircle,
    UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
    type StudyGroup,
    type StudyGroupMember,
    type StudyGroupPost,
    listStudyGroups,
    myGroupIds,
    createStudyGroup,
    joinStudyGroup,
    leaveStudyGroup,
    deleteStudyGroup,
    listGroupMembers,
    listGroupPosts,
    postToGroup,
    subscribeGroupPosts,
    currentUid,
} from "@/lib/education/study";

export function StudyGroupsPanel() {
    const [groups, setGroups] = useState<StudyGroup[]>([]);
    const [mine, setMine] = useState<Set<string>>(new Set());
    const [uid, setUid] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<StudyGroup | null>(null);

    // Crear grupo
    const [showCreate, setShowCreate] = useState(false);
    const [name, setName] = useState("");
    const [desc, setDesc] = useState("");
    const [isPublic, setIsPublic] = useState(true);
    const [creating, setCreating] = useState(false);

    const reload = useCallback(async () => {
        const [gs, ids] = await Promise.all([listStudyGroups(), myGroupIds()]);
        setGroups(gs);
        setMine(ids);
        setLoading(false);
    }, []);

    useEffect(() => {
        void currentUid().then(setUid);
        void reload();
    }, [reload]);

    const doCreate = async () => {
        if (!name.trim()) return;
        setCreating(true);
        const g = await createStudyGroup({ name, description: desc, isPublic });
        setCreating(false);
        if (!g) {
            toast.error("Inicia sesión para crear un grupo de estudio.");
            return;
        }
        toast.success(`Grupo "${g.name}" creado`);
        setName("");
        setDesc("");
        setShowCreate(false);
        await reload();
        setSelected(g);
    };

    const doJoin = async (g: StudyGroup) => {
        const ok = await joinStudyGroup(g.id);
        if (ok) {
            toast.success(`Te uniste a "${g.name}"`);
            await reload();
        } else toast.error("No se pudo unir. ¿Has iniciado sesión?");
    };

    const doLeave = async (g: StudyGroup) => {
        const ok = await leaveStudyGroup(g.id);
        if (ok) {
            toast.success(`Saliste de "${g.name}"`);
            if (selected?.id === g.id) setSelected(null);
            await reload();
        } else toast.error("No se pudo salir.");
    };

    const doDelete = async (g: StudyGroup) => {
        const ok = await deleteStudyGroup(g.id);
        if (ok) {
            toast.success("Grupo eliminado");
            if (selected?.id === g.id) setSelected(null);
            await reload();
        } else toast.error("Solo el creador puede eliminar el grupo.");
    };

    if (loading) {
        return (
            <div className="flex min-h-[30vh] items-center justify-center text-white/60">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando grupos de estudio…
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 lg:flex-row">
            {/* Lista + crear */}
            <div className="min-w-0 flex-1 space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-white/90">
                        <Users className="h-4 w-4 text-emerald-300" /> Grupos de estudio
                    </h3>
                    <Button size="sm" variant="outline" onClick={() => setShowCreate((s) => !s)}>
                        <Plus className="h-4 w-4" /> Crear
                    </Button>
                </div>

                {showCreate && (
                    <div className="space-y-2 rounded-2xl border border-white/10 bg-black/30 p-3">
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del grupo (p.ej. Física cuántica para curiosos)" />
                        <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="¿De qué va el grupo? (opcional)" rows={2} />
                        <div className="flex items-center justify-between">
                            <label className="flex cursor-pointer items-center gap-2 text-xs text-white/70">
                                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
                                {isPublic ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                                {isPublic ? "Público (cualquiera puede unirse)" : "Privado (solo por invitación del creador)"}
                            </label>
                            <Button size="sm" onClick={doCreate} disabled={!name.trim() || creating}>
                                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Crear grupo
                            </Button>
                        </div>
                    </div>
                )}

                {groups.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/12 p-8 text-center text-sm text-muted-foreground">
                        Aún no hay grupos de estudio. Crea el primero — es libre y opcional.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {groups.map((g) => {
                            const joined = mine.has(g.id);
                            const isOwner = uid && g.owner === uid;
                            const isSel = selected?.id === g.id;
                            return (
                                <div
                                    key={g.id}
                                    className={cn(
                                        "rounded-2xl border p-3 transition",
                                        isSel ? "border-emerald-400/40 bg-emerald-500/[0.06]" : "border-white/10 bg-black/20 hover:border-white/20",
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <button className="min-w-0 flex-1 text-left" onClick={() => setSelected(g)}>
                                            <div className="flex items-center gap-2">
                                                <span className="truncate text-sm font-semibold text-white/90">{g.name}</span>
                                                {g.is_public ? (
                                                    <Globe className="h-3 w-3 shrink-0 text-white/40" />
                                                ) : (
                                                    <Lock className="h-3 w-3 shrink-0 text-white/40" />
                                                )}
                                            </div>
                                            {g.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{g.description}</p>}
                                            {g.topic_name && (
                                                <Badge variant="secondary" className="mt-1 text-[10px]">{g.topic_name}</Badge>
                                            )}
                                        </button>
                                        <div className="flex shrink-0 flex-col items-end gap-1">
                                            {joined ? (
                                                <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-white/70" onClick={() => doLeave(g)}>
                                                    <LogOut className="h-3.5 w-3.5" /> Salir
                                                </Button>
                                            ) : (
                                                <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => doJoin(g)}>
                                                    <LogIn className="h-3.5 w-3.5" /> Unirse
                                                </Button>
                                            )}
                                            {isOwner && (
                                                <button onClick={() => doDelete(g)} className="rounded p-1 text-white/30 hover:bg-red-500/20 hover:text-red-300" title="Eliminar grupo">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Detalle: miembros + chat */}
            <div className="lg:w-[22rem] lg:shrink-0">
                {selected ? (
                    <GroupDetail
                        group={selected}
                        uid={uid}
                        joined={mine.has(selected.id)}
                        onJoin={() => doJoin(selected)}
                        onClose={() => setSelected(null)}
                    />
                ) : (
                    <div className="flex h-full min-h-[30vh] items-center justify-center rounded-2xl border border-dashed border-white/12 p-6 text-center text-sm text-muted-foreground">
                        Selecciona un grupo para ver a sus miembros y su chat.
                    </div>
                )}
            </div>
        </div>
    );
}

function GroupDetail({
    group,
    uid,
    joined,
    onJoin,
    onClose,
}: {
    group: StudyGroup;
    uid: string | null;
    joined: boolean;
    onJoin: () => void;
    onClose: () => void;
}) {
    const [members, setMembers] = useState<StudyGroupMember[]>([]);
    const [posts, setPosts] = useState<StudyGroupPost[]>([]);
    const [draft, setDraft] = useState("");
    const [sending, setSending] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const loadPosts = useCallback(async () => {
        setPosts(await listGroupPosts(group.id));
    }, [group.id]);

    useEffect(() => {
        void listGroupMembers(group.id).then(setMembers);
        void loadPosts();
        const unsub = subscribeGroupPosts(group.id, () => void loadPosts());
        return unsub;
    }, [group.id, loadPosts]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }, [posts]);

    const send = async () => {
        if (!draft.trim()) return;
        setSending(true);
        const p = await postToGroup(group.id, draft);
        setSending(false);
        if (p) {
            setDraft("");
            await loadPosts();
        } else {
            toast.error(joined ? "No se pudo enviar." : "Únete al grupo para participar en el chat.");
        }
    };

    return (
        <div className="flex h-full min-h-[30vh] flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/30">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 p-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white/90">{group.name}</p>
                    <p className="flex items-center gap-1 text-[11px] text-white/45">
                        <Users className="h-3 w-3" /> {members.length} miembro{members.length === 1 ? "" : "s"}
                    </p>
                </div>
                <button onClick={onClose} className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/80 lg:hidden">✕</button>
            </div>

            {/* Miembros */}
            <div className="flex flex-wrap gap-1 border-b border-white/10 p-2">
                {members.map((m) => (
                    <span
                        key={m.account}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/70"
                        title={m.account === uid ? "Tú" : m.account}
                    >
                        <UserRound className="h-3 w-3" />
                        {m.account === uid ? "Tú" : `${m.account.slice(0, 6)}…`}
                        {m.role === "owner" && <span className="text-amber-300/80">·dueño</span>}
                    </span>
                ))}
            </div>

            {/* Chat */}
            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
                {posts.length === 0 ? (
                    <p className="flex flex-col items-center gap-1 py-8 text-center text-xs text-muted-foreground">
                        <MessageCircle className="h-5 w-5 text-white/30" />
                        Sin mensajes todavía. Rompe el hielo.
                    </p>
                ) : (
                    posts.map((p) => {
                        const mineMsg = p.author === uid;
                        return (
                            <div key={p.id} className={cn("flex", mineMsg ? "justify-end" : "justify-start")}>
                                <div
                                    className={cn(
                                        "max-w-[85%] rounded-2xl px-3 py-1.5 text-sm",
                                        mineMsg ? "bg-emerald-500/20 text-emerald-50" : "bg-white/[0.06] text-white/85",
                                    )}
                                >
                                    {!mineMsg && <p className="mb-0.5 text-[10px] text-white/40">{p.author.slice(0, 6)}…</p>}
                                    <p className="whitespace-pre-wrap break-words">{p.body}</p>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Composer */}
            <div className="border-t border-white/10 p-2">
                {joined ? (
                    <div className="flex items-end gap-2">
                        <Textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    void send();
                                }
                            }}
                            placeholder="Escribe un mensaje…"
                            rows={1}
                            className="min-h-[38px] resize-none text-sm"
                        />
                        <Button size="icon" onClick={send} disabled={!draft.trim() || sending} className="shrink-0">
                            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                    </div>
                ) : (
                    <Button size="sm" variant="outline" className="w-full" onClick={onJoin}>
                        <LogIn className="h-4 w-4" /> Únete para participar en el chat
                    </Button>
                )}
            </div>
        </div>
    );
}

export default StudyGroupsPanel;
