'use client';

// ════════════════════════════════════════════════════════════════
// ActivitySummaryWidget — el pulso en cifras, tuyo y de la Red (Ola 0929 · D)
// ----------------------------------------------------------------
// Cifras REALES de las filas de os-live (`os_posts`, `os_pages`,
// `os_groups`, `os_events`, `os_memberships`): publicaciones de los últimos
// 7 días día a día, la variación de las últimas 24 h frente a las 24 h
// previas (solo si hay base: sin base no se inventa un «+100 %»), páginas,
// grupos, próximos eventos y lo más activo de la semana. «Tú» cuenta lo que
// publicaste, fundaste y convocaste; «La Red», todo. Hooks compartidos de
// os-live, sin sondeos propios.
//
// micro = publicaciones de hoy · s = la semana en barras · m = semana +
// tres cifras · l = Tú/La Red + cifras + lo más activo · xl = lo mismo a
// lo grande · panorámico = cifras en fila + semana · torre = en columna.
// Estados: cargando (cifras), vacío honesto con «Publicar» (ceros reales
// solo cuando hay algo con lo que comparar); sin error visible: los hooks
// degradan a lista vacía.
// ════════════════════════════════════════════════════════════════

import * as React from 'react';
import Link from 'next/link';
import { Activity, ArrowDownRight, ArrowUpRight, CalendarClock, Minus, Sprout, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrentUid, useLiveEvents, useLiveGroups, useLivePages, useLivePosts, useMyMemberships } from '@/lib/widget-data/os-live';
import type { OsPostRow } from '@/lib/widget-data/os-live';
import { conAlfa } from '@/components/widgets-libres/acentos-categoria';
import { MarcoSocial, estadoSocial } from './_social-d/marco-social';
import { BotonIcono, Cifra, Segmentos, tintaDe } from './_social-d/piezas';
import { ejeDias, resumirActividad, type ResumenActividad } from './_social-d/actividad';
import { formatoNumero } from './_social-d/formato';
import type { TamanoSocial } from './_social-d/tamano';

const ACENTO = '#34d399';

type Quien = 'red' | 'tu';

