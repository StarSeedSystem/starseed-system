"use client";

// src/components/browser/browser-windows.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Navegador de StarSeed — espacio de trabajo de ventanas y pestañas.
//
// Es un GESTOR de ventanas (no un motor de navegador): guarda ventanas en
// Supabase (`browser_windows`), las agrupa por GRUPO y por CARPETA (colapsables),
// y permite operarlas: abrir (iframe sandbox con fallback), suspender/reanudar,
// modo widget (flotante pequeño), multivista (varios iframes en mosaico),
// pantalla completa, mover/redimensionar (persistido en `state`), asignar
// grupo/carpeta, guardar, compartir (shareRef → portapapeles) y adjuntar a la
// pizarra/publicación. Los sitios no incrustables muestran un botón claro
// "abrir en pestaña nueva".
//
// INTERCONEXIÓN (puente `@/lib/share/bridge`):
//   · «Adjuntar a pizarra»     → emitAttach({kind:'window', url}) para que una
//                                pizarra abierta lo materialice como bloque
//                                `browser`. (También se mantiene el evento propio
//                                `starseed:attach-window` del lib de navegador.)
//   · «Adjuntar a publicación» → openComposer({type:'enlace',format:'embed',
//                                content:{url}}) (lo hospeda la pizarra/board); y
//                                como FALLBACK local, esta tarjeta monta su propio
//                                Dialog con <PublicationComposer initial={…}/>.
//
// Astraura/Aurora puede conducir la navegación REAL vía la extensión
// Claude-in-Chrome — se expone una tarjeta explicativa y la acción "Pedir a
// Astraura que navegue" (emite `starseed:astraura-browse`).
//
// SSR-SAFE: todo acceso a window/iframe ocurre en efectos/handlers.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import PublicationComposer from "@/components/publish/publication-composer";
import { emitAttach, openComposer } from "@/lib/share/bridge";
import {
    Globe,
    Plus,
    Search,
    Pause,
    Play,
    Layout,
    Maximize2,
    Minimize2,
    Boxes,
    FolderInput,
    Tags,
    Save,
    Share2,
    Paperclip,
    Send,
    ExternalLink,
    Trash2,
    ChevronDown,
    ChevronRight,
    Sparkles,
    X,
    RefreshCw,
    AlertTriangle,
    Glasses,
    Link2,
    Settings,
    ShieldCheck,
    ArrowUpRight,
} from "lucide-react";
import {
    listWindows,
    newWindow,
    saveWindow,
    deleteWindow,
    setSuspended,
    setVrAr,
    setView,
    setFolder,
    setGroup,
    setGeometry,
    groupsAndFolders,
    isLikelyEmbeddable,
    urlHost,
    shareRef,
    requestAstrauraBrowse,
    emitAttachWindow,
    NO_GROUP,
    NO_FOLDER,
    type BrowserWindow,
    type WindowView,
} from "@/lib/browser/browser";
import {
    renderUrl,
    openLink,
    classifyLink,
    hasProxyConfigured,
    normalizeUrl,
    type LinkKind,
} from "@/lib/browser/browser";
import { recordVisit } from "@/lib/browser/browser-settings";
import { useRealtime } from "@/lib/realtime/realtime";
import BrowserConfig from "@/components/browser/browser-config";
import VrArFrame from "@/components/browser/vr-frame";
import { useRouter } from "next/navigation";

// ── Utilidades de presentación ──

const VIEW_LABEL: Record<WindowView, string> = {
    window: "Ventana",
    widget: "Widget",
    fullscreen: "Pantalla completa",
    tab: "Pestaña",
};

const SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups";

function openInTab(url: string) {
    if (typeof window === "undefined" || !url) return;
    window.open(url, "_blank", "noopener,noreferrer");
}

async function copyToClipboard(text: string): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.clipboard) return false;
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Iframe con detección de fallback
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renderiza un iframe sandbox. Si el host es conocido-bloqueante, o si la carga
 * falla / no completa en el plazo, muestra el aviso de fallback con el botón
 * "abrir en pestaña nueva". No podemos leer las cabeceras del servidor desde el
 * cliente (CORS), así que combinamos heurística + evento onLoad + timeout.
 */
