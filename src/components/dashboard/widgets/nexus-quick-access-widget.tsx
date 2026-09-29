'use client';

// ════════════════════════════════════════════════════════════════
// NexusQuickAccessWidget — pregúntale a tu Exocórtex (Ola 0929 · paquete E)
// ----------------------------------------------------------------
// Antes enseñaba una «carga cognitiva» y unas sugerencias SIMULADAS que cambiaban
// solas. Ahora es la puerta rápida a Astraura/Aurora, con datos reales:
//   · escribe y se lo manda a la Aurora global (la misma de todo el OS, openAurora);
//   · intenciones de un toque (resumir el día, planificar la semana, ideas…);
//   · la última respuesta y cuántos mensajes llevas hoy, del registro local de Aurora;
//   · accesos a las áreas: chat, imaginación, memorias y biblioteca.
// Honesto: si Aurora aún no está lista en esta pestaña, se dice y se ofrece abrir
// Astraura IA. La conversación es tuya: el registro vive en tu dispositivo y en tu cuenta.
// Composición: micro = la orbe (abre Aurora) · s = orbe + «pregunta» · m = orbe,
// campo y última respuesta · l = + intenciones y cuenta de hoy · xl = + últimos
// intercambios y áreas · panorámico = orbe + campo + intenciones · torre = columna.
// Estados: vacío (sin conversaciones: invita a saludar), error (Aurora no disponible),
// cargando (enviando).
// ════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { Send, Sparkles, MessageSquare, Brain, Library, Lightbulb, CalendarRange, NotebookPen, ArrowUpRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { conAlfa } from '@/components/widgets-libres/acentos-categoria';
import { readAuroraChatEntries, AURORA_CHATLOG_CHANGE_EVENT, AURORA_CHATLOG_KEY, type AuroraChatLogEntry } from '@/lib/aurora/aurora-chat-log';
import { openAurora } from '@/lib/aurora/open-aurora';
import { useLienzoE, px, type LienzoE } from './paquete-e/lienzo';
import { BotonE, EncabezadoE, EnlaceE, RaizE, estilosE, tintaE } from './paquete-e/piezas';

const INTENCIONES: { id: string; etiqueta: string; icono: typeof Sparkles; prompt: string }[] = [
    { id: 'dia', etiqueta: 'Resume mi día', icono: NotebookPen, prompt: 'Resume lo que hemos hablado hoy y dime qué me queda pendiente.' },
    { id: 'semana', etiqueta: 'Planifica mi semana', icono: CalendarRange, prompt: 'Ayúdame a planificar mi semana: pregúntame lo que necesites saber.' },
    { id: 'ideas', etiqueta: 'Dame ideas', icono: Lightbulb, prompt: 'Dame tres ideas para avanzar en lo que estoy creando ahora.' },
    { id: 'explica', etiqueta: 'Explícame algo', icono: Brain, prompt: 'Quiero entender un tema a fondo. Pregúntame cuál y explícamelo paso a paso.' },
];

const AREAS = [
    { etiqueta: 'Chat', href: '/agent', icono: MessageSquare },
    { etiqueta: 'Imaginación', href: '/imaginacion', icono: Sparkles },
    { etiqueta: 'Memorias', href: '/memorias', icono: Brain },
    { etiqueta: 'Biblioteca', href: '/library', icono: Library },
];

function hoyLocal(ts: number) { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }

function useRegistroAurora() {
    const [entradas, setEntradas] = useState<AuroraChatLogEntry[] | null>(null);
    useEffect(() => {
        const leer = () => setEntradas(readAuroraChatEntries());
        leer();
        const almacen = (e: StorageEvent) => { if (e.key === AURORA_CHATLOG_KEY) leer(); };
        window.addEventListener(AURORA_CHATLOG_CHANGE_EVENT, leer);
        window.addEventListener('storage', almacen);
        return () => { window.removeEventListener(AURORA_CHATLOG_CHANGE_EVENT, leer); window.removeEventListener('storage', almacen); };
    }, []);
    return entradas;
}

