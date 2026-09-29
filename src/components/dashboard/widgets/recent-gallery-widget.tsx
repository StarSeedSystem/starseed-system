"use client";

// ════════════════════════════════════════════════════════════════
// RecentGalleryWidget — tus últimas fotos y vídeos, REALES (Ola 0929 · D)
// ----------------------------------------------------------------
// La Galería personal (imágenes y vídeos guardados en tu biblioteca,
// `entity-library`): primero la caché local de la biblioteca (pinta al
// instante, sin red) y luego una lectura compartida cada ≥ 10 min, solo a
// la vista. Mosaico «bento» con la última a lo grande, filtro fotos/vídeos,
// visor dentro del widget (anterior/siguiente, teclado, Escape) y la
// Cámara y la Galería a un toque.
//
// micro = la última · s = mosaico 2×2 · m = bento (1 grande + 4) · l =
// filtro + bento + visor · xl = por días (Hoy, Ayer…) · panorámico = tira
// de película · torre = columna. Estados: cargando (rejilla), sin sesión,
// vacío con «Abrir Cámara» y «Importar»; sin error visible: la biblioteca
// cae a su caché local y, sin nada, al vacío.
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Camera as CameraIcon, ChevronLeft, ChevronRight, Film, Image as ImageIcon, Images, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUid } from "@/lib/widget-data/os-live";
import type { EntityRef } from "@/lib/sync/entity-state";
import { listLibrary, readLibrarySnapshot, type SavedItem } from "@/lib/library/entity-library";
import { isMediaItem, mediaKindOf } from "@/lib/library/media-library";
import { MarcoSocial, estadoSocial } from "./_social-d/marco-social";
import { useEnPantalla, useFuenteCompartida } from "./_social-d/fuente-compartida";
import { BotonIcono, Pastilla, Segmentos, Tiempo, estilosSocial as estilos, urlSegura } from "./_social-d/piezas";
import { agruparPorDia, msDe, plural } from "./_social-d/formato";
import { columnasQueCaben, type TamanoSocial } from "./_social-d/tamano";

const ACENTO = "#f472b6";
const INTERVALO = 10 * 60_000;

type Filtro = "todo" | "image" | "video";

function soloMedios(items: SavedItem[]): SavedItem[] {
    return items.filter(isMediaItem).sort((a, b) => msDe(b.addedAt) - msDe(a.addedAt));
}

