'use client';

// ════════════════════════════════════════════════════════════════
// UniversalOpenerWidget — Visor universal (Ola 0929 · paquete E)
// ----------------------------------------------------------------
// Abre casi cualquier cosa sin salir del tablero, con el motor useContentOpener:
//   · suelta archivos encima del widget (o tócalo) — se abren en tu dispositivo,
//     no se suben a ningún sitio;
//   · pega una URL y ves al momento qué es (imagen, vídeo, PDF, 3D, HTML…);
//   · recientes (lo que abriste por URL, en este dispositivo) y tu Biblioteca
//     (lo guardado de verdad, useSavedLibrary) para volver a abrirlo;
//   · «Guardar en Biblioteca» desde el propio visor.
// Antes, «De tu Biblioteca» enseñaba elementos simulados como si fueran tuyos: ya no.
// Las muestras de formatos son URLs públicas reales y se rotulan como tales.
// Composición: micro = abrir archivo · s = zona para soltar · m = URL + soltar +
// recientes · l/xl = + pestañas Recientes/Biblioteca/Formatos · panorámico = URL y
// recientes en fila · torre = columna. Estados: vacío (sin recientes: invita a
// abrir algo), error (URL que no se entiende), y el visor muestra su propia carga.
// ════════════════════════════════════════════════════════════════

import React, { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { FolderOpen, Upload, ArrowRight, Image as ImageIcon, Film, Music, FileText, Box, Code2, Globe, Link2, BookmarkPlus, X, Clock, Library, Shapes } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { conAlfa } from '@/components/widgets-libres/acentos-categoria';
import { useContentOpener } from '../apps/content/content-opener';
import { detectKind, fromFile, fromUrl, type ContentKind, type ContentResource } from '../apps/content/content-types';
import { useSavedLibrary } from '@/lib/library-store';
import type { DashboardWidget } from '../dashboard-types';
import { useLienzoE, px } from './paquete-e/lienzo';
import { BotonE, EncabezadoE, PestanasE, RaizE, SelloE, estilosE, tintaE } from './paquete-e/piezas';

// ── Recientes (solo URLs: un archivo local no se puede reabrir tras recargar) ──
interface Reciente { url: string; titulo: string; tipo: ContentKind; t: number }
const CLAVE_RECIENTES = 'starseed.visor.recientes.v1';
const EVENTO = 'starseed:visor-recientes';
const SIN: Reciente[] = [];
let cache: Reciente[] | null = null;
function leerRecientes(): Reciente[] {
    if (typeof window === 'undefined') return SIN;
    if (cache) return cache;
    try { const v = JSON.parse(window.localStorage.getItem(CLAVE_RECIENTES) ?? '[]'); cache = Array.isArray(v) ? v.filter((x): x is Reciente => !!x && typeof x.url === 'string') : []; } catch { cache = []; }
    return cache;
}
function guardarRecientes(l: Reciente[]) {
    cache = l.slice(0, 20);
    try { window.localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(cache)); } catch { /* sin almacenamiento */ }
    try { window.dispatchEvent(new CustomEvent(EVENTO)); } catch { /* sin eventos */ }
}
function suscribir(cb: () => void) {
    if (typeof window === 'undefined') return () => undefined;
    const a = (e: StorageEvent) => { if (e.key === CLAVE_RECIENTES) { cache = null; cb(); } };
    window.addEventListener(EVENTO, cb); window.addEventListener('storage', a);
    return () => { window.removeEventListener(EVENTO, cb); window.removeEventListener('storage', a); };
}

const ICONO: Partial<Record<ContentKind, LucideIcon>> = { image: ImageIcon, gif: ImageIcon, gallery: ImageIcon, video: Film, audio: Music, pdf: FileText, model3d: Box, html: Globe, markdown: FileText, code: Code2, text: FileText, link: Link2 };
const NOMBRE: Partial<Record<ContentKind, string>> = { image: 'Imagen', gif: 'GIF', gallery: 'Galería', video: 'Vídeo', audio: 'Audio', pdf: 'PDF', model3d: 'Modelo 3D', html: 'Página web', markdown: 'Markdown', code: 'Código', text: 'Texto', dataset: 'Datos', link: 'Enlace', unknown: 'Archivo' };