export function ActivitySummaryWidget() {
    const { uid } = useCurrentUid();
    const posts = useLivePosts(120);
    const eventos = useLiveEvents();
    const paginas = useLivePages();
    const grupos = useLiveGroups();
    const membresias = useMyMemberships(uid);
    const [quienElegido, setQuien] = React.useState<Quien | null>(null);

    const red = React.useMemo(
        () => resumirActividad({ posts: posts.rows, eventos: eventos.rows, paginas: paginas.rows, grupos: grupos.rows }, Date.now()),
        [posts.rows, eventos.rows, paginas.rows, grupos.rows],
    );
    const tu = React.useMemo(() => {
        if (!uid) return null;
        const mios = (r: { owner_id: string | null }) => r.owner_id === uid;
        return resumirActividad({
            posts: posts.rows.filter((p: OsPostRow) => p.author_id === uid),
            eventos: eventos.rows.filter(mios),
            paginas: paginas.rows.filter(mios),
            grupos: grupos.rows.filter(mios),
        }, Date.now());
    }, [uid, posts.rows, eventos.rows, paginas.rows, grupos.rows]);
    const tengoAlgo = !!tu && (tu.total7 > 0 || tu.comunidades + tu.grupos + tu.proximosEventos > 0 || membresias.rows.length > 0);
    const quien: Quien = quienElegido ?? (tengoAlgo ? 'tu' : 'red');
    const r = quien === 'tu' && tu ? tu : red;

    const cargando = posts.loading && paginas.loading && grupos.loading && eventos.loading;
    const hayAlgo = posts.rows.length + paginas.rows.length + grupos.rows.length + eventos.rows.length > 0;
    const estado = estadoSocial({ cargando, hayDatos: hayAlgo });

    return (
        <MarcoSocial
            titulo="Resumen de Actividad"
            subtitulo={() => `${quien === 'tu' ? 'Tu' : 'La'} semana: ${formatoNumero(r.total7)} ${r.total7 === 1 ? 'publicación' : 'publicaciones'}`}
            icono={Activity}
            categoria="perfil"
            acento={ACENTO}
            estado={estado}
            vivo
            esqueleto="cifras"
            vacio={{ icono: Activity, titulo: 'Aún no hay actividad que resumir', mensaje: 'Cuando haya publicaciones, comunidades o eventos, aquí verás su pulso de la semana.', accion: { etiqueta: 'Publicar', href: '/publicar' } }}
            acciones={(t) => <BotonIcono icono={Activity} etiqueta="Ver mi actividad" href="/mi-actividad" acento={t.acento} tactil={t.tactil} />}
        >
            {(t) => {
                if (t.base === 'micro') {
                    const lado = Math.max(40, Math.min(t.ancho, t.alto));
                    return (
                        <Link href="/mi-actividad" aria-label={`${r.ultimas24} publicaciones en las últimas 24 horas`} className="flex h-full cursor-pointer flex-col items-center justify-center gap-0.5">
                            <span className="font-light tabular-nums text-white" style={{ fontSize: lado * 0.36, lineHeight: 1 }}>{r.ultimas24}</span>
                            <Tendencia r={r} corta />
                        </Link>
                    );
                }
                const selector = tu ? (
                    <Segmentos<Quien> etiqueta="De quién" acento={t.acento} tactil={t.tactil} valor={quien} onCambio={setQuien}
                        opciones={[{ id: 'tu', etiqueta: 'Tú' }, { id: 'red', etiqueta: 'La Red' }]} />
                ) : null;
                const cifras = (tam: 's' | 'm' | 'l') => (
                    <>
                        <Cifra valor={formatoNumero(r.comunidades)} etiqueta={quien === 'tu' ? 'Tus páginas' : 'Comunidades'} tam={tam} />
                        <Cifra valor={formatoNumero(r.grupos)} etiqueta={quien === 'tu' ? 'Tus grupos' : 'Grupos'} tam={tam} />
                        <Cifra valor={formatoNumero(r.proximosEventos)} etiqueta="Próximos eventos" tam={tam} />
                        {quien === 'tu' && <Cifra valor={formatoNumero(membresias.rows.length)} etiqueta="Grupos en los que estás" tam={tam} />}
                    </>
                );
                if (t.base === 's') {
                    return (
                        <div className="flex h-full min-h-0 flex-col gap-1.5">
                            <div className="flex items-end justify-between gap-2">
                                <Cifra valor={formatoNumero(r.total7)} etiqueta="esta semana" tam="m" acento={t.acento} />
                                <Tendencia r={r} />
                            </div>
                            <Semana t={t} r={r} alto={Math.max(28, t.alto - 58)} sinEje />
                        </div>
                    );
                }
                if (t.clase === 'panoramico') {
                    return (
                        <div className="flex h-full min-h-0 items-stretch gap-5">
                            <div className="flex shrink-0 flex-col justify-between gap-2">
                                {selector}
                                <div className="flex items-end gap-3">
                                    <Cifra valor={formatoNumero(r.total7)} etiqueta="publicaciones (7 d)" tam="l" acento={t.acento} />
                                    <Tendencia r={r} />
                                </div>
                            </div>
                            <div className="grid shrink-0 grid-cols-2 content-center gap-x-5 gap-y-2">{cifras('s')}</div>
                            <div className="min-w-0 flex-1"><Semana t={t} r={r} alto={Math.max(40, t.alto - 20)} /></div>
                        </div>
                    );
                }
                if (t.base === 'm') {
                    return (
                        <div className="flex h-full min-h-0 flex-col gap-2">
                            <div className="flex items-end justify-between gap-2">
                                <Cifra valor={formatoNumero(r.total7)} etiqueta={`${quien === 'tu' ? 'Tus publicaciones' : 'Publicaciones'} · 7 días`} tam="l" acento={t.acento} />
                                <Tendencia r={r} />
                            </div>
                            <Semana t={t} r={r} alto={Math.max(34, Math.min(90, t.alto - 120))} />
                            <div className={cn('grid gap-2', t.clase === 'torre' ? 'grid-cols-1' : 'grid-cols-3')}>{cifras('s')}</div>
                        </div>
                    );
                }
                // l y xl
                const grande = t.base === 'xl';
                return (
                    <div className="flex h-full min-h-0 flex-col gap-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            {selector}
                            <Tendencia r={r} />
                        </div>
                        <div className={cn('grid min-h-0 flex-1 gap-4', grande ? 'grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]' : 'grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]')}>
                            <div className="flex min-h-0 flex-col gap-2">
                                <Cifra valor={formatoNumero(r.total7)} etiqueta={`${quien === 'tu' ? 'Tus publicaciones' : 'Publicaciones'} · 7 días`} tam={grande ? 'xl' : 'l'} acento={t.acento} />
                                <Semana t={t} r={r} alto={Math.max(50, t.alto - (grande ? 170 : 150))} />
                            </div>
                            <div className="flex min-h-0 flex-col gap-3">
                                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">{cifras(grande ? 'm' : 's')}</div>
                                <MasActivas t={t} r={r} />
                            </div>
                        </div>
                    </div>
                );
            }}
        </MarcoSocial>
    );
}