function EmbeddedFrame({
    url,
    title,
    className,
}: {
    url: string;
    title: string;
    className?: string;
}) {
    // Enruta la carga por el proxy/render tri-fuente del dominio "browser" si hay
    // uno configurado. Con proxy NO pre-bloqueamos (el proxy puede renderizar
    // sitios que rechazan el iframe directo).
    const target = useMemo(() => renderUrl(url), [url]);
    const verdict = useMemo(
        () => (target.proxied ? ("try" as const) : isLikelyEmbeddable(url)),
        [url, target.proxied],
    );
    const [blocked, setBlocked] = useState(verdict === false);
    const [loaded, setLoaded] = useState(false);
    const [nonce, setNonce] = useState(0);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Reinicia el estado cuando cambia la URL o se fuerza recarga.
    useEffect(() => {
        const v = target.proxied ? "try" : isLikelyEmbeddable(url);
        setBlocked(v === false);
        setLoaded(false);
        if (timer.current) clearTimeout(timer.current);
        // Si en ~6s no hubo onLoad (típico de X-Frame-Options que aborta en silencio),
        // asumimos bloqueo y mostramos el fallback. Solo cuando no era "false" ya.
        if (v !== false) {
            timer.current = setTimeout(() => {
                setLoaded((done) => {
                    if (!done) setBlocked(true);
                    return done;
                });
            }, 6000);
        }
        return () => {
            if (timer.current) clearTimeout(timer.current);
        };
    }, [url, nonce, target.proxied]);

    if (!url) {
        return (
            <div className={cn("grid place-items-center text-white/40 text-sm", className)}>
                Sin URL
            </div>
        );
    }

    if (blocked) {
        return (
            <div
                className={cn(
                    "flex flex-col items-center justify-center gap-3 p-6 text-center",
                    className,
                )}
            >
                <AlertTriangle className="h-6 w-6 text-amber-300/80" />
                <p className="text-sm text-white/70 max-w-xs">
                    Este sitio no permite incrustarse (bloquea el embebido por seguridad).
                    {!hasProxyConfigured() && " Configura un servidor de proxy/render para incrustarlo."}
                </p>
                <p className="text-[11px] text-white/40 break-all max-w-xs">{url}</p>
                <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => openInTab(url)}>
                        <ExternalLink className="h-4 w-4" /> Abrir en ventana externa
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                            setBlocked(false);
                            setNonce((n) => n + 1);
                        }}
                    >
                        <RefreshCw className="h-4 w-4" /> Reintentar
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className={cn("relative", className)}>
            {target.proxied && (
                <span className="absolute right-1 top-1 z-10 rounded bg-cyan-500/20 px-1.5 py-0.5 text-[9px] text-cyan-100">
                    vía proxy{target.source ? ` · ${target.source}` : ""}
                </span>
            )}
            {!loaded && (
                <div className="absolute inset-0 grid place-items-center text-white/30 text-xs">
                    Cargando…
                </div>
            )}
            <iframe
                key={nonce}
                src={target.rendered}
                title={title}
                sandbox={SANDBOX}
                referrerPolicy="no-referrer"
                loading="lazy"
                className="h-full w-full rounded-lg border-0 bg-white/[0.02]"
                onLoad={() => {
                    setLoaded(true);
                    if (timer.current) clearTimeout(timer.current);
                }}
                onError={() => setBlocked(true)}
            />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tarjeta de ventana
// ─────────────────────────────────────────────────────────────────────────────

