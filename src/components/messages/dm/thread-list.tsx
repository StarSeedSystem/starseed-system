"use client";

/*
 * ThreadList — lista de conversaciones de /messages (rediseño 2026-09-28).
 *
 * - Avatar con punto de presencia (una sola llamada `usePresencia` para todos los DMs).
 * - Nombre: apodo del chat › apodo/nombre del contacto › perfil.
 * - Vista previa del último mensaje (los mensajes con formato enseñan su texto plano), hora,
 *   no leídos e iconos de silenciado / fijado / restringido.
 * - Secciones «Fijados» y «Chats»; chips de filtro que saltan de línea (Todos · No leídos ·
 *   Grupos · Contactos · Solicitudes · Restringidos · Archivados).
 * - Menú vertical por fila (⋯ o clic derecho): Fijar · Silenciar ▸ · Marcar como leído ·
 *   Archivar · Ajustes del chat.
 * - La búsqueda mira también en los nombres de tus contactos y ofrece escribir a los que aún no
 *   tienen chat.
 *
 * Todo lo que se decide aquí es personal (Justicia restaurativa, §6): nada cambia para el otro.
 */

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { BellOff, Pin, Search, ShieldOff, Sparkles, SquarePen, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { DmThreadSummary, DmMessage } from "@/lib/messages/dm";
import type { OsProfile } from "@/lib/social/os-profiles";
import { useAjustesMensajeria } from "@/lib/mensajeria/ajustes-store";
import { usePresencia } from "@/lib/mensajeria/presencia";
import { useContactos } from "@/lib/contactos/store";
import type { Contacto } from "@/lib/contactos/tipos";
import { AvatarContacto } from "@/components/contactos/avatar-contacto";
import {
    ETIQUETAS_FILTRO, companeroDm, contarPorFiltro, esSolicitud, filtrarEntradas, filtrosVisibles, ordenarEntradas,
    seccionarEntradas, textoVacio, type EntradaLista, type FiltroLista,
} from "@/components/messages/marco/filtros-lista";
import { describirSilencio, etiquetaFechaLista } from "@/components/messages/marco/formato-tiempo";
import { ACENTO, CLASE_ROTULO, pildoraFantasma } from "@/components/messages/marco/estilos";
import { MenuHilo, type AccionExtraMenu } from "@/components/messages/marco/menu-hilo";
import { DialogoAjustesHilo } from "@/components/messages/marco/dialogo-ajustes-hilo";

/* ───────────────────── Helpers públicos (los usa también ThreadView) ───────────────────── */

function threadTitle(t: DmThreadSummary, profiles: Record<string, OsProfile>, myUserId: string | null): string {
    if (t.title) return t.title;
    if (t.kind === "group") return "Grupo sin nombre";
    // DM: título = nombre del otro miembro.
    const otherId = t.memberIds.find((id) => id !== myUserId);
    const p = otherId ? profiles[otherId] : undefined;
    return p?.displayName ?? p?.username ?? "Conversación";
}

function threadAvatar(t: DmThreadSummary, profiles: Record<string, OsProfile>, myUserId: string | null): string | undefined {
    if (t.avatarUrl) return t.avatarUrl;
    if (t.kind === "dm") {
        const otherId = t.memberIds.find((id) => id !== myUserId);
        return otherId ? profiles[otherId]?.avatarUrl : undefined;
    }
    return undefined;
}

/* ─────────────────────────────── Vista previa ─────────────────────────────── */

const ETIQUETA_ADJUNTO: Record<string, string> = {
    image: "Foto",
    audio: "Audio",
    video: "Vídeo",
    file: "Archivo",
    vivo: "App en vivo",
    llamada: "Llamada",
    invite: "Invitación",
    ref: "Contenido de la red",
};

/** Texto de la vista previa: los mensajes con formato llevan su equivalente en texto plano en `body`. */
export function textoVistaPrevia(m: DmMessage | null): string {
    if (!m) return "Sin mensajes todavía";
    if (m.deleted) return "Mensaje eliminado";
    const cuerpo = (m.body || "").replace(/\s+/g, " ").trim();
    if (cuerpo) return cuerpo;
    const conFormato = !!(m as DmMessage & { formato?: unknown }).formato;
    if (m.attachments.length) {
        const k = String(m.attachments[0].kind || "file");
        const base = ETIQUETA_ADJUNTO[k] ?? "Archivo adjunto";
        return m.attachments.length > 1 ? `${base} y ${m.attachments.length - 1} más` : base;
    }
    return conFormato ? "Mensaje con formato" : "Sin mensajes todavía";
}

const SIN_IDS: string[] = [];

function primerNombre(s: string): string {
    return s.trim().split(/\s+/)[0] || s;
}

/* ─────────────────────────────── Componente ─────────────────────────────── */

export interface ThreadListProps {
    threads: DmThreadSummary[];
    profiles: Record<string, OsProfile>;
    myUserId: string | null;
    selectedId: string | null;
    onSelect: (thread: DmThreadSummary) => void;
    onNewChat: () => void;
    loading?: boolean;
    className?: string;
    /** «Marcar como leído» desde el menú (la página actualiza su contador). */
    onMarcarLeido?: (threadId: string) => void;
    /** Escribir a un contacto que aún no tiene chat (resultado de la búsqueda). */
    onIniciarChat?: (userId: string) => void;
}

interface FilaDatos extends EntradaLista {
    avatarUrl?: string;
    enLinea: boolean;
    contacto?: Contacto;
    otroId: string | null;
    preview: string;
}

export function ThreadList({
    threads,
    profiles,
    myUserId,
    selectedId,
    onSelect,
    onNewChat,
    loading,
    className,
    onMarcarLeido,
    onIniciarChat,
}: ThreadListProps) {
    const aj = useAjustesMensajeria();
    const libreta = useContactos();
    const [busqueda, setBusqueda] = useState("");
    const [filtro, setFiltro] = useState<FiltroLista>("todos");
    const [menuAbierto, setMenuAbierto] = useState<string | null>(null);
    const [ajustesDe, setAjustesDe] = useState<{ id: string; tipo: "dm" | "grupo"; titulo: string } | null>(null);

    const { privacidad, chats } = aj.ajustes;
    const escribirme = privacidad.escribirme;
    const verPresencia = privacidad.mostrarEnLinea !== "nadie";
    const formato24h = chats.apariencia.formato24h;

    // Una sola consulta de presencia para todos los DMs (ids ordenados = referencia estable).
    const idsCompaneros = useMemo(() => {
        const s = new Set<string>();
        for (const t of threads) {
            const o = companeroDm(t, myUserId);
            if (o) s.add(o);
        }
        return Array.from(s).sort();
    }, [threads, myUserId]);
    const presencia = usePresencia(verPresencia ? idsCompaneros : SIN_IDS);

    const filas: FilaDatos[] = useMemo(() => {
        return threads.map((t) => {
            const tipo = t.kind === "group" ? "grupo" : "dm";
            const ef = aj.efectivos(t.id, tipo);
            // El icono de silencio es el del propio chat (las horas de silencio generales no
            // tiñen de gris toda la lista por la noche).
            const propio = aj.ajustes.hilos[t.id]?.notificaciones;
            const silenciadoPropio = !!describirSilencio(propio?.silencioHasta ?? null) || propio?.activas === false;
            const otroId = companeroDm(t, myUserId);
            const contacto = otroId ? libreta.porUserId(otroId) : undefined;
            const perfil = otroId ? profiles[otroId] : undefined;
            const nombreContacto = contacto ? contacto.apodo || contacto.nombre : null;
            const titulo = ef.apodo || (t.kind === "dm" ? nombreContacto || threadTitle(t, profiles, myUserId) : threadTitle(t, profiles, myUserId));
            const buscable = [contacto?.nombre, contacto?.apodo, perfil?.displayName, perfil?.username ? `@${perfil.username}` : "", t.title]
                .filter(Boolean)
                .join(" ");

            let preview = textoVistaPrevia(t.lastMessage);
            const remitente = t.lastMessage?.sender;
            if (t.lastMessage && !t.lastMessage.deleted && t.lastMessage.kind !== "system") {
                if (remitente && remitente === myUserId) preview = `Tú: ${preview}`;
                else if (t.kind === "group" && remitente && profiles[remitente]) preview = `${primerNombre(profiles[remitente].displayName)}: ${preview}`;
                else if (t.lastMessage.kind === "agent") preview = `Aurora: ${preview}`;
            }

            return {
                hilo: t,
                titulo,
                buscable,
                estado: {
                    fijado: ef.fijado,
                    archivado: ef.archivado,
                    restringido: ef.restringido,
                    silenciado: silenciadoPropio,
                    apodo: ef.apodo,
                },
                esContacto: !!contacto,
                esSolicitud: esSolicitud(t, myUserId, escribirme, (uid) => !!libreta.porUserId(uid)),
                avatarUrl: t.avatarUrl || contacto?.perfil?.avatarUrl || perfil?.avatarUrl || undefined,
                enLinea: verPresencia && !!otroId && !!presencia[otroId]?.enLinea,
                contacto,
                otroId,
                preview,
            };
        });
    }, [threads, aj, libreta, profiles, myUserId, escribirme, verPresencia, presencia]);

    const visibles = useMemo(() => filtrosVisibles(escribirme), [escribirme]);
    useEffect(() => {
        if (!visibles.includes(filtro)) setFiltro("todos");
    }, [visibles, filtro]);

    const cuentas = useMemo(() => contarPorFiltro(filas), [filas]);
    const mostradas = useMemo(
        () => ordenarEntradas(filtrarEntradas(filas, filtro, busqueda), chats.ordenLista) as FilaDatos[],
        [filas, filtro, busqueda, chats.ordenLista],
    );
    const { fijados, resto } = useMemo(() => seccionarEntradas(mostradas, chats.fijadosArriba), [mostradas, chats.fijadosArriba]);

    // Contactos que coinciden con la búsqueda y todavía no tienen chat.
    const contactosSinChat = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        if (!q || !onIniciarChat) return [];
        const conChat = new Set(idsCompaneros);
        return libreta.contactos
            .filter((c) => c.userId && c.userId !== myUserId && !conChat.has(c.userId))
            .filter((c) => [c.nombre, c.apodo, c.username].filter(Boolean).join(" ").toLowerCase().includes(q))
            .slice(0, 6);
    }, [busqueda, onIniciarChat, idsCompaneros, libreta.contactos, myUserId]);

    const aceptarSolicitud = (f: FilaDatos) => {
        if (!f.otroId) return;
        const perfil = profiles[f.otroId];
        libreta.crear({
            nombre: perfil?.displayName || f.titulo,
            userId: f.otroId,
            username: perfil?.username ?? null,
            perfil: perfil ? { nombre: perfil.displayName, avatarUrl: perfil.avatarUrl, bio: perfil.bio, tomada: new Date().toISOString() } : null,
            relacion: "otra",
            origen: "starseed",
        });
        toast.success(`${f.titulo} está ahora en tus contactos.`);
    };

    const fila = (f: FilaDatos) => {
        const t = f.hilo;
        const activo = selectedId === t.id;
        const tipo = t.kind === "group" ? "grupo" : "dm";
        const noLeidos = t.unreadCount;
        const hilo = aj.ajustes.hilos[t.id];
        const extras: AccionExtraMenu[] = f.esSolicitud
            ? [{ id: "aceptar", etiqueta: "Aceptar y añadir a contactos", icono: UserPlus, onSelect: () => aceptarSolicitud(f), color: ACENTO.contactos }]
            : [];
        const abrirMenu = (e: MouseEvent) => {
            e.preventDefault();
            setMenuAbierto(t.id);
        };
        return (
            <li key={t.id} className="relative" onContextMenu={abrirMenu}>
                <div
                    className={cn(
                        "group flex items-center gap-1 rounded-2xl pr-1 transition-colors duration-150",
                        activo ? "" : "hover:bg-white/[0.05]",
                    )}
                    style={activo ? pildoraFantasma(ACENTO.mensajes) : undefined}
                >
                    <button
                        type="button"
                        onClick={() => onSelect(t)}
                        aria-current={activo ? "true" : undefined}
                        aria-label={`${f.titulo}${noLeidos > 0 ? `, ${noLeidos} sin leer` : ""}`}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-2xl py-2.5 pl-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF]"
                    >
                        <span className="relative shrink-0">
                            <AvatarContacto nombre={f.titulo} avatarUrl={f.avatarUrl ?? null} tam={46} enLinea={f.enLinea} relacion={f.contacto?.relacion} />
                            {t.kind === "group" && !f.avatarUrl && (
                                <span className="absolute -bottom-0.5 -left-0.5 grid h-[18px] w-[18px] place-items-center rounded-full border-2 border-[#0b0c1c] bg-[#10B981] text-[9px] font-bold text-white" aria-hidden>
                                    {t.memberIds.length}
                                </span>
                            )}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                                <span className={cn("truncate text-[14px] text-white", noLeidos > 0 && !f.estado.silenciado ? "font-bold" : "font-semibold")}>
                                    {f.titulo}
                                </span>
                                {t.agent?.enabled && <Sparkles className="h-3 w-3 shrink-0 text-[#007FFF]" aria-label="Aurora activa" />}
                                <span className="ml-auto shrink-0 pl-1 text-[11px] text-white/50">{etiquetaFechaLista(t.lastMsgAt, formato24h)}</span>
                            </span>
                            <span className="mt-0.5 flex items-center gap-1.5">
                                <span className={cn("min-w-0 flex-1 truncate text-[13px]", noLeidos > 0 && !f.estado.silenciado ? "text-white/80" : "text-white/55", t.lastMessage?.kind === "system" && "italic")}>
                                    {f.preview}
                                </span>
                                {f.estado.restringido && <ShieldOff className="h-3.5 w-3.5 shrink-0 text-white/45" aria-label="Restringido" />}
                                {f.estado.silenciado && <BellOff className="h-3.5 w-3.5 shrink-0 text-white/45" aria-label="Silenciado" />}
                                {f.estado.fijado && <Pin className="h-3.5 w-3.5 shrink-0 rotate-45 text-white/55" aria-label="Fijado" />}
                                {noLeidos > 0 && (
                                    <span
                                        className="min-w-[20px] shrink-0 rounded-full px-1.5 text-center text-[11px] font-bold leading-5 text-white"
                                        style={{ background: f.estado.silenciado ? "rgba(255,255,255,0.18)" : ACENTO.mensajes }}
                                    >
                                        {noLeidos > 99 ? "99+" : noLeidos}
                                    </span>
                                )}
                            </span>
                        </span>
                    </button>
                    <MenuHilo
                        etiqueta={`Opciones de ${f.titulo}`}
                        abierto={menuAbierto === t.id}
                        onAbiertoChange={(v) => setMenuAbierto(v ? t.id : null)}
                        fijado={f.estado.fijado}
                        silencioHasta={hilo?.notificaciones?.silencioHasta ?? null}
                        archivado={f.estado.archivado}
                        formato24h={formato24h}
                        onFijar={() => aj.cambiarHilo(t.id, { fijado: !f.estado.fijado })}
                        onSilenciar={(hasta) => aj.cambiarHilo(t.id, { notificaciones: { silencioHasta: hasta } })}
                        onArchivar={() => {
                            aj.cambiarHilo(t.id, { archivado: !f.estado.archivado });
                            toast.success(f.estado.archivado ? "Chat desarchivado." : "Chat archivado. Lo tienes en «Archivados».");
                        }}
                        onMarcarLeido={noLeidos > 0 && onMarcarLeido ? () => onMarcarLeido(t.id) : undefined}
                        onAjustes={() => setAjustesDe({ id: t.id, tipo, titulo: f.titulo })}
                        etiquetaAjustes={tipo === "grupo" ? "Ajustes del grupo" : "Ajustes del chat"}
                        extrasAntes={extras}
                        className="opacity-70 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                    />
                </div>
            </li>
        );
    };

    const vacio = textoVacio(filtro, busqueda);
    const hayAlgo = fijados.length + resto.length > 0;

    return (
        <div className={cn("flex h-full min-h-0 flex-col", className)}>
            <div className="shrink-0 space-y-3 px-4 pb-3 pt-4">
                <div className="flex items-center justify-between gap-2">
                    <h1 className="text-[20px] font-semibold tracking-tight text-white">Mensajes</h1>
                    <button
                        type="button"
                        onClick={onNewChat}
                        className="ss-redondo inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-white transition-transform duration-150 hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7C5CFF]"
                        style={pildoraFantasma(ACENTO.mensajes)}
                    >
                        <SquarePen className="h-4 w-4" /> Nuevo chat
                    </button>
                </div>
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                    <input
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Buscar chats y contactos…"
                        aria-label="Buscar chats y contactos"
                        className="h-10 w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] pl-9 pr-9 text-[14px] text-white placeholder:text-white/40 transition-colors focus:border-[#7C5CFF]/60 focus:bg-white/[0.06] focus:outline-none"
                    />
                    {busqueda && (
                        <button
                            type="button"
                            onClick={() => setBusqueda("")}
                            aria-label="Borrar búsqueda"
                            className="ss-redondo absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
                <div role="group" aria-label="Filtrar chats" className="flex flex-wrap gap-1.5">
                    {visibles.map((f) => {
                        const activo = filtro === f;
                        const n = f === "todos" ? 0 : cuentas[f];
                        const color = f === "solicitudes" || f === "contactos" ? ACENTO.contactos : f === "restringidos" || f === "archivados" ? "#94A3B8" : ACENTO.mensajes;
                        return (
                            <button
                                key={f}
                                type="button"
                                aria-pressed={activo}
                                onClick={() => setFiltro(f)}
                                className={cn(
                                    "ss-redondo inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#7C5CFF]",
                                    activo ? "text-white" : "text-white/60 hover:text-white",
                                )}
                                style={pildoraFantasma(color, activo)}
                            >
                                {ETIQUETAS_FILTRO[f]}
                                {n > 0 && (f === "no-leidos" || f === "solicitudes" || f === "archivados" || f === "restringidos") && (
                                    <span className="text-[11px] font-bold text-white/70">{n}</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" data-testid="lista-hilos">
                {loading ? (
                    <div className="space-y-2 p-2" aria-busy="true" aria-label="Cargando chats">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="flex items-center gap-3 rounded-2xl p-2.5">
                                <div className="h-11 w-11 animate-pulse rounded-full bg-white/[0.06]" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-3 w-1/2 animate-pulse rounded bg-white/[0.06]" />
                                    <div className="h-3 w-3/4 animate-pulse rounded bg-white/[0.04]" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <>
                        {filtro === "solicitudes" && hayAlgo && (
                            <p className="mx-2 mb-2 rounded-xl px-3 py-2 text-[12px] leading-relaxed text-white/70" style={pildoraFantasma(ACENTO.contactos)}>
                                Personas que no están en tus contactos. No te avisan; responde o acéptalas cuando quieras.
                            </p>
                        )}
                        {fijados.length > 0 && (
                            <>
                                <p className={cn(CLASE_ROTULO, "px-3 pb-1 pt-1")}>Fijados</p>
                                <ul className="space-y-0.5" aria-label="Chats fijados">{fijados.map((f) => fila(f as FilaDatos))}</ul>
                            </>
                        )}
                        {resto.length > 0 && (
                            <>
                                {fijados.length > 0 && <p className={cn(CLASE_ROTULO, "px-3 pb-1 pt-3")}>Chats</p>}
                                <ul className="space-y-0.5" aria-label="Chats">{resto.map((f) => fila(f as FilaDatos))}</ul>
                            </>
                        )}

                        {contactosSinChat.length > 0 && (
                            <>
                                <p className={cn(CLASE_ROTULO, "px-3 pb-1 pt-3")}>Contactos sin chat</p>
                                <ul className="space-y-0.5" aria-label="Contactos sin chat">
                                    {contactosSinChat.map((c) => (
                                        <li key={c.id}>
                                            <button
                                                type="button"
                                                onClick={() => c.userId && onIniciarChat?.(c.userId)}
                                                className="flex w-full cursor-pointer items-center gap-3 rounded-2xl p-2.5 text-left transition-colors hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#14B8A6]"
                                            >
                                                <AvatarContacto nombre={c.apodo || c.nombre} avatarUrl={c.perfil?.avatarUrl ?? null} tam={40} relacion={c.relacion} />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-[14px] font-semibold text-white">{c.apodo || c.nombre}</span>
                                                    <span className="block text-[12px] text-white/55">Escribirle</span>
                                                </span>
                                                <SquarePen className="h-4 w-4 shrink-0 text-[#14B8A6]" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}

                        {!hayAlgo && contactosSinChat.length === 0 && (
                            <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center" role="status">
                                <SquarePen className="h-8 w-8 text-white/25" />
                                <p className="text-[14px] font-medium text-white/80">{vacio.titulo}</p>
                                {vacio.detalle && <p className="max-w-[260px] text-[12px] leading-relaxed text-white/50">{vacio.detalle}</p>}
                                {filtro === "todos" && !busqueda && (
                                    <button
                                        type="button"
                                        onClick={onNewChat}
                                        className="mt-2 cursor-pointer rounded-xl bg-white/[0.06] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-white/[0.12]"
                                    >
                                        Iniciar un chat
                                    </button>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            <DialogoAjustesHilo
                open={!!ajustesDe}
                onOpenChange={(v) => !v && setAjustesDe(null)}
                hiloId={ajustesDe?.id ?? null}
                tipo={ajustesDe?.tipo ?? "dm"}
                titulo={ajustesDe?.titulo ?? ""}
            />
        </div>
    );
}

export default ThreadList;
export { threadTitle, threadAvatar };
