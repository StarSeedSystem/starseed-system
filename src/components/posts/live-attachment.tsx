"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * LiveAttachment — CONTENIDO VIVO EN PUBLICACIONES (Cultura · Adenda social)
 * ---------------------------------------------------------------------------
 * Envoltorio de UN adjunto (`EmbeddedItem` + campos `live*` opcionales) que
 * decide CÓMO mostrarlo según su `liveMode`:
 *
 *   · "estatico" (o sin campos live) → delega 100% en `EmbeddedContentWindow`
 *     (cero cambio de comportamiento: mismo componente que ya usaba el feed).
 *   · "edicion"  → conecta con un espacio compartido `os_spaces` (permisos
 *     grupal/publico/invitacion) o un servidor `os_app_servers` (permiso
 *     "servidor", con solicitud de unión) y muestra los cambios EN VIVO. Si el
 *     adjunto es una pizarra, la ventana embebida existente carga el LIENZO
 *     COLABORATIVO real (?board-space=<id>, el mismo mecanismo que ya usa
 *     "Compartir pizarra…" en /pizarra). Para el resto de formatos se ofrece
 *     un panel de NOTAS COMPARTIDAS EN VIVO (mismo motor; honesto: no edita el
 *     archivo original byte a byte, es una capa colaborativa acompañante).
 *   · "canal"    → el autor TRANSMITE actualizaciones (`LiveChannel`, ver
 *     `./live-channel`): estado/imagen + espectadores + chat ligero, con
 *     audio/pantalla compartida como toggle EXPERIMENTAL (WebRTC simple).
 *
 * `provisionLiveBacking()` crea el espacio/servidor cuando el AUTOR activa el
 * modo desde el compositor (antes de publicar) — así todo espectador que abra
 * la publicación se conecta a la MISMA entidad compartida ya resuelta.
 *
 * Aditivo y defensivo: nunca lanza; sin campos `live*`, el comportamiento es
 * IDÉNTICO al de hoy (misma `EmbeddedContentWindow`, mismos props).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
    Radio, Pencil, Users2, Globe2, Mail, Server as ServerIcon, UserPlus,
    Loader2, Check, Pause, ChevronDown,
} from "lucide-react";
import {
    EmbeddedContentWindow,
    titleOf,
    type EmbeddedItem,
    type EmbedContext,
} from "@/components/posts/embedded-content-window";
import type { MainRatio } from "@/lib/publish/publish";
import {
    createSpace,
    useSpaceDoc,
    requestSpaceAccess,
    listSpaceEditors,
    type SpaceAccess,
} from "@/lib/spaces/spaces";
import {
    createServer,
    fetchServerById,
    joinOrRequest,
    type AppServerSummary,
} from "@/lib/servers/app-servers";
import { useServerChannel } from "@/lib/servers/server-channel";
import { getCurrentUserId } from "@/lib/os-social";
import { createClient } from "@/utils/supabase/client";
import { LiveChannel } from "@/components/posts/live-channel";

// ───────────────────────────── Tipos públicos ───────────────────────────────

export type LiveMode = "estatico" | "edicion" | "canal";
export type LiveEditPermission = "grupal" | "publico" | "invitacion" | "servidor";

export interface LiveAttachmentFields {
    liveMode?: LiveMode | null;
    livePermission?: LiveEditPermission | null;
    liveSpaceId?: string | null;
    liveServerId?: string | null;
    liveServerSlug?: string | null;
    liveGroupSlug?: string | null;
}

/** Cualquier adjunto (post real / vista previa / carrusel) + sus campos vivos opcionales. */
export type LiveItem = EmbeddedItem & LiveAttachmentFields;

export interface LiveAttachmentProps {
    item: LiveItem;
    context?: EmbedContext;
    ratio?: MainRatio;
    className?: string;
    defaultOpen?: boolean;
}

// ───────────────────────────── Catálogos (UI) ───────────────────────────────

