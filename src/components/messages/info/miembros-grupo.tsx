"use client";

/**
 * Grupo: miembros (con su papel y su presencia), añadir personas (buscando en la red y en tus
 * contactos), quitar o nombrar admin (solo quien crea o administra), escribir en privado,
 * editar nombre, foto y descripción del grupo, y salir del grupo.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
    Check, Crown, ImagePlus, Link2, Loader2, LogOut, MessageCircle, MoreVertical, Search, Shield, ShieldOff,
    UserMinus, UserPlus, UserRound, X,
} from "lucide-react";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { searchUsers, type OsProfile } from "@/lib/social/os-profiles";
import { uploadFile } from "@/lib/files/os-files";
import { useContactos } from "@/lib/contactos/store";
import {
    addMembers, leaveThread, removeMember, renameThread, setMemberRole, setThreadAvatar, setThreadDescription,
    type DmMember, type DmThreadSummary,
} from "@/lib/messages/dm";
import type { EstadoPresencia } from "@/lib/mensajeria/presencia";
import { formatearPresencia } from "@/lib/mensajeria/presencia";
import { AvatarHilo } from "@/components/messages/dm/avatar-hilo";
import { useContextoHilo } from "@/components/messages/dm/contexto-hilo";
import { RotuloSeccion, Tarjeta } from "@/components/messages/info/piezas";

type Papel = "owner" | "admin" | "member";

function papelDe(role: string | undefined): Papel {
    return role === "owner" ? "owner" : role === "admin" ? "admin" : "member";
}

export function descripcionDeHilo(thread: Pick<DmThreadSummary, "meta">): string {
    const m = thread.meta as { description?: unknown; descripcion?: unknown } | null;
    const d = m?.description ?? m?.descripcion;
    return typeof d === "string" ? d : "";
}

/** ¿Puedo administrar este grupo? */
export function puedoAdministrar(thread: Pick<DmThreadSummary, "createdBy">, miembros: DmMember[], miUid: string | null): boolean {
    if (!miUid) return false;
    if (thread.createdBy === miUid) return true;
    const yo = miembros.find((m) => m.userId === miUid);
    const p = papelDe(yo?.role);
    return p === "owner" || p === "admin";
}

