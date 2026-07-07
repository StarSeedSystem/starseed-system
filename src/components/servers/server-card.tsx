"use client";

/*
 * ServerCard — tarjeta compartible de un Servidor de Apps.
 * ---------------------------------------------------------------------------
 * Se usa en /servidores-apps (explorar/mío/de mis grupos) Y como render de un
 * adjunto `refKind='server'` dentro de un mensaje (ver message-attachments.tsx
 * en la sección de Mensajes). Un solo componente, dos contextos.
 *
 * Acciones:
 *   · Unirse (directo si público) / Solicitar (privado/grupo, status='pending').
 *   · Abrir la app (ruta in-app o URL externa).
 *   · Compartir por mensaje → navega a /messages?attachServer=<slug> (el propio
 *     módulo de Mensajes lee ese query param al montar y prepara el adjunto).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
    AppWindow, Gamepad2, Globe2, Terminal, Boxes, Users, Lock, Share2,
    UserPlus, Clock3, ExternalLink, Crown, Loader2,
} from "lucide-react";
import { joinOrRequest, type AppServer, type AppServerSummary } from "@/lib/servers/app-servers";

const KIND_META: Record<
    string,
    { label: string; icon: typeof AppWindow; accent: string }
> = {
    app: { label: "App", icon: AppWindow, accent: "text-cyan-300 border-cyan-500/30 bg-cyan-500/10" },
    juego: { label: "Juego", icon: Gamepad2, accent: "text-purple-300 border-purple-500/30 bg-purple-500/10" },
    entorno: { label: "Entorno", icon: Boxes, accent: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" },
    programa: { label: "Programa", icon: Terminal, accent: "text-amber-300 border-amber-500/30 bg-amber-500/10" },
    otro: { label: "Otro", icon: Globe2, accent: "text-slate-300 border-slate-500/30 bg-slate-500/10" },
};

const VISIBILITY_META: Record<string, { label: string; icon: typeof Globe2 }> = {
    public: { label: "Público", icon: Globe2 },
    private: { label: "Privado", icon: Lock },
    group: { label: "De grupo", icon: Users },
};

export interface ServerCardProps {
    server: AppServer | AppServerSummary;
    /** Variante compacta (para adjuntos de mensaje). */
    compact?: boolean;
    /** Oculta el botón "Compartir por mensaje" (p.ej. cuando ya se está DENTRO de un mensaje). */
    hideShare?: boolean;
    onOpenPanel?: (slug: string) => void;
    className?: string;
}

function hasSummary(s: AppServer | AppServerSummary): s is AppServerSummary {
    return typeof (s as AppServerSummary).memberCount === "number";
}

export function ServerCard({ server, compact = false, hideShare = false, onOpenPanel, className }: ServerCardProps) {
    const router = useRouter();
    const [joining, setJoining] = useState(false);
    const initialStatus = hasSummary(server) && server.myStatus !== "banned" ? server.myStatus : null;
    const [localStatus, setLocalStatus] = useState<"member" | "pending" | null>(initialStatus);

    const kindMeta = KIND_META[server.kind] ?? KIND_META.otro;
    const visMeta = VISIBILITY_META[server.visibility] ?? VISIBILITY_META.public;
    const Icon = kindMeta.icon;
    const VisIcon = visMeta.icon;
    const isOwner = hasSummary(server) ? server.isOwner : false;
    const memberCount = hasSummary(server) ? server.memberCount : undefined;

    const handleJoin = async () => {
        setJoining(true);
        try {
            const res = await joinOrRequest(server);
            if (res.needsAuth) {
                toast.error("Inicia sesión para unirte a un servidor.");
                return;
            }
            if (!res.ok) {
                toast.error("No se pudo procesar tu solicitud.");
                return;
            }
            if (res.joined) {
                setLocalStatus("member");
                toast.success(`Te uniste a «${server.name}».`);
            } else if (res.pending) {
                setLocalStatus("pending");
                toast.success("Solicitud enviada. El dueño debe aprobarla.");
            }
        } finally {
            setJoining(false);
        }
    };

    const handleOpen = () => {
        if (server.appRoute) {
            router.push(server.appRoute);
        } else if (server.appUrl) {
            window.open(server.appUrl, "_blank", "noopener,noreferrer");
        } else {
            onOpenPanel?.(server.slug);
        }
    };

    const handleShare = () => {
        router.push(`/messages?attachServer=${encodeURIComponent(server.slug)}`);
    };

    return (
        <Card className={cn("liquid-glass-panel border-white/10 overflow-hidden h-full", className)}>
            <CardContent className={cn("flex flex-col gap-3", compact ? "p-3" : "p-4")}>
                <div className="flex items-start gap-3">
                    <div className={cn("shrink-0 rounded-xl p-2.5 border", kindMeta.accent)}>
                        <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <button
                            type="button"
                            onClick={() => onOpenPanel?.(server.slug)}
                            className="cursor-pointer text-left"
                        >
                            <p className={cn("font-semibold text-foreground truncate hover:text-primary transition-colors", compact ? "text-sm" : "text-base")}>
                                {server.name}
                            </p>
                        </button>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", kindMeta.accent)}>
                                {kindMeta.label}
                            </Badge>
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                <VisIcon className="w-3 h-3" /> {visMeta.label}
                            </span>
                            {typeof memberCount === "number" && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <Users className="w-3 h-3" /> {memberCount.toLocaleString()}
                                </span>
                            )}
                            {isOwner && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-amber-300">
                                    <Crown className="w-3 h-3" /> Tuyo
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {server.description && !compact && (
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{server.description}</p>
                )}

                <div className="mt-auto flex items-center flex-wrap gap-2 pt-1">
                    {localStatus === "member" || isOwner ? (
                        <Button
                            size="sm"
                            onClick={handleOpen}
                            className="btn-pill h-8 cursor-pointer text-xs font-semibold"
                        >
                            <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Abrir
                        </Button>
                    ) : localStatus === "pending" ? (
                        <Button size="sm" variant="outline" disabled className="btn-pill h-8 text-xs font-semibold border-amber-500/30 text-amber-300">
                            <Clock3 className="w-3.5 h-3.5 mr-1.5" /> Pendiente
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            variant="default"
                            onClick={() => void handleJoin()}
                            disabled={joining}
                            className="btn-pill h-8 cursor-pointer text-xs font-semibold"
                        >
                            {joining ? (
                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            ) : (
                                <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            {server.visibility === "public" ? "Unirse" : "Solicitar"}
                        </Button>
                    )}

                    {onOpenPanel && (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onOpenPanel(server.slug)}
                            className="h-8 cursor-pointer text-xs text-muted-foreground hover:text-foreground"
                        >
                            Detalles
                        </Button>
                    )}

                    {!hideShare && (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleShare}
                            title="Compartir por mensaje"
                            className="ml-auto h-8 w-8 cursor-pointer p-0 text-muted-foreground hover:text-foreground"
                        >
                            <Share2 className="w-3.5 h-3.5" />
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

export default ServerCard;
