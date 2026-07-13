"use client";

/*
 * ShareAccessDialog — diálogo UNIVERSAL de permisos y compartición (Adenda 63 §5).
 * Un solo componente para escritorios, dashboards, pizarras, cerebros y
 * archivos/folders de biblioteca, sobre el modelo src/lib/sharing/access.ts:
 *
 *   · Ámbito: profile · account · custom · public (iconos User/Lock/Users/Globe).
 *   · Accesos: lista de grants con selector de rol (ver/comentar/editar/administrar),
 *     buscador de perfiles reales (os_profiles, como el Hub), grupos por slug y,
 *     en ámbito perfil, los perfiles de la propia cuenta.
 *   · Acceso parcial: checkboxes de subsecciones cuando el recurso las declara
 *     (pestañas del escritorio, ramas del cerebro…) — se guardan en `grant.sections`.
 *   · Copiar enlace: patrón ?space= existente (asegura el espacio si hace falta)
 *     o el enlace propio que aporte la integración (`buildLink`).
 *
 * Los cambios se aplican EN VIVO (local-first + push best-effort) y el diálogo
 * refleja en tiempo real los cambios hechos desde otros dispositivos
 * (subscribeResourceAccess reutiliza onTableChange). Tríada §3: privado en lo
 * personal, transparente en lo público; retirar acceso nunca es punitivo.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Lock, User, Users, Globe, Share2, Link as LinkIcon, Copy, Check, X, Search,
    Loader2, AtSign, ChevronDown, ChevronUp, SlidersHorizontal, Plus,
    FileLock2, GitFork, Link2Off, Eye as EyeIcon, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    detachInheritance, ensureResourceSpace, getEffectiveAccess, getResourceAccess, isLibraryResource,
    isShownInProfile, removeGrant, restoreInheritance, setResourceScope, setShowInProfile,
    shareLinkFor, subscribeResourceAccess, upsertGrant, ROLE_LABELS,
    type AccessGrant, type AccessRole, type AccessScope, type GranteeKind,
    type ResourceAccess, type ResourceRef,
} from "@/lib/sharing/access";
import { searchUsers, searchGroups } from "@/lib/social/os-profiles";
import { searchAccountProfiles, useMyProfiles } from "@/lib/profiles/profiles";

/* ─────────────────────────── Constantes de UI ─────────────────────────── */

interface ScopeOption {
    id: AccessScope;
    label: string;
    icon: typeof Lock;
    desc: string;
}

const SCOPE_META: Record<AccessScope, ScopeOption> = {
    private: { id: "private", label: "Privado", icon: FileLock2, desc: "Cerrado con llave: solo tú. Ni siquiera los accesos concedidos aplican." },
    profile: { id: "profile", label: "Un perfil", icon: User, desc: "Solo un perfil concreto de tu cuenta." },
    account: { id: "account", label: "Toda mi cuenta", icon: Lock, desc: "Todos mis perfiles. Es el ámbito POR DEFECTO de lo que creas: cualquier faceta tuya (cívica, artística, profesional…) lo ve sin configurar nada. Privado hacia fuera; cámbialo aquí cuando quieras." },
    profiles: { id: "profiles", label: "Perfiles", icon: User, desc: "Perfiles concretos. Dar acceso a un perfil lo da a TODA su cuenta (y a sus otros perfiles)." },
    groups: { id: "groups", label: "Grupos", icon: Users, desc: "Grupos concretos: cualquiera de sus miembros accede." },
    pages: { id: "pages", label: "Páginas", icon: FileText, desc: "Páginas o comunidades concretas." },
    custom: { id: "custom", label: "Personalizado", icon: Users, desc: "Perfiles, cuentas o grupos externos concretos." },
    public: { id: "public", label: "Público", icon: Globe, desc: "Cualquiera en la red. El poder público es transparente." },
};

/**
 * Ámbito por defecto de TODO recurso nuevo (biblioteca · folder · archivo ·
 * escritorio…): «toda mi cuenta (todos mis perfiles)». Coincide con
 * `defaultAccess()` en access.ts, con `defaultAccountAcl()` en entity-library.ts
 * y con el default de `uploadFile()` en os-files.ts — una sola verdad.
 */
const DEFAULT_SCOPE: AccessScope = "account";

