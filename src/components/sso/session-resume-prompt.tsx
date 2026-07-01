"use client";

// ════════════════════════════════════════════════════════════════════════════
// SSO · "Continuar como …" — reanudar la sesión StarSeed del dispositivo (#93)
// ----------------------------------------------------------------------------
// Tarjeta de cristal que aparece en la pantalla de acceso (login) cuando ya hay
// una sesión StarSeed válida en este navegador — típicamente porque el usuario
// inició sesión en Café/Nexus (mismo proyecto Supabase compartido). Ofrece:
//
//   • "Entrar como @usuario"  → un toque, SIN re-tipear credenciales. La sesión
//     ya está adoptada por el cliente del OS (misma clave de storage), así que
//     solo confirmamos que sigue viva y entramos al sistema.
//   • "Usar otra cuenta"      → descarta el prompt y deja el login normal.
//
// Diseño alineado con AuthGate (cristal oscuro, gradiente violeta→teal
// #7c5cff→#23d5ab). Aditivo y defensivo: si no se detecta sesión, no renderiza
// nada y el login se comporta exactamente igual que antes. SSR-safe.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
    detectStarSeedSession,
    identityLabel,
    isStarSeedEmail,
    type DetectedIdentity,
} from "@/lib/sso/detect-session";

export interface SessionResumePromptProps {
    /** A dónde llevar tras adoptar la sesión (por defecto el panel del OS). */
    redirectTo?: string;
    /** Se llama cuando el usuario elige "Usar otra cuenta" (login normal). */
    onDismiss?: () => void;
    /** Se llama justo tras adoptar la sesión (antes de navegar). */
    onResume?: (identity: DetectedIdentity) => void;
    /** Si false, no navega solo al entrar (deja la navegación al consumidor). */
    autoRedirect?: boolean;
    /** Clase extra para el contenedor exterior. */
    className?: string;
}

// De-mock: handles demo históricos que NO deben mostrarse como identidad real.
const FAKE_HANDLES = new Set(["starseeduser", "starseed_user", "usuario", "user", "demo", "guest", "invitado", "anon", "anonymous"]);
function isFakeHandle(v: string | null | undefined): boolean {
    if (!v) return false;
    return FAKE_HANDLES.has(v.replace(/^@/, "").trim().toLowerCase());
}

// Iniciales para el fallback del avatar (defensivo).
function initialsFrom(identity: DetectedIdentity | null): string {
    const base =
        identity?.handle ||
        (identity?.email ? identity.email.split("@")[0] : "") ||
        "S";
    const clean = base.replace(/^@/, "").trim();
    return (clean.slice(0, 2) || "SS").toUpperCase();
}

