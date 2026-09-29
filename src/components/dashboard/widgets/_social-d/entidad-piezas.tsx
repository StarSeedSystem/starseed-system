"use client";
/**
 * Piezas de entidad del paquete D (Ola 0929): el escudo (avatar o emblema generado con su acento),
 * la fila, la tarjeta con portada, el pulso de actividad de 7 días y las acciones REALES de unirse
 * a un grupo (`os_memberships`) o seguir una página (`os_follows`).
 */
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Loader2, Plus, UserPlus, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { setFollow, setMembership } from "@/lib/os-social";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { mezclar } from "@/components/widgets-libres/familias/comun";
import { iniciales, formatoNumero, tonoDe } from "./formato";
import { urlSegura, estilosSocial as estilos, tintaDe } from "./piezas";
import type { EntidadVista, Puntuada } from "./entidades";

// ── Escudo ───────────────────────────────────────────────────────────

/** El emblema de una entidad: su avatar o, sin él, un hexágono de su acento con sus iniciales. */
export function Escudo({ e, tam = 36, className }: { e: Pick<EntidadVista, "nombre" | "avatar" | "acento" | "origen" | "slug">; tam?: number; className?: string }) {
    const [fallo, setFallo] = React.useState(false);
    const src = fallo ? null : urlSegura(e.avatar);
    const id = React.useId().replace(/:/g, "");
    const claro = mezclar(normal(e.acento), "#ffffff", 0.35);
    const oscuro = mezclar(normal(e.acento), "#0c0e22", 0.45);
    return (
        <span aria-hidden className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: tam, height: tam }}>
            {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFallo(true)}
                    className="size-full object-cover" style={{ borderRadius: e.origen === "grupo" ? "30%" : "9999px", boxShadow: `0 0 0 1.5px ${conAlfa(e.acento, 0.6)}` }} />
            ) : (
                <svg viewBox="0 0 40 40" width={tam} height={tam}>
                    <defs>
                        <radialGradient id={`esc-${id}`} cx="35%" cy="30%" r="80%">
                            <stop offset="0%" stopColor={claro} />
                            <stop offset="60%" stopColor={normal(e.acento)} />
                            <stop offset="100%" stopColor={oscuro} />
                        </radialGradient>
                    </defs>
                    {e.origen === "grupo"
                        ? <path d="M20 2 36 11v18L20 38 4 29V11Z" fill={`url(#esc-${id})`} stroke="#fff" strokeOpacity={0.25} />
                        : <circle cx={20} cy={20} r={18} fill={`url(#esc-${id})`} stroke="#fff" strokeOpacity={0.25} />}
                    <circle cx={20 + ((tonoDe(e.slug) % 7) - 3)} cy={11} r={2.2} fill="#fff" fillOpacity={0.35} />
                    <text x={20} y={25} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff">{iniciales(e.nombre)}</text>
                </svg>
            )}
        </span>
    );
}

function normal(c: string): string {
    return /^#([0-9a-f]{6})$/i.test(c) ? c : /^#([0-9a-f]{3})$/i.test(c) ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : "#7c5cff";
}

// ── Pulso de actividad (7 días) ──────────────────────────────────────

export function Pulso({ serie, color, ancho = 56, alto = 16, etiqueta }: { serie: number[]; color: string; ancho?: number; alto?: number; etiqueta?: string }) {
    const max = Math.max(1, ...serie);
    const w = ancho / serie.length;
    return (
        <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={etiqueta ?? `Actividad de 7 días: ${serie.join(", ")}`} className="shrink-0">
            {serie.map((v, i) => {
                const h = v === 0 ? 1.5 : Math.max(3, (v / max) * alto);
                return <rect key={i} x={i * w + 1} y={alto - h} width={Math.max(1, w - 2)} height={h} rx={1.5} fill={color} fillOpacity={v === 0 ? 0.2 : 0.55 + 0.45 * (v / max)} />;
            })}
        </svg>
    );
}

// ── Acciones reales: unirse / seguir ─────────────────────────────────

export type EstadoRelacion = "miembro" | "siguiendo" | "tuya" | null;

