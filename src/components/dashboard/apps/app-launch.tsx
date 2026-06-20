'use client';

// ════════════════════════════════════════════════════════════════
// Sistema de apertura de apps — useAppLauncher + AppWindow
// ----------------------------------------------------------------
// Resuelve los OpenMode por app: ruta interna, pestaña, popup, o
// ventana flotante del OS (AppWindow sobre OSWindow, con iframe sandbox).
// Toda ventana ofrece SIEMPRE "abrir en pestaña" y, si el framing falla
// (CSP / X-Frame-Options), muestra el fallback explícito — nunca queda
// en blanco. Autocontenido: la ventana se renderiza vía portal a body.
// SOP: architecture/dashboard-launcher-apps-y-archivos.md
// ════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, Hammer } from "lucide-react";
import { OSWindow } from "./os-window";
import type { OpenMode, StarseedApp } from "./launcher-types";

const EMBED_TIMEOUT_MS = 6000;

type ActiveWindow = { app: StarseedApp; soon: boolean };

// ── AppWindow ────────────────────────────────────────────────────
function AppWindow({ app, soon, onClose }: { app: StarseedApp; soon: boolean; onClose: () => void }) {
    const [loaded, setLoaded] = useState(false);
    const [stuck, setStuck] = useState(false);
    const href = app.open.href;
    const showEmbed = !soon && !!href && app.open.embeddable !== false;

    // Heurística de framing bloqueado: si el iframe no carga en ~6s, ofrecer fallback.
    useEffect(() => {
        if (!showEmbed) return;
        const t = setTimeout(() => setStuck((s) => (loaded ? s : true)), EMBED_TIMEOUT_MS);
        return () => clearTimeout(t);
    }, [showEmbed, loaded]);

    const openTab = () => { if (href) window.open(href, "_blank", "noopener,noreferrer"); };

    return (
        <OSWindow
            title={app.name}
            subtitle={soon ? "Módulo nativo · próximamente" : "Ventana StarSeed"}
            icon={app.icon}
            accent={app.accent}
            onClose={onClose}
            actions={href ? (
                <button type="button" onClick={openTab} title="Abrir en pestaña nueva" aria-label="Abrir en pestaña nueva"
                    className="grid place-items-center size-8 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer">
                    <ExternalLink className="size-4" />
                </button>
            ) : undefined}
        >
            {soon ? (
                <SoonBody app={app} />
            ) : showEmbed ? (
                <>
                    <iframe
                        src={href}
                        title={app.name}
                        className="absolute inset-0 w-full h-full border-0 bg-white"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                        onLoad={() => setLoaded(true)}
                    />
                    {!loaded && !stuck && (
                        <div className="absolute inset-0 grid place-items-center bg-card/80 text-muted-foreground">
                            <span className="inline-flex items-center gap-2 text-xs font-semibold">
                                <Loader2 className="size-4 animate-spin" /> Cargando {app.name}…
                            </span>
                        </div>
                    )}
                    {stuck && !loaded && <StuckBody app={app} onOpenTab={openTab} />}
                </>
            ) : (
                <StuckBody app={app} onOpenTab={openTab} />
            )}
        </OSWindow>
    );
}

function SoonBody({ app }: { app: StarseedApp }) {
    return (
        <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <div className="max-w-sm space-y-3">
                <span className="mx-auto grid place-items-center size-14 rounded-2xl border border-white/15"
                    style={{ background: `linear-gradient(135deg, ${app.accent}, color-mix(in srgb, ${app.accent} 35%, transparent))` }}>
                    <Hammer className="size-6 text-white" />
                </span>
                <h4 className="text-base font-black">{app.name}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{app.description}</p>
                <p className="text-[11px] uppercase tracking-[0.16em] font-bold text-muted-foreground/60">
                    Módulo nativo en construcción
                </p>
            </div>
        </div>
    );
}

function StuckBody({ app, onOpenTab }: { app: StarseedApp; onOpenTab: () => void }) {
    return (
        <div className="absolute inset-0 grid place-items-center p-8 text-center bg-card/90">
            <div className="max-w-sm space-y-4">
                <h4 className="text-base font-black">{app.name}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    Esta app no permite incrustarse aquí (protección de framing). Ábrela en una pestaña
                    nueva para la experiencia completa.
                </p>
                <button type="button" onClick={onOpenTab}
                    className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-white shadow-lg cursor-pointer transition-transform hover:-translate-y-px"
                    style={{ background: app.accent }}>
                    <ExternalLink className="size-4" /> Abrir en pestaña nueva
                </button>
            </div>
        </div>
    );
}

// ── Hook ─────────────────────────────────────────────────────────
export interface UseAppLauncher {
    /** Abre una app; modeOverride anula open.primary. */
    launch: (app: StarseedApp, modeOverride?: OpenMode) => void;
    /** Nodo de la ventana activa (renderízalo en tu JSX; se porta a body). */
    windowEl: React.ReactNode;
}

export function useAppLauncher(): UseAppLauncher {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [active, setActive] = useState<ActiveWindow | null>(null);

    useEffect(() => setMounted(true), []);

    const launch = useCallback((app: StarseedApp, modeOverride?: OpenMode) => {
        const { open, status } = app;
        if (status === "soon") { setActive({ app, soon: true }); return; }

        const mode: OpenMode = modeOverride ?? open.primary;

        switch (mode) {
            case "route":
                if (open.route) router.push(open.route);
                else if (open.href) window.open(open.href, "_blank", "noopener,noreferrer");
                break;
            case "tab":
                if (open.href) window.open(open.href, "_blank", "noopener,noreferrer");
                else if (open.route) router.push(open.route);
                break;
            case "popup":
                if (open.href) window.open(open.href, "_blank", "noopener,noreferrer,width=1100,height=760");
                else if (open.route) router.push(open.route);
                break;
            case "installed":
                if (open.href) window.open(open.href, "_blank", "noopener,noreferrer");
                else if (open.route) router.push(open.route);
                break;
            case "embed":
            case "window":
            default:
                if (open.href) setActive({ app, soon: false });
                else if (open.route) router.push(open.route);
                break;
        }
    }, [router]);

    const windowEl = mounted && active
        ? createPortal(
            <AppWindow app={active.app} soon={active.soon} onClose={() => setActive(null)} />,
            document.body
        )
        : null;

    return { launch, windowEl };
}