export const LIVE_MODES: { id: LiveMode; label: string; icon: ComponentType<{ className?: string }>; blurb: string }[] = [
    { id: "estatico", label: "Estático", icon: Pause, blurb: "Como hoy: contenido fijo, sin capa en vivo." },
    { id: "edicion", label: "Edición en tiempo real", icon: Pencil, blurb: "Espectadores ven los cambios en vivo; según el permiso, también pueden editar." },
    { id: "canal", label: "Canal en vivo", icon: Radio, blurb: "Transmites estado/imagen/chat en vivo a quien mire la publicación." },
];

export const LIVE_EDIT_PERMISSIONS: { id: LiveEditPermission; label: string; icon: ComponentType<{ className?: string }>; blurb: string }[] = [
    { id: "grupal", label: "Edición grupal", icon: Users2, blurb: "Editan los miembros del grupo indicado (os_memberships)." },
    { id: "publico", label: "Edición pública", icon: Globe2, blurb: "Cualquiera puede editar." },
    { id: "invitacion", label: "Por invitación", icon: Mail, blurb: "Sólo quien invites o apruebes puede editar (solicitud)." },
    { id: "servidor", label: "Unirse al servidor", icon: ServerIcon, blurb: "Se solicita unirse al servidor de la app para poder editar." },
];

function permissionMeta(id?: LiveEditPermission | null) {
    return LIVE_EDIT_PERMISSIONS.find((p) => p.id === id) ?? LIVE_EDIT_PERMISSIONS[1];
}

// ───────────────────────────── Aprovisionamiento (compositor) ──────────────

export interface ProvisionLiveBackingInput {
    mode: LiveMode;
    permission?: LiveEditPermission;
    title: string;
    groupSlug?: string;
}
export interface ProvisionLiveBackingResult {
    ok: boolean;
    needsAuth?: boolean;
    error?: string;
    patch?: Partial<LiveAttachmentFields>;
}

/**
 * Crea la entidad compartida que respalda el modo elegido. Se llama desde el
 * compositor AL ACTIVAR el modo (antes de publicar): así todo espectador que
 * abra la publicación se conecta a la MISMA entidad ya resuelta, en vez de
 * crear una nueva cada vez que alguien la abre.
 */
export async function provisionLiveBacking(input: ProvisionLiveBackingInput): Promise<ProvisionLiveBackingResult> {
    const title = (input.title || "").trim() || "Adjunto en vivo";

    if (input.mode === "estatico") {
        return {
            ok: true,
            patch: { liveMode: "estatico", livePermission: null, liveSpaceId: null, liveServerId: null, liveServerSlug: null, liveGroupSlug: null },
        };
    }

    if (input.mode === "canal") {
        const res = await createServer({
            name: title,
            description: "Canal en vivo creado desde una publicación de Cultura.",
            kind: "app",
            visibility: "public",
            payload: { liveChannel: true },
        });
        if (!res.ok || !res.server) {
            return { ok: false, needsAuth: res.needsAuth, error: res.error || "No se pudo crear el canal en vivo." };
        }
        return {
            ok: true,
            patch: { liveMode: "canal", livePermission: null, liveServerId: res.server.id, liveServerSlug: res.server.slug, liveSpaceId: null },
        };
    }

    // input.mode === "edicion"
    const permission = input.permission ?? "publico";

    if (permission === "servidor") {
        const res = await createServer({
            name: title,
            description: "Edición en tiempo real (unión por solicitud) creada desde una publicación.",
            kind: "programa",
            // "(solicitud)": unirse siempre pasa por aprobación del dueño.
            visibility: "private",
            payload: { liveEdit: true },
        });
        if (!res.ok || !res.server) {
            return { ok: false, needsAuth: res.needsAuth, error: res.error || "No se pudo crear el servidor." };
        }
        return {
            ok: true,
            patch: { liveMode: "edicion", livePermission: "servidor", liveServerId: res.server.id, liveServerSlug: res.server.slug, liveSpaceId: null },
        };
    }

    const access: SpaceAccess = permission === "grupal" ? "profiles" : permission === "invitacion" ? "invite" : "public";
    const space = await createSpace({
        kind: "board",
        title,
        access,
        groupSlug: permission === "grupal" ? input.groupSlug?.trim() || null : null,
        doc: {},
    });
    if (!space) {
        return { ok: false, error: "No se pudo crear el espacio compartido. Inicia sesión e inténtalo de nuevo." };
    }
    return {
        ok: true,
        patch: {
            liveMode: "edicion",
            livePermission: permission,
            liveSpaceId: space.id,
            liveGroupSlug: permission === "grupal" ? input.groupSlug?.trim() || null : null,
            liveServerId: null,
        },
    };
}

