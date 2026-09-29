'use client';

// ════════════════════════════════════════════════════════════════
// SocialRadarWidget — lo que se acerca en la Red, en un radar (Ola 0929 · D)
// ----------------------------------------------------------------
// Solo eventos REALES del OS (`os_events` vía `useOsEvents` + el filtro
// `realEventsOnly`): si el hook sirve su relleno de muestra, el widget se
// queda en el vacío honesto. El radar no inventa posiciones: la distancia al
// centro es el TIEMPO que falta (anillos: hoy · 7 días · 30 días) y el
// sector es el TIPO de evento — se dice en la leyenda. Acciones reales:
// asistir (`os_event_attendance`), abrir el evento y convocar uno nuevo con
// el diálogo real. Una lectura al montar (sin sondeos ni realtime).
//
// micro = la cuenta atrás del siguiente · s = su tarjeta con fecha · m =
// radar + los tres siguientes · l = tipos + radar + asistir · xl = radar +
// agenda por horizonte · panorámico = la franja de los próximos días ·
// torre = agenda. Estados: cargando (orbe), vacío honesto con «Convocar un
// evento», error con reintento.
// ════════════════════════════════════════════════════════════════

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
    CalendarDays, CalendarPlus, Check, Hammer, Landmark, Loader2, MapPin, Palette, Sparkles, Store, Users, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOsEvents } from '@/hooks/use-os-entities';
import { realEventsOnly, setAttendance, type OsEvent } from '@/lib/os-social';
import { conAlfa } from '@/components/widgets-libres/acentos-categoria';
import { MarcoSocial, estadoSocial } from './_social-d/marco-social';
import { BotonIcono, Punto, Segmentos, estilosSocial as estilos, tintaDe } from './_social-d/piezas';
import { useCrearEntidad } from './_social-d/crear-entidad';
import { columnasQueCaben, filasQueCaben, type TamanoSocial } from './_social-d/tamano';
import { diasEntre, formatoNumero, horaCorta, msDe, rotuloDia } from './_social-d/formato';

const ACENTO = '#fb923c';
const HORA = 3_600_000, DIA = 24 * HORA;
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

type Tipo = 'asamblea' | 'taller' | 'ritual' | 'obra' | 'mercado' | 'encuentro';
const TIPOS: Record<Tipo, { icono: LucideIcon; color: string; etiqueta: string }> = {
    asamblea: { icono: Landmark, color: '#f59e0b', etiqueta: 'Asamblea' },
    taller: { icono: Hammer, color: '#10b981', etiqueta: 'Taller' },
    ritual: { icono: Sparkles, color: '#a855f7', etiqueta: 'Ritual' },
    obra: { icono: Palette, color: '#ec4899', etiqueta: 'Cultura' },
    mercado: { icono: Store, color: '#38bdf8', etiqueta: 'Mercado' },
    encuentro: { icono: Users, color: '#94a3b8', etiqueta: 'Encuentro' },
};
const ORDEN: Tipo[] = ['asamblea', 'taller', 'encuentro', 'ritual', 'obra', 'mercado'];

/** Tipo de radar de un evento real (PURO). */
export function tipoDeEvento(kind: string | null | undefined): Tipo {
    const k = (kind ?? '').toLowerCase();
    if (k.includes('asamblea')) return 'asamblea';
    if (k.includes('taller') || k.includes('curso')) return 'taller';
    if (k.includes('ritual') || k.includes('celebra')) return 'ritual';
    if (k.includes('mercado') || k.includes('trueque')) return 'mercado';
    if (k.includes('obra') || k.includes('expos') || k.includes('concierto')) return 'obra';
    return 'encuentro';
}

/** «en 25 min» · «en 3 h» · «mañana» · «en 5 días» · «ahora» (PURO). */
export function cuentaAtras(ms: number, ahora: number): string {
    const d = ms - ahora;
    if (d <= 0) return 'ahora';
    if (d < HORA) return `en ${Math.max(1, Math.round(d / 60_000))} min`;
    if (d < DIA && diasEntre(ms, ahora) === 0) return `en ${Math.round(d / HORA)} h`;
    const dias = -diasEntre(ms, ahora);
    if (dias === 1) return `mañana ${horaCorta(ms)}`;
    return `en ${dias} días`;
}

interface Proximo { e: OsEvent; tipo: Tipo; ms: number }

