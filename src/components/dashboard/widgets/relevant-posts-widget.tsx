'use client';

// ════════════════════════════════════════════════════════════════
// RelevantPostsWidget — lo que más resuena, con señales REALES (Ola 0929 · D)
// ----------------------------------------------------------------
// Dos fuentes reales, una sola voz: el Lienzo de la Red (`posts`, las
// mismas publicaciones de /network, con reacciones de `os_post_likes`) y
// las creaciones del Café (`cafe_posts`). El orden se explica: reacciones,
// comentarios y frescura (1 + reacciones + 2·comentarios) / (horas + 2)^1,4
// — sin resonancias deterministas ni «engagement» sintético: si una
// publicación no tiene señales, dice cero.
// Acciones: resonar y guardar en tu biblioteca (Lienzo), leer dentro del
// widget (Café, que no tiene página propia en el OS) y abrir la
// conversación. Lecturas compartidas con el Feed de la Red y la Corriente
// cultural (mismas claves): tenerlos juntos no cuesta más tráfico.
//
// micro = la voz que más resuena · s = la publicación número uno · m/torre
// = el podio · l = orden (relevantes/recientes) + origen + acciones · xl =
// portada + podio · panorámico = el podio en tarjetas. Estados: cargando,
// vacío honesto del marco común con «Publicar», error con reintento solo
// si fallan las dos fuentes.
// ════════════════════════════════════════════════════════════════