function WindowCard({
    w,
    onChanged,
    onOpenFull,
    onOpenVr,
    onToggleMulti,
    inMulti,
}: {
    w: BrowserWindow;
    onChanged: () => void;
    onOpenFull: (w: BrowserWindow) => void;
    onOpenVr: (w: BrowserWindow) => void;
    onToggleMulti: (id: string) => void;
    inMulti: boolean;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [editMeta, setEditMeta] = useState(false);
    const [group, setGroupVal] = useState(w.groupName);
    const [folder, setFolderVal] = useState(w.folder);
    // Dialog local de publicación (fallback cuando no hay pizarra hospedando el
    // compositor): se abre al «adjuntar a publicación».
    const [publishOpen, setPublishOpen] = useState(false);

    const host = urlHost(w.url) || w.url;
    const isWidget = w.state.view === "widget";

    const guard = useCallback(
        async (fn: () => Promise<{ ok: boolean; needsAuth?: boolean; error?: string }>, okMsg?: string) => {
            setBusy(true);
            try {
                const r = await fn();
                if (r.needsAuth) {
                    toast.error("Inicia sesión para guardar ventanas en tu cuenta.");
                } else if (!r.ok) {
                    toast.error(r.error || "No se pudo completar la acción.");
                } else if (okMsg) {
                    toast.success(okMsg);
                }
                if (r.ok) onChanged();
            } finally {
                setBusy(false);
            }
        },
        [onChanged],
    );

    async function toggleSuspend() {
        await guard(
            () => setSuspended(w.id, !w.suspended),
            w.suspended ? "Ventana reanudada" : "Ventana suspendida",
        );
        if (!w.suspended) setOpen(false);
    }

    async function changeView(view: WindowView) {
        await guard(() => setView(w.id, view));
    }

    async function saveMeta() {
        await guard(async () => {
            const g = await setGroup(w.id, group);
            if (!g.ok) return g;
            return setFolder(w.id, folder);
        }, "Grupo y carpeta guardados");
        setEditMeta(false);
    }

    async function persistAsSaved() {
        // "Guardar" explícito: re-persiste la ventana (touch updated_at) como confirmación.
        await guard(
            () =>
                saveWindow({
                    id: w.id,
                    url: w.url,
                    name: w.name,
                    groupName: w.groupName,
                    folder: w.folder,
                    state: w.state,
                    suspended: w.suspended,
                    vrAr: w.vrAr,
                }),
            "Ventana guardada",
        );
    }

    async function remove() {
        await guard(() => deleteWindow(w.id), "Ventana eliminada");
    }

    async function share() {
        const ref = shareRef(w);
        const ok = await copyToClipboard(JSON.stringify(ref, null, 2));
        toast[ok ? "success" : "error"](
            ok ? "Referencia copiada al portapapeles" : "No se pudo copiar la referencia",
        );
    }

    // Adjuntar a PIZARRA: emite por el puente compartido `starseed:attach`
    // ({kind:'window', url}) para que una pizarra abierta lo añada como bloque
    // `browser`. Mantenemos además el evento propio del navegador
    // (`starseed:attach-window`) por compatibilidad con otros oyentes.
    function attach() {
        const okBridge = emitAttach({
            kind: "window",
            url: w.url,
            title: w.name,
            data: { host: urlHost(w.url), group: w.groupName || "", folder: w.folder || "" },
        });
        emitAttachWindow(w); // compat: evento heredado del lib de navegador
        toast[okBridge ? "success" : "error"](
            okBridge
                ? "Ventana enviada a la pizarra"
                : "No disponible en este contexto",
        );
    }

    // Adjuntar a PUBLICACIÓN: pide abrir el compositor universal vía el puente
    // (lo hospeda la pizarra/board) y, como fallback, abre un Dialog local con
    // <PublicationComposer/> prerellenado (tipo `enlace`, formato `embed`).
    function attachToPublication() {
        openComposer({ type: "enlace", format: "embed", content: { url: w.url } });
        setPublishOpen(true);
    }

    function askAstraura() {
        const ok = requestAstrauraBrowse(w.url, `Navega y resume: ${w.name}`);
        toast[ok ? "success" : "error"](
            ok
                ? "Astraura recibió la petición de navegar (vía Claude-in-Chrome)"
                : "No disponible en este contexto",
        );
    }

    // Abre/cierra la vista incrustada y registra la visita real en el historial.
    function toggleOpen() {
        setOpen((o) => {
            const next = !o;
            if (next && !w.suspended) void recordVisit(w.url, w.name);
            return next;
        });
    }

    // "Abrir enlace" funcional: clasifica el destino y lo abre con el mecanismo
    // correcto — ruta interna de la OS (router.push), otro sistema StarSeed o URL
    // externa (window.open nueva ventana/pestaña real). Registra historial.
    function openExternalLink() {
        const { kind, opened } = openLink(w.url, { router });
        if (opened) {
            void recordVisit(w.url, w.name);
            const label: Record<LinkKind, string> = {
                internal: "Abriendo ruta interna de StarSeed",
                starseed: "Abriendo sistema StarSeed en ventana nueva",
                external: "Abierto en ventana/pestaña nueva del navegador",
            };
            toast.success(label[kind]);
        } else {
            toast.error("No disponible en este contexto");
        }
    }

    // Abre en pestaña externa real y registra la visita.
    function openTabTracked() {
        openInTab(w.url);
        void recordVisit(w.url, w.name);
    }

    // Abre la ventana en el marco inmersivo VR/AR.
    function openVr() {
        onOpenVr(w);
        void recordVisit(w.url, w.name);
    }

    const linkKind = classifyLink(w.url);

    return (
        <div
            className={cn(
                "rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-colors",
                "hover:border-white/20",
                isWidget && "max-w-xs",
                inMulti && "ring-1 ring-cyan-400/50",
            )}
        >
            {/* Cabecera */}
            <div className="flex items-start gap-3">
                <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-500/10 text-cyan-200">
                    <Globe className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-amber-50">{w.name}</p>
                        {w.suspended && (
                            <Badge variant="outline" className="border-amber-400/40 text-amber-200/80">
                                suspendida
                            </Badge>
                        )}
                        <Badge variant="outline" className="border-white/15 text-white/50">
                            {VIEW_LABEL[w.state.view]}
                        </Badge>
                        {linkKind === "starseed" && (
                            <Badge variant="outline" className="border-violet-400/40 text-violet-200/80">
                                StarSeed
                            </Badge>
                        )}
                        {linkKind === "internal" && (
                            <Badge variant="outline" className="border-emerald-400/40 text-emerald-200/80">
                                interno
                            </Badge>
                        )}
                        {w.vrAr && (
                            <Badge variant="outline" className="border-indigo-400/40 text-indigo-200/80">
                                VR/AR
                            </Badge>
                        )}
                    </div>
                    <p className="truncate text-xs text-white/40">{host}</p>
                    {(w.groupName || w.folder) && (
                        <div className="mt-1 flex flex-wrap gap-1">
                            {w.groupName && (
                                <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-200/80">
                                    grupo · {w.groupName}
                                </span>
                            )}
                            {w.folder && (
                                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200/80">
                                    carpeta · {w.folder}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Vista incrustada */}
            {open && !w.suspended && (
                <div className="mt-3">
                    <EmbeddedFrame
                        url={w.url}
                        title={w.name}
                        className={cn(
                            "w-full overflow-hidden rounded-lg bg-black/20",
                            isWidget ? "h-40" : "h-72",
                        )}
                    />
                </div>
            )}
            {open && w.suspended && (
                <div className="mt-3 rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-white/40">
                    Ventana suspendida — reanúdala para cargar el contenido.
                </div>
            )}

            {/* Acciones principales */}
            <div className="mt-3 flex flex-wrap gap-1.5">
                <Button
                    size="sm"
                    variant={open ? "secondary" : "outline"}
                    onClick={toggleOpen}
                    disabled={busy}
                >
                    {open ? <Minimize2 className="h-4 w-4" /> : <Layout className="h-4 w-4" />}
                    {open ? "Cerrar" : "Abrir"}
                </Button>
                <Button size="sm" variant="outline" onClick={toggleSuspend} disabled={busy}>
                    {w.suspended ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    {w.suspended ? "Reanudar" : "Suspender"}
                </Button>
                <Button
                    size="sm"
                    variant={isWidget ? "secondary" : "outline"}
                    onClick={() => changeView(isWidget ? "window" : "widget")}
                    disabled={busy}
                    title="Modo widget (flotante pequeño)"
                >
                    <Boxes className="h-4 w-4" /> Widget
                </Button>
                <Button
                    size="sm"
                    variant={inMulti ? "secondary" : "outline"}
                    onClick={() => onToggleMulti(w.id)}
                    title="Añadir a multivista (mosaico)"
                >
                    <Layout className="h-4 w-4" /> Multivista
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onOpenFull(w)}
                    title="Pantalla completa"
                >
                    <Maximize2 className="h-4 w-4" /> Pantalla
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={openExternalLink}
                    title={
                        linkKind === "internal"
                            ? "Abrir ruta interna de StarSeed"
                            : linkKind === "starseed"
                              ? "Abrir sistema StarSeed en ventana nueva"
                              : "Abrir enlace en ventana/pestaña nueva real"
                    }
                >
                    {linkKind === "internal" ? (
                        <ArrowUpRight className="h-4 w-4" />
                    ) : (
                        <ExternalLink className="h-4 w-4" />
                    )}
                    {linkKind === "internal" ? "Ir (interno)" : "Abrir enlace"}
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={openTabTracked}
                    title="Abrir en pestaña nueva del navegador real"
                >
                    <ExternalLink className="h-4 w-4" /> Pestaña
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={openVr}
                    title="Abrir en marco inmersivo VR/AR (WebXR)"
                >
                    <Glasses className="h-4 w-4" /> VR/AR
                </Button>
            </div>

            {/* Acciones secundarias */}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setEditMeta((e) => !e)} title="Asignar grupo / carpeta">
                    <Tags className="h-4 w-4" /> Grupo/Carpeta
                </Button>
                <Button size="sm" variant="ghost" onClick={persistAsSaved} disabled={busy} title="Guardar">
                    <Save className="h-4 w-4" /> Guardar
                </Button>
                <Button size="sm" variant="ghost" onClick={share} title="Copiar referencia compartible">
                    <Share2 className="h-4 w-4" /> Compartir
                </Button>
                <Button size="sm" variant="ghost" onClick={attach} title="Adjuntar a la pizarra (añade un bloque navegador)">
                    <Paperclip className="h-4 w-4" /> Adjuntar a pizarra
                </Button>
                <Button size="sm" variant="ghost" onClick={attachToPublication} title="Adjuntar a una publicación (compositor)">
                    <Send className="h-4 w-4" /> Adjuntar a publicación
                </Button>
                <Button size="sm" variant="ghost" onClick={askAstraura} title="Pedir a Astraura que navegue (Claude-in-Chrome)">
                    <Sparkles className="h-4 w-4" /> Astraura
                </Button>
                <Button
                    size="sm"
                    variant={w.vrAr ? "secondary" : "ghost"}
                    onClick={() =>
                        guard(
                            () => setVrAr(w.id, !w.vrAr),
                            w.vrAr ? "VR/AR desactivado para esta ventana" : "VR/AR activado para esta ventana",
                        )
                    }
                    disabled={busy}
                    title="Marcar esta ventana para abrirse en VR/AR por defecto"
                >
                    <Glasses className="h-4 w-4" /> {w.vrAr ? "VR/AR ✓" : "Marcar VR/AR"}
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={remove}
                    disabled={busy}
                    className="text-rose-300/80 hover:text-rose-200"
                    title="Eliminar ventana"
                >
                    <Trash2 className="h-4 w-4" /> Eliminar
                </Button>
            </div>

            {/* Editor de grupo / carpeta */}
            {editMeta && (
                <div className="mt-2 grid grid-cols-1 gap-2 rounded-xl border border-white/10 bg-black/20 p-2 sm:grid-cols-2">
                    <div className="flex items-center gap-2">
                        <Tags className="h-4 w-4 text-purple-200/70" />
                        <Input
                            value={group}
                            onChange={(e) => setGroupVal(e.target.value)}
                            placeholder="Grupo"
                            className="h-8"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <FolderInput className="h-4 w-4 text-emerald-200/70" />
                        <Input
                            value={folder}
                            onChange={(e) => setFolderVal(e.target.value)}
                            placeholder="Carpeta"
                            className="h-8"
                        />
                    </div>
                    <div className="sm:col-span-2 flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditMeta(false)}>
                            Cancelar
                        </Button>
                        <Button size="sm" variant="secondary" onClick={saveMeta} disabled={busy}>
                            Guardar grupo/carpeta
                        </Button>
                    </div>
                </div>
            )}

            {/* Dialog local de publicación (fallback del «adjuntar a publicación») */}
            <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
                <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Adjuntar a publicación</DialogTitle>
                        <DialogDescription>
                            Publica «{w.name}» como enlace incrustado con el compositor universal.
                        </DialogDescription>
                    </DialogHeader>
                    <PublicationComposer
                        initial={{ type: "enlace", format: "embed", content: { url: w.url } } as any}
                        onPublished={() => {
                            setPublishOpen(false);
                            toast.success("Publicado");
                        }}
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sección colapsable (por grupo o por carpeta)
// ─────────────────────────────────────────────────────────────────────────────

function CollapsibleSection({
    label,
    count,
    accent,
    children,
}: {
    label: string;
    count: number;
    accent: "purple" | "emerald";
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(true);
    return (
        <section className="rounded-2xl border border-white/10 bg-white/[0.02]">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left"
            >
                {open ? (
                    <ChevronDown className="h-4 w-4 text-white/50" />
                ) : (
                    <ChevronRight className="h-4 w-4 text-white/50" />
                )}
                <span className="text-sm font-medium text-amber-50">{label}</span>
                <Badge
                    variant="outline"
                    className={cn(
                        "ml-1",
                        accent === "purple"
                            ? "border-purple-400/30 text-purple-200/80"
                            : "border-emerald-400/30 text-emerald-200/80",
                    )}
                >
                    {count}
                </Badge>
            </button>
            {open && <div className="space-y-3 px-3 pb-3">{children}</div>}
        </section>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Overlay de pantalla completa
// ─────────────────────────────────────────────────────────────────────────────

function FullscreenOverlay({ w, onClose }: { w: BrowserWindow; onClose: () => void }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[120] flex flex-col bg-black/90 backdrop-blur-sm">
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2">
                <Globe className="h-4 w-4 text-cyan-200" />
                <p className="truncate text-sm text-amber-50">{w.name}</p>
                <span className="truncate text-xs text-white/40">{urlHost(w.url)}</span>
                <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openInTab(w.url)}>
                        <ExternalLink className="h-4 w-4" /> Pestaña
                    </Button>
                    <Button size="sm" variant="secondary" onClick={onClose}>
                        <X className="h-4 w-4" /> Cerrar
                    </Button>
                </div>
            </div>
            <EmbeddedFrame url={w.url} title={w.name} className="flex-1" />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Multivista (mosaico de iframes)
// ─────────────────────────────────────────────────────────────────────────────

function MultiView({
    windows,
    onClose,
    onRemove,
}: {
    windows: BrowserWindow[];
    onClose: () => void;
    onRemove: (id: string) => void;
}) {
    return (
        <section className="rounded-2xl border border-cyan-400/30 bg-cyan-500/[0.03] p-3">
            <div className="mb-2 flex items-center gap-2">
                <Layout className="h-4 w-4 text-cyan-200" />
                <p className="text-sm font-medium text-amber-50">Multivista</p>
                <Badge variant="outline" className="border-cyan-400/30 text-cyan-200/80">
                    {windows.length}
                </Badge>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>
                    <X className="h-4 w-4" /> Vaciar
                </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {windows.map((w) => (
                    <div key={w.id} className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
                        <div className="flex items-center gap-2 border-b border-white/10 px-2 py-1">
                            <span className="truncate text-xs text-white/60">{w.name}</span>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="ml-auto h-7 w-7 p-0"
                                onClick={() => onRemove(w.id)}
                            >
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                        <EmbeddedFrame url={w.url} title={w.name} className="h-56 w-full" />
                    </div>
                ))}
            </div>
        </section>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

export default function BrowserWindows() {
    const [windows, setWindows] = useState<BrowserWindow[]>([]);
    const [loading, setLoading] = useState(true);
    const [address, setAddress] = useState("");
    const [creating, setCreating] = useState(false);
    const [groupBy, setGroupBy] = useState<"group" | "folder">("group");
    const [multi, setMulti] = useState<string[]>([]);
    const [full, setFull] = useState<BrowserWindow | null>(null);
    const [vrWin, setVrWin] = useState<BrowserWindow | null>(null);
    const [showConfig, setShowConfig] = useState(false);
    const [newVr, setNewVr] = useState(false);
    const router = useRouter();

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const list = await listWindows();
            setWindows(list);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    // Realtime: las ventanas son owner-scoped (RLS) y la publicación realtime
    // incluye `browser_windows`; al recibir cualquier cambio propio, recargamos.
    useRealtime("browser_windows", { event: "*" }, () => {
        void refresh();
    });

    async function handleCreate(e?: React.FormEvent) {
        e?.preventDefault();
        const value = address.trim();
        if (!value) return;
        setCreating(true);
        try {
            const r = await newWindow(value, undefined, { vrAr: newVr });
            if (r.needsAuth) {
                toast.error("Inicia sesión para crear y guardar ventanas.");
            } else if (!r.ok) {
                toast.error(r.error || "No se pudo crear la ventana.");
            } else {
                toast.success("Ventana creada");
                if (r.window) {
                    void recordVisit(r.window.url, r.window.name);
                    if (newVr) setVrWin(r.window);
                }
                setAddress("");
                await refresh();
            }
        } finally {
            setCreating(false);
        }
    }

    // "Abrir enlace" desde la barra: clasifica y abre con el mecanismo correcto
    // (ruta interna -> router.push; externo / StarSeed -> window.open). No crea
    // una ventana persistida (eso es "Nueva ventana"); registra historial.
    function openAddressLink() {
        const value = address.trim();
        if (!value) {
            toast.error("Escribe una URL o ruta para abrir.");
            return;
        }
        const href = value.startsWith("/") ? value : normalizeUrl(value);
        const { kind, opened } = openLink(href, { router });
        if (opened) {
            void recordVisit(href, href);
            const label: Record<LinkKind, string> = {
                internal: "Abriendo ruta interna de StarSeed",
                starseed: "Abriendo sistema StarSeed en ventana nueva",
                external: "Abierto en ventana/pestaña nueva del navegador",
            };
            toast.success(label[kind]);
        } else {
            toast.error("No disponible en este contexto");
        }
    }

    function toggleMulti(id: string) {
        setMulti((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    }

    function askAstrauraFromBar() {
        const value = address.trim();
        if (!value) {
            toast.error("Escribe una URL o búsqueda para Astraura.");
            return;
        }
        // Normalización ligera vía newWindow no aplica aquí; usamos el texto crudo.
        const ok = requestAstrauraBrowse(value, "Navegación solicitada desde la barra del Navegador");
        toast[ok ? "success" : "error"](
            ok ? "Astraura recibió la petición (vía Claude-in-Chrome)" : "No disponible en este contexto",
        );
    }

    const grouped = useMemo(() => groupsAndFolders(windows), [windows]);
    const multiWindows = useMemo(
        () => windows.filter((w) => multi.includes(w.id)),
        [windows, multi],
    );

    const sections =
        groupBy === "group"
            ? grouped.groups.map((g) => ({ label: g, items: grouped.byGroup[g] || [] }))
            : grouped.folders.map((f) => ({ label: f, items: grouped.byFolder[f] || [] }));

    const accent = groupBy === "group" ? "purple" : ("emerald" as const);

    return (
        <div className="space-y-5">
            {/* Barra de direcciones / búsqueda */}
            <form
                onSubmit={handleCreate}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"
            >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3">
                        <Search className="h-4 w-4 shrink-0 text-white/40" />
                        <Input
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder="URL o búsqueda (DuckDuckGo)…  p. ej. wikipedia.org o «qué es el SOSD»"
                            className="border-0 bg-transparent px-0 focus-visible:ring-0"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button type="submit" disabled={creating}>
                            <Plus className="h-4 w-4" /> Nueva ventana
                        </Button>
                        <Button type="button" variant="outline" onClick={openAddressLink}>
                            <ExternalLink className="h-4 w-4" /> Abrir enlace
                        </Button>
                        <Button type="button" variant="outline" onClick={askAstrauraFromBar}>
                            <Sparkles className="h-4 w-4" /> Astraura
                        </Button>
                        <Button
                            type="button"
                            variant={showConfig ? "secondary" : "outline"}
                            onClick={() => setShowConfig((c) => !c)}
                            title="Servidores, VPN, DNS, cookies, caché, historial, VR/AR"
                        >
                            <Settings className="h-4 w-4" /> Configuración
                        </Button>
                    </div>
                </div>
                <label className="mt-2 flex w-fit items-center gap-2 text-[11px] text-white/55">
                    <input
                        type="checkbox"
                        checked={newVr}
                        onChange={(e) => setNewVr(e.target.checked)}
                        className="h-3.5 w-3.5 accent-indigo-400"
                    />
                    <Glasses className="h-3.5 w-3.5 text-indigo-300" /> Crear en modo inmersivo VR/AR
                </label>
            </form>

            {/* Panel de configuración (servidores tri-fuente + VPN/DNS/cookies/caché/historial/VR-AR) */}
            {showConfig && (
                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.03] p-4">
                    <div className="mb-3 flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-cyan-200" />
                        <h2 className="text-sm font-medium text-amber-50">
                            Configuración del navegador
                        </h2>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="ml-auto"
                            onClick={() => setShowConfig(false)}
                        >
                            <X className="h-4 w-4" /> Cerrar
                        </Button>
                    </div>
                    <BrowserConfig />
                </div>
            )}

            {/* Nota Astraura / Aurora */}
            <div className="rounded-2xl border border-purple-400/20 bg-purple-500/[0.05] p-4">
                <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-purple-500/15 text-purple-200">
                        <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="text-sm text-white/70">
                        <p className="font-medium text-amber-50">
                            Astraura / Aurora pueden navegar por ti
                        </p>
                        <p className="mt-1 text-white/55">
                            Este navegador gestiona y guarda ventanas, pero{" "}
                            <span className="text-white/80">no reemplaza un motor de navegador</span>:
                            una web no puede incrustar cualquier sitio (muchos lo bloquean con
                            X-Frame-Options / CSP). Para navegación REAL —abrir, leer y actuar en
                            cualquier sitio— Astraura conduce tu navegador a través de la extensión{" "}
                            <span className="text-white/80">Claude-in-Chrome</span>. Usa{" "}
                            <span className="text-purple-200">«Astraura»</span> en la barra o en cada
                            ventana para pedirle que navegue (emite{" "}
                            <code className="rounded bg-black/30 px-1 text-[11px]">
                                starseed:astraura-browse
                            </code>
                            ).
                        </p>
                        <p className="mt-2 text-white/55">
                            También puedes activar uno o varios{" "}
                            <span className="text-white/80">servidores del navegador</span> (personal /
                            StarSeed / externo) en{" "}
                            <span className="text-cyan-200">«Configuración»</span>: con un proxy/render
                            configurado, los sitios que bloquean el iframe se cargan a través de él.
                            Sin servidor (ni extensión/app de escritorio), el navegador los abre en una{" "}
                            <span className="text-white/80">ventana externa real</span>.
                        </p>
                    </div>
                </div>
            </div>

            {/* Controles de agrupación */}
            <div className="flex items-center gap-2">
                <span className="text-xs text-white/40">Agrupar por</span>
                <div className="inline-flex overflow-hidden rounded-full border border-white/10">
                    <button
                        type="button"
                        onClick={() => setGroupBy("group")}
                        className={cn(
                            "px-3 py-1 text-xs transition-colors",
                            groupBy === "group"
                                ? "bg-purple-500/20 text-purple-100"
                                : "text-white/50 hover:text-white/80",
                        )}
                    >
                        Grupo
                    </button>
                    <button
                        type="button"
                        onClick={() => setGroupBy("folder")}
                        className={cn(
                            "px-3 py-1 text-xs transition-colors",
                            groupBy === "folder"
                                ? "bg-emerald-500/20 text-emerald-100"
                                : "text-white/50 hover:text-white/80",
                        )}
                    >
                        Carpeta
                    </button>
                </div>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={refresh} disabled={loading}>
                    <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Actualizar
                </Button>
            </div>

            {/* Multivista activa */}
            {multiWindows.length > 0 && (
                <MultiView
                    windows={multiWindows}
                    onClose={() => setMulti([])}
                    onRemove={toggleMulti}
                />
            )}

            {/* Listado por secciones */}
            {loading ? (
                <div className="grid place-items-center rounded-2xl border border-white/10 bg-white/[0.02] py-16 text-sm text-white/40">
                    Cargando ventanas…
                </div>
            ) : windows.length === 0 ? (
                <div className="grid place-items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-16 text-center">
                    <Globe className="h-8 w-8 text-white/20" />
                    <p className="text-sm text-white/50">
                        Aún no tienes ventanas. Crea una desde la barra de arriba.
                    </p>
                    <p className="max-w-md text-xs text-white/35">
                        Las ventanas se guardan en tu cuenta (Supabase) con su grupo, carpeta y
                        estado. Inicia sesión para conservarlas entre dispositivos.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {sections.map(({ label, items }) => (
                        <CollapsibleSection
                            key={label}
                            label={label === NO_GROUP || label === NO_FOLDER ? label : label}
                            count={items.length}
                            accent={accent}
                        >
                            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                {items.map((w) => (
                                    <WindowCard
                                        key={w.id}
                                        w={w}
                                        onChanged={refresh}
                                        onOpenFull={setFull}
                                        onOpenVr={setVrWin}
                                        onToggleMulti={toggleMulti}
                                        inMulti={multi.includes(w.id)}
                                    />
                                ))}
                            </div>
                        </CollapsibleSection>
                    ))}
                </div>
            )}

            {/* Overlay de pantalla completa */}
            {full && <FullscreenOverlay w={full} onClose={() => setFull(null)} />}

            {/* Marco inmersivo VR/AR */}
            {vrWin && (
                <VrArFrame
                    url={vrWin.url}
                    title={vrWin.name}
                    embeddable={isLikelyEmbeddable(vrWin.url)}
                    onClose={() => setVrWin(null)}
                />
            )}
        </div>
    );
}
