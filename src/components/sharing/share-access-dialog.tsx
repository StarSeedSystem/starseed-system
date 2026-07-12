"use client";

/*
 * ShareAccessDialog — diálogo UNIVERSAL de permisos y compartición (Adenda 63 §5).
 * Un solo componente para escritorios, dashboards, pizarras, cerebros y
 * archivos/carpetas de biblioteca, sobre el modelo src/lib/sharing/access.ts:
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
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    ensureResourceSpace, getResourceAccess, removeGrant, setResourceScope,
    shareLinkFor, subscribeResourceAccess, upsertGrant, ROLE_LABELS,
    type AccessGrant, type AccessRole, type AccessScope, type GranteeKind,
    type ResourceAccess, type ResourceRef,
} from "@/lib/sharing/access";
import { searchUsers } from "@/lib/social/os-profiles";
import { useMyProfiles } from "@/lib/profiles/profiles";

/* ─────────────────────────── Constantes de UI ─────────────────────────── */

const SCOPE_OPTIONS: Array<{ id: AccessScope; label: string; icon: typeof Lock; desc: string }> = [
    { id: "profile", label: "Un perfil", icon: User, desc: "Solo un perfil concreto de tu cuenta." },
    { id: "account", label: "Mi cuenta", icon: Lock, desc: "Todos los perfiles de tu cuenta. Privado hacia fuera." },
    { id: "custom", label: "Personalizado", icon: Users, desc: "Perfiles, cuentas o grupos externos concretos." },
    { id: "public", label: "Público", icon: Globe, desc: "Cualquiera en la red. El poder público es transparente." },
];

const ROLES: AccessRole[] = ["view", "comment", "edit", "admin"];

