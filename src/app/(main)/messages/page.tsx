"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Mensajes (/messages) — reconstruido sobre backend real
 * ---------------------------------------------------------------------------
 * DMs y grupos estilo WhatsApp/Telegram sobre `os_dm_threads/os_dm_members/
 * os_dm_messages` (ver src/lib/messages/dm.ts). Aurora opcional por hilo.
 * Conmutador Mensajes ↔ Correos (buzón interno @star.seed) conservado.
 *
 * (2026-09-28) Marco premium de cristal: barra superior (Mensajes | Correos,
 * modo enfoque, ajustes de la sección), dos paneles en escritorio y pantallas
 * apiladas con deslizamiento en móvil (un solo árbol montado). En modo enfoque
 * la lista se recoge y el chat o el correo usan todo el ancho; Esc sale y la
 * elección se recuerda. Se montan aquí, una vez, el latido de presencia y la
 * capa global de llamadas. Deep-links `?to=<@>`, `?attachServer=<slug>` y
 * `?ajustes=<sección>`.
 *
 * SOP: architecture/libreria-biblioteca-sync.md §8.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2, MessageSquare, SquarePen, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import { CorreosPanel } from "@/components/messages/correos-panel";
import { ThreadList, threadTitle } from "@/components/messages/dm/thread-list";
import { ThreadView } from "@/components/messages/dm/thread-view";
import { NewChatDialog } from "@/components/messages/dm/new-chat-dialog";
import dynamic from "next/dynamic";
import type { SeccionAjustesMensajeria } from "@/components/messages/ajustes/ajustes-mensajeria";
import { BarraSuperior, type SuperficieMensajes } from "@/components/messages/marco/barra-superior";
import { MarcoDosPaneles } from "@/components/messages/marco/marco-dos-paneles";
import { ProveedorNombresHilos, useNombresHilos } from "@/components/messages/marco/nombres-hilos";
import { useEnfoque } from "@/components/messages/marco/use-enfoque";
import { useEsMovil } from "@/components/messages/marco/use-es-movil";
import { aplicarAuroraPorDefecto } from "@/components/messages/marco/aurora-por-defecto";
import { companeroDm, esSolicitud } from "@/components/messages/marco/filtros-lista";
import { describirSilencio } from "@/components/messages/marco/formato-tiempo";
import { ACENTO, pildoraFantasma } from "@/components/messages/marco/estilos";
import { useAjustesMensajeria } from "@/lib/mensajeria/ajustes-store";
import { useContactos } from "@/lib/contactos/store";
import {
    createDm, listThreads, markRead, subscribeThreadsList, type DmAttachment, type DmThreadSummary,
} from "@/lib/messages/dm";
import {
    seedMyProfile, fetchProfilesByIds, fetchProfileByUsername, type OsProfile,
} from "@/lib/social/os-profiles";
const AjustesMensajeriaDialog = dynamic(() => import("@/components/messages/ajustes/ajustes-mensajeria").then((m) => m.AjustesMensajeriaDialog), { ssr: false });

const SECCIONES_VALIDAS: SeccionAjustesMensajeria[] = ["chats", "privacidad", "notificaciones", "correos", "aurora", "personalizados"];

function EmptyThreadState({ onNuevo }: { onNuevo: () => void }) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-3xl" style={pildoraFantasma(ACENTO.mensajes)}>
                <MessageSquare className="h-7 w-7 text-white/85" />
            </span>
            <p className="text-[15px] font-medium text-white/85">Elige una conversación</p>
            <p className="max-w-xs text-[13px] text-white/55">O empieza una nueva con alguien de tu libreta o de la red.</p>
            <button
                type="button"
                onClick={onNuevo}
                className="ss-redondo mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white transition-transform duration-150 hover:scale-[1.03]"
                style={pildoraFantasma(ACENTO.mensajes)}
            >
                <SquarePen className="h-4 w-4" /> Nuevo chat
            </button>
        </div>
    );
}

