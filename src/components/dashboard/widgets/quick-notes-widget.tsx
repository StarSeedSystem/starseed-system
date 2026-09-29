'use client';

// ════════════════════════════════════════════════════════════════
// QuickNotesWidget — notas rápidas de verdad (Ola 0929 · paquete E)
// ----------------------------------------------------------------
// El mismo almacén de siempre (lib/notes/quick-notes.ts: localStorage que viaja con la
// cuenta por settings-sync), ahora con un bloc que da gusto usar:
//   · escribir y guardar con Intro (Mayús+Intro, nueva línea);
//   · markdown ligero seguro: **negrita**, _cursiva_, `código`, listas, casillas
//     «- [ ]» que se marcan con un toque, #etiquetas y enlaces;
//   · fijar arriba, editar en el sitio, borrar con «Deshacer»;
//   · buscar y filtrar por etiqueta en «l»/«xl».
// Cada nota es un papel con su color y su esquina doblada, no una caja más.
// Composición: micro = la nota fijada (o la última) · s = esa nota + «nueva» · m = bloc +
// tres notas · l = + buscador y etiquetas, dos columnas · xl = tres columnas ·
// panorámico = notas en fila · torre = columna.
// Estados: cargando (hasta leer el almacén local al montar) y vacío (sin notas: invita a
// escribir la primera). No hay red: nada que pueda fallar por conexión.
// ════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from 'react';
import { StickyNote, Plus, Pin, PinOff, Trash2, Search, X, Undo2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { conAlfa } from '@/components/widgets-libres/acentos-categoria';
import { timeAgo } from '../kit';
import { useQuickNotes, type QuickNote } from '@/lib/notes/quick-notes';
import { useLienzoE, px, type LienzoE } from './paquete-e/lienzo';
import { BotonE, CargandoE, EncabezadoE, PestanasE, RaizE, VacioE, estilosE } from './paquete-e/piezas';
import { PintaSegmentos, alternarCasilla, casillasDe, coincideNota, etiquetasDe, lineasDe } from './paquete-e/notas';

function colorNota(n: QuickNote, lienzo: LienzoE) { return n.color && /^#[0-9a-f]{6}$/i.test(n.color) ? n.color : lienzo.acento; }

/** El cuerpo de una nota con su markdown ligero; las casillas se marcan sin abrir la edición. */
function CuerpoNota({ nota, color, lineas: max, alCasilla, alEtiqueta, lienzo }: { nota: QuickNote; color: string; lineas?: number; alCasilla: (i: number) => void; alEtiqueta?: (e: string) => void; lienzo: LienzoE }) {
    const ls = lineasDe(nota.text);
    const vis = max ? ls.slice(0, max) : ls;
    return (
        <div className="flex min-w-0 flex-col gap-0.5 text-white/85" style={{ fontSize: px(lienzo, 13), lineHeight: 1.4 }}>
            {vis.map((l, i) => {
                if (l.tipo === 'casilla') {
                    return (
                        <label key={i} className="flex cursor-pointer items-start gap-2" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={l.hecha} onChange={() => alCasilla(l.indice)} className="mt-[3px] size-4 shrink-0 cursor-pointer rounded" style={{ accentColor: color }} aria-label={`Marcar: ${l.segs.map((s) => s.v).join('')}`} />
                            <span className={cn('min-w-0 break-words', l.hecha && 'text-white/45 line-through')}><PintaSegmentos segs={l.segs} color={color} alEtiqueta={alEtiqueta} /></span>
                        </label>
                    );
                }
                if (l.tipo === 'lista') return <p key={i} className="flex min-w-0 gap-2 break-words"><span aria-hidden style={{ color }}>•</span><span className="min-w-0"><PintaSegmentos segs={l.segs} color={color} alEtiqueta={alEtiqueta} /></span></p>;
                return <p key={i} className="min-h-[1em] min-w-0 break-words"><PintaSegmentos segs={l.segs} color={color} alEtiqueta={alEtiqueta} /></p>;
            })}
            {max && ls.length > max && <span className="text-[11px] text-white/45">+{ls.length - max} líneas</span>}
        </div>
    );
}

export function QuickNotesWidget() {
    const { ref, lienzo } = useLienzoE({ acento: '#f59e0b' });
    const { notes, add, update, togglePin, remove } = useQuickNotes();
    const [borrador, setBorrador] = useState('');
    const [editando, setEditando] = useState<string | null>(null);
    const [textoEdicion, setTextoEdicion] = useState('');
    const [consulta, setConsulta] = useState('');
    const [etiqueta, setEtiqueta] = useState('todas');
    const [borrada, setBorrada] = useState<QuickNote | null>(null);
    const [componiendo, setComponiendo] = useState(false);
    const campo = useRef<HTMLTextAreaElement>(null);
    const [listo, setListo] = useState(false);
    useEffect(() => { setListo(true); }, []);

    const etiquetas = useMemo(() => {
        const n = new Map<string, number>();
        for (const x of notes) for (const e of etiquetasDe(x.text)) n.set(e, (n.get(e) ?? 0) + 1);
        return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([e]) => e);
    }, [notes]);
    const filtradas = notes.filter((n) => coincideNota(n.text, consulta) && (etiqueta === 'todas' || etiquetasDe(n.text).includes(etiqueta)));

    const guardar = () => { const t = borrador.trim(); if (!t) return; add(t); setBorrador(''); setComponiendo(false); };
    const empezarEdicion = (n: QuickNote) => { setEditando(n.id); setTextoEdicion(n.text); };
    const terminarEdicion = () => { if (editando) { const t = textoEdicion.trim(); if (t) update(editando, t); } setEditando(null); };
    const borrar = (n: QuickNote) => { setBorrada(n); remove(n.id); };
    const deshacer = () => { if (borrada) add(borrada.text); setBorrada(null); };
    const casilla = (n: QuickNote, i: number) => update(n.id, alternarCasilla(n.text, i));

    const { base, clase, horizontal } = lienzo;
    const raiz = { lienzo, refRaiz: ref, etiqueta: `Notas rápidas: ${notes.length} ${notes.length === 1 ? 'nota' : 'notas'}`, tipo: 'QUICK_NOTES' } as const;

    const compositor = (autoFocus = false) => (
        <form className="flex min-w-0 items-end gap-1.5" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
            <textarea ref={campo} value={borrador} autoFocus={autoFocus} onChange={(e) => setBorrador(e.target.value)} rows={borrador.includes('\n') ? 3 : 1}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); guardar(); } if (e.key === 'Escape') { setBorrador(''); setComponiendo(false); } }}
                placeholder="Escribe una nota… (- [ ] para casillas, #etiquetas)" aria-label="Nota nueva" maxLength={2000}
                className="min-w-0 flex-1 resize-none rounded-2xl bg-white/[0.06] px-3 py-2 text-white placeholder:text-white/40 outline-none focus:bg-white/[0.1]"
                style={{ fontSize: px(lienzo, 13), boxShadow: `inset 0 0 0 1px ${conAlfa(lienzo.acento, 0.3)}`, minHeight: lienzo.tactil ? 44 : 36 }} />
            <BotonE lienzo={lienzo} variante="primario" type="submit" icono={Plus} etiqueta="Guardar nota" disabled={!borrador.trim()} />
        </form>
    );

    const papel = (n: QuickNote, lineas?: number) => {
        const color = colorNota(n, lienzo);
        const cs = casillasDe(n.text);
        const enEdicion = editando === n.id;
        return (
            <li key={n.id} className={cn(estilosE.entra, 'group relative min-w-0 break-inside-avoid')}>
                <article className="relative overflow-hidden rounded-[18px] px-3 pb-2 pt-2.5 transition-transform duration-200 hover:-translate-y-0.5"
                    style={{ background: `linear-gradient(160deg, ${conAlfa(color, 0.2)}, ${conAlfa(color, 0.07)})`, boxShadow: `inset 0 0 0 1px ${conAlfa(color, 0.35)}, 0 10px 22px -16px ${conAlfa(color, 0.9)}` }}>
                    {/* esquina doblada */}
                    <span aria-hidden className="pointer-events-none absolute right-0 top-0 size-4" style={{ background: `linear-gradient(225deg, rgba(12,14,34,.9) 50%, ${conAlfa(color, 0.55)} 50%)` }} />
                    {enEdicion ? (
                        <textarea autoFocus value={textoEdicion} onChange={(e) => setTextoEdicion(e.target.value)} onBlur={terminarEdicion} rows={Math.min(8, textoEdicion.split('\n').length + 1)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); terminarEdicion(); } if (e.key === 'Escape') setEditando(null); }}
                            aria-label="Editar nota" className="w-full resize-none bg-transparent text-white outline-none" style={{ fontSize: px(lienzo, 13) }} />
                    ) : (
                        <div role="button" tabIndex={0} onClick={() => empezarEdicion(n)} onKeyDown={(e) => { if (e.key === 'Enter') empezarEdicion(n); }} aria-label="Editar nota" className="cursor-text pr-4 outline-none">
                            <CuerpoNota nota={n} color={color} lineas={lineas} alCasilla={(i) => casilla(n, i)} alEtiqueta={base === 'l' || base === 'xl' ? setEtiqueta : undefined} lienzo={lienzo} />
                        </div>
                    )}
                    <footer className="mt-1.5 flex items-center gap-1 text-[11px] text-white/45">
                        {n.pinned && <Pin aria-label="Fijada" className="size-3 rotate-45" style={{ color }} fill="currentColor" />}
                        <span className="tabular-nums">{timeAgo(n.updatedAt)}</span>
                        {cs.total > 0 && <span className="tabular-nums">· {cs.hechas}/{cs.total}</span>}
                        <span className="flex-1" />
                        <span className={cn('flex items-center gap-0.5', !lienzo.tactil && !lienzo.tv && 'opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100')}>
                            {enEdicion
                                ? <BotonE lienzo={{ ...lienzo, acento: color }} variante="fantasma" compacto icono={Check} etiqueta="Guardar cambios" onMouseDown={(e) => e.preventDefault()} onClick={terminarEdicion} />
                                : <BotonE lienzo={{ ...lienzo, acento: color }} variante="fantasma" compacto icono={n.pinned ? PinOff : Pin} etiqueta={n.pinned ? 'Desfijar nota' : 'Fijar nota'} onClick={() => togglePin(n.id)} />}
                            <BotonE lienzo={{ ...lienzo, acento: '#f43f5e' }} variante="fantasma" compacto icono={Trash2} etiqueta="Borrar nota" onClick={() => borrar(n)} />
                        </span>
                    </footer>
                </article>
            </li>
        );
    };

    const barraBorrada = borrada ? (
        <div role="status" className="flex items-center gap-2 rounded-full px-3 py-1" style={{ background: 'rgba(255,255,255,.06)' }}>
            <span className="min-w-0 flex-1 truncate text-[12px] text-white/75">Nota borrada</span>
            <BotonE lienzo={lienzo} variante="fantasma" compacto icono={Undo2} onClick={deshacer}>Deshacer</BotonE>
        </div>
    ) : null;

    if (!listo) return <RaizE {...raiz}><CargandoE etiqueta="Cargando tus notas…" filas={base === 'micro' || base === 's' ? 2 : 3} /></RaizE>;

    if (base === 'micro') {
        const n = notes[0];
        return (
            <RaizE {...raiz}>
                <div className="flex h-full flex-col justify-center gap-1 p-1.5" title={n?.text}>
                    {n ? <p className="line-clamp-4 text-[12px] leading-snug text-white/85">{n.text.replace(/\s*[-*]\s+\[( |x)\]\s*/gi, '· ')}</p>
                        : <><StickyNote aria-hidden className="mx-auto size-5" style={{ color: lienzo.acento }} /><p className="text-center text-[11px] text-white/55">Sin notas</p></>}
                </div>
            </RaizE>
        );
    }

    if (base === 's') {
        const n = notes[0];
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 flex-col gap-1.5 p-1">
                    {componiendo || !n ? (
                        notes.length === 0 && !componiendo
                            ? <VacioE lienzo={lienzo} icono={StickyNote} titulo="Sin notas todavía" compacto><BotonE lienzo={lienzo} variante="primario" compacto icono={Plus} onClick={() => setComponiendo(true)}>Nueva</BotonE></VacioE>
                            : compositor(true)
                    ) : (
                        <>
                            <ul className="min-h-0 flex-1 overflow-hidden">{papel(n, 3)}</ul>
                            <BotonE lienzo={lienzo} variante="suave" compacto icono={Plus} onClick={() => setComponiendo(true)} className="self-start">Nueva</BotonE>
                        </>
                    )}
                </div>
            </RaizE>
        );
    }

    const vacio = notes.length === 0 ? (
        <VacioE lienzo={lienzo} icono={StickyNote} titulo="Sin notas todavía" texto="Escribe la primera arriba. Prueba «- [ ] comprar pan» o #idea." />
    ) : null;

    if (horizontal) {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 items-stretch gap-3 p-1">
                    <div className="flex w-[34%] min-w-[200px] shrink-0 flex-col justify-center gap-1.5">{compositor()}{barraBorrada}</div>
                    {vacio ?? <ul className={cn('flex min-w-0 flex-1 items-start gap-2 overflow-x-auto', estilosE.desliza)}>{notes.slice(0, 12).map((n) => <div key={n.id} className="w-56 shrink-0">{papel(n, 4)}</div>)}</ul>}
                </div>
            </RaizE>
        );
    }

    if (base === 'm' && clase !== 'torre') {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 flex-col gap-2 p-1">
                    <EncabezadoE lienzo={lienzo} icono={StickyNote} titulo="Notas" detalle={notes.length ? `${notes.length}` : undefined} />
                    {compositor()}
                    {barraBorrada}
                    {vacio ?? <ul className={cn('flex min-h-0 flex-1 flex-col gap-2', estilosE.desliza)}>{notes.slice(0, 3).map((n) => papel(n, 4))}</ul>}
                </div>
            </RaizE>
        );
    }

    const columnas = base === 'xl' ? 3 : clase === 'torre' ? 1 : 2;
    return (
        <RaizE {...raiz}>
            <div className="flex h-full min-h-0 flex-col gap-2 p-1">
                <EncabezadoE lienzo={lienzo} icono={StickyNote} titulo="Notas" detalle={`${notes.length} · ${notes.filter((n) => n.pinned).length} fijadas`} />
                {compositor()}
                {notes.length > 2 && (
                    <label className="relative flex items-center">
                        <Search aria-hidden className="pointer-events-none absolute left-3 size-4 text-white/40" />
                        <input type="search" value={consulta} onChange={(e) => setConsulta(e.target.value)} placeholder="Buscar en tus notas…" aria-label="Buscar en tus notas"
                            className="w-full rounded-full bg-white/[0.05] pl-9 pr-9 text-[13px] text-white placeholder:text-white/40 outline-none focus:bg-white/[0.09]" style={{ height: lienzo.tactil ? 44 : 32 }} />
                        {consulta && <button type="button" onClick={() => setConsulta('')} aria-label="Borrar búsqueda" className="ss-redondo absolute right-2 grid size-6 cursor-pointer place-items-center rounded-full hover:bg-white/10"><X className="size-3.5" /></button>}
                    </label>
                )}
                {etiquetas.length > 0 && <PestanasE lienzo={lienzo} etiqueta="Filtrar por etiqueta" valor={etiqueta} onCambio={setEtiqueta} opciones={[{ id: 'todas', etiqueta: 'Todas' }, ...etiquetas.map((e) => ({ id: e, etiqueta: `#${e}` }))]} />}
                {barraBorrada}
                {vacio ?? (filtradas.length === 0
                    ? <p role="status" className="py-4 text-center text-[12px] text-white/55">Ninguna nota coincide.</p>
                    : <ul className={cn('min-h-0 flex-1 gap-2 [&>li]:mb-2', estilosE.desliza)} style={{ columnCount: columnas, columnGap: 8 }}>{filtradas.map((n) => papel(n))}</ul>)}
            </div>
        </RaizE>
    );
}

export default QuickNotesWidget;
