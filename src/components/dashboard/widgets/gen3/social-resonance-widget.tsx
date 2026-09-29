'use client';

// ════════════════════════════════════════════════════════════════
// Resonancia social — de qué habla la Red ahora (Ola 0929, paquete B).
// ----------------------------------------------------------------
// Antes: «emociones» asignadas por un hash y una «burbuja rota» con argumentos inventados.
// Ahora, las ETIQUETAS REALES (#algo) de las últimas publicaciones públicas de la Red
// (`posts`, el mismo filtro que el feed), pesadas por calor: cada publicación suma
// e^(−edad/72 h). Tocar un tema enseña sus publicaciones —de voces distintas primero, para
// que la burbuja se abra con gente real— y cada una se abre en /post/<id>. Una lectura
// compartida con el Ágora del don (50 filas, 10 min), sin sondeo ni canal propio.
// Ciberdelia (§3): inteligencia colectiva visible, sin algoritmo que decida por ti.
//
//   micro      → el tema más vivo con su anillo de calor.
//   s          → las tres burbujas más vivas.
//   m          → el campo de burbujas y el tema elegido.
//   panorámico → burbujas a la izquierda, ranking a la derecha.   torre → en columna.
//   l          → + las publicaciones del tema elegido.
//   xl         → campo grande, ranking con calor y publicaciones, y «Publicar sobre #tema».
// Estados honestos: cargando, error con reintento y vacío (sin etiquetas aún).
// ════════════════════════════════════════════════════════════════

import { useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Radio, RefreshCw, PenLine } from "lucide-react";
import { WidgetShell, WidgetEmptyState, WidgetErrorState, WidgetSkeleton, useMarcoUnificado, timeAgo, type ElementSize } from "../../kit";
import { cn } from "@/lib/utils";
import { useDatoCompartido, type ResultadoDato } from "../gen2/_paquete-b/cache-compartida";
import { cargarPublicacionesRed, enlaceComponer, resonancia, type PublicacionRed, type TemaResonancia } from "../gen2/_paquete-b/datos-red";
import { AccionB, AnilloB, RaizB, RotuloB, estilosB, tintaB, useAhoraB, useLienzoB, useVisibleB, type LienzoB } from "../gen2/_paquete-b/piezas-b";
import { mezclar } from "@/components/widgets-libres/familias/comun";

const FAMILIA = { acento: "#dc143c", acento2: "#23d5ab" };

/** Burbujas en espiral sin solaparse (determinista). PURO. */
export function empaquetar(temas: TemaResonancia[], ancho: number, alto: number): { t: TemaResonancia; x: number; y: number; r: number }[] {
    const max = Math.max(1, ...temas.map((t) => t.n));
    const escala = Math.min(ancho, alto) / 140;
    const puestas: { t: TemaResonancia; x: number; y: number; r: number }[] = [];
    for (const t of temas) {
        const r = (9 + 21 * Math.sqrt(t.n / max)) * escala;
        let x = ancho / 2, y = alto / 2;
        for (let paso = 0; paso < 600; paso++) {
            const a = paso * 0.35, d = paso * 0.9 * escala;
            x = ancho / 2 + Math.cos(a) * d;
            y = alto / 2 + Math.sin(a) * d * 0.72;
            const dentro = x - r >= 0 && x + r <= ancho && y - r >= 0 && y + r <= alto;
            if (dentro && puestas.every((p) => Math.hypot(p.x - x, p.y - y) >= p.r + r + 2 * escala)) break;
        }
        if (x - r < 0 || x + r > ancho || y - r < 0 || y + r > alto) continue;
        puestas.push({ t, x, y, r });
    }
    return puestas;
}

