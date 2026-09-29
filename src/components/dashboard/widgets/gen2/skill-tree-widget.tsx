'use client';

// ════════════════════════════════════════════════════════════════
// Árbol del mérito — tus insignias como hojas de un árbol vivo (Ola 0929, paquete B).
// ----------------------------------------------------------------
// Meritocracia del entendimiento (CLAUDE.md §3): la autoridad técnica se gana con
// sabiduría aplicada VERIFICABLE. Datos REALES: el catálogo `badges`, tus facetas
// `profiles` y lo otorgado en `profile_badges`. Cada rama es un área (Política,
// Educación, Cultura, General) y cada hoja una insignia: encendida si es tuya, con
// anillo blanco si otra persona la ha AVALADO (solo esas cuentan como mérito: +0,5 a tu
// voz en su área, tope ×2, y solo en las decisiones que activan la meritocracia).
// Sin sondeo: una lectura compartida (TTL 30 min).
//
//   micro      → anillo: cuántas insignias tienes del catálogo.
//   s          → el árbol y «N de M».
//   m          → + tus áreas con su recuento.
//   panorámico → árbol a la izquierda, áreas a la derecha.   torre → árbol arriba.
//   l          → + barras por área con tu peso de mérito y tus últimas insignias.
//   xl         → árbol grande con nombres de rama; áreas, últimas, cómo se gana y acciones.
// Estados honestos: cargando, error con reintento, sin sesión y catálogo vacío.
// ════════════════════════════════════════════════════════════════

import { useCallback, useId, useMemo, useRef, type ReactNode } from "react";
import Link from "next/link";
import { GitBranch, RefreshCw, Award, BookOpen, LogIn, BadgeCheck } from "lucide-react";
import { WidgetShell, WidgetEmptyState, WidgetErrorState, WidgetSkeleton, useMarcoUnificado, timeAgo, type ElementSize } from "../../kit";
import { useCurrentUid } from "@/lib/widget-data/os-live";
import { cn } from "@/lib/utils";
import { useDatoCompartido, type ResultadoDato } from "./_paquete-b/cache-compartida";
import {
    AREAS_MERITO, COLOR_AREA, ETIQUETA_AREA, cargarMerito, resumenAreas,
    type AreaMerito, type DatosMerito,
} from "./_paquete-b/datos-merito";
import { AccionB, AnilloB, RaizB, RotuloB, estilosB, tintaB, useLienzoB, useVisibleB, type LienzoB } from "./_paquete-b/piezas-b";

const FAMILIA = { acento: "#7c5cff", acento2: "#23d5ab" };
const DEC1 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

export function SkillTreeWidget() {
    const marco = useMarcoUnificado();
    const { uid, ready } = useCurrentUid();
    const cargar = useCallback(() => cargarMerito(uid), [uid]);
    const datos = useDatoCompartido<DatosMerito>(ready ? `merito.v1.${uid ?? "anon"}` : null, cargar, { ttlMs: 30 * 60_000 });
    return (
        <WidgetShell
            title="Árbol del mérito"
            subtitle="Insignias verificables"
            icon={GitBranch}
            bare={marco?.base === "micro"}
            actions={
                <button type="button" onClick={datos.recargar} aria-label="Actualizar insignias"
                    className="grid size-7 cursor-pointer place-items-center rounded-full ss-redondo text-white/70 transition-colors hover:text-white">
                    <RefreshCw className={cn("size-3.5", datos.estado === "cargando" && "animate-spin motion-reduce:animate-none")} aria-hidden />
                </button>
            }
        >
            {(size) => <Cuerpo size={size} datos={datos} />}
        </WidgetShell>
    );
}

function Cuerpo({ size, datos }: { size: ElementSize; datos: ResultadoDato<DatosMerito> }) {
    const lienzo = useLienzoB(size, FAMILIA);
    const ref = useRef<HTMLDivElement>(null);
    const visible = useVisibleB(ref);
    let contenido: ReactNode;
    if (!datos.dato) {
        contenido = datos.estado === "error"
            ? <WidgetErrorState message={datos.error ?? "No se pudieron leer las insignias."} onRetry={datos.recargar} />
            : <WidgetSkeleton variant={lienzo.base === "micro" ? "rings" : "block"} />;
    } else if (datos.dato.catalogo.length === 0) {
        contenido = lienzo.base === "micro"
            ? <p className="grid h-full place-items-center text-[11px] text-white/60">sin catálogo</p>
            : <WidgetEmptyState icon={Award} title="Aún no hay insignias en el catálogo" message="Cuando la comunidad defina sus insignias, aquí crecerá tu árbol." actionLabel="Ver insignias" actionHref="/insignias" accent={lienzo.acento} />;
    } else {
        contenido = <Composicion d={datos.dato} lienzo={lienzo} />;
    }
    return <RaizB ref={ref} lienzo={lienzo} visible={visible}>{contenido}</RaizB>;
}

