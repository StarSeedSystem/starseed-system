"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Servidores de Apps (/servidores-apps)
 * ---------------------------------------------------------------------------
 * Apps/juegos/entornos/programas compartidos EN TIEMPO REAL entre miembros.
 * Distinto de /servidores (servidores de CEREBROS/IA — Ollama/VPS/servicios):
 * esta sección es sobre SERVIDORES SOCIALES DE APLICACIÓN (contadores, notas
 * colaborativas, salas de juego…) que cualquier usuario puede crear y compartir.
 *
 *   · Explorar (públicos) · Míos (donde soy miembro activo) · De mis grupos
 *   · Crear servidor: nombre, tipo, visibilidad, app instalada (ruta o URL)
 *   · Tarjetas con unirse/solicitar (ServerCard, compartido con mensajes)
 *   · Panel del servidor: miembros, solicitudes pendientes (aprobar/denegar si
 *     eres dueño), abrir la app, y demo mínima de estado compartido en vivo
 *     (contador colaborativo) vía `useServerChannel`.
 *
 * SOP: architecture/libreria-biblioteca-sync.md §8.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
    Server, Plus, Compass, Users2, Loader2, Crown, Check, X, ExternalLink,
    Minus, RefreshCcw, Wifi, WifiOff, ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    createServer, listServers, listServerMembers, approve, deny, leave,
    subscribeMembers, fetchServerBySlug,
    type AppServerSummary, type ServerKind, type ServerVisibility,
} from "@/lib/servers/app-servers";
import { useServerChannel } from "@/lib/servers/server-channel";
import { ServerCard } from "@/components/servers/server-card";
import { useOsGroups } from "@/hooks/use-os-entities";
import { getCurrentUserId } from "@/lib/os-social";
import { fetchProfilesByIds, type OsProfile } from "@/lib/social/os-profiles";

/* ─────────────────────────── Crear servidor (diálogo) ──────────────────── */

const KIND_OPTIONS: { value: ServerKind; label: string }[] = [
    { value: "app", label: "App" },
    { value: "juego", label: "Juego" },
    { value: "entorno", label: "Entorno" },
    { value: "programa", label: "Programa" },
    { value: "otro", label: "Otro" },
];