export function SocialResonanceWidget() {
    const marco = useMarcoUnificado();
    const datos = useDatoCompartido<PublicacionRed[]>("red.publicaciones.v1", cargarPublicacionesRed);
    return (
        <WidgetShell
            title="Resonancia social"
            subtitle="De qué habla la Red ahora"
            icon={Radio}
            bare={marco?.base === "micro"}
            actions={
                <button type="button" onClick={datos.recargar} aria-label="Actualizar la resonancia"
                    className="grid size-7 cursor-pointer place-items-center rounded-full ss-redondo text-white/70 transition-colors hover:text-white">
                    <RefreshCw className={cn("size-3.5", datos.estado === "cargando" && "animate-spin motion-reduce:animate-none")} aria-hidden />
                </button>
            }
        >
            {(size) => <Cuerpo size={size} datos={datos} />}
        </WidgetShell>
    );
}

function Cuerpo({ size, datos }: { size: ElementSize; datos: ResultadoDato<PublicacionRed[]> }) {
    const lienzo = useLienzoB(size, FAMILIA);
    const ref = useRef<HTMLDivElement>(null);
    const visible = useVisibleB(ref);
    const ahora = useAhoraB(10 * 60_000, visible);
    const temas = useMemo(() => (datos.dato && ahora ? resonancia(datos.dato, ahora) : []), [datos.dato, ahora]);
    let contenido: ReactNode;
    if (!datos.dato || !ahora) {
        contenido = datos.estado === "error"
            ? <WidgetErrorState message={datos.error ?? "No se pudo leer la Red."} onRetry={datos.recargar} />
            : <WidgetSkeleton variant={lienzo.base === "micro" ? "rings" : "block"} />;
    } else if (temas.length === 0) {
        contenido = lienzo.base === "micro"
            ? <p className="grid h-full place-items-center text-center text-[11px] text-white/60">sin temas aún</p>
            : <WidgetEmptyState icon={Radio} title="Aún no resuena ningún tema" message="Las etiquetas (#algo) de lo que se publica en la Red aparecerán aquí, con su calor." actionLabel="Publicar" actionHref={enlaceComponer("")} accent={lienzo.acento} />;
    } else {
        contenido = <Composicion temas={temas} publicaciones={datos.dato} lienzo={lienzo} size={size} />;
    }
    return <RaizB ref={ref} lienzo={lienzo} visible={visible}>{contenido}</RaizB>;
}

function colorCalor(calor: number, lienzo: LienzoB): string {
    return mezclar(lienzo.acento2, lienzo.acento, Math.max(0, Math.min(1, calor)));
}