function Composicion({ d, lienzo }: { d: DatosMerito; lienzo: LienzoB }) {
    const areas = useMemo(() => resumenAreas(d), [d]);
    const b = lienzo.base;
    const conSesion = !!d.uid;
    const frase = conSesion ? `Tienes ${d.mias.length} de ${d.catalogo.length} insignias; ${d.mias.filter((m) => m.avalada).length} avaladas por otras personas` : `El catálogo tiene ${d.catalogo.length} insignias`;

    if (b === "micro") {
        const lado = 72;
        return (
            <Link href="/insignias" aria-label={`${frase}. Abrir insignias`} title={frase} className={cn(estilosB.foco, "grid h-full place-items-center rounded-[14px]")}>
                <AnilloB fraccion={d.catalogo.length ? d.mias.length / d.catalogo.length : 0} lado={lado} color={lienzo.acento}>
                    <text x={lado / 2} y={lado / 2 - 4} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={22} fontWeight={300}>{d.mias.length}</text>
                    <text x={lado / 2} y={lado / 2 + 14} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,.6)" fontSize={9} fontWeight={600} letterSpacing=".08em">INSIGNIAS</text>
                </AnilloB>
            </Link>
        );
    }

    const arbol = (clase: string, nombres = false) => <Arbol d={d} lienzo={lienzo} nombres={nombres} className={clase} etiqueta={frase} />;
    const acciones = (
        <div className="flex flex-wrap items-center gap-1.5">
            {conSesion
                ? <AccionB href="/insignias" icono={Award} color={lienzo.acento} tono="llena" tactil={lienzo.tactil}>Mis insignias</AccionB>
                : <AccionB href="/login" icono={LogIn} color={lienzo.acento} tono="llena" tactil={lienzo.tactil}>Entra para ver tu mérito</AccionB>}
            {(b === "l" || b === "xl") && <AccionB href="/library" icono={BookOpen} color={lienzo.acento2} tactil={lienzo.tactil}>Aprender</AccionB>}
        </div>
    );
    const cuenta = <p className="text-[12px] text-white/70"><b className="text-[15px] font-semibold tabular-nums text-white">{d.mias.length}</b> de {d.catalogo.length} insignias{conSesion && d.mias.length > 0 ? ` · ${d.mias.filter((m) => m.avalada).length} avaladas` : ""}</p>;

    if (b === "s") return <div className="flex h-full min-h-0 flex-col items-center gap-1 text-center"><div className="min-h-0 w-full flex-1">{arbol("h-full w-full")}</div>{cuenta}</div>;
    if (lienzo.clase === "panoramico") {
        return (
            <div className="grid h-full min-h-0 items-center gap-4" style={{ gridTemplateColumns: "minmax(0, 0.8fr) minmax(0, 1.2fr)" }}>
                {arbol("h-full w-full")}
                <div className="flex min-w-0 flex-col gap-2">{cuenta}<Areas areas={areas} lienzo={lienzo} barras={false} />{acciones}</div>
            </div>
        );
    }
    if (b === "m" && lienzo.clase !== "torre") {
        return (
            <div className="flex h-full min-h-0 flex-col gap-2">
                <div className="min-h-0 flex-1">{arbol("h-full w-full")}</div>
                <Areas areas={areas} lienzo={lienzo} barras={false} />
                {acciones}
            </div>
        );
    }
    if (lienzo.clase === "torre" || b === "l") {
        return (
            <div className="flex h-full min-h-0 flex-col gap-2.5">
                <div className="min-h-[96px] flex-1">{arbol("h-full w-full", b === "l")}</div>
                {cuenta}
                <Areas areas={areas} lienzo={lienzo} barras />
                {conSesion && <Ultimas d={d} max={2} />}
                <div className="mt-auto">{acciones}</div>
            </div>
        );
    }
    return (
        <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)" }}>
            <div className="flex min-h-0 flex-col gap-2">
                <div className="min-h-0 flex-1">{arbol("h-full w-full", true)}</div>
                {cuenta}
            </div>
            <div className="flex min-h-0 flex-col gap-3 border-l border-white/[0.08] pl-4">
                <Areas areas={areas} lienzo={lienzo} barras />
                {conSesion && <Ultimas d={d} max={4} />}
                <p className="border-l-2 pl-2.5 text-[11px] leading-relaxed text-white/60" style={{ borderColor: lienzo.acento }}>
                    Solo cuentan las insignias avaladas por otra persona: +0,5 a tu voz en su área (tope ×2), y solo en las decisiones que activan la meritocracia. Por defecto, una persona, un voto.
                </p>
                <div className="mt-auto">{acciones}</div>
            </div>
        </div>
    );
}

