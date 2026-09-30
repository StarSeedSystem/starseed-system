'use client';

// ════════════════════════════════════════════════════════════════
// Carta natal — TU carta de verdad y los tránsitos de hoy (Ola 0929, paquete B).
// ----------------------------------------------------------------
// Antes: «tránsitos» inventados por el adaptador. Ahora se calcula tu carta REAL con tus
// datos de nacimiento (fecha, hora si la sabes y lugar): Sol, Luna y planetas clásicos
// (src/lib/astro.ts), Ascendente y Medio Cielo por el tiempo sidéreo local, casas iguales,
// aspectos natales y los tránsitos de hoy sobre tu carta. Sin hora no hay Ascendente ni
// casas, y se dice. Sin datos, se enseña el cielo de AHORA y se invita a añadirlos.
// Tus datos se guardan solo en este dispositivo (y puedes borrarlos). El lugar se busca con
// el geocodificador público del Clima solo cuando pulsas «Buscar».
//
//   micro      → el glifo de tu signo solar.
//   s          → la rueda mínima y tus tres pilares (Sol · Luna · Ascendente).
//   m          → rueda con aspectos + pilares + el tránsito más exacto de hoy.
//   panorámico → rueda · pilares · tránsitos.   torre → en columna.
//   l          → rueda con casas y aspectos, pilares, tres tránsitos y «Editar».
//   xl         → + tránsitos en la rueda, tabla de posiciones, balance de elementos.
// Estados honestos: cargando (hasta montar), vacío (sin datos → el cielo de ahora + formulario)
// y error del formulario (fecha imposible, lugar no encontrado).
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Sparkles, Pencil, Search, MapPin, Trash2, Save, X } from "lucide-react";
import { WidgetShell, WidgetSkeleton, useMarcoUnificado, type ElementSize } from "../../kit";
import { useWeatherLocationOpcional } from "@/modules/weather/context/weather-location-context";
import { COLOR_ELEMENTO } from "@/lib/astro/cielo";
import { cn } from "@/lib/utils";
import {
    ASPECTOS, ELEMENTO_SIGNO, GLIFO_SIGNO, NOMBRE_SIGNO, aspectos, calcularCarta, cielo, elementos, frasePosicion, validarNacimiento,
    type Carta, type Cuerpo, type DatosNacimiento,
} from "./_paquete-b/datos-natal";
import { AccionB, MicroB, RaizB, RotuloB, estilosB, tintaB, useAhoraB, useLienzoB, useVisibleB, type LienzoB } from "./_paquete-b/piezas-b";

const FAMILIA = { acento: "#818cf8", acento2: "#23d5ab" };
const CLAVE = "starseed.carta-natal.v1";

function leerGuardado(): DatosNacimiento | null {
    try {
        const j = JSON.parse(localStorage.getItem(CLAVE) || "null");
        if (j && typeof j.fecha === "string") return { fecha: j.fecha, hora: typeof j.hora === "string" ? j.hora : null, lugar: j.lugar && typeof j.lugar.lat === "number" ? j.lugar : null };
    } catch { /* sin almacén */ }
    return null;
}

export function NatalChartWidget() {
    const marco = useMarcoUnificado();
    const [montado, setMontado] = useState(false);
    const [datos, setDatos] = useState<DatosNacimiento | null>(null);
    const [editando, setEditando] = useState(false);
    useEffect(() => { setDatos(leerGuardado()); setMontado(true); }, []);
    const guardar = useCallback((d: DatosNacimiento | null) => {
        setDatos(d);
        setEditando(false);
        try { if (d) localStorage.setItem(CLAVE, JSON.stringify(d)); else localStorage.removeItem(CLAVE); } catch { /* cuota */ }
    }, []);
    return (
        <WidgetShell
            title="Carta natal"
            subtitle={datos ? "Tu cielo y sus tránsitos" : "El cielo de ahora"}
            icon={Sparkles}
            bare={marco?.base === "micro"}
            actions={montado && datos && !editando ? (
                <button type="button" onClick={() => setEditando(true)} aria-label="Editar tus datos de nacimiento"
                    className="grid size-7 cursor-pointer place-items-center rounded-full ss-redondo text-white/70 transition-colors hover:text-white">
                    <Pencil className="size-3.5" aria-hidden />
                </button>
            ) : undefined}
        >
            {(size) => <Cuerpo size={size} montado={montado} datos={datos} editando={editando} setEditando={setEditando} guardar={guardar} />}
        </WidgetShell>
    );
}

