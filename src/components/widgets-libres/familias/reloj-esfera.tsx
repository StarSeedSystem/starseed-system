"use client";
/**
 * La carta del cielo del reloj celeste (l/xl): la rueda del zodiaco orientada como el cielo de
 * AHORA aquí — el ascendente real a la izquierda, la línea del horizonte recta, el medio cielo
 * arriba — y cada astro en su longitud real. Lo que está sobre la línea está sobre tu horizonte:
 * de día el Sol arriba, de noche abajo; la rueda gira un grado cada cuatro minutos. Sin
 * ubicación no hay horizonte que dibujar: Aries a la izquierda y se dice.
 *
 * `PanelCielo` es la columna de lectura: dónde está cada astro, la hora planetaria, el arco del
 * día y lo próximo que va a pasar en el cielo.
 */
import * as React from "react";
import { MapPin } from "lucide-react";
import { COLOR_ELEMENTO, SIGNOS } from "@/lib/astro/cielo";
import { ASTRO, FUENTE_GLIFOS, LunaSVG, NOMBRE_FASE, SolSVG, coloresCielo, falta, fechaCorta, type CieloAqui } from "./celeste";
import { agendaCeleste, colocarGlifos, type Acontecimiento } from "./reloj-partes";
import { ArcoDelDia } from "./reloj-linea";
import { Rotulo } from "./comun";
import { Accion, horaCorta } from "./inicio-piezas";

const RAD = Math.PI / 180;

/** Estrellas deterministas en el semicírculo del cielo (no bailan entre renders). */
const ESTRELLAS = Array.from({ length: 22 }, (_, i) => {
    const a = (i * 137.508 * Math.PI) / 180, r = 0.2 + 0.78 * Math.sqrt((i + 0.5) / 22);
    return { x: Math.cos(a) * r, y: -Math.abs(Math.sin(a) * r), r: [0.5, 0.8, 1.2][i % 3], o: 0.3 + ((i * 7) % 10) / 16 };
});

export interface CartaProps {
    lado: number;
    cielo: CieloAqui;
    id: string;
    /** xl: marcas cada 5°, Urano y Neptuno. */
    detalle: "l" | "xl";
    vivo: boolean;
}