function Areas({ areas, lienzo, barras }: { areas: ReturnType<typeof resumenAreas>; lienzo: LienzoB; barras: boolean }) {
    const visibles = areas.filter((a) => a.hay > 0);
    if (!barras) {
        return (
            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] tabular-nums text-white/70" aria-label="Insignias por área">
                {visibles.map((a) => (
                    <li key={a.area} className="inline-flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ background: COLOR_AREA[a.area] }} aria-hidden />
                        {ETIQUETA_AREA[a.area]} <b className="font-semibold text-white">{a.tienes}</b><span className="text-white/45">/{a.hay}</span>
                    </li>
                ))}
            </ul>
        );
    }
    return (
        <ul className="flex flex-col gap-1.5" aria-label="Insignias y peso de mérito por área">
            {visibles.map((a) => (
                <li key={a.area} className="grid items-center gap-2 text-[12px]" style={{ gridTemplateColumns: "minmax(0, 5.5rem) minmax(0, 1fr) auto" }}>
                    <span className="text-white/80">{ETIQUETA_AREA[a.area]}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]" role="img" aria-label={`${a.tienes} de ${a.hay}`}>
                        <span className={cn("block h-full rounded-full", estilosB.crecer)} style={{ width: `${a.hay ? (a.tienes / a.hay) * 100 : 0}%`, background: COLOR_AREA[a.area] }} />
                    </span>
                    <span className="whitespace-nowrap tabular-nums text-white/60" title="Peso de tu voz en esta área cuando la decisión activa el mérito">
                        {a.tienes}/{a.hay}{a.mult > 1 && <b className="ml-1.5 font-semibold" style={{ color: tintaB(COLOR_AREA[a.area], 0.3) }}>×{DEC1.format(a.mult)}</b>}
                    </span>
                </li>
            ))}
            {lienzo.base === "xl" && visibles.length === 0 && <li className="text-[12px] text-white/55">El catálogo aún no tiene áreas.</li>}
        </ul>
    );
}