export function SocialRadarWidget() {
    const { data, loading, error, usingFallback, refetch } = useOsEvents();
    const [filtro, setFiltro] = React.useState<'todos' | Tipo>('todos');
    const [asistire, setAsistire] = React.useState<Set<string>>(() => new Set());
    const [enCurso, setEnCurso] = React.useState<string | null>(null);
    const crear = useCrearEntidad(refetch);

    const ahora = Date.now();
    // Solo lo real: con el relleno del hook, nada; y solo lo que aún no ha pasado (1 h de margen).
    const proximos: Proximo[] = React.useMemo(() => (usingFallback ? [] : realEventsOnly(data))
        .map((e) => ({ e, tipo: tipoDeEvento(e.kind), ms: msDe(e.startsAt) }))
        .filter((x) => x.ms > 0 && x.ms >= Date.now() - HORA)
        .sort((a, b) => a.ms - b.ms), [data, usingFallback]);
    const visibles = filtro === 'todos' ? proximos : proximos.filter((x) => x.tipo === filtro);
    const semana = proximos.filter((x) => x.ms - ahora < 7 * DIA).length;

    const estado = estadoSocial({ cargando: loading, hayDatos: proximos.length > 0, error: error && usingFallback ? new Error(error) : undefined });

    const asistir = async (x: Proximo) => {
        if (enCurso) return;
        setEnCurso(x.e.id);
        try {
            const r = await setAttendance(x.e.slug, 'asiste');
            if (r.ok) {
                setAsistire((s) => new Set(s).add(x.e.id));
                toast.success(`Te esperan en «${x.e.title}».`);
            } else toast.error(r.needsAuth ? 'Entra en tu cuenta para confirmar tu asistencia.' : 'No se pudo confirmar. Inténtalo de nuevo.');
        } finally {
            setEnCurso(null);
        }
    };

    return (
        <>
            <MarcoSocial
                titulo="Radar Social"
                subtitulo={proximos.length ? `${formatoNumero(proximos.length)} próximos · ${semana} esta semana` : 'Eventos próximos'}
                icono={CalendarDays}
                categoria="descubrimientos"
                acento={ACENTO}
                estado={estado}
                error={error ? new Error(error) : undefined}
                onReintentar={refetch}
                esqueleto="orbe"
                vacio={{ icono: CalendarPlus, titulo: 'No hay eventos próximos en la Red', mensaje: 'Convoca una asamblea, un taller o un encuentro: aparecerá aquí para quien esté cerca.', accion: { etiqueta: 'Convocar un evento', onClick: () => crear.abrir('event') } }}
                acciones={(t) => <BotonIcono icono={CalendarPlus} etiqueta="Convocar un evento" onClick={() => crear.abrir('event')} acento={t.acento} tactil={t.tactil} />}
            >
                {(t) => {
                    const sig = proximos[0];
                    if (t.base === 'micro') {
                        const m = TIPOS[sig.tipo];
                        return (
                            <Link href={`/evento/${sig.e.slug}`} aria-label={`Siguiente: ${sig.e.title}, ${cuentaAtras(sig.ms, ahora)}`} className="flex h-full cursor-pointer flex-col items-center justify-center gap-1 text-center">
                                <m.icono className="size-5" style={{ color: m.color }} aria-hidden />
                                <span className="text-[13px] font-semibold tabular-nums text-white">{cuentaAtras(sig.ms, ahora)}</span>
                            </Link>
                        );
                    }
                    if (t.base === 's') return <TarjetaEvento x={sig} t={t} ahora={ahora} grande />;
                    const accion = (x: Proximo) => <BotonAsistir x={x} t={t} hecho={asistire.has(x.e.id)} enCurso={enCurso === x.e.id} onAsistir={asistir} />;
                    if (t.clase === 'panoramico') return <Franja t={t} proximos={visibles} ahora={ahora} />;
                    if (t.clase === 'torre') return <Agenda t={t} proximos={proximos} ahora={ahora} max={filasQueCaben(t.alto, 58, 2, 10)} accion={accion} />;
                    const lado = Math.max(100, Math.min(t.alto - (t.base === 'l' ? 44 : 4), t.ancho * (t.base === 'xl' ? 0.42 : 0.46)));
                    const filtros = t.base !== 'm' && (
                        <Segmentos<'todos' | Tipo> etiqueta="Tipo de evento" acento={t.acento} tactil={t.tactil} valor={filtro} onCambio={setFiltro}
                            opciones={[{ id: 'todos', etiqueta: 'Todos', n: proximos.length }, ...ORDEN.filter((k) => proximos.some((x) => x.tipo === k)).map((k) => ({ id: k, etiqueta: TIPOS[k].etiqueta, icono: TIPOS[k].icono }))]} />
                    );
                    return (
                        <div className="flex h-full min-h-0 flex-col gap-2">
                            {filtros}
                            <div className="grid min-h-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
                                <Radar t={t} proximos={visibles} ahora={ahora} lado={lado} />
                                <Agenda t={t} proximos={visibles} ahora={ahora} max={filasQueCaben(t.alto - (filtros ? 44 : 0), t.base === 'm' ? 54 : 62, 2, 8)} accion={t.base === 'm' ? undefined : accion} agrupar={t.base === 'xl'} />
                            </div>
                        </div>
                    );
                }}
            </MarcoSocial>
            {crear.dialogo}
        </>
    );
}