// ───────────────────────────── Selector de modo (compositor) ───────────────

export interface LiveModePickerProps {
    mode: LiveMode;
    permission?: LiveEditPermission | null;
    groupSlug?: string | null;
    /** true si el adjunto ya tiene un espacio/servidor creado. */
    provisioned: boolean;
    busy?: boolean;
    onModeChange: (mode: LiveMode) => void;
    onPermissionChange: (permission: LiveEditPermission) => void;
    onGroupSlugChange: (slug: string) => void;
    onProvision: () => void;
}

/** Selector compacto de modo + permiso, pensado para insertarse en el compositor. */
export function LiveModePicker({
    mode, permission, groupSlug, provisioned, busy,
    onModeChange, onPermissionChange, onGroupSlugChange, onProvision,
}: LiveModePickerProps) {
    return (
        <div className="space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
                {LIVE_MODES.map((m) => {
                    const MIcon = m.icon;
                    const active = mode === m.id;
                    return (
                        <button
                            key={m.id}
                            type="button"
                            title={m.blurb}
                            onClick={() => onModeChange(m.id)}
                            className={cn(
                                "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                                active
                                    ? "border-rose-400/50 bg-rose-400/15 text-rose-100"
                                    : "border-white/10 bg-white/[0.02] text-white/50 hover:border-white/25",
                            )}
                        >
                            <MIcon className="h-3 w-3" /> {m.label}
                        </button>
                    );
                })}
            </div>

            {mode === "edicion" && (
                <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Permiso de edición</p>
                    <div className="flex flex-wrap gap-1.5">
                        {LIVE_EDIT_PERMISSIONS.map((p) => {
                            const PIcon = p.icon;
                            const active = permission === p.id;
                            return (
                                <button
                                    key={p.id}
                                    type="button"
                                    title={p.blurb}
                                    onClick={() => onPermissionChange(p.id)}
                                    className={cn(
                                        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                                        active
                                            ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-100"
                                            : "border-white/10 text-white/45 hover:border-white/25",
                                    )}
                                >
                                    <PIcon className="h-3 w-3" /> {p.label}
                                </button>
                            );
                        })}
                    </div>
                    {permission === "grupal" && (
                        <input
                            value={groupSlug ?? ""}
                            onChange={(e) => onGroupSlugChange(e.target.value)}
                            placeholder="slug-del-grupo (grupo del post)"
                            className="h-8 w-full rounded-md border border-white/15 bg-white/[0.03] px-2 text-xs text-amber-50 placeholder:text-white/30"
                        />
                    )}
                </div>
            )}

            {mode !== "estatico" && (
                <button
                    type="button"
                    disabled={busy || provisioned || (mode === "edicion" && !permission)}
                    onClick={onProvision}
                    className={cn(
                        "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed",
                        provisioned
                            ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                            : "border-rose-400/40 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20 disabled:opacity-50",
                    )}
                >
                    {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : provisioned ? (
                        <Check className="h-3.5 w-3.5" />
                    ) : (
                        <Radio className="h-3.5 w-3.5" />
                    )}
                    {provisioned ? "Activado" : mode === "canal" ? "Crear canal ahora" : "Crear espacio ahora"}
                </button>
            )}
            {mode !== "estatico" && !provisioned && (
                <p className="text-[10px] text-white/35">
                    Actívalo antes de publicar: así todos los espectadores se conectan a la misma sesión en vivo.
                </p>
            )}
        </div>
    );
}

// ───────────────────────────── Utilidades ───────────────────────────────────

function useMe(): string | null {
    const [uid, setUid] = useState<string | null>(null);
    useEffect(() => {
        let alive = true;
        void getCurrentUserId().then((id) => {
            if (alive) setUid(id);
        });
        return () => {
            alive = false;
        };
    }, []);
    return uid;
}

