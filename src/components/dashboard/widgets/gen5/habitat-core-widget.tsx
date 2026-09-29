'use client';

// ════════════════════════════════════════════════════════════════
// HabitatCoreWidget — Núcleo del Hábitat (rediseño Ola 0929-C)
// ----------------------------------------------------------------
// Simbiosis con la casa, con datos reales:
// • Luz circadiana: qué luz pide el cuerpo ahora según la altura REAL
//   del Sol en tu lugar (calculada sin red) y cuándo cambia.
// • Ventilar: si conviene abrir, con el tiempo REAL de fuera (la
//   lectura compartida de Open-Meteo, 30 min, solo a la vista).
// • Tu casa: SOLO si conectaste tu Home Assistant en el Centro de
//   Control (Hogar): temperaturas, humedad, luces y enchufes, en solo
//   lectura, cada 5 min y a la vista. Sin él, no se inventa ninguna
//   habitación ni robot: vacío honesto con cómo conectarlo.
// Estados honestos: cargando, vacío y error (cada fuente dice el suyo).
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import { Home, Lightbulb, Plug, Thermometer, Wind, WindArrowDown } from "lucide-react";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { Lienzo, useIdSvg, useLienzo, type EstadoLienzo } from "./_catalogo/lienzo";
import { CargandoSilueta, tinta } from "./_catalogo/piezas";
import { horasDesde, useMeteo } from "./_catalogo/meteo";
import { useCompartido } from "./_catalogo/recurso";
import { analizarHa, consejoVentilar, haListo, leerHa, luzAhora, type ConfigHa, type Hogar, type LuzCircadiana } from "./habitat-core-partes";

async function traerHogar(c: ConfigHa): Promise<Hogar> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10_000);
    try {
        const res = await fetch(`${c.url!.replace(/\/+$/, "")}/api/states`, { headers: { Authorization: `Bearer ${c.token}` }, signal: ctl.signal });
        if (res.status === 401) throw new Error("Home Assistant rechazó el token (401)");
        if (!res.ok) throw new Error(`Home Assistant respondió ${res.status}`);
        return analizarHa(await res.json());
    } finally {
        clearTimeout(t);
    }
}

function Casa({ W, luz, altura, hora, luces, l }: { W: number; luz: LuzCircadiana | null; altura: number | null; hora: number; luces: number | null; l: EstadoLienzo }) {
    const id = useIdSvg("casa");
    const H = W * 0.9, cx = W / 2;
    const base = H * 0.95, ancho = W * 0.56, alto = H * 0.36, tejado = H * 0.2;
    const x0 = cx - ancho / 2, techo = base - alto;
    // El cielo sobre la casa: de izquierda a derecha, la hora del día (0–24 h); de abajo arriba,
    // la altura REAL del Sol (bajo el horizonte, el astro queda por debajo de la línea).
    const R = W * 0.44, cy = techo - tejado * 0.2;
    const noche = altura !== null && altura < 0;
    const sx = noche ? cx + R * 0.55 : cx - R + Math.min(1, Math.max(0, hora)) * 2 * R;
    const sy = noche ? cy - R * 0.45 : cy - (Math.min(90, altura ?? 0) / 90) * R * 0.75;
    const color = luz?.color ?? "#94a3b8";
    const dia = altura !== null && altura > -4;
    return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="block shrink-0 overflow-visible">
            <defs>
                <radialGradient id={`${id}-v`} cx="50%" cy="50%" r="60%">
                    <stop offset="0%" stopColor={color} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.35} />
                </radialGradient>
                <radialGradient id={`${id}-halo`} cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                </radialGradient>
            </defs>
            <line x1={cx - R} x2={cx + R} y1={cy} y2={cy} stroke="#fff" strokeOpacity={0.12} strokeDasharray="2 4" />
            {altura !== null && (
                <circle cx={sx} cy={sy} r={Math.max(4, W * 0.045)} fill={dia ? "#FFBF00" : "#e2e8f0"} opacity={dia ? 0.95 : 0.8}
                    className={l.animar ? "ss-respirar" : undefined} style={{ ["--ss-dur" as string]: "6s", transformBox: "fill-box", transformOrigin: "center" }} />
            )}
            <circle cx={cx} cy={base - alto * 0.45} r={ancho * 0.55} fill={`url(#${id}-halo)`} />
            <path d={`M${x0 - W * 0.04} ${techo}L${cx} ${techo - tejado}L${x0 + ancho + W * 0.04} ${techo}`} fill="none" stroke={tinta(l.acento, 0.2)} strokeWidth={2} strokeLinejoin="round" />
            <rect x={x0} y={techo} width={ancho} height={alto} rx={3} fill={conAlfa("#ffffff", 0.04)} stroke={conAlfa("#ffffff", 0.35)} />
            <rect x={x0 + ancho * 0.14} y={techo + alto * 0.2} width={ancho * 0.3} height={alto * 0.34} rx={2} fill={`url(#${id}-v)`} />
            <rect x={x0 + ancho * 0.58} y={techo + alto * 0.36} width={ancho * 0.26} height={alto * 0.64} rx={2} fill={conAlfa("#ffffff", 0.08)} stroke={conAlfa("#ffffff", 0.25)} />
            {luces !== null && luces > 0 && Array.from({ length: Math.min(6, luces) }, (_, i) => (
                <circle key={i} cx={x0 + ancho * 0.14 + i * W * 0.035} cy={base + H * 0.035} r={Math.max(1.5, W * 0.012)} fill="#FFBF00" />
            ))}
        </svg>
    );
}