function Cuerpo({ size, montado, datos, editando, setEditando, guardar }: {
    size: ElementSize; montado: boolean; datos: DatosNacimiento | null; editando: boolean;
    setEditando: (v: boolean) => void; guardar: (d: DatosNacimiento | null) => void;
}) {
    const lienzo = useLienzoB(size, FAMILIA);
    const ref = useRef<HTMLDivElement>(null);
    const visible = useVisibleB(ref);
    const ahora = useAhoraB(10 * 60_000, visible);
    const carta = useMemo(() => (datos ? calcularCarta(datos) : null), [datos]);
    const hoy = useMemo(() => (ahora ? cielo(new Date(ahora)) : null), [ahora]);

    let contenido: ReactNode;
    if (!montado || !hoy) contenido = <WidgetSkeleton variant={lienzo.base === "micro" ? "rings" : "block"} />;
    else if (editando) contenido = <Formulario inicial={datos} lienzo={lienzo} guardar={guardar} cancelar={() => setEditando(false)} />;
    else if (!carta) contenido = <SinCarta hoy={hoy} lienzo={lienzo} editar={() => setEditando(true)} />;
    else contenido = <ConCarta carta={carta} hoy={hoy} lienzo={lienzo} datos={datos!} editar={() => setEditando(true)} />;
    return <RaizB ref={ref} lienzo={lienzo} visible={visible}>{contenido}</RaizB>;
}

// ── Sin datos: el cielo de ahora ────────────────────────────────────────────

function SinCarta({ hoy, lienzo, editar }: { hoy: Cuerpo[]; lienzo: LienzoB; editar: () => void }) {
    const sol = hoy.find((c) => c.cuerpo === "Sol")!;
    const luna = hoy.find((c) => c.cuerpo === "Luna")!;
    const b = lienzo.base;
    const frase = `Ahora: Sol en ${sol.signo}, Luna en ${luna.signo}. Añade tu nacimiento para ver tu carta.`;
    if (b === "micro") {
        return (
            <MicroB onClick={editar} etiqueta={frase} rotulo={`Luna en ${luna.signo}`}
                glifo={(l) => <span className="leading-none" style={{ fontSize: l, color: COLOR_ELEMENTO[ELEMENTO_SIGNO[luna.indiceSigno]] }}>{GLIFO_SIGNO[luna.indiceSigno]}</span>} />
        );
    }
    const cta = <AccionB onClick={editar} icono={Sparkles} color={lienzo.acento} tono="llena" tactil={lienzo.tactil}>Añadir mi nacimiento</AccionB>;
    const rueda = <Rueda natal={hoy} asc={null} lienzo={lienzo} detalle={b === "s" ? "min" : "normal"} etiqueta={`El cielo de ahora: ${hoy.map(frasePosicion).join(", ")}`} className="h-full w-full" />;
    if (b === "s") return <div className="flex h-full min-h-0 flex-col items-center gap-1.5">{<div className="min-h-0 w-full flex-1">{rueda}</div>}{cta}</div>;
    const texto = (
        <div className="flex min-w-0 flex-col gap-2">
            <RotuloB>El cielo de ahora</RotuloB>
            <p className="text-[13px] leading-snug text-white/80">Sol en <b className="font-semibold text-white">{sol.signo}</b> · Luna en <b className="font-semibold text-white">{luna.signo}</b></p>
            <p className="text-[12px] leading-relaxed text-white/60">Tu carta natal sale de tu fecha, hora y lugar de nacimiento. Se guardan solo en este dispositivo.</p>
            {cta}
        </div>
    );
    if (lienzo.clase === "panoramico" || b === "xl") {
        return <div className="grid h-full min-h-0 items-center gap-4" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>{rueda}{texto}</div>;
    }
    return <div className="flex h-full min-h-0 flex-col gap-2"><div className="min-h-0 flex-1">{rueda}</div>{texto}</div>;
}

