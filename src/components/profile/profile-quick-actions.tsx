// src/components/profile/profile-quick-actions.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Fila de ACCIONES RÁPIDAS del perfil (Adenda 63 §8 · "Perfil: más opciones por
// defecto"), bajo el ProfileHeader:
//   · Dueño/a  → Editar perfil (/cuenta) · Crear publicación (/crear) ·
//                Compartir perfil (navigator.share + copiar enlace) ·
//                Ver como visitante (toggle local, sin persistencia).
//   · Visita   → Seguir/Siguiendo (os_follows real, clave "profile-<handle>") ·
//                Mensaje (/messages?to=<handle>) · Compartir.
// Sin dependencias nuevas; degradación honesta a /login cuando falta sesión.
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useFollow } from "@/hooks/use-os-entities";
import {
    Pencil,
    PenSquare,
    Share2,
    Check,
    Eye,
    EyeOff,
    MessageCircle,
    UserPlus,
    UserCheck,
    Lock,
    Loader2,
} from "lucide-react";

const GOLD = "#E9C46A";

/** Botón Compartir perfil: navigator.share con fallback a copiar el enlace. */
function ShareProfileButton({ handle, name }: { handle: string; name: string }) {
    const [copied, setCopied] = useState(false);

    const handleShare = async () => {
        const url =
            typeof window !== "undefined" ? `${window.location.origin}/profile/${handle}` : "";
        try {
            if (typeof navigator !== "undefined" && navigator.share) {
                await navigator.share({ title: `${name} · StarSeed`, url });
                setCopied(true);
            } else if (typeof navigator !== "undefined" && navigator.clipboard) {
                await navigator.clipboard.writeText(url);
                setCopied(true);
            }
            setTimeout(() => setCopied(false), 1800);
        } catch {
            /* la persona canceló el diálogo nativo */
        }
    };

    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleShare()}
            className="shrink-0 cursor-pointer gap-1.5 rounded-full border-white/15 bg-white/[0.03] backdrop-blur"
        >
            {copied ? (
                <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" /> Enlace copiado
                </>
            ) : (
                <>
                    <Share2 className="h-3.5 w-3.5" /> Compartir perfil
                </>
            )}
        </Button>
    );
}

/** Botón Seguir/Siguiendo con persistencia real en os_follows. */
function FollowProfileButton({ handle }: { handle: string }) {
    // Misma tabla os_follows que las páginas: clave estable por perfil.
    const { active, loading, needsAuth, toggle } = useFollow(`profile-${handle}`);
    const [hint, setHint] = useState(false);

    const handleToggle = async () => {
        const res = await toggle();
        if (res.needsAuth) {
            setHint(true);
            setTimeout(() => setHint(false), 4000);
        }
    };

    return (
        <span className="flex shrink-0 items-center gap-2">
            <Button
                type="button"
                size="sm"
                variant={active ? "outline" : "default"}
                onClick={() => void handleToggle()}
                disabled={loading}
                aria-pressed={active}
                className="shrink-0 cursor-pointer gap-1.5 rounded-full"
            >
                {loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : active ? (
                    <UserCheck className="h-3.5 w-3.5" />
                ) : (
                    <UserPlus className="h-3.5 w-3.5" />
                )}
                {active ? "Siguiendo" : "Seguir"}
            </Button>
            {hint && needsAuth && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    <Link href="/login" className="cursor-pointer underline" style={{ color: GOLD }}>
                        Inicia sesión para seguir
                    </Link>
                </span>
            )}
        </span>
    );
}

export interface ProfileQuickActionsProps {
    /** ¿La sesión actual es dueña REAL de este perfil? */
    isOwner: boolean;
    /** Vista "como visitante" activa (solo aplica al dueño real). */
    viewAsVisitor: boolean;
    onToggleViewAs: () => void;
    /** Handle sin @ (clave de URL /profile/<handle>). */
    handle: string;
    name: string;
}

export function ProfileQuickActions({
    isOwner,
    viewAsVisitor,
    onToggleViewAs,
    handle,
    name,
}: ProfileQuickActionsProps) {
    const showOwnerActions = isOwner && !viewAsVisitor;

    return (
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1 sm:flex-wrap sm:overflow-visible">
            {showOwnerActions ? (
                <>
                    <Button
                        asChild
                        size="sm"
                        className="shrink-0 cursor-pointer gap-1.5 rounded-full border border-primary/50 bg-primary/20 text-primary shadow-lg backdrop-blur hover:bg-primary/30"
                    >
                        <Link href="/cuenta">
                            <Pencil className="h-3.5 w-3.5" /> Editar perfil
                        </Link>
                    </Button>
                    <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="shrink-0 cursor-pointer gap-1.5 rounded-full border-white/15 bg-white/[0.03] backdrop-blur"
                    >
                        <Link href="/crear">
                            <PenSquare className="h-3.5 w-3.5" /> Crear publicación
                        </Link>
                    </Button>
                    <ShareProfileButton handle={handle} name={name} />
                </>
            ) : (
                <>
                    {!isOwner && <FollowProfileButton handle={handle} />}
                    {!isOwner && (
                        <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="shrink-0 cursor-pointer gap-1.5 rounded-full border-white/15 bg-white/[0.03] backdrop-blur"
                        >
                            <Link href={`/messages?to=${encodeURIComponent(handle)}`}>
                                <MessageCircle className="h-3.5 w-3.5" /> Mensaje
                            </Link>
                        </Button>
                    )}
                    <ShareProfileButton handle={handle} name={name} />
                </>
            )}

            {/* Toggle "Ver como visitante" — solo para el dueño real, siempre visible. */}
            {isOwner && (
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={onToggleViewAs}
                    aria-pressed={viewAsVisitor}
                    className="ml-auto shrink-0 cursor-pointer gap-1.5 rounded-full text-muted-foreground hover:text-foreground"
                >
                    {viewAsVisitor ? (
                        <>
                            <EyeOff className="h-3.5 w-3.5" /> Salir de vista visitante
                        </>
                    ) : (
                        <>
                            <Eye className="h-3.5 w-3.5" /> Ver como visitante
                        </>
                    )}
                </Button>
            )}
        </div>
    );
}
