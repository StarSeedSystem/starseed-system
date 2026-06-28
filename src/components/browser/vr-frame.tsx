"use client";

// src/components/browser/vr-frame.tsx
// Contenedor inmersivo VR/AR (WebXR) para abrir una pagina/format en 3D.
// HONESTIDAD: WebXR no puede "meter" un sitio web arbitrario en 3D. Hacemos un
// marco inmersivo basico (sesion immersive-vr/ar) y, en el DOM 2D, una "pared"
// con el contenido (iframe si es incrustable, o panel con enlace). Degrada con
// elegancia si WebXR no esta soportado: aviso + iframe/panel 2D normal.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Boxes, Glasses, ExternalLink, X, AlertTriangle } from "lucide-react";

type XRSupport = "checking" | "vr" | "ar" | "none";

function openInTab(url: string) {
    if (typeof window === "undefined" || !url) return;
    window.open(url, "_blank", "noopener,noreferrer");
}

export interface VrArFrameProps {
    url: string;
    title: string;
    /** iframe incrustable (true/"try") o no (false). Si no, mostramos panel con enlace. */
    embeddable: true | false | "try";
    onClose: () => void;
}

/**
 * Marco VR/AR. Comprueba navigator.xr; si hay soporte ofrece "Entrar en VR/AR"
 * (sesion immersive con un canvas WebGL minimo). Siempre muestra una vista 2D de
 * respaldo (iframe del sitio si es incrustable, o panel con enlace) para que la
 * pagina sea utilizable aunque no haya casco.
 */
