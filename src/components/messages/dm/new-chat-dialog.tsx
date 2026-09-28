"use client";

/*
 * NewChatDialog — nuevo chat directo o grupo (rediseño 2026-09-28).
 *
 * Primero «Tus contactos» (libreta privada: favoritos arriba, chip de relación, avatar), después
 * «Buscar en StarSeed» (directorio os_profiles). Para un grupo se eligen personas de ambas
 * listas. Se conserva la creación de una comunidad/grupo REAL de la red vinculada al chat
 * (Adenda jul-2026 §1) y `seedMyProfile()` al abrir.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Boxes, Check, CircleDot, Landmark, Loader2, Search, Star, User, Users2, X } from "lucide-react";
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { searchUsers, seedMyProfile, type OsProfile } from "@/lib/social/os-profiles";
import { createDm, createGroup, setThreadEntityLink, sendMessage } from "@/lib/messages/dm";
// Crear también una comunidad/grupo REAL de la red al crear un grupo de chat
// (Adenda jul-2026 §1): el hilo queda vinculado (meta.entityLink) y los demás
// participantes reciben una tarjeta-invitación que deben aceptar ellos mismos
// (RLS de os_memberships exige auto-servicio; ver @/lib/invitations/invitations.ts).
import { createGroup as createOsGroup, setMembership, type OsGroup } from "@/lib/os-social";
import { buildInviteAttachment } from "@/lib/invitations/invitations";
import { useContactos } from "@/lib/contactos/store";
import { RELACIONES, type Contacto } from "@/lib/contactos/tipos";
import { useAjustesMensajeria } from "@/lib/mensajeria/ajustes-store";
import { AvatarContacto } from "@/components/contactos/avatar-contacto";
import { ACENTO, CLASE_ROTULO, pildoraFantasma } from "@/components/messages/marco/estilos";
import { aplicarAuroraPorDefecto } from "@/components/messages/marco/aurora-por-defecto";

export interface NewChatDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: (threadId: string) => void;
}

interface Elegido {
    userId: string;
    nombre: string;
    avatarUrl?: string | null;
}

function normalizar(s: string): string {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Contactos con cuenta StarSeed que coinciden con el texto: favoritos primero, luego por nombre. */
export function contactosParaChat(contactos: Contacto[], texto: string, miUid: string | null): Contacto[] {
    const q = normalizar(texto.trim().replace(/^@/, ""));
    return contactos
        .filter((c) => !!c.userId && c.userId !== miUid)
        .filter((c) => !q || normalizar([c.nombre, c.apodo, c.username].filter(Boolean).join(" ")).includes(q))
        .sort((a, b) => Number(b.favorito) - Number(a.favorito) || (a.apodo || a.nombre).localeCompare(b.apodo || b.nombre, "es", { sensitivity: "base" }));
}

function ChipRelacion({ relacion }: { relacion: Contacto["relacion"] }) {
    const r = RELACIONES.find((x) => x.id === relacion);
    if (!r) return null;
    return (
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ ...pildoraFantasma(r.color), color: r.color }}>
            {r.etiqueta}
        </span>
    );
}

