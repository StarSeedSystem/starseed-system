"use client";
/**
 * Reloj celeste (Ola 383 · WL1, rediseño ola 0929 · F) — el reloj es el cielo de AHORA aquí.
 * Cada tamaño es otra lectura del mismo cielo real (src/lib/astro/cielo.ts, sin red):
 *   micro  → la hora y la Luna con su fase.
 *   s      → la hora sobre el disco del cielo de 24 h (mediodía arriba): el arco del día entre
 *            el orto y el ocaso, las horas doradas, el Sol en su hora y la Luna por su elongación.
 *   m      → + la fecha, el signo del Sol y de la Luna, la hora planetaria y la próxima fase.
 *   l / xl → la carta del cielo: la rueda del zodiaco con el ascendente real a la izquierda y
 *            cada planeta en su sitio; al lado (o debajo) la lectura: astros, hora planetaria,
 *            arco del día y lo próximo que pasará (fases, eclipse, estación, cambio de signo).
 *   panorámico → la cinta del día de 00 a 24 h con la curva del Sol y la de la Luna.
 *   torre  → la columna del cielo del cénit al nadir.
 * Sin saludos. Sin ubicación, lo que depende del lugar se dice y se ofrece «Usar mi ubicación».
 * Ajustes de siempre: `clockMode` (digital/agujas) y `clockZones`. Late cada segundo solo si se
 * ve y el dispositivo puede; si no, cada minuto (y nada fuera de pantalla).
 */
import * as React from "react";
import { useReducedMotion } from "framer-motion";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { zoneLabel } from "@/components/dashboard/widgets/clock-date-widget";
import type { DashboardWidget } from "@/components/dashboard/dashboard-types";
import { COLOR_ELEMENTO } from "@/lib/astro/cielo";
import { useNivelRender } from "@/lib/widgets/forma/nivel-dispositivo";
import { disenoDe } from "./comun";
import { ASTRO, FUENTE_GLIFOS, LunaSVG, coloresCielo, useCieloAqui, type CieloAqui } from "./celeste";
import { BotonUbicacion, CartaCeleste, LineaFase, PanelCielo, describirCarta } from "./reloj-esfera";
import { ColumnaCielo, LineaDelDia } from "./reloj-linea";
import { Accion, escalaTipo, esTactil, horaCorta, useAhoraVivo, useClaseForzada, useDispositivo, useEnPantalla } from "./inicio-piezas";

type Ajustes = (patch: Record<string, unknown>) => void;

export function partesHora(fecha: Date, zona?: string) {
    const opciones: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, weekday: "long", day: "numeric", month: "long" };
    let f: Intl.DateTimeFormat;
    try { f = new Intl.DateTimeFormat("es-ES", { ...opciones, timeZone: zona && zona !== "local" ? zona : undefined }); }
    catch { f = new Intl.DateTimeFormat("es-ES", opciones); }
    const p = Object.fromEntries(f.formatToParts(fecha).map((x) => [x.type, x.value]));
    const h = Number(p.hour) % 24, m = Number(p.minute), s = Number(p.second);
    return { h, m, s, hhmm: `${String(h).padStart(2, "0")}:${p.minute}`, fecha: `${p.weekday} ${p.day} de ${p.month}` };
}

const horaDecimal = (d: Date) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
/** Punto de la esfera de 24 h: mediodía arriba, medianoche abajo. */
const enEsfera = (hora: number, r: number): [number, number] => {
    const a = ((hora / 24) * 360 + 180) * (Math.PI / 180);
    return [Math.sin(a) * r, -Math.cos(a) * r];
};

/** Estrellas deterministas (no bailan entre renders); se apagan donde va la hora. */
const ESTRELLAS = Array.from({ length: 16 }, (_, i) => {
    const a = (i * 137.508 * Math.PI) / 180, r = 0.25 + 0.75 * Math.sqrt((i + 0.5) / 16);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    const tapa = Math.abs(x) < 0.62 && Math.abs(y) < 0.38;
    return { x, y, r: [0.5, 0.9, 1.4][i % 3], o: tapa ? 0.1 : 0.25 + ((i * 7) % 10) / 18, d: (i % 5) * 0.7 };
});

/** Arco de la esfera de 24 h entre dos horas (sentido horario). */
function arcoHoras(a: number, b: number, r: number): string {
    const [ax, ay] = enEsfera(a, r), [bx, by] = enEsfera(b, r);
    const grande = ((b - a + 24) % 24) > 12 ? 1 : 0;
    return `M${ax.toFixed(1)} ${ay.toFixed(1)}A${r.toFixed(1)} ${r.toFixed(1)} 0 ${grande} 1 ${bx.toFixed(1)} ${by.toFixed(1)}`;
}

