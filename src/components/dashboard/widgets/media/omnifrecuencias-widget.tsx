'use client';

// ════════════════════════════════════════════════════════════════
// OmnifrecuenciasWidget — estudio de frecuencias (Ola 0929 · paquete E, familia de medios)
// ----------------------------------------------------------------
// La versión de bolsillo de la app REAL Omni-Frecuencias: el MISMO motor WebAudio
// compartido (useAudio, singleton: lo que suena aquí suena en la app y en el dock),
// las MISMAS frecuencias y recetas de sinergia, y los presets de tu Biblioteca.
// Qué hace: tocar una frecuencia (otra la sustituye; «+» la suma como capa), ver su
// resonancia, ajustar el volumen maestro, afinar capas en el generador, guardar y
// cargar presets y abrir la app completa.
// Nota honesta, siempre a la vista desde «m»: es exploración sonora, no un
// tratamiento; volumen bajo; los binaurales necesitan auriculares; lo que está por
// debajo de 20 Hz no se oye como tono.
// El audio solo arranca con un toque. La onda real del motor (canvas) solo se dibuja
// en «l»/«xl», sonando, con movimiento permitido y el widget a la vista.
// Composición: micro = resonador con play · s = resonador + nombre · m = resonador +
// lista + volumen · l = + pestañas Reproductor/Generador/Presets · xl = + onda real ·
// panorámico = resonador + frecuencias en fila · torre = columna.
// Estados: cargando (el motor arranca con tu gesto), vacío (sin frecuencia: invita a
// elegir; sin presets: explica dónde se guardan), error (el navegador no dejó sonar).
// ════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PilaAjustable, Prescindible } from '@/components/dashboard/kit/pila-ajustable';
import { Waves, Play, Square, Plus, Save, FolderOpen, Trash2, Maximize2, Headphones, Info, Sliders } from 'lucide-react';
import { cn } from '@/lib/utils';
import { conAlfa } from '@/components/widgets-libres/acentos-categoria';
import { useAudio } from '@/components/dashboard/apps/omnifrecuencias/frecuencias/hooks/useAudio';
import { useFileSystem } from '@/components/dashboard/apps/omnifrecuencias/frecuencias/hooks/useFileSystem';
import { rememberLastSession } from '@/components/dashboard/apps/omnifrecuencias/frecuencias/hooks/useOmniLastSession';
import { FEATURED_FREQUENCIES } from '@/components/dashboard/apps/omnifrecuencias/frecuencias/data/featured-frequencies';
import { frequencyToOscillators, resolveFrequency } from '@/components/dashboard/apps/omnifrecuencias/frecuencias/data/synergy-recipes';
import { CATEGORIES, type CategoryId, type PresetContent, type FrequencyItem } from '@/components/dashboard/apps/omnifrecuencias/frecuencias/types';
import CompactOscillator from '@/components/dashboard/apps/omnifrecuencias/frecuencias/components/CompactOscillator';
import Visualizer from '@/components/dashboard/apps/omnifrecuencias/frecuencias/components/Visualizer';
import { useLienzoE, px, type LienzoE } from '../paquete-e/lienzo';
import { BotonE, EncabezadoE, PestanasE, RaizE, estilosE, tintaE } from '../paquete-e/piezas';
import { VolumenE } from '../paquete-e/medios';

type Pestana = 'play' | 'gen' | 'presets';
const FILTROS: CategoryId[] = ['all', 'solfeggio', 'brain', 'planetary', 'synergy'];

function abrirAppCompleta(): void {
    try { window.dispatchEvent(new CustomEvent('starseed:open-omnifrecuencias')); } catch { /* sin eventos */ }
}

/** Hz legible: «528», «7,83», «14,3». */
function hzTexto(item: FrequencyItem): string {
    const v = Math.round(resolveFrequency(item) * 100) / 100;
    return String(v).replace('.', ',');
}