/** ¿Parece una URL abrible? (http/https; lo demás se explica, no se intenta). */
export function urlValida(texto: string): string | null {
    const t = texto.trim();
    if (!t) return null;
    const conEsquema = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
    try {
        const u = new URL(conEsquema);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
        if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
        return u.toString();
    } catch { return null; }
}

// Muestras de cada formato: URLs públicas reales (Wikimedia, Google, Mozilla, modelviewer).
const MD = '# Markdown\n\nEl **visor universal** pinta markdown con el estilo del tema.\n\n- Listas\n- `código en línea`\n\n> Una entidad del Lienzo Universal.';
const CODIGO = 'export function mezclar(a: number, b: number) {\n  return Math.min(100, a + b);\n}';
const HTML = '<!doctype html><html><body style="font-family:system-ui;background:#0b0c1e;color:#e9c46a;display:grid;place-items:center;height:100vh;margin:0"><h1>HTML aislado</h1></body></html>';
const FORMATOS: { icono: LucideIcon; nombre: string; res: ContentResource }[] = [
    { icono: ImageIcon, nombre: 'Imagen', res: { id: 'f-img', kind: 'image', title: 'Nebulosa (Wikimedia)', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Crab_Nebula.jpg/1024px-Crab_Nebula.jpg', origin: 'url' } },
    { icono: ImageIcon, nombre: 'GIF', res: { id: 'f-gif', kind: 'gif', title: 'La Tierra girando (Wikimedia)', url: 'https://upload.wikimedia.org/wikipedia/commons/2/2c/Rotating_earth_%28large%29.gif', origin: 'url' } },
    { icono: Film, nombre: 'Vídeo', res: { id: 'f-vid', kind: 'video', title: 'Big Buck Bunny', url: 'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4', origin: 'url' } },
    { icono: Music, nombre: 'Audio', res: { id: 'f-aud', kind: 'audio', title: 'SoundHelix 1', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', origin: 'url' } },
    { icono: FileText, nombre: 'PDF', res: { id: 'f-pdf', kind: 'pdf', title: 'Artículo en PDF (Mozilla)', url: 'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf', origin: 'url' } },
    { icono: Box, nombre: '3D', res: { id: 'f-3d', kind: 'model3d', title: 'Astronauta (GLB)', url: 'https://modelviewer.dev/shared-assets/models/Astronaut.glb', origin: 'url' } },
    { icono: Globe, nombre: 'HTML', res: { id: 'f-html', kind: 'html', title: 'Página HTML aislada', text: HTML, origin: 'url' } },
    { icono: FileText, nombre: 'Markdown', res: { id: 'f-md', kind: 'markdown', title: 'Documento.md', text: MD, origin: 'url' } },
    { icono: Code2, nombre: 'Código', res: { id: 'f-code', kind: 'code', title: 'mezclar.ts', text: CODIGO, language: 'ts', origin: 'url' } },
];

type Pestana = 'recientes' | 'biblioteca' | 'formatos';

export function UniversalOpenerWidget({ widget }: { widget: DashboardWidget }) {
    void widget;
    const { ref, lienzo } = useLienzoE();
    const biblioteca = useSavedLibrary();
    const recientes = useSyncExternalStore(suscribir, leerRecientes, () => SIN);
    const opciones = useMemo(() => ({
        onSave: (r: ContentResource) => biblioteca.save({ kind: r.kind, title: r.title, url: r.url, origin: r.origin ?? 'url' }),
        onOpen: (r: ContentResource) => {
            if (!r.url || r.origin === 'file' || r.url.startsWith('blob:')) return;
            guardarRecientes([{ url: r.url, titulo: r.title, tipo: r.kind, t: Date.now() }, ...leerRecientes().filter((x) => x.url !== r.url)]);
        },
    }), [biblioteca]);
    const { open, openMany, windowEl } = useContentOpener(opciones);
    const [url, setUrl] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [arrastrando, setArrastrando] = useState(false);
    const [pestana, setPestana] = useState<Pestana>('recientes');
    const archivo = useRef<HTMLInputElement>(null);

    const urlLimpia = urlValida(url);
    const tipoUrl: ContentKind | null = urlLimpia ? detectKind({ url: urlLimpia }) : null;
    const guardados = biblioteca.items.filter((i) => !!i.url);

    const abrirUrl = () => {
        if (!url.trim()) return;
        if (!urlLimpia) { setError('Eso no parece una dirección web (https://…).'); return; }
        setError(null);
        open(fromUrl(urlLimpia));
        setUrl('');
    };
    const abrirArchivos = useCallback((lista: FileList | null) => {
        if (!lista || !lista.length) return;
        openMany(Array.from(lista).map(fromFile));
    }, [openMany]);
    const reabrir = (r: { url: string; titulo: string }) => open(fromUrl(r.url, r.titulo));

    const zona = {
        onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setArrastrando(true); } },
        onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setArrastrando(false); },
        onDrop: (e: React.DragEvent) => { e.preventDefault(); setArrastrando(false); abrirArchivos(e.dataTransfer.files); },
    };

    const { base, clase, horizontal } = lienzo;
    const tinta = tintaE(lienzo.acento);
    const raiz = { lienzo, refRaiz: ref, etiqueta: 'Visor universal: abre archivos y enlaces', tipo: 'UNIVERSAL_OPENER' } as const;
    const entrada = <input ref={archivo} type="file" multiple hidden onChange={(e) => { abrirArchivos(e.target.files); e.target.value = ''; }} aria-hidden tabIndex={-1} />;
    const velo = arrastrando ? (
        <div aria-hidden className="pointer-events-none absolute inset-1 z-20 grid place-items-center rounded-[20px]" style={{ background: conAlfa(lienzo.acento, 0.18), boxShadow: `inset 0 0 0 2px ${conAlfa(lienzo.acento, 0.8)}` }}>
            <span className="flex items-center gap-2 text-[14px] font-semibold text-white"><Upload className="size-5" /> Suelta para abrir</span>
        </div>
    ) : null;

    const campoUrl = (
        <form className="flex min-w-0 flex-col gap-1" onSubmit={(e) => { e.preventDefault(); abrirUrl(); }}>
            <div className="flex min-w-0 items-center gap-1.5">
                <label className="relative flex min-w-0 flex-1 items-center">
                    {(() => { const I = tipoUrl ? ICONO[tipoUrl] ?? Link2 : Link2; return <I aria-hidden className="pointer-events-none absolute left-3 size-4" style={{ color: tipoUrl ? tinta : 'rgba(255,255,255,.4)' }} />; })()}
                    <input value={url} onChange={(e) => { setUrl(e.target.value); setError(null); }} placeholder="Pega una URL: imagen, vídeo, PDF, GLB…" aria-label="Dirección a abrir" inputMode="url"
                        className="w-full min-w-0 rounded-full bg-white/[0.06] pl-9 pr-3 text-white placeholder:text-white/40 outline-none focus:bg-white/[0.1]"
                        style={{ height: lienzo.tactil ? 44 : 34, fontSize: px(lienzo, 13), boxShadow: `inset 0 0 0 1px ${conAlfa(lienzo.acento, 0.28)}` }} />
                </label>
                <BotonE lienzo={lienzo} variante="primario" type="submit" icono={ArrowRight} etiqueta="Abrir la dirección" disabled={!url.trim()} />
                <BotonE lienzo={lienzo} variante="suave" icono={Upload} etiqueta="Abrir un archivo del dispositivo" onClick={() => archivo.current?.click()} />
            </div>
            {error ? <p role="alert" className="px-3 text-[11px] text-rose-200">{error}</p>
                : tipoUrl ? <p className="px-3 text-[11px] text-white/55">Se abrirá como <b className="font-semibold" style={{ color: tinta }}>{NOMBRE[tipoUrl] ?? 'enlace'}</b></p> : null}
        </form>
    );

    const filaReciente = (r: Reciente) => {
        const I = ICONO[r.tipo] ?? Link2;
        const yaGuardado = guardados.some((g) => g.url === r.url);
        let dominio = '';
        try { dominio = new URL(r.url).hostname.replace(/^www\./, ''); } catch { /* url rara */ }
        return (
            <li key={r.url} className={cn(estilosE.entra, 'flex min-w-0 items-center gap-1')}>
                <button type="button" onClick={() => reabrir(r)} title={r.url}
                    className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-xl px-2 text-left transition-colors hover:bg-white/[0.05]">
                    <I aria-hidden className="size-4 shrink-0" style={{ color: tinta }} />
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-white/90" style={{ fontSize: px(lienzo, 12) }}>{r.titulo}</span>
                        <span className="block truncate text-[11px] text-white/45">{NOMBRE[r.tipo] ?? 'Enlace'} · {dominio}</span>
                    </span>
                </button>
                {!yaGuardado && base !== 'm' && <BotonE lienzo={lienzo} variante="fantasma" compacto icono={BookmarkPlus} etiqueta={`Guardar ${r.titulo} en tu Biblioteca`} onClick={() => biblioteca.save({ kind: r.tipo, title: r.titulo, url: r.url, origin: 'url' })} />}
                <BotonE lienzo={lienzo} variante="fantasma" compacto icono={X} etiqueta={`Quitar ${r.titulo} de recientes`} onClick={() => guardarRecientes(leerRecientes().filter((x) => x.url !== r.url))} />
            </li>
        );
    };

    const listaRecientes = (max: number) => recientes.length === 0 ? (
        <p className="flex items-center gap-2 px-2 py-3 text-[12px] text-white/55"><Clock aria-hidden className="size-4 shrink-0" /> Aún vacío: lo que abras por URL aparecerá aquí para volver en un toque.</p>
    ) : <ul className={cn('flex min-h-0 flex-col gap-0.5', estilosE.desliza)}>{recientes.slice(0, max).map(filaReciente)}</ul>;

    const listaBiblioteca = (max: number) => guardados.length === 0 ? (
        <p className="flex items-center gap-2 px-2 py-3 text-[12px] text-white/55"><Library aria-hidden className="size-4 shrink-0" /> Tu Biblioteca no tiene enlaces guardados todavía. Abre algo y pulsa «Guardar».</p>
    ) : (
        <ul className={cn('flex min-h-0 flex-col gap-0.5', estilosE.desliza)}>
            {guardados.slice(0, max).map((g) => {
                const I = ICONO[g.kind as ContentKind] ?? Link2;
                return (
                    <li key={g.id} className="flex items-center gap-1">
                        <button type="button" onClick={() => g.url && reabrir({ url: g.url, titulo: g.title })} className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-xl px-2 text-left hover:bg-white/[0.05]" title={g.url}>
                            <I aria-hidden className="size-4 shrink-0" style={{ color: tinta }} />
                            <span className="min-w-0 flex-1 truncate text-[12px] text-white/90">{g.title}</span>
                        </button>
                        <BotonE lienzo={lienzo} variante="fantasma" compacto icono={X} etiqueta={`Quitar ${g.title} de tu Biblioteca`} onClick={() => biblioteca.remove(g.id)} />
                    </li>
                );
            })}
        </ul>
    );

    const formatos = (
        <div className="flex min-h-0 flex-col gap-1.5">
            <SelloE title="URLs públicas reales para probar cada visor">muestras de formatos</SelloE>
            <ul className={cn('grid min-h-0 gap-1.5', estilosE.desliza)} style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))' }}>
                {FORMATOS.map((f) => (
                    <li key={f.res.id}>
                        <button type="button" onClick={() => open(f.res)} title={f.res.title}
                            className="flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-2xl p-2 transition-transform duration-200 hover:-translate-y-0.5" style={{ background: conAlfa(lienzo.acento, 0.07) }}>
                            <f.icono aria-hidden className="size-5" style={{ color: tinta }} />
                            <span className="text-[11px] font-medium text-white/85">{f.nombre}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );

    if (base === 'micro') {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full" {...zona}>
                    <button type="button" onClick={() => archivo.current?.click()} aria-label="Abrir un archivo" title="Abrir o soltar un archivo"
                        className="ss-redondo m-auto grid size-[72%] max-h-20 max-w-20 cursor-pointer place-items-center rounded-full" style={{ background: `radial-gradient(closest-side, ${conAlfa(lienzo.acento, 0.35)}, ${conAlfa(lienzo.acento, 0.05)})` }}>
                        <FolderOpen aria-hidden className="size-6 text-white" />
                    </button>
                </div>
                {velo}{entrada}{windowEl}
            </RaizE>
        );
    }

    if (base === 's') {
        return (
            <RaizE {...raiz}>
                <button type="button" onClick={() => archivo.current?.click()} {...zona}
                    className="m-1 flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-[20px] text-center transition-colors duration-200"
                    style={{ boxShadow: `inset 0 0 0 1.5px ${conAlfa(lienzo.acento, 0.35)}`, background: conAlfa(lienzo.acento, 0.06) }} aria-label="Abrir un archivo: toca o suelta aquí">
                    <Upload aria-hidden className="size-6" style={{ color: tinta }} />
                    <span className="text-[12px] font-medium text-white/85">Suelta o toca para abrir</span>
                </button>
                {velo}{entrada}{windowEl}
            </RaizE>
        );
    }

    if (horizontal) {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 items-center gap-3 px-1" {...zona}>
                    <div className="w-[46%] min-w-[220px] shrink-0">{campoUrl}</div>
                    <ul className={cn('flex min-w-0 flex-1 gap-1.5 overflow-x-auto', estilosE.desliza)} aria-label="Recientes">
                        {recientes.length === 0 ? <li className="text-[12px] text-white/50">Lo que abras aparecerá aquí.</li> : recientes.slice(0, 8).map((r) => (
                            <li key={r.url} className="shrink-0">
                                <button type="button" onClick={() => reabrir(r)} title={r.url} className="ss-redondo inline-flex min-h-9 max-w-[200px] cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12px] text-white/85" style={{ background: 'rgba(255,255,255,.05)' }}>
                                    {(() => { const I = ICONO[r.tipo] ?? Link2; return <I aria-hidden className="size-3.5 shrink-0" style={{ color: tinta }} />; })()}
                                    <span className="truncate">{r.titulo}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
                {velo}{entrada}{windowEl}
            </RaizE>
        );
    }

    if (base === 'm' && clase !== 'torre') {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 flex-col gap-2 p-1" {...zona}>
                    <EncabezadoE lienzo={lienzo} icono={FolderOpen} titulo="Visor universal" detalle="suelta archivos aquí" />
                    {campoUrl}
                    <div className="min-h-0 flex-1">{listaRecientes(4)}</div>
                </div>
                {velo}{entrada}{windowEl}
            </RaizE>
        );
    }

    return (
        <RaizE {...raiz}>
            <div className="flex h-full min-h-0 flex-col gap-2 p-1" {...zona}>
                <EncabezadoE lienzo={lienzo} icono={FolderOpen} titulo="Visor universal" detalle="suelta archivos aquí" />
                {campoUrl}
                <PestanasE lienzo={lienzo} etiqueta="Qué abrir" valor={pestana} onCambio={setPestana}
                    opciones={[{ id: 'recientes', etiqueta: 'Recientes', cuenta: recientes.length }, { id: 'biblioteca', etiqueta: 'Biblioteca', cuenta: guardados.length }, { id: 'formatos', etiqueta: 'Formatos' }]} />
                <div className="min-h-0 flex-1">
                    {pestana === 'recientes' && listaRecientes(12)}
                    {pestana === 'biblioteca' && listaBiblioteca(12)}
                    {pestana === 'formatos' && formatos}
                </div>
                <p className="flex items-center gap-1.5 text-[11px] text-white/45"><Shapes aria-hidden className="size-3.5" /> Los archivos se abren en tu dispositivo: no se suben a ningún sitio.</p>
            </div>
            {velo}{entrada}{windowEl}
        </RaizE>
    );
}