export function useAccionesEntidad(uid: string | null, miembroDe: Set<string>) {
    const [propias, setPropias] = React.useState<Record<string, EstadoRelacion>>({});
    const [enCurso, setEnCurso] = React.useState<string | null>(null);

    const relacion = React.useCallback((e: EntidadVista): EstadoRelacion => {
        if (uid && e.duenoId === uid) return "tuya";
        if (propias[e.id]) return propias[e.id];
        if (e.origen === "grupo" && miembroDe.has(e.slug)) return "miembro";
        return null;
    }, [uid, miembroDe, propias]);

    const actuar = React.useCallback(async (e: EntidadVista) => {
        if (enCurso) return;
        setEnCurso(e.id);
        try {
            const r = e.origen === "grupo" ? await setMembership(e.slug, true) : await setFollow(e.slug, true);
            if (r.ok) {
                setPropias((p) => ({ ...p, [e.id]: e.origen === "grupo" ? "miembro" : "siguiendo" }));
                toast.success(e.origen === "grupo" ? `Ya formas parte de ${e.nombre}.` : `Ahora sigues ${e.nombre}.`);
            } else {
                toast.error(r.needsAuth ? "Entra en tu cuenta para unirte o seguir." : "No se pudo completar. Inténtalo de nuevo.");
            }
        } finally {
            setEnCurso(null);
        }
    }, [enCurso]);

    return { relacion, actuar, enCurso };
}

export function BotonRelacion({ e, relacion, onActuar, enCurso, acento, tactil, soloIcono = false }: {
    e: EntidadVista;
    relacion: EstadoRelacion;
    onActuar: (e: EntidadVista) => void;
    enCurso: boolean;
    acento: string;
    tactil: boolean;
    soloIcono?: boolean;
}) {
    const alto = tactil ? "min-h-11 min-w-11" : "min-h-7 min-w-7";
    if (relacion) {
        const texto = relacion === "tuya" ? "Tuya" : relacion === "miembro" ? "Miembro" : "Siguiendo";
        return (
            <span className={cn("inline-flex shrink-0 items-center justify-center gap-1 rounded-full ss-redondo px-2.5 text-[11px] font-semibold", alto)}
                style={{ color: tintaDe(acento), background: conAlfa(acento, 0.1) }} aria-label={`${texto}: ${e.nombre}`}>
                <Check className="size-3.5" aria-hidden />{!soloIcono && texto}
            </span>
        );
    }
    const Icono: LucideIcon = enCurso ? Loader2 : e.origen === "grupo" ? UserPlus : Plus;
    const texto = e.origen === "grupo" ? "Unirme" : "Seguir";
    return (
        <button type="button" onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); onActuar(e); }} disabled={enCurso}
            aria-label={`${texto} a ${e.nombre}`} title={`${texto} a ${e.nombre}`}
            className={cn("inline-flex shrink-0 cursor-pointer items-center justify-center gap-1 rounded-full ss-redondo px-2.5 text-[11px] font-semibold text-white transition-transform duration-200 hover:-translate-y-px disabled:cursor-wait", alto)}
            style={{ background: conAlfa(acento, 0.16), boxShadow: `inset 0 0 0 1px ${conAlfa(acento, 0.5)}` }}>
            <Icono className={cn("size-3.5", enCurso && "animate-spin motion-reduce:animate-none")} aria-hidden />{!soloIcono && texto}
        </button>
    );
}

// ── Fila y tarjeta ───────────────────────────────────────────────────

export function FilaEntidad({ p, acento, tactil, derecha, detalle }: { p: Puntuada; acento: string; tactil: boolean; derecha?: React.ReactNode; detalle?: React.ReactNode }) {
    const e = p.e;
    return (
        <div className={cn(estilos.fila, "flex items-center gap-2.5 px-2", tactil ? "py-2" : "py-1.5")}>
            <Link href={e.href} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5" aria-label={`${e.nombre}, ${e.claseEtiqueta}. ${p.motivos.join(", ")}`}>
                <Escudo e={e} tam={tactil ? 40 : 34} />
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-white">{e.nombre}</span>
                        {p.nueva && <span className="shrink-0 rounded-full ss-redondo px-1.5 text-[9.5px] font-bold uppercase tracking-[0.1em]" style={{ color: tintaDe(acento), background: conAlfa(acento, 0.14) }}>nueva</span>}
                    </span>
                    <span className="block truncate text-[11.5px] text-white/55">
                        <span style={{ color: tintaDe(e.acento) }}>{e.claseEtiqueta}</span>
                        {detalle ?? (p.motivos.length ? ` · ${p.motivos.filter((m) => m !== "nueva").slice(0, 2).join(" · ")}` : "")}
                    </span>
                </span>
            </Link>
            {derecha}
        </div>
    );
}

