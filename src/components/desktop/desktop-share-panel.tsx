'use client';

// ════════════════════════════════════════════════════════════════
// DesktopSharePanel — bloque "Sincronización" del panel de ajustes del
// escritorio (SOP §10-11):
//   · Con qué perfiles se comparte este conjunto de escritorios (visual
//     sobre 'starseed.sync.profiles.v1' — mode todos/seleccionados).
//   · Botón "Compartir como espacio…" → crea os_spaces kind='desktop'
//     copiando el doc actual (título, acceso, perfiles/invitados, grupo).
//   · Lista "Escritorios compartidos" (realtime): abrir carga el doc del
//     espacio en modo colaborativo.
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Share2, Users2, Globe, Lock, UserPlus, ExternalLink, Loader2, Radio, Mail, Check, X as XIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { readDesktopsSnapshot } from './desktop-store';
import {
    createSpace, inviteToSpaceByUsername, useMySpaces, useMyInvites, acceptInvite, declineInvite, type SpaceAccess,
} from '@/lib/spaces/spaces';
import { useMyProfiles } from '@/lib/profiles/profiles';
import { useSyncProfilesConfig } from '@/lib/sync/sync-profiles-config';

const ACCESS_OPTIONS: Array<{ id: SpaceAccess; label: string; icon: typeof Lock }> = [
    { id: 'private', label: 'Privado', icon: Lock },
    { id: 'profiles', label: 'Perfiles', icon: Users2 },
    { id: 'invite', label: 'Invitados', icon: UserPlus },
    { id: 'public', label: 'Público', icon: Globe },
];

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-bold transition-colors cursor-pointer',
                active ? 'border-cyan-300/50 bg-cyan-400/15 text-cyan-100' : 'border-white/10 text-muted-foreground hover:bg-white/[0.07]',
            )}
        >
            {children}
        </button>
    );
}

