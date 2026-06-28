"use client";

// src/components/browser/web-frame.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Marco de previsualización web reutilizable para el Navegador de StarSeed.
//
// Qué resuelve (puntos 1, 5 y 6 del encargo):
//   1. PREVISUALIZACIÓN: renderiza la página dentro de un <iframe> (sandbox +
//      allow) cuando el sitio permite el embebido; muestra un estado de carga
//      real (spinner) y, si el sitio bloquea el iframe (X-Frame-Options / CSP),
//      lo detecta (heurística + onLoad/onError + timeout) y muestra el fallback.
//   5. SITIO BLOQUEADO: el fallback abre un diálogo «¿Abrir con…?» con opciones
//      — otro servidor (proxy tri-fuente, si está configurado) u otro navegador
//      (Chrome / Opera / Ecosia / predeterminado) vía window.open.
//   6. MODO DE RED: si el modo es "internal" (solo StarSeed) y el destino es de
//      internet abierto, se bloquea la navegación con un aviso claro.
//
// HONESTIDAD: el cliente no puede leer cabeceras del servidor (CORS), así que el
// veredicto real lo da el ciclo de carga del iframe; aquí combinamos heurística +
// eventos + timeout. Tampoco se puede forzar QUÉ navegador externo abre la URL:
// window.open abre en el actual; usamos esquemas «abrir con» best-effort y
// etiquetamos las opciones con honestidad.
//
// SSR-SAFE: todo acceso a window/iframe ocurre en efectos/handlers.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    AlertTriangle,
    ExternalLink,
    RefreshCw,
    Loader2,
    ShieldAlert,
    Server,
    Globe,
    Lock,
} from "lucide-react";
import {
    renderUrl,
    isLikelyEmbeddable,
    hasProxyConfigured,
    proxiedUrlOrNull,
    openInExternalBrowser,
    enforceNetMode,
    EXTERNAL_BROWSER_LABEL,
    type ExternalBrowser,
    type NetMode,
} from "@/lib/browser/browser";

/** sandbox amplio pero seguro; allow para medios/funciones comunes incrustadas. */
export const FRAME_SANDBOX =
    "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-modals";
export const FRAME_ALLOW =
    "accelerometer; autoplay; clipboard-read; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share";

function openInTab(url: string) {
    if (typeof window === "undefined" || !url) return;
    window.open(url, "_blank", "noopener,noreferrer");
}

// ─────────────────────────────────────────────────────────────────────────────
// Diálogo «¿Abrir con…?» para sitios bloqueados / navegación externa
// ─────────────────────────────────────────────────────────────────────────────