/** Agujas (modo analógico), centradas en 0,0. */
function Agujas({ t, largo }: { t: { h: number; m: number; s: number }; largo: number }) {
    return (
        <g stroke="#fff" strokeLinecap="round">
            <line y2={-largo * 0.62} strokeWidth={Math.max(2, largo * 0.06)} transform={`rotate(${(t.h % 12 + t.m / 60) * 30})`} />
            <line y2={-largo} strokeWidth={Math.max(1.4, largo * 0.035)} transform={`rotate(${t.m * 6 + t.s / 10})`} />
            <circle r={Math.max(2, largo * 0.06)} fill="#fff" />
        </g>
    );
}

/** El disco del cielo de 24 h (s y m): el color del cielo de ahora, el arco del día, las horas
 *  doradas, el Sol en su hora y la Luna en su fase y su elongación. */
const DiscoCielo = React.memo(function DiscoCielo({ lado, cielo, ahora, id, modo, segundos, vivo }: {
    lado: number; cielo: CieloAqui; ahora: Date; id: string; modo: "analog" | "digital"; segundos: boolean; vivo: boolean;
}) {
    const t = partesHora(ahora);
    const col = coloresCielo(cielo.altura);
    const R = lado * 0.44, h = horaDecimal(ahora);
    const [sx, sy] = enEsfera(h, R);
    const [lx, ly] = enEsfera(h - cielo.luna.fase * 24, R * 0.74);
    const hOrto = cielo.orto ? horaDecimal(cielo.orto) : null, hOcaso = cielo.ocaso ? horaDecimal(cielo.ocaso) : null;
    const dor = cielo.doradas;
    const noche = cielo.altura === null ? 0.6 : Math.max(0, Math.min(1, (-cielo.altura - 2) / 10));
    const bajo = cielo.altura !== null && cielo.altura < 0;
    const grosor = Math.max(2, lado * 0.009);
    return (
        <svg width={lado} height={lado} viewBox={`${-lado / 2} ${-lado / 2} ${lado} ${lado}`} className="absolute overflow-visible" aria-hidden>
            <defs>
                <radialGradient id={`cielo-${id}`} cx="50%" cy="30%" r="75%">
                    <stop offset="0%" stopColor={col.alto} />
                    <stop offset="100%" stopColor={col.bajo} />
                </radialGradient>
                <radialGradient id={`horiz-${id}`} cx="50%" cy="100%" r="60%">
                    <stop offset="0%" stopColor={col.horizonte} stopOpacity={0.55} />
                    <stop offset="100%" stopColor={col.horizonte} stopOpacity={0} />
                </radialGradient>
                <radialGradient id={`sold-${id}`}>
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="35%" stopColor="#ffe7a3" />
                    <stop offset="60%" stopColor="#FFBF00" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#FFBF00" stopOpacity={0} />
                </radialGradient>
                <linearGradient id={`dia-${id}`} x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0%" stopColor="#ffb347" />
                    <stop offset="50%" stopColor="#ffe7a3" />
                    <stop offset="100%" stopColor="#ffb347" />
                </linearGradient>
            </defs>
            <circle r={R * 0.97} fill={`url(#cielo-${id})`} />
            <circle r={R * 0.97} fill={`url(#horiz-${id})`} />
            {noche > 0 && ESTRELLAS.map((e, i) => (
                <circle key={i} cx={e.x * R * 0.85} cy={e.y * R * 0.85} r={e.r * Math.max(1, lado / 320)} fill="#fff"
                    opacity={noche * e.o} className={vivo && i % 3 === 0 ? "ss-respirar" : undefined}
                    style={{ ["--ss-dur" as string]: `${3 + e.d}s`, animationDelay: `${e.d}s`, transformBox: "fill-box", transformOrigin: "center" }} />
            ))}
            <circle r={R * 0.97} fill="none" stroke="#ffffff" strokeOpacity={0.1} />
            <circle r={R} fill="none" stroke="#7c5cff" strokeOpacity={0.35} />
            {hOrto !== null && hOcaso !== null && <path d={arcoHoras(hOrto, hOcaso, R)} fill="none" stroke={`url(#dia-${id})`} strokeWidth={grosor} strokeLinecap="round" />}
            {dor?.manana && <path d={arcoHoras(horaDecimal(dor.manana.inicio), horaDecimal(dor.manana.fin), R)} fill="none" stroke="#ff9d5c" strokeWidth={grosor * 1.8} strokeLinecap="round" opacity={0.9} />}
            {dor?.tarde && <path d={arcoHoras(horaDecimal(dor.tarde.inicio), horaDecimal(dor.tarde.fin), R)} fill="none" stroke="#ff9d5c" strokeWidth={grosor * 1.8} strokeLinecap="round" opacity={0.9} />}
            {Array.from({ length: 24 }, (_, i) => {
                const mayor = i % 6 === 0, [x1, y1] = enEsfera(i, R * 0.93), [x2, y2] = enEsfera(i, R * 0.93 - (mayor ? 8 : 4));
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={mayor ? 1.5 : 1} strokeOpacity={mayor ? 0.55 : 0.25} strokeLinecap="round" />;
            })}
            {segundos && (
                <g style={{ transform: `rotate(${(t.h * 3600 + t.m * 60 + t.s) * 6}deg)`, transition: "transform 1s linear" }}>
                    <circle cy={-R * 0.9} r={Math.max(1.5, lado * 0.006)} fill="#fff" opacity={0.85} />
                </g>
            )}
            <g style={{ transform: `translate(${lx}px, ${ly}px)`, transition: "transform 1s ease" }}>
                <LunaSVG r={lado * 0.048} fase={cielo.luna} id={id} />
            </g>
            <g style={{ transform: `translate(${sx}px, ${sy}px)`, transition: "transform 1s ease" }} opacity={bajo ? 0.4 : 1}>
                <circle r={lado * (bajo ? 0.05 : 0.085)} fill={`url(#sold-${id})`} className={vivo ? "ss-respirar" : undefined} style={{ ["--ss-dur" as string]: "6s", transformBox: "fill-box", transformOrigin: "center" }} />
                <circle r={lado * 0.024} fill="#fff8e1" />
            </g>
            {modo === "analog" && <Agujas t={t} largo={R * 0.62} />}
        </svg>
    );
});