/** La orbe de Astraura: un núcleo de luz con dos anillos que respiran (quietos en «ligero»). */
function Orbe({ lado, lienzo, onTocar, etiqueta }: { lado: number; lienzo: LienzoE; onTocar: () => void; etiqueta: string }) {
    const r = lado / 2;
    const gid = React.useId().replace(/:/g, '');
    return (
        <button type="button" onClick={onTocar} aria-label={etiqueta} title={etiqueta}
            className="ss-redondo relative grid shrink-0 cursor-pointer place-items-center rounded-full outline-none transition-transform duration-200 hover:scale-105 focus-visible:ring-2" style={{ width: lado, height: lado, ['--tw-ring-color' as string]: lienzo.acento } as React.CSSProperties}>
            <svg width={lado} height={lado} viewBox={`${-r} ${-r} ${lado} ${lado}`} aria-hidden className="absolute inset-0 overflow-visible">
                <defs>
                    <radialGradient id={`ox-${gid}`} cx="38%" cy="32%" r="70%">
                        <stop offset="0%" stopColor="#ffffff" />
                        <stop offset="30%" stopColor={lienzo.acento} />
                        <stop offset="75%" stopColor={lienzo.acento2} stopOpacity={0.8} />
                        <stop offset="100%" stopColor="#0b0c1e" stopOpacity={0} />
                    </radialGradient>
                </defs>
                <circle r={r * 0.95} fill={conAlfa(lienzo.acento, 0.1)} />
                <g className={lienzo.animar ? 'ss-girar' : undefined} style={{ ['--ss-dur' as string]: '26s', transformBox: 'fill-box', transformOrigin: 'center' } as React.CSSProperties}>
                    <ellipse rx={r * 0.86} ry={r * 0.34} fill="none" stroke={lienzo.acento} strokeOpacity={0.55} strokeWidth={1.2} transform="rotate(-25)" />
                    <ellipse rx={r * 0.86} ry={r * 0.34} fill="none" stroke={lienzo.acento2} strokeOpacity={0.45} strokeWidth={1.2} transform="rotate(35)" />
                </g>
                <circle r={r * 0.46} fill={`url(#ox-${gid})`} className={lienzo.animar ? 'ss-respirar' : undefined} style={{ transformBox: 'fill-box', transformOrigin: 'center', ['--ss-dur' as string]: '5s', filter: `drop-shadow(0 0 ${r * 0.25}px ${conAlfa(lienzo.acento, 0.8)})` } as React.CSSProperties} />
            </svg>
        </button>
    );
}

