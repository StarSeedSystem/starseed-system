"use client";

// src/components/browser/full-window.tsx
// ─────────────────────────────────────────────────────────────────────────────
// VENTANA COMPLETA EN-SISTEMA del Navegador de StarSeed (punto 2 del encargo).
//
// Abre una vista de navegador a "pantalla completa DENTRO de la OS" que MANTIENE
// los menús y el dock de StarSeed y deja TODO el sistema utilizable: es un panel
// `fixed` posicionado por DEBAJO de la barra superior y por ENCIMA del contenido,
// con z-index MENOR que el dock (z-[70]) — así el dock y los menús siguen encima
// y clicables. Incluye:
//   · PESTAÑAS dentro de la ventana (varias por ventana), con nueva pestaña que
//     abre la HOME configurada (por defecto StarSeed Nexus).
//   · VISTAS DIVIDIDAS (split) de 2+ pestañas en mosaico.
//   · Botón para mostrar/ocultar AJUSTES (settings) embebidos (<BrowserConfig/>).
//   · Botón para abrir la pestaña activa como WIDGET FLOTANTE (callback al padre).
//   · ADJUNTAR la pestaña activa a una pizarra o publicación (puente share).
//   · Barra de direcciones funcional con apertura directa de enlaces (interno →
//     router; externo → iframe/ventana) y aplicación del MODO DE RED.
//
// SSR-SAFE: todo acceso a window ocurre en efectos/handlers.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    X,
    Plus,
    Globe,
    Search,
    Settings,
    Columns2,
    Boxes,
    Paperclip,
    Send,
    ExternalLink,
    RotateCw,
    Home as HomeIcon,
    ArrowUpRight,
    PanelRightClose,
} from "lucide-react";
import { WebFrame, OpenWithDialog } from "@/components/browser/web-frame";
import BrowserConfig from "@/components/browser/browser-config";
import { emitAttach, openComposer } from "@/lib/share/bridge";
import {
    normalizeUrl,
    urlHost,
    classifyLink,
    openLink,
    resolveHome,
    enforceNetMode,
    type NetMode,
    type LinkKind,
} from "@/lib/browser/browser";
import { recordVisit, type HomePrefs } from "@/lib/browser/browser-settings";

let TAB_SEQ = 0;
function nextTabId() {
    TAB_SEQ += 1;
    return `t${Date.now().toString(36)}${TAB_SEQ}`;
}

export interface FullTab {
    id: string;
    url: string;
    title: string;
}

export interface FullWindowProps {
    /** Pestaña inicial (la ventana que se abrió a pantalla completa). */
    initialUrl: string;
    initialTitle: string;
    /** Id de la ventana persistida (para overrides de home por ventana). */
    windowId?: string;
    home: HomePrefs;
    netMode: NetMode;
    onClose: () => void;
    /** Pide al padre abrir una URL como widget flotante encima de la pantalla. */
    onFloatWidget?: (tab: FullTab) => void;
}