export function OpenWithDialog({
    open,
    onOpenChange,
    url,
    reason,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    url: string;
    reason?: string;
}) {
    const proxied = useMemo(() => (url ? proxiedUrlOrNull(url) : null), [url]);

    function openServer() {
        if (proxied) {
            openInTab(proxied);
            toast.success("Abierto vía servidor de proxy/render de StarSeed");
        } else {
            toast.error("No hay servidor de proxy/render configurado. Configúralo en Ajustes.");
        }
    }

    function openBrowser(b: ExternalBrowser) {
        const { opened, honest } = openInExternalBrowser(url, b);
        if (!opened) {
            toast.error("No disponible en este contexto");
            return;
        }
        toast.success(
            honest
                ? `Abriendo en una ventana nueva (${EXTERNAL_BROWSER_LABEL[b]} si es tu navegador)`
                : `Intentando abrir en ${EXTERNAL_BROWSER_LABEL[b]}…`,
        );
        onOpenChange(false);
    }

    const browsers: ExternalBrowser[] = ["chrome", "opera", "ecosia", "default"];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldAlert className="h-5 w-5 text-amber-300" />
                        Este sitio no permite abrirse aquí
                    </DialogTitle>
                    <DialogDescription>
                        {reason ||
                            "El sitio bloquea el embebido por seguridad (X-Frame-Options / CSP). ¿Cómo quieres abrirlo?"}
                    </DialogDescription>
                </DialogHeader>

                <p className="break-all rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-white/55">
                    {url}
                </p>

                {/* Opción A: otro servidor (proxy tri-fuente) */}
                <div className="space-y-2">
                    <p className="flex items-center gap-2 text-xs font-medium text-white/70">
                        <Server className="h-3.5 w-3.5 text-cyan-300" /> Abrir con otro servidor
                    </p>
                    <Button
                        variant={proxied ? "secondary" : "outline"}
                        size="sm"
                        className="w-full justify-start"
                        onClick={openServer}
                        disabled={!proxied}
                    >
                        <Server className="h-4 w-4" />
                        {proxied
                            ? "Servidor de proxy/render de StarSeed"
                            : "Sin proxy configurado (actívalo en Ajustes)"}
                    </Button>
                </div>

                {/* Opción B: otro navegador */}
                <div className="space-y-2">
                    <p className="flex items-center gap-2 text-xs font-medium text-white/70">
                        <Globe className="h-3.5 w-3.5 text-violet-300" /> Abrir con otro navegador
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        {browsers.map((b) => (
                            <Button
                                key={b}
                                variant="outline"
                                size="sm"
                                className="justify-start"
                                onClick={() => openBrowser(b)}
                            >
                                <ExternalLink className="h-4 w-4" />
                                {EXTERNAL_BROWSER_LABEL[b]}
                            </Button>
                        ))}
                    </div>
                    <p className="text-[10px] leading-relaxed text-white/35">
                        Una web no puede forzar qué navegador del sistema abre un enlace: se abrirá
                        en una ventana/pestaña nueva (en tu navegador actual) y, donde existe un
                        esquema «abrir con», se intenta el navegador elegido.
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// WebFrame — iframe con carga real, detección de bloqueo y modo de red
// ─────────────────────────────────────────────────────────────────────────────

export function WebFrame({
    url,
    title,
    className,
    netMode = "open",
    reloadKey,
}: {
    url: string;
    title: string;
    className?: string;
    netMode?: NetMode;
    reloadKey?: number;
}) {
    const target = useMemo(() => renderUrl(url), [url]);
    const net = useMemo(() => enforceNetMode(url, netMode), [url, netMode]);

    const [blocked, setBlocked] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [nonce, setNonce] = useState(0);
    const [askOpen, setAskOpen] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const v = target.proxied ? "try" : isLikelyEmbeddable(url);
        setBlocked(v === false);
        setLoaded(false);
        if (timer.current) clearTimeout(timer.current);
        if (v !== false && net.allowed) {
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
    }, [url, nonce, reloadKey, target.proxied, net.allowed]);

    if (!url) {
        return (
            <div className={cn("grid place-items-center text-white/40 text-sm", className)}>
                Sin URL
            </div>
        );
    }

    if (!net.allowed) {
        return (
            <div className={cn("flex flex-col items-center justify-center gap-3 p-6 text-center", className)}>
                <Lock className="h-6 w-6 text-amber-300/80" />
                <p className="max-w-xs text-sm text-white/70">{net.reason}</p>
                <p className="max-w-xs break-all text-[11px] text-white/40">{url}</p>
                <Button size="sm" variant="outline" onClick={() => setAskOpen(true)}>
                    <ExternalLink className="h-4 w-4" /> Abrir con…
                </Button>
                <OpenWithDialog open={askOpen} onOpenChange={setAskOpen} url={url} reason={net.reason} />
            </div>
        );
    }

    if (blocked) {
        return (
            <div className={cn("flex flex-col items-center justify-center gap-3 p-6 text-center", className)}>
                <AlertTriangle className="h-6 w-6 text-amber-300/80" />
                <p className="max-w-xs text-sm text-white/70">
                    Este sitio no permite incrustarse (bloquea el embebido por seguridad).
                    {!hasProxyConfigured() && " Configura un servidor de proxy/render para incrustarlo."}
                </p>
                <p className="max-w-xs break-all text-[11px] text-white/40">{url}</p>
                <div className="flex flex-wrap justify-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setAskOpen(true)}>
                        <ExternalLink className="h-4 w-4" /> Abrir con…
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
                <OpenWithDialog open={askOpen} onOpenChange={setAskOpen} url={url} />
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
                <div className="absolute inset-0 z-[1] grid place-items-center gap-2 bg-black/10">
                    <Loader2 className="h-5 w-5 animate-spin text-cyan-200/80" />
                    <span className="text-xs text-white/40">Cargando…</span>
                </div>
            )}
            <iframe
                key={`${nonce}-${reloadKey ?? 0}`}
                src={target.rendered}
                title={title}
                sandbox={FRAME_SANDBOX}
                allow={FRAME_ALLOW}
                referrerPolicy="no-referrer"
                loading="lazy"
                className="h-full w-full rounded-lg border-0 bg-white/[0.02]"
                onLoad={() => {
                    setLoaded(true);
                    if (timer.current) clearTimeout(timer.current);
                }}
                onError={() => setBlocked(true)}
            />
            <OpenWithDialog open={askOpen} onOpenChange={setAskOpen} url={url} />
        </div>
    );
}

export default WebFrame;
