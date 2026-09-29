'use client';

// ════════════════════════════════════════════════════════════════
// CulturalFeedWidget — la Corriente Cultural como una sala de obras (Ola 0929 · D)
// ----------------------------------------------------------------
// Creaciones REALES de la comunidad: las del Café (`cafe_posts`: obras,
// elixires, recetas, propuestas…) y las publicaciones del Lienzo con área
// «cultura» (`posts`). Cada obra es una pieza con su imagen (o su
// emblema de tipo), su autoría, sus reacciones y comentarios reales. Se
// filtra por tipo, se lee entera sin salir del tablero (las del Café no
// tienen página propia en el OS) y las del Lienzo se pueden guardar en tu
// biblioteca o abrir. Lecturas compartidas con Publicaciones relevantes y
// el Feed de la Red (mismas claves), cada ≥ 5 min y solo a la vista.
//
// micro = la última obra como azulejo · s = su lámina · m = sala 2×2 ·
// torre = columna de láminas · l = tipos + sala de 3 · xl = portada + sala
// · panorámico = la exposición en fila. Estados: cargando (rejilla), vacío
// honesto del marco común con «Compartir una obra», error con reintento
// solo si fallan las dos fuentes.
// ════════════════════════════════════════════════════════════════

import * as React from 'react';
import Link from 'next/link';
import {
    CalendarDays, ChefHat, FlaskConical, Heart, Lightbulb, MessagesSquare, Palette, PenSquare, Sparkles, Target, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { conAlfa } from '@/components/widgets-libres/acentos-categoria';
import { MarcoSocial, estadoSocial } from './_social-d/marco-social';
import { useEnPantalla, useFuenteCompartida } from './_social-d/fuente-compartida';
import { cargarFeedRed, type FeedRed } from './_social-d/feed-red-datos';
import { cargarCafe, type CreacionCafe } from './_social-d/cafe-datos';
import { useAccionesRed } from './_social-d/acciones-red';
import { tipoCreacion, vistaDeCafe, vistaDeRed, type PublicacionConOrigen } from './_social-d/vistas';
import { BotonActualizar, BotonIcono, Miniatura, Pastilla, Segmentos, estilosSocial as estilos, tintaDe } from './_social-d/piezas';
import { Abrir, LectorPublicacion, PortadaPublicacion, textoDe, type AccionesPublicacion, type PublicacionVista } from './_social-d/publicaciones';
import { columnasQueCaben, type TamanoSocial } from './_social-d/tamano';
import { formatoNumero, recortar } from './_social-d/formato';

const ACENTO = '#ffbf00';
const INTERVALO_RED = 10 * 60_000;

const ICONO_TIPO: Record<string, LucideIcon> = {
    obra: Palette, propuesta: Lightbulb, debate: MessagesSquare, mision: Target, 'misión': Target,
    evento: CalendarDays, elixir: FlaskConical, receta: ChefHat,
};
const iconoTipo = (tipo: string | null) => ICONO_TIPO[(tipo ?? '').toLowerCase()] ?? Sparkles;

export function CulturalFeedWidget() {
    const refRaiz = React.useRef<HTMLDivElement | null>(null);
    const enPantalla = useEnPantalla(refRaiz);
    const cafe = useFuenteCompartida<CreacionCafe[]>('cafe:publicaciones', cargarCafe, { enPantalla });
    const red = useFuenteCompartida<FeedRed>('red:feed', () => cargarFeedRed(12), { intervaloMs: INTERVALO_RED, enPantalla });
    const { resonar, guardar, guardadas } = useAccionesRed(red);
    const [tipo, setTipo] = React.useState<string>('todo');
    const [leyendo, setLeyendo] = React.useState<string | null>(null);

    const obras: PublicacionConOrigen[] = React.useMemo(() => {
        const delLienzo = (red.datos?.publicaciones ?? []).filter((p) => (p.area ?? '').toLowerCase() === 'cultura').map((p) => ({ ...vistaDeRed(p), tipo: 'obra', etiqueta: 'Lienzo' }));
        return [...(cafe.datos ?? []).map(vistaDeCafe), ...delLienzo].sort((a, b) => b.ms - a.ms);
    }, [cafe.datos, red.datos]);

    const tipos = React.useMemo(() => {
        const m = new Map<string, number>();
        for (const o of obras) m.set(o.tipo ?? 'obra', (m.get(o.tipo ?? 'obra') ?? 0) + 1);
        return [...m.entries()].sort((a, b) => b[1] - a[1]);
    }, [obras]);
    const visibles = tipo === 'todo' ? obras : obras.filter((o) => (o.tipo ?? 'obra') === tipo);

    const ambasFallan = !!cafe.fallo && !!red.fallo && !cafe.datos && !red.datos;
    const cargando = cafe.cargando && !cafe.fallo && !cafe.detenida;
    const estado = estadoSocial({ cargando, hayDatos: obras.length > 0, error: ambasFallan ? new Error(cafe.fallo?.message || 'fuente') : undefined });
    const recargar = () => { cafe.recargar(); red.recargar(); };

    const abrir = (p: PublicacionVista) => setLeyendo(p.id);
    const accionesDe = (p: PublicacionConOrigen): AccionesPublicacion => (p.origen === 'red'
        ? { onResonar: resonar, onGuardar: guardar, guardadas, etiquetaGuardar: 'Guardar en tu biblioteca' }
        : { onAbrir: abrir });
    const lectura = leyendo ? obras.find((o) => o.id === leyendo) ?? null : null;

    return (
        <div ref={refRaiz} className="h-full w-full">
            <MarcoSocial
                titulo="Corriente Cultural"
                subtitulo={`${formatoNumero(obras.length)} creaciones · ${tipos.length} ${tipos.length === 1 ? 'tipo' : 'tipos'}`}
                icono={Palette}
                categoria="cultura"
                acento={ACENTO}
                estado={estado}
                error={ambasFallan ? new Error(cafe.fallo?.message || 'fuente') : undefined}
                onReintentar={recargar}
                esqueleto="rejilla"
                vacio={{ icono: Palette, mensaje: 'Las obras, recetas y propuestas de la comunidad aparecen aquí en cuanto alguien las comparte.', accion: { etiqueta: 'Compartir una obra', href: '/publicar?area=cultura' } }}
                acciones={(t) => (
                    <>
                        <BotonActualizar onClick={recargar} actualizando={cafe.actualizando || red.actualizando} actualizado={Math.max(cafe.actualizado, red.actualizado)} acento={t.acento} tactil={t.tactil} />
                        <BotonIcono icono={PenSquare} etiqueta="Compartir una obra" href="/publicar?area=cultura" acento={t.acento} tactil={t.tactil} />
                    </>
                )}
            >
                {(t) => {
                    if (lectura && t.base !== 'micro' && t.base !== 's') {
                        return (
                            <LectorPublicacion p={lectura} acento={t.acento} tactil={t.tactil} onCerrar={() => setLeyendo(null)} acciones={accionesDe(lectura)}
                                pie={<Link href="/network/culture" className="cursor-pointer text-[11.5px] font-semibold hover:underline" style={{ color: tintaDe(t.acento) }}>Ir a Cultura</Link>} />
                        );
                    }
                    const ultima = obras[0];
                    if (t.base === 'micro') {
                        return <Lamina p={ultima} t={t} onAbrir={undefined} compacta />;
                    }
                    if (t.base === 's') {
                        return <Lamina p={ultima} t={t} onAbrir={undefined} />;
                    }
                    const filtro = tipos.length > 1 ? (
                        <Segmentos<string> etiqueta="Tipo de creación" acento={t.acento} tactil={t.tactil} valor={tipo} onCambio={setTipo}
                            opciones={[{ id: 'todo', etiqueta: 'Todo', n: obras.length }, ...tipos.slice(0, t.base === 'l' ? 3 : 5).map(([k, n]) => ({ id: k, etiqueta: tipoCreacion(k).etiqueta, n, icono: iconoTipo(k) }))]} />
                    ) : null;

                    if (t.clase === 'panoramico') {
                        const alto = Math.max(80, t.alto - (filtro && t.alto >= 200 ? 40 : 0));
                        const cols = columnasQueCaben(t.ancho, Math.max(150, alto * 0.78), 2, 7);
                        return (
                            <div className="flex h-full min-h-0 flex-col gap-2">
                                {t.alto >= 200 && filtro}
                                <ul className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }} aria-label="Exposición">
                                    {visibles.slice(0, cols).map((o, i) => (
                                        <li key={o.id} className={cn('min-h-0', estilos.aparece)} style={{ animationDelay: `${i * 50}ms` }}>
                                            <Lamina p={o} t={t} onAbrir={o.origen === 'cafe' ? abrir : undefined} />
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        );
                    }
                    if (t.base === 'xl') {
                        const portada = visibles.find((o) => o.media) ?? visibles[0];
                        const resto = visibles.filter((o) => o.id !== portada?.id);
                        return (
                            <div className="flex h-full min-h-0 flex-col gap-2.5">
                                {filtro}
                                {portada ? (
                                    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-3">
                                        <PortadaPublicacion p={portada} acento={t.acento} tactil={t.tactil} acciones={accionesDe(portada)} />
                                        <Sala t={t} obras={resto} cols={2} filas={2} abrir={abrir} />
                                    </div>
                                ) : <Pastilla acento={t.acento} onClick={() => setTipo('todo')} tactil={t.tactil}>Ver todo</Pastilla>}
                            </div>
                        );
                    }
                    if (t.clase === 'torre') {
                        return <Sala t={t} obras={visibles} cols={1} filas={Math.max(2, Math.floor(t.alto / 150))} abrir={abrir} />;
                    }
                    if (t.base === 'l') {
                        return (
                            <div className="flex h-full min-h-0 flex-col gap-2">
                                {filtro}
                                <Sala t={t} obras={visibles} cols={columnasQueCaben(t.ancho, 150, 2, 4)} filas={1} abrir={abrir} />
                            </div>
                        );
                    }
                    return <Sala t={t} obras={obras} cols={2} filas={2} abrir={abrir} />;
                }}
            </MarcoSocial>
        </div>
    );
}

// ── La sala: rejilla de láminas ─────────────────────────────────────

function Sala({ t, obras, cols, filas, abrir }: { t: TamanoSocial; obras: PublicacionConOrigen[]; cols: number; filas: number; abrir: (p: PublicacionVista) => void }) {
    if (obras.length === 0) return <p role="status" className="grid flex-1 place-items-center text-[12px] text-white/55">Nada de este tipo todavía.</p>;
    return (
        <ul className="grid min-h-0 flex-1 auto-rows-fr gap-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }} aria-label="Obras">
            {obras.slice(0, cols * filas).map((o, i) => (
                <li key={o.id} className={cn('min-h-0', estilos.aparece)} style={{ animationDelay: `${i * 50}ms` }}>
                    <Lamina p={o} t={t} onAbrir={o.origen === 'cafe' ? abrir : undefined} />
                </li>
            ))}
        </ul>
    );
}

/** Una obra como lámina: su imagen (o su emblema de tipo) con la autoría y las señales encima. */
function Lamina({ p, t, onAbrir, compacta = false }: { p: PublicacionConOrigen; t: TamanoSocial; onAbrir?: (p: PublicacionVista) => void; compacta?: boolean }) {
    const Icono = iconoTipo(p.tipo);
    const color = p.colorEtiqueta ?? t.acento;
    return (
        <Abrir p={p} onAbrir={onAbrir} etiqueta={`${p.etiqueta ?? 'Obra'} de ${p.autor}: ${textoDe(p)}. ${p.reacciones} reacciones`}
            className={cn(estilos.tarjeta, 'relative block h-full w-full overflow-hidden rounded-[16px]')} style={{ minHeight: compacta ? 0 : 90 }}>
            {p.tipoMedia && p.media ? (
                <Miniatura url={p.media} icono={Icono} acento={color} semilla={p.id} className="absolute inset-0 size-full" redondeo={16} />
            ) : (
                <span aria-hidden className="absolute inset-0 grid place-items-center" style={{ background: `radial-gradient(110% 110% at 25% 20%, ${conAlfa(color, 0.45)}, ${conAlfa(color, 0.08)} 60%, rgba(12,14,34,.5))` }}>
                    <Icono className="size-[34%] max-h-12 max-w-12 text-white/75" strokeWidth={1.25} />
                </span>
            )}
            {!compacta && (
                <>
                    <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,9,24,0) 35%, rgba(8,9,24,.88) 100%)' }} />
                    <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full ss-redondo bg-black/40 px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-white/90">
                        <Heart className="size-3" aria-hidden />{formatoNumero(p.reacciones)}
                    </span>
                    <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-2.5">
                        <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: tintaDe(color) }}>{p.etiqueta ?? 'Obra'}</span>
                        <span className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-white">{recortar(p.titulo || p.texto || textoDe(p), 90)}</span>
                        <span className="truncate text-[10.5px] text-white/60">{p.autor}</span>
                    </span>
                </>
            )}
        </Abrir>
    );
}

export default CulturalFeedWidget;