function Composicion({ temas, publicaciones, lienzo, size }: { temas: TemaResonancia[]; publicaciones: PublicacionRed[]; lienzo: LienzoB; size: ElementSize }) {
    const [elegida, setElegida] = useState<string | null>(null);
    const tema = temas.find((t) => t.etiqueta === elegida) ?? temas[0];
    const b = lienzo.base;
    const frase = `Resuenan ${temas.length} temas; el más vivo es #${temas[0].etiqueta} con ${temas[0].n} ${temas[0].n === 1 ? "publicación" : "publicaciones"}`;

    if (b === "micro") {
        const t = temas[0];
        return (
            <Link href={enlaceComponer(`#${t.etiqueta} `)} aria-label={`${frase}. Publicar sobre #${t.etiqueta}`} title={frase} className={cn(estilosB.foco, "grid h-full place-items-center rounded-[14px]")}>
                <AnilloB fraccion={t.calor} lado={72} color={colorCalor(t.calor, lienzo)}>
                    <text x={36} y={34} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={t.etiqueta.length > 8 ? 9 : 11} fontWeight={700}>#{t.etiqueta.slice(0, 12)}</text>
                    <text x={36} y={48} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,.6)" fontSize={8.5}>{t.n} publ.</text>
                </AnilloB>
            </Link>
        );
    }
    const campo = (clase: string, max: number) => <Campo temas={temas.slice(0, max)} lienzo={lienzo} elegida={tema.etiqueta} elegir={setElegida} className={clase} etiqueta={frase} />;
    const ranking = (max: number) => (
        <ol className="flex flex-col gap-1" aria-label="Temas por calor">
            {temas.slice(0, max).map((t, i) => (
                <li key={t.etiqueta}>
                    <button type="button" onClick={() => setElegida(t.etiqueta)} aria-pressed={t.etiqueta === tema.etiqueta}
                        className={cn(estilosB.foco, estilosB.fila, "grid w-full cursor-pointer items-center gap-2 rounded-[10px] px-1 text-left text-[12px]", lienzo.tactil ? "min-h-11" : "min-h-7")}
                        style={{ gridTemplateColumns: "1.2rem minmax(0, 1fr) minmax(0, 5rem) auto" }}>
                        <span className="tabular-nums text-white/45">{i + 1}</span>
                        <span className={cn("font-semibold line-clamp-1", t.etiqueta === tema.etiqueta ? "text-white" : "text-white/80")}>#{t.etiqueta}</span>
                        <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]" aria-hidden><span className={cn("block h-full rounded-full", estilosB.crecer)} style={{ width: `${t.calor * 100}%`, background: colorCalor(t.calor, lienzo) }} /></span>
                        <span className="tabular-nums text-white/55">{t.n}</span>
                    </button>
                </li>
            ))}
        </ol>
    );
    const publicacionesTema = (max: number) => {
        const lista = voces(publicaciones.filter((p) => tema.ids.includes(p.id)));
        return (
            <div className="flex min-h-0 flex-col gap-1">
                <RotuloB>#{tema.etiqueta} · voces distintas primero</RotuloB>
                <ul className="flex min-h-0 flex-col gap-0.5" aria-label={`Publicaciones de #${tema.etiqueta}`}>
                    {lista.slice(0, max).map((p) => (
                        <li key={p.id}>
                            <Link href={`/post/${encodeURIComponent(p.id)}`} className={cn(estilosB.foco, estilosB.fila, "block rounded-[10px] px-1.5 py-1", lienzo.tactil && "min-h-11")}>
                                <span className="block text-[12px] leading-snug text-white/85 line-clamp-1" title={p.titulo || p.cuerpo}>{p.titulo || p.cuerpo}</span>
                                <span className="block text-[10px] text-white/45">{p.autor}{p.ts ? ` · hace ${timeAgo(p.ts)}` : ""}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
        );
    };
    const publicar = <AccionB href={enlaceComponer(`#${tema.etiqueta} `)} icono={PenLine} color={lienzo.acento} tactil={lienzo.tactil}>Publicar sobre #{tema.etiqueta}</AccionB>;

    if (b === "s") return campo("h-full w-full", 3);
    if (lienzo.clase === "panoramico") {
        return <div className="grid h-full min-h-0 items-center gap-4" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>{campo("h-full w-full", 8)}{ranking(Math.max(3, Math.floor((size.height - 40) / 30)))}</div>;
    }
    if (b === "m" && lienzo.clase !== "torre") {
        return (
            <div className="flex h-full min-h-0 flex-col gap-1.5">
                <div className="min-h-0 flex-1">{campo("h-full w-full", 8)}</div>
                <p className="text-[12px] text-white/70"><b className="font-semibold text-white">#{tema.etiqueta}</b> · {tema.n} {tema.n === 1 ? "publicación" : "publicaciones"} · última hace {timeAgo(tema.ultima)}</p>
            </div>
        );
    }
    if (lienzo.clase === "torre") return <div className="flex h-full min-h-0 flex-col gap-2">{<div className="h-[38%] min-h-0">{campo("h-full w-full", 7)}</div>}{ranking(5)}{publicacionesTema(2)}</div>;
    if (b === "l") {
        return (
            <div className="flex h-full min-h-0 flex-col gap-2">
                <div className="h-[45%] min-h-[90px]">{campo("h-full w-full", 10)}</div>
                {publicacionesTema(3)}
                <div className="mt-auto">{publicar}</div>
            </div>
        );
    }
    return (
        <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)" }}>
            <div className="flex min-h-0 flex-col gap-2">
                <div className="min-h-0 flex-1">{campo("h-full w-full", 14)}</div>
                <p className="text-[11px] text-white/50">Calor = publicaciones recientes con esa etiqueta (lo de hace 3 días pesa un tercio). Sin algoritmo que elija por ti.</p>
            </div>
            <div className="flex min-h-0 flex-col gap-3 border-l border-white/[0.08] pl-4">
                {ranking(6)}
                {publicacionesTema(4)}
                <div className="mt-auto">{publicar}</div>
            </div>
        </div>
    );
}

/** Voces distintas primero: una publicación por autor antes de repetir a nadie. PURO. */
export function voces(lista: PublicacionRed[]): PublicacionRed[] {
    const vistos = new Set<string>();
    const primero: PublicacionRed[] = [], despues: PublicacionRed[] = [];
    for (const p of [...lista].sort((a, b) => b.ts - a.ts)) {
        if (vistos.has(p.autor)) despues.push(p); else { vistos.add(p.autor); primero.push(p); }
    }
    return [...primero, ...despues];
}

function Campo({ temas, lienzo, elegida, elegir, className, etiqueta }: {
    temas: TemaResonancia[]; lienzo: LienzoB; elegida: string; elegir: (e: string) => void; className?: string; etiqueta: string;
}) {
    const W = 200, Hh = 140;
    const burbujas = useMemo(() => empaquetar(temas, W, Hh), [temas]);
    const vivo = lienzo.nivel !== "ligero";
    return (
        <svg viewBox={`0 0 ${W} ${Hh}`} preserveAspectRatio="xMidYMid meet" className={cn("block", className)} role="group" aria-label={etiqueta}>
            <defs>
                {burbujas.map(({ t }, i) => (
                    <radialGradient key={t.etiqueta} id={`bu${i}-${t.etiqueta.replace(/[^a-z0-9]/gi, "")}`} cx="38%" cy="32%" r="75%">
                        <stop offset="0%" stopColor={tintaB(colorCalor(t.calor, lienzo), 0.55)} stopOpacity={0.95} />
                        <stop offset="100%" stopColor={colorCalor(t.calor, lienzo)} stopOpacity={0.35 + 0.4 * t.calor} />
                    </radialGradient>
                ))}
            </defs>
            {burbujas.map(({ t, x, y, r }, i) => {
                const activa = t.etiqueta === elegida;
                const cabe = r > 11;
                return (
                    <g key={t.etiqueta} role="button" tabIndex={0} aria-pressed={activa} aria-label={`#${t.etiqueta}: ${t.n} ${t.n === 1 ? "publicación" : "publicaciones"}`}
                        onClick={() => elegir(t.etiqueta)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); elegir(t.etiqueta); } }}
                        className={cn("cursor-pointer outline-none [&:focus-visible>circle]:[stroke-opacity:1] [&:focus-visible>circle]:[stroke-width:2.5px]", estilosB.entrar)} style={{ animationDelay: `${i * 40}ms` }}>
                        <circle cx={x} cy={y} r={r} fill={`url(#bu${i}-${t.etiqueta.replace(/[^a-z0-9]/gi, "")})`} stroke="#fff" strokeOpacity={activa ? 0.9 : 0.2} strokeWidth={activa ? 1.4 : 0.6}
                            className={i === 0 && vivo ? estilosB.latido : undefined} />
                        {cabe && <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={Math.min(11, Math.max(6, r * 0.42))} fontWeight={600}>#{t.etiqueta.length > 10 ? `${t.etiqueta.slice(0, 9)}…` : t.etiqueta}</text>}
                        <title>{`#${t.etiqueta} · ${t.n} publicaciones`}</title>
                    </g>
                );
            })}
        </svg>
    );
}
