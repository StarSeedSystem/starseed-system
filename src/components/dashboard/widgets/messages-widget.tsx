'use client';

// ════════════════════════════════════════════════════════════════
// MessagesWidget — la bandeja REAL de la mensajería del OS (Ola 0929 · D)
// ----------------------------------------------------------------
// Lo que se abre cinco veces al día: quién me ha escrito, qué dice y
// contestar sin salir del tablero. Fuente: `os_dm_*` (la misma de
// /messages), leída en una vuelta LIGERA compartida (≤ 6 peticiones cada
// ≥ 5 min y solo a la vista). Los ajustes de /messages mandan: archivados
// fuera, silenciados sin contar, apodos y nombres de la libreta de
// contactos antes que el del perfil, presencia recíproca.
//
// micro = el número de no leídos en un orbe · s = quién espera y su última
// línea · m/torre = la bandeja · l = + filtros, favoritos de la libreta y
// respuesta rápida en línea · xl = bandeja + conversación abierta con sus
// últimos mensajes y el compositor · panorámico = la bandeja en fila.
// Estados: cargando (esqueleto de lista), sin sesión, vacío con CTA,
// error con reintento.
// ════════════════════════════════════════════════════════════════

import * as React from 'react';
import Link from 'next/link';
import {
    BellOff, Check, CheckCheck, CornerDownLeft, MessageCircle, Plus, Send, Sparkles, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrentUid } from '@/lib/widget-data/os-live';
import { markRead, sendMessage } from '@/lib/messages/dm';
import { useAjustesMensajeria } from '@/lib/mensajeria/ajustes-store';
import { useContactos } from '@/lib/contactos/store';
import type { Contacto } from '@/lib/contactos/tipos';
import { conAlfa } from '@/components/widgets-libres/acentos-categoria';
import { MarcoSocial, estadoSocial } from './_social-d/marco-social';
import { useFuenteCompartida, useEnPantalla } from './_social-d/fuente-compartida';
import { cargarBandeja, presenciaDe, type BandejaMensajes, type HiloResumen, type UltimoMensaje } from './_social-d/mensajes-datos';
import { Avatar, BotonActualizar, BotonIcono, Pastilla, Segmentos, Tiempo, estilosSocial as estilos, tintaDe } from './_social-d/piezas';
import { filasQueCaben, type TamanoSocial } from './_social-d/tamano';
import { recortar } from './_social-d/formato';

const ACENTO = '#ec4899';

type Filtro = 'todos' | 'sin-leer' | 'grupos';

/** Un hilo listo para pintar: nombre, avatar, presencia y ajustes ya resueltos. */
interface HiloVista {
    h: HiloResumen;
    nombre: string;
    avatar: string | null;
    handle: string | null;
    presencia: 'en-linea' | 'reciente' | null;
    silenciado: boolean;
    linea: string;
    href: string;
}

function hrefDe(h: HiloResumen, handle: string | null): string {
    // /messages abre un DM por `?to=@usuario`; los grupos se abren desde su lista.
    return h.tipo === 'dm' && handle ? `/messages?to=${encodeURIComponent(handle)}` : '/messages';
}

