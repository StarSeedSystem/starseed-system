'use client';

// ════════════════════════════════════════════════════════════════
// BadgesWidget — tu vitrina de insignias, REAL (Ola 0929 · D)
// ----------------------------------------------------------------
// Meritocracia del entendimiento verificable (Módulo 7): el catálogo
// (`badges`) y lo que de verdad te han otorgado (`profile_badges`). Cada
// insignia es una medalla dibujada con el color de su área; las que faltan
// esperan apagadas. La colección se mide (ganadas / catálogo) y la
// SIGUIENTE se elige con honestidad — primero las de logro que dependen de
// ti — con CÓMO se gana y el enlace a donde se gana. Nunca un porcentaje
// inventado hacia una insignia concreta, nunca un emoji como icono.
// Lectura compartida cada ≥ 30 min y solo a la vista; la sesión, de caché.
//
// micro = el anillo de la colección · s = anillo + la última · m = la
// última medalla + la siguiente · l = vitrina + siguiente · xl = vitrinas
// por área · panorámico = la vitrina en fila · torre = columna. Estados:
// cargando (orbe), sin sesión, vacío con el catálogo y la primera que
// puedes ganar, error con reintento.
// ════════════════════════════════════════════════════════════════

import * as React from 'react';
import Link from 'next/link';
import {
    Award, BookOpen, Brain, Crown, Flame, GraduationCap, Hammer, Handshake, Heart, Leaf, Lock, Medal, Palette, Scale, ShieldCheck,
    Sparkles, Star, Store, Trophy, Vote, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrentUid } from '@/lib/widget-data/os-live';
import type { Badge } from '@/lib/badges/badges';
import { conAlfa } from '@/components/widgets-libres/acentos-categoria';
import { mezclar } from '@/components/widgets-libres/familias/comun';
import { MarcoSocial, estadoSocial } from './_social-d/marco-social';
import { useEnPantalla, useFuenteCompartida } from './_social-d/fuente-compartida';
import { cargarInsignias, comoSeGana, siguienteInsignia, type Coleccion } from './_social-d/insignias-datos';
import { BotonIcono, Pastilla, Segmentos, Tiempo, tintaDe } from './_social-d/piezas';
import { columnasQueCaben, type TamanoSocial } from './_social-d/tamano';
import { msDe } from './_social-d/formato';

const ACENTO = '#D4AF37';
const INTERVALO = 30 * 60_000;

const COLOR_AREA: Record<string, string> = { general: '#D4AF37', politica: '#FFBF00', educacion: '#8B5CF6', cultura: '#EC4899' };
const NOMBRE_AREA: Record<string, string> = { general: 'General', politica: 'Política', educacion: 'Educación', cultura: 'Cultura' };
const colorArea = (a: string | null) => COLOR_AREA[(a ?? 'general').toLowerCase()] ?? ACENTO;

const ICONOS: Record<string, LucideIcon> = {
    award: Award, medal: Medal, trophy: Trophy, star: Star, crown: Crown, sparkles: Sparkles, flame: Flame, heart: Heart, leaf: Leaf,
    shieldcheck: ShieldCheck, 'shield-check': ShieldCheck, verified: ShieldCheck, hammer: Hammer, builder: Hammer, bookopen: BookOpen,
    'book-open': BookOpen, scholar: BookOpen, scale: Scale, legislator: Scale, handshake: Handshake, mediator: Handshake,
    graduationcap: GraduationCap, 'graduation-cap': GraduationCap, exam_passed: GraduationCap, store: Store, creator: Store,
    brain: Brain, palette: Palette, vote: Vote,
};
/** Icono lucide de una insignia (por su nombre de icono o su código); nunca un emoji. */
function iconoDe(b: Pick<Badge, 'icon' | 'code'>): LucideIcon {
    return ICONOS[(b.icon ?? '').toLowerCase()] ?? ICONOS[(b.code ?? '').toLowerCase()] ?? Award;
}

