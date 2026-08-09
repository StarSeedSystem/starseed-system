"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * ProfileAccessManager — COMPARTIR una identidad (perfil · página · grupo ·
 *                        comunidad) con cuentas de toda la red · Adenda 149
 * ---------------------------------------------------------------------------
 * Un ÚNICO componente reutilizable para las tres superficies:
 *   <ProfileAccessManager kind="profile" id={profileId} isPrimary={p.isDefault} />
 *   <ProfileAccessManager kind="page"    id={page.id} />
 *   <ProfileAccessManager kind="group"   id={group.id} />
 *
 * MODO CREACIÓN (todavía no hay id): se pasa `id={null}` + `pending` /
 * `onPendingChange`. El componente gestiona una lista LOCAL de invitaciones que
 * el anfitrión persiste con `applyPendingAccess()` justo después de crear la
 * identidad. Así «al crear un perfil» se pueden elegir los accesos, tal como se
 * pidió, sin inventar filas huérfanas en la base.
 *
 * PERFIL PRINCIPAL: si `isPrimary` es true el panel se muestra BLOQUEADO con la
 * explicación honesta (no se esconde: se explica por qué). La regla se vuelve a
 * comprobar en la librería, en la RLS y en un trigger de la base.
 *
 * ROL `total`: exige un ConfirmDialog DESTRUCTIVO con la advertencia de
 * soberanía (incluye cerebros, memorias, configuraciones y logs) + la nota
 * honesta sobre hasta dónde llega hoy.
 *
 * Estilo: design system del repo — tarjetas `border-white/10`, superficies
 * `bg-white/[0.03]`, lucide, `cursor-pointer`, objetivos táctiles ≥40px,
 * textos en español. Defensivo y SSR-safe: todo el trabajo de red vive en
 * efectos/handlers y ninguna función lanza.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    AlertCircle,
    Check,
    Loader2,
    Lock,
    Search,
    ShieldAlert,
    ShieldCheck,
    UserPlus,
    Users2,
    X,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import {
    PROFILE_ACCESS_ROLES,
    PROFILE_ACCESS_ROLE_INFO,
    TOTAL_ACCESS_SCOPE_NOTE,
    TOTAL_ACCESS_WARNING,
    grantAccess,
    listAccess,
    revokeAccess,
    roleNeedsConfirmation,
    searchNetworkAccounts,
    updateAccessRole,
    type NetworkAccountHit,
    type PendingAccessGrant,
    type ProfileAccessEntry,
    type ProfileAccessRole,
    type SharedTargetKind,
} from "@/lib/social/profile-sharing";

/* ─────────────────────────────── Props ─────────────────────────────────── */

export interface ProfileAccessManagerProps {
    /** Qué se comparte. Las comunidades son páginas (`os_pages.kind`). */
    kind: SharedTargetKind;
    /** Id de la identidad. `null`/"" ⇒ modo CREACIÓN (lista en memoria). */
    id?: string | null;
    /** true ⇒ perfil PRINCIPAL: no compartible (panel bloqueado y explicado). */
    isPrimary?: boolean;
    /** Modo creación: accesos preparados (controlado por el anfitrión). */
    pending?: PendingAccessGrant[];
    onPendingChange?: (next: PendingAccessGrant[]) => void;
    /** Oculta el encabezado cuando el anfitrión ya pone el suyo. */
    hideHeader?: boolean;
    className?: string;
}

const KIND_LABEL: Record<SharedTargetKind, string> = {
    profile: "perfil",
    page: "página",
    group: "grupo",
};