function CreateServerDialog({ myGroups, onCreated }: { myGroups: { slug: string; name: string }[]; onCreated: () => void }) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [kind, setKind] = useState<ServerKind>("app");
    const [visibility, setVisibility] = useState<ServerVisibility>("public");
    const [groupSlug, setGroupSlug] = useState<string>("");
    const [appRoute, setAppRoute] = useState("");
    const [appUrl, setAppUrl] = useState("");
    const [saving, setSaving] = useState(false);

    const handleCreate = async () => {
        if (!name.trim()) {
            toast.error("Ponle un nombre al servidor.");
            return;
        }
        setSaving(true);
        try {
            const res = await createServer({
                name: name.trim(),
                description: description.trim(),
                kind,
                visibility,
                groupSlug: visibility === "group" ? groupSlug || null : null,
                appRoute: appRoute.trim() || null,
                appUrl: appUrl.trim() || null,
            });
            if (res.needsAuth) {
                toast.error("Inicia sesión para crear un servidor.");
                return;
            }
            if (!res.ok) {
                toast.error(res.error || "No se pudo crear el servidor.");
                return;
            }
            toast.success(`Servidor «${res.server?.name}» creado.`);
            setOpen(false);
            setName("");
            setDescription("");
            setAppRoute("");
            setAppUrl("");
            onCreated();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="btn-pill cursor-pointer gap-1.5">
                    <Plus className="w-4 h-4" /> Crear servidor
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg border-white/10 bg-black/90 backdrop-blur-2xl">
                <DialogHeader>
                    <DialogTitle className="font-headline">Crear servidor de apps</DialogTitle>
                    <DialogDescription>
                        Comparte una app, juego, entorno o programa con estado en vivo entre sus miembros.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div>
                        <Label className="text-xs mb-1 block">Nombre</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Sala de notas del Huerto Norte" className="h-9 text-sm" />
                    </div>
                    <div>
                        <Label className="text-xs mb-1 block">Descripción (opcional)</Label>
                        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="¿Para qué sirve este servidor?" className="text-sm min-h-16" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-xs mb-1 block">Tipo</Label>
                            <Select value={kind} onValueChange={(v) => setKind(v as ServerKind)}>
                                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {KIND_OPTIONS.map((k) => (
                                        <SelectItem key={k.value} value={k.value} className="text-sm">{k.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="text-xs mb-1 block">Visibilidad</Label>
                            <Select value={visibility} onValueChange={(v) => setVisibility(v as ServerVisibility)}>
                                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="public" className="text-sm">Público (unirse directo)</SelectItem>
                                    <SelectItem value="private" className="text-sm">Privado (solicitud)</SelectItem>
                                    <SelectItem value="group" className="text-sm">De grupo (solicitud)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    {visibility === "group" && (
                        <div>
                            <Label className="text-xs mb-1 block">Grupo</Label>
                            <Select value={groupSlug} onValueChange={setGroupSlug}>
                                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Elige un grupo" /></SelectTrigger>
                                <SelectContent>
                                    {myGroups.map((g) => (
                                        <SelectItem key={g.slug} value={g.slug} className="text-sm">{g.name}</SelectItem>
                                    ))}
                                    {myGroups.length === 0 && (
                                        <div className="px-2 py-1.5 text-xs text-muted-foreground">No perteneces a ningún grupo todavía.</div>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <Separator />
                    <p className="text-[11px] text-muted-foreground">
                        App instalada: indica una RUTA in-app (p.ej. <code className="text-amber-200/90">/pizarra</code>) o una URL externa.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-xs mb-1 block">Ruta in-app</Label>
                            <Input value={appRoute} onChange={(e) => setAppRoute(e.target.value)} placeholder="/pizarra" className="h-9 text-sm" />
                        </div>
                        <div>
                            <Label className="text-xs mb-1 block">URL externa</Label>
                            <Input value={appUrl} onChange={(e) => setAppUrl(e.target.value)} placeholder="https://…" className="h-9 text-sm" />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" className="cursor-pointer" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button className="cursor-pointer gap-1.5" onClick={() => void handleCreate()} disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Crear
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ───────────────────────── Demo de estado compartido ───────────────────── */

interface DemoState {
    count: number;
    notes: string;
    updatedBy?: string;
}

function SharedStateDemo({ serverId }: { serverId: string }) {
    const { state, setState, updateState, connected, loaded } = useServerChannel<DemoState>(serverId, {
        count: 0,
        notes: "",
    });
    const [noteDraft, setNoteDraft] = useState("");

    useEffect(() => {
        setNoteDraft(state.notes ?? "");
    }, [state.notes]);

    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-widest text-foreground/80">
                    Estado compartido en vivo
                </p>
                <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold", connected ? "text-emerald-300" : "text-muted-foreground")}>
                    {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                    {connected ? "Conectado" : "Local"}
                </span>
            </div>

            {!loaded ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando estado…
                </div>
            ) : (
                <>
                    {/* Contador colaborativo */}
                    <div className="flex items-center gap-3">
                        <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 cursor-pointer"
                            onClick={() => void updateState((prev) => ({ ...prev, count: (prev.count ?? 0) - 1 }))}
                        >
                            <Minus className="w-4 h-4" />
                        </Button>
                        <span className="text-2xl font-black font-headline text-primary min-w-12 text-center">
                            {state.count ?? 0}
                        </span>
                        <Button
                            size="icon"
                            className="h-8 w-8 cursor-pointer"
                            onClick={() => void updateState((prev) => ({ ...prev, count: (prev.count ?? 0) + 1 }))}
                        >
                            <Plus className="w-4 h-4" />
                        </Button>
                        <span className="text-[11px] text-muted-foreground">Contador visto por todos los miembros</span>
                    </div>

                    {/* Notas colaborativas */}
                    <div>
                        <Label className="text-xs mb-1 block">Notas colaborativas</Label>
                        <Textarea
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            onBlur={() => void setState({ ...state, notes: noteDraft })}
                            placeholder="Escribe algo… se sincroniza con todos los miembros al salir del campo."
                            className="text-sm min-h-20"
                        />
                    </div>
                </>
            )}
        </div>
    );
}

/* ─────────────────────────────── Panel del servidor ────────────────────── */

function ServerPanel({ slug, onClose }: { slug: string; onClose: () => void }) {
    const [server, setServer] = useState<AppServerSummary | null>(null);
    const [members, setMembers] = useState<Awaited<ReturnType<typeof listServerMembers>>>([]);
    const [profiles, setProfiles] = useState<Record<string, OsProfile>>({});
    const [myUserId, setMyUserId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const reload = useCallback(async () => {
        const [s, uid] = await Promise.all([fetchServerBySlug(slug), getCurrentUserId()]);
        const m = s ? await listServerMembers(s.id) : [];
        setServer(s);
        setMembers(m);
        setMyUserId(uid);
        if (m.length) setProfiles(await fetchProfilesByIds(m.map((mm) => mm.userId)));
        setLoading(false);
    }, [slug]);

    useEffect(() => {
        void reload();
    }, [reload]);

    useEffect(() => {
        if (!server) return;
        return subscribeMembers(server.id, () => void reload());
    }, [server, reload]);

    const pending = members.filter((m) => m.status === "pending");
    const active = members.filter((m) => m.status === "member");
    const isOwner = !!server && !!myUserId && server.owner === myUserId;

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 p-4 border-b border-white/10">
                <Button size="icon" variant="ghost" className="h-8 w-8 cursor-pointer" onClick={onClose}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{server?.name ?? "Servidor"}</p>
                    <p className="text-[11px] text-muted-foreground">{server?.description || "Sin descripción"}</p>
                </div>
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : !server ? (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                    No se encontró el servidor.
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto p-4 space-y-5">
                    <div className="flex flex-wrap gap-2">
                        {(server.appRoute || server.appUrl) && (
                            <Button
                                size="sm"
                                className="btn-pill h-8 cursor-pointer text-xs"
                                onClick={() => {
                                    if (server.appRoute) window.location.assign(server.appRoute);
                                    else if (server.appUrl) window.open(server.appUrl, "_blank", "noopener,noreferrer");
                                }}
                            >
                                <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Abrir app
                            </Button>
                        )}
                        {!isOwner && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-8 cursor-pointer text-xs border-red-500/30 text-red-300 hover:bg-red-500/10"
                                onClick={async () => {
                                    await leave(server.id);
                                    toast.success("Has abandonado el servidor.");
                                    onClose();
                                }}
                            >
                                Abandonar
                            </Button>
                        )}
                    </div>

                    {/* Solicitudes pendientes (solo dueño) */}
                    {isOwner && pending.length > 0 && (
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest text-amber-300 mb-2">
                                Solicitudes pendientes ({pending.length})
                            </p>
                            <div className="space-y-2">
                                {pending.map((m) => {
                                    const p = profiles[m.userId];
                                    return (
                                        <div key={m.userId} className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2">
                                            <span className="text-sm truncate">{p?.displayName ?? m.userId.slice(0, 8)}</span>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <Button
                                                    size="icon"
                                                    className="h-7 w-7 cursor-pointer bg-emerald-600 hover:bg-emerald-500"
                                                    onClick={async () => {
                                                        await approve(server.id, m.userId);
                                                        toast.success("Solicitud aprobada.");
                                                    }}
                                                >
                                                    <Check className="w-3.5 h-3.5" />
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="outline"
                                                    className="h-7 w-7 cursor-pointer border-red-500/30 text-red-300 hover:bg-red-500/10"
                                                    onClick={async () => {
                                                        await deny(server.id, m.userId);
                                                        toast.success("Solicitud denegada.");
                                                    }}
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Miembros activos */}
                    <div>
                        <p className="text-xs font-black uppercase tracking-widest text-foreground/70 mb-2">
                            Miembros ({active.length})
                        </p>
                        <div className="space-y-1.5">
                            {active.map((m) => {
                                const p = profiles[m.userId];
                                return (
                                    <div key={m.userId} className="flex items-center gap-2 text-sm">
                                        {m.role === "owner" && <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" />}
                                        <span className="truncate">{p?.displayName ?? m.userId.slice(0, 8)}</span>
                                        {p?.username && <span className="text-[11px] text-muted-foreground">@{p.username}</span>}
                                    </div>
                                );
                            })}
                            {active.length === 0 && <p className="text-xs text-muted-foreground">Aún no hay miembros activos.</p>}
                        </div>
                    </div>

                    {/* Demo mínima de estado compartido en vivo */}
                    <SharedStateDemo serverId={server.id} />
                </div>
            )}
        </div>
    );
}

/* ─────────────────────────────── Página principal ──────────────────────── */

export default function ServidoresAppsPage() {
    const router = useRouter();
    const [tab, setTab] = useState<"public" | "mine" | "group">("public");
    const [publicServers, setPublicServers] = useState<AppServerSummary[]>([]);
    const [myServers, setMyServers] = useState<AppServerSummary[]>([]);
    const [groupServers, setGroupServers] = useState<AppServerSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [panelSlug, setPanelSlug] = useState<string | null>(null);
    const { data: groups } = useOsGroups();
    const [myGroupSlugs, setMyGroupSlugs] = useState<string[]>([]);

    const reloadAll = useCallback(async () => {
        setLoading(true);
        const [pub, mine] = await Promise.all([listServers("public"), listServers("mine")]);
        setPublicServers(pub);
        setMyServers(mine);
        setLoading(false);
    }, []);

    useEffect(() => {
        void reloadAll();
    }, [reloadAll]);

    // "De mis grupos": para cada grupo real (no-ejemplo) al que pertenece el
    // usuario, trae los servidores visibility='group' de ese slug.
    useEffect(() => {
        (async () => {
            const uid = await getCurrentUserId();
            if (!uid) {
                setMyGroupSlugs([]);
                setGroupServers([]);
                return;
            }
            const realGroups = groups.filter((g) => !g.isSample);
            const slugs = realGroups.map((g) => g.slug);
            setMyGroupSlugs(slugs);
            if (!slugs.length) {
                setGroupServers([]);
                return;
            }
            const lists = await Promise.all(slugs.map((s) => listServers("group", s)));
            setGroupServers(lists.flat());
        })();
    }, [groups]);

    // Deep-link ?panel=<slug> para abrir el panel directamente (p.ej. desde un
    // adjunto de mensaje "Unirse"/"Ver servidor"). SSR-safe: lee `window.location`
    // en cliente (evita el boundary de Suspense que exige `useSearchParams`).
    useEffect(() => {
        if (typeof window === "undefined") return;
        const p = new URLSearchParams(window.location.search).get("panel");
        if (p) setPanelSlug(p);
    }, []);

    const myGroupOptions = useMemo(
        () => groups.filter((g) => !g.isSample && myGroupSlugs.includes(g.slug)).map((g) => ({ slug: g.slug, name: g.name })),
        [groups, myGroupSlugs],
    );

    const closePanel = () => {
        setPanelSlug(null);
        router.replace("/servidores-apps");
    };

    return (
        <main className="min-h-screen px-4 py-8 md:px-8">
            <div className="max-w-5xl mx-auto space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20 text-primary">
                            <Server className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-foreground">Servidores de Apps</h1>
                            <p className="text-sm text-muted-foreground mt-0.5 max-w-xl">
                                Apps, juegos y entornos compartidos con estado sincronizado en tiempo real entre sus miembros.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button variant="outline" size="icon" className="cursor-pointer h-9 w-9" onClick={() => void reloadAll()} title="Actualizar">
                            <RefreshCcw className="w-4 h-4" />
                        </Button>
                        <CreateServerDialog myGroups={myGroupOptions} onCreated={() => void reloadAll()} />
                    </div>
                </div>

                <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
                    <TabsList className="bg-black/25 p-1 rounded-2xl border border-white/5">
                        <TabsTrigger value="public" className="rounded-xl text-xs font-bold gap-1.5">
                            <Compass className="w-3.5 h-3.5" /> Explorar
                        </TabsTrigger>
                        <TabsTrigger value="mine" className="rounded-xl text-xs font-bold gap-1.5">
                            <Server className="w-3.5 h-3.5" /> Míos
                        </TabsTrigger>
                        <TabsTrigger value="group" className="rounded-xl text-xs font-bold gap-1.5">
                            <Users2 className="w-3.5 h-3.5" /> De mis grupos
                        </TabsTrigger>
                    </TabsList>

                    {loading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                            {[1, 2, 3].map((i) => <div key={i} className="h-32 rounded-2xl bg-muted/20 animate-pulse border border-border/10" />)}
                        </div>
                    ) : (
                        <>
                            <TabsContent value="public" className="mt-4">
                                {publicServers.length === 0 ? (
                                    <EmptyServers label="Aún no hay servidores públicos. Crea el primero." />
                                ) : (
                                    <ServerGrid servers={publicServers} onOpenPanel={setPanelSlug} />
                                )}
                            </TabsContent>
                            <TabsContent value="mine" className="mt-4">
                                {myServers.length === 0 ? (
                                    <EmptyServers label="Aún no eres miembro de ningún servidor." />
                                ) : (
                                    <ServerGrid servers={myServers} onOpenPanel={setPanelSlug} />
                                )}
                            </TabsContent>
                            <TabsContent value="group" className="mt-4">
                                {groupServers.length === 0 ? (
                                    <EmptyServers label="Ninguno de tus grupos tiene servidores todavía." />
                                ) : (
                                    <ServerGrid servers={groupServers} onOpenPanel={setPanelSlug} />
                                )}
                            </TabsContent>
                        </>
                    )}
                </Tabs>
            </div>

            <Sheet open={!!panelSlug} onOpenChange={(open) => { if (!open) closePanel(); }}>
                <SheetContent side="right" className="w-full sm:max-w-md p-0">
                    <SheetHeader className="sr-only">
                        <SheetTitle>Panel del servidor</SheetTitle>
                    </SheetHeader>
                    {panelSlug && <ServerPanel slug={panelSlug} onClose={closePanel} />}
                </SheetContent>
            </Sheet>
        </main>
    );
}

function ServerGrid({ servers, onOpenPanel }: { servers: AppServerSummary[]; onOpenPanel: (slug: string) => void }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {servers.map((s) => (
                <ServerCard key={s.id} server={s} onOpenPanel={onOpenPanel} />
            ))}
        </div>
    );
}

function EmptyServers({ label }: { label: string }) {
    return (
        <div className="rounded-2xl border border-dashed border-white/12 p-10 text-center flex flex-col items-center gap-3">
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 text-muted-foreground">
                <Server className="w-6 h-6" />
            </div>
            <p className="text-sm text-muted-foreground max-w-sm">{label}</p>
        </div>
    );
}