export function RecentGalleryWidget() {
    const { uid, ready } = useCurrentUid();
    const refRaiz = React.useRef<HTMLDivElement | null>(null);
    const enPantalla = useEnPantalla(refRaiz);
    const ref: EntityRef | null = uid ? { kind: "user", id: uid } : null;
    const fuente = useFuenteCompartida<SavedItem[]>(uid ? `galeria:${uid}` : null, async () => ({ datos: ref ? soloMedios((await listLibrary(ref)).items) : [] }), { intervaloMs: INTERVALO, enPantalla });
    // La caché local de la biblioteca pinta sin esperar a la red.
    const local = React.useMemo(() => {
        if (!ref) return [];
        try { return soloMedios(readLibrarySnapshot(ref).items); } catch { return []; }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uid]);
    const medios = fuente.datos ?? local;
    const [filtro, setFiltro] = React.useState<Filtro>("todo");
    const [viendo, setViendo] = React.useState<number | null>(null);

    const visibles = filtro === "todo" ? medios : medios.filter((m) => mediaKindOf(m) === filtro);
    const fotos = medios.filter((m) => mediaKindOf(m) === "image").length;
    const estado = estadoSocial({ sinSesion: ready && !uid, cargando: !ready || (fuente.cargando && local.length === 0), hayDatos: medios.length > 0 });

    return (
        <div ref={refRaiz} className="h-full w-full">
            <MarcoSocial
                titulo="Galería reciente"
                subtitulo={`${plural(fotos, "foto", "fotos")} · ${plural(medios.length - fotos, "vídeo", "vídeos")}`}
                icono={Images}
                categoria="archivos"
                acento={ACENTO}
                estado={estado}
                esqueleto="rejilla"
                sinSesion={{ mensaje: "Entra para ver tus fotos y vídeos en cualquier neurona." }}
                vacio={{ icono: CameraIcon, titulo: "Aún no hay fotos ni vídeos", mensaje: "Captura algo con la Cámara o importa tus imágenes: aparecerán aquí al momento.", accion: { etiqueta: "Abrir Cámara", href: "/camara" } }}
                acciones={(t) => (
                    <>
                        <BotonIcono icono={CameraIcon} etiqueta="Abrir la Cámara" href="/camara" acento={t.acento} tactil={t.tactil} />
                        <BotonIcono icono={Images} etiqueta="Abrir la Galería" href="/galeria" acento={t.acento} tactil={t.tactil} />
                    </>
                )}
            >
                {(t) => {
                    if (viendo !== null && visibles[viendo] && t.base !== "micro" && t.base !== "s") {
                        return <Visor t={t} lista={visibles} i={viendo} onCambiar={setViendo} onCerrar={() => setViendo(null)} />;
                    }
                    if (t.base === "micro") {
                        return (
                            <Link href="/galeria" aria-label={`${plural(medios.length, "foto o vídeo", "fotos y vídeos")}. Abrir la Galería`} className="relative block h-full cursor-pointer overflow-hidden rounded-[14px]">
                                <Pieza it={medios[0]} />
                                <span className="absolute bottom-1 right-1.5 text-[11px] font-semibold tabular-nums text-white drop-shadow">{medios.length}</span>
                            </Link>
                        );
                    }
                    const abrir = (it: SavedItem) => setViendo(visibles.indexOf(it));
                    if (t.base === "s") return <Mosaico items={medios.slice(0, 4)} cols={2} filas={2} onAbrir={undefined} />;
                    if (t.clase === "panoramico") {
                        const alto = Math.max(60, t.alto);
                        const caben = Math.max(2, Math.floor(t.ancho / (alto * 0.9 + 8)));
                        return <Mosaico items={visibles.slice(0, caben)} cols={caben} filas={1} onAbrir={abrir} />;
                    }
                    if (t.clase === "torre") {
                        const n = Math.max(2, Math.floor(t.alto / Math.max(80, t.ancho)));
                        return <Mosaico items={visibles.slice(0, n)} cols={1} filas={n} onAbrir={abrir} />;
                    }
                    const filtros = (t.base === "l" || t.base === "xl") && medios.length !== fotos && fotos > 0 ? (
                        <Segmentos<Filtro> etiqueta="Qué ver" acento={t.acento} tactil={t.tactil} valor={filtro} onCambio={(f) => { setFiltro(f); setViendo(null); }}
                            opciones={[{ id: "todo", etiqueta: "Todo", n: medios.length }, { id: "image", etiqueta: "Fotos", n: fotos, icono: ImageIcon }, { id: "video", etiqueta: "Vídeos", n: medios.length - fotos, icono: Film }]} />
                    ) : null;
                    if (t.base === "xl") {
                        const cols = columnasQueCaben(t.ancho, 110, 4, 8);
                        const grupos = agruparPorDia(visibles.slice(0, cols * 4), (m) => msDe(m.addedAt), Date.now());
                        return (
                            <div className="flex h-full min-h-0 flex-col gap-2">
                                {filtros}
                                <div className="min-h-0 flex-1 overflow-y-auto pr-0.5 ss-scroll">
                                    {grupos.map((g) => (
                                        <section key={g.clave} aria-label={g.rotulo} className="mb-2">
                                            <h4 className="sticky top-0 z-10 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/55" style={{ background: "linear-gradient(180deg, rgba(12,14,34,.6), transparent)" }}>{g.rotulo}</h4>
                                            <ul className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }} aria-label={`Fotos y vídeos de ${g.rotulo}`}>
                                                {g.elementos.map((it) => <li key={it.id} className="aspect-square"><Azulejo it={it} onAbrir={abrir} /></li>)}
                                            </ul>
                                        </section>
                                    ))}
                                </div>
                            </div>
                        );
                    }
                    return (
                        <div className="flex h-full min-h-0 flex-col gap-2">
                            {filtros}
                            <Bento items={visibles} onAbrir={abrir} />
                            {t.base === "l" && visibles.length === 0 && <Pastilla acento={t.acento} onClick={() => setFiltro("todo")} tactil={t.tactil}>Ver todo</Pastilla>}
                        </div>
                    );
                }}
            </MarcoSocial>
        </div>
    );
}

// ── Piezas ──────────────────────────────────────────────────────────

/** Una foto o un vídeo (póster) a sangre, con respaldo si no carga. */
function Pieza({ it }: { it?: SavedItem }) {
    const [fallo, setFallo] = React.useState(false);
    if (!it) return null;
    const src = fallo ? null : urlSegura(it.thumbnail || it.url);
    const video = mediaKindOf(it) === "video";
    if (!src) {
        return <span aria-hidden className="grid size-full place-items-center bg-white/[0.05]">{video ? <Film className="size-6 text-white/50" /> : <ImageIcon className="size-6 text-white/50" />}</span>;
    }
    if (video && !it.thumbnail) {
        return <video src={src} muted playsInline preload="metadata" className="size-full object-cover" onError={() => setFallo(true)} aria-hidden />;
    }
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="size-full object-cover" onError={() => setFallo(true)} />;
}