/** Ámbitos por defecto (escritorios, pizarras, cerebros — Adenda 63). */
const DEFAULT_SCOPES: AccessScope[] = ["profile", "account", "custom", "public"];
/** Ámbitos de un nodo de Biblioteca (Adenda 66 §3). */
export const LIBRARY_SCOPES: AccessScope[] = ["private", "account", "profiles", "groups", "pages", "public"];

const ROLES: AccessRole[] = ["view", "comment", "edit", "admin"];

const GRANTEE_ICON: Record<GranteeKind, typeof User> = {
    profile: User,
    account: AtSign,
    group: Users,
    page: FileText,
    link: LinkIcon,
};

export interface ShareResourceSection {
    id: string;
    label: string;
}

export interface ShareAccessDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Recurso a compartir (type/id/ownerId/title/libraryRef). */
    resource: ResourceRef;
    /** Doc inicial del espacio colaborativo al crearlo (snapshot del escritorio/pizarra…). */
    makeSpaceDoc?: () => Record<string, unknown>;
    /** Subsecciones que el recurso declara para acceso parcial (pestañas, ramas…). */
    sections?: ShareResourceSection[];
    /** Secciones marcadas por defecto al añadir un acceso nuevo. */
    defaultSections?: string[];
    /** Enlace propio de la integración; si se omite se usa el patrón ?space= (shareLinkFor). */
    buildLink?: (spaceId: string | null) => string | null;
    title?: string;
    description?: string;
    /**
     * Ámbitos ofrecidos. Por defecto los de la Adenda 63 (escritorios/pizarras);
     * los nodos de Biblioteca pasan `LIBRARY_SCOPES` (Adenda 66 §3).
     */
    scopes?: AccessScope[];
    /**
     * Herencia (Adenda 66 §3): muestra si la ACL es PROPIA o HEREDADA del padre
     * y permite «Dejar de heredar» / «Volver a heredar». Solo tiene sentido en
     * nodos de Biblioteca (library/folder/file).
     */
    inheritance?: boolean;
    /** §4: interruptor «Mostrar en mi perfil» (Biblioteca pública del perfil). */
    profileShowcase?: boolean;
}

/* ─────────────────────────── Selector de rol ─────────────────────────── */

function RoleSelect({ value, onChange, disabled }: { value: AccessRole; onChange: (r: AccessRole) => void; disabled?: boolean }) {
    return (
        <select
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value as AccessRole)}
            className="h-7 shrink-0 cursor-pointer rounded-lg border border-white/10 bg-black/40 px-1.5 text-[11px] font-semibold text-white/80 outline-none transition-colors hover:bg-white/[0.06] focus:border-cyan-400/50"
            aria-label="Rol de acceso"
        >
            {ROLES.map((r) => (
                <option key={r} value={r} className="bg-zinc-950">
                    {ROLE_LABELS[r]}
                </option>
            ))}
        </select>
    );
}

/* ─────────────────────────── Fila de acceso ─────────────────────────── */

