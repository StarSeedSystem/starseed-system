"use client";
/**
 * Disposición por tamaño de los widgets de entidades (Ola 0929 · D): Comunidades, Mis grupos y
 * Entidades federativas comparten gramática — micro = la cifra · s = la destacada con su acción ·
 * m/torre = la lista con motivos · l = controles + lista con acción · xl = tarjetas con portada ·
 * panorámico = tarjetas en fila (o una tira de filas si no hay alto).
 */
import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Buscador, estilosSocial as estilos, tintaDe } from "./piezas";
import { Escudo, FilaEntidad, Pulso, TarjetaEntidad } from "./entidad-piezas";
import type { Puntuada } from "./entidades";
import { columnasQueCaben, filasQueCaben, type TamanoSocial } from "./tamano";
import { coincide, formatoNumero } from "./formato";

export interface PropsVistaEntidades {
    t: TamanoSocial;
    lista: Puntuada[];
    /** Botón de acción por entidad (unirse, seguir, invitar…). */
    accion: (p: Puntuada, soloIcono: boolean) => React.ReactNode;
    /** Controles de l/xl (segmentos de filtro). */
    controles?: React.ReactNode;
    /** Rótulo de la cifra en micro («comunidades», «grupos»…). */
    unidad: string;
    etiquetaLista: string;
    /** Detalle extra por fila (p. ej. el rol). */
    detalle?: (p: Puntuada) => React.ReactNode;
    buscable?: boolean;
    vacioFiltro?: React.ReactNode;
}

export function VistaEntidades({ t, lista, accion, controles, unidad, etiquetaLista, detalle, buscable = true, vacioFiltro }: PropsVistaEntidades) {
    const [consulta, setConsulta] = React.useState("");
    const filtrada = consulta.trim() ? lista.filter((p) => coincide(`${p.e.nombre} ${p.e.descripcion} ${p.e.etiquetas.join(" ")}`, consulta)) : lista;
    const top = lista[0];
    const sinNada = <p role="status" className="grid flex-1 place-items-center py-3 text-center text-[12px] text-white/55">{consulta ? `Nada coincide con «${consulta}».` : vacioFiltro ?? "Nada con este filtro."}</p>;

    if (t.base === "micro") {
        const lado = Math.max(40, Math.min(t.ancho, t.alto));
        return (
            <Link href={top ? top.e.href : "/hub"} aria-label={`${formatoNumero(lista.length)} ${unidad}${top ? `; destacada: ${top.e.nombre}` : ""}`} className="flex h-full cursor-pointer flex-col items-center justify-center gap-1">
                {top && <Escudo e={top.e} tam={Math.round(lado * 0.42)} />}
                <span className="text-[12px] font-semibold tabular-nums text-white/85">{formatoNumero(lista.length)} {unidad}</span>
            </Link>
        );
    }
    if (t.base === "s") {
        if (!top) return sinNada;
        return (
            <div className="flex h-full min-h-0 flex-col justify-center gap-2">
                <Link href={top.e.href} className="flex cursor-pointer items-center gap-2.5" aria-label={`${top.e.nombre}, ${top.e.claseEtiqueta}. ${top.motivos.join(", ")}`}>
                    <Escudo e={top.e} tam={40} />
                    <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-white">{top.e.nombre}</span>
                        <span className="block truncate text-[11px]" style={{ color: tintaDe(top.e.acento) }}>{top.e.claseEtiqueta}{detalle ? <> · {detalle(top)}</> : null}</span>
                    </span>
                </Link>
                <p className="line-clamp-2 text-[11.5px] text-white/60">{top.motivos.join(" · ") || top.e.descripcion}</p>
                <div>{accion(top, false)}</div>
            </div>
        );
    }
    const barra = (controles || buscable) && (t.base === "l" || t.base === "xl" || (t.clase === "panoramico" && t.alto >= 200)) ? (
        <div className="flex flex-wrap items-center gap-2">
            {controles}
            {buscable && t.ancho > 380 && <Buscador valor={consulta} onCambio={setConsulta} placeholder="Buscar por nombre o tema…" etiqueta={`Buscar ${unidad}`} acento={t.acento} tactil={t.tactil} className="min-w-[160px] flex-1" />}
        </div>
    ) : null;

    if (t.clase === "panoramico" || t.base === "xl") {
        if (t.clase === "panoramico" && t.alto < 200) {
            const cols = columnasQueCaben(t.ancho, 250, 1, 5);
            return (
                <ul className="grid h-full min-h-0 items-center gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }} aria-label={etiquetaLista}>
                    {lista.slice(0, cols).map((p) => <li key={p.e.id} className="min-w-0"><FilaEntidad p={p} acento={t.acento} tactil={t.tactil} derecha={accion(p, true)} /></li>)}
                </ul>
            );
        }
        const cols = t.clase === "panoramico" ? columnasQueCaben(t.ancho, 210, 1, 6) : columnasQueCaben(t.ancho, 195, 2, 4);
        const filas = t.clase === "panoramico" ? 1 : Math.max(1, Math.floor((t.alto - (barra ? 48 : 0)) / 225));
        return (
            <div className="flex h-full min-h-0 flex-col gap-2.5">
                {barra}
                {filtrada.length === 0 ? sinNada : (
                    <ul className="grid min-h-0 flex-1 auto-rows-fr gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }} aria-label={etiquetaLista}>
                        {filtrada.slice(0, cols * filas).map((p) => (
                            <li key={p.e.id} className="min-h-0"><TarjetaEntidad p={p} acento={t.acento} tactil={t.tactil} accion={accion(p, false)} altoPortada={t.clase === "panoramico" ? Math.max(56, Math.min(100, t.alto * 0.26)) : 72} /></li>
                        ))}
                    </ul>
                )}
            </div>
        );
    }
    const max = filasQueCaben(t.alto - (barra ? 48 : 0), t.tactil ? 62 : 52, 2, 10);
    return (
        <div className="flex h-full min-h-0 flex-col gap-2">
            {barra}
            {filtrada.length === 0 ? sinNada : (
                <ul className={cn("flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-0.5 ss-scroll", filtrada.length > max && estilos.desvanece)} aria-label={etiquetaLista}>
                    {filtrada.slice(0, max).map((p) => (
                        <li key={p.e.id} className={estilos.aparece}>
                            <FilaEntidad p={p} acento={t.acento} tactil={t.tactil}
                                detalle={detalle ? <> · {detalle(p)}</> : undefined}
                                derecha={
                                    <span className="flex shrink-0 items-center gap-2">
                                        {t.base === "l" && t.ancho > 420 && p.actividad && <Pulso serie={p.actividad.serie} color={p.e.acento} etiqueta={`Publicaciones de la semana en ${p.e.nombre}: ${p.actividad.serie.join(", ")}`} />}
                                        {accion(p, t.ancho < 340)}
                                    </span>
                                } />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
