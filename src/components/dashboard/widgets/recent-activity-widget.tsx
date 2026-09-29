'use client';

// ════════════════════════════════════════════════════════════════
// RecentActivityWidget — la línea de tiempo REAL de la Red (Ola 0929 · D)
// ----------------------------------------------------------------
// Publicaciones (`os_posts`), eventos convocados (`os_events`), páginas y
// grupos que nacen (`os_pages` / `os_groups`): una sola línea de tiempo
// agrupada por día (Hoy, Ayer, El lunes…), con quién, qué y dónde, y cada
// entrada lleva a su página real. «Tuya / La Red» filtra lo que hiciste tú.
// Datos de los hooks compartidos de os-live (una lectura + el canal común
// de cada tabla); ni sondeos propios ni relleno.
//
// micro = cuántas cosas hoy · s = lo último · m/torre = la línea de tiempo
// por días · l = + filtros por tipo y «Tuya» · xl = línea de tiempo + el
// día en cifras · panorámico = el río de la semana (una columna por día).
// Estados: cargando (lista), vacío con «Publicar»; sin error visible: los
// hooks de os-live degradan a lista vacía y el vacío lo dice.
// ════════════════════════════════════════════════════════════════

import * as React from 'react';
import Link from 'next/link';
import { CalendarPlus, History, PenLine, Sprout, User, Users, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrentUid, useLiveEvents, useLiveGroups, useLivePages, useLivePosts } from '@/lib/widget-data/os-live';
import { conAlfa } from '@/components/widgets-libres/acentos-categoria';
import { MarcoSocial, estadoSocial } from './_social-d/marco-social';
import { BotonIcono, Punto, Segmentos, Tiempo, estilosSocial as estilos } from './_social-d/piezas';
import { construirActividad, soloMio, type EntradaActividad, type TipoActividad } from './_social-d/actividad';
import { agruparPorDia, diasEntre, esReciente, recortar, rotuloDia } from './_social-d/formato';
import { filasQueCaben, type TamanoSocial } from './_social-d/tamano';

const ACENTO = '#fb923c';

const TIPO: Record<TipoActividad, { icono: LucideIcon; color: string; etiqueta: string }> = {
    publicacion: { icono: PenLine, color: '#38bdf8', etiqueta: 'Publicaciones' },
    evento: { icono: CalendarPlus, color: '#f59e0b', etiqueta: 'Eventos' },
    comunidad: { icono: Sprout, color: '#9FE870', etiqueta: 'Páginas' },
    grupo: { icono: Users, color: '#10b981', etiqueta: 'Grupos' },
};

type Filtro = 'todo' | TipoActividad;
type Quien = 'red' | 'tuya';