const GRANTEE_ICON: Record<GranteeKind, typeof User> = {
    profile: User,
    account: AtSign,
    group: Users,
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

export function ShareAccessDialog({
    open, onOpenChange, resource, makeSpaceDoc, sections, defaultSections, buildLink, title, description,
}: ShareAccessDialogProps) {
    const { profiles } = useMyProfiles();
    const [access, setAccess] = useState<ResourceAccess | null>(null);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Array<{ id: string; label: string; hint?: string }>>([]);
    const [searching, setSearching] = useState(false);
    const [groupInput, setGroupInput] = useState("");
    const [copied, setCopied] = useState(false);
    const [linking, setLinking] = useState(false);

    const spaceOpts = useMemo(() => ({ makeDoc: makeSpaceDoc }), [makeSpaceDoc]);

    // Carga inicial + realtime mientras el diálogo esté abierto.
    useEffect(() => {
        if (!open) return;
        let alive = true;
        setLoading(true);
        void getResourceAccess(resource).then((a) => {
            if (alive) {
                setAccess(a);
                setLoading(false);
            }
        });
        const unsub = subscribeResourceAccess(resource, () => {
            void getResourceAccess(resource).then((a) => {
                if (alive) setAccess(a);
            });
        });
        return () => {
            alive = false;
            unsub();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- type/id identifican el recurso de forma estable
    }, [open, resource.type, resource.id]);

    // Buscador de perfiles del directorio (os_profiles, como el Hub) con debounce.
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
            void searchUsers(term, 8).then((users) => {
                if (!alive) return;
                setResults(users.map((u) => ({ id: u.userId, label: u.displayName || u.username, hint: `@${u.username}` })));
                setSearching(false);
            });
        }, 250);
        return () => {
            alive = false;
            clearTimeout(t);
        };
    }, [query, open]);

    const grants = useMemo(
        () => (access?.grants ?? []).filter((g) => g.granteeKind !== "link"),
        [access],
    );
    const publicGrant = useMemo(
        () => (access?.grants ?? []).find((g) => g.granteeKind === "link") ?? null,
        [access],
    );

    /* ── Acciones (aplican en vivo; local-first) ── */

    const applyScope = useCallback(
        (scope: AccessScope) => {
            void setResourceScope(resource, scope, spaceOpts).then(setAccess);
        },
        [resource, spaceOpts],
    );

    const addGrant = useCallback(
        (granteeKind: GranteeKind, granteeId: string, label?: string, role: AccessRole = "view") => {
            if (!granteeId.trim()) return;
            void upsertGrant(
                resource,
                { granteeKind, granteeId: granteeId.trim(), label, role, sections: defaultSections },
                spaceOpts,
            ).then((a) => {
                setAccess(a);
                toast.success("Acceso añadido", { description: label ?? granteeId });
            });
        },
        [resource, spaceOpts, defaultSections],
    );

    const updateGrant = useCallback(
        (grant: AccessGrant) => {
            void upsertGrant(resource, grant, spaceOpts).then(setAccess);
        },
        [resource, spaceOpts],
    );

    const dropGrant = useCallback(
        (grant: AccessGrant) => {
            void removeGrant(resource, grant.granteeKind, grant.granteeId, spaceOpts).then((a) => {
                setAccess(a);
                toast.message("Acceso retirado", { description: grant.label ?? grant.granteeId });
            });
        },
        [resource, spaceOpts],
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

    const scope = access?.scope ?? "account";

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
                        {/* ── Ámbito ── */}
                        <div>
                            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Ámbito</label>
                            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                                {SCOPE_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => applyScope(opt.id)}
                                        title={opt.desc}
                                        className={cn(
                                            "flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[11px] font-bold transition-colors cursor-pointer",
                                            scope === opt.id
                                                ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100"
                                                : "border-white/10 text-muted-foreground hover:bg-white/[0.06]",
                                        )}
                                    >
                                        <opt.icon className="size-3.5" /> {opt.label}
                                    </button>
                                ))}
                            </div>
                            <p className="mt-1 px-0.5 text-[10px] text-muted-foreground">
                                {SCOPE_OPTIONS.find((o) => o.id === scope)?.desc}
                            </p>
                        </div>

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

                        {/* ── Perfil(es) de mi cuenta (ámbito perfil o personalizado) ── */}
                        {(scope === "profile" || scope === "custom") && profiles.length > 0 && (
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

                        {/* ── Añadir personas y grupos (ámbito personalizado o público) ── */}
                        {(scope === "custom" || scope === "public") && (
                            <div className="space-y-2">
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder="Buscar perfil por @usuario o nombre…"
                                        className="h-8 rounded-lg border-white/10 bg-black/30 pl-7 text-[12px]"
                                    />
                                </div>
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
                                        {results.map((r) => (
                                            <button
                                                key={r.id}
                                                type="button"
                                                onClick={() => {
                                                    addGrant("account", r.id, r.label);
                                                    setQuery("");
                                                    setResults([]);
                                                }}
                                                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-white/10"
                                            >
                                                <AtSign className="size-3.5 text-muted-foreground" />
                                                <span className="min-w-0 flex-1 truncate">{r.label}</span>
                                                {r.hint && <span className="shrink-0 text-[10px] text-muted-foreground">{r.hint}</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <div className="flex items-center gap-1.5">
                                    <div className="relative flex-1">
                                        <Users className="absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            value={groupInput}
                                            onChange={(e) => setGroupInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" && groupInput.trim()) {
                                                    addGrant("group", groupInput.trim().replace(/^@/, ""), groupInput.trim());
                                                    setGroupInput("");
                                                }
                                            }}
                                            placeholder="Añadir grupo por slug/id…"
                                            className="h-8 rounded-lg border-white/10 bg-black/30 pl-7 text-[12px]"
                                        />
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 gap-1 border-white/15 px-2 text-[11px] cursor-pointer"
                                        disabled={!groupInput.trim()}
                                        onClick={() => {
                                            addGrant("group", groupInput.trim().replace(/^@/, ""), groupInput.trim());
                                            setGroupInput("");
                                        }}
                                    >
                                        <Plus className="size-3" /> Grupo
                                    </Button>
                                </div>
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
