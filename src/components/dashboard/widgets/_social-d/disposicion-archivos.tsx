"use client";
/**
 * Disposición por tamaño de los widgets de archivos (Ola 0929 · D): memorias, baúles y archivos
 * comparten la misma gramática — micro = la cifra · s = su composición por tipo · m = las cuatro
 * últimas hojas · torre = la columna · l = explorador (búsqueda, tipo, rejilla/lista) · xl =
 * composición + explorador · panorámico = composición + hojas en fila.
 */
import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { BarraExplorador, Coleccion, DonaTipos, FilaArchivo, Hoja, LeyendaTipos, useExplorador, type ArchivoVista } from "./archivos-piezas";
import { Pastilla, estilosSocial as estilos } from "./piezas";
import { columnasQueCaben, filasQueCaben, type TamanoSocial } from "./tamano";
import { formatoNumero } from "./formato";

export interface TextosArchivos {
    singular: string;
    plural: string;
    buscar: string;
    hrefTodo: string;
    etiquetaTodo: string;
    icono: LucideIcon;
}

export function DisposicionArchivos({ t, archivos, textos, ex }: { t: TamanoSocial; archivos: ArchivoVista[]; textos: TextosArchivos; ex: ReturnType<typeof useExplorador> }) {
    const n = archivos.length;
    const cifra = `${formatoNumero(n)} ${n === 1 ? textos.singular : textos.plural}`;
    if (t.base === "micro") {
        const lado = Math.max(40, Math.min(t.ancho, t.alto));
        return (
            <Link href={textos.hrefTodo} aria-label={`${cifra}. ${textos.etiquetaTodo}`} className="flex h-full cursor-pointer flex-col items-center justify-center gap-1">
                <textos.icono aria-hidden className="text-white/80" style={{ width: lado * 0.22, height: lado * 0.22 }} strokeWidth={1.5} />
                <span className="font-light tabular-nums text-white" style={{ fontSize: lado * 0.3, lineHeight: 1 }}>{formatoNumero(n)}</span>
            </Link>
        );
    }
    if (t.base === "s") {
        const ultimo = archivos[0];
        return (
            <div className="flex h-full min-h-0 items-center gap-3">
                <DonaTipos tipos={ex.tipos.map((x) => ({ t: x.t, n: x.n }))} lado={Math.max(64, Math.min(t.alto, t.ancho * 0.45, 110))} centro={formatoNumero(n)} />
                <div className="min-w-0">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/55">Lo último</p>
                    <Link href={ultimo.href} className="line-clamp-2 cursor-pointer text-[12.5px] font-semibold leading-snug text-white hover:underline">{ultimo.nombre}</Link>
                    <p className="truncate text-[11px] text-white/55">{ultimo.tipo.etiqueta}</p>
                </div>
            </div>
        );
    }
    if (t.clase === "m") {
        if (t.ancho < 260) {
            return <ul className="flex h-full min-h-0 flex-col gap-0.5 overflow-y-auto ss-scroll" aria-label="Elementos">{archivos.slice(0, filasQueCaben(t.alto, 44, 2, 6)).map((a) => <li key={a.id}><FilaArchivo a={a} t={t} /></li>)}</ul>;
        }
        const filas = t.alto > 230 ? 2 : 1;
        return (
            <ul className="grid h-full min-h-0 auto-rows-fr grid-cols-2 gap-2.5" aria-label="Elementos">
                {archivos.slice(0, 2 * filas).map((a) => <li key={a.id} className="min-h-0"><Hoja a={a} t={t} /></li>)}
            </ul>
        );
    }
    if (t.clase === "torre") {
        return (
            <ul className={cn("flex h-full min-h-0 flex-col gap-0.5 overflow-y-auto pr-0.5 ss-scroll", estilos.desvanece)} aria-label="Elementos">
                {archivos.map((a) => <li key={a.id}><FilaArchivo a={a} t={t} /></li>)}
            </ul>
        );
    }
    const tipos = ex.tipos.map((x) => ({ t: x.t, n: x.n }));
    if (t.clase === "panoramico") {
        const alto = Math.max(70, t.alto);
        const cols = columnasQueCaben(t.ancho - 220, Math.max(140, alto * 0.8), 1, 6);
        return (
            <div className="flex h-full min-h-0 items-stretch gap-4">
                {t.alto >= 110 && (
                    <div className="flex shrink-0 items-center gap-3">
                        <DonaTipos tipos={tipos} lado={Math.min(alto, 120)} centro={formatoNumero(n)} />
                        <div className="w-[110px]"><LeyendaTipos tipos={tipos} max={4} /></div>
                    </div>
                )}
                <ul className="grid min-h-0 min-w-0 flex-1 gap-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }} aria-label="Elementos">
                    {archivos.slice(0, cols).map((a) => <li key={a.id} className="min-h-0">{t.alto >= 110 ? <Hoja a={a} t={t} /> : <FilaArchivo a={a} t={t} />}</li>)}
                </ul>
            </div>
        );
    }
    // l y xl: el explorador.
    const grande = t.base === "xl";
    const cols = columnasQueCaben(t.ancho - (grande ? 190 : 0), 150, 2, 5);
    const filas = Math.max(1, Math.floor((t.alto - 50) / 150));
    return (
        <div className="flex h-full min-h-0 flex-col gap-2.5">
            <BarraExplorador t={t} ex={ex} etiqueta={`Buscar ${textos.plural}`} placeholder={textos.buscar} />
            <div className={cn("grid min-h-0 flex-1 gap-4", grande ? "grid-cols-[170px_minmax(0,1fr)]" : "grid-cols-1")}>
                {grande && (
                    <aside className="flex min-h-0 flex-col items-center gap-3 rounded-[18px] p-3" style={{ background: `radial-gradient(120% 90% at 50% 0%, ${conAlfa(t.acento, 0.14)}, transparent 70%)` }} aria-label="Composición">
                        <DonaTipos tipos={tipos} lado={120} centro={formatoNumero(n)} sub={n === 1 ? textos.singular : textos.plural} />
                        <LeyendaTipos tipos={tipos} max={6} />
                        <Pastilla acento={t.acento} href={textos.hrefTodo} tactil={t.tactil} className="mt-auto">{textos.etiquetaTodo}</Pastilla>
                    </aside>
                )}
                <Coleccion t={t} archivos={ex.visibles} modo={ex.modo} cols={cols} filas={filas} vacio={ex.consulta ? `Nada coincide con «${ex.consulta}».` : "Nada de este tipo."} />
            </div>
        </div>
    );
}