function Azulejo({ it, onAbrir, className }: { it: SavedItem; onAbrir?: (it: SavedItem) => void; className?: string }) {
    const video = mediaKindOf(it) === "video";
    const contenido = (
        <>
            <Pieza it={it} />
            {video && <span className="absolute bottom-1.5 right-1.5 grid size-6 place-items-center rounded-full ss-redondo bg-black/55"><Play className="size-3 fill-white text-white" aria-hidden /></span>}
        </>
    );
    const clase = cn(estilos.tarjeta, "relative block size-full cursor-pointer overflow-hidden rounded-[12px] bg-white/[0.04]", className);
    const etiqueta = `${video ? "Vídeo" : "Foto"}: ${it.title || "sin título"}`;
    if (onAbrir) return <button type="button" onClick={() => onAbrir(it)} className={clase} aria-label={`Ver ${etiqueta}`}>{contenido}</button>;
    return <Link href="/galeria" className={clase} aria-label={`${etiqueta}. Abrir la Galería`}>{contenido}</Link>;
}

function Mosaico({ items, cols, filas, onAbrir }: { items: SavedItem[]; cols: number; filas: number; onAbrir?: (it: SavedItem) => void }) {
    return (
        <ul className="grid h-full min-h-0 gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridTemplateRows: `repeat(${filas}, minmax(0,1fr))` }} aria-label="Fotos y vídeos">
            {items.slice(0, cols * filas).map((it) => <li key={it.id} className="min-h-0"><Azulejo it={it} onAbrir={onAbrir} /></li>)}
        </ul>
    );
}

/** Bento: la última a lo grande y cuatro alrededor. */
function Bento({ items, onAbrir }: { items: SavedItem[]; onAbrir: (it: SavedItem) => void }) {
    if (items.length < 3) return <Mosaico items={items} cols={Math.max(1, items.length)} filas={1} onAbrir={onAbrir} />;
    return (
        <ul className="grid min-h-0 flex-1 grid-cols-4 grid-rows-2 gap-1.5" aria-label="Fotos y vídeos">
            {items.slice(0, 5).map((it, i) => (
                <li key={it.id} className={cn("min-h-0", i === 0 && "col-span-2 row-span-2")}><Azulejo it={it} onAbrir={onAbrir} /></li>
            ))}
            {items.length > 5 && (
                <li className="sr-only"><Link href="/galeria">Ver las {items.length} en la Galería</Link></li>
            )}
        </ul>
    );
}

/** Visor dentro del widget: anterior/siguiente, flechas del teclado y Escape. */
function Visor({ t, lista, i, onCambiar, onCerrar }: { t: TamanoSocial; lista: SavedItem[]; i: number; onCambiar: (i: number) => void; onCerrar: () => void }) {
    const it = lista[i];
    const ref = React.useRef<HTMLElement | null>(null);
    React.useEffect(() => { ref.current?.focus(); }, [i]);
    const ir = (d: number) => onCambiar((i + d + lista.length) % lista.length);
    const video = mediaKindOf(it) === "video";
    const src = urlSegura(it.url);
    return (
        <section ref={ref} tabIndex={-1} aria-label={`Visor: ${it.title || (video ? "vídeo" : "foto")} (${i + 1} de ${lista.length})`}
            onKeyDown={(e) => { if (e.key === "Escape") onCerrar(); if (e.key === "ArrowRight") ir(1); if (e.key === "ArrowLeft") ir(-1); }}
            className={cn(estilos.aparece, "flex h-full min-h-0 flex-col gap-2 outline-none")}>
            <header className="flex items-center gap-2">
                <BotonIcono icono={ArrowLeft} etiqueta="Volver al mosaico" onClick={onCerrar} acento={t.acento} tactil={t.tactil} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-white">{it.title || (video ? "Vídeo" : "Foto")}</span>
                    <span className="text-[10.5px] text-white/55"><Tiempo ms={msDe(it.addedAt)} /> · {i + 1} de {lista.length}</span>
                </span>
                <Pastilla acento={t.acento} href="/galeria" tactil={t.tactil}>Abrir en Galería</Pastilla>
            </header>
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-[14px] bg-black/30">
                {src ? (video
                    ? <video src={src} controls playsInline preload="metadata" className="size-full object-contain" aria-label={it.title || "vídeo"} />
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={src} alt={it.title || "foto"} className="size-full object-contain" referrerPolicy="no-referrer" />)
                    : <p className="grid size-full place-items-center text-[12px] text-white/55">No se puede mostrar este archivo aquí.</p>}
                {lista.length > 1 && (
                    <>
                        <span className="absolute left-1.5 top-1/2 -translate-y-1/2"><BotonIcono icono={ChevronLeft} etiqueta="Anterior" onClick={() => ir(-1)} acento={t.acento} tactil={t.tactil} /></span>
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2"><BotonIcono icono={ChevronRight} etiqueta="Siguiente" onClick={() => ir(1)} acento={t.acento} tactil={t.tactil} /></span>
                    </>
                )}
            </div>
        </section>
    );
}

export default RecentGalleryWidget;