/** El resonador: la frecuencia en el centro y sus ondas saliendo (más rápidas cuanto más aguda). */
function Resonador({ lado, hz, nombre, suena, lienzo, onAlternar }: { lado: number; hz: number | null; nombre: string; suena: boolean; lienzo: LienzoE; onAlternar: () => void }) {
    const dur = hz ? Math.max(0.9, Math.min(4.2, 7 / Math.log2(hz + 2))) : 3;
    const c = lienzo.acento;
    const r = lado / 2;
    const gid = React.useId().replace(/:/g, '');
    return (
        <button type="button" onClick={onAlternar} aria-label={suena ? `Detener ${nombre}` : hz ? `Reproducir ${nombre}` : 'Reproducir la primera frecuencia'}
            className="ss-redondo relative grid shrink-0 cursor-pointer place-items-center rounded-full outline-none focus-visible:ring-2" style={{ width: lado, height: lado, ['--tw-ring-color' as string]: c } as React.CSSProperties}>
            <svg width={lado} height={lado} viewBox={`0 0 ${lado} ${lado}`} aria-hidden className="absolute inset-0 overflow-visible">
                <defs>
                    <radialGradient id={`rs-${gid}`} cx="50%" cy="45%" r="60%">
                        <stop offset="0%" stopColor={c} stopOpacity={suena ? 0.55 : 0.25} />
                        <stop offset="70%" stopColor={lienzo.acento2} stopOpacity={0.08} />
                        <stop offset="100%" stopColor={c} stopOpacity={0} />
                    </radialGradient>
                </defs>
                <circle cx={r} cy={r} r={r * 0.98} fill={`url(#rs-${gid})`} />
                {[0.42, 0.62, 0.82].map((k, i) => (
                    <circle key={k} cx={r} cy={r} r={r * k} fill="none" stroke={c} strokeOpacity={0.18 + i * 0.06} strokeWidth={1} strokeDasharray={i === 1 ? '2 5' : undefined} />
                ))}
                {suena && lienzo.animar && [0, 1, 2].map((i) => (
                    <circle key={i} cx={r} cy={r} r={r * 0.55} fill="none" stroke={c} strokeWidth={1.5} className={estilosE.onda}
                        style={{ ['--e-dur' as string]: `${dur * 1.6}s`, ['--e-retardo' as string]: `${(i * dur * 1.6) / 3}s` } as React.CSSProperties} />
                ))}
            </svg>
            <span className="relative flex flex-col items-center leading-none">
                {hz !== null ? (
                    <>
                        <span className="tabular-nums text-white" style={{ fontSize: Math.max(13, lado * 0.2), fontWeight: 250 }}>{String(Math.round(hz * 100) / 100).replace('.', ',')}</span>
                        <span className="mt-0.5 text-white/60" style={{ fontSize: Math.max(9, lado * 0.075) }}>Hz</span>
                    </>
                ) : (
                    <Play aria-hidden className="text-white" style={{ width: lado * 0.26, height: lado * 0.26 }} fill="currentColor" />
                )}
            </span>
        </button>
    );
}

