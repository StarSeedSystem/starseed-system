'use client';
/**
 * Mapa del clima (vista /atmosphere) — Ola 0929 · paquete A.
 *
 * Un mapa oscuro con nombres (OpenStreetMap · CARTO, con su atribución visible, como piden sus
 * licencias) y tres capas REALES, sin claves:
 *   · Lluvia → radar de RainViewer con sus colores de verdad (antes se giraba el tono y la
 *     leyenda no cuadraba) y, si lo pides, las últimas 2 h en movimiento o foto a foto.
 *   · Temperatura y Viento → una rejilla de 25 puntos de Open-Meteo alrededor de tu sitio (una
 *     sola petición, compartida 30 min), con la cifra en tus unidades y la flecha hacia donde
 *     sopla. Sustituye a unas teselas de OpenWeatherMap que llevaban una clave en el código.
 * Panel con la capa, su hora, su leyenda y un resumen en texto (lo que el mapa no dice a un
 * lector de pantalla); «Volver a mi sitio». Sin peticiones con la pestaña oculta; el pulso del
 * sitio y el vuelo se quedan quietos en eco o sin movimiento.
 */
import * as React from 'react';
import { MapContainer, Marker, TileLayer, ZoomControl, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { CloudRain, Crosshair, Map as IconoMapa, Pause, Play, RefreshCw, Thermometer, Wind, type LucideIcon } from 'lucide-react';
import { centroRejilla, fuenteRadar, fuenteRejilla, rumboHacia, urlTeselaRadar, type PuntoRejilla } from '@/modules/weather/datos/mapa';
import { aTemp, aViento, ETIQUETA_VIENTO, formateadores, useEnPantalla, useFuente, useUbicacionClima, useUnidades, type Unidades } from '@/modules/weather/datos/hooks';
import { colorTemperatura, procedencia } from '@/modules/weather/datos/interpretar';
import { useNivelRender } from '@/lib/widgets/forma/nivel-dispositivo';
import { dispositivoActual } from '@/lib/widgets/forma/tamanos';
import css from './mapa-clima.module.css';

type Capa = 'precipitation' | 'temperature' | 'wind' | 'ninguna';
const CAPAS: { id: Exclude<Capa, 'ninguna'>; etiqueta: string; icono: LucideIcon }[] = [
    { id: 'precipitation', etiqueta: 'Lluvia', icono: CloudRain },
    { id: 'temperature', etiqueta: 'Temperatura', icono: Thermometer },
    { id: 'wind', etiqueta: 'Viento', icono: Wind },
];
const ACENTO = '#38bdf8';
const GRADIENTE_RADAR = 'linear-gradient(90deg,#7dd3fc,#22c55e,#facc15,#f97316,#ef4444,#d946ef)';
const PARADAS_TEMP = [-10, 0, 10, 20, 30, 40];

function capaDe(v: string | undefined): Capa {
    return v === 'precipitation' || v === 'temperature' || v === 'wind' ? v : 'ninguna';
}

/** Lleva el mapa a tu sitio (sin vuelo si no hay movimiento). */
function Volar({ lat, lon, senal, suave }: { lat: number; lon: number; senal: number; suave: boolean }) {
    const map = useMap();
    React.useEffect(() => {
        const zoom = Math.max(map.getZoom?.() ?? 7, 6);
        if (suave) map.flyTo([lat, lon], zoom, { duration: 1.2 });
        else map.setView([lat, lon], zoom);
    }, [lat, lon, senal, suave, map]);
    return null;
}

// ── Iconos (HTML construido SOLO con números y colores propios) ───────

function iconoTemperatura(p: PuntoRejilla, u: Unidades): L.DivIcon | null {
    if (p.temp === null) return null;
    const v = Math.round(aTemp(p.temp, u.temp));
    return L.divIcon({ className: css.icono, iconSize: [40, 22], iconAnchor: [20, 11], html: `<span class="${css.chip}" style="background:${colorTemperatura(p.temp)}">${v}°</span>` });
}

function iconoViento(p: PuntoRejilla, u: Unidades): L.DivIcon | null {
    const hacia = rumboHacia(p.dir);
    if (hacia === null || p.viento === null) return null;
    const v = Math.round(aViento(p.viento, u.viento));
    const color = p.viento >= 50 ? '#fb923c' : p.viento >= 30 ? '#fbbf24' : '#5eead4';
    return L.divIcon({
        className: css.icono, iconSize: [36, 40], iconAnchor: [18, 20],
        html: `<span class="${css.viento}"><svg class="${css.flecha}" viewBox="0 0 24 24" style="transform:rotate(${Math.round(hacia)}deg)"><path d="M12 2 L18 14 L13 12 L13 22 L11 22 L11 12 L6 14 Z" fill="${color}" stroke="#0a0d22" stroke-width="0.8"/></svg>${v}</span>`,
    });
}

// ── Mapa ──────────────────────────────────────────────────────────────

export default function ClimateMapInternal({ activeOverlay }: { activeOverlay?: string }) {
    const ref = React.useRef<HTMLDivElement>(null);
    const visible = useEnPantalla(ref);
    const nivel = useNivelRender();
    const [dispositivo, setDispositivo] = React.useState('escritorio');
    const [tactil, setTactil] = React.useState(false);
    const [suave, setSuave] = React.useState(false);
    React.useEffect(() => {
        setDispositivo(dispositivoActual());
        try {
            setTactil(window.matchMedia('(pointer: coarse)').matches);
            const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.perf === 'eco';
            setSuave(!quieto);
        } catch { /* sin matchMedia */ }
    }, []);
    const animar = nivel !== 'ligero' && suave;

    // La capa: la elige la vista (sus botones) o este panel; la vista manda cuando cambia. Al abrir
    // sin capa elegida se enseña la lluvia; si luego la vista la apaga (undefined), queda sin capa.
    const [capa, setCapa] = React.useState<Capa>(() => (activeOverlay === undefined ? 'precipitation' : capaDe(activeOverlay)));
    const primera = React.useRef(true);
    React.useEffect(() => {
        if (primera.current) { primera.current = false; return; }
        setCapa(capaDe(activeOverlay));
    }, [activeOverlay]);

    const { ubicacion, usarMia } = useUbicacionClima();
    const lat = ubicacion?.lat ?? 40.42, lon = ubicacion?.lon ?? -3.7;
    const [u] = useUnidades();
    const fmt = React.useMemo(() => formateadores(ubicacion?.zona), [ubicacion?.zona]);
    const [senal, setSenal] = React.useState(0);

    const radar = useFuente(fuenteRadar, 'global', visible && capa === 'precipitation');
    const centro = React.useMemo(() => centroRejilla(lat, lon), [lat, lon]);
    const conRejilla = capa === 'temperature' || capa === 'wind';
    // Sin sitio conocido no se pide la rejilla (ni una de «por defecto» que luego se tira).
    const rejilla = useFuente(fuenteRejilla, conRejilla && ubicacion ? centro : null, visible && conRejilla);

    // Radar en movimiento: solo si lo pides, solo en pantalla, una pasada.
    const fotos = radar.datos?.fotos ?? [];
    const [indice, setIndice] = React.useState<number | null>(null);
    const [reproduciendo, setReproduciendo] = React.useState(false);
    const actual = indice === null ? fotos.length - 1 : Math.min(indice, fotos.length - 1);
    React.useEffect(() => {
        if (!reproduciendo || !visible || fotos.length < 2) return;
        const id = window.setInterval(() => {
            setIndice((i) => {
                const sig = (i ?? -1) + 1;
                if (sig >= fotos.length) { setReproduciendo(false); return null; }
                return sig;
            });
        }, 700);
        return () => window.clearInterval(id);
    }, [reproduciendo, visible, fotos.length]);
    React.useEffect(() => { if (capa !== 'precipitation') { setReproduciendo(false); setIndice(null); } }, [capa]);

    const foto = fotos[actual] ?? null;
    const iconos = React.useMemo(() => {
        if (!rejilla.datos || !conRejilla) return [];
        return rejilla.datos
            .map((p) => ({ p, icono: capa === 'temperature' ? iconoTemperatura(p, u) : iconoViento(p, u) }))
            .filter((x): x is { p: PuntoRejilla; icono: L.DivIcon } => x.icono !== null);
    }, [rejilla.datos, conRejilla, capa, u]);
    const iconoSitio = React.useMemo(() => L.divIcon({ className: css.icono, iconSize: [18, 18], iconAnchor: [9, 9], html: `<span class="${css.sitio}" style="--acento:${ACENTO}"></span>` }), []);

    return (
        <div ref={ref} className={css.mapa} aria-label="Mapa del clima" data-animar={animar ? 'si' : 'no'} data-pausa={visible ? 'no' : 'si'} data-dispositivo={dispositivo}>
            <MapContainer center={[lat, lon]} zoom={7} minZoom={3} maxZoom={11} zoomControl={false} worldCopyJump style={{ height: '100%', width: '100%' }}>
                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> · &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>' />
                {capa === 'precipitation' && radar.datos && foto && (
                    <TileLayer url={urlTeselaRadar(radar.datos, foto)} opacity={0.72} zIndex={10} maxNativeZoom={7}
                        attribution='Radar: <a href="https://www.rainviewer.com" target="_blank" rel="noopener noreferrer">RainViewer</a>' />
                )}
                {iconos.map(({ p, icono }) => (
                    <Marker key={`${capa}-${p.lat},${p.lon}`} position={[p.lat, p.lon]} icon={icono} interactive={false} keyboard={false} />
                ))}
                {ubicacion && <Marker position={[lat, lon]} icon={iconoSitio} title={ubicacion.nombre} keyboard={false} />}
                {ubicacion && <Volar lat={lat} lon={lon} senal={senal} suave={animar} />}
                <ZoomControl position="bottomright" zoomInTitle="Acercar" zoomOutTitle="Alejar" />
            </MapContainer>

            <Panel capa={capa} alElegir={setCapa} tactil={tactil} lugar={ubicacion?.nombre ?? null} elegida={!!ubicacion?.elegida}
                radar={{ ...radar, fotos, actual, reproduciendo, alReproducir: () => { if (reproduciendo) setReproduciendo(false); else { setIndice(0); setReproduciendo(true); } }, alElegirFoto: (i) => { setReproduciendo(false); setIndice(i >= fotos.length - 1 ? null : i); } }}
                rejilla={rejilla} u={u} hora={fmt.hora} sinSitio={!ubicacion} alUsarMiSitio={() => { void usarMia().catch(() => undefined); }} />

            <button type="button" onClick={() => setSenal((n) => n + 1)} aria-label="Volver a mi sitio" title="Volver a mi sitio"
                className={`${css.foco} ss-redondo absolute bottom-6 left-3 z-[500] inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#0a0d22]/85 px-3.5 text-[12px] font-semibold text-white shadow-xl ring-1 ring-white/10 backdrop-blur-md transition-transform duration-200 hover:scale-[1.04] ${tactil ? 'min-h-11' : 'min-h-9'}`}>
                <Crosshair aria-hidden className="size-4 text-sky-300" />
                Volver a mi sitio
            </button>
        </div>
    );
}

// ── Panel: capa, hora, leyenda y resumen ──────────────────────────────

interface EstadoRadar {
    datos: { fotos: { t: number }[] } | null; error: string | null; en: number | null; refrescar: () => void;
    fotos: { t: number }[]; actual: number; reproduciendo: boolean; alReproducir: () => void; alElegirFoto: (i: number) => void;
}

function Panel({ capa, alElegir, tactil, lugar, elegida, radar, rejilla, u, hora, sinSitio, alUsarMiSitio }: {
    capa: Capa; alElegir: (c: Capa) => void; tactil: boolean; lugar: string | null; elegida: boolean;
    radar: EstadoRadar; rejilla: { datos: PuntoRejilla[] | null; error: string | null; en: number | null; refrescar: () => void };
    u: Unidades; hora: (t: number) => string; sinSitio: boolean; alUsarMiSitio: () => void;
}) {
    const boton = `${css.foco} flex min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-2 text-[12px] font-semibold transition-colors duration-150 ${tactil ? 'min-h-11' : 'min-h-8'}`;
    return (
        <section aria-label="Capas del mapa del clima"
            className="absolute left-3 top-3 z-[500] flex w-[min(21rem,calc(100%-1.5rem))] flex-col gap-2.5 rounded-2xl bg-[#0a0d22]/85 p-3 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-md">
            <div className="flex min-w-0 items-center gap-2">
                <IconoMapa aria-hidden className="size-4 shrink-0 text-sky-300" />
                <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/65">Mapa del clima</p>
                    {lugar && <p className="truncate text-[12px] text-white/80" title={lugar}>{lugar}{elegida ? '' : ' · por defecto'}</p>}
                </div>
            </div>
            <div role="group" aria-label="Capa del mapa" className="grid grid-cols-3 gap-1 rounded-2xl bg-white/[0.06] p-1">
                {CAPAS.map((c) => {
                    const activa = capa === c.id;
                    return (
                        <button key={c.id} type="button" aria-pressed={activa} onClick={() => alElegir(activa ? 'ninguna' : c.id)}
                            className={`${boton} ${activa ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white'}`}>
                            <c.icono aria-hidden className="size-3.5 shrink-0" />
                            <span className="truncate">{c.etiqueta}</span>
                        </button>
                    );
                })}
            </div>
            {capa === 'precipitation' && <PanelRadar radar={radar} hora={hora} tactil={tactil} />}
            {(capa === 'temperature' || capa === 'wind') && (sinSitio ? (
                <div className="flex items-center justify-between gap-2 text-[12px] text-white/75">
                    <span>Elige tu sitio para ver los 25 puntos de alrededor.</span>
                    <button type="button" onClick={alUsarMiSitio} className={`${css.foco} ss-redondo inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full bg-white/10 px-3 font-semibold text-white hover:bg-white/15 ${tactil ? 'min-h-11' : 'min-h-8'}`}>
                        <Crosshair aria-hidden className="size-3.5" />Usar mi ubicación
                    </button>
                </div>
            ) : <PanelRejilla capa={capa} rejilla={rejilla} u={u} hora={hora} />)}
            {capa === 'ninguna' && <p className="text-[12px] text-white/60">Sin capa: elige lluvia, temperatura o viento.</p>}
        </section>
    );
}

function Estado({ error, onReintentar, cargando }: { error: string | null; onReintentar: () => void; cargando: string }) {
    if (!error) return <p role="status" className="text-[12px] text-white/65">{cargando}</p>;
    return (
        <div role="alert" className="flex items-center justify-between gap-2 text-[12px] text-amber-200/90">
            <span className="min-w-0">{error}</span>
            <button type="button" onClick={onReintentar} className={`${css.foco} ss-redondo inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-1 rounded-full bg-white/10 px-3 font-semibold text-white hover:bg-white/15`}>
                <RefreshCw aria-hidden className="size-3.5" />Reintentar
            </button>
        </div>
    );
}

function PanelRadar({ radar, hora, tactil }: { radar: EstadoRadar; hora: (t: number) => string; tactil: boolean }) {
    if (!radar.datos) return <Estado error={radar.error ? `RainViewer: ${radar.error.toLowerCase()}` : null} onReintentar={radar.refrescar} cargando="Leyendo el radar…" />;
    const f = radar.fotos[radar.actual];
    const ultima = radar.actual === radar.fotos.length - 1;
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <button type="button" onClick={radar.alReproducir} aria-pressed={radar.reproduciendo}
                    aria-label={radar.reproduciendo ? 'Pausar el radar' : 'Ver las últimas 2 horas del radar'}
                    className={`${css.foco} ss-redondo grid shrink-0 cursor-pointer place-items-center rounded-full bg-sky-400/20 text-white ring-1 ring-sky-300/40 transition-transform duration-200 hover:scale-105 ${tactil ? 'size-11' : 'size-8'}`}>
                    {radar.reproduciendo ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
                </button>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold tabular-nums">{f ? `Radar de las ${hora(f.t)}` : 'Radar'}{ultima ? ' · el último' : ''}</p>
                    <input type="range" min={0} max={Math.max(0, radar.fotos.length - 1)} value={radar.actual} onChange={(e) => radar.alElegirFoto(Number(e.target.value))}
                        aria-label="Hora del radar" aria-valuetext={f ? hora(f.t) : undefined} className="w-full cursor-pointer accent-sky-400" />
                </div>
            </div>
            <div aria-hidden className="h-2 w-full rounded-full" style={{ background: GRADIENTE_RADAR }} />
            <div className="flex justify-between text-[10px] text-white/55"><span>Débil</span><span>Moderada</span><span>Fuerte</span></div>
            <p className="text-[10px] text-white/45">RainViewer · radar de las últimas 2 h, cada 10 min</p>
        </div>
    );
}

export function resumenRejilla(puntos: PuntoRejilla[], capa: 'temperature' | 'wind', u: Unidades): string | null {
    const centro = puntos[Math.floor(puntos.length / 2)];
    if (capa === 'temperature') {
        const t = puntos.map((p) => p.temp).filter((v): v is number => v !== null);
        if (!t.length) return null;
        const g = (c: number) => `${Math.round(aTemp(c, u.temp))}°`;
        return `De ${g(Math.min(...t))} a ${g(Math.max(...t))} a unos 150 km a la redonda${centro?.temp != null ? `; en tu zona, ${g(centro.temp)}` : ''}.`;
    }
    const v = puntos.map((p) => p.viento).filter((x): x is number => x !== null);
    if (!v.length) return null;
    const k = (x: number) => Math.round(aViento(x, u.viento));
    return `Viento de ${k(Math.min(...v))} a ${k(Math.max(...v))} ${ETIQUETA_VIENTO[u.viento]}${centro?.dir != null ? `; en tu zona sopla ${procedencia(centro.dir)}` : ''}.`;
}

function PanelRejilla({ capa, rejilla, u, hora }: { capa: 'temperature' | 'wind'; rejilla: { datos: PuntoRejilla[] | null; error: string | null; en: number | null; refrescar: () => void }; u: Unidades; hora: (t: number) => string }) {
    if (!rejilla.datos) return <Estado error={rejilla.error ? `Open-Meteo: ${rejilla.error.toLowerCase()}` : null} onReintentar={rejilla.refrescar} cargando="Leyendo 25 puntos alrededor de ti…" />;
    const resumen = resumenRejilla(rejilla.datos, capa, u);
    return (
        <div className="flex flex-col gap-2">
            {resumen && <p className="text-[12px] leading-snug text-white/85">{resumen}</p>}
            {capa === 'temperature' ? (
                <>
                    <div aria-hidden className="h-2 w-full rounded-full" style={{ background: `linear-gradient(90deg,${PARADAS_TEMP.map((c) => colorTemperatura(c)).join(',')})` }} />
                    <div className="flex justify-between text-[10px] tabular-nums text-white/55">{PARADAS_TEMP.map((c) => <span key={c}>{Math.round(aTemp(c, u.temp))}°</span>)}</div>
                </>
            ) : (
                <p className="text-[11px] text-white/60">La flecha apunta hacia donde sopla; la cifra, en {ETIQUETA_VIENTO[u.viento]}.</p>
            )}
            <p className="text-[10px] text-white/45">Open-Meteo · 25 puntos{rejilla.en ? ` · ${hora(rejilla.en)}` : ''}</p>
        </div>
    );
}