// ── Radar (tiempo → distancia, tipo → sector) ───────────────────────

function Radar({ t, proximos, ahora, lado }: { t: TamanoSocial; proximos: Proximo[]; ahora: number; lado: number }) {
    const id = React.useId().replace(/:/g, '');
    const R = 46;
    const radio = (ms: number) => {
        const d = Math.max(0, ms - ahora);
        if (d < DIA) return 6 + (d / DIA) * 12;            // hoy: 6-18
        if (d < 7 * DIA) return 18 + ((d - DIA) / (6 * DIA)) * 14; // semana: 18-32
        return Math.min(R - 2, 32 + ((d - 7 * DIA) / (23 * DIA)) * 12); // mes: 32-44
    };
    const porTipo = new Map<Tipo, number>();
    return (
        <figure className="flex shrink-0 flex-col items-center gap-1" aria-label="Radar de eventos: más cerca del centro, antes; cada tipo en su sector">
            <svg width={lado} height={lado} viewBox="-50 -50 100 100" role="img" aria-label={`${proximos.length} eventos próximos en el radar`} className="overflow-visible">
                <defs>
                    <radialGradient id={`f-${id}`}>
                        <stop offset="0%" stopColor={t.acento} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={t.acento} stopOpacity={0.02} />
                    </radialGradient>
                    <linearGradient id={`hz-${id}`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor={t.acento} stopOpacity={0} />
                        <stop offset="100%" stopColor={t.acento} stopOpacity={0.35} />
                    </linearGradient>
                </defs>
                <circle r={R} fill={`url(#f-${id})`} />
                {[18, 32, R].map((r, i) => <circle key={r} r={r} fill="none" stroke="#fff" strokeOpacity={0.1 + (2 - i) * 0.04} strokeDasharray={i === 2 ? undefined : '1.5 2.5'} />)}
                {ORDEN.map((k, i) => {
                    const a = (i / ORDEN.length) * Math.PI * 2 - Math.PI / 2;
                    return <line key={k} x1={0} y1={0} x2={Math.cos(a) * R} y2={Math.sin(a) * R} stroke="#fff" strokeOpacity={0.05} />;
                })}
                <path className={estilos.barrido} d={`M0 0L0 ${-R}A${R} ${R} 0 0 1 ${(Math.sin(Math.PI / 5) * R).toFixed(2)} ${(-Math.cos(Math.PI / 5) * R).toFixed(2)}Z`} fill={`url(#hz-${id})`} />
                {proximos.slice(0, 30).map((x) => {
                    const i = ORDEN.indexOf(x.tipo);
                    const n = porTipo.get(x.tipo) ?? 0;
                    porTipo.set(x.tipo, n + 1);
                    const sector = (Math.PI * 2) / ORDEN.length;
                    const a = i * sector - Math.PI / 2 - sector / 2 + sector * (0.25 + ((n * 0.37) % 0.5));
                    const r = radio(x.ms);
                    const m = TIPOS[x.tipo];
                    const inminente = x.ms - ahora < 3 * HORA;
                    return (
                        <a key={x.e.id} href={`/evento/${x.e.slug}`} aria-label={`${x.e.title}, ${cuentaAtras(x.ms, ahora)}`}>
                            {inminente && <circle className={estilos.onda} cx={Math.cos(a) * r} cy={Math.sin(a) * r} r={3.2} fill="none" stroke={m.color} />}
                            <circle cx={Math.cos(a) * r} cy={Math.sin(a) * r} r={2.4 + Math.min(2, Math.log10(1 + x.e.attendeeCount))} fill={m.color} style={{ filter: `drop-shadow(0 0 2px ${m.color})` }} className="cursor-pointer">
                                <title>{`${x.e.title} · ${cuentaAtras(x.ms, ahora)}`}</title>
                            </circle>
                        </a>
                    );
                })}
                <circle r={2.5} fill="#fff" />
            </svg>
            {t.base !== 'm' && <figcaption className="text-center text-[10px] text-white/45">Centro: hoy · anillos: 7 y 30 días</figcaption>}
        </figure>
    );
}

// ── Piezas de evento ────────────────────────────────────────────────

function BloqueFecha({ ms, color, grande = false }: { ms: number; color: string; grande?: boolean }) {
    const d = new Date(ms);
    return (
        <span className={cn('grid shrink-0 place-items-center rounded-[12px] text-center leading-none', grande ? 'size-14' : 'size-11')} aria-hidden
            style={{ background: `linear-gradient(160deg, ${conAlfa(color, 0.3)}, ${conAlfa(color, 0.08)})`, boxShadow: `inset 0 0 0 1px ${conAlfa(color, 0.4)}` }}>
            <span>
                <span className={cn('block font-light tabular-nums text-white', grande ? 'text-[22px]' : 'text-[17px]')}>{d.getDate()}</span>
                <span className="block text-[9px] font-bold tracking-[0.12em]" style={{ color: tintaDe(color) }}>{MESES[d.getMonth()]}</span>
            </span>
        </span>
    );
}

function TarjetaEvento({ x, t, ahora, grande = false, derecha }: { x: Proximo; t: TamanoSocial; ahora: number; grande?: boolean; derecha?: React.ReactNode }) {
    const m = TIPOS[x.tipo];
    return (
        <div className={cn(estilos.fila, 'flex min-w-0 items-center gap-2.5 px-1.5', grande ? 'h-full' : t.tactil ? 'py-2' : 'py-1.5')}>
            <Link href={`/evento/${x.e.slug}`} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5" aria-label={`${m.etiqueta}: ${x.e.title}, ${cuentaAtras(x.ms, ahora)}${x.e.location ? `, en ${x.e.location}` : ''}`}>
                <BloqueFecha ms={x.ms} color={m.color} grande={grande} />
                <span className="min-w-0 flex-1">
                    <span className={cn('block font-semibold text-white', grande ? 'line-clamp-2 text-[13.5px]' : 'truncate text-[12.5px]')}>{x.e.title}</span>
                    <span className="flex items-center gap-1.5 text-[11px] text-white/55">
                        <span className="shrink-0 font-semibold" style={{ color: tintaDe(m.color) }}>{cuentaAtras(x.ms, ahora)}</span>
                        {x.e.location && <span className="inline-flex min-w-0 items-center gap-0.5 truncate"><MapPin className="size-3 shrink-0" aria-hidden />{x.e.location}</span>}
                    </span>
                    {grande && x.e.attendeeCount > 0 && <span className="text-[11px] tabular-nums text-white/50">{formatoNumero(x.e.attendeeCount)} asistentes</span>}
                </span>
            </Link>
            {derecha}
        </div>
    );
}

function BotonAsistir({ x, t, hecho, enCurso, onAsistir }: { x: Proximo; t: TamanoSocial; hecho: boolean; enCurso: boolean; onAsistir: (x: Proximo) => void }) {
    const alto = t.tactil ? 'min-h-11 min-w-11' : 'min-h-7';
    if (hecho) {
        return <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full ss-redondo px-2.5 text-[11px] font-semibold', alto)} style={{ color: '#6ee7b7', background: 'rgba(16,185,129,.14)' }}><Check className="size-3.5" aria-hidden />Asistirás</span>;
    }
    return (
        <button type="button" onClick={() => onAsistir(x)} disabled={enCurso} aria-label={`Asistir a ${x.e.title}`}
            className={cn('inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full ss-redondo px-2.5 text-[11px] font-semibold text-white transition-transform duration-200 hover:-translate-y-px disabled:cursor-wait', alto)}
            style={{ background: conAlfa(t.acento, 0.16), boxShadow: `inset 0 0 0 1px ${conAlfa(t.acento, 0.5)}` }}>
            {enCurso ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <CalendarPlus className="size-3.5" aria-hidden />}Asistir
        </button>
    );
}

function Agenda({ t, proximos, ahora, max, accion, agrupar = false }: { t: TamanoSocial; proximos: Proximo[]; ahora: number; max: number; accion?: (x: Proximo) => React.ReactNode; agrupar?: boolean }) {
    if (!proximos.length) return <p role="status" className="grid flex-1 place-items-center text-[12px] text-white/55">Nada de este tipo por ahora.</p>;
    const lista = proximos.slice(0, max);
    if (!agrupar) {
        return (
            <ul className={cn('flex min-h-0 flex-col gap-0.5 overflow-y-auto pr-0.5 ss-scroll', proximos.length > max && estilos.desvanece)} aria-label="Próximos eventos">
                {lista.map((x) => <li key={x.e.id} className={estilos.aparece}><TarjetaEvento x={x} t={t} ahora={ahora} derecha={accion?.(x)} /></li>)}
            </ul>
        );
    }
    const horizontes: { rotulo: string; lista: Proximo[] }[] = [
        { rotulo: 'Hoy', lista: lista.filter((x) => x.ms - ahora < DIA && diasEntre(x.ms, ahora) <= 0) },
        { rotulo: 'Esta semana', lista: lista.filter((x) => !(x.ms - ahora < DIA && diasEntre(x.ms, ahora) <= 0) && x.ms - ahora < 7 * DIA) },
        { rotulo: 'Más adelante', lista: lista.filter((x) => x.ms - ahora >= 7 * DIA) },
    ].filter((h) => h.lista.length);
    return (
        <div className="min-h-0 overflow-y-auto pr-0.5 ss-scroll">
            {horizontes.map((h) => (
                <section key={h.rotulo} aria-label={h.rotulo}>
                    <h4 className="py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/55">{h.rotulo}</h4>
                    <ul className="flex flex-col gap-0.5">{h.lista.map((x) => <li key={x.e.id}><TarjetaEvento x={x} t={t} ahora={ahora} derecha={accion?.(x)} /></li>)}</ul>
                </section>
            ))}
        </div>
    );
}

/** Panorámico: la franja de los próximos días, una columna por día con sus eventos. */
function Franja({ t, proximos, ahora }: { t: TamanoSocial; proximos: Proximo[]; ahora: number }) {
    if (t.alto < 120) {
        const cols = columnasQueCaben(t.ancho, 240, 1, 5);
        return (
            <ul className="grid h-full min-h-0 items-center gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }} aria-label="Próximos eventos">
                {proximos.slice(0, cols).map((x) => <li key={x.e.id} className="min-w-0"><TarjetaEvento x={x} t={t} ahora={ahora} /></li>)}
            </ul>
        );
    }
    const dias = Math.max(3, Math.min(10, Math.floor(t.ancho / 150)));
    const columnas = Array.from({ length: dias }, (_, d) => ({ d, lista: proximos.filter((x) => -diasEntre(x.ms, ahora) === d) }));
    const caben = Math.max(1, Math.floor((t.alto - 26) / 46));
    return (
        <ol className="grid h-full min-h-0 gap-2" style={{ gridTemplateColumns: `repeat(${dias}, minmax(0,1fr))` }} aria-label="Los próximos días">
            {columnas.map(({ d, lista }) => (
                <li key={d} className="flex min-h-0 min-w-0 flex-col gap-1 rounded-[14px] p-1.5" style={{ background: d === 0 ? conAlfa(t.acento, 0.1) : 'rgba(255,255,255,.02)' }}>
                    <span className={cn('flex items-center gap-1 truncate text-[10.5px] font-semibold uppercase tracking-[0.1em]', d === 0 ? 'text-white' : 'text-white/50')}>
                        {d === 0 && <Punto color={t.acento} tam={5} />}{d === 1 ? 'Mañana' : rotuloDia(ahora + d * DIA, ahora)}
                    </span>
                    <ul className="flex min-h-0 flex-col gap-1 overflow-hidden">
                        {lista.slice(0, caben).map((x) => {
                            const m = TIPOS[x.tipo];
                            return (
                                <li key={x.e.id} className="min-w-0">
                                    <Link href={`/evento/${x.e.slug}`} title={`${x.e.title}${x.e.location ? ` · ${x.e.location}` : ''}`} aria-label={`${x.e.title}, ${cuentaAtras(x.ms, ahora)}`}
                                        className="block cursor-pointer rounded-[10px] px-2 py-1 transition-colors duration-200 hover:brightness-125" style={{ background: conAlfa(m.color, 0.14), boxShadow: `inset 2px 0 0 ${m.color}` }}>
                                        <span className="block truncate text-[11.5px] font-semibold text-white">{x.e.title}</span>
                                        <span className="block truncate text-[10.5px] tabular-nums text-white/60">{horaCorta(x.ms)}{x.e.location ? ` · ${x.e.location}` : ''}</span>
                                    </Link>
                                </li>
                            );
                        })}
                        {lista.length > caben && <li className="px-1 text-[10.5px] text-white/45">+{lista.length - caben} más</li>}
                        {lista.length === 0 && <li className="px-1 text-[10.5px] text-white/30">—</li>}
                    </ul>
                </li>
            ))}
        </ol>
    );
}

export default SocialRadarWidget;