function initialsOf(label: string): string {
    const parts = (label || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "SS";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

function shortId(id: string): string {
    return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

/* ──────────────────────── Selector de rol gradual ──────────────────────── */

function RolePicker({
    value,
    onChange,
    idPrefix,
    disabled,
}: {
    value: ProfileAccessRole;
    onChange: (role: ProfileAccessRole) => void;
    idPrefix: string;
    disabled?: boolean;
}) {
    const info = PROFILE_ACCESS_ROLE_INFO[value];
    return (
        <div className="space-y-2">
            <div
                role="radiogroup"
                aria-label="Nivel de permisos"
                className="flex flex-wrap gap-1.5"
            >
                {PROFILE_ACCESS_ROLES.map((r) => {
                    const meta = PROFILE_ACCESS_ROLE_INFO[r];
                    const active = r === value;
                    return (
                        <button
                            key={`${idPrefix}-${r}`}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            disabled={disabled}
                            onClick={() => onChange(r)}
                            title={meta.hint}
                            className={cn(
                                "min-h-10 rounded-xl border px-3 py-2 text-[11px] font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
                                active
                                    ? r === "total"
                                        ? "border-amber-400/50 bg-amber-500/15 text-amber-200"
                                        : "border-primary/50 bg-primary/15 text-primary"
                                    : "border-white/10 text-muted-foreground hover:bg-white/5",
                            )}
                        >
                            {r === "total" && <ShieldAlert className="mr-1 inline h-3 w-3 align-[-2px]" />}
                            {meta.label}
                        </button>
                    );
                })}
            </div>

            {/* Descripción del nivel elegido: qué incluye, sin letra pequeña. */}
            <div
                className={cn(
                    "rounded-xl border p-3 text-[11px] leading-relaxed",
                    value === "total"
                        ? "border-amber-400/30 bg-amber-500/10 text-amber-100"
                        : "border-white/10 bg-white/[0.03] text-muted-foreground",
                )}
            >
                <p className="font-semibold">{info.label}</p>
                <ul className="mt-1 space-y-0.5">
                    {info.includes.map((line) => (
                        <li key={line} className="flex gap-1.5">
                            <Check className="mt-[3px] h-3 w-3 shrink-0 opacity-70" />
                            <span>{line}</span>
                        </li>
                    ))}
                </ul>
                {value === "total" && (
                    <p className="mt-2 border-t border-amber-400/20 pt-2 opacity-90">{TOTAL_ACCESS_SCOPE_NOTE}</p>
                )}
            </div>
        </div>
    );
}

/* ───────────────────────────── Componente ──────────────────────────────── */

export function ProfileAccessManager({
    kind,
    id,
    isPrimary = false,
    pending,
    onPendingChange,
    hideHeader = false,
    className,
}: ProfileAccessManagerProps) {
    const confirm = useConfirm();
    const targetId = (id ?? "").trim();
    const creating = targetId.length === 0;

    const [entries, setEntries] = useState<ProfileAccessEntry[]>([]);
    const [loading, setLoading] = useState(!creating && !isPrimary);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<NetworkAccountHit[]>([]);
    const [searching, setSearching] = useState(false);
    const [picked, setPicked] = useState<NetworkAccountHit | null>(null);
    const [role, setRole] = useState<ProfileAccessRole>("observador");
    const [busy, setBusy] = useState(false);
    const aliveRef = useRef(true);

    const pendingList = useMemo(() => pending ?? [], [pending]);

    useEffect(() => {
        aliveRef.current = true;
        return () => {
            aliveRef.current = false;
        };
    }, []);

    /* ── Carga de la lista real (solo si ya existe la identidad) ── */
    const reload = useCallback(async () => {
        if (creating || isPrimary) {
            setEntries([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        const list = await listAccess(kind, targetId);
        if (!aliveRef.current) return;
        setEntries(list);
        setLoading(false);
    }, [creating, isPrimary, kind, targetId]);

    useEffect(() => {
        void reload();
    }, [reload]);

    /* ── Buscador de cuentas (debounce 300 ms, SSR-safe) ── */
    useEffect(() => {
        const term = query.trim();
        if (term.length < 2) {
            setResults([]);
            setSearching(false);
            return;
        }
        setSearching(true);
        const t = setTimeout(() => {
            void searchNetworkAccounts(term).then((hits) => {
                if (!aliveRef.current) return;
                setResults(hits);
                setSearching(false);
            });
        }, 300);
        return () => clearTimeout(t);
    }, [query]);

    const alreadyGranted = useMemo(() => {
        const ids = new Set<string>();
        for (const e of entries) if (e.granteeUserId) ids.add(e.granteeUserId);
        for (const p of pendingList) ids.add(p.accountId);
        return ids;
    }, [entries, pendingList]);

    /* ── Conceder ── */
    const handleGrant = useCallback(async () => {
        if (!picked) {
            toast.error("Elige primero una cuenta de la red.");
            return;
        }
        if (alreadyGranted.has(picked.accountId)) {
            toast.error("Esa cuenta ya tiene acceso.");
            return;
        }
        if (roleNeedsConfirmation(role)) {
            const ok = await confirm({
                title: `Conceder ACCESO COMPLETO ABSOLUTO a ${picked.displayName}`,
                description: `${TOTAL_ACCESS_WARNING}\n\n${TOTAL_ACCESS_SCOPE_NOTE}`,
                confirmText: "Sí, conceder acceso absoluto",
                cancelText: "Cancelar",
                destructive: true,
            });
            if (!ok) return;
        }

        // Modo CREACIÓN: se guarda en la cola del anfitrión.
        if (creating) {
            onPendingChange?.([
                ...pendingList,
                {
                    accountId: picked.accountId,
                    displayName: picked.displayName,
                    handle: picked.handle,
                    avatarUrl: picked.avatarUrl,
                    role,
                },
            ]);
            setPicked(null);
            setQuery("");
            setResults([]);
            toast.success("Acceso preparado: se aplicará al guardar.");
            return;
        }

        setBusy(true);
        const res = await grantAccess(kind, targetId, { granteeUserId: picked.accountId, role });
        setBusy(false);
        if (!res.ok) {
            toast.error(res.error ?? "No se pudo conceder el acceso.");
            return;
        }
        toast.success(`Acceso concedido a ${picked.displayName}.`);
        setPicked(null);
        setQuery("");
        setResults([]);
        void reload();
    }, [picked, alreadyGranted, role, confirm, creating, onPendingChange, pendingList, kind, targetId, reload]);

    /* ── Cambiar rol ── */
    const handleRoleChange = useCallback(
        async (entry: ProfileAccessEntry, next: ProfileAccessRole) => {
            if (next === entry.role) return;
            if (roleNeedsConfirmation(next)) {
                const who = entry.displayName || entry.handle || shortId(entry.granteeUserId ?? entry.id);
                const ok = await confirm({
                    title: `Elevar a ACCESO COMPLETO ABSOLUTO a ${who}`,
                    description: `${TOTAL_ACCESS_WARNING}\n\n${TOTAL_ACCESS_SCOPE_NOTE}`,
                    confirmText: "Sí, conceder acceso absoluto",
                    cancelText: "Cancelar",
                    destructive: true,
                });
                if (!ok) return;
            }
            setBusy(true);
            const res = await updateAccessRole(entry.targetKind, entry.id, next);
            setBusy(false);
            if (!res.ok) {
                toast.error(res.error ?? "No se pudo cambiar el rol.");
                return;
            }
            toast.success("Permisos actualizados.");
            void reload();
        },
        [confirm, reload],
    );

    /* ── Retirar ── */
    const handleRevoke = useCallback(
        async (entry: ProfileAccessEntry) => {
            const who = entry.displayName || entry.handle || shortId(entry.granteeUserId ?? entry.id);
            const ok = await confirm({
                title: `Retirar el acceso de ${who}`,
                description:
                    "Dejará de tener acceso a esta identidad. No se borra nada suyo: solo deja de compartirse, y puedes volver a concederlo cuando quieras.",
                confirmText: "Retirar acceso",
                cancelText: "Cancelar",
                destructive: true,
            });
            if (!ok) return;
            setBusy(true);
            const res = await revokeAccess(entry.targetKind, entry.id);
            setBusy(false);
            if (!res.ok) {
                toast.error(res.error ?? "No se pudo retirar el acceso.");
                return;
            }
            toast.success("Acceso retirado.");
            void reload();
        },
        [confirm, reload],
    );

    const removePending = useCallback(
        (accountId: string) => {
            onPendingChange?.(pendingList.filter((p) => p.accountId !== accountId));
        },
        [onPendingChange, pendingList],
    );

    /* ── Perfil PRINCIPAL: bloqueado y explicado ── */
    if (isPrimary) {
        return (
            <section className={cn("rounded-2xl border border-white/10 bg-white/[0.03] p-4", className)}>
                <h4 className="flex items-center gap-2 text-xs font-semibold">
                    <Lock className="h-3.5 w-3.5 text-amber-300" /> Compartir con cuentas
                </h4>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    Este es tu <strong className="text-foreground">perfil principal</strong>: tu identidad
                    soberana en la red. No se puede compartir con otras cuentas — es la garantía de que nadie
                    puede actuar como tú. Crea otro perfil (personal, grupal, público o temático) y compártelo
                    con quien quieras, con los permisos que elijas.
                </p>
            </section>
        );
    }

    const total = entries.length + pendingList.length;

    return (
        <section className={cn("space-y-3", className)}>
            {!hideHeader && (
                <div className="flex items-center justify-between gap-2">
                    <h4 className="flex items-center gap-2 text-xs font-semibold">
                        <Users2 className="h-3.5 w-3.5 text-primary" /> Compartir con cuentas
                    </h4>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        {total === 0 ? "sin accesos" : `${total} ${total === 1 ? "cuenta" : "cuentas"}`}
                    </span>
                </div>
            )}

            <p className="text-[11px] leading-relaxed text-muted-foreground">
                Cualquier cuenta de la red puede recibir acceso a {KIND_LABEL[kind] === "página" ? "esta" : "este"}{" "}
                {KIND_LABEL[kind]}, con permisos graduales por cuenta. Puedes cambiarlos o retirarlos cuando
                quieras.
            </p>

            {/* Páginas/grupos: se dice con claridad que esto NO es la membresía.
                El censo («una persona, una voz») sigue viviendo en su roster —
                aquí solo se reparte la GESTIÓN compartida de la entidad. */}
            {kind !== "profile" && (
                <p className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-[10px] leading-relaxed text-muted-foreground">
                    Esto es <strong className="text-foreground">gestión compartida</strong>, no membresía: quien
                    recibe acceso puede ayudar a llevar {KIND_LABEL[kind] === "página" ? "esta" : "este"}{" "}
                    {KIND_LABEL[kind]}. La lista de miembros y el censo (una persona, una voz) siguen siendo los
                    de siempre y no cambian al conceder estos permisos.
                </p>
            )}

            {/* ── Añadir cuenta ── */}
            <div className="space-y-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <label
                    htmlFor={`access-search-${kind}-${targetId || "nuevo"}`}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"
                >
                    <UserPlus className="h-3.5 w-3.5" /> Añadir una cuenta
                </label>

                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        id={`access-search-${kind}-${targetId || "nuevo"}`}
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setPicked(null);
                        }}
                        placeholder="Buscar por @handle o nombre…"
                        autoComplete="off"
                        className="min-h-10 border-white/10 bg-black/30 pl-9"
                    />
                    {searching && (
                        <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
                    )}
                </div>

                {/* Resultados */}
                {query.trim().length >= 2 && !picked && (
                    <div className="max-h-52 space-y-1 overflow-y-auto">
                        {!searching && results.length === 0 && (
                            <p className="px-1 py-2 text-[11px] text-muted-foreground">
                                Ninguna cuenta coincide con «{query.trim()}».
                            </p>
                        )}
                        {results.map((hit) => {
                            const taken = alreadyGranted.has(hit.accountId);
                            return (
                                <button
                                    key={hit.accountId}
                                    type="button"
                                    disabled={taken}
                                    onClick={() => setPicked(hit)}
                                    className={cn(
                                        "flex min-h-10 w-full items-center gap-2.5 rounded-xl border border-white/10 px-2.5 py-2 text-left transition-colors cursor-pointer hover:bg-white/[0.06]",
                                        taken && "cursor-not-allowed opacity-45 hover:bg-transparent",
                                    )}
                                >
                                    <Avatar className="h-7 w-7 shrink-0 border border-white/10">
                                        {hit.avatarUrl ? <AvatarImage src={hit.avatarUrl} alt={hit.displayName} /> : null}
                                        <AvatarFallback className="bg-gradient-to-br from-primary/40 to-accent/40 text-[10px] font-bold">
                                            {initialsOf(hit.displayName)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-xs font-semibold">{hit.displayName}</span>
                                        <span className="block truncate text-[10px] text-muted-foreground">
                                            {hit.handle ? `@${hit.handle}` : shortId(hit.accountId)}
                                            {taken ? " · ya tiene acceso" : ""}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Cuenta elegida + rol + confirmar */}
                {picked && (
                    <div className="space-y-2.5 rounded-xl border border-primary/25 bg-primary/[0.06] p-2.5">
                        <div className="flex items-center gap-2.5">
                            <Avatar className="h-8 w-8 shrink-0 border border-white/10">
                                {picked.avatarUrl ? <AvatarImage src={picked.avatarUrl} alt={picked.displayName} /> : null}
                                <AvatarFallback className="bg-gradient-to-br from-primary/50 to-accent/50 text-[10px] font-bold">
                                    {initialsOf(picked.displayName)}
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold">{picked.displayName}</p>
                                <p className="truncate text-[10px] text-muted-foreground">
                                    {picked.handle ? `@${picked.handle}` : shortId(picked.accountId)}
                                </p>
                            </div>
                            <button
                                type="button"
                                aria-label="Quitar la cuenta elegida"
                                title="Quitar la cuenta elegida"
                                onClick={() => setPicked(null)}
                                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground cursor-pointer"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>

                        <RolePicker value={role} onChange={setRole} idPrefix="new" disabled={busy} />

                        <Button
                            type="button"
                            onClick={() => void handleGrant()}
                            disabled={busy}
                            className="min-h-10 w-full gap-1.5 cursor-pointer"
                        >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                            {creating ? "Preparar acceso" : "Conceder acceso"}
                        </Button>
                    </div>
                )}
            </div>

            {/* ── Accesos preparados (modo creación) ── */}
            {pendingList.length > 0 && (
                <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        Se aplicarán al guardar
                    </p>
                    {pendingList.map((p) => (
                        <div
                            key={p.accountId}
                            className="flex min-h-10 items-center gap-2.5 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-2.5 py-2"
                        >
                            <Avatar className="h-7 w-7 shrink-0 border border-white/10">
                                {p.avatarUrl ? <AvatarImage src={p.avatarUrl} alt={p.displayName} /> : null}
                                <AvatarFallback className="bg-gradient-to-br from-primary/40 to-accent/40 text-[10px] font-bold">
                                    {initialsOf(p.displayName)}
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold">{p.displayName}</p>
                                <p className="truncate text-[10px] text-muted-foreground">
                                    {p.handle ? `@${p.handle} · ` : ""}
                                    {PROFILE_ACCESS_ROLE_INFO[p.role].label}
                                </p>
                            </div>
                            <button
                                type="button"
                                aria-label={`Quitar acceso preparado de ${p.displayName}`}
                                title="Quitar"
                                onClick={() => removePending(p.accountId)}
                                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-red-500/15 hover:text-red-300 cursor-pointer"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Cuentas con acceso (real) ── */}
            {!creating && (
                <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                        <ShieldCheck className="h-3 w-3" /> Cuentas con acceso
                    </p>

                    {loading ? (
                        <div className="flex min-h-10 items-center gap-2 px-1 text-[11px] text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando accesos…
                        </div>
                    ) : entries.length === 0 ? (
                        <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-[11px] text-muted-foreground">
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                                Todavía no has compartido {KIND_LABEL[kind] === "página" ? "esta" : "este"}{" "}
                                {KIND_LABEL[kind]} con nadie. Búscala arriba por @handle o por nombre.
                            </span>
                        </div>
                    ) : (
                        entries.map((entry) => (
                            <div
                                key={entry.id}
                                className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5"
                            >
                                <div className="flex items-center gap-2.5">
                                    <Avatar className="h-8 w-8 shrink-0 border border-white/10">
                                        {entry.avatarUrl ? (
                                            <AvatarImage src={entry.avatarUrl} alt={entry.displayName ?? ""} />
                                        ) : null}
                                        <AvatarFallback className="bg-gradient-to-br from-primary/40 to-accent/40 text-[10px] font-bold">
                                            {initialsOf(entry.displayName ?? entry.handle ?? "SS")}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-semibold">
                                            {entry.displayName ||
                                                (entry.inviteHandle ? `@${entry.inviteHandle}` : "") ||
                                                entry.inviteEmail ||
                                                shortId(entry.granteeUserId ?? entry.id)}
                                        </p>
                                        <p className="truncate text-[10px] text-muted-foreground">
                                            {entry.handle ? `@${entry.handle} · ` : ""}
                                            {PROFILE_ACCESS_ROLE_INFO[entry.role].label}
                                            {entry.granteeUserId ? "" : " · invitación pendiente"}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        aria-label={`Retirar el acceso de ${entry.displayName ?? "esta cuenta"}`}
                                        title="Retirar acceso"
                                        onClick={() => void handleRevoke(entry)}
                                        disabled={busy}
                                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-red-500/15 hover:text-red-300 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>

                                <div className="flex flex-wrap gap-1.5">
                                    {PROFILE_ACCESS_ROLES.map((r) => {
                                        const meta = PROFILE_ACCESS_ROLE_INFO[r];
                                        const active = r === entry.role;
                                        return (
                                            <button
                                                key={`${entry.id}-${r}`}
                                                type="button"
                                                disabled={busy}
                                                title={meta.hint}
                                                onClick={() => void handleRoleChange(entry, r)}
                                                className={cn(
                                                    "min-h-10 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
                                                    active
                                                        ? r === "total"
                                                            ? "border-amber-400/50 bg-amber-500/15 text-amber-200"
                                                            : "border-primary/50 bg-primary/15 text-primary"
                                                        : "border-white/10 text-muted-foreground hover:bg-white/5",
                                                )}
                                            >
                                                {meta.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </section>
    );
}

export default ProfileAccessManager;
