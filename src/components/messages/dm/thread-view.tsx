"use client";

/*
 * ThreadView — chat activo (panel derecho de /messages). Rediseño 2026-09-28:
 *  · Cabecera con el nombre REAL (apodo del chat › contacto › perfil › @usuario): los perfiles
 *    de TODOS los miembros se cargan al abrir el hilo y se FUSIONAN (nunca se reemplazan), así
 *    que el nombre aparece aunque la otra persona no haya escrito aún.
 *  · Ajustes efectivos del hilo aplicados: fondo, tamaño de letra, color de mis burbujas,
 *    densidad, hora, vaciado «solo para mí», confirmaciones de lectura, vista previa de enlaces.
 *  · Burbujas agrupadas con separadores de día, búsqueda dentro del chat, visor a pantalla
 *    completa, panel de información (archivos, carpetas, contacto, miembros, ajustes).
 *  · El manejador de realtime lee refs (sin cierres obsoletos).
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Eye, EyeOff, Loader2, MessageCircleHeart, Paperclip } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
    listMessages, listMembers, sendMessage, editMessage, softDeleteMessage, subscribeThread,
    markRead, markThreadReadLocal, setThreadAgent, mentionsAurora, messageFromRealtimeRow, threadEntityLink,
    type DmAttachment, type DmMember, type DmMessage, type DmThreadSummary, type SendMessageInput, type ThreadAgentConfig,
} from "@/lib/messages/dm";
import { askAuroraInThread } from "@/lib/messages/aurora-thread";
import { fetchProfilesByIds, type OsProfile } from "@/lib/social/os-profiles";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useContactos, usePorUserId } from "@/lib/contactos/store";
import type { FormatoMensaje } from "@/lib/mensajeria/formato-tipos";
import type { TipoHilo } from "@/lib/mensajeria/ajustes-tipos";
// Contratos C7 (librería de mensajería) y C8 (contactos).
import { useAjustesMensajeria } from "@/lib/mensajeria/ajustes-store";
import { fondoCss, tamanoLetraPx } from "@/lib/mensajeria/ajustes";
import { formatearPresencia, usePresencia, useSalaHilo } from "@/lib/mensajeria/presencia";
import { useCarpetasHilo } from "@/lib/mensajeria/carpetas-hilo";
import { EditorContacto } from "@/components/contactos/editor-contacto";
import { MessageBubble } from "@/components/messages/dm/message-bubble";
import { CabeceraHilo, BarraBusquedaHilo } from "@/components/messages/dm/cabecera-hilo";
import { ComposerHilo, type ComposerHandle, type EnvioComposer } from "@/components/messages/dm/composer";
import { SeparadorDia } from "@/components/messages/dm/separador-dia";
import { ContextoHilo, type ApiCarpetasHilo, type ContextoHiloValor, type VistaInfo } from "@/components/messages/dm/contexto-hilo";
import { useEsMovil, useMovimientoReducido } from "@/components/messages/dm/hooks-hilo";
import {
    agruparMensajes, buscarCoincidencias, debeCargarMultimedia, estadoLectura, exportarChatTexto, mensajesVisibles,
    nombreArchivoSeguro, nombrePersona, otroMiembro, resolverNombreHilo, resumenMiembros, textoEscribiendo,
} from "@/components/messages/dm/utilidades-hilo";
const PanelInfoHilo = dynamic(() => import("@/components/messages/info/panel-info-hilo").then((m) => m.PanelInfoHilo), { ssr: false });
const VisorMensaje = dynamic(() => import("@/components/messages/info/visor-mensaje").then((m) => m.VisorMensaje), { ssr: false });

export interface ThreadViewProps {
    thread: DmThreadSummary;
    myUserId: string | null;
    onBack?: () => void;
    onThreadUpdated: (thread: DmThreadSummary) => void;
    /** Adjunto de servidor prellenado (desde ?attachServer=<slug>), si aplica. */
    pendingServerAttachment?: DmAttachment | null;
    onConsumePendingAttachment?: () => void;
    /**
     * Enfoca el compositor al abrir el hilo (Adenda 63 · P-4): lo usa el
     * deep-link `/messages?to=<handle>`, que abre (o crea) el chat con esa
     * persona y deja el cursor listo para escribir.
     */
    autoFocusComposer?: boolean;
    /** Perfiles de los miembros que la página ya cargó (se fusionan con los propios). */
    perfilesMiembros?: Record<string, OsProfile>;
    /** Modo enfoque (la página oculta la lista y amplía el chat). */
    enfocado?: boolean;
    onAlternarEnfoque?: () => void;
}