export function BadgesWidget() {
    const { uid, ready } = useCurrentUid();
    const refRaiz = React.useRef<HTMLDivElement | null>(null);
    const enPantalla = useEnPantalla(refRaiz);
    const fuente = useFuenteCompartida<Coleccion | null>(uid ? `insignias:${uid}` : null, cargarInsignias, { intervaloMs: INTERVALO, enPantalla });
    const [area, setArea] = React.useState<string>('todas');

    const col = fuente.datos ?? null;
    const ganadas = col?.ganadas ?? [];
    const catalogo = col?.catalogo ?? [];
    const total = Math.max(catalogo.length, ganadas.length);
    const siguiente = col ? siguienteInsignia(col) : null;
    const codigosGanados = React.useMemo(() => new Set(ganadas.map((g) => g.code)), [ganadas]);

    const estado = estadoSocial({
        sinSesion: (ready && !uid) || (fuente.datos === null && !fuente.cargando),
        cargando: !ready || fuente.cargando,
        hayDatos: ganadas.length > 0,
        error: fuente.fallo ? new Error(fuente.fallo.message || 'fuente') : undefined,
    });
    const como = siguiente ? comoSeGana(siguiente) : null;

    return (
        <div ref={refRaiz} className="h-full w-full">
            <MarcoSocial
                titulo="Insignias"
                subtitulo={total ? `${ganadas.length} de ${total} · mérito verificable` : 'Mérito verificable'}
                icono={Award}
                categoria="perfil"
                acento={ACENTO}
                estado={estado}
                error={fuente.fallo ? new Error(fuente.fallo.message || 'fuente') : undefined}
                onReintentar={fuente.recargar}
                esqueleto="orbe"
                sinSesion={{ mensaje: 'Entra para ver tus insignias y la siguiente que puedes ganar.' }}
                vacio={{
                    icono: Lock,
                    titulo: 'Aún sin insignias',
                    mensaje: siguiente && como ? `La primera a tu alcance: «${siguiente.name}». ${como.texto}` : 'Participa en la Red —publica, delibera, contribuye— para desbloquear las primeras.',
                    accion: como?.href && como.accion ? { etiqueta: como.accion, href: como.href } : { etiqueta: 'Ver el catálogo', href: '/insignias' },
                }}
                acciones={(t) => <BotonIcono icono={Trophy} etiqueta="Ver el catálogo completo" href="/insignias" acento={t.acento} tactil={t.tactil} />}
            >
                {(t) => {
                    const ultima = ganadas[0];
                    if (t.base === 'micro') {
                        const lado = Math.max(44, Math.min(t.ancho, t.alto));
                        return (
                            <Link href="/insignias" aria-label={`${ganadas.length} de ${total} insignias ganadas`} className="flex h-full cursor-pointer items-center justify-center">
                                <Anillo valor={total ? ganadas.length / total : 0} lado={lado} t={t} centro={String(ganadas.length)} />
                            </Link>
                        );
                    }
                    if (t.base === 's') {
                        return (
                            <div className="flex h-full min-h-0 items-center gap-3">
                                <Anillo valor={total ? ganadas.length / total : 0} lado={Math.max(58, Math.min(t.alto, 88))} t={t} centro={String(ganadas.length)} sub={`de ${total}`} />
                                <div className="min-w-0">
                                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/55">Última</p>
                                    <p className="truncate text-[13px] font-semibold" style={{ color: tintaDe(colorArea(ultima.area)) }}>{ultima.name}</p>
                                    {siguiente && <p className="mt-1 truncate text-[11px] text-white/60">Siguiente: {siguiente.name}</p>}
                                </div>
                            </div>
                        );
                    }
                    if (t.clase === 'm') {
                        const lado = Math.max(64, Math.min(t.alto * 0.62, t.ancho * 0.36, 120));
                        return (
                            <div className="flex h-full min-h-0 flex-col gap-2.5">
                                <div className="flex min-h-0 items-center gap-3">
                                    <Medalla b={ultima} ganada lado={lado} />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/55">Tu última insignia</p>
                                        <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-white">{ultima.name}</p>
                                        <p className="mt-0.5 text-[11px] text-white/55">
                                            <span style={{ color: tintaDe(colorArea(ultima.area)) }}>{NOMBRE_AREA[(ultima.area ?? 'general').toLowerCase()] ?? ultima.area}</span>
                                            {msDe(ultima.awarded_at) > 0 && <> · <Tiempo ms={msDe(ultima.awarded_at)} /></>}
                                        </p>
                                        <Barra valor={total ? ganadas.length / total : 0} t={t} etiqueta={`${ganadas.length} de ${total}`} />
                                    </div>
                                </div>
                                {siguiente && como && <Siguiente t={t} b={siguiente} como={como} compacta />}
                            </div>
                        );
                    }
                    const areas = Array.from(new Set(catalogo.map((b) => (b.area ?? 'general').toLowerCase())));
                    const piezas = (area === 'todas' ? catalogo : catalogo.filter((b) => (b.area ?? 'general').toLowerCase() === area));
                    // Ganadas primero (las más recientes antes), luego las que faltan.
                    const orden = [
                        ...ganadas.filter((g) => area === 'todas' || (g.area ?? 'general').toLowerCase() === area),
                        ...piezas.filter((b) => !codigosGanados.has(b.code)),
                    ];
                    if (t.clase === 'panoramico') {
                        const lado = Math.max(44, Math.min(t.alto - 34, 86));
                        const caben = Math.max(2, Math.floor((t.ancho - (siguiente ? 280 : 0)) / (lado + 16)));
                        return (
                            <div className="flex h-full min-h-0 items-center gap-4">
                                <Anillo valor={total ? ganadas.length / total : 0} lado={Math.max(56, Math.min(t.alto, 96))} t={t} centro={String(ganadas.length)} sub={`de ${total}`} />
                                <ul className="flex min-w-0 flex-1 items-center gap-3" aria-label="Vitrina de insignias">
                                    {orden.slice(0, caben).map((b) => (
                                        <li key={b.code} className="flex flex-col items-center gap-1" style={{ width: lado + 8 }}>
                                            <Medalla b={b} ganada={codigosGanados.has(b.code)} lado={lado} />
                                            <span className="w-full truncate text-center text-[10.5px] text-white/70" title={b.name}>{b.name}</span>
                                        </li>
                                    ))}
                                </ul>
                                {siguiente && como && t.ancho > 620 && <div className="w-[260px] shrink-0"><Siguiente t={t} b={siguiente} como={como} compacta /></div>}
                            </div>
                        );
                    }
                    const lado = t.base === 'xl' ? 72 : 58;
                    const cols = t.clase === 'torre' ? 2 : columnasQueCaben(t.ancho - (t.base === 'xl' ? 0 : 0), lado + 30, 3, 8);
                    return (
                        <div className="flex h-full min-h-0 flex-col gap-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                                <Barra valor={total ? ganadas.length / total : 0} t={t} etiqueta={`${ganadas.length} de ${total} ganadas`} ancha />
                                {areas.length > 1 && (
                                    <Segmentos<string> etiqueta="Área" acento={t.acento} tactil={t.tactil} valor={area} onCambio={setArea}
                                        opciones={[{ id: 'todas', etiqueta: 'Todas' }, ...areas.map((a) => ({ id: a, etiqueta: NOMBRE_AREA[a] ?? a }))]} />
                                )}
                            </div>
                            <div className={cn('grid min-h-0 flex-1 gap-3', siguiente && t.clase !== 'torre' ? 'grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]' : 'grid-cols-1')}>
                                <ul className="grid min-h-0 content-start gap-x-2 gap-y-3 overflow-y-auto pr-0.5 ss-scroll" style={{ gridTemplateColumns: `repeat(${siguiente && t.clase !== 'torre' ? Math.max(2, cols - 2) : cols}, minmax(0,1fr))` }} aria-label="Vitrina de insignias">
                                    {orden.map((b) => (
                                        <li key={b.code} className="flex flex-col items-center gap-1 text-center" title={`${b.name}${b.description ? `: ${b.description}` : ''}`}>
                                            <Medalla b={b} ganada={codigosGanados.has(b.code)} lado={lado} />
                                            <span className={cn('line-clamp-2 text-[11px] leading-tight', codigosGanados.has(b.code) ? 'text-white/85' : 'text-white/45')}>{b.name}</span>
                                        </li>
                                    ))}
                                </ul>
                                {siguiente && como && t.clase !== 'torre' && <Siguiente t={t} b={siguiente} como={como} />}
                            </div>
                        </div>
                    );
                }}
            </MarcoSocial>
        </div>
    );
}