import * as React from 'react';
import Link from 'next/link';
import { Coffee, Flame, Layers, PenSquare, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { conAlfa } from '@/components/widgets-libres/acentos-categoria';
import { MarcoSocial, estadoSocial } from './_social-d/marco-social';
import { useEnPantalla, useFuenteCompartida } from './_social-d/fuente-compartida';
import { cargarFeedRed, type FeedRed } from './_social-d/feed-red-datos';
import { cargarCafe, type CreacionCafe } from './_social-d/cafe-datos';
import { useAccionesRed } from './_social-d/acciones-red';
import { vistaDeCafe, vistaDeRed, porRelevancia, type Origen, type PublicacionConOrigen } from './_social-d/vistas';
import { BotonActualizar, BotonIcono, Pastilla, Segmentos, Avatar, estilosSocial as estilos, tintaDe } from './_social-d/piezas';
import { BarraAcciones, FilaPublicacion, LectorPublicacion, PortadaPublicacion, TarjetaPublicacion, textoDe, type AccionesPublicacion, type PublicacionVista } from './_social-d/publicaciones';
import { columnasQueCaben, filasQueCaben, type TamanoSocial } from './_social-d/tamano';
import { formatoNumero } from './_social-d/formato';

const ACENTO = '#a855f7';
const INTERVALO_RED = 10 * 60_000;

type Orden = 'relevantes' | 'recientes';
type FiltroOrigen = 'todo' | Origen;

export function RelevantPostsWidget() {
    const refRaiz = React.useRef<HTMLDivElement | null>(null);
    const enPantalla = useEnPantalla(refRaiz);
    const red = useFuenteCompartida<FeedRed>('red:feed', () => cargarFeedRed(12), { intervaloMs: INTERVALO_RED, enPantalla });
    const cafe = useFuenteCompartida<CreacionCafe[]>('cafe:publicaciones', cargarCafe, { enPantalla });
    const { resonar, guardar, guardadas } = useAccionesRed(red);
    const [orden, setOrden] = React.useState<Orden>('relevantes');
    const [origen, setOrigen] = React.useState<FiltroOrigen>('todo');
    const [leyendo, setLeyendo] = React.useState<string | null>(null);

    const todas: PublicacionConOrigen[] = React.useMemo(() => {
        const lista = [...(red.datos?.publicaciones ?? []).map(vistaDeRed), ...(cafe.datos ?? []).map(vistaDeCafe)];
        return porRelevancia(lista, Date.now());
    }, [red.datos, cafe.datos]);

    const visibles = React.useMemo(() => {
        const l = origen === 'todo' ? todas : todas.filter((p) => p.origen === origen);
        return orden === 'recientes' ? [...l].sort((a, b) => b.ms - a.ms) : l;
    }, [todas, orden, origen]);

    const nRed = todas.filter((p) => p.origen === 'red').length;
    const nCafe = todas.length - nRed;

    // Fallo honesto: solo si NINGUNA fuente respondió. Con una viva, se enseña lo que hay.
    const ambasFallan = !!red.fallo && !!cafe.fallo && !red.datos && !cafe.datos;
    const cargando = (red.cargando && !red.fallo && !red.detenida) || (cafe.cargando && !cafe.fallo && !cafe.detenida);
    const estado = estadoSocial({ cargando, hayDatos: todas.length > 0, error: ambasFallan ? new Error(cafe.fallo?.message || 'fuente') : undefined });
    const recargar = () => { red.recargar(); cafe.recargar(); };

    const abrirCafe = (p: PublicacionVista) => setLeyendo(p.id);
    const accionesDe = (p: PublicacionConOrigen): AccionesPublicacion => (p.origen === 'red'
        ? { onResonar: resonar, onGuardar: guardar, guardadas, etiquetaGuardar: 'Guardar en tu biblioteca' }
        : { onAbrir: abrirCafe });
    const lectura = leyendo ? todas.find((p) => p.id === leyendo) ?? null : null;

    return (
        <div ref={refRaiz} className="h-full w-full">
            <MarcoSocial
                titulo="Publicaciones Relevantes"
                subtitulo={`${formatoNumero(todas.length)} publicaciones · orden por señales reales`}
                icono={Layers}
                categoria="social"
                acento={ACENTO}
                estado={estado}
                error={ambasFallan ? new Error(cafe.fallo?.message || 'fuente') : undefined}
                onReintentar={recargar}
                esqueleto="lista"
                vacio={{ accion: { etiqueta: 'Publicar', href: '/publicar' } }}
                acciones={(t) => (
                    <>
                        <BotonActualizar onClick={recargar} actualizando={red.actualizando || cafe.actualizando} actualizado={Math.max(red.actualizado, cafe.actualizado)} acento={t.acento} tactil={t.tactil} />
                        <BotonIcono icono={PenSquare} etiqueta="Publicar" href="/publicar" acento={t.acento} tactil={t.tactil} />
                    </>
                )}
            >
                {(t) => {
                    if (lectura && t.base !== 'micro' && t.base !== 's') {
                        return (
                            <LectorPublicacion p={lectura} acento={t.acento} tactil={t.tactil} onCerrar={() => setLeyendo(null)} acciones={accionesDe(lectura)}
                                pie={<Link href="/network/culture" className="cursor-pointer text-[11.5px] font-semibold hover:underline" style={{ color: tintaDe(t.acento) }}>Ver la corriente cultural</Link>} />
                        );
                    }
                    const top = todas[0];
                    if (t.base === 'micro') {
                        return (
                            <Link href={top.origen === 'red' ? top.href : '/network/culture'} aria-label={`Lo que más resuena: ${top.autor}, ${textoDe(top)}. ${top.reacciones} reacciones`}
                                className="flex h-full cursor-pointer flex-col items-center justify-center gap-1">
                                <Avatar nombre={top.autor} url={top.avatar} tam={Math.max(30, Math.min(t.ancho, t.alto) * 0.46)} anillo acento={t.acento} />
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums text-white/80"><Flame className="size-3" aria-hidden />{formatoNumero(top.reacciones)}</span>
                            </Link>
                        );
                    }
                    if (t.base === 's') {
                        return (
                            <div className="flex h-full min-h-0 flex-col justify-center gap-1.5">
                                <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: tintaDe(t.acento) }}><Flame className="size-3" aria-hidden />Número uno</span>
                                <FilaPublicacion p={top} acento={t.acento} tactil={t.tactil} lineas={3} miniatura={false} />
                            </div>
                        );
                    }
                    if (t.clase === 'panoramico') {
                        if (t.alto < 200) {
                            const cols = columnasQueCaben(t.ancho, 260, 1, 5);
                            return (
                                <ol className="grid h-full min-h-0 items-center gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }} aria-label="Podio">
                                    {visibles.slice(0, cols).map((p, i) => <li key={p.id} className="min-w-0"><FilaPublicacion p={p} acento={t.acento} tactil={t.tactil} lineas={1} miniatura={false} onAbrir={p.origen === 'cafe' ? abrirCafe : undefined} antes={<Rango n={i + 1} t={t} />} /></li>)}
                                </ol>
                            );
                        }
                        const cols = columnasQueCaben(t.ancho, 220, 2, 5);
                        return (
                            <div className="flex h-full min-h-0 flex-col gap-2">
                                <Controles t={t} orden={orden} setOrden={setOrden} origen={origen} setOrigen={setOrigen} nRed={nRed} nCafe={nCafe} />
                                <ol className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }} aria-label="Podio">
                                    {visibles.slice(0, cols).map((p, i) => (
                                        <li key={p.id} className="relative min-h-0">
                                            <TarjetaPublicacion p={p} acento={t.acento} tactil={t.tactil} acciones={accionesDe(p)} altoMedia={Math.max(70, Math.min(150, t.alto * 0.34))} />
                                            <span className="absolute left-3 top-3"><Rango n={i + 1} t={t} flotante /></span>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        );
                    }
                    if (t.base === 'xl') {
                        const portada = visibles.find((p) => p.media) ?? visibles[0];
                        const resto = visibles.filter((p) => p.id !== portada?.id);
                        return (
                            <div className="flex h-full min-h-0 flex-col gap-2.5">
                                <Controles t={t} orden={orden} setOrden={setOrden} origen={origen} setOrigen={setOrigen} nRed={nRed} nCafe={nCafe} />
                                {portada ? (
                                    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
                                        <PortadaPublicacion p={portada} acento={t.acento} tactil={t.tactil} acciones={accionesDe(portada)} />
                                        <Podio t={t} lista={resto} desde={2} max={filasQueCaben(t.alto - 50, 84, 2, 6)} accionesDe={accionesDe} abrirCafe={abrirCafe} />
                                    </div>
                                ) : <SinFiltro t={t} onTodo={() => setOrigen('todo')} />}
                            </div>
                        );
                    }
                    const conControles = t.base === 'l';
                    return (
                        <div className="flex h-full min-h-0 flex-col gap-2">
                            {conControles && <Controles t={t} orden={orden} setOrden={setOrden} origen={origen} setOrigen={setOrigen} nRed={nRed} nCafe={nCafe} />}
                            {(conControles ? visibles : todas).length === 0
                                ? <SinFiltro t={t} onTodo={() => setOrigen('todo')} />
                                : <Podio t={t} lista={conControles ? visibles : todas} desde={1} max={filasQueCaben(t.alto - (conControles ? 44 : 0), conControles ? 104 : 78, 2, 7)} accionesDe={conControles ? accionesDe : undefined} abrirCafe={abrirCafe} />}
                        </div>
                    );
                }}
            </MarcoSocial>
        </div>
    );
}