export function NexusQuickAccessWidget() {
    const { ref, lienzo } = useLienzoE();
    const entradas = useRegistroAurora();
    const [texto, setTexto] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [aviso, setAviso] = useState<string | null>(null);

    const enviar = async (prompt: string) => {
        const p = prompt.trim();
        setAviso(null);
        setEnviando(true);
        try {
            const ok = await openAurora(p ? { prompt: p } : {});
            if (!ok && p) setAviso('Aurora aún no está lista en esta pestaña. Ábrela en Astraura IA.');
            else if (p) setTexto('');
        } catch {
            setAviso('No se pudo hablar con Aurora ahora mismo.');
        } finally { setEnviando(false); }
    };

    const lista = entradas ?? [];
    const hoy = lista.filter((e) => hoyLocal(e.ts) === hoyLocal(Date.now())).length;
    const ultimaRespuesta = [...lista].reverse().find((e) => e.role === 'aurora');
    const { base, clase, horizontal } = lienzo;
    const tinta = tintaE(lienzo.acento);
    const raiz = { lienzo, refRaiz: ref, etiqueta: `Exocórtex: ${hoy} mensajes hoy con Aurora`, tipo: 'NEXUS_QUICK_ACCESS' } as const;

    const campo = (
        <form className="flex min-w-0 items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); void enviar(texto); }}>
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Pregunta a Astraura…" aria-label="Pregunta para Astraura" maxLength={2000}
                className="min-w-0 flex-1 rounded-full bg-white/[0.06] px-4 text-white placeholder:text-white/40 outline-none focus:bg-white/[0.1]"
                style={{ height: lienzo.tactil ? 44 : 36, fontSize: px(lienzo, 13), boxShadow: `inset 0 0 0 1px ${conAlfa(lienzo.acento, 0.3)}` }} />
            <BotonE lienzo={lienzo} variante="primario" type="submit" icono={enviando ? Loader2 : Send} etiqueta="Enviar a Astraura" disabled={!texto.trim() || enviando} />
        </form>
    );
    const avisoEl = aviso ? (
        <p role="alert" className="flex flex-wrap items-center gap-2 text-[11px] text-amber-200">{aviso}<EnlaceE lienzo={lienzo} href="/agent" compacto variante="fantasma">Abrir Astraura IA</EnlaceE></p>
    ) : null;
    const ultima = entradas === null ? null : ultimaRespuesta ? (
        <div className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">Última respuesta</span>
            <p className="line-clamp-3 text-white/80" style={{ fontSize: px(lienzo, 13) }} title={ultimaRespuesta.text}>{ultimaRespuesta.text}</p>
        </div>
    ) : (
        <p className="text-[12px] text-white/55">Vacío todavía: saluda a Aurora y la conversación quedará aquí.</p>
    );
    const intenciones = (
        <ul className="flex flex-wrap gap-1.5" aria-label="Intenciones rápidas">
            {INTENCIONES.map((i) => (
                <li key={i.id}>
                    <button type="button" onClick={() => void enviar(i.prompt)} disabled={enviando}
                        className="ss-redondo inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-white/85 transition-colors hover:text-white disabled:opacity-50"
                        style={{ background: conAlfa(lienzo.acento, 0.1), boxShadow: `inset 0 0 0 1px ${conAlfa(lienzo.acento, 0.3)}` }}>
                        <i.icono aria-hidden className="size-3.5" style={{ color: tinta }} />{i.etiqueta}
                    </button>
                </li>
            ))}
        </ul>
    );
    const areas = (
        <nav aria-label="Áreas de Astraura" className="grid grid-cols-2 gap-1.5">
            {AREAS.map((a) => (
                <EnlaceE key={a.href} lienzo={lienzo} href={a.href} variante="fantasma" icono={a.icono} className="justify-start">{a.etiqueta}</EnlaceE>
            ))}
        </nav>
    );

    if (base === 'micro') {
        return <RaizE {...raiz}><div className="m-auto"><Orbe lado={Math.max(48, Math.min(lienzo.ancho || 80, lienzo.alto || 80) * 0.85)} lienzo={lienzo} onTocar={() => void enviar('')} etiqueta="Abrir Aurora" /></div></RaizE>;
    }

    if (base === 's') {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
                    <Orbe lado={Math.max(64, Math.min(96, (lienzo.alto || 150) * 0.56))} lienzo={lienzo} onTocar={() => void enviar('')} etiqueta="Abrir Aurora" />
                    <span className="text-[12px] font-medium text-white/85">Pregunta a Astraura</span>
                    {hoy > 0 && <span className="text-[11px] tabular-nums text-white/50">{hoy} mensajes hoy</span>}
                </div>
            </RaizE>
        );
    }

    if (horizontal) {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 items-center gap-3 px-1">
                    <Orbe lado={Math.max(52, Math.min(90, (lienzo.alto || 110) - 16))} lienzo={lienzo} onTocar={() => void enviar('')} etiqueta="Abrir Aurora" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">{campo}{intenciones}{avisoEl}</div>
                </div>
            </RaizE>
        );
    }

    const cabecera = <EncabezadoE lienzo={lienzo} icono={Sparkles} titulo="Tu Exocórtex" detalle={hoy ? `${hoy} mensajes hoy` : undefined} acciones={<EnlaceE lienzo={lienzo} href="/agent" compacto variante="fantasma" icono={ArrowUpRight}>Astraura</EnlaceE>} />;

    if (base === 'm' && clase !== 'torre') {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 flex-col gap-2 p-1">
                    {cabecera}
                    <div className="flex min-w-0 items-center gap-3">
                        <Orbe lado={Math.max(56, Math.min(80, (lienzo.alto || 240) * 0.3))} lienzo={lienzo} onTocar={() => void enviar('')} etiqueta="Abrir Aurora" />
                        <div className="min-w-0 flex-1">{ultima}</div>
                    </div>
                    <div className="mt-auto">{campo}</div>
                    {avisoEl}
                </div>
            </RaizE>
        );
    }

    const recientes = lista.slice(-6);
    return (
        <RaizE {...raiz}>
            <div className={cn('flex h-full min-h-0 flex-col gap-2.5 p-1', estilosE.desliza)}>
                {cabecera}
                <div className="flex min-w-0 items-center gap-3">
                    <Orbe lado={base === 'xl' ? 104 : 84} lienzo={lienzo} onTocar={() => void enviar('')} etiqueta="Abrir Aurora" />
                    <div className="min-w-0 flex-1">{ultima}</div>
                </div>
                {campo}
                {avisoEl}
                {intenciones}
                {base === 'xl' && recientes.length > 0 && (
                    <section aria-label="Últimos intercambios" className="flex min-h-0 flex-col gap-1">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">Últimos intercambios</span>
                        <ol className="flex flex-col gap-1">
                            {recientes.map((e, i) => (
                                <li key={`${e.ts}-${i}`} className={cn('max-w-[88%] rounded-2xl px-3 py-1.5 text-[12px] leading-snug', e.role === 'user' ? 'self-end bg-white/[0.08] text-white/85' : 'self-start text-white/80')} style={e.role === 'aurora' ? { background: conAlfa(lienzo.acento, 0.1) } : undefined}>
                                    <span className="line-clamp-2">{e.text}</span>
                                </li>
                            ))}
                        </ol>
                    </section>
                )}
                {(base === 'xl' || clase === 'torre') && areas}
            </div>
        </RaizE>
    );
}
