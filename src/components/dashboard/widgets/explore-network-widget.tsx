'use client';

// ════════════════════════════════════════════════════════════════
// ExploreNetworkWidget — descubrir la Red, con datos REALES (Ola 0929 · D)
// ----------------------------------------------------------------
// Comunidades, páginas y grupos de verdad (`os_pages` / `os_groups`) con
// su actividad medida (publicaciones de `os_posts` de la última semana) y
// un orden que se explica: cada entidad dice POR QUÉ aparece (miembros,
// publicaciones esta semana, nueva, afín a tus grupos). Sin partidos ni
// entidades de relleno: lo que no existe en la base no se enseña.
// Acciones reales: unirse a un grupo (`os_memberships`), seguir una página
// (`os_follows`), abrir su página y fundar una nueva con el diálogo real.
// Tráfico: solo los hooks compartidos de os-live (una lectura + el canal
// común de cada tabla); nada de sondeos propios.
//
// micro = la entidad más viva · s = su tarjeta · m/torre = las que más
// se mueven · l = filtros + búsqueda + unirse/seguir · xl = mosaico de
// tarjetas con portada · panorámico = el pulso de la Red + tarjetas.
// Estados: cargando (esqueleto de tarjetas), vacío con «Fundar», sin
// resultados por filtro con «Ver todo». No hay error que enseñar: los hooks
// de os-live degradan a lista vacía y el vacío lo dice.
// ════════════════════════════════════════════════════════════════

import * as React from 'react';
import Link from 'next/link';
import { Compass, Plus, Sparkles, Telescope, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrentUid, useLiveGroups, useLivePages, useLivePosts, useMyMemberships } from '@/lib/widget-data/os-live';
import { conAlfa } from '@/components/widgets-libres/acentos-categoria';
import { MarcoSocial, estadoSocial } from './_social-d/marco-social';
import { BotonIcono, Buscador, Cifra, Pastilla, Segmentos, estilosSocial as estilos } from './_social-d/piezas';
import { BotonRelacion, Escudo, FilaEntidad, TarjetaEntidad, useAccionesEntidad } from './_social-d/entidad-piezas';
import { actividadPorEntidad, afinidadDe, claveEntidad, entidadDeGrupo, entidadDePagina, puntuar, type Puntuada } from './_social-d/entidades';
import { useCrearEntidad } from './_social-d/crear-entidad';
import { columnasQueCaben, filasQueCaben, type TamanoSocial } from './_social-d/tamano';
import { coincide, formatoNumero } from './_social-d/formato';

const ACENTO = '#fb923c';

type Filtro = 'descubrir' | 'comunidades' | 'grupos' | 'nuevas';

