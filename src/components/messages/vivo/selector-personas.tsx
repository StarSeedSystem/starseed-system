"use client";

/**
 * SelectorPersonas — buscador para invitar a una app en vivo o a una llamada: primero tus
 * contactos (libreta de Contactos), luego perfiles de la red y grupos. Los grupos se convierten
 * en sus miembros al confirmar (`resolverSeleccion`).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Search, Users2, X } from "lucide-react";
import { useContactos } from "@/lib/contactos/store";
import { RELACIONES } from "@/lib/contactos/tipos";
import { searchGroups, searchUsers, type OsProfile, type SocialGroupHit } from "@/lib/social/os-profiles";
import { AvatarContacto } from "@/components/contactos/avatar-contacto";
import { miembrosDeGrupo } from "@/components/messages/vivo/acciones-vivo";
import { RotuloVivo } from "@/components/messages/vivo/comun-vivo";

export interface PersonaElegida {
    nombre: string;
    avatarUrl?: string | null;
    detalle?: string;
}

export interface GrupoElegido {
    nombre: string;
    miembros: number;
    tipo: SocialGroupHit["kind"];
}

export interface SeleccionInvitados {
    personas: Record<string, PersonaElegida>;
    grupos: Record<string, GrupoElegido>;
}

export const SELECCION_VACIA: SeleccionInvitados = { personas: {}, grupos: {} };

export function cuantosElegidos(s: SeleccionInvitados): number {
    return Object.keys(s.personas).length + Object.keys(s.grupos).length;
}

/** Personas elegidas + miembros de los grupos elegidos (sin repetir, sin `excluir`). */
export async function resolverSeleccion(s: SeleccionInvitados, excluir: string[] = []): Promise<string[]> {
    const ids = new Set(Object.keys(s.personas));
    const porGrupo = await Promise.all(Object.keys(s.grupos).map((slug) => miembrosDeGrupo(slug)));
    for (const lista of porGrupo) for (const u of lista) ids.add(u);
    for (const u of excluir) ids.delete(u);
    return [...ids];
}