// ── Medalla dibujada (SVG) ──────────────────────────────────────────

function Medalla({ b, ganada, lado }: { b: Pick<Badge, 'code' | 'icon' | 'area' | 'name'>; ganada: boolean; lado: number }) {
    const id = React.useId().replace(/:/g, '');
    const c = colorArea(b.area);
    const Icono = ganada ? iconoDe(b) : Lock;
    const claro = mezclar(c, '#ffffff', 0.45);
    const oscuro = mezclar(c, '#1a1233', 0.55);
    return (
        <span className="relative inline-grid shrink-0 place-items-center" style={{ width: lado, height: lado }} role="img" aria-label={`${b.name}: ${ganada ? 'ganada' : 'por ganar'}`}>
            <svg viewBox="0 0 100 100" width={lado} height={lado} aria-hidden className="absolute inset-0 overflow-visible">
                <defs>
                    <linearGradient id={`m-${id}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={ganada ? claro : 'rgba(255,255,255,.14)'} />
                        <stop offset="55%" stopColor={ganada ? c : 'rgba(255,255,255,.06)'} />
                        <stop offset="100%" stopColor={ganada ? oscuro : 'rgba(255,255,255,.03)'} />
                    </linearGradient>
                    <radialGradient id={`h-${id}`}>
                        <stop offset="0%" stopColor={c} stopOpacity={0.45} />
                        <stop offset="100%" stopColor={c} stopOpacity={0} />
                    </radialGradient>
                </defs>
                {ganada && <circle cx={50} cy={52} r={50} fill={`url(#h-${id})`} />}
                {/* Doce puntas: el filo de la medalla. */}
                <path d={estrella(50, 50, 46, 40, 12)} fill={`url(#m-${id})`} stroke={ganada ? claro : 'rgba(255,255,255,.18)'} strokeOpacity={ganada ? 0.9 : 1} strokeWidth={1.2} />
                <circle cx={50} cy={50} r={30} fill={ganada ? 'rgba(12,14,34,.35)' : 'rgba(12,14,34,.5)'} stroke={ganada ? claro : 'rgba(255,255,255,.12)'} strokeOpacity={0.6} />
                {ganada && <path d="M30 34 Q50 20 70 34" fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={2} strokeLinecap="round" />}
            </svg>
            <Icono className="relative" style={{ width: lado * 0.3, height: lado * 0.3, color: ganada ? '#fff' : 'rgba(255,255,255,.4)' }} strokeWidth={1.6} aria-hidden />
        </span>
    );
}

function estrella(cx: number, cy: number, rExt: number, rInt: number, puntas: number): string {
    const pts: string[] = [];
    for (let i = 0; i < puntas * 2; i++) {
        const r = i % 2 === 0 ? rExt : rInt;
        const a = (i / (puntas * 2)) * Math.PI * 2 - Math.PI / 2;
        pts.push(`${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`);
    }
    return `M${pts.join('L')}Z`;
}

// ── Anillo y barra de la colección ──────────────────────────────────

function Anillo({ valor, lado, t, centro, sub }: { valor: number; lado: number; t: TamanoSocial; centro: string; sub?: string }) {
    const r = 42, per = 2 * Math.PI * r;
    return (
        <svg width={lado} height={lado} viewBox="0 0 100 100" role="img" aria-label={`Colección: ${Math.round(valor * 100)} %`} className="shrink-0">
            <circle cx={50} cy={50} r={r} fill="none" stroke="#fff" strokeOpacity={0.1} strokeWidth={7} />
            <circle cx={50} cy={50} r={r} fill="none" stroke={t.acento} strokeWidth={7} strokeLinecap="round"
                strokeDasharray={`${Math.max(0.001, valor) * per} ${per}`} transform="rotate(-90 50 50)" style={{ filter: `drop-shadow(0 0 4px ${conAlfa(t.acento, 0.7)})` }} />
            <text x={50} y={sub ? 52 : 57} textAnchor="middle" fill="#fff" fontSize={sub ? 24 : 28} fontWeight={300} style={{ fontVariantNumeric: 'tabular-nums' }}>{centro}</text>
            {sub && <text x={50} y={68} textAnchor="middle" fill="#fff" fillOpacity={0.55} fontSize={10} fontWeight={600}>{sub}</text>}
        </svg>
    );
}

function Barra({ valor, t, etiqueta, ancha = false }: { valor: number; t: TamanoSocial; etiqueta: string; ancha?: boolean }) {
    return (
        <div className={cn('flex items-center gap-2', ancha ? 'min-w-[160px] flex-1' : 'mt-2')}>
            <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(valor * 100)} aria-label={`Colección de insignias: ${etiqueta}`}>
                <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.round(valor * 100)}%`, background: `linear-gradient(90deg, ${conAlfa(t.acento, 0.6)}, ${t.acento})` }} />
            </span>
            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-white/70">{etiqueta}</span>
        </div>
    );
}

// ── La siguiente ────────────────────────────────────────────────────

function Siguiente({ t, b, como, compacta = false }: { t: TamanoSocial; b: Badge; como: ReturnType<typeof comoSeGana>; compacta?: boolean }) {
    return (
        <section className={cn('flex min-w-0 gap-3 rounded-[16px] p-2.5', compacta ? 'items-center' : 'flex-col')} aria-label={`Siguiente insignia: ${b.name}`}
            style={{ background: `linear-gradient(160deg, ${conAlfa(colorArea(b.area), 0.12)}, rgba(255,255,255,.02))` }}>
            <div className="flex min-w-0 items-center gap-2.5">
                <Medalla b={b} ganada={false} lado={compacta ? 40 : 52} />
                <div className="min-w-0">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/55">Siguiente</p>
                    <p className="truncate text-[13px] font-semibold text-white">{b.name}</p>
                </div>
            </div>
            {!compacta && <p className="line-clamp-4 text-[11.5px] leading-snug text-white/65">{como.texto}</p>}
            {como.href && como.accion && (
                <div className={compacta ? 'ml-auto shrink-0' : ''}>
                    <Pastilla acento={colorArea(b.area)} href={como.href} tactil={t.tactil} title={como.texto}>{como.accion}</Pastilla>
                </div>
            )}
        </section>
    );
}

export default BadgesWidget;