export function RecentActivityWidget() {
    const { uid } = useCurrentUid();
    const posts = useLivePosts(24);
    const eventos = useLiveEvents();
    const paginas = useLivePages();
    const grupos = useLiveGroups();
    const [filtro, setFiltro] = React.useState<Filtro>('todo');
    const [quien, setQuien] = React.useState<Quien>('red');

    const todas = React.useMemo(
        () => construirActividad({ posts: posts.rows, eventos: eventos.rows, paginas: paginas.rows, grupos: grupos.rows }),
        [posts.rows, eventos.rows, paginas.rows, grupos.rows],
    );
    const mias = React.useMemo(() => soloMio(todas, uid), [todas, uid]);
    const base = quien === 'tuya' ? mias : todas;
    const visibles = filtro === 'todo' ? base : base.filter((x) => x.tipo === filtro);
    const ahora = Date.now();
    const hoy = todas.filter((x) => diasEntre(x.ms, ahora) === 0).length;

    const cargando = posts.loading && eventos.loading && paginas.loading && grupos.loading;
    const estado = estadoSocial({ cargando, hayDatos: todas.length > 0 });

    return (
        <MarcoSocial
            titulo="Actividad Reciente"
            subtitulo={hoy ? `${hoy} ${hoy === 1 ? 'novedad' : 'novedades'} hoy` : 'Registro vivo de la Red'}
            icono={History}
            categoria="descubrimientos"
            acento={ACENTO}
            estado={estado}
            vivo
            esqueleto="lista"
            vacio={{ icono: History, titulo: 'La Red está en calma', mensaje: 'Aún no hay publicaciones, eventos ni comunidades nuevas. Empieza tú la conversación.', accion: { etiqueta: 'Publicar', href: '/publicar' } }}
            acciones={(t) => <BotonIcono icono={User} etiqueta="Ver mi actividad" href="/mi-actividad" acento={t.acento} tactil={t.tactil} />}
        >
            {(t) => {
                if (t.base === 'micro') {
                    const lado = Math.max(40, Math.min(t.ancho, t.alto));
                    return (
                        <Link href="/mi-actividad" aria-label={`${hoy} novedades hoy en la Red`} className="flex h-full cursor-pointer flex-col items-center justify-center gap-1">
                            <span className="font-light tabular-nums text-white" style={{ fontSize: lado * 0.38, lineHeight: 1 }}>{hoy}</span>
                            <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/60"><Punto color={t.acento} tam={6} latir={hoy > 0} />hoy</span>
                        </Link>
                    );
                }
                if (t.base === 's') {
                    return <ul className="flex h-full min-h-0 flex-col justify-center gap-1" aria-label="Lo último">{todas.slice(0, 2).map((x) => <li key={x.id}><Fila x={x} t={t} compacta /></li>)}</ul>;
                }
                const controles = (
                    <div className="flex flex-wrap items-center gap-2">
                        <Segmentos<Quien> etiqueta="De quién" acento={t.acento} tactil={t.tactil} valor={quien} onCambio={setQuien}
                            opciones={[{ id: 'red', etiqueta: 'La Red', n: todas.length }, { id: 'tuya', etiqueta: 'Tuya', n: mias.length }]} />
                        <Segmentos<Filtro> etiqueta="Tipo de actividad" acento={t.acento} tactil={t.tactil} valor={filtro} onCambio={setFiltro}
                            opciones={[{ id: 'todo', etiqueta: 'Todo' }, ...(Object.keys(TIPO) as TipoActividad[]).filter((k) => base.some((x) => x.tipo === k)).map((k) => ({ id: k, etiqueta: TIPO[k].etiqueta, icono: TIPO[k].icono }))]} />
                    </div>
                );
                const vacioFiltro = (
                    <p role="status" className="grid flex-1 place-items-center text-center text-[12px] text-white/55">
                        {quien === 'tuya' ? 'Aún no has publicado ni fundado nada que aparezca aquí.' : 'Nada con este filtro.'}
                    </p>
                );
                if (t.clase === 'panoramico') return <Rio t={t} entradas={todas} />;
                if (t.base === 'xl') {
                    return (
                        <div className="flex h-full min-h-0 flex-col gap-2.5">
                            {controles}
                            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-4">
                                {visibles.length ? <Linea t={t} entradas={visibles} max={filasQueCaben(t.alto - 50, 52, 3, 12)} /> : vacioFiltro}
                                <DiaEnCifras t={t} entradas={todas} />
                            </div>
                        </div>
                    );
                }
                const conControles = t.base === 'l';
                return (
                    <div className="flex h-full min-h-0 flex-col gap-2">
                        {conControles && controles}
                        {visibles.length || !conControles ? <Linea t={t} entradas={conControles ? visibles : todas} max={filasQueCaben(t.alto - (conControles ? 76 : 0), 50, 2, 10)} /> : vacioFiltro}
                    </div>
                );
            }}
        </MarcoSocial>
    );
}

function Fila({ x, t, compacta = false }: { x: EntradaActividad; t: TamanoSocial; compacta?: boolean }) {
    const m = TIPO[x.tipo];
    return (
        <Link href={x.href} className={cn(estilos.fila, 'flex min-w-0 cursor-pointer items-start gap-2 px-1.5', t.tactil ? 'py-2' : 'py-1')} aria-label={`${x.actor} ${x.accion} ${x.objeto}`}>
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ss-redondo" style={{ background: conAlfa(m.color, 0.16), color: m.color }}><m.icono className="size-3.5" aria-hidden /></span>
            <span className="min-w-0 flex-1">
                <span className="block text-[12px] leading-snug text-white/85">
                    <b className="font-semibold text-white">{x.actor}</b> {x.accion}{x.objeto && <> <b className="font-semibold" style={{ color: m.color }}>{x.objeto}</b></>}
                </span>
                {!compacta && x.detalle && <span className="line-clamp-1 text-[11px] text-white/50" title={x.detalle}>{recortar(x.detalle, 120)}</span>}
            </span>
            <Tiempo ms={x.ms} corto className="mt-0.5 text-[10.5px]" />
        </Link>
    );
}

