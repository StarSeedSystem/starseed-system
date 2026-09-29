"use client";
/**
 * MarcoSocial (Ola 0929 · D) — el cascarón de los widgets del paquete «Social, red y archivos».
 *
 * Mismo contrato de estados que el marco común (error > cargando > vacío > listo, más «sin
 * sesión»), con dos diferencias que el dueño pidió: el vacío SIEMPRE ofrece la acción real que lo
 * llena (crear, conectar, entrar), y el esqueleto tiene la forma del contenido que viene (lista,
 * rejilla, tarjetas, cifras). Dentro del marco unificado la cabecera es la común (icono fantasma +
 * Rotulo + acciones fantasma); fuera de él (Mando, Estudio, «marco clásico»), una tarjeta sobria.
 *
 * Publica `data-testid="marco-widget"`, `data-estado`, `data-tamano` y `data-dispositivo`, y pausa
 * sus animaciones fuera de pantalla (`data-en-pantalla`).
 */
import * as React from "react";
import { LogIn, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CabeceraMarco, ESPACIADO_MARCO } from "@/components/widgets-libres/marco-unificado";
import { WidgetEmptyState, WidgetErrorState } from "@/components/dashboard/kit";
import { mensajeError, mensajeVacio } from "@/components/dashboard/calidad-widget";
import { useNivelRender } from "@/lib/widgets/forma/nivel-dispositivo";
import { useEnPantalla } from "./fuente-compartida";
import { useTamanoSocial, type TamanoSocial } from "./tamano";
import { Esqueleto, type FormaEsqueleto } from "./piezas";
import estilos from "./social.module.css";

export type EstadoSocial = "cargando" | "vacio" | "error" | "sin-sesion" | "listo";

export interface AccionVacio {
    etiqueta: string;
    href?: string;
    onClick?: () => void;
}

export interface MarcoSocialProps {
    titulo: string;
    subtitulo?: string | ((t: TamanoSocial) => string | undefined);
    icono: LucideIcon;
    /** Categoría para el título honesto del vacío (`mensajeVacio`). */
    categoria: string;
    /** Acento cuando el widget vive fuera del marco unificado. */
    acento: string;
    acento2?: string;
    estado: EstadoSocial;
    error?: unknown;
    onReintentar?: () => void;
    vacio?: { titulo?: string; mensaje?: string; accion?: AccionVacio; icono?: LucideIcon };
    sinSesion?: { mensaje?: string; href?: string };
    esqueleto?: FormaEsqueleto;
    /** Acciones de la cabecera (se ocultan en «micro»). */
    acciones?: React.ReactNode | ((t: TamanoSocial) => React.ReactNode);
    vivo?: boolean;
    /** En «micro» la cabecera desaparece y el cuerpo es el glifo (por defecto sí). */
    microSinCabecera?: boolean;
    pie?: React.ReactNode | ((t: TamanoSocial) => React.ReactNode);
    /** Sin relleno propio del cuerpo (escenas a sangre). */
    sangre?: boolean;
    children: (t: TamanoSocial) => React.ReactNode;
}

