'use client';

// ════════════════════════════════════════════════════════════════
// MentalCoherenceWidget — respiración guiada (Ola 0929 · paquete E)
// ----------------------------------------------------------------
// Antes enseñaba un «índice de coherencia» con foco, calma y energía que no salían de ningún
// sensor. Ahora es honesto y útil: una flor que se abre al inhalar y se cierra al exhalar para
// practicar la respiración coherente (5·5), la de calma (4·6) o la de caja (4·4·4·4), con
// sesiones de 1 a 10 minutos y el registro de lo practicado (minutos de hoy, racha y la
// semana) guardado solo en este navegador. Sin sensor, la coherencia no se mide: se practica.
// La sesión empieza solo al tocar, se pausa sola si cambias de pestaña y la flor se mueve
// únicamente mientras respiras (con movimiento reducido, una barra sustituye al gesto).
// Composición: micro = la flor (tocar empieza) · s = flor + hoy · m = + pausa, terminar y
// patrón · l = + duración, semana y nota · xl = flor a un lado y práctica al otro ·
// panorámico = fila · torre = columna.
// Estados: cargando (leyendo tu registro local), vacío (aún sin práctica: invitación a un
// minuto), error (el navegador no deja guardar: se practica igual y se dice).
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Wind, Play, Pause, Square, Flame, AudioWaveform, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { conAlfa } from '@/components/widgets-libres/acentos-categoria';
import { useLienzoE, usePestanaVisibleE, useMovimientoReducidoE, px, type LienzoE } from './paquete-e/lienzo';
import { BotonE, EncabezadoE, RaizE } from './paquete-e/piezas';
import {
    COLOR_FASE, DURACIONES_MIN, EVENTO_REGISTRO, NOMBRE_FASE, PATRONES, diaLocal, duracionLegible, faseEn,
    guardarRegistro, leerRegistro, patronDe, racha, registroVacio, reloj, semana, sumarSegundos,
    type IdPatron, type Patron, type RegistroRespiracion,
} from './paquete-e/respiracion';

const CLAVE_AJUSTES = 'starseed.coherencia.ajustes.v1';
type Estado = 'listo' | 'corriendo' | 'pausa' | 'hecho';

function leerAjustes(): { patron: IdPatron; minutos: number } {
    try {
        const a = JSON.parse(window.localStorage.getItem(CLAVE_AJUSTES) ?? '{}') as { patron?: string; minutos?: number };
        return { patron: patronDe(a.patron).id, minutos: (DURACIONES_MIN as readonly number[]).includes(a.minutos ?? 0) ? (a.minutos as number) : 3 };
    } catch { return { patron: 'coherente', minutos: 3 }; }
}

/** Registro compartido entre instancias del widget (se avisan por evento al guardar). */
function useRegistro() {
    const [r, setR] = useState<{ registro: RegistroRespiracion; ok: boolean } | null>(null);
    useEffect(() => {
        const leer = () => setR(leerRegistro());
        leer();
        window.addEventListener(EVENTO_REGISTRO, leer);
        return () => window.removeEventListener(EVENTO_REGISTRO, leer);
    }, []);
    const sumar = useCallback((segundos: number) => {
        const actual = leerRegistro();
        const nuevo = sumarSegundos(actual.registro, diaLocal(new Date()), segundos);
        const ok = actual.ok && guardarRegistro(nuevo);
        setR({ registro: nuevo, ok });
    }, []);
    return { registro: r?.registro ?? registroVacio(), ok: r?.ok ?? true, listo: r !== null, sumar };
}