export default function FullWindow({
    initialUrl,
    initialTitle,
    windowId,
    home,
    netMode,
    onClose,
    onFloatWidget,
}: FullWindowProps) {
    const router = useRouter();

    const [tabs, setTabs] = useState<FullTab[]>(() => [
        { id: nextTabId(), url: initialUrl, title: initialTitle || urlHost(initialUrl) || initialUrl },
    ]);
    const [activeId, setActiveId] = useState<string>(() => tabs[0]?.id ?? "");
    const [split, setSplit] = useState(false);
    // Pestañas seleccionadas para el mosaico dividido (si <2, se usan las 2 primeras).
    const [splitIds, setSplitIds] = useState<string[]>([]);
    const [showSettings, setShowSettings] = useState(false);
    const [address, setAddress] = useState(initialUrl);
    const [reloadKey, setReloadKey] = useState(0);
    const [askOpen, setAskOpen] = useState(false);

    const active = useMemo(
        () => tabs.find((t) => t.id === activeId) ?? tabs[0],
        [tabs, activeId],
    );

    // Sincroniza la barra de direcciones con la pestaña activa.
    useEffect(() => {
        if (active) setAddress(active.url);
    }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Bloquea el scroll del fondo mientras la ventana completa está abierta.
    useEffect(() => {
        if (typeof document === "undefined") return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener("keydown", onKey);
        };
    }, [onClose]);

    const homeUrl = useMemo(() => resolveHome(home, windowId), [home, windowId]);

    const openHomeTab = useCallback(() => {
        const id = nextTabId();
        const url = homeUrl;
        setTabs((cur) => [...cur, { id, url, title: urlHost(url) || "Inicio" }]);
        setActiveId(id);
        void recordVisit(url, "Inicio");
    }, [homeUrl]);

    const closeTab = useCallback(
        (id: string) => {
            setTabs((cur) => {
                const next = cur.filter((t) => t.id !== id);
                if (next.length === 0) {
                    // Si no quedan pestañas, cierra la ventana completa.
                    onClose();
                    return cur;
                }
                if (id === activeId) setActiveId(next[next.length - 1].id);
                return next;
            });
            setSplitIds((cur) => cur.filter((x) => x !== id));
        },
        [activeId, onClose],
    );

    // Navega la pestaña activa a un destino (barra de direcciones / Inicio).
    const navigateActive = useCallback(
        (raw: string) => {
            const value = (raw || "").trim();
            if (!value || !active) return;
            const href = value.startsWith("/") ? value : normalizeUrl(value);
            const kind = classifyLink(href);

            // Modo de red: bloquea externos cuando "solo interno".
            const net = enforceNetMode(href, netMode);
            if (!net.allowed) {
                toast.error(net.reason || "Destino bloqueado por el modo de red.");
                setAskOpen(true);
                return;
            }

            // Rutas internas de la OS → router (y cerramos la ventana completa para
            // que se vea la navegación interna del sistema).
            if (kind === "internal") {
                router.push(href);
                void recordVisit(href, href);
                toast.success("Abriendo ruta interna de StarSeed");
                onClose();
                return;
            }

            // Externo / StarSeed → carga en la pestaña (iframe). El WebFrame hará el
            // fallback a «Abrir con…» si el sitio bloquea el embebido.
            setTabs((cur) =>
                cur.map((t) =>
                    t.id === active.id ? { ...t, url: href, title: urlHost(href) || href } : t,
                ),
            );
            setReloadKey((k) => k + 1);
            void recordVisit(href, urlHost(href) || href);
        },
        [active, netMode, router, onClose],
    );

    function submitAddress(e?: React.FormEvent) {
        e?.preventDefault();
        navigateActive(address);
    }

    // Abrir el destino DIRECTAMENTE con el mecanismo correcto (sin tocar la pestaña).
    function openDirect() {
        const value = address.trim();
        if (!value) return;
        const href = value.startsWith("/") ? value : normalizeUrl(value);
        const net = enforceNetMode(href, netMode);
        if (!net.allowed) {
            toast.error(net.reason || "Destino bloqueado por el modo de red.");
            setAskOpen(true);
            return;
        }
        const { kind, opened } = openLink(href, { router });
        if (opened) {
            void recordVisit(href, href);
            const label: Record<LinkKind, string> = {
                internal: "Abriendo ruta interna de StarSeed",
                starseed: "Abriendo sistema StarSeed en ventana nueva",
                external: "Abierto en ventana/pestaña nueva del navegador",
            };
            toast.success(label[kind]);
            if (kind === "internal") onClose();
        }
    }

    function attachToBoard() {
        if (!active) return;
        // El encargo pide emitir {kind:'web', url}; el consumidor actual (la
        // pizarra) materializa {kind:'window'}. Emitimos AMBOS para ser
        // compatibles hoy y con el contrato 'web' del puente.
        emitAttach({ kind: "web", url: active.url, title: active.title, data: { host: urlHost(active.url) } } as any);
        const ok = emitAttach({
            kind: "window",
            url: active.url,
            title: active.title,
            data: { host: urlHost(active.url) },
        });
        toast[ok ? "success" : "error"](
            ok ? "Pestaña enviada a la pizarra" : "No disponible en este contexto",
        );
    }

    function attachToPublication() {
        if (!active) return;
        openComposer({ type: "enlace", format: "embed", content: { url: active.url } });
        toast.success("Compositor de publicación solicitado");
    }

    function floatActive() {
        if (!active) return;
        onFloatWidget?.(active);
        toast.success("Pestaña abierta como widget flotante");
    }

    // Pestañas a mostrar en split: las seleccionadas, o las 2 primeras por defecto.
    const splitTabs = useMemo(() => {
        const chosen = tabs.filter((t) => splitIds.includes(t.id));
        if (chosen.length >= 2) return chosen;
        return tabs.slice(0, Math.max(2, chosen.length));
    }, [tabs, splitIds]);

    const linkKind = active ? classifyLink(active.url) : "external";

    return (
        // Panel fijo: arranca bajo la barra superior y termina por encima del dock.
        // z-[60] < dock z-[70] → el dock y los menús de la OS siguen encima y usables.
        <div
            className="fixed inset-x-2 z-[60] flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b14]/95 shadow-2xl backdrop-blur-xl"
            style={{ top: "clamp(3.75rem, 5.5vw, 5rem)", bottom: "6rem" }}
            role="dialog"
            aria-label="Navegador a pantalla completa"
        >
            {/* Barra de pestañas */}
            <div className="flex items-center gap-1 border-b border-white/10 bg-black/30 px-2 py-1.5">
                <Globe className="h-4 w-4 shrink-0 text-cyan-200" />
                <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                    {tabs.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setActiveId(t.id)}
                            className={cn(
                                "group flex max-w-[200px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-colors",
                                t.id === activeId
                                    ? "bg-white/10 text-amber-50"
                                    : "text-white/50 hover:bg-white/5 hover:text-white/80",
                            )}
                            title={t.url}
                        >
                            <span className="truncate">{t.title || urlHost(t.url) || "Pestaña"}</span>
                            <span
                                role="button"
                                tabIndex={-1}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    closeTab(t.id);
                                }}
                                className="grid h-4 w-4 shrink-0 place-items-center rounded text-white/30 opacity-0 transition-opacity hover:text-rose-300 group-hover:opacity-100"
                            >
                                <X className="h-3 w-3" />
                            </span>
                        </button>
                    ))}
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 shrink-0 gap-1 px-2 text-white/60"
                        onClick={openHomeTab}
                        title="Nueva pestaña (abre la home configurada)"
                    >
                        <Plus className="h-3.5 w-3.5" /> Nueva
                    </Button>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <Button
                        size="sm"
                        variant={split ? "secondary" : "ghost"}
                        className="h-7 gap-1 px-2"
                        onClick={() => setSplit((v) => !v)}
                        disabled={tabs.length < 2}
                        title="Vista dividida (mosaico de 2+ pestañas)"
                    >
                        <Columns2 className="h-3.5 w-3.5" /> Dividir
                    </Button>
                    <Button
                        size="sm"
                        variant={showSettings ? "secondary" : "ghost"}
                        className="h-7 gap-1 px-2"
                        onClick={() => setShowSettings((v) => !v)}
                        title="Mostrar/ocultar Ajustes del navegador"
                    >
                        <Settings className="h-3.5 w-3.5" /> Ajustes
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 gap-1 px-2"
                        onClick={onClose}
                        title="Cerrar la ventana completa (Esc)"
                    >
                        <X className="h-3.5 w-3.5" /> Cerrar
                    </Button>
                </div>
            </div>

            {/* Barra de direcciones + acciones de la pestaña activa */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 bg-black/20 px-2 py-1.5">
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => navigateActive(homeUrl)}
                    title={`Ir a Inicio (${urlHost(homeUrl) || homeUrl})`}
                >
                    <HomeIcon className="h-4 w-4" />
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => setReloadKey((k) => k + 1)}
                    title="Recargar"
                >
                    <RotateCw className="h-4 w-4" />
                </Button>
                <form onSubmit={submitAddress} className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2">
                    <Search className="h-4 w-4 shrink-0 text-white/40" />
                    <Input
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="URL, ruta interna o búsqueda…"
                        className="h-8 border-0 bg-transparent px-0 text-xs focus-visible:ring-0"
                    />
                    {netMode === "internal" && (
                        <Badge variant="outline" className="shrink-0 border-amber-400/40 text-[10px] text-amber-200/80">
                            solo interno
                        </Badge>
                    )}
                </form>
                <Button size="sm" variant="outline" className="h-8 gap-1 px-2" onClick={() => navigateActive(address)} title="Ir (cargar en la pestaña)">
                    Ir
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1 px-2" onClick={openDirect} title="Abrir enlace directamente">
                    {linkKind === "internal" ? <ArrowUpRight className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
                    {linkKind === "internal" ? "Ir interno" : "Abrir"}
                </Button>
                {/* Acciones de pestaña: widget flotante, adjuntar */}
                <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-8 gap-1 px-2" onClick={floatActive} title="Abrir como widget flotante encima de la pantalla">
                        <Boxes className="h-4 w-4" /> Widget
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 gap-1 px-2" onClick={attachToBoard} title="Adjuntar a una pizarra">
                        <Paperclip className="h-4 w-4" /> Pizarra
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 gap-1 px-2" onClick={attachToPublication} title="Adjuntar a una publicación">
                        <Send className="h-4 w-4" /> Publicar
                    </Button>
                </div>
            </div>

            {/* Cuerpo: ajustes embebidos (opcional) + lienzo de pestaña(s) */}
            <div className="flex min-h-0 flex-1">
                {showSettings && (
                    <aside className="w-full max-w-md shrink-0 overflow-y-auto border-r border-white/10 bg-black/30 p-3">
                        <div className="mb-2 flex items-center gap-2">
                            <Settings className="h-4 w-4 text-cyan-200" />
                            <h3 className="text-sm font-medium text-amber-50">Ajustes del navegador</h3>
                            <Button size="sm" variant="ghost" className="ml-auto h-7 px-2" onClick={() => setShowSettings(false)}>
                                <PanelRightClose className="h-4 w-4" />
                            </Button>
                        </div>
                        <BrowserConfig />
                    </aside>
                )}

                <div className="min-h-0 min-w-0 flex-1 p-2">
                    {split ? (
                        <div className="grid h-full grid-cols-1 gap-2 md:grid-cols-2">
                            {splitTabs.map((t) => (
                                <div key={t.id} className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-black/20">
                                    <div className="flex items-center gap-2 border-b border-white/10 px-2 py-1">
                                        <span className="truncate text-[11px] text-white/60">{t.title || urlHost(t.url)}</span>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="ml-auto h-6 px-1.5 text-[10px]"
                                            onClick={() => setActiveId(t.id)}
                                            title="Hacer activa"
                                        >
                                            activa
                                        </Button>
                                    </div>
                                    <WebFrame url={t.url} title={t.title} netMode={netMode} reloadKey={reloadKey} className="min-h-0 flex-1" />
                                </div>
                            ))}
                        </div>
                    ) : active ? (
                        <WebFrame
                            url={active.url}
                            title={active.title}
                            netMode={netMode}
                            reloadKey={reloadKey}
                            className="h-full w-full overflow-hidden rounded-xl bg-black/20"
                        />
                    ) : (
                        <div className="grid h-full place-items-center text-sm text-white/40">Sin pestañas</div>
                    )}
                </div>
            </div>

            <OpenWithDialog open={askOpen} onOpenChange={setAskOpen} url={active?.url || address} />
        </div>
    );
}