function Rango({ n, t, flotante = false }: { n: number; t: TamanoSocial; flotante?: boolean }) {
    return (
        <span aria-label={`Puesto ${n}`} className={cn('grid shrink-0 place-items-center rounded-full ss-redondo font-light tabular-nums text-white', flotante ? 'size-7 text-[13px]' : 'size-7 text-[15px]')}
            style={{ background: n === 1 ? conAlfa(t.acento, 0.55) : flotante ? 'rgba(8,9,24,.65)' : conAlfa(t.acento, 0.14), boxShadow: n === 1 ? `0 0 14px ${conAlfa(t.acento, 0.6)}` : undefined }}>
            {n}
        </span>
    );
}

function Controles({ t, orden, setOrden, origen, setOrigen, nRed, nCafe }: {
    t: TamanoSocial; orden: Orden; setOrden: (o: Orden) => void; origen: FiltroOrigen; setOrigen: (o: FiltroOrigen) => void; nRed: number; nCafe: number;
}) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <Segmentos<Orden> etiqueta="Orden" acento={t.acento} tactil={t.tactil} valor={orden} onCambio={setOrden}
                opciones={[{ id: 'relevantes', etiqueta: 'Relevantes', icono: Flame }, { id: 'recientes', etiqueta: 'Recientes', icono: Sparkles }]} />
            {nRed > 0 && nCafe > 0 && (
                <Segmentos<FiltroOrigen> etiqueta="Origen" acento={t.acento} tactil={t.tactil} valor={origen} onCambio={setOrigen}
                    opciones={[{ id: 'todo', etiqueta: 'Todo' }, { id: 'red', etiqueta: 'Red', n: nRed, icono: Layers }, { id: 'cafe', etiqueta: 'Café', n: nCafe, icono: Coffee }]} />
            )}
        </div>
    );
}

function Podio({ t, lista, desde, max, accionesDe, abrirCafe }: {
    t: TamanoSocial;
    lista: PublicacionConOrigen[];
    desde: number;
    max: number;
    accionesDe?: (p: PublicacionConOrigen) => AccionesPublicacion;
    abrirCafe: (p: PublicacionVista) => void;
}) {
    return (
        <ol className={cn('flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-0.5 ss-scroll', lista.length > max && estilos.desvanece)} aria-label="Podio de publicaciones">
            {lista.slice(0, max).map((p, i) => (
                <li key={p.id} className={estilos.aparece}>
                    <FilaPublicacion p={p} acento={t.acento} tactil={t.tactil} miniatura={t.ancho > 260} onAbrir={p.origen === 'cafe' ? abrirCafe : undefined} antes={<Rango n={desde + i} t={t} />} />
                    {accionesDe && <div className="pl-[4.4rem]"><BarraAcciones p={p} acento={t.acento} acciones={accionesDe(p)} tactil={t.tactil} compacta /></div>}
                </li>
            ))}
        </ol>
    );
}

function SinFiltro({ t, onTodo }: { t: TamanoSocial; onTodo: () => void }) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center" role="status">
            <p className="text-[12.5px] text-white/65">Nada en este origen todavía.</p>
            <Pastilla acento={t.acento} onClick={onTodo} tactil={t.tactil}>Ver todo</Pastilla>
        </div>
    );
}

export default RelevantPostsWidget;