export function SessionResumePrompt({
    redirectTo = "/dashboard",
    onDismiss,
    onResume,
    autoRedirect = true,
    className,
}: SessionResumePromptProps) {
    const router = useRouter();
    const [ready, setReady] = useState(false);
    const [identity, setIdentity] = useState<DetectedIdentity | null>(null);
    const [dismissed, setDismissed] = useState(false);
    const [entering, setEntering] = useState(false);
    const [imgFailed, setImgFailed] = useState(false);
    const aliveRef = useRef(true);

    // Detección al montar (y re-detección si cambia la sesión en vivo).
    useEffect(() => {
        aliveRef.current = true;

        const run = async () => {
            try {
                const res = await detectStarSeedSession();
                if (!aliveRef.current) return;
                setIdentity(res.found ? res.identity : null);
            } catch {
                if (aliveRef.current) setIdentity(null);
            } finally {
                if (aliveRef.current) setReady(true);
            }
        };

        void run();

        // Si la sesión cambia (p.ej. login en otra pestaña), reevaluamos.
        let unsub: (() => void) | undefined;
        try {
            const sb = createClient();
            const { data: sub } = sb.auth.onAuthStateChange(() => {
                void run();
            });
            unsub = () => sub.subscription.unsubscribe();
        } catch {
            /* fail-open: sin suscripción, el prompt sigue funcionando */
        }

        return () => {
            aliveRef.current = false;
            unsub?.();
        };
    }, []);

    // ── "Entrar": adoptar la sesión ya presente (sin credenciales) ──
    // La sesión ya vive en el cliente del OS (misma clave de storage que
    // Café/Nexus). Solo confirmamos que sigue válida y entramos. Si por lo que
    // sea ya no hay sesión, descartamos el prompt y dejamos el login normal.
    const handleEnter = useCallback(async () => {
        if (entering) return;
        setEntering(true);
        try {
            const sb = createClient();
            const { data } = await sb.auth.getSession();
            const session = data?.session ?? null;
            if (!session?.user) {
                // La sesión desapareció entre detección y toque → login normal.
                setIdentity(null);
                onDismiss?.();
                return;
            }
            onResume?.(identity ?? {
                userId: session.user.id,
                handle: null,
                email: session.user.email ?? null,
                avatarUrl: null,
                isAnonymous: false,
            });
            if (autoRedirect) {
                router.push(redirectTo);
                router.refresh();
            }
        } catch {
            // Fallo de red: no bloqueamos. Intentamos navegar igualmente; si la
            // ruta está protegida, el middleware decidirá.
            if (autoRedirect) {
                try {
                    router.push(redirectTo);
                    router.refresh();
                } catch {
                    /* no-op */
                }
            }
        } finally {
            if (aliveRef.current) setEntering(false);
        }
    }, [entering, identity, onResume, onDismiss, autoRedirect, redirectTo, router]);

    const handleUseOther = useCallback(() => {
        setDismissed(true);
        onDismiss?.();
    }, [onDismiss]);

    // No renderizar hasta saber, ni si no hay sesión o el usuario la descartó.
    if (!ready || dismissed || !identity) return null;

    // De-mock: si el handle detectado es un placeholder demo, no lo mostramos como
    // identidad real; usamos el correo real (o el genérico honesto) en su lugar.
    const label = isFakeHandle(identity.handle)
        ? identity.email || "tu cuenta StarSeed"
        : identityLabel(identity);
    const sub = isStarSeedEmail(identity.email)
        ? identity.email
        : identity.email || "Sesión StarSeed activa en este dispositivo";
    const showAvatar = !!identity.avatarUrl && !imgFailed;

    return (
        <div
            className={className}
            role="region"
            aria-label="Sesión StarSeed detectada"
            style={{ width: "100%", maxWidth: 350, margin: "0 auto" }}
        >
            <style>{`
                @keyframes ssSsoIn { from { opacity: 0; transform: translateY(10px) scale(.99); } to { opacity: 1; transform: none; } }
                .ss-sso-card { animation: ssSsoIn .4s cubic-bezier(.22,1,.36,1) both; }
                .ss-sso-enter:hover:not(:disabled) { filter: brightness(1.08); }
                .ss-sso-enter:focus-visible { outline: 2px solid #a78bfa; outline-offset: 2px; }
                .ss-sso-other:hover:not(:disabled) { color: rgba(255,255,255,.92) !important; }
                .ss-sso-other:focus-visible { outline: 2px solid #a78bfa; outline-offset: 2px; border-radius: 8px; }
                @media (prefers-reduced-motion: reduce) { .ss-sso-card { animation: none !important; } }
            `}</style>

            <div
                className="ss-sso-card"
                style={{
                    position: "relative",
                    background: "rgba(12,14,24,.82)",
                    border: "1px solid rgba(167,139,250,.28)",
                    borderRadius: 18,
                    padding: 18,
                    boxShadow: "0 18px 50px rgba(0,0,0,.45)",
                    backdropFilter: "blur(14px)",
                }}
            >
                <div
                    style={{
                        fontSize: 10.5,
                        textTransform: "uppercase",
                        letterSpacing: ".08em",
                        fontWeight: 700,
                        color: "#a78bfa",
                        marginBottom: 12,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                    }}
                >
                    <span aria-hidden>✶</span> Sesión StarSeed detectada
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <div
                        aria-hidden
                        style={{
                            flexShrink: 0,
                            width: 44,
                            height: 44,
                            borderRadius: "50%",
                            overflow: "hidden",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 15,
                            fontWeight: 700,
                            color: "#fff",
                            background: "linear-gradient(135deg,#7c5cff,#23d5ab)",
                            boxShadow: "0 6px 16px rgba(124,92,255,.4)",
                        }}
                    >
                        {showAvatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={identity.avatarUrl as string}
                                alt=""
                                width={44}
                                height={44}
                                onError={() => setImgFailed(true)}
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                        ) : (
                            initialsFrom(identity)
                        )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <div
                            style={{
                                fontSize: 15,
                                fontWeight: 700,
                                color: "#fff",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                        >
                            {label}
                        </div>
                        <div
                            style={{
                                fontSize: 12,
                                opacity: 0.6,
                                color: "#fff",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                        >
                            {sub}
                        </div>
                    </div>
                </div>

                <button
                    type="button"
                    className="ss-sso-enter"
                    onClick={handleEnter}
                    disabled={entering}
                    aria-busy={entering}
                    style={{
                        width: "100%",
                        border: "none",
                        borderRadius: 13,
                        padding: "12px 0",
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: 14.5,
                        cursor: entering ? "default" : "pointer",
                        opacity: entering ? 0.8 : 1,
                        transition: "filter .15s, opacity .15s",
                        background: "linear-gradient(135deg,#7c5cff,#23d5ab)",
                        boxShadow: "0 10px 26px rgba(124,92,255,.35)",
                    }}
                >
                    {entering ? "Entrando…" : `Entrar como ${label}`}
                </button>

                <button
                    type="button"
                    className="ss-sso-other"
                    onClick={handleUseOther}
                    disabled={entering}
                    style={{
                        width: "100%",
                        background: "transparent",
                        border: "none",
                        color: "rgba(255,255,255,.6)",
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginTop: 10,
                        cursor: entering ? "default" : "pointer",
                        transition: "color .15s",
                    }}
                >
                    Usar otra cuenta
                </button>

                <p
                    style={{
                        textAlign: "center",
                        fontSize: 10.5,
                        opacity: 0.45,
                        color: "#fff",
                        margin: "12px 0 0",
                        lineHeight: 1.5,
                    }}
                >
                    Una sola cuenta para todo StarSeed (OS · Nexus · Café). Entras
                    al instante, sin volver a escribir tu contraseña.
                </p>
            </div>
        </div>
    );
}

export default SessionResumePrompt;