const unicos = (xs: (string | null | undefined)[]) => Array.from(new Set(xs.filter((x): x is string => !!x)));

function descargarTexto(nombre: string, contenido: string) {
    try {
        const blob = new Blob([contenido], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nombre;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch {
        toast.error("No se pudo preparar la descarga en este navegador.");
    }
}

export function ThreadView({
    thread, myUserId, onBack, onThreadUpdated, pendingServerAttachment, onConsumePendingAttachment, autoFocusComposer,
    perfilesMiembros, enfocado, onAlternarEnfoque,
}: ThreadViewProps) {
    const esGrupo = thread.kind === "group";
    const tipo: TipoHilo = esGrupo ? "grupo" : "dm";

    const [messages, setMessages] = useState<DmMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [perfilesLocales, setPerfilesLocales] = useState<Record<string, OsProfile>>({});
    const [miembros, setMiembros] = useState<DmMember[]>([]);
    const [replyTo, setReplyTo] = useState<DmMessage | null>(null);
    const [asking, setAsking] = useState(false);
    const [auroraStatus, setAuroraStatus] = useState("");
    const [info, setInfo] = useState<{ abierto: boolean; vista: VistaInfo; foco?: string }>({ abierto: false, vista: "inicio" });
    const [visorId, setVisorId] = useState<string | null>(null);
    const [busqueda, setBusqueda] = useState<{ abierta: boolean; texto: string; indice: number }>({ abierta: false, texto: "", indice: 0 });
    const [mostrarTodo, setMostrarTodo] = useState(false);
    const [destacadoId, setDestacadoId] = useState<string | null>(null);
    const [editorContacto, setEditorContacto] = useState(false);
    const [lejosDelFinal, setLejosDelFinal] = useState(false);
    const [arrastrando, setArrastrando] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);
    const composerRef = useRef<ComposerHandle>(null);
    const autoRepliedIds = useRef<Set<string>>(new Set());
    const alFinal = useRef(true);

    const esMovil = useEsMovil();
    const reducido = useMovimientoReducido();
    const confirmar = useConfirm();

    // ── Ajustes efectivos del hilo (sección + hilo) ──────────────────────────
    const ajustesApi = useAjustesMensajeria();
    const ef = useMemo(() => ajustesApi.efectivos(thread.id, tipo), [ajustesApi, thread.id, tipo]);
    const privacidad = ajustesApi.ajustes.privacidad;

    // ── Perfiles: prop de la página + los que cargamos aquí, siempre fusionados ─
    const perfiles = useMemo(() => ({ ...(perfilesMiembros ?? {}), ...perfilesLocales }), [perfilesMiembros, perfilesLocales]);

    // Refs para el realtime y los efectos que no deben re-suscribirse.
    const perfilesRef = useRef(perfiles);
    perfilesRef.current = perfiles;
    const miUidRef = useRef(myUserId);
    miUidRef.current = myUserId;
    const lecturaRef = useRef(ef.confirmacionesLectura);
    lecturaRef.current = ef.confirmacionesLectura;
    const pedidos = useRef<Set<string>>(new Set());

    const pedirPerfiles = useCallback((ids: (string | null | undefined)[]) => {
        const faltan = unicos(ids).filter((id) => !perfilesRef.current[id] && !pedidos.current.has(id));
        if (!faltan.length) return;
        faltan.forEach((id) => pedidos.current.add(id));
        void fetchProfilesByIds(faltan)
            .then((p) => {
                if (p && Object.keys(p).length) setPerfilesLocales((prev) => ({ ...prev, ...p }));
            })
            .finally(() => faltan.forEach((id) => pedidos.current.delete(id)));
    }, []);

    const marcarLeido = useCallback((hiloId: string) => {
        // Sin confirmaciones de lectura: solo la marca local (no-leídos), nunca la remota.
        if (lecturaRef.current) void markRead(hiloId);
        else markThreadReadLocal(hiloId);
    }, []);

    // ── Carga al cambiar de hilo: mensajes + miembros + perfiles de TODOS ─────
    useEffect(() => {
        let vivo = true;
        setLoading(true);
        setMessages([]);
        setMiembros([]);
        setReplyTo(null);
        setMostrarTodo(false);
        setVisorId(null);
        setBusqueda({ abierta: false, texto: "", indice: 0 });
        setInfo((i) => ({ ...i, abierto: false }));
        alFinal.current = true;
        pedirPerfiles(thread.memberIds);
        void (async () => {
            const [msgs, mbrs] = await Promise.all([listMessages(thread.id), listMembers(thread.id)]);
            if (!vivo) return;
            setMessages(msgs);
            setMiembros(mbrs);
            setLoading(false);
            pedirPerfiles([...mbrs.map((m) => m.userId), ...msgs.map((m) => m.sender)]);
            marcarLeido(thread.id);
        })();
        return () => {
            vivo = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [thread.id]);

    // Miembros que llegan después por la prop del hilo (alguien se unió).
    const clavesMiembros = thread.memberIds.join(",");
    useEffect(() => {
        pedirPerfiles(thread.memberIds);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clavesMiembros, pedirPerfiles]);

    // ── Realtime (refs, sin cierres obsoletos) ──────────────────────────────
    useEffect(() => {
        const hiloId = thread.id;
        return subscribeThread(hiloId, (payload) => {
            if (payload.eventType === "INSERT") {
                const msg = messageFromRealtimeRow(payload.new);
                if (!msg) return;
                setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
                if (msg.sender) pedirPerfiles([msg.sender]);
                if (msg.sender !== miUidRef.current) marcarLeido(hiloId);
            } else if (payload.eventType === "UPDATE") {
                const msg = messageFromRealtimeRow(payload.new);
                if (msg) setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
            }
        });
    }, [thread.id, pedirPerfiles, marcarLeido]);

    // Auto-respuesta cuando el hilo tiene Aurora activa y alguien menciona @aurora.
    useEffect(() => {
        if (!thread.agent?.enabled || !thread.agent.autoReplyOnMention) return;
        const last = messages[messages.length - 1];
        if (!last || last.kind !== "user" || last.deleted) return;
        if (!mentionsAurora(last.body)) return;
        if (autoRepliedIds.current.has(last.id)) return;
        autoRepliedIds.current.add(last.id);
        void askAuroraInThread(thread.id, { invokerId: myUserId, agent: thread.agent }).then((res) => {
            // Silencioso: no interrumpe el chat si Aurora falla puntualmente.
            if (!res.ok) autoRepliedIds.current.delete(last.id);
        });
    }, [messages, thread.agent, thread.id, myUserId]);

    // ── Nombres ──────────────────────────────────────────────────────────────
    const contactosApi = useContactos();
    const otroId = otroMiembro(thread, myUserId);
    const contacto = usePorUserId(otroId);
    const nombreDe = useCallback(
        (uid: string | null | undefined): string => {
            if (!uid) return "Miembro";
            if (uid === myUserId) return "Tú";
            return nombrePersona(uid, perfiles, contactosApi.porUserId(uid)) ?? "Miembro";
        },
        [perfiles, contactosApi, myUserId],
    );
    const titulo = resolverNombreHilo({ thread, miUid: myUserId, perfiles, apodo: ef.apodo, contacto });
    const avatar = thread.avatarUrl ?? (otroId ? perfiles[otroId]?.avatarUrl ?? contacto?.perfil?.avatarUrl : undefined);

    const idsMiembros = useMemo(
        () => unicos([...thread.memberIds, ...miembros.map((m) => m.userId)]),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [clavesMiembros, miembros],
    );
    const clavesOtros = idsMiembros.filter((id) => id !== myUserId).join(",");
    const idsPresencia = useMemo(
        () => (privacidad.mostrarEnLinea === "nadie" || !clavesOtros ? [] : clavesOtros.split(",")),
        [clavesOtros, privacidad.mostrarEnLinea],
    );
    const presencia = usePresencia(idsPresencia);
    const sala = useSalaHilo(thread.id, myUserId);
    const escribiendoIds = (sala?.escribiendo ?? []).filter((id) => id && id !== myUserId);
    const escribiendo = textoEscribiendo(escribiendoIds, esGrupo, nombreDe);
    const enLinea = !!(otroId && presencia?.[otroId]?.enLinea);
    const subtitulo = useMemo(() => {
        if (esGrupo) {
            const resumen = resumenMiembros(idsMiembros, myUserId, nombreDe);
            const conectados = idsPresencia.filter((id) => presencia?.[id]?.enLinea).length;
            return conectados ? `${conectados} en línea · ${resumen}` : resumen;
        }
        const texto = otroId ? formatearPresencia(presencia?.[otroId]) : null;
        if (texto) return texto;
        const u = otroId ? perfiles[otroId]?.username : null;
        return u ? `@${u}` : null;
    }, [esGrupo, idsMiembros, myUserId, nombreDe, idsPresencia, presencia, otroId, perfiles]);

    // ── Carpetas (una sola instancia por chat) ───────────────────────────────
    const carpetas = useCarpetasHilo(thread.id) as ApiCarpetasHilo;

    // ── Mensajes visibles, grupos y búsqueda ─────────────────────────────────
    const { visibles, ocultos } = useMemo(
        () => mensajesVisibles(messages, ef.vaciadoEn, mostrarTodo),
        [messages, ef.vaciadoEn, mostrarTodo],
    );
    const enLista = useMemo(() => agruparMensajes(visibles), [visibles]);
    const coincidencias = useMemo(
        () => (busqueda.abierta ? buscarCoincidencias(visibles, busqueda.texto) : []),
        [busqueda.abierta, busqueda.texto, visibles],
    );
    // indice cuenta desde la coincidencia más reciente (0 = la última).
    const idActivo = coincidencias.length
        ? coincidencias[coincidencias.length - 1 - (busqueda.indice % coincidencias.length)]
        : null;

    useEffect(() => {
        if (!idActivo) return;
        document.getElementById(`msg-${idActivo}`)?.scrollIntoView?.({ block: "center", behavior: reducido ? "auto" : "smooth" });
    }, [idActivo, reducido]);

    // ── Desplazamiento ───────────────────────────────────────────────────────
    const alDesplazar = () => {
        const el = scrollRef.current;
        if (!el) return;
        const cerca = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
        alFinal.current = cerca;
        setLejosDelFinal((v) => (v === !cerca ? v : !cerca));
    };

    const irAlFinal = useCallback(
        (suave = true) => {
            const el = scrollRef.current;
            if (!el) return;
            el.scrollTo?.({ top: el.scrollHeight, behavior: suave && !reducido ? "smooth" : "auto" });
            alFinal.current = true;
            setLejosDelFinal(false);
        },
        [reducido],
    );

    useLayoutEffect(() => {
        if (!loading) irAlFinal(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, thread.id]);

    const ultimo = visibles[visibles.length - 1];
    useEffect(() => {
        if (!ultimo || busqueda.abierta) return;
        if (alFinal.current || ultimo.sender === myUserId) irAlFinal(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ultimo?.id]);

    const irAlMensaje = useCallback(
        (id: string) => {
            const existe = messages.some((m) => m.id === id);
            if (!existe) {
                toast.message("Ese mensaje es anterior a los que están cargados en este chat.");
                return;
            }
            if (!visibles.some((m) => m.id === id)) setMostrarTodo(true);
            if (esMovil) setInfo((i) => ({ ...i, abierto: false }));
            setVisorId(null);
            setTimeout(() => {
                document.getElementById(`msg-${id}`)?.scrollIntoView?.({ block: "center", behavior: reducido ? "auto" : "smooth" });
                setDestacadoId(id);
                setTimeout(() => setDestacadoId((d) => (d === id ? null : d)), 1700);
            }, 60);
        },
        [messages, visibles, esMovil, reducido],
    );

    const abrirVisor = useCallback((id: string) => setVisorId(id), []);

    // ── Envío ────────────────────────────────────────────────────────────────
    const handleEnviar = async ({ body, attachments, formato }: EnvioComposer): Promise<boolean> => {
        if (!body && attachments.length === 0) return false;
        const entrada: SendMessageInput & { formato?: FormatoMensaje | null } = {
            body,
            attachments,
            replyTo: replyTo?.id ?? null,
            ...(formato ? { formato } : {}),
        };
        // Si la columna `formato` aún no existe en la base, `sendMessage` reintenta sin ella.
        const saved = await sendMessage(thread.id, entrada);
        if (!saved) {
            toast.error(myUserId ? "No se pudo enviar el mensaje. Revisa tu conexión e inténtalo de nuevo." : "Inicia sesión para enviar mensajes.");
            return false;
        }
        alFinal.current = true;
        setMessages((prev) => (prev.some((m) => m.id === saved!.id) ? prev : [...prev, saved!]));
        setReplyTo(null);
        return true;
    };

    const handlePreguntarAurora = async (prompt: string): Promise<boolean> => {
        if (!thread.agent?.enabled) return false;
        setAsking(true);
        try {
            const res = await askAuroraInThread(thread.id, {
                invokerId: myUserId,
                agent: thread.agent,
                prompt: prompt || undefined,
                onStatus: setAuroraStatus,
            });
            if (!res.ok) {
                toast.error(res.error || "Aurora no pudo responder ahora mismo.");
                return false;
            }
            if (res.message) setMessages((prev) => (prev.some((m) => m.id === res.message!.id) ? prev : [...prev, res.message!]));
            return true;
        } finally {
            setAsking(false);
            setAuroraStatus("");
        }
    };

    const handleToggleAgent = async (enabled: boolean) => {
        const next: ThreadAgentConfig = {
            enabled,
            name: thread.agent?.name || "Aurora",
            persona: thread.agent?.persona,
            autoReplyOnMention: thread.agent?.autoReplyOnMention !== false,
        };
        const ok = await setThreadAgent(thread.id, next);
        if (ok) onThreadUpdated({ ...thread, agent: next });
        else toast.error("No se pudo actualizar Aurora en este chat.");
    };

    // ── Acciones del menú ⋮ ──────────────────────────────────────────────────
    const abrirInfo = useCallback((vista: VistaInfo = "inicio", foco?: string) => setInfo({ abierto: true, vista, foco }), []);

    const silenciar = (hasta: string | null) => {
        ajustesApi.cambiarHilo(thread.id, { notificaciones: { silencioHasta: hasta } });
        toast.success(hasta ? "Chat silenciado" : "Vuelve a sonar");
    };

    const archivar = () => {
        ajustesApi.cambiarHilo(thread.id, { archivado: !ef.archivado });
        toast.success(ef.archivado ? "Chat desarchivado" : "Chat archivado — lo encontrarás en «Archivados»");
    };

    const vaciar = async () => {
        const ok = await confirmar({
            title: "¿Vaciar este chat solo para ti?",
            description: "Dejarás de ver los mensajes anteriores en tus dispositivos. No se borra nada para nadie y puedes volver a mostrarlos cuando quieras.",
            confirmText: "Vaciar para mí",
            destructive: true,
        });
        if (!ok) return;
        ajustesApi.cambiarHilo(thread.id, { vaciadoEn: new Date().toISOString() });
        setMostrarTodo(false);
        toast.success("Chat vaciado para ti");
    };

    const exportar = () => {
        if (!visibles.length) {
            toast.message("No hay mensajes visibles que exportar.");
            return;
        }
        const texto = exportarChatTexto(
            titulo,
            visibles,
            (m) => (m.kind === "agent" ? "Aurora" : nombreDe(m.sender)),
            ef.apariencia.formato24h,
        );
        descargarTexto(nombreArchivoSeguro(`chat-${titulo}-${new Date().toISOString().slice(0, 10)}`, "txt"), texto);
    };

    // Vínculo hilo↔entidad (Adenda jul-2026 §1).
    const entityLink = threadEntityLink(thread);
    const entityHref = entityLink ? (entityLink.kind === "group" ? `/grupo/${entityLink.slug}` : `/pagina/${entityLink.slug}`) : null;

    const replyToMessageFor = (m: DmMessage): DmMessage | null =>
        m.replyTo ? messages.find((mm) => mm.id === m.replyTo) ?? null : null;

    const cargarMedios = debeCargarMultimedia(ef.cargarMultimedia);

    const contexto = useMemo<ContextoHiloValor>(
        () => ({
            hiloId: thread.id,
            miUid: myUserId,
            esGrupo,
            perfiles,
            mensajes: messages,
            efectivos: ef,
            carpetas,
            nombreDe,
            abrirVisor,
            irAlMensaje,
        }),
        [thread.id, myUserId, esGrupo, perfiles, messages, ef, carpetas, nombreDe, abrirVisor, irAlMensaje],
    );

    const perfilOtro = otroId ? perfiles[otroId] : undefined;

    return (
        <ContextoHilo.Provider value={contexto}>
            <div
                className="relative flex h-full min-h-0 flex-col overflow-hidden"
                onDragOver={(e) => {
                    if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return;
                    e.preventDefault();
                    if (!arrastrando) setArrastrando(true);
                }}
                onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                    setArrastrando(false);
                }}
                onDrop={(e) => {
                    if (!e.dataTransfer?.files?.length) return;
                    e.preventDefault();
                    setArrastrando(false);
                    composerRef.current?.recibirArchivos(e.dataTransfer.files);
                }}
            >
                <CabeceraHilo
                    hiloId={thread.id}
                    nombre={titulo}
                    avatarUrl={avatar}
                    esGrupo={esGrupo}
                    miembros={idsMiembros}
                    enLinea={enLinea}
                    subtitulo={subtitulo}
                    escribiendo={escribiendo}
                    auroraActiva={!!thread.agent?.enabled}
                    esMovil={esMovil}
                    onAtras={onBack}
                    onAbrirInfo={abrirInfo}
                    enfocado={enfocado}
                    onAlternarEnfoque={onAlternarEnfoque}
                    busquedaAbierta={busqueda.abierta}
                    onAlternarBusqueda={() => setBusqueda((b) => ({ abierta: !b.abierta, texto: b.abierta ? "" : b.texto, indice: 0 }))}
                    silenciado={ef.silenciado}
                    onSilenciar={silenciar}
                    archivado={ef.archivado}
                    onArchivar={archivar}
                    onAnadirContacto={!esGrupo && otroId && !contacto ? () => setEditorContacto(true) : undefined}
                    onExportar={exportar}
                    onVaciar={() => void vaciar()}
                    onAlternarAurora={(v) => void handleToggleAgent(v)}
                    enlaceEntidad={entityHref}
                />

                {busqueda.abierta && (
                    <BarraBusquedaHilo
                        texto={busqueda.texto}
                        onTexto={(v) => setBusqueda((b) => ({ ...b, texto: v, indice: 0 }))}
                        total={coincidencias.length}
                        indice={coincidencias.length ? busqueda.indice % coincidencias.length : 0}
                        onArriba={() => setBusqueda((b) => ({ ...b, indice: coincidencias.length ? (b.indice + 1) % coincidencias.length : 0 }))}
                        onAbajo={() => setBusqueda((b) => ({ ...b, indice: coincidencias.length ? (b.indice - 1 + coincidencias.length) % coincidencias.length : 0 }))}
                        onCerrar={() => setBusqueda({ abierta: false, texto: "", indice: 0 })}
                    />
                )}

                <div
                    ref={scrollRef}
                    onScroll={alDesplazar}
                    className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-2 sm:px-5"
                    style={{
                        background: fondoCss(ef.apariencia.fondo) || undefined,
                        backgroundAttachment: "local",
                        ["--tam-letra" as string]: `${tamanoLetraPx(ef.apariencia.tamanoLetra)}px`,
                    }}
                    role="log"
                    aria-label={`Mensajes con ${titulo}`}
                    aria-relevant="additions"
                    aria-busy={loading}
                >
                    {loading && (
                        <div className="flex items-center justify-center py-10" role="status">
                            <Loader2 className="h-5 w-5 animate-spin text-white/50" />
                            <span className="sr-only">Cargando mensajes…</span>
                        </div>
                    )}

                    {!loading && ocultos > 0 && (
                        <div className="flex justify-center py-2">
                            <button
                                type="button"
                                onClick={() => setMostrarTodo(true)}
                                className="ss-redondo inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] text-white/65 transition-colors hover:text-white"
                                style={{ background: "rgba(12,14,34,.6)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }}
                            >
                                <EyeOff className="h-3.5 w-3.5" /> Chat vaciado para ti · <span className="font-semibold text-[#b7a6ff]">Mostrar todo</span>
                            </button>
                        </div>
                    )}
                    {!loading && mostrarTodo && ef.vaciadoEn && (
                        <div className="flex justify-center py-2">
                            <button
                                type="button"
                                onClick={() => setMostrarTodo(false)}
                                className="ss-redondo inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] text-white/65 transition-colors hover:text-white"
                                style={{ background: "rgba(12,14,34,.6)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }}
                            >
                                <Eye className="h-3.5 w-3.5" /> Viendo también lo que vaciaste · <span className="font-semibold text-[#b7a6ff]">Ocultar</span>
                            </button>
                        </div>
                    )}

                    {!loading && visibles.length === 0 && (
                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                            <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "rgba(124,92,255,.12)", boxShadow: "inset 0 0 0 1px rgba(124,92,255,.3)" }}>
                                <MessageCircleHeart className="h-7 w-7 text-[#b7a6ff]" />
                            </span>
                            <p className="text-sm text-white/70">
                                {ocultos > 0 ? "Has vaciado este chat. Lo nuevo aparecerá aquí." : `Aún no hay mensajes. Escribe el primero a ${titulo}.`}
                            </p>
                        </div>
                    )}

                    {!loading && enLista.map(({ mensaje: m, nuevoDia, primeroDelGrupo, ultimoDelGrupo }) => {
                        const mio = m.sender === myUserId && m.kind !== "agent";
                        const citado = replyToMessageFor(m);
                        return (
                            <div key={m.id}>
                                {nuevoDia && <SeparadorDia fecha={m.createdAt} />}
                                <MessageBubble
                                    message={m}
                                    isMine={mio}
                                    sender={m.sender ? perfiles[m.sender] ?? null : null}
                                    senderName={m.kind === "agent" ? "Aurora" : nombreDe(m.sender)}
                                    replyToMessage={citado}
                                    replyToName={citado ? (citado.kind === "agent" ? "Aurora" : nombreDe(citado.sender)) : undefined}
                                    isAgentThread={m.kind === "agent"}
                                    esGrupo={esGrupo}
                                    primeroDelGrupo={primeroDelGrupo || nuevoDia}
                                    ultimoDelGrupo={ultimoDelGrupo}
                                    apariencia={ef.apariencia}
                                    estadoLectura={mio && ef.confirmacionesLectura ? estadoLectura(m, thread, myUserId) : null}
                                    vistaPreviaEnlaces={ef.vistaPreviaEnlaces}
                                    cargarMultimedia={cargarMedios}
                                    busqueda={busqueda.abierta ? busqueda.texto : ""}
                                    coincidenciaActiva={idActivo === m.id}
                                    destacado={destacadoId === m.id}
                                    onAbrirVisor={(mm) => abrirVisor(mm.id)}
                                    onReply={(mm) => {
                                        setReplyTo(mm);
                                        composerRef.current?.enfocar();
                                    }}
                                    onEdit={async (id, body) => {
                                        const ok = await editMessage(id, body);
                                        if (ok) setMessages((prev) => prev.map((mm) => (mm.id === id ? { ...mm, body, editedAt: new Date().toISOString() } : mm)));
                                        else toast.error("No se pudo editar el mensaje.");
                                    }}
                                    onDelete={async (id) => {
                                        const ok = await confirmar({ title: "¿Eliminar este mensaje?", description: "Se eliminará para todas las personas del chat.", confirmText: "Eliminar", destructive: true });
                                        if (!ok) return;
                                        const hecho = await softDeleteMessage(id);
                                        if (hecho) setMessages((prev) => prev.map((mm) => (mm.id === id ? { ...mm, deleted: true, body: "" } : mm)));
                                        else toast.error("No se pudo eliminar el mensaje.");
                                    }}
                                />
                            </div>
                        );
                    })}
                </div>

                <AnimatePresence>
                    {lejosDelFinal && !loading && (
                        <motion.button
                            type="button"
                            initial={{ opacity: 0, y: 8, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.9 }}
                            transition={{ duration: reducido ? 0 : 0.18 }}
                            onClick={() => irAlFinal(true)}
                            aria-label="Ir a los mensajes más recientes"
                            className="ss-redondo absolute bottom-[92px] right-4 z-20 grid h-10 w-10 cursor-pointer place-items-center rounded-full text-white"
                            style={{ background: "rgba(12,14,34,.8)", backdropFilter: "blur(16px)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12), 0 8px 20px rgba(0,0,0,.35)" }}
                        >
                            <ChevronDown className="h-5 w-5" />
                        </motion.button>
                    )}
                </AnimatePresence>

                <ComposerHilo
                    ref={composerRef}
                    hiloId={thread.id}
                    agenteActivo={!!thread.agent?.enabled}
                    enviarConEnter={ef.enviarConEnter}
                    esMovil={esMovil}
                    respondiendoA={
                        replyTo
                            ? {
                                nombre: replyTo.kind === "agent" ? "Aurora" : nombreDe(replyTo.sender),
                                texto: replyTo.body.slice(0, 90) || replyTo.attachments[0]?.name || "",
                            }
                            : null
                    }
                    onCancelarRespuesta={() => setReplyTo(null)}
                    onEnviar={handleEnviar}
                    onPreguntarAurora={handlePreguntarAurora}
                    preguntandoAurora={asking}
                    estadoAurora={auroraStatus}
                    onEscribiendo={privacidad.mostrarEscribiendo ? sala?.anunciarEscribiendo : undefined}
                    adjuntoPendiente={pendingServerAttachment}
                    onConsumirAdjunto={onConsumePendingAttachment}
                    autoFocus={autoFocusComposer}
                />

                {arrastrando && (
                    <div className="pointer-events-none absolute inset-2 z-30 grid place-items-center rounded-3xl" style={{ background: "rgba(124,92,255,.14)", boxShadow: "inset 0 0 0 2px rgba(124,92,255,.6)" }}>
                        <span className="flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white" style={{ background: "rgba(12,14,34,.85)" }}>
                            <Paperclip className="h-4 w-4" /> Suelta para adjuntar
                        </span>
                    </div>
                )}

                <PanelInfoHilo
                    abierto={info.abierto}
                    vista={info.vista}
                    foco={info.foco}
                    onCambiarVista={(vista, foco) => setInfo((i) => ({ ...i, vista, foco }))}
                    onCerrar={() => setInfo((i) => ({ ...i, abierto: false }))}
                    thread={thread}
                    tipo={tipo}
                    titulo={titulo}
                    avatarUrl={avatar}
                    enLinea={enLinea}
                    subtitulo={subtitulo}
                    otroId={otroId}
                    perfilOtro={perfilOtro}
                    contacto={contacto}
                    miembros={miembros}
                    idsMiembros={idsMiembros}
                    presencia={presencia ?? {}}
                    esMovil={esMovil}
                    onThreadUpdated={onThreadUpdated}
                    onMiembrosCambiados={() => void listMembers(thread.id).then(setMiembros)}
                    onMensaje={() => {
                        setInfo((i) => ({ ...i, abierto: false }));
                        composerRef.current?.enfocar();
                    }}
                    onBuscar={() => {
                        setInfo((i) => ({ ...i, abierto: false }));
                        setBusqueda({ abierta: true, texto: "", indice: 0 });
                    }}
                    onSalir={onBack}
                />

                <VisorMensaje
                    mensajes={visibles.filter((m) => !m.deleted)}
                    mensajeId={visorId}
                    onNavegar={setVisorId}
                    onCerrar={() => setVisorId(null)}
                    nombreDe={(m) => (m.kind === "agent" ? "Aurora" : nombreDe(m.sender))}
                    miUid={myUserId}
                    formato24h={ef.apariencia.formato24h}
                    onIrAlMensaje={irAlMensaje}
                />

                {!esGrupo && otroId && (
                    <EditorContacto
                        open={editorContacto}
                        onOpenChange={setEditorContacto}
                        inicial={{
                            nombre: perfilOtro?.displayName || perfilOtro?.username || titulo,
                            userId: otroId,
                            username: perfilOtro?.username ?? null,
                            perfil: perfilOtro
                                ? { nombre: perfilOtro.displayName, avatarUrl: perfilOtro.avatarUrl, bio: perfilOtro.bio, tomada: new Date().toISOString() }
                                : null,
                            origen: "starseed",
                        }}
                        onGuardado={(c) => toast.success(`«${c.nombre}» ya está en tus contactos`)}
                    />
                )}
            </div>
        </ContextoHilo.Provider>
    );
}

export default ThreadView;