/** Diálogo "Compartir como espacio…": crea un os_spaces kind='desktop' copiando el doc actual. */
function ShareAsSpaceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { profiles } = useMyProfiles();
    const [title, setTitle] = useState('Mis escritorios');
    const [access, setAccess] = useState<SpaceAccess>('invite');
    const [selectedProfiles, setSelectedProfiles] = useState<Set<string>>(new Set());
    const [groupSlug, setGroupSlug] = useState('');
    const [inviteUsername, setInviteUsername] = useState('');
    const [creating, setCreating] = useState(false);
    const [createdId, setCreatedId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const toggleProfile = (id: string) => {
        setSelectedProfiles((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleCreate = useCallback(async () => {
        setCreating(true);
        setError(null);
        try {
            const doc = readDesktopsSnapshot();
            const space = await createSpace({
                kind: 'desktop',
                title: title.trim() || 'Escritorios compartidos',
                access,
                allowedProfiles: Array.from(selectedProfiles),
                groupSlug: groupSlug.trim() || null,
                doc: doc as unknown as Record<string, unknown>,
            });
            if (!space) {
                setError('No se pudo crear el espacio. Inicia sesión e inténtalo de nuevo.');
                return;
            }
            if (access === 'invite' && inviteUsername.trim()) {
                await inviteToSpaceByUsername(space.id, inviteUsername.trim());
            }
            setCreatedId(space.id);
        } finally {
            setCreating(false);
        }
    }, [title, access, selectedProfiles, groupSlug, inviteUsername]);

    const handleClose = () => {
        setCreatedId(null);
        setError(null);
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
            <DialogContent className="max-w-md border-white/10 bg-black/90 backdrop-blur-2xl">
                <DialogHeader>
                    <DialogTitle>Compartir como espacio</DialogTitle>
                    <DialogDescription>
                        Copia tus escritorios actuales a un espacio compartido colaborativo. El original queda intacto.
                    </DialogDescription>
                </DialogHeader>

                {createdId ? (
                    <div className="space-y-3 py-2 text-sm">
                        <p className="text-emerald-300 font-semibold">Espacio creado correctamente.</p>
                        <p className="text-xs text-muted-foreground">
                            Aparecerá en «Escritorios compartidos» para todos los perfiles/cuentas con acceso.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3 py-1">
                        <div>
                            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Título</label>
                            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-black/30 border-white/10" />
                        </div>
                        <div>
                            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Acceso</label>
                            <div className="grid grid-cols-4 gap-1.5">
                                {ACCESS_OPTIONS.map((opt) => (
                                    <SegBtn key={opt.id} active={access === opt.id} onClick={() => setAccess(opt.id)}>
                                        <opt.icon className="size-3" /> {opt.label}
                                    </SegBtn>
                                ))}
                            </div>
                        </div>
                        {access === 'profiles' && (
                            <div>
                                <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Perfiles permitidos</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {profiles.map((p) => (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => toggleProfile(p.id)}
                                            className={cn(
                                                'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer',
                                                selectedProfiles.has(p.id) ? 'border-primary/50 bg-primary/15 text-primary' : 'border-white/10 text-muted-foreground hover:bg-white/5',
                                            )}
                                        >
                                            {p.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {access === 'invite' && (
                            <div>
                                <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Invitar por @usuario (opcional)</label>
                                <Input
                                    value={inviteUsername}
                                    onChange={(e) => setInviteUsername(e.target.value)}
                                    placeholder="@usuario"
                                    className="bg-black/30 border-white/10"
                                />
                            </div>
                        )}
                        <div>
                            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Grupo (opcional)</label>
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
                        {createdId ? 'Cerrar' : 'Cancelar'}
                    </Button>
                    {!createdId && (
                        <Button className="gap-1.5 cursor-pointer" disabled={creating} onClick={handleCreate}>
                            {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Share2 className="size-3.5" />}
                            Compartir
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Sección "Invitaciones" — espacios donde estoy invitado (status='invited') y aún no he respondido. */
function PendingInvitesSection() {
    const { invites, loading, reload } = useMyInvites();
    const { reload: reloadSpaces } = useMySpaces('desktop');
    const [busyId, setBusyId] = useState<string | null>(null);
    const prevCount = useRef<number | null>(null);

    // Aproximación honesta de "nueva invitación": avisamos cuando la lista
    // CRECE respecto a la carga anterior (no distinguimos cuál es la nueva
    // fila exacta sin inspeccionar el payload de realtime en detalle).
    useEffect(() => {
        if (loading) return;
        if (prevCount.current !== null && invites.length > prevCount.current) {
            toast.info('Nueva invitación a un espacio compartido.');
        }
        prevCount.current = invites.length;
    }, [invites.length, loading]);

    const handleAccept = useCallback(async (spaceId: string) => {
        setBusyId(spaceId);
        try {
            const ok = await acceptInvite(spaceId);
            if (ok) {
                toast.success('Invitación aceptada.');
                reload();
                reloadSpaces();
            } else {
                toast.error('No se pudo aceptar la invitación. Inténtalo de nuevo.');
            }
        } finally {
            setBusyId(null);
        }
    }, [reload, reloadSpaces]);

    const handleDecline = useCallback(async (spaceId: string) => {
        setBusyId(spaceId);
        try {
            const ok = await declineInvite(spaceId);
            if (ok) {
                toast.info('Invitación rechazada.');
                reload();
            } else {
                toast.error('No se pudo rechazar la invitación. Inténtalo de nuevo.');
            }
        } finally {
            setBusyId(null);
        }
    }, [reload]);

    if (!loading && invites.length === 0) return null;

    return (
        <div className="space-y-1">
            <p className="flex items-center gap-1.5 px-1 text-[10px] font-semibold text-muted-foreground">
                <Mail className="size-3" /> Invitaciones
            </p>
            {loading ? (
                <p className="px-1 text-[11px] text-muted-foreground">Cargando…</p>
            ) : (
                <div className="space-y-1">
                    {invites.map((inv) => (
                        <div
                            key={inv.spaceId}
                            className="flex items-center gap-2 rounded-lg border border-amber-300/20 bg-amber-400/[0.05] px-2.5 py-1.5"
                        >
                            <Mail className="size-3 shrink-0 text-amber-300/80" />
                            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">{inv.title}</span>
                            <Badge variant="outline" className="shrink-0 border-white/10 text-[9px] text-muted-foreground">
                                {inv.kind}
                            </Badge>
                            <Badge variant="outline" className="shrink-0 border-white/10 text-[9px] text-muted-foreground">
                                {inv.role}
                            </Badge>
                            <button
                                type="button"
                                disabled={busyId === inv.spaceId}
                                onClick={() => handleAccept(inv.spaceId)}
                                className="flex shrink-0 items-center justify-center rounded-md border border-emerald-400/30 bg-emerald-400/10 p-1 text-emerald-300 transition-colors hover:bg-emerald-400/20 cursor-pointer disabled:opacity-50"
                                title="Aceptar invitación"
                            >
                                {busyId === inv.spaceId ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                            </button>
                            <button
                                type="button"
                                disabled={busyId === inv.spaceId}
                                onClick={() => handleDecline(inv.spaceId)}
                                className="flex shrink-0 items-center justify-center rounded-md border border-red-400/30 bg-red-400/10 p-1 text-red-300 transition-colors hover:bg-red-400/20 cursor-pointer disabled:opacity-50"
                                title="Rechazar invitación"
                            >
                                <XIcon className="size-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/** Bloque "Sincronización" completo para DesktopSettingsPanel. */
export function DesktopSharePanel() {
    const [shareOpen, setShareOpen] = useState(false);
    const { spaces, loading } = useMySpaces('desktop');
    const { config, update } = useSyncProfilesConfig();
    const { profiles } = useMyProfiles();

    const openSpace = (id: string) => {
        if (typeof window !== 'undefined') {
            window.location.href = `/escritorios?space=${encodeURIComponent(id)}`;
        }
    };

    return (
        <section className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/80">
                <Radio className="size-3" /> Sincronización
            </h4>

            {/* Invitaciones pendientes (espacios donde me han invitado) */}
            <PendingInvitesSection />

            {/* Con qué perfiles se comparte este conjunto de escritorios */}
            <div className="space-y-1.5 rounded-xl border border-white/10 p-2.5">
                <p className="text-[10px] font-semibold text-muted-foreground">Perfiles que sincronizan estos escritorios</p>
                <div className="flex gap-1.5">
                    <SegBtn active={config.mode === 'all'} onClick={() => update({ mode: 'all' })}>Todos ({profiles.length})</SegBtn>
                    <SegBtn active={config.mode === 'selected'} onClick={() => update({ mode: 'selected' })}>Seleccionados</SegBtn>
                </div>
                {config.mode === 'selected' && (
                    <div className="flex flex-wrap gap-1.5 pt-1.5 mt-1.5 border-t border-white/5">
                        {profiles.map((p) => {
                            const isSelected = config.profiles.includes(p.id);
                            return (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => {
                                        const next = isSelected 
                                            ? config.profiles.filter(id => id !== p.id) 
                                            : [...config.profiles, p.id];
                                        update({ profiles: next });
                                    }}
                                    className={cn(
                                        'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer',
                                        isSelected ? 'border-primary/50 bg-primary/15 text-primary' : 'border-white/10 text-muted-foreground hover:bg-white/5',
                                    )}
                                >
                                    {p.name}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Compartir como espacio */}
            <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-300/25 px-2.5 py-1.5 text-[12px] font-bold text-cyan-100 transition-colors hover:bg-cyan-400/10 cursor-pointer"
            >
                <Share2 className="size-3.5" /> Compartir como espacio…
            </button>

            {/* Escritorios compartidos (los míos + compartidos conmigo) */}
            <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground px-1">Escritorios compartidos</p>
                {loading ? (
                    <p className="px-1 text-[11px] text-muted-foreground">Cargando…</p>
                ) : spaces.length === 0 ? (
                    <p className="px-1 text-[11px] text-muted-foreground">Aún no hay escritorios compartidos.</p>
                ) : (
                    spaces.map((sp) => (
                        <button
                            key={sp.id}
                            type="button"
                            onClick={() => openSpace(sp.id)}
                            className="flex w-full items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.06] cursor-pointer"
                        >
                            <Share2 className="size-3 shrink-0 text-cyan-300/80" />
                            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">{sp.title}</span>
                            <Badge variant="outline" className="shrink-0 border-white/10 text-[9px] text-muted-foreground">
                                {sp.access}
                            </Badge>
                            <ExternalLink className="size-3 shrink-0 text-muted-foreground/60" />
                        </button>
                    ))
                )}
            </div>

            <ShareAsSpaceDialog open={shareOpen} onClose={() => setShareOpen(false)} />
        </section>
    );
}