export function TarjetaEntidad({ p, acento, tactil, accion, altoPortada = 72 }: { p: Puntuada; acento: string; tactil: boolean; accion?: React.ReactNode; altoPortada?: number }) {
    const e = p.e;
    const portada = urlSegura(e.portada);
    const [fallo, setFallo] = React.useState(false);
    const tono = tonoDe(e.slug);
    return (
        <article className={cn(estilos.tarjeta, "relative flex h-full min-w-0 flex-col overflow-hidden rounded-[18px]")}
            style={{ background: `linear-gradient(175deg, ${conAlfa(e.acento, 0.16)}, rgba(255,255,255,.02) 60%)` }} aria-label={`${e.nombre}, ${e.claseEtiqueta}`}>
            <Link href={e.href} className="relative block shrink-0 cursor-pointer" style={{ height: altoPortada }} tabIndex={-1} aria-hidden>
                {portada && !fallo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={portada} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFallo(true)} className="size-full object-cover" />
                ) : (
                    <svg className="size-full" viewBox="0 0 200 80" preserveAspectRatio="xMidYMid slice" aria-hidden>
                        <defs>
                            <linearGradient id={`pt-${e.id}`} x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stopColor={e.acento} stopOpacity={0.55} />
                                <stop offset="100%" stopColor="#0c0e22" stopOpacity={0.4} />
                            </linearGradient>
                        </defs>
                        <rect width={200} height={80} fill={`url(#pt-${e.id})`} />
                        {Array.from({ length: 5 }, (_, i) => (
                            <circle key={i} cx={30 + ((tono * (i + 3)) % 160)} cy={10 + ((tono * (i + 7)) % 60)} r={8 + ((tono + i * 13) % 22)} fill="#fff" fillOpacity={0.05 + (i % 3) * 0.03} />
                        ))}
                    </svg>
                )}
                <span className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent 40%, rgba(8,9,24,.55))" }} />
            </Link>
            <div className="relative -mt-5 flex min-h-0 flex-1 flex-col gap-1.5 px-2.5 pb-2.5">
                <div className="flex items-end gap-2">
                    <Escudo e={e} tam={38} className="drop-shadow-[0_4px_10px_rgba(0,0,0,.5)]" />
                    <span className="mb-0.5 truncate text-[10.5px] font-semibold uppercase tracking-[0.1em]" style={{ color: tintaDe(e.acento) }}>{e.claseEtiqueta}</span>
                </div>
                <Link href={e.href} className="line-clamp-1 cursor-pointer text-[13.5px] font-semibold text-white hover:underline">{e.nombre}</Link>
                {e.descripcion && <p className="line-clamp-2 text-[11.5px] leading-snug text-white/60">{e.descripcion}</p>}
                <div className="mt-auto flex items-center gap-2 pt-1">
                    <span className="inline-flex min-w-0 items-center gap-1 text-[11px] tabular-nums text-white/60" title={p.motivos.join(" · ")}>
                        <Users className="size-3 shrink-0" aria-hidden />{formatoNumero(e.miembros)}
                        {p.actividad && p.actividad.semana > 0 && <span className="truncate"> · {p.actividad.semana} esta semana</span>}
                    </span>
                    <span className="ml-auto">{accion}</span>
                </div>
            </div>
            {p.nueva && (
                <span className="absolute right-2 top-2 rounded-full ss-redondo px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-white" style={{ background: conAlfa(acento, 0.55) }}>nueva</span>
            )}
        </article>
    );
}
