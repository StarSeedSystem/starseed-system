'use client';

// ════════════════════════════════════════════════════════════════
// MapWidget — tu mapa: dónde estás y qué hay de la red cerca (Ola 0929 · paquete E)
// ----------------------------------------------------------------
// Mapa REAL (Leaflet 1.9.4 por CDN, el mismo cargador que el mapa del Hub) con tu
// ubicación y solo lugares y eventos de la red CON coordenadas reales (páginas,
// grupos y eventos de Supabase). Antes rellenaba el mapa con eventos de muestra
// repartidos en círculo alrededor de ti y con una ubicación inventada: ya no.
// Honesto con la ubicación: si nunca elegiste una, se dice («ubicación por defecto»)
// y un toque en «Usar mi ubicación» la pide al navegador (solo con tu gesto).
// Seguridad: las fichas de los marcadores se construyen con nodos de texto, nunca con
// HTML que venga de la red.
// Tráfico: los puntos se leen una vez y se comparten 15 min (las páginas, con la
// misma caché que «Proyectos de la red»), solo con el widget a la vista.
// Composición: micro = cuántos lugares hay cerca · s = tu sitio y el más cercano ·
// m = mapa · l = mapa + capas + lista corta · xl = mapa + lista con distancias ·
// panorámico = mapa ancho con la lista al lado · torre = mapa arriba y lista.
// Estados: cargando (el mapa o los puntos), vacío (nada con coordenadas cerca: se dice
// y se invita a crear), error (sin conexión al mapa: reintentar).
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, LocateFixed, Calendar, Users, Building2, ArrowUpRight, Map as MapIcon, Loader2, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { conAlfa } from '@/components/widgets-libres/acentos-categoria';
import { useWeatherLocationOpcional } from '@/modules/weather/context/weather-location-context';
import { loadLeaflet, type LeafletNS } from '@/lib/map/leaflet-loader';
import { BASE_LAYER_BY_ID } from '@/lib/map/map-config';
import { useLienzoE, px } from './paquete-e/lienzo';
import { BotonE, EncabezadoE, EnlaceE, RaizE, SelloE, estilosE, tintaE } from './paquete-e/piezas';
import { TTL_EXTERNO_MS, useCacheadoE } from './paquete-e/cache';
import { cargarPuntosRed, type PuntoRed } from './paquete-e/red';
import { formatearDistancia, ordenarPorCercania } from './paquete-e/geo';

const RUTA_MAPA = '/hub/mapa';
const CLAVE_PUNTOS = 'red-puntos-v1';
const CLAVE_UBICACION = 'starseed_weather_location';
const RADIO_CERCA_KM = 50;

type Tipo = PuntoRed['tipo'];
const TIPOS: { id: Tipo; etiqueta: string; color: string; icono: typeof Calendar }[] = [
    { id: 'evento', etiqueta: 'Eventos', color: '#39ff14', icono: Calendar },
    { id: 'comunidad', etiqueta: 'Comunidades', color: '#ffbf00', icono: Building2 },
    { id: 'grupo', etiqueta: 'Grupos', color: '#a855f7', icono: Users },
];
const COLOR: Record<Tipo, string> = { evento: '#39ff14', comunidad: '#ffbf00', grupo: '#a855f7' };

function iconoPunto(L: LeafletNS, color: string, lado = 14) {
    // Solo colores de la tabla de arriba: ningún dato de la red entra en este HTML.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${lado} ${lado}"><circle cx="${lado / 2}" cy="${lado / 2}" r="${lado / 2 - 2}" fill="${color}" fill-opacity=".9" stroke="#fff" stroke-width="1.5"/></svg>`;
    return L.divIcon({ html: svg, className: '', iconSize: [lado, lado], iconAnchor: [lado / 2, lado / 2], popupAnchor: [0, -lado / 2 - 2] });
}

function iconoYo(L: LeafletNS) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#14b8a6" fill-opacity=".25"/><circle cx="12" cy="12" r="6" fill="#14b8a6" stroke="#fff" stroke-width="2"/></svg>';
    return L.divIcon({ html: svg, className: '', iconSize: [24, 24], iconAnchor: [12, 12] });
}