export function ExploreNetworkWidget() {
    const { uid } = useCurrentUid();
    const paginas = useLivePages();
    const grupos = useLiveGroups();
    const posts = useLivePosts(40);
    const membresias = useMyMemberships(uid);
    const [filtro, setFiltro] = React.useState<Filtro>('descubrir');
    const [consulta, setConsulta] = React.useState('');
    const crear = useCrearEntidad(() => { void paginas.reload(); void grupos.reload(); });

    const miembroDe = React.useMemo(() => new Set(membresias.rows.map((m) => m.group_slug)), [membresias.rows]);
    const acciones = useAccionesEntidad(uid, miembroDe);

    const ahora = Date.now();
    const todas: Puntuada[] = React.useMemo(() => {
        const ents = [
            ...paginas.rows.filter((p) => (p.kind ?? '').toLowerCase() !== 'perfil').map(entidadDePagina),
            ...grupos.rows.map(entidadDeGrupo),
        ];
        const act = actividadPorEntidad(posts.rows, ahora);
        const afin = afinidadDe(ents.filter((e) => e.origen === 'grupo'), membresias.rows);
        return ents
            .map((e) => puntuar(e, act.get(claveEntidad(e.origen, e.slug)) ?? null, afin, ahora))
            .sort((a, b) => b.puntos - a.puntos);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paginas.rows, grupos.rows, posts.rows, membresias.rows]);

    const mias = (p: Puntuada) => acciones.relacion(p.e) !== null;
    const visibles = React.useMemo(() => {
        let l = todas;
        if (filtro === 'descubrir') l = l.filter((p) => !mias(p));
        if (filtro === 'comunidades') l = l.filter((p) => p.e.origen === 'pagina');
        if (filtro === 'grupos') l = l.filter((p) => p.e.origen === 'grupo');
        if (filtro === 'nuevas') l = l.filter((p) => p.nueva);
        if (consulta.trim()) l = l.filter((p) => coincide(`${p.e.nombre} ${p.e.descripcion} ${p.e.etiquetas.join(' ')} ${p.e.claseEtiqueta}`, consulta));
        return l;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [todas, filtro, consulta, acciones.relacion]);

    const pulso = React.useMemo(() => ({
        comunidades: todas.filter((p) => p.e.origen === 'pagina').length,
        grupos: todas.filter((p) => p.e.origen === 'grupo').length,
        nuevas: todas.filter((p) => p.nueva).length,
        semana: todas.reduce((n, p) => n + (p.actividad?.semana ?? 0), 0),
    }), [todas]);

    const estado = estadoSocial({ cargando: paginas.loading && grupos.loading, hayDatos: todas.length > 0 });
    const destacada = (filtro === 'descubrir' ? todas.find((p) => !mias(p)) : null) ?? todas[0];

    const accion = (p: Puntuada, t: TamanoSocial, soloIcono = false) => (
        <BotonRelacion e={p.e} relacion={acciones.relacion(p.e)} onActuar={acciones.actuar} enCurso={acciones.enCurso === p.e.id} acento={t.acento} tactil={t.tactil} soloIcono={soloIcono} />
    );

    return (
        <>
            <MarcoSocial
                titulo="Explorar Red"
                subtitulo={`${formatoNumero(todas.length)} entidades vivas${pulso.nuevas ? ` · ${pulso.nuevas} nuevas` : ''}`}
                icono={Telescope}
                categoria="descubrimientos"
                acento={ACENTO}
                estado={estado}
                esqueleto="tarjetas"
                vacio={{ icono: Compass, titulo: 'La Red aún no tiene comunidades', mensaje: 'Funda la primera: una página para tu comunidad o un grupo para tu círculo.', accion: { etiqueta: 'Fundar una comunidad', onClick: () => crear.abrir('page') } }}
                acciones={(t) => (
                    <>
                        <BotonIcono icono={Plus} etiqueta="Fundar una comunidad o grupo" onClick={() => crear.abrir('page')} acento={t.acento} tactil={t.tactil} />
                        <BotonIcono icono={Compass} etiqueta="Abrir el explorador" href="/explorer" acento={t.acento} tactil={t.tactil} />
                    </>
                )}
            >
                {(t) => {
                    if (t.base === 'micro') {
                        return (
                            <Link href={destacada.e.href} aria-label={`${destacada.e.nombre}: ${destacada.motivos.join(', ')}`} className="flex h-full cursor-pointer flex-col items-center justify-center gap-1">
                                <Escudo e={destacada.e} tam={Math.max(32, Math.min(t.ancho, t.alto) * 0.5)} />
                                <span className="max-w-full truncate text-[11px] font-semibold text-white/85">{destacada.e.nombre}</span>
                            </Link>
                        );
                    }
                    if (t.base === 's') {
                        return (
                            <div className="flex h-full min-h-0 flex-col justify-center gap-2">
                                <Link href={destacada.e.href} className="flex cursor-pointer items-center gap-2.5" aria-label={`${destacada.e.nombre}: ${destacada.motivos.join(', ')}`}>
                                    <Escudo e={destacada.e} tam={42} />
                                    <span className="min-w-0">
                                        <span className="block truncate text-[13px] font-semibold text-white">{destacada.e.nombre}</span>
                                        <span className="block truncate text-[11px]" style={{ color: destacada.e.acento }}>{destacada.e.claseEtiqueta}</span>
                                    </span>
                                </Link>
                                <p className="line-clamp-2 text-[11.5px] text-white/60">{destacada.motivos.join(' · ') || destacada.e.descripcion}</p>
                                <div>{accion(destacada, t)}</div>
                            </div>
                        );
                    }
                    const barra = (
                        <div className="flex flex-wrap items-center gap-2">
                            <Segmentos<Filtro> etiqueta="Qué descubrir" acento={t.acento} tactil={t.tactil} valor={filtro} onCambio={setFiltro}
                                opciones={[
                                    { id: 'descubrir', etiqueta: 'Para descubrir', icono: Sparkles },
                                    { id: 'comunidades', etiqueta: 'Páginas', n: pulso.comunidades },
                                    { id: 'grupos', etiqueta: 'Grupos', n: pulso.grupos },
                                    ...(pulso.nuevas ? [{ id: 'nuevas' as const, etiqueta: 'Nuevas', n: pulso.nuevas }] : []),
                                ]} />
                            {(t.base === 'xl' || t.ancho > 560) && (
                                <Buscador valor={consulta} onCambio={setConsulta} placeholder="Buscar por nombre o tema…" etiqueta="Buscar entidades" acento={t.acento} tactil={t.tactil} className="min-w-[180px] flex-1" />
                            )}
                        </div>
                    );
                    const sinResultados = (
                        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center" role="status">
                            <p className="text-[12.5px] text-white/65">{consulta ? `Nada coincide con «${consulta}».` : filtro === 'descubrir' ? 'Ya participas en todo lo que hay: ¡funda algo nuevo!' : 'Nada con este filtro.'}</p>
                            <Pastilla acento={t.acento} onClick={() => { setFiltro('comunidades'); setConsulta(''); }} tactil={t.tactil}>Ver todo</Pastilla>
                        </div>
                    );

                    if (t.clase === 'panoramico') {
                        if (t.alto < 200) {
                            const cols = columnasQueCaben(t.ancho, 250, 1, 5);
                            return (
                                <ul className="grid h-full min-h-0 items-center gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }} aria-label="Entidades">
                                    {visibles.slice(0, cols).map((p) => <li key={p.e.id} className="min-w-0"><FilaEntidad p={p} acento={t.acento} tactil={t.tactil} derecha={accion(p, t, true)} /></li>)}
                                </ul>
                            );
                        }
                        const anchoPulso = 200;
                        const cols = columnasQueCaben(t.ancho - anchoPulso - 16, 200, 1, 5);
                        return (
                            <div className="flex h-full min-h-0 gap-4">
                                <Pulso t={t} pulso={pulso} ancho={anchoPulso} onFundar={() => crear.abrir('page')} onGrupo={() => crear.abrir('group')} />
                                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
                                    {barra}
                                    {visibles.length === 0 ? sinResultados : (
                                        <ul className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }} aria-label="Entidades">
                                            {visibles.slice(0, cols).map((p) => <li key={p.e.id} className="min-h-0"><TarjetaEntidad p={p} acento={t.acento} tactil={t.tactil} accion={accion(p, t)} altoPortada={Math.max(56, Math.min(110, t.alto * 0.28))} /></li>)}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        );
                    }
                    if (t.base === 'xl') {
                        const cols = columnasQueCaben(t.ancho, 190, 2, 4);
                        const filas = Math.max(1, Math.floor((t.alto - 50) / 230));
                        return (
                            <div className="flex h-full min-h-0 flex-col gap-2.5">
                                {barra}
                                {visibles.length === 0 ? sinResultados : (
                                    <ul className="grid min-h-0 flex-1 auto-rows-fr gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }} aria-label="Entidades">
                                        {visibles.slice(0, cols * filas).map((p) => <li key={p.e.id} className="min-h-0"><TarjetaEntidad p={p} acento={t.acento} tactil={t.tactil} accion={accion(p, t)} /></li>)}
                                    </ul>
                                )}
                            </div>
                        );
                    }
                    const conBarra = t.base === 'l';
                    const max = filasQueCaben(t.alto - (conBarra ? 44 : 0), t.tactil ? 58 : 50, 2, 9);
                    return (
                        <div className="flex h-full min-h-0 flex-col gap-2">
                            {conBarra && barra}
                            {visibles.length === 0 ? sinResultados : (
                                <ul className={cn('flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-0.5 ss-scroll', visibles.length > max && estilos.desvanece)} aria-label="Entidades">
                                    {(conBarra ? visibles : todas.filter((p) => !mias(p)).concat(todas.filter(mias))).slice(0, max).map((p) => (
                                        <li key={p.e.id} className={estilos.aparece}><FilaEntidad p={p} acento={t.acento} tactil={t.tactil} derecha={accion(p, t, t.ancho < 330)} /></li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                }}
            </MarcoSocial>
            {crear.dialogo}
        </>
    );
}

function Pulso({ t, pulso, ancho, onFundar, onGrupo }: { t: TamanoSocial; pulso: { comunidades: number; grupos: number; nuevas: number; semana: number }; ancho: number; onFundar: () => void; onGrupo: () => void }) {
    return (
        <aside className="flex h-full shrink-0 flex-col justify-between gap-3 rounded-[18px] p-3" style={{ width: ancho, background: `radial-gradient(120% 90% at 0% 0%, ${conAlfa(t.acento, 0.2)}, transparent 70%)` }} aria-label="Pulso de la Red">
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                <Cifra valor={formatoNumero(pulso.comunidades)} etiqueta="Páginas" acento={t.acento} />
                <Cifra valor={formatoNumero(pulso.grupos)} etiqueta="Grupos" acento={t.acento} />
                <Cifra valor={formatoNumero(pulso.nuevas)} etiqueta="Nuevas (14 d)" />
                <Cifra valor={formatoNumero(pulso.semana)} etiqueta="Publ. semana" />
            </div>
            <div className="flex flex-col gap-1.5">
                <Pastilla acento={t.acento} icono={Plus} onClick={onFundar} solida tactil={t.tactil}>Fundar comunidad</Pastilla>
                <Pastilla acento={t.acento} icono={Users} onClick={onGrupo} tactil={t.tactil}>Crear grupo</Pastilla>
            </div>
        </aside>
    );
}

export default ExploreNetworkWidget;