export function OmnifrecuenciasWidget() {
    const { ref, lienzo } = useLienzoE({ acento: '#22d3ee' });
    const audio = useAudio();
    const { isPlaying, oscillators, masterVolume, toggleMasterPlay, updateMasterVolume, addOscillator, removeOscillator, updateOscillator, getMasterAnalyser, getOscillatorAnalyser } = audio;
    const fs = useFileSystem();
    const [pestana, setPestana] = useState<Pestana>('play');
    const [filtro, setFiltro] = useState<CategoryId>('all');
    const [ultimaId, setUltimaId] = useState<string | null>(null);
    const [nombrePreset, setNombrePreset] = useState('');
    const [verNota, setVerNota] = useState(false);
    const [fallo, setFallo] = useState<string | null>(null);

    const capas = oscillators.filter((o) => o.isPlaying).length;
    const hayMezcla = oscillators.length > 0;
    const suena = isPlaying && capas > 0;
    useEffect(() => { if (oscillators.length > 0) rememberLastSession(oscillators); }, [oscillators]);

    const asegurarSonido = useCallback(async () => {
        if (isPlaying) return;
        try { await toggleMasterPlay(); setFallo(null); } catch { setFallo('El navegador no dejó arrancar el audio. Toca otra vez.'); }
    }, [isPlaying, toggleMasterPlay]);

    const detenerTodo = useCallback(() => { oscillators.forEach((o) => removeOscillator(o.id)); setUltimaId(null); }, [oscillators, removeOscillator]);

    const tocar = useCallback((id: string) => {
        const item = FEATURED_FREQUENCIES.find((f) => f.id === id);
        if (!item) return;
        if (ultimaId === id && suena) { detenerTodo(); return; }
        oscillators.forEach((o) => removeOscillator(o.id));
        frequencyToOscillators(item).forEach((p) => addOscillator(p));
        void asegurarSonido();
        setUltimaId(id);
    }, [ultimaId, suena, oscillators, removeOscillator, addOscillator, asegurarSonido, detenerTodo]);

    const sumar = useCallback((id: string) => {
        const item = FEATURED_FREQUENCIES.find((f) => f.id === id);
        if (!item) return;
        frequencyToOscillators(item).forEach((p) => addOscillator(p));
        void asegurarSonido();
        setUltimaId(null);
    }, [addOscillator, asegurarSonido]);

    const guardar = useCallback(() => {
        if (!hayMezcla) return;
        const nombre = nombrePreset.trim() || `Mezcla ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
        const content: PresetContent = { oscillators, dateCreated: Date.now(), description: 'Guardado desde el widget' };
        fs.savePreset(nombre, content);
        setNombrePreset('');
    }, [hayMezcla, nombrePreset, oscillators, fs]);

    const cargar = useCallback((content: PresetContent) => {
        oscillators.forEach((o) => removeOscillator(o.id));
        content.oscillators.forEach(({ id: _id, ...props }) => { void _id; addOscillator(props); });
        void asegurarSonido();
        setUltimaId(null);
    }, [oscillators, removeOscillator, addOscillator, asegurarSonido]);

    const visibles = useMemo(() => (filtro === 'all' ? FEATURED_FREQUENCIES : FEATURED_FREQUENCIES.filter((f) => f.category === filtro)), [filtro]);
    const actual = FEATURED_FREQUENCIES.find((f) => f.id === ultimaId) ?? null;
    const unaCapa = capas === 1 ? oscillators.find((o) => o.isPlaying) : undefined;
    const hzActual = actual ? resolveFrequency(actual) : unaCapa ? unaCapa.frequency : null;
    const nombreActual = actual?.name ?? (unaCapa?.name ?? (capas > 1 ? `${capas} capas en mezcla` : 'Sin frecuencia'));
    const alternarPrincipal = () => {
        if (suena) { void toggleMasterPlay(); return; }
        if (hayMezcla) { void asegurarSonido(); return; }
        tocar(FEATURED_FREQUENCIES[0].id);
    };

    const { base, clase, horizontal } = lienzo;
    const tinta = tintaE(lienzo.acento);
    const raiz = { lienzo, refRaiz: ref, etiqueta: `Omnifrecuencias: ${suena ? `sonando ${nombreActual}` : 'en silencio'}`, tipo: 'OMNIFRECUENCIAS' } as const;

    const nota = (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-white/55">
            <Headphones aria-hidden className="mt-0.5 size-3.5 shrink-0" style={{ color: tinta }} />
            <span>Exploración sonora, no un tratamiento médico. Empieza con volumen bajo; los binaurales necesitan auriculares y lo que está por debajo de 20 Hz no se oye como tono.</span>
        </p>
    );

    const fila = (item: FrequencyItem) => {
        const activa = ultimaId === item.id && suena;
        const cat = CATEGORIES.find((c) => c.id === item.category);
        const hz = resolveFrequency(item);
        return (
            <li key={item.id} className="flex min-w-0 items-center gap-1">
                <button type="button" onClick={() => tocar(item.id)} aria-pressed={activa} aria-label={activa ? `Detener ${item.name}` : `Reproducir ${item.name}`} title={`${item.name} — ${item.description}`}
                    className={cn('flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-xl px-2 text-left transition-colors duration-150', activa ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05]')}>
                    <span className="w-12 shrink-0 text-right tabular-nums" style={{ color: activa ? tinta : 'rgba(255,255,255,.75)', fontSize: px(lienzo, 12) }}>{hzTexto(item)}<span className="text-white/40"> Hz</span></span>
                    <span className="min-w-0 flex-1">
                        <span className={cn('block truncate', activa ? 'font-semibold text-white' : 'text-white/85')} style={{ fontSize: px(lienzo, 12) }}>{item.name}</span>
                        <span className="block truncate text-[11px] text-white/45">{hz < 20 && item.category !== 'synergy' ? 'infrasónica · no se oye como tono' : `${cat?.label ?? ''} · ${item.description}`}</span>
                    </span>
                    {activa ? <Square aria-hidden className="size-3.5 shrink-0" style={{ color: tinta }} /> : <Play aria-hidden className="size-3.5 shrink-0 text-white/45" />}
                </button>
                {(base === 'l' || base === 'xl') && <BotonE lienzo={lienzo} variante="fantasma" compacto icono={Plus} etiqueta={`Sumar ${item.name} a la mezcla`} onClick={() => sumar(item.id)} />}
            </li>
        );
    };

    const lista = (max = 12) => (
        <ul className={cn('flex min-h-0 flex-col gap-0.5', estilosE.desliza)} aria-label="Frecuencias destacadas">
            {visibles.slice(0, max).map(fila)}
            {visibles.length === 0 && <li className="py-4 text-center text-[12px] text-white/50">Sin frecuencias en esta categoría.</li>}
        </ul>
    );

    const volumen = <VolumenE lienzo={lienzo} volumen={masterVolume} onCambio={updateMasterVolume} />;
    const errorEl = fallo ? <p role="alert" className="text-[11px] text-rose-200">{fallo}</p> : null;

    if (base === 'micro') {
        return <RaizE {...raiz}><div className="m-auto"><Resonador lado={Math.max(52, Math.min(lienzo.ancho || 80, lienzo.alto || 80) * 0.86)} hz={hzActual} nombre={nombreActual} suena={suena} lienzo={lienzo} onAlternar={alternarPrincipal} /></div></RaizE>;
    }

    if (base === 's') {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
                    <Resonador lado={Math.max(72, Math.min(110, (lienzo.alto || 150) * 0.66))} hz={hzActual} nombre={nombreActual} suena={suena} lienzo={lienzo} onAlternar={alternarPrincipal} />
                    <span className="line-clamp-1 max-w-full text-[12px] font-medium text-white/85" title={nombreActual}>{nombreActual}</span>
                </div>
            </RaizE>
        );
    }

    if (horizontal) {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 items-center gap-3 px-1">
                    <Resonador lado={Math.max(56, Math.min(110, (lienzo.alto || 120) - 12))} hz={hzActual} nombre={nombreActual} suena={suena} lienzo={lienzo} onAlternar={alternarPrincipal} />
                    <div className="flex w-44 shrink-0 flex-col gap-1.5"><p className="truncate text-[13px] font-semibold text-white" title={nombreActual}>{nombreActual}</p>{volumen}</div>
                    {/* Sin tira con desplazamiento lateral: las frecuencias se reparten en filas y las que
                        no caben se retiran (la app completa las tiene todas). */}
                    <PilaAjustable niveles={FEATURED_FREQUENCIES.length} className="min-w-0 flex-1">
                    <ul className="my-auto flex min-w-0 flex-wrap gap-1.5" aria-label="Frecuencias destacadas">
                        {FEATURED_FREQUENCIES.map((f, i) => {
                            const activa = ultimaId === f.id && suena;
                            return (
                                <Prescindible key={f.id} nivel={i < 2 ? 0 : FEATURED_FREQUENCIES.length - i}>
                                <li className="shrink-0">
                                    <button type="button" onClick={() => tocar(f.id)} aria-pressed={activa} aria-label={activa ? `Detener ${f.name}` : `Reproducir ${f.name}`} title={f.name}
                                        className="ss-redondo inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition-colors"
                                        style={activa ? { background: conAlfa(lienzo.acento, 0.25), boxShadow: `inset 0 0 0 1px ${conAlfa(lienzo.acento, 0.6)}`, color: '#fff' } : { background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.8)' }}>
                                        <span className="tabular-nums">{hzTexto(f)} Hz</span>
                                    </button>
                                </li>
                                </Prescindible>
                            );
                        })}
                    </ul>
                    </PilaAjustable>
                </div>
            </RaizE>
        );
    }

    const cabecera = (
        <EncabezadoE lienzo={lienzo} icono={Waves} titulo="Omnifrecuencias" vivo={suena}
            acciones={<>
                {base === 'm' && <BotonE lienzo={lienzo} variante="fantasma" compacto icono={Info} etiqueta={verNota ? 'Ocultar aviso' : 'Ver aviso de uso'} aria-expanded={verNota} onClick={() => setVerNota((v) => !v)} />}
                <BotonE lienzo={lienzo} variante="fantasma" compacto icono={Maximize2} etiqueta="Abrir la app completa" onClick={abrirAppCompleta} />
            </>} />
    );
    const foco = (lado: number) => (
        <div className="flex min-w-0 items-center gap-3">
            <Resonador lado={lado} hz={hzActual} nombre={nombreActual} suena={suena} lienzo={lienzo} onAlternar={alternarPrincipal} />
            <div className="min-w-0 flex-1" aria-live="polite">
                <p className="line-clamp-2 font-semibold leading-snug text-white" style={{ fontSize: px(lienzo, 14) }} title={nombreActual}>{nombreActual}</p>
                <p className="truncate text-[12px] text-white/55">{suena ? `Sonando · ${capas} ${capas === 1 ? 'capa' : 'capas'}` : hayMezcla ? 'En pausa' : 'Toca una frecuencia'}</p>
                {hayMezcla && <BotonE lienzo={lienzo} variante="fantasma" compacto icono={Square} className="mt-1" onClick={detenerTodo}>Detener todo</BotonE>}
            </div>
        </div>
    );

    if (base === 'm' || clase === 'torre') {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 flex-col gap-2 p-1">
                    {cabecera}
                    {(verNota || clase === 'torre') && nota}
                    {foco(clase === 'torre' ? 96 : Math.max(64, Math.min(96, (lienzo.alto || 240) * 0.32)))}
                    <div className="flex min-h-0 flex-1 flex-col">{lista()}</div>
                    {volumen}
                    {errorEl}
                </div>
            </RaizE>
        );
    }

    // l / xl: pestañas completas.
    const analizador = base === 'xl' && suena && lienzo.animar ? getMasterAnalyser() : null;
    return (
        <RaizE {...raiz}>
            <div className="flex h-full min-h-0 flex-col gap-2 p-1">
                {cabecera}
                <div className="flex min-w-0 items-center gap-3">
                    <div className="min-w-0 flex-1">{foco(base === 'xl' ? 120 : 92)}</div>
                    {analizador && <div className="h-16 w-[40%] shrink-0 overflow-hidden rounded-xl" aria-hidden><Visualizer analyser={analizador} height={64} color={lienzo.acento} type="fill" /></div>}
                </div>
                <PestanasE lienzo={lienzo} etiqueta="Modo del estudio" valor={pestana} onCambio={setPestana}
                    opciones={[{ id: 'play', etiqueta: 'Frecuencias' }, { id: 'gen', etiqueta: 'Generador', cuenta: hayMezcla ? oscillators.length : undefined }, { id: 'presets', etiqueta: 'Presets', cuenta: fs.presets.length || undefined }]} />
                <div className="flex min-h-0 flex-1 flex-col">
                    {pestana === 'play' && (
                        <div className="flex h-full min-h-0 flex-col gap-1.5">
                            <PestanasE lienzo={lienzo} etiqueta="Filtrar por categoría" valor={filtro} onCambio={setFiltro}
                                opciones={FILTROS.map((id) => ({ id, etiqueta: CATEGORIES.find((c) => c.id === id)?.label ?? id }))} />
                            <div className="flex min-h-0 flex-1 flex-col">{lista()}</div>
                        </div>
                    )}
                    {pestana === 'gen' && (
                        <div className={cn('flex h-full min-h-0 flex-col gap-2', estilosE.desliza)}>
                            <div className="flex items-center gap-1.5">
                                <BotonE lienzo={lienzo} variante="suave" icono={Plus} onClick={() => { addOscillator(); void asegurarSonido(); setUltimaId(null); }}>Añadir oscilador</BotonE>
                                {hayMezcla && <BotonE lienzo={lienzo} variante="fantasma" icono={Trash2} etiqueta="Vaciar la mezcla" onClick={detenerTodo} />}
                            </div>
                            {oscillators.length === 0 ? (
                                <p className="flex items-center gap-2 py-4 text-[12px] text-white/55"><Sliders aria-hidden className="size-4" /> Añade un oscilador o toca una frecuencia.</p>
                            ) : (
                                <div className={cn('grid gap-1.5', base === 'xl' ? 'grid-cols-2' : 'grid-cols-1')}>
                                    {oscillators.map((o) => <CompactOscillator key={o.id} osc={o} update={updateOscillator} remove={removeOscillator} analyser={getOscillatorAnalyser(o.id)} />)}
                                </div>
                            )}
                        </div>
                    )}
                    {pestana === 'presets' && (
                        <div className="flex h-full min-h-0 flex-col gap-2">
                            <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
                                <input value={nombrePreset} onChange={(e) => setNombrePreset(e.target.value)} disabled={!hayMezcla} placeholder={hayMezcla ? 'Nombre del preset…' : 'Sin mezcla que guardar'} aria-label="Nombre del preset"
                                    className="min-w-0 flex-1 rounded-full bg-white/[0.06] px-3 text-[13px] text-white placeholder:text-white/40 outline-none focus:bg-white/[0.1] disabled:opacity-50" style={{ height: lienzo.tactil ? 44 : 32 }} />
                                <BotonE lienzo={lienzo} variante="primario" type="submit" icono={Save} disabled={!hayMezcla}>Guardar</BotonE>
                            </form>
                            {fs.presets.length === 0 ? (
                                <p className="flex items-start gap-2 text-[12px] text-white/55"><FolderOpen aria-hidden className="mt-0.5 size-4 shrink-0" /> Aún no has guardado presets: se guardan en tu Biblioteca y viajan con tu cuenta.</p>
                            ) : (
                                <ul className={cn('flex min-h-0 flex-col gap-0.5', estilosE.desliza)} aria-label="Tus presets">
                                    {fs.presets.map((p) => (
                                        <li key={p.id} className="flex items-center gap-1">
                                            <button type="button" onClick={() => cargar(p.content)} aria-label={`Cargar ${p.name}`}
                                                className="flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-xl px-2 text-left hover:bg-white/[0.05]">
                                                <Play aria-hidden className="size-3.5 shrink-0" style={{ color: tinta }} />
                                                <span className="min-w-0 flex-1 truncate text-[12px] text-white/90">{p.name}</span>
                                                <span className="shrink-0 text-[11px] text-white/45">{p.content.oscillators.length} {p.content.oscillators.length === 1 ? 'capa' : 'capas'}</span>
                                            </button>
                                            <BotonE lienzo={lienzo} variante="fantasma" compacto icono={Trash2} etiqueta={`Eliminar ${p.name}`} onClick={() => fs.deletePreset(p.id)} />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
                {volumen}
                <div className="shrink-0">{nota}</div>
                {errorEl}
            </div>
        </RaizE>
    );
}