/** «☉ Libra 6° · ☽ Tauro 12°», con el color del elemento de cada signo. */
function LineaSignos({ cielo, grados, tam, apilada }: { cielo: CieloAqui; grados?: boolean; tam: number; apilada?: boolean }) {
    const sol = cielo.planetas.find((p) => p.clave === "sol")!, luna = cielo.planetas.find((p) => p.clave === "luna")!;
    return (
        <span className={`font-medium text-white/75 ${apilada ? "flex flex-col gap-0.5 [&>i]:hidden" : "whitespace-nowrap"}`} style={{ fontSize: tam }}>
            <span title={`Sol en ${sol.signo.nombre}`}>
                <b className="font-medium" style={{ color: COLOR_ELEMENTO[sol.signo.elemento], fontFamily: FUENTE_GLIFOS }}>{sol.signo.glifo}</b> Sol en {sol.signo.nombre}{grados && ` ${sol.grado}°`}
            </span>
            <i className="not-italic">{" · "}</i>
            <span title={`Luna en ${luna.signo.nombre}`}>
                <b className="font-medium" style={{ color: COLOR_ELEMENTO[luna.signo.elemento], fontFamily: FUENTE_GLIFOS }}>{luna.signo.glifo}</b> Luna en {luna.signo.nombre}{grados && ` ${luna.grado}°`}
            </span>
        </span>
    );
}

function LineaHora({ cielo, tam, corta }: { cielo: CieloAqui; tam: number; corta?: boolean }) {
    const hp = cielo.horaPlanetaria;
    const a = ASTRO[hp ? hp.planeta : cielo.regenteDia];
    return (
        <span className="whitespace-nowrap text-white/65" style={{ fontSize: tam }}
            title={hp ? `Hora planetaria de ${a.nombre} hasta las ${horaCorta(hp.fin)} (orden caldeo)` : `Día de ${a.nombre}`}>
            <span aria-hidden style={{ color: a.color, fontFamily: FUENTE_GLIFOS }}>{a.glifo} </span>
            {hp ? (corta ? <>{a.nombre} · hasta {horaCorta(hp.fin)}</> : <>Hora de {a.nombre} · hasta {horaCorta(hp.fin)}</>) : <>Día de {a.nombre}</>}
        </span>
    );
}