/** Reescribe la URL de una pizarra para abrir el espacio compartido (?board-space=<id>). */
function pizarraLiveUrl(url: string | null | undefined, spaceId: string): string {
    const base = url && url.trim() ? url.trim() : "/pizarra";
    const [path, query = ""] = base.split("?");
    const params = new URLSearchParams(query);
    params.set("board-space", spaceId);
    return `${path}?${params.toString()}`;
}

async function isGroupMember(groupSlug: string, uid: string): Promise<boolean> {
    try {
        const supabase = createClient();
        const { data } = await supabase
            .from("os_memberships")
            .select("user_id")
            .eq("group_slug", groupSlug)
            .eq("user_id", uid)
            // Excluye solicitudes de ingreso sin resolver (role='pending' — adenda
            // "solicitud de ingreso + aprobación"): esto gatea el permiso de EDITAR
            // una pizarra compartida "grupal", así que una solicitud pendiente no
            // debe dar ese permiso antes de ser aprobada.
            .neq("role", "pending")
            .maybeSingle();
        return Boolean(data);
    } catch {
        return false;
    }
}

// ───────────────────────────── Insignia "EN VIVO" ───────────────────────────

function LiveBadge({ label }: { label: string }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-200">
            <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-rose-400 opacity-70" aria-hidden />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-300" aria-hidden />
            </span>
            {label}
        </span>
    );
}

// ───────────────────────────── Notas compartidas (espacio) ─────────────────

function SpaceNotesPanel({
    spaceId, permission, groupSlug,
}: { spaceId: string; permission: LiveEditPermission; groupSlug?: string | null }) {
    const { doc, space, loading, setDoc } = useSpaceDoc<{ text?: string }>(spaceId);
    const uid = useMe();
    const [canEdit, setCanEdit] = useState(permission === "publico");
    const [requesting, setRequesting] = useState(false);
    const [requested, setRequested] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            if (!space) return;
            if (permission === "publico") {
                if (alive) setCanEdit(true);
                return;
            }
            if (uid && space.ownerAccount === uid) {
                if (alive) setCanEdit(true);
                return;
            }
            const effectiveGroupSlug = groupSlug || space.groupSlug;
            if (permission === "grupal" && effectiveGroupSlug && uid) {
                const ok = await isGroupMember(effectiveGroupSlug, uid);
                if (alive) setCanEdit(ok);
                if (ok) return;
            }
            if (uid) {
                try {
                    const editors = await listSpaceEditors(spaceId);
                    const mine = editors.find((e) => e.account === uid);
                    if (alive) setCanEdit(mine?.status === "member");
                } catch {
                    /* degrada a solo-lectura */
                }
            }
        })();
        return () => {
            alive = false;
        };
    }, [space, uid, permission, groupSlug, spaceId]);

    const handleRequest = async () => {
        setRequesting(true);
        try {
            const res = await requestSpaceAccess(spaceId);
            if (res.ok) {
                setRequested(true);
                if (res.alreadyMember) setCanEdit(true);
                toast.success(res.alreadyMember ? "Ya tenías acceso de edición." : "Solicitud enviada. El dueño debe aprobarla.");
            } else {
                toast.error("Inicia sesión para solicitar acceso.");
            }
        } finally {
            setRequesting(false);
        }
    };

    return (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white/60">
                    <Pencil className="h-3.5 w-3.5 text-cyan-300" /> Notas compartidas en vivo
                </span>
                {!canEdit && (permission === "invitacion" || permission === "grupal") && (
                    <button
                        type="button"
                        disabled={requesting || requested}
                        onClick={() => void handleRequest()}
                        className="inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 text-[10px] font-semibold text-cyan-100 hover:bg-cyan-400/15 disabled:opacity-50"
                    >
                        {requesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                        {requested ? "Solicitud enviada" : "Solicitar acceso"}
                    </button>
                )}
            </div>
            {loading ? (
                <div className="h-16 animate-pulse rounded-lg bg-white/5" />
            ) : (
                <textarea
                    value={doc?.text ?? ""}
                    onChange={(e) => canEdit && setDoc({ ...(doc ?? {}), text: e.target.value })}
                    readOnly={!canEdit}
                    rows={3}
                    placeholder={canEdit ? "Escribe — se ve en vivo para todos los espectadores…" : "Sólo lectura: no tienes permiso de edición aquí."}
                    className={cn(
                        "w-full resize-none rounded-lg border border-white/10 bg-black/30 p-2 text-xs text-amber-50 placeholder:text-white/30",
                        !canEdit && "cursor-not-allowed opacity-70",
                    )}
                />
            )}
            <p className="text-[10px] text-white/30">
                {permissionMeta(permission).label} · los cambios se sincronizan en vivo para todos.
            </p>
        </div>
    );
}