/** Editar nombre, foto y descripción del grupo (quien administra). */
export function EditorGrupo({ thread, onThreadUpdated, onCerrar }: { thread: DmThreadSummary; onThreadUpdated: (t: DmThreadSummary) => void; onCerrar: () => void }) {
    const [titulo, setTitulo] = useState(thread.title ?? "");
    const [descripcion, setDescripcion] = useState(descripcionDeHilo(thread));
    const [foto, setFoto] = useState(thread.avatarUrl ?? "");
    const [guardando, setGuardando] = useState(false);
    const [subiendo, setSubiendo] = useState(false);
    const archivoRef = useRef<HTMLInputElement>(null);

    const subir = async (file: File | undefined) => {
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            toast.error("Elige un archivo de imagen.");
            return;
        }
        setSubiendo(true);
        try {
            const r = await uploadFile(file, { folder: "mensajes/grupos", meta: { context: "foto-grupo", threadId: thread.id } });
            if (r.ok && r.file?.url) setFoto(r.file.url);
            else toast.error(r.error || "No se pudo subir la foto.");
        } finally {
            setSubiendo(false);
        }
    };

    const guardar = async () => {
        setGuardando(true);
        try {
            let actualizado: DmThreadSummary = thread;
            const errores: string[] = [];
            if (titulo.trim() !== (thread.title ?? "")) {
                if (await renameThread(thread.id, titulo.trim())) actualizado = { ...actualizado, title: titulo.trim() || null };
                else errores.push("el nombre");
            }
            const fotoLimpia = foto.trim();
            if (fotoLimpia !== (thread.avatarUrl ?? "")) {
                if (fotoLimpia && !fotoLimpia.startsWith("https://") && !fotoLimpia.startsWith("/")) errores.push("la foto (usa una dirección https://)");
                else if (await setThreadAvatar(thread.id, fotoLimpia)) actualizado = { ...actualizado, avatarUrl: fotoLimpia || null };
                else errores.push("la foto");
            }
            if (descripcion.trim() !== descripcionDeHilo(thread)) {
                if (await setThreadDescription(thread.id, descripcion.trim())) {
                    actualizado = { ...actualizado, meta: { ...(actualizado.meta ?? {}), description: descripcion.trim() } };
                } else errores.push("la descripción");
            }
            if (actualizado !== thread) onThreadUpdated(actualizado);
            if (errores.length) toast.error(`No se pudo guardar ${errores.join(", ")}. Puede que no tengas permiso.`);
            else {
                toast.success("Grupo actualizado");
                onCerrar();
            }
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Tarjeta>
            <RotuloSeccion className="mb-2">Editar grupo</RotuloSeccion>
            <div className="space-y-3">
                <div className="flex items-center gap-3">
                    <AvatarHilo nombre={titulo || "Grupo"} url={foto || null} esGrupo tam={56} />
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => archivoRef.current?.click()}
                            disabled={subiendo}
                            className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] font-medium text-white/85 hover:text-white disabled:cursor-wait"
                            style={{ background: "rgba(255,255,255,.06)" }}
                        >
                            {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} Subir foto
                        </button>
                        {foto && (
                            <button type="button" onClick={() => setFoto("")} className="cursor-pointer rounded-xl px-3 py-2 text-[12.5px] text-white/65 hover:text-white" style={{ background: "rgba(255,255,255,.04)" }}>
                                Quitar foto
                            </button>
                        )}
                        <input ref={archivoRef} type="file" accept="image/*" hidden onChange={(e) => void subir(e.target.files?.[0])} />
                    </div>
                </div>
                <label className="block">
                    <span className="mb-1 flex items-center gap-1.5 px-1 text-[12px] text-white/60"><Link2 className="h-3.5 w-3.5" /> …o pega la dirección de una imagen</span>
                    <input value={foto} onChange={(e) => setFoto(e.target.value)} placeholder="https://" className="w-full rounded-xl bg-white/[0.05] px-3 py-2 text-[13px] text-white outline-none ring-1 ring-inset ring-white/10 placeholder:text-white/35 focus:ring-[#7C5CFF]/60" />
                </label>
                <label className="block">
                    <span className="mb-1 block px-1 text-[12px] text-white/60">Nombre del grupo</span>
                    <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={80} className="w-full rounded-xl bg-white/[0.05] px-3 py-2 text-[14px] text-white outline-none ring-1 ring-inset ring-white/10 focus:ring-[#7C5CFF]/60" />
                </label>
                <label className="block">
                    <span className="mb-1 block px-1 text-[12px] text-white/60">Descripción</span>
                    <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} maxLength={600} placeholder="De qué va este grupo" className="w-full resize-none rounded-xl bg-white/[0.05] px-3 py-2 text-[13.5px] text-white outline-none ring-1 ring-inset ring-white/10 placeholder:text-white/35 focus:ring-[#7C5CFF]/60" />
                </label>
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onCerrar} className="cursor-pointer rounded-xl px-3 py-2 text-[13px] text-white/70 hover:bg-white/[0.06] hover:text-white">Cancelar</button>
                    <button type="button" onClick={() => void guardar()} disabled={guardando} className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white disabled:cursor-wait" style={{ background: "linear-gradient(135deg,#7C5CFF,#5B3FD9)" }}>
                        {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar
                    </button>
                </div>
            </div>
        </Tarjeta>
    );
}