export function RelojLibre({ widget, onUpdateSettings }: { widget?: DashboardWidget; onUpdateSettings?: Ajustes }) {
    const [ref, visible] = useEnPantalla<HTMLDivElement>();
    const nivel = useNivelRender();
    const reducido = useReducedMotion();
    const vivo = visible && nivel !== "ligero" && !reducido;
    const ahora = useAhoraVivo(vivo ? 1000 : 60_000, visible);
    const cielo = useCieloAqui(ahora);
    const dispositivo = useDispositivo();
    const forzada = useClaseForzada();
    const modo: "analog" | "digital" = widget?.settings?.clockMode === "analog" ? "analog" : "digital";
    const zonas: string[] = Array.isArray(widget?.settings?.clockZones) ? widget!.settings!.clockZones : [];
    const id = React.useId().replace(/:/g, "");
    const t = ahora ? partesHora(ahora) : null;
    const col = coloresCielo(cielo?.altura ?? null);
    const k = escalaTipo(dispositivo);
    const tactil = esTactil(dispositivo);

    const etiqueta = t && cielo
        ? `Son las ${t.hhmm}, ${t.fecha}. ${cielo.luna.nombre} al ${Math.round(cielo.luna.iluminada * 100)} %. Sol en ${cielo.signos.sol.nombre}, Luna en ${cielo.signos.luna.nombre}.`
            + (cielo.ascendente ? ` Ascendente en ${cielo.ascendente.signo.nombre}.` : "")
            + (cielo.horaPlanetaria ? ` Hora de ${ASTRO[cielo.horaPlanetaria.planeta].nombre}.` : "")
        : "Reloj celeste";

    const alternar = onUpdateSettings ? (
        <Accion color={col.horizonte} grande={tactil} onClick={() => onUpdateSettings({ clockMode: modo === "analog" ? "digital" : "analog" })}
            aria-label={modo === "analog" ? "Ver la hora en digital" : "Ver la hora con agujas"}>
            {modo === "analog" ? "Digital" : "Agujas"}
        </Accion>
    ) : null;
    const zonasNodo = (n: number, tam: number) => (zonas.length > 0 && ahora ? (
        <span className="text-white/70" style={{ fontSize: tam }}>
            {zonas.slice(0, n).map((z) => `${zoneLabel(z)} ${partesHora(ahora, z).hhmm}`).join("  ·  ")}
        </span>
    ) : null);

    return (
        <div ref={ref} className="h-full w-full">
            <WidgetLibre forma="ninguna" acento={col.horizonte} acento2={col.alto} etiqueta={etiqueta}>
                {({ clase: medida, ancho, alto }) => {
                    if (!t || !cielo || !ahora) return null;
                    const clase = forzada ?? medida;
                    const { base: b, horizontal } = disenoDe(clase);
                    const lado = Math.max(60, Math.min(ancho, alto));

                    // ── micro: la hora y la Luna ──
                    if (b === "micro") {
                        // (Pulido 0930) Apaisada: hora y Luna en fila (apiladas rozaban el borde de 46 px).
                        return (
                            <div className={`flex h-full items-center justify-center ${ancho >= alto * 1.15 ? "flex-row gap-2" : "flex-col gap-1"}`} data-diseno="micro">
                                <span className="font-extralight tabular-nums tracking-tight text-white" style={{ fontSize: lado * 0.3 * k, lineHeight: 1 }}>{t.hhmm}</span>
                                <svg width={lado * 0.22} height={lado * 0.22} viewBox="-12 -12 24 24" aria-hidden><LunaSVG r={10} fase={cielo.luna} id={`m${id}`} halo={false} /></svg>
                            </div>
                        );
                    }

                    // ── panorámico: la cinta del día ──
                    if (clase === "panoramico" && horizontal) {
                        const izq = Math.min(Math.max(150, ancho * 0.32), 280);
                        const tamHora = Math.min(alto * 0.42, izq * 0.34) * k;
                        return (
                            <div className="flex h-full w-full items-center gap-4 px-3" data-diseno="panoramico">
                                <div className="flex min-w-0 shrink-0 flex-col justify-center gap-1" style={{ width: izq }}>
                                    <span className="tabular-nums text-white" style={{ fontSize: tamHora, lineHeight: 1, fontWeight: 250, letterSpacing: "-0.02em" }}>{t.hhmm}</span>
                                    <span className="truncate font-medium text-white/80 first-letter:uppercase" style={{ fontSize: 12.5 * k }}>{t.fecha}</span>
                                    {alto >= 110 && <LineaSignos cielo={cielo} tam={11.5 * k} />}
                                    {alto >= 140 && zonasNodo(2, 11 * k)}
                                </div>
                                <div className="flex min-w-0 flex-1 items-center justify-center">
                                    {cielo.ubicacion
                                        ? <LineaDelDia cielo={cielo} ahora={ahora} ancho={ancho - izq - 40} alto={alto - 16} vivo={vivo} />
                                        : <div className="flex flex-col items-center gap-2 text-center text-[12px] text-white/70">
                                            <span>La línea del día necesita saber dónde estás.</span>
                                            <BotonUbicacion cielo={cielo} grande={tactil} />
                                        </div>}
                                </div>
                            </div>
                        );
                    }

                    // ── torre: la columna del cielo ──
                    if (clase === "torre") {
                        const tamHora = Math.min(ancho * 0.28, 64) * k;
                        const alturaCol = Math.max(120, alto * 0.42);
                        return (
                            <div className="flex h-full w-full flex-col items-center justify-between gap-2 px-2 py-3 text-center" data-diseno="torre">
                                <div className="flex flex-col items-center gap-0.5">
                                    <span className="tabular-nums text-white" style={{ fontSize: tamHora, lineHeight: 1, fontWeight: 250 }}>{t.hhmm}</span>
                                    <span className="font-medium text-white/75 first-letter:uppercase" style={{ fontSize: 12 * k }}>{t.fecha}</span>
                                </div>
                                {cielo.altura !== null
                                    ? <ColumnaCielo cielo={cielo} ancho={ancho * 0.36} alto={alturaCol} vivo={vivo} />
                                    : <div className="relative flex items-center justify-center" style={{ width: ancho * 0.8, height: ancho * 0.8 }}>
                                        <DiscoCielo lado={ancho * 0.8} cielo={cielo} ahora={ahora} id={id} modo="digital" segundos={false} vivo={vivo} />
                                    </div>}
                                <div className="flex flex-col items-center gap-1">
                                    <span className="flex items-center gap-1.5 text-[12px] text-white/80">
                                        <svg width={16} height={16} viewBox="-8 -8 16 16" aria-hidden><LunaSVG r={7} fase={cielo.luna} id={`tw${id}`} halo={false} /></svg>
                                        {cielo.luna.nombre} · {Math.round(cielo.luna.iluminada * 100)} %
                                    </span>
                                    <LineaFase cielo={cielo} ahora={ahora} className="text-[11.5px] text-white/60" />
                                    <LineaHora cielo={cielo} tam={11.5} />
                                    <BotonUbicacion cielo={cielo} grande={tactil} />
                                </div>
                            </div>
                        );
                    }

                    // ── s y m: el disco del cielo ──
                    if (b === "s" || b === "m") {
                        // Apaisado con sitio para una columna de lectura de ≥ 150 px: disco a la izquierda.
                        const discoFila = Math.min(alto, ancho - 170);
                        const fila = b === "m" && discoFila >= alto * 0.78;
                        const disco = fila ? discoFila : lado;
                        const texto = (
                            <div className="relative z-10 flex flex-col items-center text-center" style={{ gap: disco * 0.012, marginTop: modo === "analog" ? disco * 0.28 : 0 }}>
                                {modo === "digital" && <span className="tabular-nums text-white" style={{ fontSize: disco * (b === "s" ? 0.21 : 0.19) * k, lineHeight: 1, fontWeight: 250, letterSpacing: "-0.02em" }}>{t.hhmm}</span>}
                                {b === "m" && !fila && <span className="font-medium text-white/80 first-letter:uppercase" style={{ fontSize: Math.max(12, disco * 0.036) * k }}>{t.fecha}</span>}
                                {b === "m" && !fila && <LineaSignos cielo={cielo} tam={Math.max(11, disco * 0.031) * k} />}
                                {b === "m" && !fila && <span style={{ fontSize: Math.max(11, disco * 0.03) * k }}><LineaFase cielo={cielo} ahora={ahora} className="text-white/60" /></span>}
                            </div>
                        );
                        const circulo = (
                            <div className="relative flex shrink-0 items-center justify-center" style={{ width: disco, height: disco }}>
                                <DiscoCielo lado={disco} cielo={cielo} ahora={ahora} id={id} modo={modo} segundos={vivo} vivo={vivo} />
                                {texto}
                            </div>
                        );
                        if (!fila) return <div className="relative flex h-full w-full items-center justify-center" data-diseno={b}>{circulo}</div>;
                        return (
                            <div className="flex h-full w-full items-center justify-center gap-3" data-diseno="m-fila">
                                {circulo}
                                <div className="flex min-w-0 flex-col gap-1.5" style={{ maxWidth: ancho - disco - 16 }}>
                                    <span className="font-medium text-white/85 first-letter:uppercase" style={{ fontSize: 13 * k }}>{t.fecha}</span>
                                    <LineaSignos cielo={cielo} tam={11.5 * k} apilada />
                                    <LineaHora cielo={cielo} tam={11.5 * k} corta />
                                    <LineaFase cielo={cielo} ahora={ahora} className="text-[11.5px] text-white/60" />
                                    <BotonUbicacion cielo={cielo} grande={tactil} />
                                </div>
                            </div>
                        );
                    }

                    // ── l y xl: la carta del cielo ──
                    const apaisado = ancho >= alto * 1.3;
                    const hayAcciones = !!onUpdateSettings || (!!cielo.pedirUbicacion && (!cielo.ubicacion || cielo.ubicacion.porDefecto));
                    let carta = hayAcciones ? Math.min(ancho, alto - (tactil ? 56 : 42)) : lado, panel: "lado" | "debajo" | "ninguno" = "ninguno";
                    if (apaisado && ancho - Math.min(alto, ancho * 0.6) - 28 >= 180) { carta = Math.min(alto, ancho * 0.6); panel = "lado"; }
                    else if (b === "xl" && alto - Math.min(ancho, alto * 0.6) >= 150) { carta = Math.min(ancho, alto * 0.6); panel = "debajo"; }
                    const detalle = b === "xl" ? "xl" : "l";
                    const centro = (
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center" style={{ gap: carta * 0.01 }}>
                            {modo === "digital"
                                ? <span className="tabular-nums text-white" style={{ fontSize: carta * 0.15 * k, lineHeight: 1, fontWeight: 250, letterSpacing: "-0.02em" }}>{t.hhmm}</span>
                                : <svg width={carta * 0.36} height={carta * 0.36} viewBox={`${-carta * 0.18} ${-carta * 0.18} ${carta * 0.36} ${carta * 0.36}`} aria-hidden><Agujas t={t} largo={carta * 0.15} /></svg>}
                            <span className="font-medium text-white/80 first-letter:uppercase" style={{ fontSize: Math.max(11, carta * 0.036) * k }}>{t.fecha}</span>
                            {panel === "ninguno" && <LineaHora cielo={cielo} tam={Math.max(10.5, carta * 0.031) * k} />}
                        </div>
                    );
                    const rueda = (
                        <div className="relative shrink-0" style={{ width: carta, height: carta }}>
                            {/* La descripción va en aria-label (role=img), no en un «sr-only» sin ajuste de
                                línea: su caja invisible asomaba sobre «Usar mi ubicación». */}
                            <div role="img" aria-label={describirCarta(cielo)} className="absolute inset-0">
                                <CartaCeleste lado={carta} cielo={cielo} id={id} detalle={detalle} vivo={vivo} />
                            </div>
                            {centro}
                        </div>
                    );
                    const acciones = <>{alternar}<BotonUbicacion cielo={cielo} grande={tactil} /></>;
                    if (panel === "lado") {
                        return (
                            <div className="flex h-full w-full items-center justify-center gap-5 px-2" data-diseno={`${b}-carta-panel`}>
                                {rueda}
                                <PanelCielo cielo={cielo} ahora={ahora} ancho={Math.min(ancho - carta - 36, 300)} proximos={b === "xl" ? 4 : alto >= 380 ? 3 : 2}
                                    zonas={b === "xl" ? zonasNodo(3, 11.5 * k) : undefined} acciones={acciones} />
                            </div>
                        );
                    }
                    if (panel === "debajo") {
                        return (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-3" data-diseno="xl-carta-debajo">
                                {rueda}
                                <PanelCielo cielo={cielo} ahora={ahora} ancho={Math.min(ancho - 24, 560)} proximos={3} columnas
                                    zonas={zonasNodo(3, 11.5 * k)} acciones={acciones} />
                            </div>
                        );
                    }
                    return (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2" data-diseno={`${b}-carta`}>
                            {rueda}
                            {hayAcciones && <div className="flex flex-wrap items-center justify-center gap-2">{acciones}</div>}
                        </div>
                    );
                }}
            </WidgetLibre>
        </div>
    );
}

export default RelojLibre;
