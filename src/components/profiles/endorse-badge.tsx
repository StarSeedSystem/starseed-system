"use client";

/*
 * EndorseBadge — AVAL de competencia ENTRE PARES (mérito legítimo, Adenda 127).
 * ----------------------------------------------------------------------------
 * Control compacto ("Avalar competencia" → diálogo pequeño) para conferir una
 * insignia de MÉRITO a la cuenta de OTRA persona. Es la vía que hace el mérito
 * usable y honesto: el mérito de gobernanza (src/lib/governance/merit.ts) SÓLO
 * cuenta las insignias otorgadas por OTRO (las auto-otorgadas dan cero). Al
 * avalar, awarded_by queda fijado en TU uid (≠ el titular) → esa insignia SÍ
 * pesa como mérito para esa persona.
 *
 * Principios (CLAUDE.md): TOLERANTE A FALLOS (nunca lanza; degrada en silencio),
 * ADITIVO (no monta nada por su cuenta; lo integra quien lo consume).
 *
 * NO RENDERIZA NADA si:
 *   · aún se resuelve la sesión,
 *   · no hay sesión (no hay avalador),
 *   · falta el perfil objetivo, o
 *   · el objetivo es UNO MISMO (no se puede auto-avalar).
 *
 * Estilo Crystal/Glass, alineado con GroupFacePicker / AccountProfilesSwitcher.
 *
 * Montaje sugerido: fila del censo de miembros o cabecera de perfil ajeno.
 */

import { useEffect, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
    Award,
    BadgeCheck,
    Check,
    GraduationCap,
    Handshake,
    Loader2,
    Scale,
    ShieldCheck,
    type LucideIcon,
} from "lucide-react";
import { endorseBadge, myProfileId } from "@/lib/badges/badges";

interface EndorsableItem {
    code: string;
    /** Etiqueta legible de la competencia. */
    label: string;
    /** Área temática (para orientar el reconocimiento). */
    areaLabel: string;
    icon: LucideIcon;
}

/*
 * Conjunto CURADO, alineado con ENDORSABLE_BADGE_CODES de badges.ts. Son
 * competencias que una comunidad puede reconocer en OTRA persona (no las
 * insignias "de acción", que se ganan haciendo).
 */
const ENDORSABLE: EndorsableItem[] = [
    { code: "legislator", label: "Legislador/a", areaLabel: "Política", icon: Scale },
    { code: "mediator", label: "Mediador/a", areaLabel: "Política", icon: Handshake },
    { code: "scholar", label: "Erudito/a", areaLabel: "Educación", icon: GraduationCap },
    { code: "verified", label: "Verificado/a", areaLabel: "General", icon: BadgeCheck },
];

export interface EndorseBadgeProps {
    /** Perfil de mérito objetivo (profiles.id). */
    targetProfileId: string;
    /** Perfil de mérito del ESPECTADOR (profiles.id) ya resuelto por el llamador
     *  (p.ej. el roster) para EVITAR una consulta por instancia. Si se omite, se
     *  resuelve internamente con myProfileId(). null = sin sesión. */
    viewerProfileId?: string | null;
    targetName?: string;
    className?: string;
}

export function EndorseBadge({ targetProfileId, viewerProfileId, targetName, className }: EndorseBadgeProps) {
    // undefined = resolviendo · null = sin sesión · string = mi profile id.
    const [mine, setMine] = useState<string | null | undefined>(
        viewerProfileId !== undefined ? viewerProfileId : undefined,
    );
    // Códigos ya avalados en esta sesión de UI (optimista).
    const [endorsed, setEndorsed] = useState<Set<string>>(() => new Set<string>());
    // Código en curso (evita dobles clics y muestra spinner).
    const [pending, setPending] = useState<string | null>(null);

    useEffect(() => {
        // Si el llamador ya resolvió el perfil del espectador (roster), se usa y se
        // EVITA una consulta por instancia. Si no, se resuelve con myProfileId().
        if (viewerProfileId !== undefined) {
            setMine(viewerProfileId);
            return;
        }
        let alive = true;
        (async () => {
            try {
                const id = await myProfileId();
                if (alive) setMine(id);
            } catch {
                // myProfileId ya es tolerante a fallos; esto es defensa extra.
                if (alive) setMine(null);
            }
        })();
        return () => {
            alive = false;
        };
    }, [viewerProfileId]);

    // Nada que mostrar mientras se resuelve la sesión, sin sesión, sin objetivo,
    // o cuando el objetivo eres TÚ (no puedes avalarte a ti mismo).
    if (mine === undefined) return null;
    if (!mine || !targetProfileId) return null;
    if (mine === targetProfileId) return null;

    async function handleEndorse(item: EndorsableItem) {
        if (pending || endorsed.has(item.code)) return;
        setPending(item.code);
        // Optimista: marca como avalada al instante.
        setEndorsed((prev) => {
            const next = new Set(prev);
            next.add(item.code);
            return next;
        });
        try {
            const res = await endorseBadge(targetProfileId, item.code);
            if (res.ok) {
                toast.success(
                    targetName
                        ? `Avalaste "${item.label}" a ${targetName}.`
                        : `Aval registrado: "${item.label}".`,
                );
            } else {
                // Revierte el optimismo y degrada con discreción.
                setEndorsed((prev) => {
                    const next = new Set(prev);
                    next.delete(item.code);
                    return next;
                });
                toast.error(res.error || "No se pudo registrar el aval.");
            }
        } catch {
            // endorseBadge no lanza; esto es defensa extra. Revertimos en silencio.
            setEndorsed((prev) => {
                const next = new Set(prev);
                next.delete(item.code);
                return next;
            });
        } finally {
            setPending(null);
        }
    }

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                        "gap-1.5 border-white/15 bg-white/[0.03] hover:bg-white/[0.08]",
                        className,
                    )}
                >
                    <Award className="h-3.5 w-3.5" />
                    Avalar competencia
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm border-white/10 bg-black/85 backdrop-blur-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        Avalar competencia
                    </DialogTitle>
                    <DialogDescription>
                        Reconoce una competencia{targetName ? ` de ${targetName}` : ""}. Elige
                        la insignia de mérito que quieras avalar.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-1.5">
                    {ENDORSABLE.map((item) => {
                        const Icon = item.icon;
                        const isDone = endorsed.has(item.code);
                        const isBusy = pending === item.code;
                        return (
                            <button
                                key={item.code}
                                type="button"
                                disabled={isDone || isBusy}
                                onClick={() => void handleEndorse(item)}
                                className={cn(
                                    "flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition-colors cursor-pointer",
                                    "hover:bg-white/[0.07] disabled:cursor-default",
                                    isDone && "border-emerald-400/30 bg-emerald-400/10",
                                )}
                            >
                                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/5 text-primary">
                                    <Icon className="h-4 w-4" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold leading-tight">
                                        {item.label}
                                    </p>
                                    <p className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">
                                        {item.areaLabel}
                                    </p>
                                </div>
                                {isBusy ? (
                                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                                ) : isDone ? (
                                    <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-emerald-300">
                                        <Check className="h-3.5 w-3.5" /> Avalada
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}
                </div>

                <p className="text-[11px] leading-snug text-muted-foreground">
                    Tu aval cuenta como mérito para esa persona (el auto-otorgamiento no
                    cuenta).
                </p>
            </DialogContent>
        </Dialog>
    );
}

export default EndorseBadge;