export function HabitatCoreWidget() {
    const l = useLienzo("#f59e0b", "#818cf8");
    const meteo = useMeteo(l.visible);
    const [ha, setHa] = React.useState<ConfigHa>({ enabled: false });
    const [ahora, setAhora] = React.useState(() => new Date());
    React.useEffect(() => {
        const leer = () => setHa(leerHa());
        leer();
        const alm = (e: StorageEvent) => { if (e.key === null || e.key === "starseed.iot.homeassistant.v1") leer(); };
        window.addEventListener("storage", alm);
        return () => window.removeEventListener("storage", alm);
    }, []);
    React.useEffect(() => {
        if (!l.visible) return;
        setAhora(new Date());
        const t = window.setInterval(() => setAhora(new Date()), 5 * 60_000);
        return () => window.clearInterval(t);
    }, [l.visible]);

    const listo = haListo(ha);
    const hogar = useCompartido<Hogar>(listo ? `ha:${ha.url}` : null, 5 * 60_000, () => traerHogar(ha), l.visible && listo, { persistir: false });
    const lugar = meteo.lugar;
    const cielo = React.useMemo(() => (lugar ? luzAhora(ahora, lugar.lat, lugar.lon) : null), [lugar?.lat, lugar?.lon, ahora]); // eslint-disable-line react-hooks/exhaustive-deps
    const m = meteo.datos;
    const ventilar = React.useMemo(() => {
        if (!m) return null;
        const prox = horasDesde(m, ahora.getTime(), 3);
        return consejoVentilar({ temp: m.ahora.temp, humedad: m.ahora.humedad, viento: m.ahora.viento, lluvia: m.ahora.lluvia }, prox.length ? Math.max(...prox.map((h) => h.probLluvia)) : 0);
    }, [m, ahora]);
    const casa = hogar.datos;
    const lucesOn = casa ? casa.luces.filter((x) => x.encendido).length : null;
    const hora = (d: Date) => d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    const diaFrac = (ahora.getHours() * 60 + ahora.getMinutes()) / 1440;

    const etiqueta = [
        cielo ? `Luz para ahora: ${cielo.luz.nombre.toLowerCase()} (${cielo.luz.kelvin} K)${cielo.cambio ? `, ${cielo.cambio.luz.nombre.toLowerCase()} a las ${hora(cielo.cambio.en)}` : ""}` : "Sin ubicación: vacío de luz y ventilación",
        ventilar ? `${ventilar.titulo}: ${ventilar.razon}` : meteo.error ? "Ventilar: error, el tiempo no respondió" : lugar ? "Ventilar: cargando el tiempo" : null,
        !listo ? "Casa: Home Assistant sin conectar" : casa ? `Casa: ${casa.temperaturas[0] ? `${casa.temperaturas[0].nombre} ${casa.temperaturas[0].valor} ${casa.temperaturas[0].unidad}, ` : ""}${lucesOn} de ${casa.luces.length} luces encendidas` : hogar.error ? "Casa: error, Home Assistant no respondió" : "Casa: cargando Home Assistant",
    ].filter(Boolean).join(". ");

    if (l.base === "micro") {
        return (
            <Lienzo l={l} titulo="Núcleo del Hábitat" etiqueta={`Núcleo del hábitat. ${etiqueta}`} sinCabecera>
                <div className="grid h-full place-items-center"><Casa W={l.lado - 12} luz={cielo?.luz ?? null} altura={cielo?.altura ?? null} hora={diaFrac} luces={lucesOn} l={l} /></div>
            </Lienzo>
        );
    }

    const bloqueLuz = (detalle: boolean) => cielo ? (
        <div className="min-w-0" title={cielo.luz.consejo}>
            <p className="text-[11px] uppercase tracking-[0.12em] text-white/45">Luz para ahora</p>
            <p className="flex items-center gap-2 text-[14px] text-white/90">
                <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: cielo.luz.color, boxShadow: `0 0 10px ${cielo.luz.color}` }} />
                <span className="truncate">{cielo.luz.nombre} · <span className="tabular-nums">{cielo.luz.kelvin} K</span></span>
            </p>
            {detalle && <p className="line-clamp-2 text-[11.5px] leading-snug text-white/55">{cielo.luz.consejo}</p>}
            {detalle && cielo.cambio && <p className="text-[11px] text-white/45">{cielo.cambio.luz.nombre} a las {hora(cielo.cambio.en)}</p>}
        </div>
    ) : (
        <p role="status" className="text-[11.5px] leading-snug text-white/55">Sin ubicación (vacío): elige tu lugar en el clima para la luz y la ventilación.</p>
    );

    const bloqueVentilar = (detalle: boolean) => {
        if (!lugar) return null;
        if (!ventilar) return meteo.error
            ? <p className="text-[11.5px] text-white/50">Ventilar: el tiempo no respondió (error).</p>
            : <p className="text-[11.5px] text-white/45">Ventilar: cargando el tiempo…</p>;
        const col = ventilar.abrir ? "#10B981" : "#60a5fa";
        const I = ventilar.abrir ? Wind : WindArrowDown;
        return (
            <div className="flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-1.5" style={{ background: conAlfa(col, 0.1), boxShadow: `inset 0 0 0 1px ${conAlfa(col, 0.28)}` }} title={`${ventilar.titulo}: ${ventilar.razon}`}>
                <I className="size-4 shrink-0" style={{ color: tinta(col, 0.3) }} aria-hidden />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-white/90">{detalle && l.ancho >= 420 ? ventilar.titulo : ventilar.corto}</span>
                    {detalle && <span className="block truncate text-[11px] text-white/55">{ventilar.razon}</span>}
                </span>
            </div>
        );
    };

    const bloqueCasa = (detalle: boolean) => {
        if (!listo) return (
            <div role="status" className="min-w-0">
                <p className="text-[12.5px] text-white/85">Tu casa: sin conectar</p>
                <p className="line-clamp-4 text-[11.5px] leading-snug text-white/50" title="Conecta tu Home Assistant en el Centro de Control (borde derecho), pestaña Hogar. Solo lectura, y la llave se queda en este dispositivo.">Conéctalo en el Centro de Control › Hogar (borde derecho). Solo lectura.</p>
            </div>
        );
        if (!casa) return hogar.error
            ? <p role="alert" className="text-[11.5px] leading-snug text-rose-200/85">Home Assistant no respondió (error): {hogar.error instanceof Error ? hogar.error.message : "revisa la URL, el token o CORS"}.</p>
            : <CargandoSilueta color={l.acento} filas={2} etiqueta="Cargando tu Home Assistant…" />;
        const temps = casa.temperaturas.slice(0, detalle ? 4 : 2);
        return (
            <div className="flex min-w-0 flex-col gap-1">
                <p className="text-[11px] uppercase tracking-[0.12em] text-white/45">Tu casa</p>
                {temps.length === 0 && casa.luces.length === 0 && <p className="text-[11.5px] text-white/55">Ni sensores de temperatura ni luces entre tus {casa.entidades} entidades.</p>}
                <ul className="flex flex-col gap-0.5" aria-label="Temperaturas de casa">
                    {temps.map((t) => (
                        <li key={t.id} className="flex items-center gap-2 text-[12px] text-white/75">
                            <Thermometer className="size-3.5 shrink-0 text-white/45" aria-hidden />
                            <span className="min-w-0 flex-1 truncate">{t.nombre}</span>
                            <span className="tabular-nums text-white/90">{t.valor.toLocaleString("es-ES", { maximumFractionDigits: 1 })} {t.unidad}</span>
                        </li>
                    ))}
                </ul>
                {(casa.luces.length > 0 || casa.enchufes.length > 0) && (
                    <p className="flex flex-wrap items-center gap-x-3 text-[12px] text-white/70">
                        {casa.luces.length > 0 && <span className="inline-flex items-center gap-1"><Lightbulb className="size-3.5 text-amber-300/80" aria-hidden /><span className="tabular-nums">{lucesOn}/{casa.luces.length}</span> luces</span>}
                        {casa.enchufes.length > 0 && <span className="inline-flex items-center gap-1"><Plug className="size-3.5 text-white/50" aria-hidden /><span className="tabular-nums">{casa.enchufes.filter((x) => x.encendido).length}/{casa.enchufes.length}</span> enchufes</span>}
                    </p>
                )}
            </div>
        );
    };

    const hb = Math.max(80, l.alto - 64);

    if (l.base === "s") {
        return (
            <Lienzo l={l} titulo="Núcleo del Hábitat" etiqueta={`Núcleo del hábitat. ${etiqueta}`} sinCabecera>
                <div className="flex h-full flex-col items-center justify-center gap-1">
                    <Casa W={Math.max(70, Math.min(l.ancho - 30, (l.alto - 44) / 0.9))} luz={cielo?.luz ?? null} altura={cielo?.altura ?? null} hora={diaFrac} luces={lucesOn} l={l} />
                    <span className="max-w-full truncate text-[12px] text-white/80">{cielo ? `${cielo.luz.nombre} · ${cielo.luz.kelvin} K` : "Sin ubicación"}</span>
                </div>
            </Lienzo>
        );
    }

    if (l.horizontal) {
        const W = Math.max(90, Math.min(hb / 0.9, l.ancho * 0.2));
        return (
            <Lienzo l={l} titulo="Núcleo del Hábitat" subtitulo="Luz, aire y casa" icono={Home} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 items-center gap-4">
                    <Casa W={W} luz={cielo?.luz ?? null} altura={cielo?.altura ?? null} hora={diaFrac} luces={lucesOn} l={l} />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">{bloqueLuz(true)}{bloqueVentilar(true)}</div>
                    <div className="min-w-0 flex-1">{bloqueCasa(false)}</div>
                </div>
            </Lienzo>
        );
    }

    if (l.torre) {
        return (
            <Lienzo l={l} titulo="Hábitat" subtitulo="Luz, aire y casa" icono={Home} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 flex-col items-center gap-3 overflow-y-auto">
                    <Casa W={Math.max(80, Math.min(l.ancho - 40, hb * 0.28))} luz={cielo?.luz ?? null} altura={cielo?.altura ?? null} hora={diaFrac} luces={lucesOn} l={l} />
                    <div className="flex w-full flex-col gap-2.5">{bloqueLuz(true)}{bloqueVentilar(false)}{bloqueCasa(false)}</div>
                </div>
            </Lienzo>
        );
    }

    if (l.base === "xl") {
        const W = Math.max(120, Math.min(l.ancho * 0.36, (hb * 0.48) / 0.9));
        return (
            <Lienzo l={l} titulo="Núcleo del Hábitat" subtitulo="La luz, el aire y tu casa, ahora" icono={Home} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 flex-col gap-3">
                    <div className="flex min-h-0 items-center gap-4">
                        <Casa W={W} luz={cielo?.luz ?? null} altura={cielo?.altura ?? null} hora={diaFrac} luces={lucesOn} l={l} />
                        <div className="flex min-w-0 flex-1 flex-col gap-2.5">{bloqueLuz(true)}{bloqueVentilar(true)}</div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">{bloqueCasa(true)}</div>
                </div>
            </Lienzo>
        );
    }

    const W = Math.max(90, Math.min((hb - 8) / 0.9, l.ancho * 0.36));
    return (
        <Lienzo l={l} titulo="Núcleo del Hábitat" subtitulo={l.ancho >= 300 ? "Luz, aire y casa" : undefined} icono={Home} etiqueta={etiqueta}>
            <div className="flex h-full min-h-0 items-center gap-4">
                <Casa W={W} luz={cielo?.luz ?? null} altura={cielo?.altura ?? null} hora={diaFrac} luces={lucesOn} l={l} />
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto">
                    {bloqueLuz(l.base === "l")}
                    {bloqueVentilar(l.base === "l")}
                    {l.base === "l" && bloqueCasa(false)}
                </div>
            </div>
        </Lienzo>
    );
}