/** La sesión: reloj propio a 4 Hz solo mientras corre; se pausa si la pestaña se oculta. */
function useSesion(patron: Patron, totalS: number, sumar: (s: number) => void) {
    const [estado, setEstado] = useState<Estado>('listo');
    const [t, setT] = useState(0);
    const pendiente = useRef(0);
    const pestana = usePestanaVisibleE();

    const volcar = useCallback(() => {
        const s = pendiente.current / 1000;
        pendiente.current = 0;
        if (s >= 1) sumar(s);
    }, [sumar]);

    useEffect(() => {
        if (estado !== 'corriendo') return;
        let ultimo = Date.now();
        const id = window.setInterval(() => {
            const ahora = Date.now();
            const d = Math.min(1000, ahora - ultimo);
            ultimo = ahora;
            pendiente.current += d;
            if (pendiente.current >= 10_000) volcar();
            setT((x) => Math.min(totalS, x + d / 1000));
        }, 250);
        return () => window.clearInterval(id);
    }, [estado, totalS, volcar]);

    useEffect(() => {
        if (estado === 'corriendo' && t >= totalS) { volcar(); setEstado('hecho'); }
    }, [estado, t, totalS, volcar]);

    useEffect(() => {
        if (!pestana && estado === 'corriendo') { volcar(); setEstado('pausa'); }
    }, [pestana, estado, volcar]);

    useEffect(() => () => volcar(), [volcar]);

    const alternar = useCallback(() => {
        if (estado === 'corriendo') { volcar(); setEstado('pausa'); return; }
        if (estado === 'hecho') setT(0);
        setEstado('corriendo');
    }, [estado, volcar]);
    const terminar = useCallback(() => { volcar(); setEstado('listo'); setT(0); }, [volcar]);

    const enFase = faseEn(patron, t);
    return { estado, t, enFase, alternar, terminar, activa: estado === 'corriendo' || estado === 'pausa' };
}

/** La flor de seis pétalos que respira; el aro de fuera es lo que llevas de sesión. */
function Flor({ lado, escala, color, avance, lienzo, reposo, suave }: { lado: number; escala: number; color: string; avance: number; lienzo: LienzoE; reposo: boolean; suave: boolean }) {
    const gid = useId().replace(/:/g, '');
    const petalos = Array.from({ length: 6 }, (_, i) => (i * Math.PI) / 3);
    const c = 2 * Math.PI * 94;
    return (
        <svg width={lado} height={lado} viewBox="-100 -100 200 200" aria-hidden className="overflow-visible">
            <defs>
                <radialGradient id={`fl-${gid}`}>
                    <stop offset="0%" stopColor="#ffffff" stopOpacity={0.85} />
                    <stop offset="45%" stopColor={color} stopOpacity={0.55} />
                    <stop offset="100%" stopColor={lienzo.acento} stopOpacity={0.1} />
                </radialGradient>
            </defs>
            <circle r={94} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={3} />
            {avance > 0 && <circle r={94} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeDasharray={`${c * Math.min(1, avance)} ${c}`} transform="rotate(-90)" style={{ transition: 'stroke-dasharray 250ms linear, stroke 600ms ease' }} />}
            <g style={{ transform: `scale(${escala})`, transition: suave ? 'transform 250ms linear' : undefined, transformBox: 'view-box', transformOrigin: 'center' } as React.CSSProperties}>
                <g className={reposo && lienzo.animar ? 'ss-respirar' : undefined} style={{ ['--ss-dur' as string]: '10s', transformBox: 'fill-box', transformOrigin: 'center' } as React.CSSProperties}>
                    {petalos.map((a, i) => (
                        <circle key={i} cx={Math.cos(a) * 36} cy={Math.sin(a) * 36} r={38} fill={conAlfa(color, 0.14)} stroke={conAlfa(i % 2 ? lienzo.acento : color, 0.55)} strokeWidth={1.4} style={{ transition: 'fill 600ms ease, stroke 600ms ease' }} />
                    ))}
                    <circle r={30} fill={`url(#fl-${gid})`} style={lienzo.nivel === 'ligero' ? undefined : { filter: `drop-shadow(0 0 12px ${conAlfa(color, 0.7)})` }} />
                </g>
            </g>
        </svg>
    );
}

