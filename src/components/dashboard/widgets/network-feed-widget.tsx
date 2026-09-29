'use client';

// ════════════════════════════════════════════════════════════════
// NetworkFeedWidget — el Lienzo Universal de la Red, REAL (Ola 0929 · D)
// ----------------------------------------------------------------
// Las publicaciones de `posts` (las mismas de /network) con su autor del
// directorio del OS, sus reacciones y comentarios reales, y acciones de
// verdad: resonar (`os_post_likes`), guardar en tu biblioteca (referencia,
// nunca copia), comentar/abrir (`/post/<id>`) y publicar (`/publicar`).
// Una vuelta compartida cada 10 min, solo a la vista, sin realtime; ante
// el 400 del esquema viejo la consulta se para y se dice (contrato
// «consumo»), nunca se reintenta en bucle.
//
// micro = la última voz · s = la última publicación con su imagen ·
// m/torre = la corriente · l = filtros + tarjetas con acciones · xl =
// portada + corriente · panorámico = portada + tarjetas en fila (o una
// tira fina si no hay alto). Estados: cargando (esqueleto de tarjetas),
// vacío con «Publicar», «no disponible aquí» honesto, error con reintento.
// ════════════════════════════════════════════════════════════════

import * as React from 'react';
import Link from 'next/link';
import { CloudOff, Image as ImageIcon, Layers, PenSquare, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { conAlfa } from '@/components/widgets-libres/acentos-categoria';
import { MarcoSocial, estadoSocial } from './_social-d/marco-social';
import { useEnPantalla, useFuenteCompartida } from './_social-d/fuente-compartida';
import { cargarFeedRed, type FeedRed } from './_social-d/feed-red-datos';
import { useAccionesRed } from './_social-d/acciones-red';
import { BotonActualizar, BotonIcono, Miniatura, Pastilla, Segmentos, Avatar, Tiempo, estilosSocial as estilos } from './_social-d/piezas';
import { BarraAcciones, FilaPublicacion, PortadaPublicacion, TarjetaPublicacion, iconoMedia, textoDe, type AccionesPublicacion, type PublicacionVista } from './_social-d/publicaciones';
import { columnasQueCaben, filasQueCaben, type TamanoSocial } from './_social-d/tamano';
import { esReciente } from './_social-d/formato';

const ACENTO = '#3B82F6';
const INTERVALO = 10 * 60_000;

type Filtro = 'todo' | 'medios' | 'hoy';

export function NetworkFeedWidget() {
    const refRaiz = React.useRef<HTMLDivElement | null>(null);
    const enPantalla = useEnPantalla(refRaiz);
    const fuente = useFuenteCompartida<FeedRed>('red:feed', () => cargarFeedRed(12), { intervaloMs: INTERVALO, enPantalla });
    const [filtro, setFiltro] = React.useState<Filtro>('todo');

    const ahora = Date.now();
    const vistas: PublicacionVista[] = React.useMemo(
        () => (fuente.datos?.publicaciones ?? []).map((p) => ({
            id: p.id,
            autor: p.autor,
            avatar: p.avatar,
            texto: p.texto,
            media: p.media,
            tipoMedia: p.tipoMedia,
            nMedia: p.nMedia,
            reacciones: p.reacciones,
            meGusta: p.meGusta,
            comentarios: p.comentarios,
            etiqueta: p.area,
            ms: p.ms,
            href: `/post/${p.id}`,
            hrefAutor: p.handle ? `/profile/${p.handle}` : null,
        })),
        [fuente.datos],
    );
    const hoy = vistas.filter((p) => esReciente(p.ms, ahora)).length;

    const { resonar, guardar, guardadas } = useAccionesRed(fuente);

    const acciones: AccionesPublicacion = { onResonar: resonar, onGuardar: guardar, guardadas, etiquetaGuardar: 'Guardar en tu biblioteca' };
    const noDisponible = !!fuente.datos?.noDisponible || fuente.detenida;

    const estado = estadoSocial({
        cargando: fuente.cargando,
        hayDatos: vistas.length > 0,
        error: fuente.fallo && !noDisponible ? new Error(fuente.fallo.message || 'fuente') : undefined,
    });

    return (
        <div ref={refRaiz} className="h-full w-full">
            <MarcoSocial
                titulo="Feed de la Red"
                subtitulo={hoy ? `${hoy} ${hoy === 1 ? 'publicación' : 'publicaciones'} hoy` : 'Lienzo Universal'}
                icono={Layers}
                categoria="social"
                acento={ACENTO}
                estado={estado}
                error={fuente.fallo ? new Error(fuente.fallo.message || 'fuente') : undefined}
                onReintentar={fuente.recargar}
                esqueleto="tarjetas"
                vivo
                vacio={noDisponible
                    ? { icono: CloudOff, titulo: 'El feed no está disponible aquí', mensaje: 'Las publicaciones de la Red aún no están activas en este servidor. No se volverá a preguntar hasta recargar.', accion: { etiqueta: 'Abrir la Red', href: '/network' } }
                    : { icono: PenSquare, titulo: 'Aún no hay publicaciones', mensaje: 'Abre la conversación: lo que publiques en la Red aparece aquí para todo el mundo.', accion: { etiqueta: 'Publicar', href: '/publicar' } }}
                acciones={(t) => (
                    <>
                        <BotonActualizar onClick={fuente.recargar} actualizando={fuente.actualizando} actualizado={fuente.actualizado} acento={t.acento} tactil={t.tactil} />
                        <BotonIcono icono={PenSquare} etiqueta="Publicar en la Red" href="/publicar" acento={t.acento} tactil={t.tactil} />
                    </>
                )}
                pie={(t) => t.base === 'xl' ? (
                    <div className="flex items-center justify-between gap-2">
                        <Link href="/network" className="cursor-pointer text-[11.5px] font-semibold text-white/70 hover:text-white">Ver todo el feed</Link>
                        <Pastilla acento={t.acento} icono={PenSquare} href="/publicar" solida tactil={t.tactil}>Publicar</Pastilla>
                    </div>
                ) : null}
            >
                {(t) => {
                    if (t.base === 'micro') return <UltimaVoz t={t} p={vistas[0]} hoy={hoy} />;
                    if (t.base === 's') return <UltimaPublicacion t={t} p={vistas[0]} />;
                    if (t.clase === 'panoramico') return <Panoramico t={t} vistas={vistas} acciones={acciones} />;
                    const lista = filtrar(vistas, filtro, ahora);
                    if (t.base === 'xl') {
                        const portada = vistas.find((p) => p.media) ?? vistas[0];
                        const resto = lista.filter((p) => p.id !== portada.id);
                        return (
                            <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
                                <PortadaPublicacion p={portada} acento={t.acento} tactil={t.tactil} acciones={acciones} />
                                <div className="flex min-h-0 flex-col gap-2">
                                    <Filtros t={t} filtro={filtro} setFiltro={setFiltro} vistas={vistas} ahora={ahora} />
                                    <Corriente t={t} vistas={resto} max={filasQueCaben(t.alto - 40, 78, 2, 6)} />
                                </div>
                            </div>
                        );
                    }
                    if (t.base === 'l') {
                        const cols = columnasQueCaben(t.ancho, 250, 1, 3);
                        return (
                            <div className="flex h-full min-h-0 flex-col gap-2.5">
                                <Filtros t={t} filtro={filtro} setFiltro={setFiltro} vistas={vistas} ahora={ahora} />
                                {cols > 1 ? (
                                    <ul className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }} aria-label="Publicaciones">
                                        {lista.slice(0, cols).map((p) => (
                                            <li key={p.id} className="min-h-0"><TarjetaPublicacion p={p} acento={t.acento} tactil={t.tactil} acciones={acciones} altoMedia={Math.max(70, Math.min(150, t.alto * 0.36))} /></li>
                                        ))}
                                        {lista.length === 0 && <li className="col-span-full grid place-items-center text-[12px] text-white/55">Nada con este filtro.</li>}
                                    </ul>
                                ) : (
                                    <Corriente t={t} vistas={lista} max={filasQueCaben(t.alto - 40, 78, 2, 6)} conAcciones={acciones} />
                                )}
                            </div>
                        );
                    }
                    return <Corriente t={t} vistas={vistas} max={filasQueCaben(t.alto, t.clase === 'torre' ? 84 : 76, 2, 8)} />;
                }}
            </MarcoSocial>
        </div>
    );
}