export function MarcoSocial(p: MarcoSocialProps) {
    const { ref, tamano: t } = useTamanoSocial<HTMLDivElement>(p.acento, p.acento2);
    const raizRef = React.useRef<HTMLElement | null>(null);
    const enPantalla = useEnPantalla(raizRef);
    const nivel = useNivelRender();
    const micro = t.base === "micro";
    const sinCabecera = micro && p.microSinCabecera !== false && p.estado === "listo";
    const esp = ESPACIADO_MARCO[t.base];
    const subtitulo = typeof p.subtitulo === "function" ? p.subtitulo(t) : p.subtitulo;
    const acciones = typeof p.acciones === "function" ? p.acciones(t) : p.acciones;
    const pie = typeof p.pie === "function" ? p.pie(t) : p.pie;

    const cabecera = sinCabecera ? null : t.enMarco ? (
        <CabeceraMarco titulo={p.titulo} subtitulo={subtitulo} icono={p.icono} acciones={p.estado === "listo" ? acciones : undefined}
            vivo={p.vivo && p.estado === "listo"} acento={t.acento} base={t.base} horizontal={t.horizontal} espaciado={esp} />
    ) : (
        <header className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-2.5">
            <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-[9px]" style={{ background: `${t.acento}1f`, boxShadow: `inset 0 0 0 1px ${t.acento}66` }}>
                <p.icono className="size-3.5 text-white" />
            </span>
            <div className="min-w-0 flex-1">
                <h3 className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">{p.titulo}</h3>
                {subtitulo && !micro && <p className="truncate text-[11px] text-white/50">{subtitulo}</p>}
            </div>
            {p.estado === "listo" && acciones && !micro && <div className="flex shrink-0 items-center gap-1">{acciones}</div>}
        </header>
    );

    let cuerpo: React.ReactNode;
    if (p.estado === "cargando") {
        cuerpo = <Esqueleto forma={p.esqueleto ?? "lista"} filas={t.base === "s" || micro ? 2 : 3} />;
    } else if (p.estado === "error") {
        const m = mensajeError(p.error);
        cuerpo = <WidgetErrorState message={`${m.titulo}. ${m.detalle}`} onRetry={m.reintentable ? p.onReintentar : undefined} />;
    } else if (p.estado === "sin-sesion") {
        cuerpo = (
            <WidgetEmptyState icon={LogIn} title="Entra en tu cuenta" message={micro ? undefined : p.sinSesion?.mensaje ?? "Lo tuyo se ve al entrar: nada se muestra sin sesión."}
                actionLabel="Entrar" actionHref={p.sinSesion?.href ?? "/login"} accent={t.acento} />
        );
    } else if (p.estado === "vacio") {
        const base = mensajeVacio(p.categoria);
        cuerpo = (
            <WidgetEmptyState icon={p.vacio?.icono ?? Sparkles} title={p.vacio?.titulo ?? base.titulo} message={micro ? undefined : p.vacio?.mensaje ?? base.ayuda}
                actionLabel={p.vacio?.accion?.etiqueta} actionHref={p.vacio?.accion?.href} onAction={p.vacio?.accion?.onClick} accent={t.acento} />
        );
    } else {
        cuerpo = p.children(t);
    }

    return (
        <section
            ref={raizRef}
            data-testid="marco-widget"
            data-estado={p.estado === "sin-sesion" ? "vacio" : p.estado}
            data-sesion={p.estado === "sin-sesion" ? "no" : undefined}
            data-tamano={t.clase}
            data-dispositivo={t.dispositivo}
            data-en-pantalla={enPantalla ? "si" : "no"}
            data-nivel={nivel}
            role="region"
            aria-label={p.titulo}
            aria-busy={p.estado === "cargando" || undefined}
            className={cn(
                estilos.raiz,
                "overflow-hidden text-white",
                !t.enMarco && "rounded-2xl border border-white/10 bg-[rgba(12,14,34,.62)] backdrop-blur-xl",
            )}
            style={{ ["--social-acento" as string]: t.acento, ["--social-acento-2" as string]: t.acento2 } as React.CSSProperties}
        >
            {cabecera}
            <div ref={ref} className={cn(estilos.cuerpo, !p.sangre && (sinCabecera ? "p-2" : t.enMarco ? esp.cuerpo : "px-3 pb-3"))}>
                {cuerpo}
            </div>
            {pie && p.estado === "listo" && !micro && <footer className={cn("relative shrink-0", t.enMarco ? esp.pie : "px-3 pb-2.5 pt-1.5")}>{pie}</footer>}
        </section>
    );
}

/** Estado honesto a partir de las señales de una fuente. */
export function estadoSocial(e: { cargando: boolean; hayDatos: boolean; error?: unknown; sinSesion?: boolean }): EstadoSocial {
    if (e.sinSesion) return "sin-sesion";
    if (e.error && !e.hayDatos) return "error";
    if (e.cargando && !e.hayDatos) return "cargando";
    if (!e.hayDatos) return "vacio";
    return "listo";
}