function normalizar(t: string): string {
    return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const ETIQUETA_GRUPO: Record<SocialGroupHit["kind"], string> = {
    grupo: "Grupo",
    comunidad: "Comunidad",
    pagina: "Página",
};

export function SelectorPersonas({
    seleccion,
    onCambiar,
    excluir = [],
    color = "#7C5CFF",
    autoFocus = false,
}: {
    seleccion: SeleccionInvitados;
    onCambiar: (s: SeleccionInvitados) => void;
    /** Cuentas que no se ofrecen (ya invitadas, o tú). */
    excluir?: string[];
    color?: string;
    autoFocus?: boolean;
}) {
    const { contactos } = useContactos();
    const [q, setQ] = useState("");
    const [buscando, setBuscando] = useState(false);
    const [perfiles, setPerfiles] = useState<OsProfile[]>([]);
    const [grupos, setGrupos] = useState<SocialGroupHit[]>([]);
    const turno = useRef(0);
    const excluidos = useMemo(() => new Set(excluir), [excluir]);

    // Búsqueda en la red, con pausa para no consultar a cada tecla.
    useEffect(() => {
        const termino = q.trim();
        if (termino.length < 2) {
            setPerfiles([]);
            setGrupos([]);
            setBuscando(false);
            return;
        }
        const mio = ++turno.current;
        setBuscando(true);
        const t = setTimeout(() => {
            void Promise.all([searchUsers(termino, 8), searchGroups(termino, 6)])
                .then(([ps, gs]) => {
                    if (mio !== turno.current) return;
                    setPerfiles(ps);
                    // Solo los grupos tienen miembros (os_memberships); páginas y comunidades tienen seguidores.
                    setGrupos(gs.filter((g) => g.kind === "grupo"));
                })
                .catch(() => {
                    if (mio === turno.current) {
                        setPerfiles([]);
                        setGrupos([]);
                    }
                })
                .finally(() => {
                    if (mio === turno.current) setBuscando(false);
                });
        }, 260);
        return () => clearTimeout(t);
    }, [q]);

    const deLaLibreta = useMemo(() => {
        const termino = normalizar(q.trim());
        const conCuenta = contactos.filter((c) => c.userId && !excluidos.has(c.userId));
        const filtrados = termino
            ? conCuenta.filter((c) =>
                normalizar(`${c.nombre} ${c.apodo ?? ""} ${c.username ?? ""}`).includes(termino))
            : [...conCuenta].sort((a, b) => Number(b.favorito) - Number(a.favorito));
        return filtrados.slice(0, termino ? 8 : 6);
    }, [contactos, q, excluidos]);

    const idsLibreta = useMemo(() => new Set(deLaLibreta.map((c) => c.userId as string)), [deLaLibreta]);
    const perfilesRed = perfiles.filter((p) => !excluidos.has(p.userId) && !idsLibreta.has(p.userId));

    const alternarPersona = (userId: string, p: PersonaElegida) => {
        const personas = { ...seleccion.personas };
        if (personas[userId]) delete personas[userId];
        else personas[userId] = p;
        onCambiar({ ...seleccion, personas });
    };
    const alternarGrupo = (g: SocialGroupHit) => {
        const gruposSel = { ...seleccion.grupos };
        if (gruposSel[g.slug]) delete gruposSel[g.slug];
        else gruposSel[g.slug] = { nombre: g.name, miembros: g.memberCount, tipo: g.kind };
        onCambiar({ ...seleccion, grupos: gruposSel });
    };

    const elegidas = Object.entries(seleccion.personas);
    const gruposElegidos = Object.entries(seleccion.grupos);
    const hayResultados = deLaLibreta.length > 0 || perfilesRed.length > 0 || grupos.length > 0;

    return (
        <div className="space-y-3">
            {(elegidas.length > 0 || gruposElegidos.length > 0) && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Personas y grupos elegidos">
                    {elegidas.map(([id, p]) => (
                        <li key={id}>
                            <button
                                type="button"
                                onClick={() => alternarPersona(id, p)}
                                className="ss-redondo inline-flex cursor-pointer items-center gap-1.5 rounded-full py-1 pl-1 pr-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-white/10"
                                style={{ background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}66` }}
                                aria-label={`Quitar a ${p.nombre}`}
                            >
                                <AvatarContacto nombre={p.nombre} avatarUrl={p.avatarUrl} tam={20} />
                                {p.nombre}
                                <X className="h-3 w-3 text-white/70" aria-hidden="true" />
                            </button>
                        </li>
                    ))}
                    {gruposElegidos.map(([slug, g]) => (
                        <li key={slug}>
                            <button
                                type="button"
                                onClick={() => {
                                    const gruposSel = { ...seleccion.grupos };
                                    delete gruposSel[slug];
                                    onCambiar({ ...seleccion, grupos: gruposSel });
                                }}
                                className="ss-redondo inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold text-white transition-colors duration-200 hover:bg-white/10"
                                style={{ background: "#14B8A61f", boxShadow: "inset 0 0 0 1px #14B8A666" }}
                                aria-label={`Quitar el grupo ${g.nombre}`}
                            >
                                <Users2 className="h-3.5 w-3.5 text-teal-300" aria-hidden="true" />
                                {g.nombre}
                                <X className="h-3 w-3 text-white/70" aria-hidden="true" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <label className="relative block">
                <span className="sr-only">Buscar personas o grupos</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" aria-hidden="true" />
                <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Busca por nombre, @usuario o grupo"
                    autoFocus={autoFocus}
                    className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.05] pl-9 pr-9 text-[15px] text-white outline-none transition-colors duration-200 placeholder:text-white/40 focus:border-white/25"
                />
                {buscando && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/50" aria-label="Buscando" />
                )}
            </label>

            <div className="max-h-64 space-y-3 overflow-y-auto pr-1" aria-live="polite">
                {deLaLibreta.length > 0 && (
                    <section className="space-y-1">
                        <RotuloVivo>Tus contactos</RotuloVivo>
                        <ul className="space-y-1">
                            {deLaLibreta.map((c) => {
                                const uid = c.userId as string;
                                const activo = Boolean(seleccion.personas[uid]);
                                const relacion = RELACIONES.find((r) => r.id === c.relacion)?.etiqueta;
                                const avatar = c.perfil?.avatarUrl ?? null;
                                return (
                                    <li key={c.id}>
                                        <FilaPersona
                                            nombre={c.nombre}
                                            detalle={[relacion, c.username ? `@${c.username}` : null].filter(Boolean).join(" · ")}
                                            avatarUrl={avatar}
                                            relacion={c.relacion}
                                            activo={activo}
                                            color={color}
                                            onClick={() => alternarPersona(uid, { nombre: c.nombre, avatarUrl: avatar })}
                                        />
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                )}

                {perfilesRed.length > 0 && (
                    <section className="space-y-1">
                        <RotuloVivo>Personas de la red</RotuloVivo>
                        <ul className="space-y-1">
                            {perfilesRed.map((p) => (
                                <li key={p.userId}>
                                    <FilaPersona
                                        nombre={p.displayName}
                                        detalle={`@${p.username}`}
                                        avatarUrl={p.avatarUrl ?? null}
                                        activo={Boolean(seleccion.personas[p.userId])}
                                        color={color}
                                        onClick={() =>
                                            alternarPersona(p.userId, { nombre: p.displayName, avatarUrl: p.avatarUrl ?? null })}
                                    />
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {grupos.length > 0 && (
                    <section className="space-y-1">
                        <RotuloVivo>Grupos</RotuloVivo>
                        <ul className="space-y-1">
                            {grupos.map((g) => {
                                const activo = Boolean(seleccion.grupos[g.slug]);
                                return (
                                    <li key={`${g.kind}:${g.id}`}>
                                        <button
                                            type="button"
                                            onClick={() => alternarGrupo(g)}
                                            aria-pressed={activo}
                                            className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition-colors duration-200 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
                                            style={activo ? { background: "#14B8A614", boxShadow: "inset 0 0 0 1px #14B8A655" } : undefined}
                                        >
                                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal-400/15 text-teal-300">
                                                <Users2 className="h-4 w-4" aria-hidden="true" />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-[15px] font-semibold text-white">{g.name}</span>
                                                <span className="block text-xs text-white/60">
                                                    {ETIQUETA_GRUPO[g.kind]} · {g.memberCount === 1 ? "1 miembro" : `${g.memberCount} miembros`}
                                                </span>
                                            </span>
                                            <Marca activo={activo} color="#14B8A6" />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                )}

                {!hayResultados && !buscando && (
                    <p className="px-1 py-3 text-center text-[13px] text-white/55">
                        {q.trim().length >= 2
                            ? "No encuentro a nadie con ese nombre."
                            : contactos.length === 0
                                ? "Escribe al menos dos letras para buscar en la red."
                                : "Escribe para buscar en tus contactos y en la red."}
                    </p>
                )}
            </div>
        </div>
    );
}

function Marca({ activo, color }: { activo: boolean; color: string }) {
    return (
        <span
            aria-hidden="true"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors duration-200"
            style={activo ? { background: color, color: "#fff" } : { boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,.25)" }}
        >
            {activo ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
        </span>
    );
}

function FilaPersona({
    nombre,
    detalle,
    avatarUrl,
    relacion,
    activo,
    color,
    onClick,
}: {
    nombre: string;
    detalle?: string;
    avatarUrl: string | null;
    relacion?: Parameters<typeof AvatarContacto>[0]["relacion"];
    activo: boolean;
    color: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={activo}
            className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition-colors duration-200 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
            style={activo ? { background: `${color}14`, boxShadow: `inset 0 0 0 1px ${color}55` } : undefined}
        >
            <AvatarContacto nombre={nombre} avatarUrl={avatarUrl} tam={36} relacion={relacion} />
            <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-white">{nombre}</span>
                {detalle ? <span className="block text-xs text-white/60">{detalle}</span> : null}
            </span>
            <Marca activo={activo} color={color} />
        </button>
    );
}