export function MentalCoherenceWidget() {
    const { ref, lienzo } = useLienzoE({ acento: '#8b5cf6', acento2: '#34d399' });
    const reducido = useMovimientoReducidoE();
    const [ajustes, setAjustes] = useState<{ patron: IdPatron; minutos: number }>({ patron: 'coherente', minutos: 3 });
    useEffect(() => { setAjustes(leerAjustes()); }, []);
    const patron = patronDe(ajustes.patron);
    const totalS = ajustes.minutos * 60;
    const reg = useRegistro();
    const s = useSesion(patron, totalS, reg.sumar);
    const { base, clase, horizontal } = lienzo;

    const cambiarAjustes = (a: Partial<{ patron: IdPatron; minutos: number }>) => {
        setAjustes((prev) => {
            const nuevo = { ...prev, ...a };
            try { window.localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(nuevo)); } catch { /* sin guardar: vale para esta visita */ }
            return nuevo;
        });
    };

    const hoy = useMemo(() => new Date(), [reg.registro]); // eslint-disable-line react-hooks/exhaustive-deps
    const segHoy = reg.registro.dias[diaLocal(hoy)] ?? 0;
    const dias = racha(reg.registro, hoy);
    const sem = useMemo(() => semana(reg.registro, hoy), [reg.registro, hoy]);
    const vacio = reg.listo && Object.keys(reg.registro.dias).length === 0;

    const color = s.activa ? COLOR_FASE[s.enFase.fase.tipo] : lienzo.acento;
    const faseTexto = s.estado === 'hecho' ? 'Hecho' : s.activa ? NOMBRE_FASE[s.enFase.fase.tipo] : 'Respira';
    const escala = s.activa ? (reducido ? 0.8 : s.enFase.escala) : 0.72;
    const resumenHoy = !reg.listo ? 'Leyendo tu registro…' : segHoy > 0 ? `Hoy ${duracionLegible(segHoy)}${dias > 1 ? ` · racha de ${dias} días` : ''}` : vacio ? 'Aún sin práctica: prueba un minuto' : 'Hoy aún no';
    const estadoTexto = s.estado === 'corriendo' ? `${faseTexto} ${s.enFase.restante} s · quedan ${reloj(totalS - s.t)}`
        : s.estado === 'pausa' ? `En pausa · quedan ${reloj(totalS - s.t)}`
            : s.estado === 'hecho' ? `Sesión completa: ${ajustes.minutos} min` : `${patron.nombre} ${patron.ritmo} · ${ajustes.minutos} min`;
    const etiquetaBoton = s.estado === 'corriendo' ? 'Pausar la respiración' : s.estado === 'pausa' ? 'Seguir respirando' : s.estado === 'hecho' ? 'Otra sesión' : 'Empezar a respirar';
    const raiz = { lienzo, refRaiz: ref, etiqueta: `Coherencia: ${estadoTexto}. ${resumenHoy}`, tipo: 'MENTAL_COHERENCE' } as const;

    const flor = (lado: number, conTexto = true) => (
        <button type="button" onClick={s.alternar} aria-label={etiquetaBoton} title={etiquetaBoton}
            className="ss-redondo relative grid shrink-0 cursor-pointer place-items-center rounded-full outline-none transition-transform duration-200 hover:scale-[1.02] focus-visible:ring-2"
            style={{ width: lado, height: lado, ['--tw-ring-color' as string]: lienzo.acento } as React.CSSProperties}>
            <Flor lado={lado} escala={escala} color={color} avance={s.activa || s.estado === 'hecho' ? s.t / totalS : 0} lienzo={lienzo} reposo={!s.activa} suave={!reducido} />
            {conTexto && (
                <span className="pointer-events-none absolute inset-0 grid place-items-center text-center leading-none">
                    <span>
                        <span className="block font-semibold text-white" style={{ fontSize: Math.max(11, Math.round(lado * 0.1)), textShadow: '0 1px 8px rgba(0,0,0,.6)' }}>{faseTexto}</span>
                        {s.estado === 'corriendo' && lado >= 96 && <span className="mt-1 block tabular-nums text-white/75" style={{ fontSize: Math.max(10, Math.round(lado * 0.07)) }}>{s.enFase.restante}</span>}
                        {!s.activa && s.estado !== 'hecho' && lado >= 96 && <Play aria-hidden className="mx-auto mt-1 size-3.5 text-white/70" />}
                    </span>
                </span>
            )}
        </button>
    );
    // Con movimiento reducido la flor no crece: una barra dice cuánto queda de la fase.
    const barraReducida = reducido && s.estado === 'corriendo' && (
        <div className="h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-white/10" aria-hidden>
            <div className="h-full rounded-full" style={{ width: `${Math.round(s.enFase.progreso * 100)}%`, background: color }} />
        </div>
    );
    const anuncio = <p className="sr-only" aria-live="polite">{s.estado === 'corriendo' ? faseTexto : s.estado === 'hecho' ? 'Sesión completa' : ''}</p>;
    const controles = (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
            <BotonE lienzo={lienzo} variante="primario" compacto={!lienzo.tactil} icono={s.estado === 'corriendo' ? Pause : Play} onClick={s.alternar}>
                {s.estado === 'corriendo' ? 'Pausar' : s.estado === 'pausa' ? 'Seguir' : s.estado === 'hecho' ? 'Otra vez' : 'Empezar'}
            </BotonE>
            {s.activa && <BotonE lienzo={lienzo} variante="fantasma" compacto={!lienzo.tactil} icono={Square} onClick={s.terminar}>Terminar</BotonE>}
        </div>
    );
    const grupo = (etiqueta: string, opciones: { id: string; texto: string; titulo?: string }[], valor: string, elegir: (id: string) => void, vertical = false) => (
        <div role="radiogroup" aria-label={etiqueta} className={cn('flex gap-1', vertical ? 'flex-col' : 'flex-wrap justify-center')}>
            {opciones.map((o) => {
                const on = o.id === valor;
                return (
                    <button key={o.id} type="button" role="radio" aria-checked={on} disabled={s.activa} onClick={() => elegir(o.id)} title={s.activa ? 'Termina la sesión para cambiarlo' : o.titulo}
                        className={cn('ss-redondo cursor-pointer rounded-full font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50', vertical ? 'flex min-h-11 items-center gap-2 rounded-2xl px-3 py-1.5 text-left' : lienzo.tactil ? 'min-h-11 px-4 text-[13px]' : 'min-h-7 px-2.5 text-[11px]')}
                        style={on ? { background: conAlfa(lienzo.acento, 0.22), boxShadow: `inset 0 0 0 1px ${conAlfa(lienzo.acento, 0.6)}`, color: '#fff' } : { background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.7)' }}>
                        {o.texto}
                    </button>
                );
            })}
        </div>
    );
    const patrones = (vertical = false) => grupo('Patrón de respiración', PATRONES.map((p) => ({
        id: p.id,
        texto: vertical ? `${p.nombre} ${p.ritmo}` : p.nombre,
        titulo: p.detalle,
    })), patron.id, (id) => cambiarAjustes({ patron: id as IdPatron }), vertical);
    const duraciones = grupo('Duración de la sesión', DURACIONES_MIN.map((m) => ({ id: String(m), texto: `${m} min` })), String(ajustes.minutos), (id) => cambiarAjustes({ minutos: Number(id) }));
    const maxSem = Math.max(1, ...sem.map((d) => d.minutos));
    const semanaEl = (
        <div className="w-full">
            <div className="flex items-end justify-between gap-1" style={{ height: 44 }} role="img" aria-label={`Última semana: ${sem.map((d) => `${d.nombre} ${d.minutos} min`).join(', ')}`}>
                {sem.map((d) => (
                    <div key={d.dia} className="flex flex-1 flex-col items-center gap-0.5" aria-hidden>
                        <div className="w-full max-w-5 rounded-t-md transition-[height] duration-300" style={{ height: d.minutos ? Math.max(4, (d.minutos / maxSem) * 30) : 2, background: d.minutos ? `linear-gradient(to top, ${conAlfa(lienzo.acento, 0.5)}, ${lienzo.acento2})` : 'rgba(255,255,255,.12)' }} />
                        <span className={cn('text-[10px]', d.hoy ? 'font-bold text-white' : 'text-white/45')}>{d.inicial}</span>
                    </div>
                ))}
            </div>
        </div>
    );
    const semanaOVacio = vacio
        ? <p className="text-center text-[11px] text-white/55">Aún sin práctica: prueba un minuto y aquí verás tu semana.</p>
        : semanaEl;
    const cifras = (
        <div className="flex items-center justify-center gap-3 text-white/80" style={{ fontSize: px(lienzo, 12) }}>
            <span className="inline-flex items-center gap-1"><Wind aria-hidden className="size-3.5" style={{ color: lienzo.acento2 }} /> Hoy {reg.listo ? duracionLegible(segHoy) : '—'}</span>
            <span className="inline-flex items-center gap-1" title="Días seguidos con al menos un minuto"><Flame aria-hidden className="size-3.5 text-amber-300" /> Racha {reg.listo ? `${dias} ${dias === 1 ? 'día' : 'días'}` : '—'}</span>
        </div>
    );
    const nota = (
        <p className={cn('text-[11px] leading-snug', reg.ok ? 'text-white/50' : 'text-amber-200')} role={reg.ok ? undefined : 'alert'}>
            {reg.ok
                ? 'Sin sensor conectado: aquí la coherencia no se mide, se practica. Respirar despacio, unas 6 veces por minuto, es la práctica más usada para la coherencia cardíaca. Tu registro se queda en este navegador.'
                : 'Este navegador no deja guardar el registro (modo privado o bloqueo): la práctica funciona igual, pero no se recordará.'}
        </p>
    );
    const enlaces = (
        <div className="flex flex-wrap items-center justify-center gap-2 text-[11px]">
            <Link href="/omnifrecuencias" className="inline-flex min-h-7 cursor-pointer items-center gap-1 rounded-full px-2 text-white/60 transition-colors hover:text-white"><AudioWaveform aria-hidden className="size-3.5" /> Acompañar con frecuencias</Link>
            <Link href="/agent" className="inline-flex min-h-7 cursor-pointer items-center gap-1 rounded-full px-2 text-white/60 transition-colors hover:text-white"><Sparkles aria-hidden className="size-3.5" /> Exocórtex</Link>
        </div>
    );
    const estadoEl = <p className="text-center tabular-nums text-white/70" style={{ fontSize: px(lienzo, 12) }}>{estadoTexto}</p>;

    if (base === 'micro') return <RaizE {...raiz}><div className="m-auto">{anuncio}{flor(Math.max(52, Math.min(lienzo.ancho || 80, lienzo.alto || 80) * 0.92))}</div></RaizE>;

    if (base === 's') {
        return (
            <RaizE {...raiz}>
                {anuncio}
                <div className="flex h-full flex-col items-center justify-center gap-1.5">
                    {flor(Math.max(70, Math.min(120, (lienzo.alto || 160) * 0.66)))}
                    {barraReducida}
                    <p className="text-center text-[11px] text-white/60">{s.activa ? `quedan ${reloj(totalS - s.t)}` : resumenHoy}</p>
                </div>
            </RaizE>
        );
    }

    if (horizontal) {
        return (
            <RaizE {...raiz}>
                {anuncio}
                <div className="flex h-full min-h-0 items-center gap-3 px-1">
                    {flor(Math.max(64, Math.min(120, (lienzo.alto || 120) - 10)))}
                    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">{estadoEl}{barraReducida}{controles}{patrones()}</div>
                    <div className="flex w-44 shrink-0 flex-col gap-1.5">{semanaOVacio}{cifras}</div>
                </div>
            </RaizE>
        );
    }

    if (base === 'xl') {
        return (
            <RaizE {...raiz}>
                {anuncio}
                <div className="flex h-full min-h-0 flex-col gap-2 p-1">
                    <EncabezadoE lienzo={lienzo} icono={Wind} titulo="Coherencia" detalle="Respiración guiada" />
                    <div className="grid min-h-0 flex-1 grid-cols-[1.1fr_1fr] gap-4">
                        <div className="flex min-h-0 flex-col items-center justify-center gap-2">
                            {flor(Math.max(160, Math.min(260, (lienzo.alto || 400) * 0.55, (lienzo.ancho || 500) * 0.45)))}
                            {barraReducida}{estadoEl}{controles}
                        </div>
                        <div className={cn('flex min-h-0 flex-col gap-3 overflow-y-auto pr-1')}>
                            <section aria-label="Patrón" className="flex flex-col gap-1">
                                {patrones(true)}
                                <p className="px-1 text-[11px] text-white/55">{patron.detalle}</p>
                            </section>
                            {duraciones}
                            {cifras}
                            {semanaOVacio}
                            {nota}
                            {enlaces}
                        </div>
                    </div>
                </div>
            </RaizE>
        );
    }

    const grande = base === 'l' || clase === 'torre';
    return (
        <RaizE {...raiz}>
            {anuncio}
            <div className="flex h-full min-h-0 flex-col items-center gap-2 overflow-y-auto p-1">
                {grande && <EncabezadoE lienzo={lienzo} icono={Wind} titulo="Coherencia" detalle="Respiración guiada" className="w-full" />}
                {flor(grande ? Math.max(130, Math.min(200, (lienzo.alto || 420) * 0.4)) : Math.max(96, Math.min(150, (lienzo.alto || 280) * 0.45)))}
                {barraReducida}
                {estadoEl}
                {controles}
                {patrones()}
                {grande ? <>{duraciones}{cifras}{semanaOVacio}{nota}{enlaces}</> : <p className="text-center text-[11px] text-white/55">{resumenHoy}</p>}
            </div>
        </RaizE>
    );
}

export default MentalCoherenceWidget;