/** Buscador para añadir personas: la red y tus contactos con cuenta StarSeed. */
function AnadirMiembros({ thread, yaEstan, onHecho }: { thread: DmThreadSummary; yaEstan: string[]; onHecho: (ids: string[]) => void }) {
    const contactos = useContactos();
    const [q, setQ] = useState("");
    const [resultados, setResultados] = useState<OsProfile[]>([]);
    const [buscando, setBuscando] = useState(false);
    const [elegidos, setElegidos] = useState<{ id: string; nombre: string }[]>([]);
    const [anadiendo, setAnadiendo] = useState(false);

    useEffect(() => {
        const t = q.trim();
        if (!t) {
            setResultados([]);
            return;
        }
        setBuscando(true);
        const h = setTimeout(async () => {
            const r = await searchUsers(t, 10);
            setResultados(r);
            setBuscando(false);
        }, 250);
        return () => clearTimeout(h);
    }, [q]);

    const deContactos = useMemo(() => {
        const t = q.trim().toLowerCase();
        return contactos.contactos
            .filter((c) => c.userId && !yaEstan.includes(c.userId))
            .filter((c) => !t || c.nombre.toLowerCase().includes(t) || (c.username ?? "").toLowerCase().includes(t))
            .slice(0, 8);
    }, [contactos.contactos, q, yaEstan]);

    const alternar = (id: string, nombre: string) =>
        setElegidos((prev) => (prev.some((e) => e.id === id) ? prev.filter((e) => e.id !== id) : [...prev, { id, nombre }]));

    const anadir = async () => {
        if (!elegidos.length) return;
        setAnadiendo(true);
        try {
            const ok = await addMembers(thread.id, elegidos.map((e) => e.id));
            if (ok) {
                toast.success(elegidos.length === 1 ? `${elegidos[0].nombre} se ha unido al grupo` : `${elegidos.length} personas se han unido al grupo`);
                onHecho(elegidos.map((e) => e.id));
                setElegidos([]);
                setQ("");
            } else toast.error("No se pudo añadir. Puede que no tengas permiso en este grupo.");
        } finally {
            setAnadiendo(false);
        }
    };

    const fila = (id: string, nombre: string, sub: string | null, url?: string | null) => {
        const elegido = elegidos.some((e) => e.id === id);
        return (
            <button
                key={id}
                type="button"
                onClick={() => alternar(id, nombre)}
                aria-pressed={elegido}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/[0.05]"
            >
                <AvatarHilo nombre={nombre} url={url} tam={32} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-white/90">{nombre}</span>
                    {sub && <span className="block truncate text-[12px] text-white/50">{sub}</span>}
                </span>
                <span className={cn("ss-redondo grid h-6 w-6 place-items-center rounded-full", elegido ? "bg-[#7C5CFF] text-white" : "ring-1 ring-inset ring-white/25")}>
                    {elegido && <Check className="h-3.5 w-3.5" />}
                </span>
            </button>
        );
    };

    const red = resultados.filter((p) => !yaEstan.includes(p.userId) && !deContactos.some((c) => c.userId === p.userId));

    return (
        <div className="space-y-2 rounded-2xl p-2.5" style={{ background: "rgba(255,255,255,.03)" }}>
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca por nombre o @usuario" aria-label="Buscar personas para añadir" className="w-full rounded-xl bg-white/[0.05] py-2 pl-9 pr-3 text-[13.5px] text-white outline-none ring-1 ring-inset ring-white/10 placeholder:text-white/35 focus:ring-[#7C5CFF]/60" />
            </div>
            {elegidos.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {elegidos.map((e) => (
                        <span key={e.id} className="inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-[12px] text-white" style={{ background: "#7C5CFF2e", boxShadow: "inset 0 0 0 1px #7C5CFF99" }}>
                            {e.nombre}
                            <button type="button" onClick={() => alternar(e.id, e.nombre)} aria-label={`Quitar a ${e.nombre}`} className="ss-redondo grid h-5 w-5 cursor-pointer place-items-center rounded-full hover:bg-white/10">
                                <X className="h-3 w-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
            {deContactos.length > 0 && (
                <div>
                    <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">Tus contactos</p>
                    {deContactos.map((c) => fila(c.userId!, c.nombre, c.username ? `@${c.username}` : null, c.perfil?.avatarUrl))}
                </div>
            )}
            {q.trim() && (
                <div>
                    <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">En la red</p>
                    {buscando && <p className="flex items-center gap-2 px-2 py-1.5 text-[12.5px] text-white/55"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…</p>}
                    {!buscando && red.length === 0 && <p className="px-2 py-1.5 text-[12.5px] text-white/50">Nadie más con ese nombre.</p>}
                    {red.map((p) => fila(p.userId, p.displayName || p.username, `@${p.username}`, p.avatarUrl))}
                </div>
            )}
            <button
                type="button"
                onClick={() => void anadir()}
                disabled={!elegidos.length || anadiendo}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
                style={{ background: "linear-gradient(135deg,#7C5CFF,#5B3FD9)" }}
            >
                {anadiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                {elegidos.length ? `Añadir ${elegidos.length === 1 ? "a 1 persona" : `a ${elegidos.length} personas`}` : "Elige a quién añadir"}
            </button>
        </div>
    );
}

export interface MiembrosGrupoProps {
    thread: DmThreadSummary;
    miembros: DmMember[];
    idsMiembros: string[];
    presencia: Record<string, EstadoPresencia>;
    onThreadUpdated: (t: DmThreadSummary) => void;
    onMiembrosCambiados: () => void;
    onSalir?: () => void;
    /** Muestra solo los primeros N, con «Ver todos». */
    limite?: number;
    onVerTodos?: () => void;
}

export function MiembrosGrupo({
    thread, miembros, idsMiembros, presencia, onThreadUpdated, onMiembrosCambiados, onSalir, limite, onVerTodos,
}: MiembrosGrupoProps) {
    const ctx = useContextoHilo();
    const confirmar = useConfirm();
    const [anadiendo, setAnadiendo] = useState(false);
    const miUid = ctx?.miUid ?? null;
    const admin = puedoAdministrar(thread, miembros, miUid);
    const nombreDe = (id: string) => ctx?.nombreDe(id) ?? "Miembro";

    const lista = useMemo(() => {
        const rol = (id: string): Papel => (id === thread.createdBy ? "owner" : papelDe(miembros.find((m) => m.userId === id)?.role));
        const peso = { owner: 0, admin: 1, member: 2 } as const;
        return idsMiembros
            .map((id) => ({ id, papel: rol(id), nombre: id === miUid ? "Tú" : nombreDe(id) }))
            .sort((a, b) => (a.id === miUid ? -1 : b.id === miUid ? 1 : peso[a.papel] - peso[b.papel] || a.nombre.localeCompare(b.nombre, "es")));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idsMiembros, miembros, thread.createdBy, miUid, ctx?.perfiles]);

    const mostrados = limite ? lista.slice(0, limite) : lista;

    const cambiarPapel = async (id: string, papel: "admin" | "member") => {
        const ok = await setMemberRole(thread.id, id, papel);
        if (ok) {
            toast.success(papel === "admin" ? `${nombreDe(id)} ahora administra el grupo` : `${nombreDe(id)} ya no administra el grupo`);
            onMiembrosCambiados();
        } else toast.error("No se pudo cambiar su papel. Puede que no tengas permiso.");
    };

    const quitar = async (id: string) => {
        const ok = await confirmar({ title: `¿Quitar a ${nombreDe(id)} del grupo?`, description: "Dejará de ver los mensajes nuevos. Puede volver si alguien la añade.", confirmText: "Quitar del grupo", destructive: true });
        if (!ok) return;
        if (await removeMember(thread.id, id)) {
            toast.success(`${nombreDe(id)} ya no está en el grupo`);
            onMiembrosCambiados();
            onThreadUpdated({ ...thread, memberIds: thread.memberIds.filter((m) => m !== id) });
        } else toast.error("No se pudo quitar. Puede que no tengas permiso.");
    };

    const salir = async () => {
        const ok = await confirmar({ title: "¿Salir del grupo?", description: "Dejarás de recibir sus mensajes. Para volver, alguien del grupo tendrá que añadirte.", confirmText: "Salir del grupo", destructive: true });
        if (!ok) return;
        if (await leaveThread(thread.id)) {
            toast.success("Has salido del grupo");
            onSalir?.();
        } else toast.error("No se pudo salir del grupo. Inténtalo de nuevo.");
    };

    return (
        <Tarjeta>
            <div className="mb-1 flex items-center justify-between gap-2">
                <RotuloSeccion>{lista.length} {lista.length === 1 ? "miembro" : "miembros"}</RotuloSeccion>
                {admin && !anadiendo && (
                    <button type="button" onClick={() => setAnadiendo(true)} className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12.5px] font-medium text-[#b7a6ff] hover:bg-white/[0.05]">
                        <UserPlus className="h-4 w-4" /> Añadir personas
                    </button>
                )}
            </div>

            {anadiendo && (
                <div className="mb-2">
                    <AnadirMiembros
                        thread={thread}
                        yaEstan={idsMiembros}
                        onHecho={(ids) => {
                            setAnadiendo(false);
                            onMiembrosCambiados();
                            onThreadUpdated({ ...thread, memberIds: Array.from(new Set([...thread.memberIds, ...ids])) });
                        }}
                    />
                    <button type="button" onClick={() => setAnadiendo(false)} className="mt-1 w-full cursor-pointer rounded-xl py-1.5 text-[12.5px] text-white/60 hover:text-white">Cerrar el buscador</button>
                </div>
            )}

            <ul className="space-y-0.5">
                {mostrados.map(({ id, papel, nombre }) => {
                    const p = presencia[id];
                    const perfil = ctx?.perfiles[id];
                    const estado = id === miUid ? null : formatearPresencia(p);
                    return (
                        <li key={id} className="flex items-center gap-3 rounded-2xl px-1.5 py-1.5 transition-colors hover:bg-white/[0.04]">
                            <AvatarHilo nombre={nombre === "Tú" ? perfil?.displayName || "Tú" : nombre} url={perfil?.avatarUrl} enLinea={!!p?.enLinea} tam={38} />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                    <span className="truncate text-[14px] font-medium text-white/90">{nombre}</span>
                                    {papel === "owner" && (
                                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold text-[#FFD66B]" style={{ background: "#FFBF001f", boxShadow: "inset 0 0 0 1px #FFBF0055" }}>
                                            <Crown className="h-3 w-3" /> Creador
                                        </span>
                                    )}
                                    {papel === "admin" && (
                                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold text-[#c9bcff]" style={{ background: "#7C5CFF1f", boxShadow: "inset 0 0 0 1px #7C5CFF55" }}>
                                            <Shield className="h-3 w-3" /> Admin
                                        </span>
                                    )}
                                </div>
                                <p className="truncate text-[12px] text-white/50">
                                    {[perfil?.username ? `@${perfil.username}` : null, estado].filter(Boolean).join(" · ") || " "}
                                </p>
                            </div>
                            {id !== miUid && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button type="button" aria-label={`Opciones para ${nombre}`} className="ss-redondo grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white">
                                            <MoreVertical className="h-4 w-4" />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" collisionPadding={12} className="min-w-[220px]">
                                        {perfil?.username && (
                                            <>
                                                <DropdownMenuItem asChild className="cursor-pointer gap-2">
                                                    <Link href={`/messages?to=${encodeURIComponent(perfil.username)}`}>
                                                        <MessageCircle className="h-4 w-4" /> Escribirle en privado
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem asChild className="cursor-pointer gap-2">
                                                    <Link href={`/profile/${encodeURIComponent(perfil.username)}`}>
                                                        <UserRound className="h-4 w-4" /> Ver perfil
                                                    </Link>
                                                </DropdownMenuItem>
                                            </>
                                        )}
                                        {admin && papel !== "owner" && (
                                            <>
                                                <DropdownMenuSeparator />
                                                {papel === "admin" ? (
                                                    <DropdownMenuItem className="cursor-pointer gap-2" onSelect={() => void cambiarPapel(id, "member")}>
                                                        <ShieldOff className="h-4 w-4" /> Quitar como admin
                                                    </DropdownMenuItem>
                                                ) : (
                                                    <DropdownMenuItem className="cursor-pointer gap-2" onSelect={() => void cambiarPapel(id, "admin")}>
                                                        <Shield className="h-4 w-4" /> Hacer admin
                                                    </DropdownMenuItem>
                                                )}
                                                <DropdownMenuItem className="cursor-pointer gap-2 text-red-300 focus:text-red-300" onSelect={() => void quitar(id)}>
                                                    <UserMinus className="h-4 w-4" /> Quitar del grupo
                                                </DropdownMenuItem>
                                            </>
                                        )}
                                        {!perfil?.username && !(admin && papel !== "owner") && (
                                            <p className="px-2 py-1.5 text-[12.5px] text-white/55">Sin acciones disponibles.</p>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </li>
                    );
                })}
            </ul>

            {limite && lista.length > limite && onVerTodos && (
                <button type="button" onClick={onVerTodos} className="mt-1 w-full cursor-pointer rounded-xl py-2 text-[13px] font-medium text-[#b7a6ff] hover:bg-white/[0.04]">
                    Ver los {lista.length} miembros
                </button>
            )}

            {!limite && (
                <button
                    type="button"
                    onClick={() => void salir()}
                    className="mt-3 flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-[14px] font-medium text-[#fda4af] transition-colors hover:bg-[#DC143C]/10"
                >
                    <LogOut className="h-4 w-4" /> Salir del grupo
                </button>
            )}
        </Tarjeta>
    );
}

export default MiembrosGrupo;