export default function VrArFrame({ url, title, embeddable, onClose }: VrArFrameProps) {
    const [support, setSupport] = useState<XRSupport>("checking");
    const [sessionActive, setSessionActive] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const sessionRef = useRef<unknown>(null);

    // Deteccion de soporte WebXR (immersive-vr preferido; ar como alternativa).
    useEffect(() => {
        let alive = true;
        const xr = (navigator as unknown as { xr?: { isSessionSupported?: (m: string) => Promise<boolean> } }).xr;
        if (!xr || typeof xr.isSessionSupported !== "function") {
            setSupport("none");
            return;
        }
        (async () => {
            try {
                const vr = await xr.isSessionSupported!("immersive-vr").catch(() => false);
                if (alive && vr) return setSupport("vr");
                const ar = await xr.isSessionSupported!("immersive-ar").catch(() => false);
                if (alive) setSupport(ar ? "ar" : "none");
            } catch {
                if (alive) setSupport("none");
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

    async function enterImmersive() {
        setErr(null);
        const mode = support === "ar" ? "immersive-ar" : "immersive-vr";
        const xr = (navigator as unknown as {
            xr?: { requestSession?: (m: string) => Promise<unknown> };
        }).xr;
        if (!xr?.requestSession) {
            setErr("WebXR no disponible en este dispositivo/navegador.");
            return;
        }
        try {
            const session = (await xr.requestSession(mode)) as {
                addEventListener: (t: string, cb: () => void) => void;
                end: () => Promise<void>;
                updateRenderState: (s: unknown) => void;
                requestReferenceSpace: (t: string) => Promise<unknown>;
                requestAnimationFrame: (cb: (t: number, f: unknown) => void) => void;
            };
            sessionRef.current = session;
            setSessionActive(true);
            const canvas = canvasRef.current ?? document.createElement("canvas");
            const gl = canvas.getContext("webgl", { xrCompatible: true }) as WebGLRenderingContext | null;
            if (gl) {
                const XRWebGLLayerCtor = (window as unknown as { XRWebGLLayer?: new (s: unknown, g: unknown) => unknown }).XRWebGLLayer;
                if (XRWebGLLayerCtor) {
                    session.updateRenderState({ baseLayer: new XRWebGLLayerCtor(session, gl) });
                }
                const ref = await session.requestReferenceSpace("local").catch(() => null);
                const onFrame = () => {
                    if (!sessionRef.current) return;
                    // Lienzo inmersivo basico: limpia a un color de "sala". Suficiente
                    // para una sesion XR valida; el contenido 2D vive en la pared DOM.
                    gl.clearColor(0.03, 0.04, 0.08, 1);
                    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                    session.requestAnimationFrame(onFrame);
                };
                if (ref) session.requestAnimationFrame(onFrame);
            }
            session.addEventListener("end", () => {
                sessionRef.current = null;
                setSessionActive(false);
            });
        } catch (e) {
            setErr((e as Error)?.message || "No se pudo iniciar la sesion inmersiva.");
            setSessionActive(false);
        }
    }

    async function exitImmersive() {
        const s = sessionRef.current as { end?: () => Promise<void> } | null;
        try {
            await s?.end?.();
        } catch {
            /* noop */
        }
        sessionRef.current = null;
        setSessionActive(false);
    }

    // Cierre con Escape (cuando no hay sesion XR activa; la XR la gestiona el casco).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !sessionActive) onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose, sessionActive]);

    return (
        <div className="fixed inset-0 z-[130] flex flex-col bg-gradient-to-b from-indigo-950/95 via-black/95 to-black/95 backdrop-blur-sm">
            <canvas ref={canvasRef} className="pointer-events-none absolute h-0 w-0 opacity-0" />
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2">
                <Glasses className="h-4 w-4 text-indigo-200" />
                <p className="truncate text-sm text-amber-50">{title}</p>
                <Badge variant="outline" className="border-indigo-400/40 text-indigo-200/80">
                    {support === "checking"
                        ? "Comprobando XR…"
                        : support === "vr"
                          ? "WebXR VR"
                          : support === "ar"
                            ? "WebXR AR"
                            : "Sin WebXR"}
                </Badge>
                <div className="ml-auto flex gap-2">
                    {support === "vr" || support === "ar" ? (
                        sessionActive ? (
                            <Button size="sm" variant="secondary" onClick={exitImmersive}>
                                <X className="h-4 w-4" /> Salir de XR
                            </Button>
                        ) : (
                            <Button size="sm" variant="secondary" onClick={enterImmersive}>
                                <Boxes className="h-4 w-4" /> Entrar en {support === "ar" ? "AR" : "VR"}
                            </Button>
                        )
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => openInTab(url)}>
                        <ExternalLink className="h-4 w-4" /> Pestaña
                    </Button>
                    <Button size="sm" variant="secondary" onClick={onClose}>
                        <X className="h-4 w-4" /> Cerrar
                    </Button>
                </div>
            </div>

            {err && (
                <div className="flex items-center gap-2 border-b border-amber-400/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-100/90">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {err}
                </div>
            )}

            {/* "Pared" inmersiva 2D: lienzo en perspectiva con el contenido. */}
            <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4 sm:p-10">
                <div
                    className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-indigo-400/20 bg-black/40 shadow-2xl shadow-indigo-900/40"
                    style={{
                        transform: "perspective(1400px) rotateX(4deg)",
                        aspectRatio: "16 / 10",
                    }}
                >
                    {embeddable !== false ? (
                        <iframe
                            src={url}
                            title={title}
                            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                            referrerPolicy="no-referrer"
                            className="h-full w-full border-0 bg-white/[0.02]"
                        />
                    ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
                            <AlertTriangle className="h-7 w-7 text-amber-300/80" />
                            <p className="max-w-sm text-sm text-white/70">
                                Este sitio no permite incrustarse, así que no puede proyectarse en la
                                pared inmersiva. Ábrelo en una pestaña externa.
                            </p>
                            <p className="max-w-sm break-all text-[11px] text-white/40">{url}</p>
                            <Button size="sm" variant="secondary" onClick={() => openInTab(url)}>
                                <ExternalLink className="h-4 w-4" /> Abrir en ventana externa
                            </Button>
                        </div>
                    )}
                </div>
                <p className="pointer-events-none absolute bottom-3 left-0 right-0 text-center text-[11px] text-white/35">
                    Marco inmersivo básico. La proyección 3D real de la página requiere un casco
                    compatible con WebXR; sin él, esta es la vista de respaldo.
                </p>
            </div>
        </div>
    );
}