/** La rueda: SVG puro, memorizado (solo cambia con el minuto o el tamaño). */
export const CartaCeleste = React.memo(function CartaCeleste({ lado, cielo, id, detalle, vivo }: CartaProps) {
    const R = lado / 2 - Math.max(4, lado * 0.02);
    const rExt = R, rInt = R * 0.84, rPlan = R * 0.71, rCentro = R * 0.6;
    const conLugar = !!cielo.ascendente;
    const ref = cielo.ascendente?.lon ?? 0;
    const punto = (lon: number, r: number): [number, number] => { const a = (lon - ref) * RAD; return [-r * Math.cos(a), r * Math.sin(a)]; };
    const f = (v: number) => v.toFixed(1);
    const col = coloresCielo(cielo.altura);
    const noche = cielo.altura === null ? 0.5 : Math.max(0, Math.min(1, (-cielo.altura - 4) / 10));
    const fsGlifo = Math.max(12, R * (detalle === "xl" ? 0.078 : 0.092));
    const astros = cielo.planetas.filter((p) => detalle === "xl" || (p.clave !== "urano" && p.clave !== "neptuno"));
    const sep = ((fsGlifo * 1.3) / rPlan) * (180 / Math.PI);
    const dibujo = colocarGlifos(astros.map((p) => ({ clave: p.clave, lon: p.lon })), sep);
    const signoSol = cielo.signos.sol.nombre;

    // Cajas de los rótulos de los ejes (AC a la izquierda, DC a la derecha, MC donde toque): un glifo
    // que caiga encima se dibuja más adentro (medido: «AC» × «♄», «DC» × «☿» según el día).
    const fsEje = Math.max(9, R * 0.05);
    const cajasEje: [number, number, number, number][] = conLugar ? [
        [-rInt + 6, -5 - fsEje, -rInt + 6 + fsEje * 1.5, -3],
        [rInt - 6 - fsEje * 1.5, -5 - fsEje, rInt - 6, -3],
        ...(cielo.medioCielo !== null ? [(() => { const [mx, my] = punto(cielo.medioCielo, rInt - 10); return [mx - fsEje * 0.8, my - fsEje * 0.6, mx + fsEje * 0.8, my + fsEje * 0.6] as [number, number, number, number]; })()] : []),
    ] : [];
    const chocaEje = (x: number, y: number, h: number) => cajasEje.some(([x0, y0, x1, y1]) => x + h > x0 && x - h < x1 && y + h > y0 && y - h < y1);
    const sector = (i: number) => {
        const a = i * 30, b = a + 30;
        const [x1, y1] = punto(a, rExt), [x2, y2] = punto(b, rExt), [x3, y3] = punto(b, rInt), [x4, y4] = punto(a, rInt);
        return `M${f(x1)} ${f(y1)}A${f(rExt)} ${f(rExt)} 0 0 0 ${f(x2)} ${f(y2)}L${f(x3)} ${f(y3)}A${f(rInt)} ${f(rInt)} 0 0 1 ${f(x4)} ${f(y4)}Z`;
    };

    return (
        <svg width={lado} height={lado} viewBox={`${-lado / 2} ${-lado / 2} ${lado} ${lado}`} className="overflow-visible" aria-hidden>
            <defs>
                <linearGradient id={`cielo-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={col.alto} />
                    <stop offset="100%" stopColor={col.horizonte} stopOpacity={0.75} />
                </linearGradient>
                <linearGradient id={`tierra-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1a1440" stopOpacity={0.85} />
                    <stop offset="100%" stopColor="#05041a" stopOpacity={0.95} />
                </linearGradient>
                <radialGradient id={`centro-${id}`}>
                    <stop offset="0%" stopColor="#080720" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#080720" stopOpacity={0} />
                </radialGradient>
                <radialGradient id={`anillo-${id}`}>
                    <stop offset="80%" stopColor="#0c0a26" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#1b1650" stopOpacity={0.7} />
                </radialGradient>
            </defs>

            {/* el cielo sobre el horizonte y la tierra debajo */}
            {conLugar ? (
                <>
                    <path d={`M${f(-rInt)} 0A${f(rInt)} ${f(rInt)} 0 0 1 ${f(rInt)} 0Z`} fill={`url(#cielo-${id})`} />
                    <path d={`M${f(-rInt)} 0A${f(rInt)} ${f(rInt)} 0 0 0 ${f(rInt)} 0Z`} fill={`url(#tierra-${id})`} />
                </>
            ) : <circle r={rInt} fill="#120f38" opacity={0.85} />}
            {noche > 0 && ESTRELLAS.map((e, i) => (
                <circle key={i} cx={e.x * rInt * 0.92} cy={(conLugar ? e.y : e.y * (i % 2 ? -1 : 1)) * rInt * 0.92} r={e.r * Math.max(1, lado / 360)} fill="#fff"
                    opacity={noche * e.o} className={vivo && i % 4 === 0 ? "ss-respirar" : undefined}
                    style={{ ["--ss-dur" as string]: `${3 + (i % 5) * 0.7}s`, transformBox: "fill-box", transformOrigin: "center" }} />
            ))}
            <circle r={rCentro} fill={`url(#centro-${id})`} />

            {/* el anillo del zodiaco: un sector por signo, en el color de su elemento */}
            <circle r={(rExt + rInt) / 2} fill="none" stroke={`url(#anillo-${id})`} strokeWidth={rExt - rInt} />
            {SIGNOS.map((s, i) => {
                const [gx, gy] = punto(i * 30 + 15, (rExt + rInt) / 2);
                const [lx1, ly1] = punto(i * 30, rInt), [lx2, ly2] = punto(i * 30, rExt);
                const conSol = s.nombre === signoSol;
                return (
                    <g key={s.nombre}>
                        <path d={sector(i)} fill={COLOR_ELEMENTO[s.elemento]} opacity={conSol ? 0.24 : i % 2 ? 0.08 : 0.13} />
                        <line x1={f(lx1)} y1={f(ly1)} x2={f(lx2)} y2={f(ly2)} stroke="#fff" strokeOpacity={0.22} strokeWidth={1} />
                        <text x={f(gx)} y={f(gy)} textAnchor="middle" dominantBaseline="central" fontSize={(rExt - rInt) * 0.55}
                            fill={COLOR_ELEMENTO[s.elemento]} opacity={conSol ? 1 : 0.78} style={{ fontFamily: FUENTE_GLIFOS }}>{s.glifo}</text>
                    </g>
                );
            })}
            {Array.from({ length: detalle === "xl" ? 72 : 36 }, (_, i) => {
                const paso = detalle === "xl" ? 5 : 10;
                if ((i * paso) % 30 === 0) return null;
                const [x1, y1] = punto(i * paso, rInt), [x2, y2] = punto(i * paso, (i * paso) % 10 === 0 ? rInt + 4 : rInt + 2.5);
                return <line key={i} x1={f(x1)} y1={f(y1)} x2={f(x2)} y2={f(y2)} stroke="#fff" strokeOpacity={0.3} strokeWidth={0.8} />;
            })}
            <circle r={rInt} fill="none" stroke="#fff" strokeOpacity={0.18} />
            <circle r={rExt} fill="none" stroke="#fff" strokeOpacity={0.14} />

            {/* ejes: horizonte (AC–DC) y meridiano (MC–FC) */}
            {conLugar && (
                <g stroke="#fff" strokeLinecap="round">
                    <line x1={f(-rInt)} y1={0} x2={f(rInt)} y2={0} strokeOpacity={0.42} strokeWidth={1.2} />
                    {cielo.medioCielo !== null && (() => {
                        const [mx, my] = punto(cielo.medioCielo, rInt), [ix, iy] = punto(cielo.medioCielo + 180, rInt);
                        return <line x1={f(ix)} y1={f(iy)} x2={f(mx)} y2={f(my)} strokeOpacity={0.2} strokeWidth={1} strokeDasharray="3 4" />;
                    })()}
                </g>
            )}
            {conLugar && (
                <g fontSize={Math.max(9, R * 0.05)} fontWeight={700} fill="#FFBF00" letterSpacing="0.08em">
                    <path d={`M${f(-rExt - 7)} -4L${f(-rExt - 1)} 0L${f(-rExt - 7)} 4Z`} fill="#FFBF00" />
                    <text x={f(-rInt + 6)} y={-5} opacity={0.9}>AC</text>
                    <text x={f(rInt - 6)} y={-5} textAnchor="end" fill="#fff" opacity={0.45}>DC</text>
                    {cielo.medioCielo !== null && (() => {
                        const [mx, my] = punto(cielo.medioCielo, rInt - 10);
                        return <text x={f(mx)} y={f(my)} textAnchor="middle" dominantBaseline="central" fill="#fff" opacity={0.5}>MC</text>;
                    })()}
                </g>
            )}

            {/* los astros: muesca en su longitud real, glifo donde quepa */}
            {astros.map((p) => {
                const [t1x, t1y] = punto(p.lon, rInt), [t2x, t2y] = punto(p.lon, rInt - 6);
                // Un astro pegado a un eje (AC, DC, MC) se dibuja un poco más adentro: su glifo ya no
                // pisa el rótulo del eje (medido: «AC» × «♄» con Saturno junto al ascendente).
                const lonDib = dibujo[p.clave] ?? p.lon;
                let [gx, gy] = punto(lonDib, rPlan);
                for (let paso = 1; paso <= 2 && chocaEje(gx, gy, fsGlifo * 0.6); paso++) [gx, gy] = punto(lonDib, rPlan - fsGlifo * 1.1 * paso);
                return (
                    <g key={p.clave}>
                        <title>{`${p.nombre} en ${p.signo.nombre} ${p.grado}°${p.retrogrado ? " (retrógrado)" : ""}`}</title>
                        <line x1={f(t1x)} y1={f(t1y)} x2={f(t2x)} y2={f(t2y)} stroke={p.color} strokeWidth={1.6} strokeLinecap="round" />
                        {p.clave === "sol" ? <SolSVG x={gx} y={gy} r={fsGlifo * 0.34} id={`c${id}`} vivo={vivo} /> :
                            p.clave === "luna" ? <LunaSVG x={gx} y={gy} r={fsGlifo * 0.46} fase={cielo.luna} id={`c${id}`} halo={false} /> : (
                                <>
                                    <text x={f(gx)} y={f(gy)} textAnchor="middle" dominantBaseline="central" fontSize={fsGlifo} fill={p.color}
                                        stroke="#0b0a24" strokeOpacity={0.7} strokeWidth={3} paintOrder="stroke" style={{ fontFamily: FUENTE_GLIFOS }}>{p.glifo}</text>
                                    {p.retrogrado && <text x={f(gx + fsGlifo * 0.55)} y={f(gy + fsGlifo * 0.42)} fontSize={fsGlifo * 0.45} fill={p.color} opacity={0.85}>℞</text>}
                                </>
                            )}
                    </g>
                );
            })}
        </svg>
    );
});

/** Descripción para lectores de pantalla de lo que dibuja la rueda. */
export function describirCarta(c: CieloAqui): string {
    const astros = c.planetas.filter((p) => p.clave !== "urano" && p.clave !== "neptuno")
        .map((p) => `${p.nombre} en ${p.signo.nombre} ${p.grado}°${p.retrogrado ? ", retrógrado" : ""}`).join("; ");
    return `${astros}.${c.ascendente ? ` Ascendente en ${c.ascendente.signo.nombre} ${c.ascendente.grado}°.` : " Sin ubicación: sin ascendente."}`;
}

/** Línea de un astro: glifo con halo, nombre y dónde está. */
function FilaAstro({ glifo, color, nombre, detalle, extra }: { glifo: React.ReactNode; color: string; nombre: string; detalle: string; extra?: string }) {
    return (
        <li className="flex min-w-0 items-baseline gap-2 leading-tight">
            <span aria-hidden className="w-4 shrink-0 text-center text-[15px]" style={{ color, fontFamily: FUENTE_GLIFOS, textShadow: `0 0 10px ${color}88` }}>{glifo}</span>
            <span className="min-w-0 truncate text-[12.5px] text-white/85" title={`${nombre}: ${detalle}${extra ? ` · ${extra}` : ""}`}>
                <span className="font-semibold text-white">{nombre}</span> · {detalle}{extra && <span className="text-white/55"> · {extra}</span>}
            </span>
        </li>
    );
}

export interface PanelProps {
    cielo: CieloAqui;
    ahora: Date;
    ancho: number;
    /** Cuántos acontecimientos próximos. */
    proximos: number;
    zonas?: React.ReactNode;
    acciones?: React.ReactNode;
    /** Dos columnas (xl ancho por debajo de la rueda). */
    columnas?: boolean;
}

/** La columna de lectura del cielo. */
export function PanelCielo({ cielo, ahora, ancho, proximos, zonas, acciones, columnas }: PanelProps) {
    const sol = cielo.planetas.find((p) => p.clave === "sol")!, luna = cielo.planetas.find((p) => p.clave === "luna")!;
    const hp = cielo.horaPlanetaria;
    const agenda: Acontecimiento[] = agendaCeleste({
        orto: cielo.orto, ocaso: cielo.ocaso, doradas: cielo.doradas, lunaHorizonte: cielo.lunaHorizonte, fases: cielo.fases,
        proximoSigno: cielo.proximoSigno, eclipse: cielo.eclipse, estacion: cielo.estacion, lat: cielo.ubicacion?.lat ?? null,
    }, ahora, { max: proximos });
    const lugar = cielo.ubicacion;

    const astros = (
        <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex min-w-0 flex-col gap-0.5">
                <Rotulo>El cielo ahora</Rotulo>
                {lugar && (
                    <span className="flex min-w-0 items-center gap-1 text-[11px] text-white/55" title={lugar.porDefecto ? `${lugar.nombre}: ubicación por defecto del clima, no la tuya` : lugar.nombre}>
                        <MapPin aria-hidden className="size-3 shrink-0" /><span className="truncate">{lugar.nombre}</span>{lugar.porDefecto && <span className="shrink-0 text-amber-200/70">· por defecto</span>}
                    </span>
                )}
            </div>
            <ul className="flex flex-col gap-1">
                <FilaAstro glifo="☉" color="#FFBF00" nombre="Sol" detalle={`${sol.signo.nombre} ${sol.grado}°`}
                    extra={cielo.altura !== null ? `a ${Math.round(cielo.altura)}°` : undefined} />
                <FilaAstro glifo="☽" color="#e9e4d4" nombre="Luna" detalle={`${luna.signo.nombre} ${luna.grado}°`}
                    extra={`${Math.round(cielo.luna.iluminada * 100)} %`} />
                {cielo.ascendente
                    ? <FilaAstro glifo={<b className="text-[10px] font-bold tracking-wide">AC</b>} color="#FFBF00" nombre="Ascendente" detalle={`${cielo.ascendente.signo.nombre} ${cielo.ascendente.grado}°`} />
                    : <li className="text-[11.5px] text-white/55">Sin ubicación: ascendente, orto y hora planetaria sin dato.</li>}
            </ul>
            {hp ? (
                <p className="text-[12px] leading-snug text-white/75" title="Hora planetaria: el día y la noche se parten en doce horas desiguales; cada una la rige un planeta en orden caldeo">
                    <span style={{ color: ASTRO[hp.planeta].color, fontFamily: FUENTE_GLIFOS }} aria-hidden>{ASTRO[hp.planeta].glifo} </span>
                    Hora de <b className="font-semibold text-white">{ASTRO[hp.planeta].nombre}</b> · hasta {horaCorta(hp.fin)}
                    {columnas && <span className="text-white/50"> · día de {ASTRO[hp.regenteDia].nombre}</span>}
                </p>
            ) : (
                <p className="text-[12px] text-white/60">Día de {ASTRO[cielo.regenteDia].nombre}</p>
            )}
        </div>
    );
    const futuro = (
        <div className="flex min-w-0 flex-col gap-1.5">
            {cielo.orto && cielo.ocaso && <ArcoDelDia cielo={cielo} ahora={ahora} ancho={Math.min(columnas ? ancho / 2 - 12 : ancho, columnas ? 260 : 210)} />}
            {agenda.length > 0 && (
                <ul className="flex flex-col gap-0.5" aria-label="Próximos acontecimientos del cielo">
                    {agenda.map((a) => (
                        <li key={a.clave} className="flex min-w-0 items-baseline justify-between gap-2 text-[12px] leading-tight">
                            <span className="min-w-0 truncate text-white/80" title={a.texto}>{a.texto}</span>
                            <span className="shrink-0 tabular-nums text-white/55" title={a.fecha.toLocaleString("es-ES")}>
                                {a.fecha.getTime() - ahora.getTime() < 36 * 3_600_000 ? horaCorta(a.fecha) : `${fechaCorta(a.fecha, ahora)} · ${falta(a.fecha, ahora)}`}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
    return (
        <div className={`flex min-w-0 flex-col ${columnas ? "w-full gap-3" : "gap-2.5"}`} style={{ maxWidth: columnas ? undefined : ancho }}>
            {columnas ? <div className="grid grid-cols-2 gap-4">{astros}{futuro}</div> : <>{astros}{futuro}</>}
            {zonas}
            {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
        </div>
    );
}

/** Línea corta de la próxima fase: «Luna llena · en 3 d». */
export function LineaFase({ cielo, ahora, className = "" }: { cielo: CieloAqui; ahora: Date; className?: string }) {
    const f = cielo.fases.find((x) => x.fecha.getTime() > ahora.getTime());
    if (!f) return null;
    return <span className={className} title={f.fecha.toLocaleString("es-ES")}>{NOMBRE_FASE[f.tipo]} {falta(f.fecha, ahora)}</span>;
}

/** El botón honesto para fijar la ubicación real. */
export function BotonUbicacion({ cielo, grande }: { cielo: CieloAqui; grande?: boolean }) {
    const [estado, setEstado] = React.useState<"listo" | "pidiendo" | "error">("listo");
    if (!cielo.pedirUbicacion || (cielo.ubicacion && !cielo.ubicacion.porDefecto)) return null;
    const pedir = async () => {
        setEstado("pidiendo");
        try { await cielo.pedirUbicacion!(); setEstado("listo"); } catch { setEstado("error"); }
    };
    return (
        <Accion icono={MapPin} color="#FFBF00" grande={grande} onClick={pedir} disabled={estado === "pidiendo"}
            title={estado === "error" ? "El navegador no dio la ubicación: revisa el permiso" : "Calcular el cielo para donde estás"}>
            {estado === "pidiendo" ? "Buscando…" : estado === "error" ? "Sin permiso: reintentar" : "Usar mi ubicación"}
        </Accion>
    );
}