// ── Con carta ───────────────────────────────────────────────────────────────

function ConCarta({ carta, hoy, lienzo, datos, editar }: { carta: Carta; hoy: Cuerpo[]; lienzo: LienzoB; datos: DatosNacimiento; editar: () => void }) {
    const b = lienzo.base;
    const sol = carta.cuerpos.find((c) => c.cuerpo === "Sol")!;
    const luna = carta.cuerpos.find((c) => c.cuerpo === "Luna")!;
    const asc = carta.cuerpos.find((c) => c.cuerpo === "Ascendente") ?? null;
    const natales = useMemo(() => aspectos(carta.cuerpos, carta.cuerpos, true), [carta]);
    const transitos = useMemo(() => aspectos(hoy, carta.cuerpos.filter((c) => c.cuerpo !== "Medio Cielo")), [hoy, carta]);
    const pilares = `Sol en ${sol.signo}, Luna en ${luna.signo}${asc ? `, Ascendente ${asc.signo}` : ""}`;

    if (b === "micro") {
        return (
            <MicroB etiqueta={`Tu carta: ${pilares}`} rotulo={sol.signo}
                glifo={(l) => <span className="leading-none" style={{ fontSize: l, color: COLOR_ELEMENTO[ELEMENTO_SIGNO[sol.indiceSigno]] }}>{GLIFO_SIGNO[sol.indiceSigno]}</span>} />
        );
    }
    const detalle = b === "s" ? "min" : b === "xl" ? "pleno" : "normal";
    const rueda = (clase = "h-full w-full") => (
        <Rueda natal={carta.cuerpos} transitos={detalle === "pleno" ? hoy : undefined} aspectosNatales={detalle !== "min" ? natales : []} asc={carta.asc} lienzo={lienzo} detalle={detalle}
            etiqueta={`Tu carta natal: ${carta.cuerpos.map(frasePosicion).join(", ")}`} className={clase} />
    );
    const tres = <Pilares sol={sol} luna={luna} asc={asc} sinHora={carta.sinHora} lienzo={lienzo} />;
    const listaTransitos = (max: number) => <Transitos lista={transitos.slice(0, max)} />;

    if (b === "s") return <div className="flex h-full min-h-0 flex-col items-center gap-1"><div className="min-h-0 w-full flex-1">{rueda()}</div>{tres}</div>;
    if (lienzo.clase === "panoramico") {
        return (
            <div className="grid h-full min-h-0 items-center gap-4" style={{ gridTemplateColumns: "auto minmax(0, 1fr) minmax(0, 1.2fr)" }}>
                <div className="h-full" style={{ aspectRatio: "1 / 1" }}>{rueda()}</div>
                {tres}
                {listaTransitos(2)}
            </div>
        );
    }
    if (b === "m" && lienzo.clase !== "torre") {
        return <div className="flex h-full min-h-0 flex-col gap-2"><div className="min-h-0 flex-1">{rueda()}</div>{tres}{listaTransitos(1)}</div>;
    }
    if (lienzo.clase === "torre" || b === "l") {
        return (
            <div className="flex h-full min-h-0 flex-col gap-2.5">
                <div className="min-h-[110px] flex-1">{rueda()}</div>
                {tres}
                {listaTransitos(3)}
                <p className="text-[10px] text-white/45">{datos.fecha}{datos.hora ? ` · ${datos.hora}` : " · sin hora"}{datos.lugar ? ` · ${datos.lugar.nombre}` : ""}</p>
            </div>
        );
    }
    const el = elementos(carta.cuerpos);
    const totalEl = Object.values(el).reduce((s, n) => s + n, 0) || 1;
    return (
        <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1fr)" }}>
            <div className="flex min-h-0 flex-col gap-2">
                <div className="min-h-0 flex-1">{rueda()}</div>
                {tres}
            </div>
            <div className="flex min-h-0 flex-col gap-3 overflow-auto border-l border-white/[0.08] pl-4">
                <table className="w-full text-[12px] tabular-nums" aria-label="Posiciones natales">
                    <tbody>
                        {carta.cuerpos.map((c) => (
                            <tr key={c.cuerpo} className="border-b border-white/[0.05] last:border-0">
                                <th scope="row" className="py-0.5 pr-2 text-left font-semibold text-white/85"><span className="mr-1.5 inline-block w-4 text-center" aria-hidden>{c.simbolo}</span>{c.cuerpo}</th>
                                <td className="py-0.5 pr-2" style={{ color: tintaB(COLOR_ELEMENTO[ELEMENTO_SIGNO[c.indiceSigno]], 0.3) }}>{GLIFO_SIGNO[c.indiceSigno]} {c.signo}</td>
                                <td className="py-0.5 pr-2 text-right text-white/70">{Math.floor(c.grado)}°{String(Math.floor((c.grado % 1) * 60)).padStart(2, "0")}′</td>
                                <td className="py-0.5 text-right text-white/50">{c.casa ? `casa ${c.casa}` : ""}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="flex flex-col gap-1">
                    <RotuloB>Elementos</RotuloB>
                    <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/[0.08]" role="img" aria-label={`Fuego ${el.fuego}, tierra ${el.tierra}, aire ${el.aire}, agua ${el.agua}`}>
                        {(["fuego", "tierra", "aire", "agua"] as const).map((k, i) => (
                            <span key={k} className={estilosB.crecer} style={{ width: `${(el[k] / totalEl) * 100}%`, background: COLOR_ELEMENTO[k], marginLeft: i ? 1 : 0 }} />
                        ))}
                    </div>
                    <p className="text-[11px] capitalize text-white/60">fuego {el.fuego} · tierra {el.tierra} · aire {el.aire} · agua {el.agua}</p>
                </div>
                {listaTransitos(5)}
                <div className="mt-auto flex flex-wrap gap-1.5">
                    <AccionB onClick={editar} icono={Pencil} color={lienzo.acento} tactil={lienzo.tactil}>Editar nacimiento</AccionB>
                </div>
            </div>
        </div>
    );
}

function Pilares({ sol, luna, asc, sinHora, lienzo }: { sol: Cuerpo; luna: Cuerpo; asc: Cuerpo | null; sinHora: boolean; lienzo: LienzoB }) {
    const item = (c: Cuerpo | null, etiqueta: string) => c && (
        <li className="flex min-w-0 items-center gap-1.5" title={`${etiqueta} en ${c.signo} ${Math.floor(c.grado)}°`}>
            <span className="text-[18px] leading-none" style={{ color: COLOR_ELEMENTO[ELEMENTO_SIGNO[c.indiceSigno]] }} aria-hidden>{GLIFO_SIGNO[c.indiceSigno]}</span>
            <span className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/50">{etiqueta}</span>
                <span className={cn("block font-semibold text-white/90", lienzo.tv ? "text-[15px]" : "text-[13px]")}>{c.signo}</span>
            </span>
        </li>
    );
    return (
        <div className="flex flex-col gap-1">
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Tus tres pilares">
                {item(sol, "Sol")}
                {item(luna, "Luna")}
                {item(asc, "Ascendente")}
            </ul>
            {sinHora && <p className="text-[10px] text-white/45">Sin hora: sin Ascendente ni casas; la Luna es aproximada.</p>}
        </div>
    );
}

function Transitos({ lista }: { lista: ReturnType<typeof aspectos> }) {
    if (lista.length === 0) return <p className="text-[11px] text-white/50">Hoy no hay tránsitos cerrados sobre tu carta.</p>;
    return (
        <div className="flex flex-col gap-1">
            <RotuloB>Tránsitos de hoy</RotuloB>
            <ul className="flex flex-col gap-0.5" aria-label="Tránsitos de hoy sobre tu carta">
                {lista.map((t) => {
                    const color = ASPECTOS.find((a) => a.tipo === t.tipo)?.color ?? "#fff";
                    return (
                        <li key={`${t.a}-${t.b}-${t.tipo}`} className="flex items-center gap-2 text-[12px]">
                            <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                            <span className="min-w-0 flex-1 text-white/80 line-clamp-1">{t.a} en {t.tipo} a tu {t.b}</span>
                            <span className="shrink-0 tabular-nums text-white/45">{t.orbe.toLocaleString("es-ES", { maximumFractionDigits: 1 })}°</span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

// ── La rueda ────────────────────────────────────────────────────────────────

/** Ángulo de pantalla (grados, antihorario desde la derecha) de una longitud: Ascendente (o Aries 0°) a la izquierda. */
function angulo(lon: number, asc: number | null): number {
    return 180 + (lon - (asc ?? 0));
}
function punto(lon: number, asc: number | null, r: number): [number, number] {
    const a = (angulo(lon, asc) * Math.PI) / 180;
    return [100 + Math.cos(a) * r, 100 - Math.sin(a) * r];
}
/** Reparte los cuerpos que caen demasiado juntos (≥ 9° entre sí) para que sus glifos no se pisen. */
function repartir(c: Cuerpo[]): { c: Cuerpo; lon: number }[] {
    const orden = [...c].sort((a, b) => a.lon - b.lon).map((x) => ({ c: x, lon: x.lon }));
    for (let vuelta = 0; vuelta < 3; vuelta++) {
        for (let i = 1; i < orden.length; i++) if (orden[i].lon - orden[i - 1].lon < 9) orden[i].lon = orden[i - 1].lon + 9;
    }
    return orden;
}

function Rueda({ natal, transitos, aspectosNatales = [], asc, lienzo, detalle, etiqueta, className }: {
    natal: Cuerpo[]; transitos?: Cuerpo[]; aspectosNatales?: ReturnType<typeof aspectos>; asc: number | null; lienzo: LienzoB;
    detalle: "min" | "normal" | "pleno"; etiqueta: string; className?: string;
}) {
    const id = useId().replace(/:/g, "");
    const planetas = natal.filter((c) => c.cuerpo !== "Ascendente" && c.cuerpo !== "Medio Cielo");
    const porNombre = new Map(planetas.map((c) => [c.cuerpo, c]));
    const vivo = lienzo.nivel !== "ligero";
    return (
        <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet" className={cn("block", className)} role="img" aria-label={etiqueta}>
            <defs>
                <radialGradient id={`f${id}`}>
                    <stop offset="0%" stopColor={lienzo.acento} stopOpacity={0.16} />
                    <stop offset="100%" stopColor={lienzo.acento} stopOpacity={0.02} />
                </radialGradient>
            </defs>
            <circle cx={100} cy={100} r={96} fill={`url(#f${id})`} />
            {/* anillo del zodiaco: doce sectores con el color de su elemento */}
            <g className={vivo && asc === null ? estilosB.orbita : undefined} style={{ ["--b-dur" as string]: "600s" }}>
                {Array.from({ length: 12 }, (_, i) => {
                    const a0 = (angulo(i * 30, asc) * Math.PI) / 180, a1 = (angulo(i * 30 + 30, asc) * Math.PI) / 180;
                    const p = (r: number, a: number) => `${(100 + Math.cos(a) * r).toFixed(2)} ${(100 - Math.sin(a) * r).toFixed(2)}`;
                    const color = COLOR_ELEMENTO[ELEMENTO_SIGNO[i]];
                    const [gx, gy] = punto(i * 30 + 15, asc, 88);
                    return (
                        <g key={i}>
                            <path d={`M${p(96, a0)} A96 96 0 0 0 ${p(96, a1)} L${p(80, a1)} A80 80 0 0 1 ${p(80, a0)} Z`} fill={color} fillOpacity={i % 2 ? 0.1 : 0.16} stroke="#fff" strokeOpacity={0.12} strokeWidth={0.4} />
                            <text x={gx} y={gy} textAnchor="middle" dominantBaseline="central" fontSize={detalle === "min" ? 11 : 9.5} fill={tintaB(color, 0.3)}>{GLIFO_SIGNO[i]}<title>{NOMBRE_SIGNO[i]}</title></text>
                        </g>
                    );
                })}
            </g>
            <circle cx={100} cy={100} r={80} fill="none" stroke="#fff" strokeOpacity={0.15} strokeWidth={0.5} />
            {/* casas iguales desde el Ascendente */}
            {asc !== null && detalle !== "min" && Array.from({ length: 12 }, (_, k) => {
                const [x1, y1] = punto(asc + k * 30, asc, 34), [x2, y2] = punto(asc + k * 30, asc, 80);
                const eje = k % 3 === 0;
                return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeOpacity={eje ? 0.45 : 0.12} strokeWidth={eje ? 0.9 : 0.5} />;
            })}
            {asc !== null && (() => { const [x, y] = punto(asc, asc, 99); return <text x={x + 1} y={y} textAnchor="end" dominantBaseline="central" fontSize={6.5} fontWeight={700} fill="#fff" fillOpacity={0.75}>AC</text>; })()}
            {/* aspectos natales */}
            {detalle !== "min" && aspectosNatales.filter((a) => a.tipo !== "conjunción" && a.a !== "Ascendente" && a.b !== "Ascendente").slice(0, 12).map((a) => {
                const x = porNombre.get(a.a as Cuerpo["cuerpo"]), y = porNombre.get(a.b as Cuerpo["cuerpo"]);
                if (!x || !y) return null;
                const [x1, y1] = punto(x.lon, asc, 34), [x2, y2] = punto(y.lon, asc, 34);
                const color = ASPECTOS.find((z) => z.tipo === a.tipo)?.color ?? "#fff";
                return <line key={`${a.a}-${a.b}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeOpacity={0.25 + 0.4 * a.exacto} strokeWidth={0.7}><title>{`${a.a} ${a.tipo} ${a.b}`}</title></line>;
            })}
            <circle cx={100} cy={100} r={34} fill="none" stroke="#fff" strokeOpacity={0.1} strokeWidth={0.5} />
            {/* tránsitos de hoy (anillo interior del zodiaco, tenues) */}
            {transitos && repartir(transitos).map(({ c, lon }) => {
                const [x, y] = punto(lon, asc, 73);
                return <text key={`t${c.cuerpo}`} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={7} fill="#fff" fillOpacity={0.45}>{c.simbolo}<title>{`Hoy: ${frasePosicion(c)}`}</title></text>;
            })}
            {/* planetas natales */}
            {repartir(planetas).map(({ c, lon }) => {
                const [x, y] = punto(lon, asc, transitos ? 58 : 62);
                const [tx, ty] = punto(c.lon, asc, 80);
                const [ux, uy] = punto(c.lon, asc, 76);
                const color = COLOR_ELEMENTO[ELEMENTO_SIGNO[c.indiceSigno]];
                return (
                    <g key={c.cuerpo}>
                        <line x1={tx} y1={ty} x2={ux} y2={uy} stroke={color} strokeWidth={1} strokeOpacity={0.8} />
                        <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={detalle === "min" ? 12 : 10.5} fontWeight={600} fill={tintaB(color, 0.45)}>{c.simbolo}<title>{frasePosicion(c)}</title></text>
                    </g>
                );
            })}
        </svg>
    );
}

// ── Formulario ──────────────────────────────────────────────────────────────

function Formulario({ inicial, lienzo, guardar, cancelar }: { inicial: DatosNacimiento | null; lienzo: LienzoB; guardar: (d: DatosNacimiento | null) => void; cancelar: () => void }) {
    const clima = useWeatherLocationOpcional();
    const id = useId().replace(/:/g, "");
    const [fecha, setFecha] = useState(inicial?.fecha ?? "");
    const [hora, setHora] = useState(inicial?.hora ?? "");
    const [sinHora, setSinHora] = useState(inicial ? !inicial.hora : false);
    const [lugar, setLugar] = useState<DatosNacimiento["lugar"]>(inicial?.lugar ?? null);
    const [busqueda, setBusqueda] = useState("");
    const [resultados, setResultados] = useState<NonNullable<DatosNacimiento["lugar"]>[] | null>(null);
    const [buscando, setBuscando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const alto = lienzo.tactil ? "min-h-11" : "min-h-8";
    const campo = cn(estilosB.foco, alto, "w-full rounded-full ss-redondo bg-white/[0.06] px-3 text-[12px] text-white outline-none [color-scheme:dark]");

    const buscar = async () => {
        const q = busqueda.trim();
        if (q.length < 2) return;
        setBuscando(true);
        setError(null);
        try {
            const { searchPlaces } = await import("@/lib/geocoding");
            const r = await searchPlaces(q, 5);
            setResultados(r.map((x) => ({ nombre: [x.name, x.country].filter(Boolean).join(", "), lat: x.lat, lon: x.lon, zona: x.timezone ?? null })));
            if (r.length === 0) setError("No encontré ese lugar: prueba con la ciudad y el país.");
        } catch {
            setError("No se pudo buscar el lugar ahora.");
        } finally {
            setBuscando(false);
        }
    };
    const enviar = (e: FormEvent) => {
        e.preventDefault();
        const d: DatosNacimiento = { fecha, hora: sinHora || !hora ? null : hora, lugar };
        const fallo = validarNacimiento(d);
        if (fallo) { setError(fallo); return; }
        guardar(d);
    };
    return (
        <form onSubmit={enviar} className={cn(estilosB.entrar, "flex h-full min-h-0 flex-col gap-2 overflow-auto")} aria-label="Tus datos de nacimiento">
            <div className="grid gap-2" style={{ gridTemplateColumns: lienzo.base === "s" || lienzo.base === "m" ? "1fr" : "1fr 1fr" }}>
                <label htmlFor={`${id}-f`} className="flex flex-col gap-1 text-[11px] font-semibold text-white/70">Fecha
                    <input id={`${id}-f`} type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />
                </label>
                <label htmlFor={`${id}-h`} className="flex flex-col gap-1 text-[11px] font-semibold text-white/70">Hora (local del lugar)
                    <input id={`${id}-h`} type="time" value={hora} disabled={sinHora} onChange={(e) => setHora(e.target.value)} className={cn(campo, "disabled:opacity-40")} />
                </label>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] text-white/70">
                <input type="checkbox" checked={sinHora} onChange={(e) => setSinHora(e.target.checked)} className="size-4 cursor-pointer accent-current" style={{ color: lienzo.acento }} />
                No sé la hora
            </label>
            <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-white/70">Lugar {lugar ? <b className="font-semibold text-white">· {lugar.nombre}</b> : <span className="font-normal text-white/45">(para el Ascendente)</span>}</span>
                <div className="flex gap-1.5">
                    <label className="sr-only" htmlFor={`${id}-l`}>Buscar lugar</label>
                    <input id={`${id}-l`} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Ciudad, país"
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void buscar(); } }} className={cn(campo, "flex-1")} />
                    <AccionB onClick={() => void buscar()} icono={Search} color={lienzo.acento2} tactil={lienzo.tactil} disabled={buscando}>{buscando ? "Buscando…" : "Buscar"}</AccionB>
                </div>
                {clima && (
                    <button type="button" onClick={() => setLugar({ nombre: clima.location.name, lat: clima.location.lat, lon: clima.location.lon, zona: clima.location.timezone ?? null })}
                        className={cn(estilosB.foco, "inline-flex w-fit cursor-pointer items-center gap-1 rounded-full ss-redondo px-2 text-[11px] text-white/65 hover:text-white", alto)}>
                        <MapPin className="size-3.5" aria-hidden /> Usar {clima.location.name}
                    </button>
                )}
                {resultados && resultados.length > 0 && (
                    <ul className="flex flex-col" aria-label="Lugares encontrados">
                        {resultados.map((r) => (
                            <li key={`${r.lat},${r.lon}`}>
                                <button type="button" onClick={() => { setLugar(r); setResultados(null); }}
                                    className={cn(estilosB.foco, estilosB.fila, "w-full cursor-pointer rounded-[12px] px-2 text-left text-[12px] text-white/85", alto)}>{r.nombre}</button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {error && <p role="alert" className="text-[11px] text-rose-300">{error}</p>}
            <p className="text-[10px] text-white/45">Tus datos de nacimiento se guardan solo en este dispositivo.</p>
            <div className="mt-auto flex flex-wrap items-center gap-1.5">
                <AccionB icono={Save} color={lienzo.acento} tono="llena" tactil={lienzo.tactil} enviar>Guardar</AccionB>
                <AccionB icono={X} color="#94a3b8" tactil={lienzo.tactil} onClick={cancelar}>Cancelar</AccionB>
                {inicial && <AccionB icono={Trash2} color="#f43f5e" tactil={lienzo.tactil} onClick={() => guardar(null)}>Borrar mis datos</AccionB>}
            </div>
        </form>
    );
}