export function MessagesWidget() {
    const { uid, ready } = useCurrentUid();
    const refRaiz = React.useRef<HTMLDivElement | null>(null);
    const enPantalla = useEnPantalla(refRaiz);
    const fuente = useFuenteCompartida<BandejaMensajes | null>(uid ? `mensajes:${uid}` : null, cargarBandeja, { enPantalla });
    const aj = useAjustesMensajeria();
    const libreta = useContactos();
    const [filtro, setFiltro] = React.useState<Filtro>('todos');
    const [abierto, setAbierto] = React.useState<string | null>(null);

    const bandeja = fuente.datos ?? null;
    const ahora = Date.now();
    const verPresencia = aj.ajustes.privacidad.mostrarEnLinea !== 'nadie';

    const hilos: HiloVista[] = React.useMemo(() => {
        if (!bandeja) return [];
        return bandeja.hilos
            .map((h) => {
                const ef = aj.efectivos(h.id, h.tipo === 'group' ? 'grupo' : 'dm');
                if (ef.archivado) return null;
                const perfil = h.companero ? bandeja.perfiles[h.companero] : undefined;
                const contacto = h.companero ? libreta.porUserId(h.companero) : undefined;
                const nombre = ef.apodo || h.titulo || (contacto ? contacto.apodo || contacto.nombre : perfil?.nombre)
                    || (h.tipo === 'group' ? `Grupo de ${h.miembros.length}` : 'Conversación');
                const handle = perfil?.handle ?? contacto?.username ?? null;
                let linea = h.ultimo?.texto || 'Sin mensajes todavía';
                const r = h.ultimo?.remitente;
                if (h.ultimo && h.ultimo.tipo !== 'system') {
                    if (r && r === bandeja.uid) linea = `Tú: ${linea}`;
                    else if (h.ultimo.tipo === 'agent') linea = `Aurora: ${linea}`;
                    else if (h.tipo === 'group' && r && bandeja.perfiles[r]) linea = `${bandeja.perfiles[r].nombre.split(' ')[0]}: ${linea}`;
                }
                return {
                    h,
                    nombre,
                    avatar: h.avatar ?? perfil?.avatar ?? contacto?.perfil?.avatarUrl ?? null,
                    handle,
                    presencia: verPresencia && h.companero ? presenciaDe(bandeja.vistos[h.companero], ahora) : null,
                    silenciado: ef.silenciado,
                    linea,
                    href: hrefDe(h, handle),
                } satisfies HiloVista;
            })
            .filter((x): x is HiloVista => x !== null);
        // `ahora` cambia en cada pintado: la presencia se recalcula con los datos, no con el reloj.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bandeja, aj, libreta, verPresencia]);

    const noLeidos = hilos.reduce((n, x) => n + (x.silenciado ? 0 : x.h.noLeidos), 0);
    const hayMas = hilos.some((x) => !x.silenciado && x.h.noLeidosMas);
    const enLinea = hilos.filter((x) => x.presencia === 'en-linea').length;

    const favoritos: Contacto[] = React.useMemo(() => {
        const conCuenta = libreta.contactos.filter((c) => c.userId && c.username && c.userId !== uid);
        const favs = conCuenta.filter((c) => c.favorito);
        return (favs.length ? favs : [...conCuenta].sort((a, b) => (Date.parse(b.actualizado) || 0) - (Date.parse(a.actualizado) || 0))).slice(0, 8);
    }, [libreta.contactos, uid]);

    const estado = estadoSocial({
        sinSesion: ready && !uid || (fuente.datos === null && !fuente.cargando),
        cargando: !ready || fuente.cargando,
        hayDatos: hilos.length > 0,
        error: fuente.fallo ? new Error(fuente.fallo.message || `HTTP ${fuente.fallo.status ?? ''}`) : undefined,
    });

    // Responder o marcar como leído: la acción es la real y la bandeja se corrige en memoria.
    const alEnviar = React.useCallback((hiloId: string, texto: string) => {
        fuente.mutar((prev) => {
            if (!prev) return prev;
            const ahoraMs = Date.now();
            const mio: UltimoMensaje = { texto, remitente: prev.uid, tipo: 'user', adjunto: null, ms: ahoraMs };
            const hilosNuevos: HiloResumen[] = prev.hilos.map((h) => (h.id === hiloId
                ? { ...h, noLeidos: 0, noLeidosMas: false, ms: ahoraMs, ultimo: mio, recientes: [mio, ...h.recientes].slice(0, 4) }
                : h));
            return { ...prev, hilos: hilosNuevos };
        });
    }, [fuente]);
    const alLeer = React.useCallback((hiloId: string) => {
        void markRead(hiloId);
        fuente.mutar((prev) => (prev ? { ...prev, hilos: prev.hilos.map((h) => (h.id === hiloId ? { ...h, noLeidos: 0, noLeidosMas: false } : h)) } : prev));
    }, [fuente]);

    const cifra = `${noLeidos}${hayMas ? '+' : ''}`;

    return (
        <div ref={refRaiz} className="h-full w-full">
            <MarcoSocial
                titulo="Mensajes"
                subtitulo={() => (noLeidos ? `${cifra} sin leer` : 'Todo leído') + (enLinea ? ` · ${enLinea} en línea` : '')}
                icono={MessageCircle}
                categoria="social"
                acento={ACENTO}
                estado={estado}
                error={fuente.fallo ? new Error(fuente.fallo.message || 'fuente') : undefined}
                onReintentar={fuente.recargar}
                esqueleto="lista"
                vacio={{ titulo: 'Tu bandeja está tranquila', mensaje: 'Escribe a alguien de tu libreta o crea un grupo: aquí verás quién te responde.', accion: { etiqueta: 'Nuevo mensaje', href: '/messages' }, icono: MessageCircle }}
                sinSesion={{ mensaje: 'Entra para ver tus conversaciones y responder desde aquí.', href: '/login?next=/dashboard' }}
                acciones={(t) => (
                    <>
                        <BotonActualizar onClick={fuente.recargar} actualizando={fuente.actualizando} actualizado={fuente.actualizado} acento={t.acento} tactil={t.tactil} />
                        <BotonIcono icono={Plus} etiqueta="Nuevo mensaje" href="/messages" acento={t.acento} tactil={t.tactil} />
                    </>
                )}
            >
                {(t) => {
                    if (t.base === 'micro') return <Orbe t={t} cifra={cifra} n={noLeidos} primero={hilos.find((x) => x.h.noLeidos > 0) ?? hilos[0]} />;
                    if (t.base === 's') return <Espera t={t} hilos={hilos} cifra={cifra} n={noLeidos} />;
                    if (t.clase === 'panoramico') return <Fila t={t} hilos={hilos} cifra={cifra} n={noLeidos} />;
                    const lista = filtrar(hilos, filtro);
                    if (t.base === 'xl') {
                        const sel = hilos.find((x) => x.h.id === abierto) ?? hilos.find((x) => x.h.noLeidos > 0) ?? hilos[0];
                        return (
                            <div className="grid h-full min-h-0 grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-4">
                                <div className="flex min-h-0 flex-col gap-2">
                                    <Filtros t={t} filtro={filtro} setFiltro={setFiltro} hilos={hilos} />
                                    <Lista t={t} hilos={lista} max={filasQueCaben(t.alto - 40, 58, 2, 9)} seleccionado={sel?.h.id ?? null} onElegir={setAbierto} onLeer={alLeer} />
                                </div>
                                {sel && <Conversacion t={t} x={sel} uid={bandeja?.uid ?? null} perfiles={bandeja?.perfiles ?? {}} onEnviado={alEnviar} onLeer={alLeer} />}
                            </div>
                        );
                    }
                    if (t.base === 'l') {
                        return (
                            <div className="flex h-full min-h-0 flex-col gap-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <Filtros t={t} filtro={filtro} setFiltro={setFiltro} hilos={hilos} />
                                </div>
                                {favoritos.length > 0 && <Favoritos t={t} favoritos={favoritos} />}
                                <Lista t={t} hilos={lista} max={filasQueCaben(t.alto - (favoritos.length ? 110 : 44), 56, 2, 7)} responder abierto={abierto} onAbrir={setAbierto} onEnviado={alEnviar} onLeer={alLeer} />
                            </div>
                        );
                    }
                    // m y torre: la bandeja limpia.
                    return <Lista t={t} hilos={hilos} max={filasQueCaben(t.alto, t.clase === 'torre' ? 60 : 54, 2, 8)} onLeer={alLeer} />;
                }}
            </MarcoSocial>
        </div>
    );
}

function filtrar(hilos: HiloVista[], f: Filtro): HiloVista[] {
    if (f === 'sin-leer') return hilos.filter((x) => x.h.noLeidos > 0);
    if (f === 'grupos') return hilos.filter((x) => x.h.tipo === 'group');
    return hilos;
}

// ── micro: el orbe de no leídos ──────────────────────────────────────

function Orbe({ t, cifra, n, primero }: { t: TamanoSocial; cifra: string; n: number; primero?: HiloVista }) {
    const lado = Math.max(40, Math.min(t.ancho, t.alto));
    return (
        <Link href={primero?.href ?? '/messages'} aria-label={n ? `${cifra} mensajes sin leer. Abrir mensajes` : 'Sin mensajes nuevos. Abrir mensajes'}
            className="relative flex h-full cursor-pointer items-center justify-center">
            <span aria-hidden className={cn('absolute rounded-full', n ? 'ss-respirar' : '')}
                style={{ width: lado * 0.86, height: lado * 0.86, background: `radial-gradient(circle at 35% 30%, ${conAlfa(t.acento, n ? 0.55 : 0.2)}, ${conAlfa(t.acento, 0.08)} 70%, transparent)` }} />
            {n ? (
                <span className="relative font-light tabular-nums text-white" style={{ fontSize: lado * 0.36, lineHeight: 1 }}>{cifra}</span>
            ) : (
                <CheckCheck aria-hidden className="relative text-white/85" style={{ width: lado * 0.34, height: lado * 0.34 }} strokeWidth={1.5} />
            )}
        </Link>
    );
}

// ── s: quién espera ─────────────────────────────────────────────────

function Espera({ t, hilos, cifra, n }: { t: TamanoSocial; hilos: HiloVista[]; cifra: string; n: number }) {
    const pendientes = hilos.filter((x) => x.h.noLeidos > 0 && !x.silenciado);
    const foco = pendientes[0] ?? hilos[0];
    const pila = (pendientes.length ? pendientes : hilos).slice(0, 3);
    return (
        <Link href={foco.href} className="flex h-full min-w-0 cursor-pointer flex-col justify-center gap-2" aria-label={`${n ? `${cifra} sin leer. ` : ''}Último: ${foco.nombre}, ${foco.linea}`}>
            <div className="flex items-center gap-2">
                <span className="flex -space-x-2">
                    {pila.map((x) => <Avatar key={x.h.id} nombre={x.nombre} url={x.avatar} tam={t.tactil ? 32 : 28} presencia={x.presencia} className="rounded-full ring-2 ring-[rgba(12,14,34,.9)]" />)}
                </span>
                <span className="ml-auto font-light tabular-nums text-white" style={{ fontSize: 26, lineHeight: 1 }}>{n ? cifra : ''}</span>
                {!n && <CheckCheck className="ml-auto size-5 text-white/70" aria-hidden />}
            </div>
            <div className="min-w-0">
                <p className="truncate text-[12.5px] font-semibold text-white">{foco.nombre}</p>
                <p className="line-clamp-2 text-[11.5px] leading-snug text-white/65" title={foco.linea}>{foco.linea}</p>
            </div>
        </Link>
    );
}

// ── panorámico: la bandeja en fila ──────────────────────────────────

function Fila({ t, hilos, cifra, n }: { t: TamanoSocial; hilos: HiloVista[]; cifra: string; n: number }) {
    const caben = Math.max(1, Math.floor((t.ancho - 120) / 190));
    return (
        <div className="flex h-full min-h-0 items-center gap-4">
            <Link href="/messages" className="flex shrink-0 cursor-pointer flex-col items-center justify-center px-2" aria-label="Abrir mensajes">
                <span className="font-light tabular-nums text-white" style={{ fontSize: Math.min(40, Math.max(24, t.alto * 0.4)), lineHeight: 1, textShadow: `0 0 22px ${conAlfa(t.acento, 0.5)}` }}>{n ? cifra : '0'}</span>
                <span className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/55">sin leer</span>
            </Link>
            <ul className="flex min-w-0 flex-1 items-stretch gap-3">
                {hilos.slice(0, caben).map((x) => (
                    <li key={x.h.id} className="min-w-0 flex-1">
                        <Link href={x.href} className={cn(estilos.fila, 'flex h-full cursor-pointer items-center gap-2.5 px-2 py-1.5')} title={`${x.nombre}: ${x.linea}`}>
                            <Avatar nombre={x.nombre} url={x.avatar} tam={34} presencia={x.presencia} anillo={x.h.noLeidos > 0 && !x.silenciado} acento={t.acento} />
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5">
                                    <span className="truncate text-[12.5px] font-semibold text-white">{x.nombre}</span>
                                    <Tiempo ms={x.h.ultimo?.ms ?? x.h.ms} corto className="ml-auto text-[10.5px]" />
                                </span>
                                <span className="block truncate text-[11.5px] text-white/60">{x.linea}</span>
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}

// ── Filtros y favoritos ─────────────────────────────────────────────

function Filtros({ t, filtro, setFiltro, hilos }: { t: TamanoSocial; filtro: Filtro; setFiltro: (f: Filtro) => void; hilos: HiloVista[] }) {
    const sinLeer = hilos.filter((x) => x.h.noLeidos > 0).length;
    const grupos = hilos.filter((x) => x.h.tipo === 'group').length;
    return (
        <Segmentos<Filtro>
            etiqueta="Filtrar conversaciones"
            acento={t.acento}
            tactil={t.tactil}
            valor={filtro}
            onCambio={setFiltro}
            opciones={[
                { id: 'todos', etiqueta: 'Todas', n: hilos.length },
                { id: 'sin-leer', etiqueta: 'Sin leer', n: sinLeer },
                ...(grupos ? [{ id: 'grupos' as const, etiqueta: 'Grupos', n: grupos, icono: Users }] : []),
            ]}
        />
    );
}

function Favoritos({ t, favoritos }: { t: TamanoSocial; favoritos: Contacto[] }) {
    const caben = Math.max(2, Math.floor((t.ancho - 90) / 52));
    return (
        <div className="flex items-center gap-2">
            <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/50">Escribir a</span>
            <ul className="flex min-w-0 flex-1 items-center gap-1.5">
                {favoritos.slice(0, caben).map((c) => (
                    <li key={c.id}>
                        <Link href={`/messages?to=${encodeURIComponent(c.username ?? '')}`} title={`Escribir a ${c.apodo || c.nombre}`} aria-label={`Escribir a ${c.apodo || c.nombre}`}
                            className={cn('grid cursor-pointer place-items-center rounded-full ss-redondo transition-transform duration-200 hover:-translate-y-0.5', t.tactil ? 'size-11' : 'size-9')}>
                            <Avatar nombre={c.apodo || c.nombre} url={c.perfil?.avatarUrl} tam={t.tactil ? 40 : 32} />
                        </Link>
                    </li>
                ))}
            </ul>
            <Link href="/contactos" className="shrink-0 cursor-pointer text-[11px] font-semibold hover:underline" style={{ color: tintaDe(t.acento) }}>Contactos</Link>
        </div>
    );
}

// ── La lista (m / torre / l) ────────────────────────────────────────

function Lista({
    t, hilos, max, seleccionado, onElegir, responder = false, abierto, onAbrir, onEnviado, onLeer,
}: {
    t: TamanoSocial;
    hilos: HiloVista[];
    max: number;
    seleccionado?: string | null;
    onElegir?: (id: string) => void;
    responder?: boolean;
    abierto?: string | null;
    onAbrir?: (id: string | null) => void;
    onEnviado?: (id: string, texto: string) => void;
    onLeer: (id: string) => void;
}) {
    if (hilos.length === 0) {
        return <p className="grid flex-1 place-items-center text-center text-[12px] text-white/55" role="status">Nada por aquí con este filtro.</p>;
    }
    const tam = t.tactil ? 40 : t.base === 'l' || t.base === 'xl' ? 38 : 34;
    return (
        <ul className={cn('flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-0.5 ss-scroll', hilos.length > max && estilos.desvanece)} role="list" aria-label="Conversaciones">
            {hilos.slice(0, max).map((x) => {
                const nuevos = x.h.noLeidos > 0;
                const elegido = seleccionado === x.h.id;
                const principal = (
                    <>
                        <Avatar nombre={x.nombre} url={x.avatar} tam={tam} presencia={x.presencia} anillo={nuevos && !x.silenciado} acento={t.acento} />
                        <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                                {x.h.tipo === 'group' && <Users className="size-3 shrink-0 text-white/50" aria-label="Grupo" />}
                                <span className={cn('truncate text-[13px]', nuevos ? 'font-semibold text-white' : 'font-medium text-white/90')}>{x.nombre}</span>
                                {x.silenciado && <BellOff className="size-3 shrink-0 text-white/45" aria-label="Silenciado" />}
                                <Tiempo ms={x.h.ultimo?.ms ?? x.h.ms} corto className="ml-auto text-[10.5px]" />
                            </span>
                            <span className="mt-0.5 flex items-center gap-2">
                                <span className={cn('min-w-0 flex-1 truncate text-[12px]', nuevos ? 'text-white/80' : 'text-white/55')} title={x.linea}>
                                    {x.h.ultimo?.tipo === 'agent' && <Sparkles className="mr-1 inline size-3 align-[-2px] text-white/60" aria-hidden />}
                                    {x.linea}
                                </span>
                                {nuevos && (
                                    <span className="grid min-w-5 shrink-0 place-items-center rounded-full ss-redondo px-1.5 text-[10.5px] font-bold tabular-nums text-white"
                                        style={{ height: 18, background: x.silenciado ? 'rgba(148,163,184,.35)' : t.acento, boxShadow: x.silenciado ? undefined : `0 0 10px ${conAlfa(t.acento, 0.6)}` }}
                                        aria-label={`${x.h.noLeidos}${x.h.noLeidosMas ? ' o más' : ''} sin leer`}>
                                        {x.h.noLeidos}{x.h.noLeidosMas ? '+' : ''}
                                    </span>
                                )}
                            </span>
                        </span>
                    </>
                );
                return (
                    <li key={x.h.id} className={cn(estilos.fila, estilos.aparece)} style={elegido ? { background: conAlfa(t.acento, 0.14) } : undefined}>
                        <div className="flex items-center gap-1">
                            {onElegir ? (
                                <button type="button" onClick={() => onElegir(x.h.id)} aria-pressed={elegido} aria-label={`Ver conversación con ${x.nombre}`}
                                    className={cn('flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-2 text-left', t.tactil ? 'py-2' : 'py-1.5')}>
                                    {principal}
                                </button>
                            ) : (
                                <Link href={x.href} className={cn('flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-2', t.tactil ? 'py-2' : 'py-1.5')} aria-label={`Abrir conversación con ${x.nombre}`}>
                                    {principal}
                                </Link>
                            )}
                            {responder && (
                                <BotonIcono icono={CornerDownLeft} etiqueta={`Responder a ${x.nombre}`} onClick={() => onAbrir?.(abierto === x.h.id ? null : x.h.id)} acento={t.acento} activo={abierto === x.h.id} tactil={t.tactil} />
                            )}
                            {responder && nuevos && (
                                <BotonIcono icono={Check} etiqueta={`Marcar como leída la conversación con ${x.nombre}`} onClick={() => onLeer(x.h.id)} acento={t.acento} tactil={t.tactil} />
                            )}
                        </div>
                        {responder && abierto === x.h.id && onEnviado && (
                            <div className="px-2 pb-2 pt-1">
                                <Compositor t={t} hiloId={x.h.id} nombre={x.nombre} onEnviado={(texto) => { onEnviado(x.h.id, texto); onAbrir?.(null); }} autoFoco />
                            </div>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

// ── xl: la conversación abierta ─────────────────────────────────────

function Conversacion({
    t, x, uid, perfiles, onEnviado, onLeer,
}: {
    t: TamanoSocial;
    x: HiloVista;
    uid: string | null;
    perfiles: BandejaMensajes['perfiles'];
    onEnviado: (id: string, texto: string) => void;
    onLeer: (id: string) => void;
}) {
    const mensajes = [...x.h.recientes].reverse();
    return (
        <section className="flex min-h-0 flex-col gap-2 rounded-[18px] p-3" aria-label={`Conversación con ${x.nombre}`}
            style={{ background: `linear-gradient(160deg, ${conAlfa(t.acento, 0.1)}, rgba(255,255,255,.02) 60%)` }}>
            <header className="flex items-center gap-2.5">
                <Avatar nombre={x.nombre} url={x.avatar} tam={36} presencia={x.presencia} />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-white">{x.nombre}</p>
                    <p className="truncate text-[11px] text-white/55">
                        {x.presencia === 'en-linea' ? 'en línea' : x.h.tipo === 'group' ? `${x.h.miembros.length} personas` : x.handle ? `@${x.handle}` : 'mensaje directo'}
                    </p>
                </div>
                {x.h.noLeidos > 0 && <Pastilla acento={t.acento} icono={Check} onClick={() => onLeer(x.h.id)} tactil={t.tactil}>Leído</Pastilla>}
                <Pastilla acento={t.acento} href={x.href} tactil={t.tactil}>Abrir chat</Pastilla>
            </header>
            <ol className="flex min-h-0 flex-1 flex-col justify-end gap-1.5 overflow-hidden" aria-label="Últimos mensajes">
                {mensajes.length === 0 && <li className="text-center text-[12px] text-white/50">Aún no hay mensajes en este hilo.</li>}
                {mensajes.map((m, i) => {
                    const mio = m.remitente === uid;
                    const autor = !mio && x.h.tipo === 'group' && m.remitente ? perfiles[m.remitente]?.nombre : null;
                    return (
                        <li key={`${m.ms}-${i}`} className={cn('flex', mio ? 'justify-end' : 'justify-start')}>
                            <span className={cn('max-w-[85%] rounded-[16px] px-3 py-1.5 text-[12.5px] leading-snug', mio ? 'rounded-br-[6px] text-white' : 'rounded-bl-[6px] text-white/90')}
                                style={mio ? { background: conAlfa(t.acento, 0.32) } : { background: 'rgba(255,255,255,.07)' }}>
                                {autor && <span className="block text-[10.5px] font-semibold" style={{ color: tintaDe(t.acento) }}>{autor}</span>}
                                <span className="line-clamp-3 break-words">{m.tipo === 'agent' ? `Aurora: ${m.texto}` : m.texto || (m.adjunto ?? '')}</span>
                                <span className="mt-0.5 block text-right"><Tiempo ms={m.ms} corto className="text-[10px]" /></span>
                            </span>
                        </li>
                    );
                })}
            </ol>
            <Compositor t={t} hiloId={x.h.id} nombre={x.nombre} onEnviado={(texto) => onEnviado(x.h.id, texto)} />
        </section>
    );
}

// ── Compositor de respuesta rápida ──────────────────────────────────

function Compositor({ t, hiloId, nombre, onEnviado, autoFoco = false }: { t: TamanoSocial; hiloId: string; nombre: string; onEnviado: (texto: string) => void; autoFoco?: boolean }) {
    const [texto, setTexto] = React.useState('');
    const [estado, setEstado] = React.useState<'quieto' | 'enviando' | 'enviado' | 'fallo'>('quieto');
    const ref = React.useRef<HTMLInputElement | null>(null);
    React.useEffect(() => { if (autoFoco) ref.current?.focus(); }, [autoFoco]);

    const enviar = async (e?: React.FormEvent) => {
        e?.preventDefault();
        const cuerpo = texto.trim();
        if (!cuerpo || estado === 'enviando') return;
        setEstado('enviando');
        const m = await sendMessage(hiloId, { body: cuerpo });
        if (m) {
            setTexto('');
            setEstado('enviado');
            onEnviado(cuerpo);
            void markRead(hiloId);
        } else {
            setEstado('fallo');
        }
    };

    return (
        <form onSubmit={enviar} className="flex items-center gap-1.5" aria-label={`Responder a ${nombre}`}>
            <input ref={ref} value={texto} onChange={(e) => { setTexto(e.target.value); if (estado !== 'enviando') setEstado('quieto'); }}
                placeholder={`Responder a ${recortar(nombre, 24)}…`} aria-label={`Mensaje para ${nombre}`} maxLength={4000}
                className={cn('min-w-0 flex-1 rounded-full ss-redondo bg-white/[0.06] px-3.5 text-[12.5px] text-white outline-none placeholder:text-white/40 focus:bg-white/[0.09]', t.tactil ? 'h-11' : 'h-9')}
                style={{ boxShadow: `inset 0 0 0 1px ${conAlfa(t.acento, 0.28)}` }} />
            <button type="submit" disabled={!texto.trim() || estado === 'enviando'} aria-label="Enviar"
                className={cn('grid shrink-0 cursor-pointer place-items-center rounded-full ss-redondo text-white transition-transform duration-200 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40', t.tactil ? 'size-11' : 'size-9')}
                style={{ background: t.acento, boxShadow: `0 6px 16px -6px ${conAlfa(t.acento, 0.8)}` }}>
                <Send className="size-4" aria-hidden />
            </button>
            <span role="status" aria-live="polite" className="sr-only">
                {estado === 'enviado' ? 'Mensaje enviado' : estado === 'fallo' ? 'No se pudo enviar el mensaje' : ''}
            </span>
            {estado === 'fallo' && <span className="shrink-0 text-[11px] font-semibold text-rose-300">No se envió</span>}
        </form>
    );
}

export default MessagesWidget;