/** Ficha del marcador construida con nodos (textContent): nada de HTML ajeno. */
function fichaDe(p: PuntoRed & { km?: number }): HTMLElement {
    const div = document.createElement('div');
    div.style.minWidth = '160px';
    const b = document.createElement('b');
    b.textContent = p.nombre;
    b.style.color = COLOR[p.tipo];
    b.style.fontSize = '13px';
    const s = document.createElement('div');
    s.textContent = [p.detalle, typeof p.km === 'number' ? formatearDistancia(p.km) : ''].filter(Boolean).join(' · ');
    s.style.fontSize = '11px';
    s.style.opacity = '.75';
    const a = document.createElement('a');
    a.href = p.href.startsWith('/') ? p.href : '/hub';
    a.textContent = 'Ver ficha';
    a.style.fontSize = '11px';
    a.style.color = COLOR[p.tipo];
    div.append(b, s, a);
    return div;
}

export function MapWidget() {
    const { ref, lienzo } = useLienzoE();
    const ubic = useWeatherLocationOpcional();
    const [porDefecto, setPorDefecto] = useState(true);
    const [pidiendo, setPidiendo] = useState(false);
    const [avisoUbic, setAvisoUbic] = useState<string | null>(null);
    const [estadoMapa, setEstadoMapa] = useState<'cargando' | 'listo' | 'error'>('cargando');
    const [capas, setCapas] = useState<Set<Tipo>>(new Set(['evento', 'comunidad', 'grupo']));
    const [oscuro, setOscuro] = useState(true);
    const [intento, setIntento] = useState(0);
    const { datos: puntos, cargando, error, recargar } = useCacheadoE<PuntoRed[]>(CLAVE_PUNTOS, cargarPuntosRed, { ttlMs: TTL_EXTERNO_MS, visible: lienzo.visible });

    const loc = ubic?.location ?? null;
    useEffect(() => {
        try { setPorDefecto(!window.localStorage.getItem(CLAVE_UBICACION)); } catch { setPorDefecto(true); }
    }, [loc?.lat, loc?.lon]);

    const cerca = useMemo(() => (loc && puntos ? ordenarPorCercania(puntos, { lat: loc.lat, lng: loc.lon }) : []), [loc, puntos]);
    const visibles = cerca.filter((p) => capas.has(p.tipo));
    const enRadio = cerca.filter((p) => p.km <= RADIO_CERCA_KM);

    const usarMiUbicacion = async () => {
        if (!ubic) return;
        setPidiendo(true);
        setAvisoUbic(null);
        try { await ubic.requestGeolocation(); setPorDefecto(false); }
        catch { setAvisoUbic('No se pudo leer tu ubicación: revisa el permiso del navegador.'); }
        finally { setPidiendo(false); }
    };

    // ── Leaflet (solo desde «m») ──
    const { base, clase, horizontal } = lienzo;
    const conMapa = base !== 'micro' && base !== 's';
    const contenedor = useRef<HTMLDivElement>(null);
    const mapa = useRef<LeafletNS | null>(null);
    const L = useRef<LeafletNS | null>(null);
    const grupo = useRef<LeafletNS | null>(null);
    const yo = useRef<LeafletNS | null>(null);
    const fondo = useRef<LeafletNS | null>(null);

    useEffect(() => {
        if (!conMapa || !loc) return;
        let vivo = true;
        setEstadoMapa('cargando');
        loadLeaflet().then((Lns) => {
            if (!vivo || !contenedor.current || mapa.current) return;
            L.current = Lns;
            const quieto = lienzo.nivel === 'ligero';
            const m = Lns.map(contenedor.current, { center: [loc.lat, loc.lon], zoom: 12, zoomControl: base === 'l' || base === 'xl', attributionControl: true, zoomAnimation: !quieto, fadeAnimation: !quieto, markerZoomAnimation: !quieto });
            grupo.current = Lns.layerGroup().addTo(m);
            yo.current = Lns.marker([loc.lat, loc.lon], { icon: iconoYo(Lns), keyboard: false }).addTo(m);
            mapa.current = m;
            setEstadoMapa('listo');
            window.setTimeout(() => { try { m.invalidateSize(); } catch { /* desmontado */ } }, 200);
        }).catch(() => { if (vivo) setEstadoMapa('error'); });
        return () => {
            vivo = false;
            try { mapa.current?.remove(); } catch { /* ya retirado */ }
            mapa.current = null; grupo.current = null; yo.current = null; fondo.current = null;
        };
        // El mapa se crea una vez por montaje (y al reintentar); centro y capas se actualizan abajo.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conMapa, !!loc, intento]);

    // Capa base (oscura a juego con el OS, o la estándar de OSM).
    useEffect(() => {
        const m = mapa.current, Lns = L.current;
        if (!m || !Lns || estadoMapa !== 'listo') return;
        const def = BASE_LAYER_BY_ID[oscuro ? 'oscuro' : 'osm'];
        try { fondo.current?.remove(); } catch { /* sin capa previa */ }
        fondo.current = Lns.tileLayer(def.url, { maxZoom: def.maxZoom, attribution: def.attribution, ...(def.subdomains ? { subdomains: def.subdomains } : {}) }).addTo(m);
    }, [oscuro, estadoMapa]);

    // Centro y marcador propio.
    useEffect(() => {
        const m = mapa.current;
        if (!m || !loc) return;
        try { m.setView([loc.lat, loc.lon], m.getZoom() ?? 12); yo.current?.setLatLng([loc.lat, loc.lon]); } catch { /* mapa en transición */ }
    }, [loc?.lat, loc?.lon]);

    // Marcadores de la red (solo los tipos visibles).
    useEffect(() => {
        const g = grupo.current, Lns = L.current;
        if (!g || !Lns || estadoMapa !== 'listo') return;
        try {
            g.clearLayers();
            for (const p of visibles.slice(0, 300)) {
                Lns.marker([p.lat, p.lng], { icon: iconoPunto(Lns, COLOR[p.tipo], p.tipo === 'evento' ? 16 : 14), title: p.nombre, alt: p.nombre }).bindPopup(fichaDe(p)).addTo(g);
            }
        } catch { /* un marcador raro no rompe el resto */ }
    }, [visibles, estadoMapa]);

    useEffect(() => { try { mapa.current?.invalidateSize(); } catch { /* sin mapa */ } }, [lienzo.ancho, lienzo.alto]);

    const irA = useCallback((p: PuntoRed) => { try { mapa.current?.setView([p.lat, p.lng], 15); } catch { /* sin mapa */ } }, []);
    const alternarCapa = (t: Tipo) => setCapas((prev) => { const n = new Set(prev); if (n.has(t)) n.delete(t); else n.add(t); return n; });

    const tinta = tintaE(lienzo.acento);
    const nombreLugar = loc?.name ?? 'Sin ubicación';
    const raiz = { lienzo, refRaiz: ref, etiqueta: `Mapa: ${nombreLugar}${porDefecto ? ' (ubicación por defecto)' : ''}, ${enRadio.length} lugares de la red a menos de ${RADIO_CERCA_KM} km`, tipo: 'MAP_LOCATION' } as const;

    // En tarjetas estrechas las acciones de la cabecera pasan a icono (con su nombre en aria-label
    // y tooltip) y el sello se acorta: antes «Usar mi ubicación» y «Mapa» se salían por la derecha.
    const estrechaCab = (lienzo.ancho || 0) > 0 && (lienzo.ancho || 0) < (horizontal ? 620 : 460);
    const textoUbic = porDefecto ? 'Usar mi ubicación' : 'Recentrar';
    const botonUbic = ubic ? <BotonE lienzo={lienzo} variante={porDefecto ? 'primario' : 'fantasma'} compacto icono={pidiendo ? Loader2 : LocateFixed} disabled={pidiendo} onClick={() => void usarMiUbicacion()} etiqueta={textoUbic} title={textoUbic}>{estrechaCab ? undefined : textoUbic}</BotonE> : null;
    const selloUbic = porDefecto ? <SelloE title="Aún no elegiste ubicación: el OS usa una por defecto">{estrechaCab ? 'por defecto' : 'ubicación por defecto'}</SelloE> : null;

    // ── micro / s: sin mapa, el dato ──
    if (!conMapa) {
        const primero = cerca[0];
        return (
            <RaizE {...raiz}>
                <a href={RUTA_MAPA} className="flex h-full cursor-pointer flex-col items-center justify-center gap-1 p-1 text-center outline-none" title="Abrir el mapa de la red">
                    <MapPin aria-hidden className="size-5" style={{ color: tinta, filter: `drop-shadow(0 0 6px ${conAlfa(lienzo.acento, 0.7)})` }} />
                    {base === 'micro' ? (
                        <span className="tabular-nums text-white" style={{ fontSize: 22, fontWeight: 250 }}>{puntos ? enRadio.length : '—'}</span>
                    ) : (
                        <>
                            <span className="line-clamp-1 max-w-full text-[13px] font-semibold text-white">{nombreLugar}</span>
                            {porDefecto && <span className="text-[10px] uppercase tracking-[0.1em] text-amber-200/80">por defecto</span>}
                            <span className="line-clamp-2 text-[11px] text-white/60">
                                {!puntos ? (cargando ? 'Buscando lugares…' : 'Sin datos de la red') : primero ? `${primero.nombre} · ${formatearDistancia(primero.km)}` : 'Nada con coordenadas cerca'}
                            </span>
                        </>
                    )}
                </a>
            </RaizE>
        );
    }

    const lista = (max: number) => (
        <section aria-label="Cerca de ti" className="flex min-h-0 min-w-0 flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Cerca de ti</span>
            {!puntos ? (
                <p className="text-[12px] text-white/50">{cargando ? 'Cargando lugares de la red…' : error ? 'No se pudieron leer los lugares.' : ''}</p>
            ) : visibles.length === 0 ? (
                <p className="text-[12px] leading-snug text-white/55">Vacío por ahora: ninguna página, grupo o evento de la red tiene coordenadas {capas.size < 3 ? 'en estas capas' : 'todavía'}.</p>
            ) : (
                <ul className={cn('flex min-h-0 flex-col gap-0.5', estilosE.desliza)}>
                    {visibles.slice(0, max).map((p) => (
                        <li key={p.id} className="flex items-center gap-1">
                            <button type="button" onClick={() => irA(p)} title={`Ver ${p.nombre} en el mapa`} className="flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-xl px-2 text-left hover:bg-white/[0.05]">
                                <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: COLOR[p.tipo], boxShadow: `0 0 6px ${COLOR[p.tipo]}` }} />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[12px] text-white/90">{p.nombre}</span>
                                    <span className="block truncate text-[11px] text-white/45">{p.detalle}</span>
                                </span>
                                <span className="shrink-0 text-[11px] tabular-nums text-white/55">{formatearDistancia(p.km)}</span>
                            </button>
                            <a href={p.href} aria-label={`Abrir la ficha de ${p.nombre}`} className="ss-redondo grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"><ArrowUpRight className="size-3.5" /></a>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );

    const filtros = (
        <div role="group" aria-label="Capas del mapa" className="flex flex-wrap gap-1.5">
            {TIPOS.map((t) => {
                const on = capas.has(t.id);
                const n = cerca.filter((p) => p.tipo === t.id).length;
                return (
                    <button key={t.id} type="button" onClick={() => alternarCapa(t.id)} aria-pressed={on}
                        className="ss-redondo inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition-colors"
                        style={on ? { background: conAlfa(t.color, 0.18), boxShadow: `inset 0 0 0 1px ${conAlfa(t.color, 0.55)}`, color: '#fff' } : { background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.55)' }}>
                        <t.icono aria-hidden className="size-3.5" style={{ color: on ? t.color : undefined }} />{t.etiqueta}<span className="tabular-nums opacity-70">{n}</span>
                    </button>
                );
            })}
        </div>
    );

    const mapaEl = (
        <div className="relative min-h-[120px] min-w-0 flex-1 overflow-hidden rounded-[18px]" style={{ boxShadow: `inset 0 0 0 1px ${conAlfa(lienzo.acento, 0.2)}` }}>
            {loc ? <div ref={contenedor} className="absolute inset-0 z-0 [&_.leaflet-container]:!bg-[#0b0c1e]" aria-label={`Mapa centrado en ${nombreLugar}`} role="application" /> : null}
            {!loc && (
                <div className="absolute inset-0 grid place-items-center p-3 text-center text-[12px] text-white/60">Sin ubicación: elige una para ver el mapa.</div>
            )}
            {loc && estadoMapa === 'cargando' && (
                <div role="status" className="absolute inset-0 z-10 grid place-items-center bg-black/30 text-[12px] text-white/70">
                    <span className="inline-flex items-center gap-2"><Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />Preparando el mapa</span>
                </div>
            )}
            {estadoMapa === 'error' && (
                <div role="alert" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/50 p-3 text-center text-[12px] text-white/70">
                    No se pudo cargar el mapa (¿sin conexión?).
                    <BotonE lienzo={lienzo} compacto onClick={() => setIntento((x) => x + 1)}>Reintentar</BotonE>
                </div>
            )}
            {estadoMapa === 'listo' && (base === 'l' || base === 'xl' || horizontal) && (
                <div className="absolute right-2 top-2 z-[500]">
                    <BotonE lienzo={lienzo} variante="suave" compacto icono={oscuro ? Sun : Moon} etiqueta={oscuro ? 'Mapa claro (OpenStreetMap)' : 'Mapa oscuro'} onClick={() => setOscuro((v) => !v)} className="backdrop-blur-md" />
                </div>
            )}
        </div>
    );

    const cabecera = (
        <EncabezadoE lienzo={lienzo} icono={MapPin} titulo={nombreLugar} detalle={puntos ? `${enRadio.length} cerca` : undefined}
            acciones={<>{selloUbic}{botonUbic}<EnlaceE lienzo={lienzo} href={RUTA_MAPA} compacto variante="fantasma" icono={MapIcon} aria-label="Abrir el mapa completo" title="Abrir el mapa completo">{estrechaCab ? null : 'Mapa'}</EnlaceE></>} />
    );
    const pie = <>{avisoUbic && <p role="alert" className="text-[11px] text-amber-200">{avisoUbic}</p>}{error && !puntos && <p className="text-[11px] text-white/50">No se pudieron leer los lugares de la red. <button type="button" className="cursor-pointer underline" onClick={recargar}>Reintentar</button></p>}</>;

    if (horizontal) {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 gap-3 p-1">
                    <div className="flex min-h-0 min-w-0 flex-[3] flex-col gap-1.5">{cabecera}{mapaEl}</div>
                    <div className="flex min-h-0 min-w-0 flex-[2] flex-col gap-1.5">{filtros}{lista(8)}{pie}</div>
                </div>
            </RaizE>
        );
    }

    if (base === 'm' && clase !== 'torre') {
        return <RaizE {...raiz}><div className="flex h-full min-h-0 flex-col gap-1.5 p-1">{cabecera}{mapaEl}{pie}</div></RaizE>;
    }

    if (base === 'xl') {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 flex-col gap-1.5 p-1">
                    {cabecera}
                    <div className="flex min-h-0 flex-1 gap-3">
                        <div className="flex min-h-0 min-w-0 flex-[3] flex-col">{mapaEl}</div>
                        <div className="flex min-h-0 w-[36%] shrink-0 flex-col gap-2">{filtros}{lista(12)}</div>
                    </div>
                    {pie}
                </div>
            </RaizE>
        );
    }

    // l / torre
    return (
        <RaizE {...raiz}>
            <div className="flex h-full min-h-0 flex-col gap-1.5 p-1">
                {cabecera}
                {filtros}
                <div className="flex min-h-0 flex-[3] flex-col">{mapaEl}</div>
                <div className="min-h-0 flex-[2]">{lista(clase === 'torre' ? 8 : 3)}</div>
                {pie}
            </div>
        </RaizE>
    );
}

export default MapWidget;