export function NewChatDialog({ open, onOpenChange, onCreated }: NewChatDialogProps) {
    const libreta = useContactos();
    const aj = useAjustesMensajeria();
    const [miUid, setMiUid] = useState<string | null>(null);
    const [tab, setTab] = useState<"dm" | "group">("dm");
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<OsProfile[]>([]);
    const [searching, setSearching] = useState(false);
    const [selected, setSelected] = useState<Elegido[]>([]);
    const [groupTitle, setGroupTitle] = useState("");
    const [creating, setCreating] = useState(false);
    // Crear también comunidad/grupo de la red (Adenda jul-2026 §1).
    const [alsoCreateEntity, setAlsoCreateEntity] = useState(false);
    const [entityKind, setEntityKind] = useState<OsGroup["kind"]>("colectivo");

    useEffect(() => {
        if (!open) return;
        void seedMyProfile().then((p) => setMiUid(p?.userId ?? null));
    }, [open]);

    useEffect(() => {
        if (!open) {
            setQuery("");
            setResults([]);
            setSelected([]);
            setGroupTitle("");
            setTab("dm");
            setAlsoCreateEntity(false);
            setEntityKind("colectivo");
        }
    }, [open]);

    useEffect(() => {
        const term = query.trim();
        if (term.length < 1) {
            setResults([]);
            setSearching(false);
            return;
        }
        setSearching(true);
        const t = setTimeout(async () => {
            const res = await searchUsers(term);
            setResults(res);
            setSearching(false);
        }, 250);
        return () => clearTimeout(t);
    }, [query]);

    const contactos = useMemo(() => contactosParaChat(libreta.contactos, query, miUid), [libreta.contactos, query, miUid]);
    const idsContactos = useMemo(() => new Set(libreta.contactos.map((c) => c.userId).filter(Boolean) as string[]), [libreta.contactos]);
    // Del directorio, solo quien no está ya en tu libreta (ni eres tú).
    const deLaRed = useMemo(() => results.filter((p) => !idsContactos.has(p.userId) && p.userId !== miUid), [results, idsContactos, miUid]);

    const estaElegido = (uid: string) => selected.some((s) => s.userId === uid);
    const alternar = (e: Elegido) =>
        setSelected((prev) => (prev.some((s) => s.userId === e.userId) ? prev.filter((s) => s.userId !== e.userId) : [...prev, e]));

    const handleStartDm = async (userId: string) => {
        setCreating(true);
        try {
            const res = await createDm(userId);
            if (res.needsAuth) {
                toast.error("Inicia sesión para escribir a alguien.");
                return;
            }
            if (!res.ok || !res.thread) {
                toast.error(res.error || "No se pudo iniciar la conversación.");
                return;
            }
            await aplicarAuroraPorDefecto(res.thread, aj.ajustes.aurora);
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
            const title = groupTitle.trim() || "Nuevo grupo";
            const res = await createGroup(title, selected.map((s) => s.userId));
            if (res.needsAuth) {
                toast.error("Inicia sesión para crear un grupo.");
                return;
            }
            if (!res.ok || !res.thread) {
                toast.error(res.error || "No se pudo crear el grupo.");
                return;
            }
            await aplicarAuroraPorDefecto(res.thread, aj.ajustes.aurora);

            // Opción "crear también comunidad/grupo de la red": crea el os_groups
            // real, se auto-une el creador, vincula el hilo↔entidad y envía una
            // tarjeta-invitación a cada participante para que se unan ellos
            // mismos (RLS de os_memberships exige auto-servicio).
            if (alsoCreateEntity) {
                const entityRes = await createOsGroup({ name: title, kind: entityKind, description: `Creado desde el chat «${title}».` });
                if (entityRes.ok && entityRes.slug) {
                    await setMembership(entityRes.slug, true, "owner");
                    await setThreadEntityLink(res.thread.id, { kind: "group", slug: entityRes.slug });
                    const invite = buildInviteAttachment({ targetKind: "group", refId: entityRes.slug, name: title });
                    await sendMessage(res.thread.id, {
                        body: `Este chat también tiene una comunidad en la red: **${title}**.`,
                        attachments: [invite],
                        kind: "system",
                    });
                    toast.success("Grupo de chat y comunidad de la red creados.");
                } else {
                    toast.error(entityRes.error || "El chat se creó, pero no se pudo crear la comunidad de la red.");
                }
            }

            onOpenChange(false);
            onCreated(res.thread.id);
        } finally {
            setCreating(false);
        }
    };

    const esGrupo = tab === "group";

    const filaPersona = (p: { userId: string; nombre: string; avatarUrl?: string | null; sub?: string | null; contacto?: Contacto }) => {
        const elegido = esGrupo && estaElegido(p.userId);
        return (
            <li key={p.userId}>
                <button
                    type="button"
                    disabled={creating && !esGrupo}
                    aria-pressed={esGrupo ? elegido : undefined}
                    onClick={() => (esGrupo ? alternar({ userId: p.userId, nombre: p.nombre, avatarUrl: p.avatarUrl }) : void handleStartDm(p.userId))}
                    className={cn(
                        "flex w-full cursor-pointer items-center gap-3 rounded-2xl p-2.5 text-left transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF] disabled:cursor-wait disabled:opacity-50",
                        elegido ? "" : "hover:bg-white/[0.05]",
                    )}
                    style={elegido ? pildoraFantasma(ACENTO.mensajes) : undefined}
                >
                    <AvatarContacto nombre={p.nombre} avatarUrl={p.avatarUrl ?? null} tam={40} relacion={p.contacto?.relacion} />
                    <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                            <span className="truncate text-[14px] font-semibold text-white">{p.nombre}</span>
                            {p.contacto?.favorito && <Star className="h-3 w-3 shrink-0 fill-[#FFBF00] text-[#FFBF00]" aria-label="Favorito" />}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                            {p.contacto && <ChipRelacion relacion={p.contacto.relacion} />}
                            {p.sub && <span className="truncate text-[12px] text-white/50">{p.sub}</span>}
                        </span>
                    </span>
                    {esGrupo && (
                        <span
                            aria-hidden
                            className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors", elegido ? "border-[#7C5CFF] bg-[#7C5CFF]" : "border-white/25")}
                        >
                            {elegido && <Check className="h-3.5 w-3.5 text-white" />}
                        </span>
                    )}
                </button>
            </li>
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="gap-0 border-white/10 bg-[rgba(10,12,28,0.97)] p-0 backdrop-blur-2xl max-md:left-0 max-md:top-0 max-md:h-[100dvh] max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none md:h-[min(720px,86vh)] md:max-w-lg md:rounded-[24px]">
                <div className="flex h-full min-h-0 flex-col">
                    <DialogHeader className="shrink-0 space-y-3 border-b border-white/[0.08] px-5 pb-4 pt-5 pr-14 text-left">
                        <div>
                            <DialogTitle className="text-[17px] font-semibold text-white">Nuevo chat</DialogTitle>
                            <DialogDescription className="mt-1 text-[13px] text-white/55">
                                Escribe a alguien de tu libreta o busca en toda la red StarSeed.
                            </DialogDescription>
                        </div>
                        <div role="radiogroup" aria-label="Tipo de chat" className="ss-redondo inline-flex w-fit gap-0.5 rounded-full border border-white/[0.08] bg-white/[0.04] p-1">
                            {([
                                ["dm", "Directo", User],
                                ["group", "Grupo", Users2],
                            ] as const).map(([id, etiqueta, Icono]) => (
                                <button
                                    key={id}
                                    type="button"
                                    role="radio"
                                    aria-checked={tab === id}
                                    onClick={() => setTab(id)}
                                    className={cn(
                                        "ss-redondo inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-150",
                                        tab === id ? "text-white" : "text-white/60 hover:text-white",
                                    )}
                                    style={tab === id ? pildoraFantasma(ACENTO.mensajes) : undefined}
                                >
                                    <Icono className="h-3.5 w-3.5" /> {etiqueta}
                                </button>
                            ))}
                        </div>

                        {esGrupo && (
                            <input
                                value={groupTitle}
                                onChange={(e) => setGroupTitle(e.target.value)}
                                placeholder="Nombre del grupo (opcional)"
                                aria-label="Nombre del grupo"
                                className="h-10 w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 text-[14px] text-white placeholder:text-white/40 focus:border-[#7C5CFF]/60 focus:outline-none"
                            />
                        )}

                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Buscar por nombre o @usuario…"
                                aria-label="Buscar personas"
                                className="h-10 w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] pl-9 pr-9 text-[14px] text-white placeholder:text-white/40 focus:border-[#7C5CFF]/60 focus:outline-none"
                                autoFocus
                            />
                            {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/50" />}
                        </div>

                        {esGrupo && selected.length > 0 && (
                            <ul className="flex flex-wrap gap-1.5" aria-label="Personas elegidas">
                                {selected.map((s) => (
                                    <li key={s.userId} className="ss-redondo inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-[12px] font-medium text-white" style={pildoraFantasma(ACENTO.mensajes)}>
                                        {s.nombre}
                                        <button
                                            type="button"
                                            aria-label={`Quitar a ${s.nombre}`}
                                            onClick={() => alternar(s)}
                                            className="ss-redondo grid h-5 w-5 cursor-pointer place-items-center rounded-full hover:bg-white/15"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </DialogHeader>

                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4">
                        {esGrupo && (
                            <div className="mx-2 space-y-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <label htmlFor="also-create-entity" className="cursor-pointer text-[13px] font-semibold text-white/90">
                                        Crear también comunidad/grupo de la red
                                    </label>
                                    <Switch
                                        id="also-create-entity"
                                        checked={alsoCreateEntity}
                                        onCheckedChange={setAlsoCreateEntity}
                                        className="ss-redondo data-[state=checked]:bg-[#7C5CFF] data-[state=unchecked]:bg-white/15"
                                    />
                                </div>
                                <p className="text-[12px] leading-relaxed text-white/55">
                                    Además del chat, crea una entidad real en la red (visible en /grupo/…). Tú te unes al instante; el resto
                                    recibe una invitación en el propio chat para unirse.
                                </p>
                                {alsoCreateEntity && (
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                        {([
                                            ["asamblea", "Asamblea", Landmark],
                                            ["circulo", "Círculo", CircleDot],
                                            ["colectivo", "Colectivo", Boxes],
                                        ] as const).map(([kind, label, Icon]) => (
                                            <button
                                                key={kind}
                                                type="button"
                                                onClick={() => setEntityKind(kind)}
                                                aria-pressed={entityKind === kind}
                                                className={cn(
                                                    "ss-redondo inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
                                                    entityKind === kind ? "text-white" : "text-white/60 hover:text-white",
                                                )}
                                                style={pildoraFantasma(ACENTO.esmeralda, entityKind === kind)}
                                            >
                                                <Icon className="h-3 w-3" /> {label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <section aria-label="Tus contactos">
                            <p className={cn(CLASE_ROTULO, "px-3 pb-1.5")}>Tus contactos</p>
                            {libreta.sinSesion ? (
                                <p className="px-3 text-[12px] text-white/50">Inicia sesión para ver tu libreta.</p>
                            ) : contactos.length === 0 ? (
                                <p className="px-3 text-[12px] text-white/50">
                                    {query.trim()
                                        ? "Ningún contacto coincide."
                                        : libreta.listo
                                            ? "Aún no tienes contactos con cuenta StarSeed. Búscalos abajo."
                                            : "Cargando tu libreta…"}
                                </p>
                            ) : (
                                <ul className="space-y-0.5">
                                    {contactos.slice(0, 60).map((c) =>
                                        filaPersona({
                                            userId: c.userId as string,
                                            nombre: c.apodo || c.nombre,
                                            avatarUrl: c.perfil?.avatarUrl ?? null,
                                            sub: c.username ? `@${c.username}` : null,
                                            contacto: c,
                                        }),
                                    )}
                                </ul>
                            )}
                        </section>

                        <section aria-label="Buscar en StarSeed">
                            <p className={cn(CLASE_ROTULO, "px-3 pb-1.5")}>Buscar en StarSeed</p>
                            {!query.trim() ? (
                                <p className="px-3 text-[12px] text-white/50">Escribe un nombre o un @usuario para buscar en toda la red.</p>
                            ) : deLaRed.length === 0 && !searching ? (
                                <p className="px-3 text-[12px] text-white/50">Nadie más en la red coincide con «{query.trim()}».</p>
                            ) : (
                                <ul className="space-y-0.5">
                                    {deLaRed.map((p) =>
                                        filaPersona({ userId: p.userId, nombre: p.displayName, avatarUrl: p.avatarUrl ?? null, sub: `@${p.username}` }),
                                    )}
                                </ul>
                            )}
                        </section>
                    </div>

                    {esGrupo && (
                        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-white/[0.08] px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => onOpenChange(false)}
                                className="h-10 cursor-pointer rounded-xl bg-white/[0.06] px-4 text-[13px] font-medium text-white/85 transition-colors hover:bg-white/[0.12]"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleCreateGroup()}
                                disabled={creating || !selected.length}
                                className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#7C5CFF] px-5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                                Crear grupo ({selected.length})
                            </button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default NewChatDialog;
