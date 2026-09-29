"use client";
/**
 * Armazón de los widgets de una magnitud (temperatura, viento, humedad, UV, aire…): estados
 * honestos, cabecera con el lugar y el menú de acciones, sello de la fuente y el contexto de
 * datos listo. Cada widget solo decide su composición por tamaño.
 */
import * as React from "react";
import type { LucideIcon } from "lucide-react";
import type { ActualClima, AireReal, ClimaReal, DiaClima, HoraClima } from "@/modules/weather/datos/open-meteo";
import { diaDeHoy, proximasHoras } from "@/modules/weather/datos/open-meteo";
import { CargandoClima, ErrorClima, LugarClima, MarcoClima, MenuClima, RotuloClima, SelloFuente, SinUbicacion, type AccionExtra, type InfoMarco } from "./piezas";
import { useDatosClima } from "./use-clima";

export interface CtxMagnitud {
    info: InfoMarco;
    d: ReturnType<typeof useDatosClima>;
    c: ClimaReal;
    a: ActualClima;
    aire: AireReal | null;
    ahora: number;
    hoy: DiaClima | null;
    /** 24 h desde la actual. */
    prox: HoraClima[];
    id: string;
    menu: React.ReactNode;
    sello: React.ReactNode;
    /** Cabecera estándar: icono + título + lugar + menú. */
    cabecera: (titulo: string, extra?: React.ReactNode) => React.ReactNode;
}

export function WidgetMagnitud({ etiqueta, acento, acento2, icono: Icono, aire = false, principal = "clima", render, extra, ruta = "/clima" }: {
    etiqueta: string; acento: string; acento2: string; icono: LucideIcon; aire?: boolean | ((i: InfoMarco) => boolean);
    principal?: "clima" | "aire"; render: React.FC<CtxMagnitud>;
    /** Acciones propias del widget en el menú (p. ej. la unidad de presión). */
    extra?: AccionExtra[];
    /** Ruta de la app completa. */
    ruta?: string;
}) {
    return (
        <MarcoClima etiqueta={etiqueta} acento={acento} acento2={acento2}>
            {(info) => <Interior info={info} etiqueta={etiqueta} icono={Icono} aire={typeof aire === "function" ? aire(info) : aire} principal={principal} render={render} extra={extra} ruta={ruta} />}
        </MarcoClima>
    );
}

function Interior({ info, etiqueta, icono: Icono, aire, principal, render, extra, ruta }: {
    info: InfoMarco; etiqueta: string; icono: LucideIcon; aire: boolean; principal: "clima" | "aire"; render: React.FC<CtxMagnitud>; extra?: AccionExtra[]; ruta: string;
}) {
    const d = useDatosClima(info, { aire: aire || principal === "aire" });
    const id = React.useId().replace(/:/g, "");
    if (d.estado === "sin-ubicacion") return <SinUbicacion info={info} />;
    const fuente = principal === "aire" ? d.aire : d.clima;
    if (!fuente.datos && !fuente.error) return <CargandoClima base={info.base} />;
    if (principal === "aire" && !d.aire.datos) return <ErrorClima mensaje={d.aire.error ?? "Sin dato del aire"} onReintentar={d.aire.refrescar} />;
    if (!d.clima.datos) {
        if (d.clima.error) return <ErrorClima mensaje={d.clima.error} onReintentar={d.clima.refrescar} />;
        return <CargandoClima base={info.base} />;
    }
    const c = d.clima.datos;
    const ahora = d.ahora ?? c.actual.t;
    const menu = (
        <MenuClima info={info} ruta={ruta} rutaEtiqueta="Abrir el tiempo" extra={extra} alActualizar={() => { d.clima.refrescar(); if (aire || principal === "aire") d.aire.refrescar(); }} />
    );
    const fuenteTexto = principal === "aire" ? "Open-Meteo · CAMS" : "Open-Meteo";
    const sello = <SelloFuente fuente={fuenteTexto} en={principal === "aire" ? d.aire.en : d.clima.en} />;
    const cabecera = (titulo: string, extra?: React.ReactNode) => (
        <div className="flex min-w-0 items-center gap-2">
            <Icono aria-hidden className="size-4 shrink-0" style={{ color: info.acento }} />
            <div className="min-w-0 flex-1">
                <RotuloClima>{titulo}</RotuloClima>
                {(info.base === "m" || info.base === "l" || info.base === "xl") && d.ubicacion && <LugarClima nombre={d.ubicacion.nombre} elegida={d.ubicacion.elegida} className="text-[11px]" />}
            </div>
            {extra}
            {info.base !== "micro" && menu}
        </div>
    );
    return (
        <div className="relative h-full w-full" aria-label={etiqueta}>
            {React.createElement(render, { info, d, c, a: c.actual, aire: d.aire.datos, ahora, hoy: diaDeHoy(c.dias, ahora), prox: proximasHoras(c.horas, 24, ahora), id, menu, sello, cabecera })}
        </div>
    );
}

/** Rejilla de datos pequeños «etiqueta · valor · nota». */
export function Datos({ filas, columnas = 2 }: { filas: { t: string; v: string; n?: string; color?: string }[]; columnas?: number }) {
    return (
        <dl className="grid gap-x-3 gap-y-1.5" style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0,1fr))` }}>
            {filas.map((f) => (
                <div key={f.t} className="min-w-0" title={`${f.t}: ${f.v}${f.n ? ` (${f.n})` : ""}`}>
                    <dt className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50">{f.t}</dt>
                    <dd className="truncate text-[14px] font-semibold tabular-nums" style={{ color: f.color }}>{f.v}{f.n && <span className="ml-1 text-[11px] font-normal text-white/55">{f.n}</span>}</dd>
                </div>
            ))}
        </dl>
    );
}