/** La línea de tiempo: días como rótulos y un hilo de nodos del color de cada tipo. */
function Linea({ t, entradas, max }: { t: TamanoSocial; entradas: EntradaActividad[]; max: number }) {
    const grupos = agruparPorDia(entradas.slice(0, max), (x) => x.ms, Date.now());
    return (
        <div className={cn('relative min-h-0 flex-1 overflow-y-auto pr-0.5 ss-scroll', entradas.length > max && estilos.desvanece)}>
            <span aria-hidden className="absolute bottom-2 left-[1.05rem] top-5 w-px" style={{ background: `linear-gradient(180deg, ${conAlfa(t.acento, 0.5)}, ${conAlfa(t.acento, 0.05)})` }} />
            {grupos.map((g) => (
                <section key={g.clave} aria-label={g.rotulo} className="relative">
                    <h4 className="sticky top-0 z-10 py-1 pl-8 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/55" style={{ background: 'linear-gradient(180deg, rgba(12,14,34,.55), transparent)' }}>{g.rotulo}</h4>
                    <ol className="flex flex-col gap-0.5">
                        {g.elementos.map((x) => <li key={x.id} className={estilos.aparece}><Fila x={x} t={t} /></li>)}
                    </ol>
                </section>
            ))}
        </div>
    );
}

/** xl: el día de hoy en cifras por tipo. */
function DiaEnCifras({ t, entradas }: { t: TamanoSocial; entradas: EntradaActividad[] }) {
    const ahora = Date.now();
    const hoy = entradas.filter((x) => esReciente(x.ms, ahora));
    const max = Math.max(1, ...(Object.keys(TIPO) as TipoActividad[]).map((k) => hoy.filter((x) => x.tipo === k).length));
    return (
        <aside className="flex min-h-0 flex-col gap-3 rounded-[18px] p-3" style={{ background: `radial-gradient(120% 90% at 0% 0%, ${conAlfa(t.acento, 0.14)}, transparent 70%)` }} aria-label="Últimas 24 horas en cifras">
            <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/55">Últimas 24 h</p>
                <p className="text-[34px] font-light leading-none tabular-nums text-white">{hoy.length}</p>
            </div>
            <ul className="flex flex-col gap-2">
                {(Object.keys(TIPO) as TipoActividad[]).map((k) => {
                    const n = hoy.filter((x) => x.tipo === k).length;
                    const m = TIPO[k];
                    return (
                        <li key={k} className="flex items-center gap-2 text-[12px]">
                            <m.icono className="size-3.5 shrink-0" style={{ color: m.color }} aria-hidden />
                            <span className="w-24 shrink-0 text-white/70">{m.etiqueta}</span>
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full" style={{ width: `${(n / max) * 100}%`, background: m.color }} /></span>
                            <span className="w-6 shrink-0 text-right tabular-nums text-white/80">{n}</span>
                        </li>
                    );
                })}
            </ul>
            <Link href="/mi-actividad" className="mt-auto cursor-pointer text-[11.5px] font-semibold text-white/70 hover:text-white">Ver mi actividad completa</Link>
        </aside>
    );
}

/** Panorámico: el río de la semana — una columna por día, con sus novedades como gotas. */
function Rio({ t, entradas }: { t: TamanoSocial; entradas: EntradaActividad[] }) {
    const ahora = Date.now();
    const dias = Array.from({ length: 7 }, (_, i) => 6 - i).map((d) => ({
        d,
        lista: entradas.filter((x) => diasEntre(x.ms, ahora) === d),
    }));
    const porColumna = Math.max(1, Math.floor((t.alto - 26) / 30));
    return (
        <ol className="grid h-full min-h-0 grid-cols-7 gap-2" aria-label="La semana en la Red">
            {dias.map(({ d, lista }) => (
                <li key={d} className="flex min-h-0 min-w-0 flex-col gap-1">
                    <span className={cn('truncate text-[10.5px] font-semibold uppercase tracking-[0.1em]', d === 0 ? 'text-white' : 'text-white/50')}>
                        {rotuloDia(ahora - d * 86_400_000, ahora)} · {lista.length}
                    </span>
                    <ul className="flex min-h-0 flex-col gap-1 overflow-hidden">
                        {lista.slice(0, porColumna).map((x) => {
                            const m = TIPO[x.tipo];
                            return (
                                <li key={x.id}>
                                    <Link href={x.href} title={`${x.actor} ${x.accion} ${x.objeto}`} aria-label={`${x.actor} ${x.accion} ${x.objeto}`}
                                        className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-full ss-redondo px-2 py-1 text-[11px] text-white/85 transition-colors duration-200 hover:text-white"
                                        style={{ background: conAlfa(m.color, 0.12) }}>
                                        <m.icono className="size-3 shrink-0" style={{ color: m.color }} aria-hidden />
                                        <span className="truncate">{x.objeto || x.actor}</span>
                                    </Link>
                                </li>
                            );
                        })}
                        {lista.length > porColumna && <li className="px-2 text-[10.5px] text-white/45">+{lista.length - porColumna} más</li>}
                    </ul>
                </li>
            ))}
        </ol>
    );
}

export default RecentActivityWidget;