function filtrar(vistas: PublicacionVista[], f: Filtro, ahora: number): PublicacionVista[] {
    if (f === 'medios') return vistas.filter((p) => p.tipoMedia);
    if (f === 'hoy') return vistas.filter((p) => esReciente(p.ms, ahora));
    return vistas;
}

function Filtros({ t, filtro, setFiltro, vistas, ahora }: { t: TamanoSocial; filtro: Filtro; setFiltro: (f: Filtro) => void; vistas: PublicacionVista[]; ahora: number }) {
    return (
        <Segmentos<Filtro>
            etiqueta="Filtrar publicaciones"
            acento={t.acento}
            tactil={t.tactil}
            valor={filtro}
            onCambio={setFiltro}
            opciones={[
                { id: 'todo', etiqueta: 'Todo', n: vistas.length },
                { id: 'medios', etiqueta: 'Con imagen', n: vistas.filter((p) => p.tipoMedia).length, icono: ImageIcon },
                { id: 'hoy', etiqueta: 'Hoy', n: vistas.filter((p) => esReciente(p.ms, ahora)).length, icono: Sun },
            ]}
        />
    );
}

function Corriente({ t, vistas, max, conAcciones }: { t: TamanoSocial; vistas: PublicacionVista[]; max: number; conAcciones?: AccionesPublicacion }) {
    if (vistas.length === 0) return <p role="status" className="grid flex-1 place-items-center text-center text-[12px] text-white/55">Nada con este filtro.</p>;
    return (
        <ul className={cn('flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-0.5 ss-scroll', vistas.length > max && estilos.desvanece)} aria-label="Publicaciones">
            {vistas.slice(0, max).map((p) => (
                <li key={p.id} className={estilos.aparece}>
                    <FilaPublicacion p={p} acento={t.acento} tactil={t.tactil} miniatura={t.ancho > 240} />
                    {conAcciones && <div className="pl-11"><BarraAcciones p={p} acento={t.acento} acciones={conAcciones} tactil={t.tactil} compacta /></div>}
                </li>
            ))}
        </ul>
    );
}