function Tendencia({ r, corta = false }: { r: ResumenActividad; corta?: boolean }) {
    if (r.variacion === null) {
        return <span className="text-[11px] text-white/55" title="Sin publicaciones el día anterior: no hay base para comparar">{corta ? `${r.ultimas24} en 24 h` : `${r.ultimas24} en las últimas 24 h`}</span>;
    }
    const sube = r.variacion > 0, baja = r.variacion < 0;
    const Icono = sube ? ArrowUpRight : baja ? ArrowDownRight : Minus;
    const color = sube ? '#34d399' : baja ? '#f87171' : 'rgba(255,255,255,.6)';
    return (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full ss-redondo px-2 py-0.5 text-[11px] font-semibold tabular-nums" style={{ color, background: conAlfa(sube ? '#34d399' : baja ? '#f87171' : '#94a3b8', 0.12) }}
            title={`${r.ultimas24} en las últimas 24 h frente a ${r.previas24} en las 24 h anteriores`}>
            <Icono className="size-3.5" aria-hidden />{r.variacion > 0 ? '+' : ''}{r.variacion} %{!corta && ' en 24 h'}
        </span>
    );
}

/** La semana en barras (SVG), con el día de hoy iluminado. */
function Semana({ t, r, alto, sinEje = false }: { t: TamanoSocial; r: ResumenActividad; alto: number; sinEje?: boolean }) {
    const serie = r.publicaciones7;
    const max = Math.max(1, ...serie);
    const eje = ejeDias(Date.now());
    const id = React.useId().replace(/:/g, '');
    return (
        <figure className="flex min-h-0 flex-col gap-1" aria-label={`Publicaciones por día de la última semana: ${serie.join(', ')}`}>
            <svg viewBox={`0 0 70 ${Math.max(20, alto)}`} preserveAspectRatio="none" className="w-full" style={{ height: alto }} aria-hidden>
                <defs>
                    <linearGradient id={`b-${id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={t.acento} stopOpacity={0.95} />
                        <stop offset="100%" stopColor={t.acento} stopOpacity={0.25} />
                    </linearGradient>
                </defs>
                {serie.map((v, i) => {
                    const h = v === 0 ? 1 : Math.max(2, (v / max) * (alto - 4));
                    return <rect key={i} x={i * 10 + 1.5} y={alto - h} width={7} height={h} rx={1.8} fill={i === 6 ? `url(#b-${id})` : conAlfa(t.acento, v === 0 ? 0.15 : 0.45)} />;
                })}
            </svg>
            {!sinEje && (
                <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-white/45">
                    {eje.map((d, i) => <span key={i} className={i === 6 ? 'text-white/85' : undefined}>{d}</span>)}
                </div>
            )}
        </figure>
    );
}

function MasActivas({ t, r }: { t: TamanoSocial; r: ResumenActividad }) {
    if (!r.masActivas.length) return <p className="text-[11.5px] text-white/50">Sin publicaciones en páginas o grupos esta semana.</p>;
    const max = Math.max(1, ...r.masActivas.map((m) => m.n));
    return (
        <section aria-label="Lo más activo de la semana">
            <h4 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/55">Lo más activo</h4>
            <ol className="flex flex-col gap-1.5">
                {r.masActivas.map((m, i) => (
                    <li key={m.href}>
                        <Link href={m.href} className="flex cursor-pointer items-center gap-2 text-[12px] text-white/80 hover:text-white">
                            {i === 0 ? <Sprout className="size-3.5 shrink-0" style={{ color: tintaDe(t.acento) }} aria-hidden /> : i === 1 ? <Users className="size-3.5 shrink-0 text-white/50" aria-hidden /> : <CalendarClock className="size-3.5 shrink-0 text-white/50" aria-hidden />}
                            <span className="w-28 shrink-0 truncate capitalize">{m.nombre}</span>
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full" style={{ width: `${(m.n / max) * 100}%`, background: t.acento }} /></span>
                            <span className="w-5 shrink-0 text-right tabular-nums">{m.n}</span>
                        </Link>
                    </li>
                ))}
            </ol>
        </section>
    );
}

export default ActivitySummaryWidget;