// ───────────────────────────── Notas compartidas (servidor) ────────────────

function ServerNotesPanel({ serverId }: { serverId: string }) {
    const { state, setState, loaded } = useServerChannel<{ text: string }>(serverId, { text: "" });
    const [server, setServer] = useState<AppServerSummary | null>(null);
    const [joining, setJoining] = useState(false);

    useEffect(() => {
        let alive = true;
        void fetchServerById(serverId).then((s) => {
            if (alive) setServer(s);
        });
        return () => {
            alive = false;
        };
    }, [serverId]);

    const canEdit = Boolean(server?.isOwner || server?.myStatus === "member");

    const handleJoin = async () => {
        if (!server) return;
        setJoining(true);
        try {
            const res = await joinOrRequest(server);
            if (res.needsAuth) {
                toast.error("Inicia sesión para solicitar acceso.");
                return;
            }
            if (res.joined) {
                toast.success("Te uniste al servidor: ya puedes editar.");
                setServer((s) => (s ? { ...s, myStatus: "member" } : s));
            } else if (res.pending) {
                toast.success("Solicitud enviada. El dueño debe aprobarla.");
                setServer((s) => (s ? { ...s, myStatus: "pending" } : s));
            }
        } finally {
            setJoining(false);
        }
    };

    return (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white/60">
                    <Pencil className="h-3.5 w-3.5 text-cyan-300" /> Notas compartidas en vivo
                </span>
                {!canEdit && server && server.myStatus !== "pending" && (
                    <button
                        type="button"
                        disabled={joining}
                        onClick={() => void handleJoin()}
                        className="inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 text-[10px] font-semibold text-cyan-100 hover:bg-cyan-400/15 disabled:opacity-50"
                    >
                        {joining ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                        Unirse al servidor
                    </button>
                )}
                {server?.myStatus === "pending" && (
                    <span className="text-[10px] font-semibold text-amber-300">Solicitud pendiente</span>
                )}
            </div>
            {!loaded ? (
                <div className="h-16 animate-pulse rounded-lg bg-white/5" />
            ) : (
                <textarea
                    value={state.text ?? ""}
                    onChange={(e) => canEdit && void setState({ text: e.target.value })}
                    readOnly={!canEdit}
                    rows={3}
                    placeholder={canEdit ? "Escribe — se ve en vivo para todos los espectadores…" : "Únete al servidor para poder editar."}
                    className={cn(
                        "w-full resize-none rounded-lg border border-white/10 bg-black/30 p-2 text-xs text-amber-50 placeholder:text-white/30",
                        !canEdit && "cursor-not-allowed opacity-70",
                    )}
                />
            )}
            <p className="text-[10px] text-white/30">Unirse al servidor (solicitud) · los cambios se sincronizan en vivo.</p>
        </div>
    );
}

// ───────────────────────────── Sub-vistas por modo ──────────────────────────

interface SubViewProps {
    item: LiveItem;
    context: EmbedContext;
    ratio: MainRatio;
    className?: string;
    defaultOpen?: boolean;
}

function LiveEditView({ item, context, ratio, className, defaultOpen }: SubViewProps) {
    const permission = item.livePermission ?? "publico";
    const isPizarra = (item.kind || "").toLowerCase() === "pizarra";
    const [showOriginal, setShowOriginal] = useState(false);

    const effectiveItem: EmbeddedItem = useMemo(() => {
        if (isPizarra && item.liveSpaceId) {
            return { ...item, url: pizarraLiveUrl(item.url, item.liveSpaceId) };
        }
        return item;
    }, [item, isPizarra]);

    const PermIcon = permissionMeta(permission).icon;

    return (
        <div className={cn("space-y-2", className)}>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <LiveBadge label="Edición en vivo" />
                <span className="inline-flex items-center gap-1 text-[11px] text-white/50">
                    <PermIcon className="h-3 w-3" />
                    {permissionMeta(permission).label}
                </span>
                <span className="ml-auto truncate text-[11px] text-white/35">{titleOf(item)}</span>
            </div>

            {isPizarra && item.liveSpaceId ? (
                <EmbeddedContentWindow item={effectiveItem} context={context} ratio={ratio} defaultOpen={defaultOpen ?? true} />
            ) : item.livePermission === "servidor" && item.liveServerId ? (
                <ServerNotesPanel serverId={item.liveServerId} />
            ) : item.liveSpaceId ? (
                <SpaceNotesPanel spaceId={item.liveSpaceId} permission={permission} groupSlug={item.liveGroupSlug} />
            ) : (
                <EmbeddedContentWindow item={item} context={context} ratio={ratio} defaultOpen={defaultOpen} />
            )}

            {!isPizarra && (
                <button
                    type="button"
                    onClick={() => setShowOriginal((v) => !v)}
                    className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-white/40 hover:text-white/70"
                >
                    <ChevronDown className={cn("h-3 w-3 transition-transform", showOriginal && "rotate-180")} />
                    {showOriginal ? "Ocultar adjunto original" : "Ver adjunto original"}
                </button>
            )}
            {showOriginal && !isPizarra && <EmbeddedContentWindow item={item} context={context} ratio={ratio} />}
        </div>
    );
}

function LiveChannelView({ item, context, ratio, className }: SubViewProps) {
    const [showOriginal, setShowOriginal] = useState(false);
    if (!item.liveServerId) {
        return <EmbeddedContentWindow item={item} context={context} ratio={ratio} className={className} />;
    }
    return (
        <div className={cn("space-y-2", className)}>
            <LiveChannel
                serverId={item.liveServerId}
                serverSlug={item.liveServerSlug ?? undefined}
                title={titleOf(item)}
                description={item.description ?? undefined}
            />
            <button
                type="button"
                onClick={() => setShowOriginal((v) => !v)}
                className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-white/40 hover:text-white/70"
            >
                <ChevronDown className={cn("h-3 w-3 transition-transform", showOriginal && "rotate-180")} />
                {showOriginal ? "Ocultar adjunto original" : "Ver adjunto original"}
            </button>
            {showOriginal && <EmbeddedContentWindow item={item} context={context} ratio={ratio} />}
        </div>
    );
}

// ───────────────────────────── Componente raíz ──────────────────────────────

/**
 * Envoltorio drop-in de `EmbeddedContentWindow`: mismos props, mismo
 * resultado cuando el adjunto es estático. Úsalo en cualquier sitio donde
 * antes se llamaba a `EmbeddedContentWindow` directamente con un adjunto que
 * PUEDA traer campos vivos (feed, vista previa del compositor…).
 */
export function LiveAttachment({ item, context = "feed", ratio = "auto", className, defaultOpen }: LiveAttachmentProps) {
    const mode = item.liveMode ?? "estatico";

    if (mode === "canal" && item.liveServerId) {
        return <LiveChannelView item={item} context={context} ratio={ratio} className={className} />;
    }
    if (mode === "edicion" && (item.liveSpaceId || item.liveServerId)) {
        return <LiveEditView item={item} context={context} ratio={ratio} className={className} defaultOpen={defaultOpen} />;
    }
    // "estatico", o modo vivo sin entidad aprovisionada (defensivo): comportamiento de siempre.
    return <EmbeddedContentWindow item={item} context={context} ratio={ratio} className={className} defaultOpen={defaultOpen} />;
}

export default LiveAttachment;