// ── micro y s ───────────────────────────────────────────────────────

function UltimaVoz({ t, p, hoy }: { t: TamanoSocial; p?: PublicacionVista; hoy: number }) {
    if (!p) return null;
    const lado = Math.max(40, Math.min(t.ancho, t.alto));
    return (
        <Link href={p.href} aria-label={`Última publicación de ${p.autor}: ${textoDe(p)}${hoy ? `. ${hoy} hoy` : ''}`} className="relative flex h-full cursor-pointer flex-col items-center justify-center gap-1">
            <Avatar nombre={p.autor} url={p.avatar} tam={Math.round(lado * 0.5)} anillo acento={t.acento} />
            {hoy > 0 && <span className="text-[11px] font-semibold tabular-nums text-white/75">{hoy} hoy</span>}
        </Link>
    );
}

function UltimaPublicacion({ t, p }: { t: TamanoSocial; p?: PublicacionVista }) {
    if (!p) return null;
    const Icono = iconoMedia(p.tipoMedia);
    return (
        <Link href={p.href} className="relative flex h-full cursor-pointer flex-col justify-end overflow-hidden rounded-[16px]" aria-label={`${p.autor}: ${textoDe(p)}`}>
            {p.tipoMedia && <Miniatura url={p.media} icono={Icono} acento={t.acento} semilla={p.id} className="absolute inset-0 size-full" redondeo={16} />}
            <span aria-hidden className="absolute inset-0" style={{ background: p.tipoMedia ? 'linear-gradient(180deg, transparent 20%, rgba(8,9,24,.88))' : `radial-gradient(120% 90% at 10% 0%, ${conAlfa(t.acento, 0.28)}, transparent 70%)` }} />
            <span className="relative flex flex-col gap-1 p-2">
                <span className="flex items-center gap-1.5">
                    <Avatar nombre={p.autor} url={p.avatar} tam={20} />
                    <span className="truncate text-[11.5px] font-semibold text-white">{p.autor}</span>
                    <Tiempo ms={p.ms} corto className="ml-auto text-[10px]" />
                </span>
                <span className="line-clamp-2 text-[12px] leading-snug text-white/90">{textoDe(p)}</span>
            </span>
        </Link>
    );
}

// ── panorámico ──────────────────────────────────────────────────────

function Panoramico({ t, vistas, acciones }: { t: TamanoSocial; vistas: PublicacionVista[]; acciones: AccionesPublicacion }) {
    if (t.alto < 200) {
        // Tira fina: las últimas voces en fila.
        const caben = columnasQueCaben(t.ancho, 230, 1, 6);
        return (
            <ul className="grid h-full min-h-0 items-center gap-2" style={{ gridTemplateColumns: `repeat(${caben}, minmax(0,1fr))` }} aria-label="Publicaciones">
                {vistas.slice(0, caben).map((p) => <li key={p.id} className="min-w-0"><FilaPublicacion p={p} acento={t.acento} tactil={t.tactil} lineas={1} miniatura={t.alto > 90} /></li>)}
            </ul>
        );
    }
    const portada = vistas.find((p) => p.media) ?? vistas[0];
    const resto = vistas.filter((p) => p.id !== portada.id);
    const anchoPortada = Math.min(Math.max(280, t.ancho * 0.36), 460);
    const caben = columnasQueCaben(t.ancho - anchoPortada - 16, 210, 1, 4);
    return (
        <div className="flex h-full min-h-0 gap-4">
            <div className="h-full shrink-0" style={{ width: anchoPortada }}>
                <PortadaPublicacion p={portada} acento={t.acento} tactil={t.tactil} acciones={acciones} />
            </div>
            <ul className="grid min-h-0 min-w-0 flex-1 gap-3" style={{ gridTemplateColumns: `repeat(${caben}, minmax(0,1fr))` }} aria-label="Más publicaciones">
                {resto.slice(0, caben).map((p) => (
                    <li key={p.id} className="min-h-0"><TarjetaPublicacion p={p} acento={t.acento} tactil={t.tactil} acciones={acciones} altoMedia={Math.max(80, Math.min(170, t.alto * 0.42))} /></li>
                ))}
                {resto.length === 0 && (
                    <li className="col-span-full flex flex-col items-center justify-center gap-2 text-center">
                        <p className="text-[12.5px] text-white/65">Por ahora es la única publicación de la Red.</p>
                        <Pastilla acento={t.acento} icono={PenSquare} href="/publicar" tactil={t.tactil}>Publicar la siguiente</Pastilla>
                    </li>
                )}
            </ul>
        </div>
    );
}

export default NetworkFeedWidget;