/* ── Estado del deep-link `?to=<handle>` (Adenda 63 · P-4) ─────────────────
   Honesto: mientras resuelve el perfil se avisa; si el @ no existe (o eres tú
   mismo, o no hay sesión) se muestra un aviso descartable — nunca un crash. */
type DeepLink =
    | { state: "idle" }
    | { state: "resolving"; handle: string }
    | { state: "error"; message: string };

function DeepLinkBanner({ deepLink, onDismiss }: { deepLink: DeepLink; onDismiss: () => void }) {
    if (deepLink.state === "idle") return null;
    const resolving = deepLink.state === "resolving";
    return (
        <div className="shrink-0 px-3 pb-2 sm:px-4">
            <div
                role="status"
                className="flex items-center gap-2 rounded-2xl px-3.5 py-2 text-[13px] text-white/85"
                style={pildoraFantasma(resolving ? ACENTO.mensajes : ACENTO.ambar)}
            >
                {resolving ? (
                    <>
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                        <span className="min-w-0 flex-1">Abriendo tu conversación con @{deepLink.handle}…</span>
                    </>
                ) : (
                    <>
                        <AlertTriangle className="h-4 w-4 shrink-0 text-[#FFBF00]" />
                        <span className="min-w-0 flex-1">{deepLink.message}</span>
                        <button
                            type="button"
                            onClick={onDismiss}
                            aria-label="Descartar aviso"
                            className="ss-redondo grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full transition-colors hover:bg-white/10"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

function MessagesContent() {
    const searchParams = useSearchParams();
    const esMovil = useEsMovil();
    const { enfocado, alternar: alternarEnfoque } = useEnfoque();
    const aj = useAjustesMensajeria();
    const libreta = useContactos();
    const { registrar } = useNombresHilos();

    const [surface, setSurface] = useState<SuperficieMensajes>("chats");
    const [userId, setUserId] = useState<string | null>(null);
    const [authReady, setAuthReady] = useState(false);
    const [threads, setThreads] = useState<DmThreadSummary[]>([]);
    const [profiles, setProfiles] = useState<Record<string, OsProfile>>({});
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [newChatOpen, setNewChatOpen] = useState(false);
    const [mobileView, setMobileView] = useState<"list" | "thread">("list");
    const [pendingServerAttachment, setPendingServerAttachment] = useState<DmAttachment | null>(null);
    const [deepLink, setDeepLink] = useState<DeepLink>({ state: "idle" });
    const [focusComposer, setFocusComposer] = useState(false);
    const [ajustesAbiertos, setAjustesAbiertos] = useState(false);
    const [seccionAjustes, setSeccionAjustes] = useState<SeccionAjustesMensajeria | undefined>(undefined);
    const [lectorCorreoAbierto, setLectorCorreoAbierto] = useState(false);
    /** @handle ya procesado (evita recrear/reabrir en cada render o realtime). */
    const handledToRef = useRef<string | null>(null);
    /** Ajustes más recientes para decisiones dentro de callbacks estables. */
    const ajRef = useRef(aj);
    ajRef.current = aj;

    // Usuario actual + siembra del perfil propio en el directorio.
    useEffect(() => {
        (async () => {
            try {
                const supabase = createClient();
                const { data } = await supabase.auth.getUser();
                setUserId(data.user?.id ?? null);
            } catch {
                setUserId(null);
            } finally {
                setAuthReady(true);
            }
            void seedMyProfile();
        })();
    }, []);

    const reloadThreads = useCallback(async () => {
        const rows = await listThreads();
        setThreads(rows);
        const allMemberIds = Array.from(new Set(rows.flatMap((t) => t.memberIds)));
        if (allMemberIds.length) {
            const fetched = await fetchProfilesByIds(allMemberIds);
            setProfiles((prev) => ({ ...prev, ...fetched }));
        }
        setLoading(false);
        // Selección por defecto SOLO si no hay ninguna: actualización funcional
        // para no leer un `selectedId` obsoleto (este callback tiene deps []; con
        // la lectura directa, cada recarga realtime saltaba al primer hilo y
        // pisaba la selección del deep-link `?to=`). Nunca un archivado ni un
        // restringido: esos solo se abren a propósito.
        setSelectedId((cur) => {
            if (cur) return cur;
            const primero = rows.find((t) => {
                const ef = ajRef.current.efectivos(t.id, t.kind === "group" ? "grupo" : "dm");
                return !ef.archivado && !ef.restringido;
            });
            return primero?.id ?? null;
        });
    }, []);

    useEffect(() => {
        setLoading(true);
        void reloadThreads();
    }, [reloadThreads]);

    useEffect(() => subscribeThreadsList(() => void reloadThreads()), [reloadThreads]);

    // Deep-link ?attachServer=<slug> → prepara un adjunto de servidor para el
    // hilo activo.
    useEffect(() => {
        const slug = searchParams?.get("attachServer");
        if (!slug) return;
        setPendingServerAttachment({ kind: "server", name: slug, refKind: "server", refId: slug, route: `/servidores-apps?panel=${encodeURIComponent(slug)}` });
    }, [searchParams]);

    // Deep-link ?ajustes=<sección> → abre los Ajustes de Mensajería en esa sección.
    useEffect(() => {
        const s = searchParams?.get("ajustes");
        if (!s) return;
        setSeccionAjustes(SECCIONES_VALIDAS.includes(s as SeccionAjustesMensajeria) ? (s as SeccionAjustesMensajeria) : undefined);
        setAjustesAbiertos(true);
    }, [searchParams]);

    // ── Deep-link ?to=<handle> (Adenda 63 · P-4) ────────────────────────────
    // Resuelve el @ en el directorio (os_profiles), abre el DM existente con esa
    // persona o crea uno nuevo (createDm ya reutiliza el hilo 1:1 si existe) y
    // enfoca el compositor. Idempotente: `handledToRef` impide reprocesarlo.
    const toHandle = (searchParams?.get("to") ?? "").trim().replace(/^@+/, "");

    useEffect(() => {
        if (!toHandle || !authReady) return;
        if (handledToRef.current === toHandle) return;
        handledToRef.current = toHandle;

        if (!userId) {
            setDeepLink({ state: "error", message: `Inicia sesión para escribir a @${toHandle}.` });
            return;
        }

        let alive = true;
        (async () => {
            setSurface("chats");
            setDeepLink({ state: "resolving", handle: toHandle });

            const profile = await fetchProfileByUsername(toHandle);
            if (!alive) return;
            if (!profile) {
                setDeepLink({ state: "error", message: `No encontramos a @${toHandle} en el directorio. Puede que el @ haya cambiado o que esa cuenta no aparezca en búsquedas.` });
                return;
            }
            if (profile.userId === userId) {
                setDeepLink({ state: "error", message: "Ese eres tú: no puedes abrir una conversación contigo mismo." });
                return;
            }

            setProfiles((prev) => ({ ...prev, [profile.userId]: profile }));

            const res = await createDm(profile.userId);
            if (!alive) return;
            if (!res.ok || !res.thread) {
                setDeepLink({
                    state: "error",
                    message: res.needsAuth
                        ? `Inicia sesión para escribir a @${toHandle}.`
                        : `No se pudo abrir la conversación con @${toHandle}. Inténtalo de nuevo.`,
                });
                return;
            }
            await aplicarAuroraPorDefecto(res.thread, ajRef.current.ajustes.aurora);

            await reloadThreads();
            if (!alive) return;
            setSelectedId(res.thread.id);
            setMobileView("thread");
            setFocusComposer(true);
            setDeepLink({ state: "idle" });
        })();

        return () => { alive = false; };
    }, [toHandle, authReady, userId, reloadThreads]);

    const selectedThread = threads.find((t) => t.id === selectedId) ?? null;

    // Perfiles de los miembros del chat abierto (ThreadView los fusiona con los suyos).
    const perfilesMiembros = useMemo(() => {
        if (!selectedThread) return {};
        const out: Record<string, OsProfile> = {};
        for (const id of selectedThread.memberIds) if (profiles[id]) out[id] = profiles[id];
        return out;
    }, [selectedThread, profiles]);

    // Nombres de los chats para «Chats personalizados» de los Ajustes.
    useEffect(() => {
        if (!threads.length) return;
        const entradas: Record<string, { nombre: string; tipo: "dm" | "grupo" }> = {};
        for (const t of threads) {
            const tipo = t.kind === "group" ? "grupo" : "dm";
            const apodo = aj.ajustes.hilos[t.id]?.apodo;
            const otro = companeroDm(t, userId);
            const c = otro ? libreta.porUserId(otro) : undefined;
            entradas[t.id] = { nombre: apodo || (c ? c.apodo || c.nombre : threadTitle(t, profiles, userId)), tipo };
        }
        registrar(entradas);
    }, [threads, profiles, userId, aj.ajustes.hilos, libreta, registrar]);

    // No leídos para la pastilla de «Mensajes»: sin archivados, restringidos, silenciados ni solicitudes.
    const noLeidosChats = useMemo(() => {
        const escribirme = aj.ajustes.privacidad.escribirme;
        return threads.reduce((n, t) => {
            if (t.unreadCount <= 0) return n;
            const ef = aj.efectivos(t.id, t.kind === "group" ? "grupo" : "dm");
            const propio = aj.ajustes.hilos[t.id]?.notificaciones;
            const silenciado = !!describirSilencio(propio?.silencioHasta ?? null) || propio?.activas === false;
            if (ef.archivado || ef.restringido || silenciado) return n;
            if (esSolicitud(t, userId, escribirme, (uid) => !!libreta.porUserId(uid))) return n;
            return n + t.unreadCount;
        }, 0);
    }, [threads, aj, userId, libreta]);

    const selectThread = useCallback((threadId: string) => {
        setSelectedId(threadId);
        setFocusComposer(false);
        setMobileView("thread");
        setThreads((prev) => prev.map((t) => (t.id === threadId && t.unreadCount ? { ...t, unreadCount: 0 } : t)));
    }, []);

    const handleThreadCreated = (threadId: string) => {
        void reloadThreads().then(() => {
            setSelectedId(threadId);
            setMobileView("thread");
            setFocusComposer(true);
        });
    };

    const handleThreadUpdated = (updated: DmThreadSummary) => {
        setThreads((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    };

    const marcarLeido = useCallback((threadId: string) => {
        setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unreadCount: 0 } : t)));
        void markRead(threadId);
    }, []);

    const iniciarChat = useCallback(async (otroId: string) => {
        const res = await createDm(otroId);
        if (res.needsAuth) {
            toast.error("Inicia sesión para escribir a alguien.");
            return;
        }
        if (!res.ok || !res.thread) {
            toast.error(res.error || "No se pudo iniciar la conversación.");
            return;
        }
        await aplicarAuroraPorDefecto(res.thread, ajRef.current.ajustes.aurora);
        handleThreadCreated(res.thread.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const abrirAjustes = useCallback((seccion?: SeccionAjustesMensajeria) => {
        setSeccionAjustes(seccion);
        setAjustesAbiertos(true);
    }, []);

    const puedeEnfocar = surface === "chats" ? !!selectedThread : lectorCorreoAbierto;
    // En móvil, con un chat o un correo abierto, la pantalla es suya entera (su cabecera ya
    // trae «volver»): la barra de la sección se aparta para que el compositor se vea completo.
    const detalleMovilAbierto = esMovil && (surface === "chats" ? mobileView === "thread" && !!selectedThread : lectorCorreoAbierto);

    return (
        <div
            className={cn(
                "relative flex h-[100dvh] flex-col overflow-hidden",
                "bg-[radial-gradient(120%_80%_at_0%_0%,rgba(124,92,255,0.13),transparent_55%),radial-gradient(90%_70%_at_100%_100%,rgba(0,127,255,0.09),transparent_60%)]",
            )}
            data-enfocado={enfocado ? "si" : "no"}
        >
            {/* Capas globales de la sección: una sola vez. */}

            <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} onCreated={handleThreadCreated} />
            <AjustesMensajeriaDialog open={ajustesAbiertos} onOpenChange={setAjustesAbiertos} seccionInicial={seccionAjustes} />

            {!detalleMovilAbierto && (
                <BarraSuperior
                    superficie={surface}
                    onCambiarSuperficie={setSurface}
                    onAbrirAjustes={() => abrirAjustes(surface === "mail" ? "correos" : undefined)}
                    enfocado={enfocado}
                    onAlternarEnfoque={alternarEnfoque}
                    puedeEnfocar={puedeEnfocar}
                    esMovil={esMovil}
                    noLeidosChats={noLeidosChats}
                />
            )}

            <DeepLinkBanner deepLink={deepLink} onDismiss={() => setDeepLink({ state: "idle" })} />

            <div className="min-h-0 flex-1">
                {surface === "chats" ? (
                    <MarcoDosPaneles
                        esMovil={esMovil}
                        enfocado={enfocado && !!selectedThread}
                        verDetalle={mobileView === "thread" && !!selectedThread}
                        claveDetalle={selectedThread?.id ?? "vacio"}
                        etiquetaLista="Lista de chats"
                        etiquetaDetalle="Chat abierto"
                        lista={
                            <ThreadList
                                threads={threads}
                                profiles={profiles}
                                myUserId={userId}
                                selectedId={selectedId}
                                onSelect={(t) => selectThread(t.id)}
                                onNewChat={() => setNewChatOpen(true)}
                                onMarcarLeido={marcarLeido}
                                onIniciarChat={(uid) => void iniciarChat(uid)}
                                loading={loading}
                                className="flex-1 min-h-0"
                            />
                        }
                        detalle={
                            selectedThread ? (
                                <ThreadView
                                    thread={selectedThread}
                                    myUserId={userId}
                                    onBack={esMovil ? () => setMobileView("list") : undefined}
                                    onThreadUpdated={handleThreadUpdated}
                                    pendingServerAttachment={pendingServerAttachment}
                                    onConsumePendingAttachment={() => setPendingServerAttachment(null)}
                                    autoFocusComposer={focusComposer}
                                    perfilesMiembros={perfilesMiembros}
                                    enfocado={enfocado}
                                    onAlternarEnfoque={esMovil ? undefined : alternarEnfoque}
                                />
                            ) : (
                                <EmptyThreadState onNuevo={() => setNewChatOpen(true)} />
                            )
                        }
                    />
                ) : (
                    <CorreosPanel
                        userId={userId}
                        enfocado={enfocado}
                        onAlternarEnfoque={alternarEnfoque}
                        onAbrirAjustes={() => abrirAjustes("correos")}
                        onLectorAbierto={setLectorCorreoAbierto}
                    />
                )}
            </div>
        </div>
    );
}

/**
 * `useSearchParams` exige un boundary de Suspense en el App Router (si no, el
 * build falla con "should be wrapped in a suspense boundary"). Regla del repo:
 * componente interno con los hooks + export por defecto que lo envuelve.
 */
export default function MessagesPage() {
    return (
        <Suspense
            fallback={
                <div className="flex h-[100dvh] items-center justify-center text-sm text-white/60">
                    Cargando tus mensajes…
                </div>
            }
        >
            <ProveedorNombresHilos>
                <MessagesContent />
            </ProveedorNombresHilos>
        </Suspense>
    );
}