function GrantRow({
    grant, sections, onRole, onSections, onRemove,
}: {
    grant: AccessGrant;
    sections?: ShareResourceSection[];
    onRole: (r: AccessRole) => void;
    onSections: (ids: string[] | undefined) => void;
    onRemove: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const Icon = GRANTEE_ICON[grant.granteeKind];
    const partial = Array.isArray(grant.sections);
    const hasSections = !!sections && sections.length > 0;

    const toggleSection = (id: string) => {
        const current = grant.sections ?? sections?.map((s) => s.id) ?? [];
        const next = current.includes(id) ? current.filter((s) => s !== id) : [...current, id];
        onSections(next);
    };

    return (
        <div className="rounded-lg border border-white/10 bg-white/[0.03]">
            <div className="flex items-center gap-2 px-2.5 py-1.5">
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-xs text-white/85">{grant.label || grant.granteeId}</span>
                {partial && (
                    <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                        Parcial
                    </span>
                )}
                <RoleSelect value={grant.role} onChange={onRole} />
                {hasSections && (
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        title="Acceso parcial por secciones"
                        aria-label="Acceso parcial por secciones"
                        className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground/70 transition-colors hover:bg-white/10 hover:text-foreground"
                    >
                        {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                    </button>
                )}
                <button
                    type="button"
                    onClick={onRemove}
                    title="Retirar acceso"
                    aria-label="Retirar acceso"
                    className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground/70 transition-colors hover:bg-red-500/15 hover:text-red-300"
                >
                    <X className="size-3" />
                </button>
            </div>
            {expanded && hasSections && (
                <div className="space-y-1.5 border-t border-white/5 px-2.5 py-2">
                    <label className="flex cursor-pointer items-center gap-2 text-[11px] text-white/70">
                        <input
                            type="checkbox"
                            checked={!partial}
                            onChange={() => onSections(partial ? undefined : sections!.map((s) => s.id))}
                            className="size-3 accent-cyan-400"
                        />
                        Acceso total (todas las secciones)
                    </label>
                    {partial && (
                        <div className="grid grid-cols-2 gap-1">
                            {sections!.map((s) => (
                                <label key={s.id} className="flex cursor-pointer items-center gap-1.5 truncate text-[11px] text-white/60">
                                    <input
                                        type="checkbox"
                                        checked={(grant.sections ?? []).includes(s.id)}
                                        onChange={() => toggleSection(s.id)}
                                        className="size-3 accent-cyan-400"
                                    />
                                    <span className="truncate">{s.label}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/* ─────────────────────────── Diálogo principal ─────────────────────────── */

/** Destinatario encontrado por el buscador (según el ámbito activo). */
interface RecipientHit {
    granteeKind: GranteeKind;
    id: string;
    label: string;
    hint?: string;
}

export function ShareAccessDialog({
    open, onOpenChange, resource, makeSpaceDoc, sections, defaultSections, buildLink, title, description,
    scopes, inheritance = false, profileShowcase = false,
}: ShareAccessDialogProps) {
    const { profiles } = useMyProfiles();
    const [access, setAccess] = useState<ResourceAccess | null>(null);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<RecipientHit[]>([]);
    const [searching, setSearching] = useState(false);
    const [groupInput, setGroupInput] = useState("");
    const [copied, setCopied] = useState(false);
    const [linking, setLinking] = useState(false);
    // Herencia (§3) y vitrina del perfil (§4) — solo para nodos de Biblioteca.
    const [own, setOwn] = useState(true);
    const [inheritedFrom, setInheritedFrom] = useState<string | null>(null);
    const [shown, setShown] = useState(false);

    const spaceOpts = useMemo(() => ({ makeDoc: makeSpaceDoc }), [makeSpaceDoc]);
    const isLibNode = isLibraryResource(resource) && !!resource.libraryRef;
    const useInheritance = inheritance && isLibNode;
    const scopeOptions = useMemo(
        () => (scopes ?? DEFAULT_SCOPES).map((s) => SCOPE_META[s]).filter(Boolean),
        [scopes],
    );

    /** Relee el estado (efectivo si hay herencia; propio si no). */
    const refresh = useCallback(async () => {
        if (useInheritance) {
            const eff = await getEffectiveAccess(resource);
            setAccess({ scope: eff.scope, grants: eff.grants, spaceId: eff.spaceId, updatedAt: eff.updatedAt });
            setOwn(eff.own);
            setInheritedFrom(eff.own ? null : (eff.inheritedFromLabel ?? "Biblioteca"));
            setShown(isShownInProfile(resource));
            return;
        }
        setAccess(await getResourceAccess(resource));
        setOwn(true);
        setInheritedFrom(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- type/id identifican el recurso de forma estable
    }, [useInheritance, resource.type, resource.id]);

    // Carga inicial + realtime mientras el diálogo esté abierto.
    useEffect(() => {
        if (!open) return;
        let alive = true;
        setLoading(true);
        void refresh().then(() => {
            if (alive) setLoading(false);
        });
        const unsub = subscribeResourceAccess(resource, () => {
            if (alive) void refresh();
        });
        return () => {
            alive = false;
            unsub();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- type/id identifican el recurso de forma estable
    }, [open, resource.type, resource.id, refresh]);

    const scope = access?.scope ?? "account";

    /**
     * Antes de cualquier cambio: si el nodo HEREDA, se desengancha copiando el
     * acceso efectivo (la ACL propia siempre gana — §3). Editar es decidir.
     */
    const ensureOwn = useCallback(async () => {
        if (!useInheritance || own) return;
        await detachInheritance(resource, spaceOpts);
        setOwn(true);
        setInheritedFrom(null);
    }, [useInheritance, own, resource, spaceOpts]);

    // Buscador de destinatarios según el ámbito activo (perfiles · cuentas · grupos · páginas).
    useEffect(() => {
        if (!open) return;
        let alive = true;
        const term = query.trim();
        if (term.length < 2) {
            setResults([]);
            return;
        }
        setSearching(true);
        const t = setTimeout(() => {
            void (async () => {
                const hits: RecipientHit[] = [];
                try {
                    if (scope === "profiles") {
                        const facets = await searchAccountProfiles(term, 8);
                        for (const p of facets) {
                            hits.push({
                                granteeKind: "profile",
                                id: p.id,
                                label: p.name,
                                hint: p.handle ? `@${p.handle}` : "Perfil",
                            });
                        }
                    }
                    if (scope === "groups" || scope === "pages") {
                        const groups = await searchGroups(term, 10);
                        for (const g of groups) {
                            const isPage = g.kind === "pagina" || g.kind === "comunidad";
                            if (scope === "pages" && !isPage) continue;
                            if (scope === "groups" && isPage) continue;
                            hits.push({
                                granteeKind: scope === "pages" ? "page" : "group",
                                id: g.slug,
                                label: g.name || g.slug,
                                hint: g.kind,
                            });
                        }
                    }
                    if (scope === "custom" || scope === "public" || scope === "profile" || scope === "account" || scope === "private") {
                        const users = await searchUsers(term, 8);
                        for (const u of users) {
                            hits.push({
                                granteeKind: "account",
                                id: u.userId,
                                label: u.displayName || u.username,
                                hint: `@${u.username}`,
                            });
                        }
                    }
                } catch {
                    /* sin red: lista vacía, nunca rompe el diálogo */
                }
                if (!alive) return;
                setResults(hits);
                setSearching(false);
            })();
        }, 250);
        return () => {
            alive = false;
            clearTimeout(t);
        };
    }, [query, open, scope]);

    const grants = useMemo(
        () => (access?.grants ?? []).filter((g) => g.granteeKind !== "link"),
        [access],
    );
    const publicGrant = useMemo(
        () => (access?.grants ?? []).find((g) => g.granteeKind === "link") ?? null,
        [access],
    );

    /* ── Acciones (aplican en vivo; local-first). Editar un nodo heredado lo
     *    desengancha primero: la ACL propia siempre gana (§3). ── */

    const applyScope = useCallback(
        (next: AccessScope) => {
            void (async () => {
                await ensureOwn();
                setAccess(await setResourceScope(resource, next, spaceOpts));
            })();
        },
        [resource, spaceOpts, ensureOwn],
    );

    const addGrant = useCallback(
        (granteeKind: GranteeKind, granteeId: string, label?: string, role: AccessRole = "view") => {
            if (!granteeId.trim()) return;
            void (async () => {
                await ensureOwn();
                const a = await upsertGrant(
                    resource,
                    { granteeKind, granteeId: granteeId.trim(), label, role, sections: defaultSections },
                    spaceOpts,
                );
                setAccess(a);
                toast.success("Acceso añadido", {
                    description:
                        granteeKind === "profile"
                            ? `${label ?? granteeId} — y el resto de perfiles de su cuenta`
                            : (label ?? granteeId),
                });
            })();
        },
        [resource, spaceOpts, defaultSections, ensureOwn],
    );

    const updateGrant = useCallback(
        (grant: AccessGrant) => {
            void (async () => {
                await ensureOwn();
                setAccess(await upsertGrant(resource, grant, spaceOpts));
            })();
        },
        [resource, spaceOpts, ensureOwn],
    );

    const dropGrant = useCallback(
        (grant: AccessGrant) => {
            void (async () => {
                await ensureOwn();
                const a = await removeGrant(resource, grant.granteeKind, grant.granteeId, spaceOpts);
                setAccess(a);
                toast.message("Acceso retirado", { description: grant.label ?? grant.granteeId });
            })();
        },
        [resource, spaceOpts, ensureOwn],
    );

    /* ── Herencia (§3) ── */

    const handleDetach = useCallback(() => {
        void (async () => {
            await detachInheritance(resource, spaceOpts);
            await refresh();
            toast.success("Permisos propios", {
                description: "Este nodo ya no hereda: decide por sí mismo.",
            });
        })();
    }, [resource, spaceOpts, refresh]);

    const handleInherit = useCallback(() => {
        void (async () => {
            await restoreInheritance(resource);
            await refresh();
            toast.message("Vuelve a heredar", {
                description: "Se rige de nuevo por los permisos de su folder/biblioteca.",
            });
        })();
    }, [resource, refresh]);

    /* ── Vitrina del perfil (§4) ── */

    const handleShowcase = useCallback(
        (next: boolean) => {
            void (async () => {
                await setShowInProfile(resource, next);
                await refresh();
                toast.message(next ? "Se mostrará en tu perfil" : "Ya no se muestra en tu perfil", {
                    description: next
                        ? "Al publicarlo en tu perfil pasa a ser PÚBLICO (si no, las visitas no podrían abrirlo)."
                        : "Sigue compartido con quien ya tuviera acceso; solo deja de listarse.",
                });
            })();
        },
        [resource, refresh],
    );

    const handleCopyLink = useCallback(async () => {
        setLinking(true);
        try {
            let spaceId = access?.spaceId ?? null;
            // El patrón ?space= necesita espacio; los enlaces propios (biblioteca) no.
            const needsSpace = !buildLink || buildLink(null) === null;
            if (!spaceId && needsSpace) {
                spaceId = await ensureResourceSpace(resource, spaceOpts);
                if (spaceId) setAccess(await getResourceAccess(resource));
            }
            const link = buildLink ? buildLink(spaceId) : shareLinkFor(resource, spaceId);
            if (!link) {
                toast.message("Este recurso aún no tiene enlace directo", {
                    description: "Inicia sesión para crear su espacio compartido.",
                });
                return;
            }
            try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
                toast.success("Enlace copiado", { description: link });
            } catch {
                toast.message("Enlace generado", { description: link });
            }
        } finally {
            setLinking(false);
        }
    }, [access, buildLink, resource, spaceOpts]);

    const myProfileGrantIds = useMemo(
        () => new Set(grants.filter((g) => g.granteeKind === "profile").map((g) => g.granteeId)),
        [grants],
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md border-white/10 bg-zinc-950/95 text-white backdrop-blur-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
                        <Share2 className="size-4 text-cyan-300" /> {title ?? `Compartir «${resource.title ?? resource.id}»`}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        {description ?? "Decide quién accede y con qué rol. Privado en lo personal, transparente en lo público."}
                    </DialogDescription>
                </DialogHeader>

                {loading || !access ? (
                    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" /> Cargando permisos…
                    </div>
                ) : (
                    <div className="max-h-[62vh] space-y-3 overflow-y-auto py-1 pr-0.5">
                        {/* ── Herencia: ¿ACL propia o heredada del padre? (§3) ── */}
                        {useInheritance && (
                            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
                                <span
                                    className={cn(
                                        "shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold",
                                        own
                                            ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-200"
                                            : "border-amber-400/30 bg-amber-400/10 text-amber-300",
                                    )}
                                >
                                    {own ? "Propio" : "Heredado"}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                                    {own
                                        ? "Este nodo tiene sus propios permisos."
                                        : `Hereda los permisos de «${inheritedFrom ?? "Biblioteca"}».`}
                                </span>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 shrink-0 gap-1 border-white/15 px-2 text-[10px] cursor-pointer"
                                    onClick={own ? handleInherit : handleDetach}
                                >
                                    {own ? (
                                        <>
                                            <GitFork className="size-3" /> Volver a heredar
                                        </>
                                    ) : (
                                        <>
                                            <Link2Off className="size-3" /> Dejar de heredar
                                        </>
                                    )}
                                </Button>
                            </div>
                        )}

                        {/* ── Ámbito ── */}
                        <div>
                            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Ámbito</label>
                            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                                {scopeOptions.map((opt) => (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => applyScope(opt.id)}
                                        title={opt.desc}
                                        className={cn(
                                            "relative flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[11px] font-bold transition-colors cursor-pointer",
                                            scope === opt.id
                                                ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100"
                                                : "border-white/10 text-muted-foreground hover:bg-white/[0.06]",
                                        )}
                                    >
                                        {/* Marca el ámbito PREDETERMINADO: se entiende de un vistazo que
                                            no hay que configurar nada para que todos tus perfiles accedan. */}
                                        {opt.id === DEFAULT_SCOPE && (
                                            <span
                                                aria-hidden
                                                title="Ámbito predeterminado"
                                                className="absolute -top-1.5 right-1 rounded-full border border-emerald-300/40 bg-emerald-400/15 px-1 py-px text-[8px] font-bold uppercase tracking-wide text-emerald-200"
                                            >
                                                Def.
                                            </span>
                                        )}
                                        <opt.icon className="size-3.5" /> {opt.label}
                                    </button>
                                ))}
                            </div>
                            <p className="mt-1 px-0.5 text-[10px] text-muted-foreground">
                                {SCOPE_META[scope]?.desc}
                            </p>
                            {/* Línea de explicación del DEFAULT: por qué está así y cómo cambiarlo. */}
                            {scope === DEFAULT_SCOPE && (
                                <p className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-emerald-300/20 bg-emerald-400/[0.06] px-2 py-1.5 text-[10px] text-emerald-100/80">
                                    <Lock className="mt-px size-3 shrink-0 text-emerald-300" />
                                    <span>
                                        <b className="font-semibold">Toda mi cuenta (todos mis perfiles)</b> es el ajuste
                                        automático al crear. Tu cuenta es una sola y sus perfiles son facetas suyas: lo
                                        que guardas con un perfil lo tienes en todos. Elige otro ámbito arriba para
                                        cerrarlo (<b className="font-semibold">Privado</b>) o abrirlo a más gente.
                                    </span>
                                </p>
                            )}
                        </div>

                        {/* ── Vitrina: mostrar este nodo en la Biblioteca pública del perfil (§4) ── */}
                        {profileShowcase && isLibNode && (
                            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
                                <input
                                    type="checkbox"
                                    checked={shown}
                                    onChange={(e) => handleShowcase(e.target.checked)}
                                    className="mt-0.5 size-3 accent-emerald-400"
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-1.5 text-xs font-semibold text-white/85">
                                        <EyeIcon className="size-3.5 text-emerald-300" /> Mostrar en mi perfil
                                    </span>
                                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                                        Aparecerá en la pestaña Biblioteca de tu perfil, para cualquier visita. Al activarlo
                                        el nodo pasa a ser público.
                                    </span>
                                </span>
                            </label>
                        )}

                        {/* ── Público: rol de cualquiera con el enlace/la red ── */}
                        {scope === "public" && (
                            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
                                <Globe className="size-3.5 shrink-0 text-emerald-300" />
                                <span className="min-w-0 flex-1 truncate text-xs text-white/85">Cualquiera en la red puede</span>
                                <RoleSelect
                                    value={publicGrant?.role ?? "view"}
                                    onChange={(r) =>
                                        updateGrant({ granteeKind: "link", granteeId: "public", role: r, label: "Público" })
                                    }
                                />
                            </div>
                        )}

                        {/* ── Perfil(es) de mi cuenta (ámbito perfil, perfiles o personalizado) ── */}
                        {(scope === "profile" || scope === "profiles" || scope === "custom") && profiles.length > 0 && (
                            <div>
                                <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
                                    {scope === "profile" ? "Perfil con acceso" : "Perfiles de mi cuenta"}
                                </label>
                                <div className="flex flex-wrap gap-1.5">
                                    {profiles.map((p) => {
                                        const active = myProfileGrantIds.has(p.id);
                                        return (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() =>
                                                    active
                                                        ? dropGrant({ granteeKind: "profile", granteeId: p.id, role: "view" })
                                                        : addGrant("profile", p.id, p.name, "edit")
                                                }
                                                className={cn(
                                                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer",
                                                    active
                                                        ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100"
                                                        : "border-white/10 text-muted-foreground hover:bg-white/5",
                                                )}
                                            >
                                                {p.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ── Accesos concedidos ── */}
                        <div>
                            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Accesos</label>
                            {grants.length === 0 ? (
                                <p className="rounded-lg border border-dashed border-white/10 px-2.5 py-2 text-[11px] text-muted-foreground">
                                    {scope === "account"
                                        ? "Solo tu cuenta (todos tus perfiles). Añade accesos para compartir."
                                        : "Aún no hay accesos concedidos."}
                                </p>
                            ) : (
                                <div className="space-y-1">
                                    {grants.map((g) => (
                                        <GrantRow
                                            key={`${g.granteeKind}:${g.granteeId}`}
                                            grant={g}
                                            sections={sections}
                                            onRole={(r) => updateGrant({ ...g, role: r })}
                                            onSections={(ids) => updateGrant({ ...g, sections: ids })}
                                            onRemove={() => dropGrant(g)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* ── Añadir destinatarios (según el ámbito activo) ── */}
                        {scope !== "private" && scope !== "account" && (
                            <div className="space-y-2">
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder={
                                            scope === "profiles"
                                                ? "Buscar perfil por nombre o @handle…"
                                                : scope === "groups"
                                                  ? "Buscar grupo…"
                                                  : scope === "pages"
                                                    ? "Buscar página o comunidad…"
                                                    : "Buscar perfil por @usuario o nombre…"
                                        }
                                        className="h-8 rounded-lg border-white/10 bg-black/30 pl-7 text-[12px]"
                                    />
                                </div>
                                {scope === "profiles" && (
                                    <p className="text-[10px] text-amber-300/80">
                                        Dar acceso a un perfil lo da también al resto de perfiles de su cuenta (y al revés).
                                    </p>
                                )}
                                {searching && (
                                    <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                        <Loader2 className="size-3 animate-spin" /> Buscando…
                                    </p>
                                )}
                                {!searching && query.trim().length >= 2 && results.length === 0 && (
                                    <p className="text-[10px] text-muted-foreground">Sin resultados para «{query}».</p>
                                )}
                                {results.length > 0 && (
                                    <div className="space-y-1 rounded-lg border border-white/10 bg-black/20 p-1">
                                        {results.map((r) => {
                                            const Icon = GRANTEE_ICON[r.granteeKind];
                                            return (
                                                <button
                                                    key={`${r.granteeKind}:${r.id}`}
                                                    type="button"
                                                    onClick={() => {
                                                        addGrant(r.granteeKind, r.id, r.label);
                                                        setQuery("");
                                                        setResults([]);
                                                    }}
                                                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-white/10"
                                                >
                                                    <Icon className="size-3.5 text-muted-foreground" />
                                                    <span className="min-w-0 flex-1 truncate">{r.label}</span>
                                                    {r.hint && <span className="shrink-0 text-[10px] text-muted-foreground">{r.hint}</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                {/* Grupo/página por slug directo (cuando no aparece en el buscador). */}
                                {scope !== "profiles" && scope !== "profile" && (
                                    <div className="flex items-center gap-1.5">
                                        <div className="relative flex-1">
                                            <Users className="absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                                            <Input
                                                value={groupInput}
                                                onChange={(e) => setGroupInput(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter" && groupInput.trim()) {
                                                        addGrant(
                                                            scope === "pages" ? "page" : "group",
                                                            groupInput.trim().replace(/^@/, ""),
                                                            groupInput.trim(),
                                                        );
                                                        setGroupInput("");
                                                    }
                                                }}
                                                placeholder={
                                                    scope === "pages" ? "Añadir página por slug…" : "Añadir grupo por slug/id…"
                                                }
                                                className="h-8 rounded-lg border-white/10 bg-black/30 pl-7 text-[12px]"
                                            />
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-8 gap-1 border-white/15 px-2 text-[11px] cursor-pointer"
                                            disabled={!groupInput.trim()}
                                            onClick={() => {
                                                addGrant(
                                                    scope === "pages" ? "page" : "group",
                                                    groupInput.trim().replace(/^@/, ""),
                                                    groupInput.trim(),
                                                );
                                                setGroupInput("");
                                            }}
                                        >
                                            <Plus className="size-3" /> {scope === "pages" ? "Página" : "Grupo"}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Nota de acceso parcial ── */}
                        {sections && sections.length > 0 && (
                            <p className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                                <SlidersHorizontal className="mt-0.5 size-3 shrink-0" />
                                Acceso parcial disponible: despliega un acceso para elegir sus secciones (
                                {sections.map((s) => s.label).join(" · ")}).
                            </p>
                        )}
                    </div>
                )}

                <DialogFooter className="gap-2 sm:justify-between">
                    <Button
                        type="button"
                        variant="outline"
                        className="gap-1.5 border-white/15 cursor-pointer"
                        disabled={linking}
                        onClick={() => void handleCopyLink()}
                    >
                        {linking ? (
                            <Loader2 className="size-3.5 animate-spin" />
                        ) : copied ? (
                            <Check className="size-3.5 text-emerald-300" />
                        ) : (
                            <Copy className="size-3.5" />
                        )}
                        Copiar enlace
                    </Button>
                    <Button type="button" className="cursor-pointer" onClick={() => onOpenChange(false)}>
                        Hecho
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default ShareAccessDialog;