function Ultimas({ d, max }: { d: DatosMerito; max: number }) {
    if (d.mias.length === 0) return <p className="text-[12px] text-white/55">Aún no tienes insignias: se ganan aplicando lo aprendido y las avalan tus pares.</p>;
    return (
        <div className="flex flex-col gap-1">
            <RotuloB>Últimas</RotuloB>
            <ul className="flex flex-col gap-1" aria-label="Tus últimas insignias">
                {d.mias.slice(0, max).map((m) => (
                    <li key={m.id} className="flex items-center gap-2 text-[12px]">
                        <BadgeCheck className="size-4 shrink-0" style={{ color: COLOR_AREA[m.area] }} aria-hidden />
                        <span className="min-w-0 flex-1 text-white/85 line-clamp-1" title={m.descripcion ?? m.nombre}>{m.nombre}</span>
                        <span className="shrink-0 whitespace-nowrap text-[11px] text-white/50">{m.avalada ? "avalada" : "sin aval"}{m.otorgada ? ` · ${timeAgo(m.otorgada)}` : ""}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

// ── El árbol ────────────────────────────────────────────────────────────────

const TRONCO = { x: 100, base: 196, cruz: 128 };
const PUNTAS: Record<AreaMerito, [number, number]> = { politica: [26, 74], educacion: [70, 26], cultura: [130, 26], general: [174, 74] };

/** Punto y tangente de la rama cuadrática de un área en t ∈ [0,1]. PURO. */
export function puntoRama(area: AreaMerito, t: number): { x: number; y: number; angulo: number } {
    const [ex, ey] = PUNTAS[area];
    const x0 = TRONCO.x, y0 = TRONCO.cruz, cx = TRONCO.x + (ex - TRONCO.x) * 0.15, cy = TRONCO.cruz - 62;
    const u = 1 - t;
    const x = u * u * x0 + 2 * u * t * cx + t * t * ex;
    const y = u * u * y0 + 2 * u * t * cy + t * t * ey;
    const dx = 2 * u * (cx - x0) + 2 * t * (ex - cx);
    const dy = 2 * u * (cy - y0) + 2 * t * (ey - cy);
    return { x, y, angulo: (Math.atan2(dy, dx) * 180) / Math.PI };
}

function Arbol({ d, lienzo, nombres, className, etiqueta }: { d: DatosMerito; lienzo: LienzoB; nombres: boolean; className?: string; etiqueta: string }) {
    const id = useId().replace(/:/g, "");
    const mias = useMemo(() => new Map(d.mias.map((m) => [m.id, m])), [d.mias]);
    const vivo = lienzo.nivel !== "ligero";
    return (
        <svg viewBox="0 0 200 200" className={cn("block", className)} preserveAspectRatio="xMidYMid meet" role="img" aria-label={etiqueta}>
            <defs>
                <radialGradient id={`suelo${id}`} cx="50%" cy="100%" r="60%">
                    <stop offset="0%" stopColor={lienzo.acento} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={lienzo.acento} stopOpacity={0} />
                </radialGradient>
                <linearGradient id={`tronco${id}`} x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor={tintaB(lienzo.acento, 0.1)} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={tintaB(lienzo.acento, 0.5)} stopOpacity={0.9} />
                </linearGradient>
            </defs>
            <ellipse cx={100} cy={198} rx={70} ry={16} fill={`url(#suelo${id})`} />
            <path d={`M95 ${TRONCO.base} C97 170 98 150 99 ${TRONCO.cruz} L101 ${TRONCO.cruz} C102 150 103 170 105 ${TRONCO.base} Z`} fill={`url(#tronco${id})`} />
            {AREAS_MERITO.map((area) => {
                const [ex, ey] = PUNTAS[area];
                const cx = TRONCO.x + (ex - TRONCO.x) * 0.15, cy = TRONCO.cruz - 62;
                const hojas = d.catalogo.filter((b) => b.area === area).slice(0, 9);
                const color = COLOR_AREA[area];
                return (
                    <g key={area}>
                        <path d={`M${TRONCO.x} ${TRONCO.cruz} Q${cx} ${cy} ${ex} ${ey}`} fill="none" stroke={`url(#tronco${id})`} strokeWidth={hojas.length ? 2.4 : 1.2} strokeLinecap="round" opacity={hojas.length ? 0.9 : 0.35} />
                        {hojas.map((h, i) => {
                            const t = 0.3 + (0.7 * (i + 1)) / (hojas.length + 0.2);
                            const p = puntoRama(area, Math.min(1, t));
                            const lado = i % 2 ? 1 : -1;
                            const ang = p.angulo + lado * 45;
                            const rad = (p.angulo + lado * 90) * (Math.PI / 180);
                            const x = p.x + Math.cos(rad) * 6, y = p.y + Math.sin(rad) * 6;
                            const mia = mias.get(h.id);
                            return (
                                <g key={h.id} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${ang.toFixed(1)})`}>
                                    <title>{`${h.nombre}${mia ? (mia.avalada ? " · tuya, avalada" : " · tuya, sin aval") : " · por ganar"}`}</title>
                                    <ellipse rx={6.5} ry={3.1} fill={mia ? color : "transparent"} stroke={mia ? (mia.avalada ? "#fff" : color) : "#fff"} strokeOpacity={mia ? (mia.avalada ? 0.9 : 0.6) : 0.22} strokeWidth={mia?.avalada ? 1 : 0.7}
                                        className={mia && vivo && i === 0 ? estilosB.latido : undefined} />
                                </g>
                            );
                        })}
                        {nombres && hojas.length > 0 && (
                            <text x={ex + (ex < 100 ? -2 : 2)} y={ey - 9} textAnchor={ex < 100 ? "start" : "end"} fill={tintaB(color, 0.3)} fontSize={8.5} fontWeight={600}>{ETIQUETA_AREA[area]}</text>
                        )}
                    </g>
                );
            })}
            <circle cx={TRONCO.x} cy={TRONCO.cruz} r={4} fill={tintaB(lienzo.acento, 0.5)} />
        </svg>
    );
}
